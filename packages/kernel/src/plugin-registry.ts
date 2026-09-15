/**
 * PluginRegistry —— 设计文档 §4.5，内核核心。
 * 每插件一个 Scope（fork 自 registry 的父 Scope）；状态放 SubscriptionRef（KernelView 订阅用）。
 * install 先启用成功再落盘；activate 任一步失败即 Scope.close 回滚。
 */
import { Context, Effect, Exit, Layer, Schema, Scope, Stream, SubscriptionRef } from 'effect';
import {
  EventHub,
  PluginManifest,
  PluginSetupError,
  ServiceRegistry,
  manifestOf,
} from '@bbblank/sdk';
import type {
  AnyPluginModule,
  Cleanup,
  FacadeContext,
  PluginAPI,
  PluginID,
} from '@bbblank/sdk';
import { CapabilityBroker } from './capability-broker.js';
import {
  DependencyMissing,
  DependentsActive,
  ManifestInvalid,
  PermissionDenied,
  PluginNotFound,
} from './errors.js';
import type { PluginError } from './errors.js';
import { InstallStore } from './install-store.js';
import { PermissionPolicy } from './permission-policy.js';
import { PluginLoader } from './plugin-loader.js';
import { topoLevels } from './topo.js';

export type PluginStatus = 'enabled' | 'disabled' | 'failed';

export interface PluginRecord {
  readonly manifest: PluginManifest;
  readonly kind: 'plain' | 'effect';
  readonly status: PluginStatus;
}

export interface RegistrySnapshot {
  readonly plugins: ReadonlyMap<PluginID, PluginRecord>;
}

export interface PluginRegistryShape {
  readonly state: SubscriptionRef.SubscriptionRef<RegistrySnapshot>;
  readonly bootstrap: Effect.Effect<void, PluginError>;
  readonly install: (
    id: PluginID,
    opts?: { readonly manual?: boolean }
  ) => Effect.Effect<void, PluginError>;
  readonly uninstall: (id: PluginID) => Effect.Effect<void, PluginError>;
  readonly enable: (id: PluginID) => Effect.Effect<void, PluginError>;
  readonly disable: (id: PluginID) => Effect.Effect<void, PluginError>;
}

export class PluginRegistry extends Context.Service<PluginRegistry, PluginRegistryShape>()(
  '@kernel/PluginRegistry'
) {
  static readonly layer = Layer.effect(
    PluginRegistry,
    Effect.gen(function* () {
      const services = yield* ServiceRegistry;
      const events = yield* EventHub;
      const broker = yield* CapabilityBroker;
      const loader = yield* PluginLoader;
      const store = yield* InstallStore;
      const policy = yield* PermissionPolicy;
      const parentScope = yield* Scope.Scope;

      const state = yield* SubscriptionRef.make<RegistrySnapshot>({ plugins: new Map() });
      const scopes = new Map<PluginID, Scope.Closeable>();
      const modules = new Map<PluginID, AnyPluginModule>();
      const apis = new Map<PluginID, PluginAPI<any>>();
      const cleanups = new Map<PluginID, Array<Cleanup>>();
      const uninstallCbs = new Map<PluginID, Array<() => void | Promise<void>>>();

      /** Effect 插件 layer 可声明的内核服务环境（capability 由 broker.contextFor 并入） */
      const kernelCtx = Context.merge(
        Context.make(ServiceRegistry, services),
        Context.make(EventHub, events)
      );

      const setStatus = (id: PluginID, status: PluginStatus) =>
        SubscriptionRef.update(state, s => {
          const rec = s.plugins.get(id);
          if (!rec) return s;
          const plugins = new Map(s.plugins);
          plugins.set(id, { ...rec, status });
          return { plugins };
        });

      /** 动态边界第一道校验：模块 manifest 合成后过 Schema */
      const decodeModule = (mod: AnyPluginModule) =>
        Schema.decodeUnknownEffect(PluginManifest)(manifestOf(mod)).pipe(
          Effect.mapError(e => new ManifestInvalid({ id: mod.manifest.id, issue: String(e) }))
        );

      const makeFacadeContext = (id: PluginID, scope: Scope.Closeable): FacadeContext => ({
        pluginId: id,
        scoped: eff => {
          const child = Effect.runSync(Scope.fork(scope));
          Effect.runSync(
            Effect.forkIn(Effect.provide(eff, Context.make(Scope.Scope, child)), child)
          );
          return () => {
            Effect.runSync(Scope.close(child, Exit.void));
          };
        },
        run: eff => Effect.runPromise(eff),
        runSync: eff => Effect.runSync(eff),
      });

      const makePlainAPI = (
        manifest: PluginManifest,
        caps: Record<string, unknown>,
        fctx: FacadeContext
      ): PluginAPI<any> => {
        const id = manifest.id;
        const myCleanups = cleanups.get(id) ?? (cleanups.set(id, []), cleanups.get(id)!);
        const myUninstall =
          uninstallCbs.get(id) ?? (uninstallCbs.set(id, []), uninstallCbs.get(id)!);
        return {
          manifest,
          caps: caps as PluginAPI<any>['caps'],
          services: {
            register: (token, impl) => {
              // 提供服务可影响其他插件，按 admin 能力裁剪；宿主可收紧/放宽 PermissionPolicy
              if (policy.permOf(manifest) !== 'admin') {
                throw new PermissionDenied({ id, required: 'admin' });
              }
              const cleanup = fctx.runSync(services.register(token, impl, id));
              myCleanups.push(cleanup);
              return cleanup;
            },
            get: token => fctx.run(services.get(token)),
            tryGet: token => fctx.runSync(services.tryGet(token)),
          },
          events: {
            on: (topic, cb) => {
              const cleanup = fctx.scoped(
                Stream.runForEach(events.subscribe(topic), payload =>
                  Effect.sync(() => cb(payload))
                )
              );
              myCleanups.push(cleanup);
              return cleanup;
            },
            emit: (topic, payload) => fctx.runSync(events.publish(topic, payload)),
          },
          lifecycle: {
            addCleanup: c => {
              myCleanups.push(c);
            },
            onUninstallData: cb => {
              myUninstall.push(cb);
              return () => {
                const i = myUninstall.indexOf(cb);
                if (i >= 0) myUninstall.splice(i, 1);
              };
            },
          },
        };
      };

      /** 激活：校验权限 → fork 插件 Scope → 按 kind 走两套入口；失败关闭 Scope 回滚 */
      const activate = (
        manifest: PluginManifest,
        mod: AnyPluginModule
      ): Effect.Effect<Scope.Closeable, PluginError> =>
        Effect.gen(function* () {
          yield* policy.check(manifest);
          const scope = yield* Scope.fork(parentScope);
          const fail = (cause: unknown) => new PluginSetupError({ id: manifest.id, cause });
          const rollback = <A, E, R>(eff: Effect.Effect<A, E, R>) =>
            Effect.tapError(eff, () => Scope.close(scope, Exit.void));

          // 插件 Scope 关闭时按注册逆序跑插件 Cleanup
          yield* Scope.addFinalizer(
            scope,
            Effect.forEach(
              (cleanups.get(manifest.id) ?? []).slice().reverse(),
              c => Effect.tryPromise(async () => { await c(); }).pipe(Effect.ignore),
              { discard: true }
            )
          );

          if (mod.kind === 'effect') {
            const capCtx = yield* broker.contextFor(manifest);
            // layer 声明的 R = caps + KernelServices + Scope，三者由该 Context 全覆盖
            const full = Context.merge(
              kernelCtx,
              Context.merge(capCtx, Context.make(Scope.Scope, scope))
            );
            yield* rollback(
              Layer.buildWithScope(mod.layer, scope).pipe(
                Effect.provide(full),
                Effect.mapError(fail)
              )
            );
            return scope;
          }

          const fctx = makeFacadeContext(manifest.id, scope);
          const caps = yield* broker.facadesFor(manifest, fctx);
          const api = makePlainAPI(manifest, caps, fctx);
          apis.set(manifest.id, api);
          yield* rollback(
            Effect.tryPromise({
              try: async () => {
                const c = await mod.setup(api);
                if (c) api.lifecycle.addCleanup(c);
              },
              catch: fail,
            }).pipe(
              Effect.timeout('10 seconds'),
              Effect.catchTag('TimeoutError', e => Effect.fail(fail(e)))
            )
          );
          return scope;
        });

      const loadModule = (id: PluginID) =>
        Effect.flatMap(loader.load(id), mod =>
          Effect.map(decodeModule(mod), manifest => ({ mod, manifest }))
        );

      const markEnabled = (id: PluginID, manifest: PluginManifest, kind: 'plain' | 'effect') =>
        SubscriptionRef.update(state, s => ({
          plugins: new Map(s.plugins).set(id, { manifest, kind, status: 'enabled' }),
        }));

      const install: PluginRegistryShape['install'] = (id, opts) =>
        Effect.gen(function* () {
          const existing = (yield* SubscriptionRef.get(state)).plugins.get(id);
          if (existing?.status === 'enabled') return;
          const { mod, manifest } =
            existing && modules.has(id)
              ? { mod: modules.get(id)!, manifest: existing.manifest }
              : yield* loadModule(id);
          modules.set(id, mod);
          const scope = yield* activate(manifest, mod);
          scopes.set(id, scope);
          yield* markEnabled(id, manifest, mod.kind);
          yield* store.write(new Set([...(yield* store.read), id]));
          if (opts?.manual && mod.kind === 'plain' && mod.onManualInstall) {
            yield* Effect.tryPromise({
              try: async () => {
                await mod.onManualInstall!(apis.get(id)!);
              },
              catch: cause => new PluginSetupError({ id, cause }),
            });
          }
        });

      const enable: PluginRegistryShape['enable'] = id =>
        Effect.gen(function* () {
          const snap = yield* SubscriptionRef.get(state);
          const rec = snap.plugins.get(id);
          if (!rec) return yield* Effect.fail(new PluginNotFound({ id }));
          if (rec.status === 'enabled') return;
          const missing = (rec.manifest.dependencies ?? []).filter(
            d => snap.plugins.get(d)?.status !== 'enabled'
          );
          if (missing.length > 0) {
            return yield* Effect.fail(new DependencyMissing({ id, missing }));
          }
          const mod = modules.get(id) ?? (yield* loadModule(id)).mod;
          modules.set(id, mod);
          const scope = yield* activate(rec.manifest, mod);
          scopes.set(id, scope);
          yield* setStatus(id, 'enabled');
        });

      const disable: PluginRegistryShape['disable'] = id =>
        Effect.gen(function* () {
          const snap = yield* SubscriptionRef.get(state);
          const rec = snap.plugins.get(id);
          if (!rec) return yield* Effect.fail(new PluginNotFound({ id }));
          if (rec.status !== 'enabled') return;
          const dependents = [...snap.plugins.values()]
            .filter(p => p.status === 'enabled' && (p.manifest.dependencies ?? []).includes(id))
            .map(p => p.manifest.id);
          if (dependents.length > 0) {
            return yield* Effect.fail(new DependentsActive({ id, dependents }));
          }
          const scope = scopes.get(id);
          if (scope) yield* Scope.close(scope, Exit.void);
          scopes.delete(id);
          apis.delete(id);
          cleanups.delete(id);
          yield* setStatus(id, 'disabled');
        });

      const uninstall: PluginRegistryShape['uninstall'] = id =>
        Effect.gen(function* () {
          const snap = yield* SubscriptionRef.get(state);
          const rec = snap.plugins.get(id);
          if (!rec) return yield* Effect.fail(new PluginNotFound({ id }));
          yield* disable(id);
          for (const cb of uninstallCbs.get(id) ?? []) {
            yield* Effect.tryPromise({
              try: async () => {
                await cb();
              },
              catch: cause => new PluginSetupError({ id, cause }),
            });
          }
          uninstallCbs.delete(id);
          cleanups.delete(id);
          modules.delete(id);
          apis.delete(id);
          yield* SubscriptionRef.update(state, s => {
            const plugins = new Map(s.plugins);
            plugins.delete(id);
            return { plugins };
          });
          yield* store.write(new Set([...(yield* store.read)].filter(x => x !== id)));
        });

      /** Kahn 分层：层内并行激活；manifest 依赖若不在已加载集合即 DependencyMissing */
      const bootstrap: PluginRegistryShape['bootstrap'] = Effect.gen(function* () {
        const ids = yield* store.read;
        const loaded = new Map<
          PluginID,
          { mod: AnyPluginModule; manifest: PluginManifest }
        >();
        for (const id of ids) {
          const lm = yield* loadModule(id);
          loaded.set(id, lm);
          modules.set(id, lm.mod);
        }
        const deps = new Map<PluginID, Set<PluginID>>();
        for (const [id, { manifest }] of loaded) {
          const missing = (manifest.dependencies ?? []).filter(d => !loaded.has(d));
          if (missing.length > 0) {
            return yield* Effect.fail(new DependencyMissing({ id, missing }));
          }
          deps.set(id, new Set(manifest.dependencies ?? []));
        }
        const levels = yield* topoLevels(deps);
        for (const level of levels) {
          yield* Effect.forEach(
            level,
            id =>
              Effect.gen(function* () {
                const { mod, manifest } = loaded.get(id)!;
                const scope = yield* activate(manifest, mod);
                scopes.set(id, scope);
                yield* markEnabled(id, manifest, mod.kind);
              }),
            { concurrency: 'unbounded' }
          );
        }
      });

      return PluginRegistry.of({ state, bootstrap, install, uninstall, enable, disable });
    })
  );
}
