/**
 * ServiceRegistry 实现 —— 设计文档 §4.3
 * Tag 在 sdk 声明（插件可依赖）；`Ref` + `Deferred` 的等待式 get；register 记录 pluginId 归属。
 */
import { Deferred, Effect, Layer, Ref } from 'effect';
import { ServiceRegistry } from '@bbblank/sdk';
import type { PluginID, ServiceToken } from '@bbblank/sdk';
import type { Cleanup } from '@bbblank/sdk';

export const ServiceRegistryLive = Layer.effect(
  ServiceRegistry,
  Effect.gen(function* () {
    const impls = yield* Ref.make(new Map<string, unknown>());
    const owners = yield* Ref.make(new Map<string, PluginID>());
    const waiters = yield* Ref.make(new Map<string, Array<Deferred.Deferred<unknown, never>>>());

    const register = <T>(
      token: ServiceToken<T>,
      impl: T,
      pluginId: PluginID
    ): Effect.Effect<Cleanup> =>
      Effect.gen(function* () {
        yield* Ref.update(impls, m => new Map(m).set(token.key, impl));
        yield* Ref.update(owners, m => new Map(m).set(token.key, pluginId));
        const ws = yield* Ref.modify(waiters, m => {
          const ws2 = m.get(token.key) ?? [];
          const next = new Map(m);
          next.delete(token.key);
          return [ws2, next] as const;
        });
        yield* Effect.forEach(ws, w => Deferred.succeed(w, impl as unknown), {
          discard: true,
        });
        return () => {
          // 仅当该服务仍由此插件持有时才注销（防御覆盖注册）
          Effect.runSync(
            Ref.update(impls, m => {
              if (m.get(token.key) !== impl) return m;
              const next = new Map(m);
              next.delete(token.key);
              return next;
            })
          );
          Effect.runSync(
            Ref.update(owners, m => {
              if (m.get(token.key) !== pluginId) return m;
              const next = new Map(m);
              next.delete(token.key);
              return next;
            })
          );
        };
      });

    const get = <T>(token: ServiceToken<T>): Effect.Effect<T> =>
      Effect.gen(function* () {
        const impl = (yield* Ref.get(impls)).get(token.key);
        if (impl !== undefined) return impl as T;
        const df = yield* Deferred.make<unknown, never>();
        yield* Ref.update(waiters, ws => {
          const next = new Map(ws);
          next.set(token.key, [...(next.get(token.key) ?? []), df]);
          return next;
        });
        return (yield* Deferred.await(df)) as T;
      });

    const tryGet = <T>(token: ServiceToken<T>): Effect.Effect<T | undefined> =>
      Effect.map(Ref.get(impls), m => m.get(token.key) as T | undefined);

    const ownedBy = (pluginId: PluginID): Effect.Effect<ReadonlyArray<string>> =>
      Effect.map(Ref.get(owners), m =>
        [...m.entries()].filter(([, owner]) => owner === pluginId).map(([key]) => key)
      );

    return ServiceRegistry.of({ register, get, tryGet, ownedBy });
  })
);
