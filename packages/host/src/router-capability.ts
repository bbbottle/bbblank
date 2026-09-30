/**
 * RouterCapability —— History API 路由（设计文档 §0：路由不是内核概念，是 Capability）。
 * 读：current / onChange；写：navigate（需 write 授权）。
 */
import { Effect, Layer, Stream, SubscriptionRef } from 'effect';
import { defineCapability } from '@bbblank/sdk';
import type { Cleanup } from '@bbblank/sdk';

export interface RouterShape {
  readonly current: Effect.Effect<string>;
  readonly navigate: (path: string) => Effect.Effect<void>;
  /** 先发出当前路径，随后每次变化 */
  readonly changes: Stream.Stream<string>;
}

export interface RouterFacade {
  current(): string;
  navigate(path: string): void;
  /** 立即以当前路径回调一次，之后每次变化回调 */
  onChange(cb: (path: string) => void): Cleanup;
}

export const Router = defineCapability<'router', RouterShape, RouterFacade>('router', (s, ctx) => ({
  current: () => ctx.runSync(s.current),
  navigate: path => {
    ctx.require('write');
    ctx.runSync(s.navigate(path));
  },
  onChange: cb => {
    const guarded = ctx.guard(cb);
    return ctx.scoped(Stream.runForEach(s.changes, p => Effect.sync(() => guarded(p))));
  },
}));

/** 浏览器 History 实现；popstate 监听随 layer 生命周期释放 */
export const RouterLive = (win: Window = globalThis.window) =>
  Layer.effect(
    Router.tag,
    Effect.gen(function* () {
      const ref = yield* SubscriptionRef.make(win.location.pathname);
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const onPop = () => {
            Effect.runFork(SubscriptionRef.set(ref, win.location.pathname));
          };
          win.addEventListener('popstate', onPop);
          return onPop;
        }),
        onPop => Effect.sync(() => win.removeEventListener('popstate', onPop))
      );
      return {
        current: SubscriptionRef.get(ref),
        navigate: path =>
          Effect.suspend(() => {
            if (path === win.location.pathname) return Effect.void;
            win.history.pushState(null, '', path);
            return SubscriptionRef.set(ref, win.location.pathname);
          }),
        changes: SubscriptionRef.changes(ref),
      };
    })
  );
