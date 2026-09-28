/**
 * 插件侧 API 构造 —— 设计文档 §4.5 / §10.2 / §10.5
 * FacadeContext（每插件 × 每 capability）与 PluginAPI（plain 插件）。
 * 所有"插件代码在内核之外被调用"的入口都经过 guard：异常归因到插件并交给监管器。
 */
import { Cause, Context, Effect, Exit, Fiber, Scope, Stream } from 'effect';
import type { AccessLevel, Cleanup, FacadeContext, PluginAPI, PluginID, PluginManifest, ServiceRegistryShape } from '@bbblank/sdk';
import type { AuditLogShape } from './audit-log.js';
import { PermissionDenied } from './errors.js';
import type { EventBusShape } from './event-hub.js';
import { accessSatisfies } from './permission-policy.js';
import type { PermissionPolicyShape } from './permission-policy.js';

export interface PluginEnv {
  readonly manifest: PluginManifest;
  readonly scope: Scope.Closeable;
  /** runtime 环境：run/runSync 在其中执行，宿主配置的 Logger/Tracer 生效 */
  readonly context: Context.Context<never>;
  readonly services: ServiceRegistryShape;
  readonly bus: EventBusShape;
  readonly policy: PermissionPolicyShape;
  readonly audit: AuditLogShape;
  /** 把故障归因到某插件（服务 Proxy 归因给提供者，即本插件） */
  readonly report: (cause: unknown) => void;
  readonly cleanups: Array<Cleanup>;
  readonly uninstall: Array<() => void | Promise<void>>;
}

const isPromiseLike = (u: unknown): u is PromiseLike<unknown> =>
  typeof u === 'object' && u !== null && typeof (u as { then?: unknown }).then === 'function';

/** 同步执行；失败时抛出原始错误（而非包装），与 Promise 侧行为一致 */
const runners = (env: PluginEnv) => {
  const annotate = <A, E>(eff: Effect.Effect<A, E>) =>
    Effect.annotateLogs(eff, { pluginId: env.manifest.id });
  const runSync = <A, E>(eff: Effect.Effect<A, E>): A => {
    const exit = Effect.runSyncExitWith(env.context)(annotate(eff));
    if (Exit.isSuccess(exit)) return exit.value;
    throw Cause.squash(exit.cause);
  };
  const run = <A, E>(eff: Effect.Effect<A, E>): Promise<A> =>
    Effect.runPromiseExitWith(env.context)(annotate(eff)).then(exit => {
      if (Exit.isSuccess(exit)) return exit.value;
      throw Cause.squash(exit.cause);
    });
  const fork = <A, E>(eff: Effect.Effect<A, E>) => Effect.runForkWith(env.context)(annotate(eff));
  /** 关闭子 Scope：能同步完成则同步（常见路径），有 finalizer 挂起时返回 Promise */
  const closer = (child: Scope.Closeable): Cleanup => () => {
    const fiber = fork(Scope.close(child, Exit.void));
    return fiber.pollUnsafe() ? undefined : Effect.runPromise(Fiber.await(fiber)).then(() => {});
  };
  /** 在插件 Scope 的子 Scope 中运行；非中断失败归因到插件 */
  const scoped = (eff: Effect.Effect<void, unknown, Scope.Scope>): Cleanup => {
    const child = runSync(Scope.fork(env.scope));
    const supervised = eff.pipe(
      Effect.catchCause(c =>
        Cause.hasInterruptsOnly(c) ? Effect.void : Effect.sync(() => env.report(Cause.squash(c)))
      ),
      Effect.provideService(Scope.Scope, child)
    );
    runSync(Effect.forkIn(supervised, child));
    return closer(child);
  };
  return { runSync, run, fork, scoped, closer };
};

/** 吞掉异常并归因；Promise 的 reject 同样处理（返回 undefined） */
export const guardWith =
  (report: (cause: unknown) => void) =>
  <Args extends ReadonlyArray<unknown>, R>(fn: (...args: Args) => R) =>
  (...args: Args): R | undefined => {
    try {
      const r = fn(...args);
      return isPromiseLike(r)
        ? (Promise.resolve(r).then(undefined, e => {
            report(e);
            return undefined;
          }) as R)
        : r;
    } catch (e) {
      report(e);
      return undefined;
    }
  };

/** 服务实现 Proxy：方法 throw/reject 归因给提供者，并把原错误继续抛给调用方 */
export const guardService = <T>(impl: T, report: (cause: unknown) => void): T => {
  if ((typeof impl !== 'object' && typeof impl !== 'function') || impl === null) return impl;
  const wrap =
    (fn: (...a: Array<unknown>) => unknown, self: unknown) =>
    (...args: Array<unknown>) => {
      try {
        const r = fn.apply(self, args);
        return isPromiseLike(r)
          ? Promise.resolve(r).then(undefined, e => {
              report(e);
              throw e;
            })
          : r;
      } catch (e) {
        report(e);
        throw e;
      }
    };
  const cache = new Map<PropertyKey, unknown>();
  return new Proxy(impl as object, {
    apply: (target, self, args) => wrap(target as (...a: Array<unknown>) => unknown, self)(...args),
    get: (target, key, receiver) => {
      const v = Reflect.get(target, key, receiver);
      if (typeof v !== 'function') return v;
      if (!cache.has(key)) cache.set(key, wrap(v as (...a: Array<unknown>) => unknown, target));
      return cache.get(key);
    },
  }) as T;
};

export const makeFacadeContext = (
  env: PluginEnv,
  capability: string,
  access: AccessLevel
): FacadeContext => {
  const id = env.manifest.id;
  const { runSync, run, scoped } = runners(env);
  const audit = (action: string, outcome: 'allowed' | 'denied', target?: string) =>
    runSync(
      env.audit.record({
        pluginId: id,
        action: `${capability}:${action}`,
        outcome,
        ...(target === undefined ? {} : { target }),
      })
    );
  return {
    pluginId: id,
    scoped,
    run,
    runSync,
    access,
    require: level => {
      if (accessSatisfies(access, level)) return;
      audit(`require:${level}`, 'denied');
      throw new PermissionDenied({ id, required: `capability:${capability}:${level}` });
    },
    audit: (action, target) => audit(action, 'allowed', target),
    guard: guardWith(env.report) as FacadeContext['guard'],
    onUninstall: eff => {
      env.uninstall.push(() => run(eff));
    },
  };
};

export const makePlainAPI = (env: PluginEnv, caps: Record<string, unknown>): PluginAPI<any> => {
  const { manifest, cleanups } = env;
  const id: PluginID = manifest.id;
  const { runSync, run, fork, closer } = runners(env);
  const deliverCb = <T>(cb: (payload: T) => unknown, payload: T) =>
    Effect.suspend(() => {
      try {
        const r = cb(payload);
        return isPromiseLike(r)
          ? Effect.promise(() => Promise.resolve(r).then(undefined, env.report))
          : Effect.void;
      } catch (e) {
        env.report(e);
        return Effect.void;
      }
    });

  return {
    manifest,
    caps: caps as PluginAPI<any>['caps'],
    services: {
      register: (token, impl) => {
        const allowed = env.policy.canProvide(manifest, token.key);
        runSync(
          env.audit.record({
            pluginId: id,
            action: 'service:provide',
            target: token.key,
            outcome: allowed ? 'allowed' : 'denied',
          })
        );
        if (!allowed) throw new PermissionDenied({ id, required: `service:provide:${token.key}` });
        const cleanup = runSync(env.services.register(token, guardService(impl, env.report), id));
        cleanups.push(cleanup);
        return cleanup;
      },
      get: token => run(env.services.get(token)),
      tryGet: token => runSync(env.services.tryGet(token)),
    },
    events: {
      // 订阅在调用返回前即完成注册，随后 emit 的事件不会丢失
      on: (topic, cb) => {
        const child = runSync(Scope.fork(env.scope));
        const stream = runSync(Scope.provide(env.bus.subscribe(topic, id), child));
        runSync(Effect.forkIn(Stream.runForEach(stream, p => deliverCb(cb, p)), child));
        const cleanup = closer(child);
        cleanups.push(cleanup);
        return cleanup;
      },
      emit: (topic, payload) => {
        runSync(env.bus.validate(topic, payload));
        if (env.bus.options.strategy === 'suspend') fork(env.bus.deliver(topic, payload));
        else runSync(env.bus.deliver(topic, payload));
      },
    },
    lifecycle: {
      addCleanup: c => {
        cleanups.push(c);
      },
      onUninstallData: cb => {
        env.uninstall.push(cb);
        return () => {
          const i = env.uninstall.indexOf(cb);
          if (i >= 0) env.uninstall.splice(i, 1);
        };
      },
    },
  };
};
