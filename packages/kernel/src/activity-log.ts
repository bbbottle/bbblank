/**
 * ActivityLog —— 设计文档 §10.10：事件发布与生命周期阶段的有序记录（活动流）。
 * 环形缓冲 + 同步观察者；event 条目保留 payload 引用，因此宿主须经授权才把它暴露给插件。
 */
import { Clock, Context, Effect, Layer } from "effect";
import type { PluginID } from "@bbblank/sdk";
import type { SerializedError } from "./errors.js";

export type LifecyclePhase = "load" | "setup" | "stop";

export type Activity =
  | {
      readonly kind: "event";
      readonly seq: number;
      readonly at: number;
      readonly topic: string;
      readonly publisher: string;
      readonly payload: unknown;
      readonly subscribers: number;
    }
  | {
      readonly kind: "event-invalid";
      readonly seq: number;
      readonly at: number;
      readonly topic: string;
      readonly publisher: string;
      readonly issue: string;
    }
  | {
      readonly kind: "event-dropped";
      readonly seq: number;
      readonly at: number;
      readonly topic: string;
      readonly subscriber: string;
      readonly reason: "dropped-newest" | "dropped-oldest";
    }
  | {
      readonly kind: "lifecycle";
      readonly seq: number;
      /** 阶段开始时间 */
      readonly at: number;
      readonly pluginId: PluginID;
      readonly phase: LifecyclePhase;
      readonly durationMs: number;
      readonly outcome: "ok" | "error";
      readonly error?: SerializedError;
    };

/** 记录时由日志分配 seq；event 系列的 at 由日志填充，lifecycle 的 at 为调用方测得的阶段开始时间 */
export type ActivityInput = Activity extends infer A
  ? A extends { readonly kind: "lifecycle" }
    ? Omit<A, "seq">
    : A extends Activity
      ? Omit<A, "seq" | "at">
      : never
  : never;

export interface ActivityLogShape {
  readonly record: (a: ActivityInput) => Effect.Effect<void>;
  readonly recent: Effect.Effect<ReadonlyArray<Activity>>;
  /** 同步注册；返回注销函数 */
  readonly observe: (cb: (a: Activity) => void) => Effect.Effect<() => void>;
}

export interface ActivityOptions {
  /** 环形缓冲容量；0 关闭记录（observe 仍可注册，但不会收到任何记录） */
  readonly capacity: number;
}

export class ActivityLog extends Context.Service<
  ActivityLog,
  ActivityLogShape
>()("@kernel/ActivityLog") {
  static readonly memory = (opts: Partial<ActivityOptions> = {}) =>
    Layer.sync(ActivityLog, () => {
      const capacity = opts.capacity ?? 1000;
      const buf: Array<Activity> = [];
      const observers = new Set<(a: Activity) => void>();
      let seq = 0;
      return ActivityLog.of({
        record: (input) =>
          capacity <= 0
            ? Effect.void
            : Effect.gen(function* () {
                const at =
                  "at" in input ? input.at : yield* Clock.currentTimeMillis;
                const a = { at, ...input, seq: ++seq } as Activity;
                buf.push(a);
                if (buf.length > capacity) buf.shift();
                for (const cb of [...observers]) {
                  try {
                    cb(a);
                  } catch (e) {
                    yield* Effect.logWarning("activity observer threw", e);
                  }
                }
              }),
        recent: Effect.sync(() => buf.slice()),
        observe: (cb) =>
          Effect.sync(() => {
            observers.add(cb);
            return () => void observers.delete(cb);
          }),
      });
    });
}
