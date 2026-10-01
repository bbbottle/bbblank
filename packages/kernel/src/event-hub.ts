/**
 * EventBus / EventHub 实现 —— 设计文档 §4.3 / §10.6
 * 每订阅者一个有界队列（慢消费者只影响自己）；满载按策略 dropping / sliding / suspend 处理，
 * 被丢弃的消息进死信环形缓冲并计入指标。Schema 校验缺省开启（生产也开启）。
 * EventBus 是内核内部服务（带订阅归属、统计）；sdk 的 EventHub Tag 由它投影而来。
 */
import {
  Clock,
  Context,
  Effect,
  Layer,
  Metric,
  Queue,
  Schema,
  Stream,
} from "effect";
import type { Scope } from "effect";
import { EventHub, EventPayloadInvalid } from "@bbblank/sdk";
import type { Topic } from "@bbblank/sdk";
import { ActivityLog } from "./activity-log.js";

export type BackpressureStrategy = "dropping" | "sliding" | "suspend";

export interface EventHubOptions {
  /** 每订阅者队列容量 */
  readonly capacity: number;
  readonly strategy: BackpressureStrategy;
  /** payload Schema 校验 */
  readonly validate: boolean;
  readonly deadLetterCapacity: number;
}

export const defaultEventHubOptions: EventHubOptions = {
  capacity: 1024,
  strategy: "dropping",
  validate: true,
  deadLetterCapacity: 100,
};

export interface DeadLetter {
  readonly at: number;
  readonly topic: string;
  readonly subscriber: string;
  readonly reason: "dropped-newest" | "dropped-oldest";
}

export interface EventStats {
  readonly published: number;
  readonly dropped: number;
  readonly deadLetters: ReadonlyArray<DeadLetter>;
}

export interface EventBusShape {
  readonly options: EventHubOptions;
  /** publisher：发布插件 id，写入活动流（§10.10）；缺省 "anonymous" */
  readonly validate: <T>(
    topic: Topic<T>,
    payload: T,
    publisher?: string,
  ) => Effect.Effect<void, EventPayloadInvalid>;
  /** 投递（不校验）；suspend 策略下可能挂起 */
  readonly deliver: <T>(
    topic: Topic<T>,
    payload: T,
    publisher?: string,
  ) => Effect.Effect<void>;
  readonly publish: <T>(
    topic: Topic<T>,
    payload: T,
    publisher?: string,
  ) => Effect.Effect<void, EventPayloadInvalid>;
  /** 立即注册订阅（随 Scope 注销），返回消费流；owner 用于死信归属 */
  readonly subscribe: <T>(
    topic: Topic<T>,
    owner?: string,
  ) => Effect.Effect<Stream.Stream<T>, never, Scope.Scope>;
  readonly stats: Effect.Effect<EventStats>;
}

export class EventBus extends Context.Service<EventBus, EventBusShape>()(
  "@kernel/EventBus",
) {}

interface Sub {
  readonly owner: string;
  readonly queue: Queue.Queue<unknown>;
}

const publishedTotal = Metric.counter("bbblank_events_published_total");
const droppedTotal = Metric.counter("bbblank_events_dropped_total");

export const EventBusLive = (opts: Partial<EventHubOptions> = {}) =>
  Layer.effect(
    EventBus,
    Effect.gen(function* () {
      const activity = yield* ActivityLog;
      const options = { ...defaultEventHubOptions, ...opts };
      const topics = new Map<string, Set<Sub>>();
      const deadLetters: Array<DeadLetter> = [];
      let published = 0;
      let dropped = 0;

      const deadLetter = (
        topic: string,
        sub: Sub,
        reason: DeadLetter["reason"],
      ) =>
        Effect.gen(function* () {
          dropped++;
          deadLetters.push({
            at: yield* Clock.currentTimeMillis,
            topic,
            subscriber: sub.owner,
            reason,
          });
          if (deadLetters.length > options.deadLetterCapacity)
            deadLetters.shift();
          yield* Metric.update(
            Metric.withAttributes(droppedTotal, { topic }),
            1,
          );
          yield* activity.record({
            kind: "event-dropped",
            topic,
            subscriber: sub.owner,
            reason,
          });
        });

      const offer = (
        topic: string,
        sub: Sub,
        payload: unknown,
      ): Effect.Effect<void> => {
        if (options.strategy === "suspend" || !Queue.isFullUnsafe(sub.queue)) {
          return Effect.asVoid(Queue.offer(sub.queue, payload));
        }
        return options.strategy === "dropping"
          ? deadLetter(topic, sub, "dropped-newest")
          : Queue.poll(sub.queue).pipe(
              Effect.andThen(deadLetter(topic, sub, "dropped-oldest")),
              Effect.andThen(Queue.offer(sub.queue, payload)),
              Effect.asVoid,
            );
      };

      const validate = <T>(
        topic: Topic<T>,
        payload: T,
        publisher = "anonymous",
      ) =>
        options.validate
          ? Effect.try({
              try: () => void Schema.decodeUnknownSync(topic.schema)(payload),
              catch: (e) =>
                new EventPayloadInvalid({ topic: topic.key, issue: String(e) }),
            }).pipe(
              Effect.tapError((e) =>
                activity.record({
                  kind: "event-invalid",
                  topic: topic.key,
                  publisher,
                  issue: e.issue,
                }),
              ),
            )
          : Effect.void;

      const deliver = <T>(
        topic: Topic<T>,
        payload: T,
        publisher = "anonymous",
      ) =>
        Effect.suspend(() => {
          published++;
          const subs = [...(topics.get(topic.key) ?? [])];
          // 先记录发布、再投递：活动流中发布总在订阅方因此引发的活动之前
          return activity
            .record({
              kind: "event",
              topic: topic.key,
              publisher,
              payload,
              subscribers: subs.length,
            })
            .pipe(
              Effect.andThen(
                Metric.update(
                  Metric.withAttributes(publishedTotal, { topic: topic.key }),
                  1,
                ),
              ),
              Effect.andThen(
                Effect.forEach(subs, (s) => offer(topic.key, s, payload), {
                  discard: true,
                }),
              ),
            );
        });

      const subscribe = <T>(topic: Topic<T>, owner = "anonymous") =>
        Effect.acquireRelease(
          Effect.map(Queue.bounded<unknown>(options.capacity), (queue) => {
            const sub: Sub = { owner, queue };
            const set = topics.get(topic.key) ?? new Set();
            topics.set(topic.key, set.add(sub));
            return sub;
          }),
          (sub) =>
            Effect.suspend(() => {
              topics.get(topic.key)?.delete(sub);
              return Queue.shutdown(sub.queue);
            }),
        ).pipe(
          Effect.map((sub) => Stream.fromQueue(sub.queue) as Stream.Stream<T>),
        );

      return EventBus.of({
        options,
        validate,
        deliver,
        publish: (topic, payload, publisher) =>
          Effect.andThen(
            validate(topic, payload, publisher),
            deliver(topic, payload, publisher),
          ),
        subscribe,
        stats: Effect.sync(() => ({
          published,
          dropped,
          deadLetters: deadLetters.slice(),
        })),
      });
    }),
  );

/** sdk EventHub（Effect 插件可见）由 EventBus 投影 */
export const EventHubLive = Layer.effect(
  EventHub,
  Effect.map(Effect.service(EventBus), (bus) =>
    EventHub.of({
      publish: bus.publish,
      subscribe: (topic) => Stream.unwrap(bus.subscribe(topic)),
    }),
  ),
);
