/**
 * PluginRegistry —— 设计文档 §4.5 / §10，内核核心。
 * - 生命周期状态机 + 每插件读写锁（§10.1）
 * - 插件 Scope 独立创建，停机按 reverse-Kahn 关闭（§10.1）
 * - 故障归因 → 监管器：级联停止、指数退避重启、熔断隔离（§10.2）
 * - 版本/sdk 兼容检查（§10.3）、授权解析与审计（§10.5）、typed config（§10.7）
 * - store 是期望态、snapshot 是实际态（§10.8）；span / 注解日志 / 指标 / 诊断导出（§10.9）
 */
import {
  Cause,
  Clock,
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  Metric,
  Queue,
  Schema,
  Scope,
  SubscriptionRef,
} from 'effect';
import {
  EventHub,
  PluginManifest,
  PluginSetupError,
  SDK_VERSION,
  ServiceRegistry,
  isSdkCompatible,
  manifestOf,
  satisfies,
} from '@bbblank/sdk';
import type {
  AccessLevel,
  AnyPluginModule,
  Cleanup,
  PluginAPI,
  PluginID,
} from '@bbblank/sdk';
import { AuditLog } from './audit-log.js';
import type { AuditEntry } from './audit-log.js';
import { CapabilityBroker } from './capability-broker.js';
import {
  ConfigInvalid,
  DependencyCycle,
  DependencyMissing,
  DependencyVersionMismatch,
  DependentsActive,
  ManifestInvalid,
  PermissionDenied,
  PluginLoadError,
  PluginNotFound,
  SdkIncompatible,
  describeError,
} from './errors.js';
import type { PluginError, SerializedError, StorageError } from './errors.js';
import { EventBus } from './event-hub.js';
import type { DeadLetter } from './event-hub.js';
import { InstallStore } from './install-store.js';
import { makeLocks } from './lock.js';
import { makeFacadeContext, makePlainAPI } from './plugin-api.js';
import type { PluginEnv } from './plugin-api.js';
import { PermissionPolicy } from './permission-policy.js';
import { PluginLoader, validateModule } from './plugin-loader.js';
import { kahn, subgraph } from './topo.js';

export type PluginStatus =
  | 'starting'
  | 'enabled'
  | 'stopping'
  | 'disabled'
  | 'failed'
  | 'quarantined';

export interface PluginRecord {
  readonly id: PluginID;
  /** 加载失败的插件没有 manifest */
  readonly manifest?: PluginManifest;
  readonly kind?: 'plain' | 'effect';
  readonly status: PluginStatus;
  readonly lastError?: SerializedError;
  readonly restarts: number;
}

export interface RegistrySnapshot {
  readonly plugins: ReadonlyMap<PluginID, PluginRecord>;
}

export interface BootstrapReport {
  readonly enabled: ReadonlyArray<PluginID>;
  readonly failed: ReadonlyArray<{ readonly id: PluginID; readonly error: SerializedError }>;
}

export interface Diagnostics {
  readonly at: number;
  readonly healthy: boolean;
  readonly plugins: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly kind: string;
    readonly status: PluginStatus;
    readonly restarts: number;
    readonly lastError?: SerializedError;
    readonly dependencies: ReadonlyArray<string>;
    readonly services: ReadonlyArray<string>;
  }>;
  readonly events: {
    readonly published: number;
    readonly dropped: number;
    readonly deadLetters: ReadonlyArray<DeadLetter>;
  };
  readonly audit: ReadonlyArray<AuditEntry>;
}

export interface SupervisionPolicy {
  /** 0 = 故障即 failed，不重启 */
  readonly maxRestarts: number;
  readonly window: Duration.Input;
  readonly backoff: {
    readonly initial: Duration.Input;
    readonly max: Duration.Input;
    readonly factor: number;
  };
}

export interface KernelTimeouts {
  readonly setup: Duration.Input;
  readonly stop: Duration.Input;
  readonly load: Duration.Input;
}

export interface KernelOptionsShape {
  readonly supervision: SupervisionPolicy;
  readonly timeouts: KernelTimeouts;
}

export const defaultKernelOptions: KernelOptionsShape = {
  supervision: {
    maxRestarts: 3,
    window: '60 seconds',
    backoff: { initial: '100 millis', max: '5 seconds', factor: 2 },
  },
  timeouts: { setup: '10 seconds', stop: '5 seconds', load: '10 seconds' },
};

export class KernelOptions extends Context.Service<KernelOptions, KernelOptionsShape>()(
  '@kernel/KernelOptions'
) {
  static readonly layer = (
    o: {
      readonly supervision?: Partial<Omit<SupervisionPolicy, 'backoff'>> & {
        readonly backoff?: Partial<SupervisionPolicy['backoff']>;
      };
      readonly timeouts?: Partial<KernelTimeouts>;
    } = {}
  ) =>
    Layer.succeed(KernelOptions, {
      supervision: {
        ...defaultKernelOptions.supervision,
        ...o.supervision,
        backoff: { ...defaultKernelOptions.supervision.backoff, ...o.supervision?.backoff },
      },
      timeouts: { ...defaultKernelOptions.timeouts, ...o.timeouts },
    });
}

export interface PluginRegistryShape {
  readonly state: SubscriptionRef.SubscriptionRef<RegistrySnapshot>;
  readonly bootstrap: Effect.Effect<BootstrapReport, StorageError>;
  readonly install: (
    id: PluginID,
    opts?: { readonly manual?: boolean; readonly config?: unknown }
  ) => Effect.Effect<void, PluginError>;
  readonly uninstall: (id: PluginID) => Effect.Effect<void, PluginError>;
  readonly enable: (id: PluginID) => Effect.Effect<void, PluginError>;
  readonly disable: (id: PluginID) => Effect.Effect<void, PluginError>;
  /** 解码 → 落盘 → 已启用则级联重启（§10.7） */
  readonly reconfigure: (id: PluginID, config: unknown) => Effect.Effect<void, PluginError>;
  /** 同步投递故障给监管器（可在任意回调中调用） */
  readonly reportFault: (id: PluginID, cause: unknown) => void;
  /** reverse-Kahn 有序停机；layer 释放时自动执行 */
  readonly shutdown: Effect.Effect<void>;
  readonly diagnostics: Effect.Effect<Diagnostics>;
}

interface Slot {
  mod?: AnyPluginModule;
  scope?: Scope.Closeable;
  api?: PluginAPI<any>;
  cleanups: Array<Cleanup>;
  uninstall: Array<() => void | Promise<void>>;
  rawConfig?: unknown;
  /** 期望态（与 InstallStore 同步） */
  desired: boolean;
  /** 滑动窗口内的故障时间戳 */
  faults: Array<number>;
}

interface Fault {
  readonly id: PluginID;
  readonly cause: unknown;
}

const transitions = Metric.counter('bbblank_plugin_transitions_total');
const activateDuration = Metric.timer('bbblank_plugin_activate_duration');
const faultsTotal = Metric.counter('bbblank_plugin_faults_total');

const millis = (d: Duration.Input) => Duration.toMillis(Duration.fromInputUnsafe(d));
const depsOf = (m: PluginManifest | undefined): ReadonlyArray<PluginID> =>
  (m?.dependencies ?? []).map(d => d.id);

export class PluginRegistry extends Context.Service<PluginRegistry, PluginRegistryShape>()(
  '@kernel/PluginRegistry'
) {
  static readonly layer = Layer.effect(
    PluginRegistry,
    Effect.gen(function* () {
      const services = yield* ServiceRegistry;
      const hub = yield* EventHub;
      const bus = yield* EventBus;
      const broker = yield* CapabilityBroker;
      const loader = yield* PluginLoader;
      const store = yield* InstallStore;
      const policy = yield* PermissionPolicy;
      const auditLog = yield* AuditLog;
      const { supervision, timeouts } = yield* KernelOptions;
      const context = yield* Effect.context<never>();
      const layerScope = yield* Scope.Scope;

      const state = yield* SubscriptionRef.make<RegistrySnapshot>({ plugins: new Map() });
      const slots = new Map<PluginID, Slot>();
      const withLocks = makeLocks();
      const faults = yield* Queue.unbounded<Fault>();
      let shuttingDown = false;

      // 先注册停机 finalizer：layer scope 逆序关闭，它会在监管器 fiber 被中断之后运行
      yield* Effect.addFinalizer(() => Effect.suspend(() => shutdown));

      /** Effect 插件 layer 可声明的内核服务环境（capability 由 broker.contextFor 并入） */
      const kernelCtx = Context.merge(
        Context.make(ServiceRegistry, services),
        Context.make(EventHub, hub)
      );

      // ---------- 状态 ----------

      const slotOf = (id: PluginID): Slot => {
        let s = slots.get(id);
        if (!s) slots.set(id, (s = { cleanups: [], uninstall: [], desired: false, faults: [] }));
        return s;
      };
      const snapshot = SubscriptionRef.get(state);
      const getRec = (id: PluginID) => Effect.map(snapshot, s => s.plugins.get(id));
      const requireRec = (id: PluginID) =>
        Effect.flatMap(getRec(id), rec =>
          rec ? Effect.succeed(rec) : Effect.fail(new PluginNotFound({ id }))
        );

      const patch = (id: PluginID, p: Partial<Omit<PluginRecord, 'id'>>) =>
        SubscriptionRef.update(state, s => {
          const prev: PluginRecord = s.plugins.get(id) ?? { id, status: 'disabled', restarts: 0 };
          let next: PluginRecord = { ...prev, ...p };
          if (p.status === 'enabled' || p.status === 'disabled') {
            const { lastError: _, ...rest } = next;
            next = rest;
          }
          return { plugins: new Map(s.plugins).set(id, next) };
        }).pipe(
          Effect.andThen(
            p.status
              ? Metric.update(Metric.withAttributes(transitions, { plugin: id, status: p.status }), 1)
              : Effect.void
          )
        );

      const removeRec = (id: PluginID) =>
        SubscriptionRef.update(state, s => {
          const plugins = new Map(s.plugins);
          plugins.delete(id);
          return { plugins };
        });

      const persist = (id: PluginID) => {
        const s = slotOf(id);
        return store.put({
          id,
          enabled: s.desired,
          ...(s.rawConfig === undefined ? {} : { config: s.rawConfig }),
        });
      };

      const traced =
        (name: string, id: PluginID) =>
        <A, E, R>(eff: Effect.Effect<A, E, R>) =>
          eff.pipe(
            Effect.withSpan(`plugin.${name}`, { attributes: { 'plugin.id': id } }),
            Effect.annotateLogs({ pluginId: id })
          );

      // ---------- 加载与前置校验 ----------

      const loadModule = (id: PluginID) =>
        Effect.gen(function* () {
          const raw = yield* loader.load(id).pipe(
            Effect.timeoutOrElse({
              duration: timeouts.load,
              orElse: () => Effect.fail(new PluginLoadError({ id, cause: 'load timeout' })),
            })
          );
          const mod = yield* validateModule(id, raw);
          const manifest = yield* Schema.decodeUnknownEffect(PluginManifest)(manifestOf(mod)).pipe(
            Effect.mapError(e => new ManifestInvalid({ id, issue: String(e) }))
          );
          if (manifest.id !== id) {
            return yield* Effect.fail(
              new PluginLoadError({ id, cause: `module declares id "${manifest.id}"` })
            );
          }
          return { mod, manifest };
        });

      const ensureLoaded = (id: PluginID) =>
        Effect.gen(function* () {
          const s = slotOf(id);
          const rec = yield* getRec(id);
          if (s.mod && rec?.manifest) return { mod: s.mod, manifest: rec.manifest };
          const lm = yield* loadModule(id);
          s.mod = lm.mod;
          yield* patch(id, { manifest: lm.manifest, kind: lm.mod.kind });
          return lm;
        });

      const checkCompat = (m: PluginManifest) =>
        m.sdkVersion === undefined
          ? Effect.logWarning('plugin has no sdkVersion; compatibility unchecked')
          : isSdkCompatible(m.sdkVersion, SDK_VERSION)
            ? Effect.void
            : Effect.fail(new SdkIncompatible({ id: m.id, required: m.sdkVersion, actual: SDK_VERSION }));

      const checkDeps = (m: PluginManifest) =>
        Effect.gen(function* () {
          const snap = yield* snapshot;
          const missing: Array<PluginID> = [];
          for (const d of m.dependencies ?? []) {
            const rec = snap.plugins.get(d.id);
            if (!rec?.manifest || rec.status !== 'enabled') missing.push(d.id);
            else if (!satisfies(rec.manifest.version, d.range)) {
              return yield* Effect.fail(
                new DependencyVersionMismatch({
                  id: m.id,
                  dependency: d.id,
                  range: d.range,
                  actual: rec.manifest.version,
                })
              );
            }
          }
          if (missing.length > 0) return yield* Effect.fail(new DependencyMissing({ id: m.id, missing }));
        });

      const decodeConfig = (id: PluginID, mod: AnyPluginModule, raw: unknown) =>
        mod.configSchema
          ? Schema.decodeUnknownEffect(mod.configSchema)(raw ?? mod.defaultConfig ?? {}).pipe(
              Effect.mapError(e => new ConfigInvalid({ id, issue: String(e) }))
            )
          : Effect.succeed(undefined);

      const resolveAccess = (m: PluginManifest) =>
        Effect.gen(function* () {
          const access = new Map<string, AccessLevel>();
          for (const cap of m.capabilities) {
            const level = policy.access(m, cap);
            yield* auditLog.record({
              pluginId: m.id,
              action: 'capability:grant',
              target: level ? `${cap}:${level}` : cap,
              outcome: level ? 'allowed' : 'denied',
            });
            if (!level) return yield* Effect.fail(new PermissionDenied({ id: m.id, required: `capability:${cap}` }));
            access.set(cap, level);
          }
          return access;
        });

      // ---------- 激活 / 停用（不取锁，调用方负责） ----------

      const runCleanups = (list: ReadonlyArray<Cleanup>) =>
        Effect.forEach(
          list.slice().reverse(),
          c =>
            Effect.tryPromise(async () => {
              await c();
            }).pipe(Effect.catchCause(cause => Effect.logWarning('cleanup failed', Cause.pretty(cause)))),
          { discard: true }
        );

      const activate = (manifest: PluginManifest, mod: AnyPluginModule, config: unknown) =>
        Effect.gen(function* () {
          const id = manifest.id;
          yield* policy.check(manifest);
          const access = yield* resolveAccess(manifest);
          const scope = yield* Scope.make();
          const s = slotOf(id);
          const cleanups: Array<Cleanup> = [];
          const uninstall: Array<() => void | Promise<void>> = [];
          s.cleanups = cleanups;
          s.uninstall = uninstall;
          yield* Scope.addFinalizer(scope, Effect.suspend(() => runCleanups(cleanups)));
          const fail = (cause: unknown) => new PluginSetupError({ id, cause });

          const body: Effect.Effect<void, PluginError> =
            mod.kind === 'effect'
              ? Effect.gen(function* () {
                  const capCtx = yield* broker.contextFor(manifest);
                  const layer = Layer.isLayer(mod.layer) ? mod.layer : mod.layer(config);
                  // layer 声明的 R = caps + KernelServices + Scope，三者由该 Context 全覆盖
                  const full = Context.merge(kernelCtx, Context.merge(capCtx, Context.make(Scope.Scope, scope)));
                  yield* Layer.buildWithScope(layer, scope).pipe(
                    Effect.provide(full),
                    Effect.mapError(fail)
                  ) as Effect.Effect<unknown, PluginSetupError>;
                })
              : Effect.gen(function* () {
                  const env: PluginEnv = {
                    manifest,
                    scope,
                    context,
                    services,
                    bus,
                    policy,
                    audit: auditLog,
                    report: cause => reportFault(id, cause),
                    cleanups,
                    uninstall,
                  };
                  const caps = yield* broker.facadesFor(manifest, cap =>
                    makeFacadeContext(env, cap, access.get(cap)!)
                  );
                  const api = makePlainAPI(env, caps);
                  s.api = api;
                  yield* Effect.tryPromise({
                    try: async () => {
                      const c = await mod.setup(api, config);
                      if (typeof c === 'function') cleanups.push(c);
                    },
                    catch: fail,
                  });
                });

          yield* body.pipe(
            Effect.timeoutOrElse({
              duration: timeouts.setup,
              orElse: () => Effect.fail(fail('setup timeout')),
            }),
            Effect.onError(() => Scope.close(scope, Exit.void))
          );
          s.scope = scope;
        }).pipe(traced('activate', manifest.id));

      const deactivate = (id: PluginID) =>
        Effect.suspend(() => {
          const s = slots.get(id);
          const scope = s?.scope;
          if (!s || !scope) return Effect.void;
          s.scope = undefined;
          s.api = undefined;
          return Scope.close(scope, Exit.void).pipe(
            Effect.timeoutOrElse({
              duration: timeouts.stop,
              orElse: () => Effect.logWarning('plugin stop timed out'),
            })
          );
        });

      /** 已持锁：前置校验 → starting → 激活 → enabled；markFailed 控制前置校验失败是否记 failed */
      const startLocked = (id: PluginID, markFailed: boolean) =>
        Effect.gen(function* () {
          const rec = yield* requireRec(id);
          if (rec.status === 'enabled') return;
          const pre = yield* Effect.exit(
            Effect.gen(function* () {
              const { mod, manifest } = yield* ensureLoaded(id);
              yield* checkCompat(manifest);
              yield* checkDeps(manifest);
              const config = yield* decodeConfig(id, mod, slotOf(id).rawConfig);
              return { mod, manifest, config };
            })
          );
          if (Exit.isFailure(pre)) {
            if (markFailed) yield* patch(id, { status: 'failed', lastError: describeError(pre.cause) });
            return yield* Effect.failCause(pre.cause);
          }
          const { mod, manifest, config } = pre.value;
          yield* patch(id, { status: 'starting' });
          const t0 = yield* Clock.currentTimeMillis;
          const exit = yield* Effect.exit(activate(manifest, mod, config));
          if (Exit.isFailure(exit)) {
            const lastError = describeError(exit.cause);
            yield* patch(id, { status: 'failed', lastError });
            yield* Effect.logWarning('plugin activation failed', lastError.tag, lastError.message);
            return yield* Effect.failCause(exit.cause);
          }
          yield* Metric.update(
            Metric.withAttributes(activateDuration, { plugin: id }),
            Duration.millis((yield* Clock.currentTimeMillis) - t0)
          );
          yield* patch(id, { status: 'enabled' });
          yield* Effect.logInfo('plugin enabled');
        }).pipe(Effect.annotateLogs({ pluginId: id }));

      const stopLocked = (id: PluginID, final: PluginStatus, lastError?: SerializedError) =>
        Effect.gen(function* () {
          yield* patch(id, { status: 'stopping' });
          yield* deactivate(id);
          yield* patch(id, { status: final, ...(lastError ? { lastError } : {}) });
          yield* Effect.logInfo(`plugin ${final}`);
        }).pipe(Effect.annotateLogs({ pluginId: id }));

      /** 取锁（自身独占 + 依赖共享）后启动；after 在同一把锁内执行（用于落盘） */
      const startWithLocks = (
        id: PluginID,
        markFailed: boolean,
        after: Effect.Effect<void, PluginError> = Effect.void
      ) =>
        Effect.gen(function* () {
          const rec = yield* requireRec(id);
          if (!rec.manifest) {
            yield* ensureLoaded(id).pipe(
              Effect.tapError(e =>
                markFailed ? patch(id, { status: 'failed', lastError: describeError(e) }) : Effect.void
              )
            );
          }
          const deps = depsOf((yield* requireRec(id)).manifest);
          yield* withLocks(
            [[id, 'exclusive'], ...deps.map(d => [d, 'shared'] as const)],
            Effect.andThen(startLocked(id, markFailed), after)
          );
        });

      const liveDependents = (snap: RegistrySnapshot, id: PluginID) =>
        [...snap.plugins.values()]
          .filter(p => (p.status === 'enabled' || p.status === 'starting') && depsOf(p.manifest).includes(id))
          .map(p => p.id);

      /** 传递依赖者闭包（仅存活者） */
      const dependentClosure = (snap: RegistrySnapshot, id: PluginID) => {
        const out = new Set<PluginID>();
        const queue = [id];
        while (queue.length > 0) {
          for (const d of liveDependents(snap, queue.pop()!)) {
            if (!out.has(d)) queue.push((out.add(d), d));
          }
        }
        return out;
      };

      /**
       * 级联停止：独占 id 与其全部传递依赖者；依赖者按逆拓扑先停（记 failed/DependencyMissing），再停 id。
       * 返回被停止的依赖者（拓扑正序，供恢复时依次启动）。
       */
      const stopCascade = (
        id: PluginID,
        final: PluginStatus,
        lastError?: SerializedError
      ): Effect.Effect<ReadonlyArray<PluginID>> =>
        Effect.gen(function* () {
          const before = dependentClosure(yield* snapshot, id);
          const result = yield* withLocks(
            [id, ...before].map(x => [x, 'exclusive'] as const),
            Effect.gen(function* () {
              const snap = yield* snapshot;
              const ds = dependentClosure(snap, id);
              if ([...ds].some(d => !before.has(d))) return undefined; // 取锁期间新增了依赖者，重试
              const { levels } = kahn(subgraph(ds, d => depsOf(snap.plugins.get(d)?.manifest)));
              const depErr: SerializedError = { tag: 'DependencyMissing', message: `dependency ${id} stopped` };
              for (const level of [...levels].reverse()) {
                yield* Effect.forEach(level, d => stopLocked(d, 'failed', depErr), {
                  concurrency: 'unbounded',
                  discard: true,
                });
              }
              if ((yield* getRec(id))?.status === 'enabled') yield* stopLocked(id, final, lastError);
              return levels.flat();
            })
          );
          return result ?? (yield* stopCascade(id, final, lastError));
        });

      const restartAll = (ids: ReadonlyArray<PluginID>) =>
        Effect.forEach(
          ids,
          d =>
            Effect.flatMap(getRec(d), rec =>
              rec?.status === 'failed' ? Effect.ignore(startWithLocks(d, true)) : Effect.void
            ),
          { discard: true }
        );

      // ---------- 监管器（§10.2） ----------

      const reportFault = (id: PluginID, cause: unknown) => {
        Queue.offerUnsafe(faults, { id, cause });
      };

      const recordFault = (id: PluginID) =>
        Effect.map(Clock.currentTimeMillis, now => {
          const s = slotOf(id);
          const w = millis(supervision.window);
          s.faults = [...s.faults.filter(t => now - t < w), now];
          return s.faults.length;
        });

      const backoff = (n: number) =>
        Duration.millis(
          Math.min(
            millis(supervision.backoff.initial) * supervision.backoff.factor ** (n - 1),
            millis(supervision.backoff.max)
          )
        );

      const handleFault = ({ id, cause }: Fault) =>
        Effect.gen(function* () {
          if (shuttingDown) return;
          let lastError = describeError(cause);
          yield* Metric.update(Metric.withAttributes(faultsTotal, { plugin: id }), 1);
          // 共享锁等待进行中的 start/stop 结束（setup 期间上报的故障要在 enabled 后再处理）
          if ((yield* withLocks([[id, 'shared']], getRec(id)))?.status !== 'enabled') {
            yield* Effect.logDebug('fault ignored: plugin not enabled', lastError.message);
            return;
          }
          yield* Effect.logWarning('plugin fault', lastError.tag, lastError.message);
          const stopped = yield* stopCascade(id, 'failed', lastError);
          if (supervision.maxRestarts <= 0) return;
          while (true) {
            const n = yield* recordFault(id);
            if (n > supervision.maxRestarts) {
              yield* patch(id, { status: 'quarantined', lastError });
              yield* Effect.logError('plugin quarantined: restart budget exhausted');
              return;
            }
            yield* Effect.sleep(backoff(n));
            // 用户在退避期间手动改变了状态（disable/uninstall/enable）则放弃
            if (shuttingDown || (yield* getRec(id))?.status !== 'failed') return;
            const exit = yield* Effect.exit(startWithLocks(id, true));
            if (Exit.isSuccess(exit)) {
              const rec = yield* getRec(id);
              yield* patch(id, { restarts: (rec?.restarts ?? 0) + 1 });
              yield* restartAll(stopped);
              return;
            }
            lastError = describeError(exit.cause);
          }
        }).pipe(
          traced('recover', id),
          Effect.catchCause(c => Effect.logError('supervisor error', Cause.pretty(c)))
        );

      yield* Effect.forkScoped(
        Effect.forever(
          Effect.flatMap(Queue.take(faults), f => Effect.forkIn(handleFault(f), layerScope))
        )
      );

      // ---------- 公开操作 ----------

      const install: PluginRegistryShape['install'] = (id, opts) =>
        Effect.gen(function* () {
          const existing = yield* getRec(id);
          if (existing) {
            if (opts?.config !== undefined) slotOf(id).rawConfig = opts.config;
            if (existing.status !== 'enabled') yield* enable(id);
            return;
          }
          const { mod, manifest } = yield* loadModule(id);
          yield* withLocks(
            [[id, 'exclusive'], ...depsOf(manifest).map(d => [d, 'shared'] as const)],
            Effect.gen(function* () {
              if (yield* getRec(id)) return; // 并发 install 已完成
              const s = slotOf(id);
              s.mod = mod;
              s.rawConfig = opts?.config;
              yield* patch(id, { manifest, kind: mod.kind, status: 'disabled' });
              yield* startLocked(id, true);
              s.desired = true;
              yield* persist(id);
              if (opts?.manual && mod.kind === 'plain' && mod.onManualInstall && s.api) {
                const api = s.api;
                yield* Effect.tryPromise({
                  try: async () => {
                    await mod.onManualInstall!(api);
                  },
                  catch: cause => new PluginSetupError({ id, cause }),
                });
              }
            })
          );
        }).pipe(traced('install', id));

      const enable: PluginRegistryShape['enable'] = id =>
        Effect.gen(function* () {
          const rec = yield* requireRec(id);
          if (rec.status === 'enabled') return;
          const s = slotOf(id);
          // 显式 enable 解除熔断并清零故障计数
          if (rec.status === 'quarantined' || rec.status === 'failed') s.faults = [];
          yield* startWithLocks(
            id,
            false,
            Effect.suspend(() => {
              s.desired = true;
              return persist(id);
            })
          );
        }).pipe(traced('enable', id));

      const disable: PluginRegistryShape['disable'] = id =>
        withLocks(
          [[id, 'exclusive']],
          Effect.gen(function* () {
            const rec = yield* requireRec(id);
            if (rec.status === 'enabled') {
              const dependents = liveDependents(yield* snapshot, id);
              if (dependents.length > 0) return yield* Effect.fail(new DependentsActive({ id, dependents }));
              yield* stopLocked(id, 'disabled');
            } else if (rec.status !== 'disabled') {
              yield* patch(id, { status: 'disabled' });
            }
            const s = slotOf(id);
            s.desired = false;
            s.faults = [];
            yield* persist(id);
          })
        ).pipe(traced('disable', id));

      const uninstall: PluginRegistryShape['uninstall'] = id =>
        withLocks(
          [[id, 'exclusive']],
          Effect.gen(function* () {
            const rec = yield* requireRec(id);
            if (rec.status === 'enabled') {
              const dependents = liveDependents(yield* snapshot, id);
              if (dependents.length > 0) return yield* Effect.fail(new DependentsActive({ id, dependents }));
              yield* stopLocked(id, 'disabled');
            }
            for (const cb of slotOf(id).uninstall) {
              yield* Effect.tryPromise(async () => {
                await cb();
              }).pipe(Effect.catchCause(c => Effect.logWarning('uninstall data cleanup failed', Cause.pretty(c))));
            }
            slots.delete(id);
            yield* removeRec(id);
            yield* store.remove(id);
          })
        ).pipe(traced('uninstall', id));

      const reconfigure: PluginRegistryShape['reconfigure'] = (id, raw) =>
        Effect.gen(function* () {
          yield* requireRec(id);
          const { mod } = yield* ensureLoaded(id);
          yield* decodeConfig(id, mod, raw);
          const rec = yield* withLocks(
            [[id, 'exclusive']],
            Effect.gen(function* () {
              slotOf(id).rawConfig = raw;
              yield* persist(id);
              return yield* getRec(id);
            })
          );
          if (rec?.status !== 'enabled') return;
          // 配置变化 = 重启该插件 Scope（级联，不计入故障预算）
          const stopped = yield* stopCascade(id, 'disabled');
          yield* startWithLocks(id, true);
          yield* restartAll(stopped);
        }).pipe(traced('reconfigure', id));

      /** §10.1：逐插件失败不阻断其他插件；store 不被改写（期望态） */
      const bootstrap: PluginRegistryShape['bootstrap'] = Effect.gen(function* () {
        const recs = yield* store.list;
        const loaded = yield* Effect.forEach(recs, r => Effect.exit(loadModule(r.id)), {
          concurrency: 'unbounded',
        });
        const failed: Array<{ id: PluginID; error: SerializedError }> = [];
        const markFailed = (id: PluginID, error: SerializedError) =>
          Effect.andThen(
            Effect.sync(() => failed.push({ id, error })),
            patch(id, { status: 'failed', lastError: error })
          );
        const wanted: Array<PluginID> = [];
        for (const [i, r] of recs.entries()) {
          const exit = loaded[i]!;
          const s = slotOf(r.id);
          s.desired = r.enabled;
          s.rawConfig = r.config;
          if (Exit.isFailure(exit)) {
            yield* markFailed(r.id, describeError(exit.cause));
            continue;
          }
          s.mod = exit.value.mod;
          yield* patch(r.id, { manifest: exit.value.manifest, kind: exit.value.mod.kind, status: 'disabled' });
          if (r.enabled) wanted.push(r.id);
        }

        const snap = yield* snapshot;
        const { levels, stuck } = kahn(subgraph(wanted, id => depsOf(snap.plugins.get(id)?.manifest)));
        for (const id of stuck) yield* markFailed(id, describeError(new DependencyCycle({ cycle: stuck })));

        const enabled: Array<PluginID> = [];
        for (const level of levels) {
          const exits = yield* Effect.forEach(level, id => Effect.exit(startWithLocks(id, true)), {
            concurrency: 'unbounded',
          });
          level.forEach((id, i) => {
            const e = exits[i]!;
            if (Exit.isSuccess(e)) enabled.push(id);
            else failed.push({ id, error: describeError(e.cause) });
          });
        }
        yield* Effect.logInfo('kernel bootstrapped', { enabled: enabled.length, failed: failed.length });
        return { enabled, failed };
      }).pipe(Effect.withSpan('kernel.bootstrap'));

      /** §10.1：reverse-Kahn —— 依赖者先关，被依赖者最后关；层内并行 */
      const shutdown: Effect.Effect<void> = Effect.gen(function* () {
        shuttingDown = true;
        const snap = yield* snapshot;
        const live = [...snap.plugins.values()]
          .filter(p => p.status === 'enabled' || p.status === 'starting' || p.status === 'stopping')
          .map(p => p.id);
        const { levels } = kahn(subgraph(live, id => depsOf(snap.plugins.get(id)?.manifest)));
        for (const level of [...levels].reverse()) {
          yield* Effect.forEach(
            level,
            id =>
              withLocks(
                [[id, 'exclusive']],
                Effect.flatMap(getRec(id), rec =>
                  rec?.status === 'enabled' ? stopLocked(id, 'disabled') : Effect.void
                )
              ),
            { concurrency: 'unbounded', discard: true }
          );
        }
      }).pipe(Effect.withSpan('kernel.shutdown'));

      const diagnostics: Effect.Effect<Diagnostics> = Effect.gen(function* () {
        const snap = yield* snapshot;
        const events = yield* bus.stats;
        const audit = yield* auditLog.recent;
        const at = yield* Clock.currentTimeMillis;
        const plugins = yield* Effect.forEach([...snap.plugins.values()], r =>
          Effect.map(services.ownedBy(r.id), owned => ({
            id: r.id,
            name: r.manifest?.name ?? r.id,
            version: r.manifest?.version ?? 'unknown',
            kind: r.kind ?? 'unknown',
            status: r.status,
            restarts: r.restarts,
            ...(r.lastError ? { lastError: r.lastError } : {}),
            dependencies: (r.manifest?.dependencies ?? []).map(d => `${d.id}@${d.range}`),
            services: [...owned],
          }))
        );
        return {
          at,
          healthy: plugins.every(p => p.status !== 'failed' && p.status !== 'quarantined'),
          plugins,
          events,
          audit,
        };
      });

      return PluginRegistry.of({
        state,
        bootstrap,
        install,
        uninstall,
        enable,
        disable,
        reconfigure,
        reportFault,
        shutdown,
        diagnostics,
      });
    })
  );
}
