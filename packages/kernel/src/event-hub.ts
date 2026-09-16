/**
 * EventHub 实现 —— 设计文档 §4.3
 * Tag 在 sdk 声明；`PubSub` 按 topic key 过滤分发。
 * dev 下 publish 用 Schema 校验 payload（编译期类型与运行时校验共源），prod 可关。
 */
import { Effect, Layer, PubSub, Schema, Stream } from 'effect';
import { EventHub } from '@bbblank/sdk';
import type { Topic } from '@bbblank/sdk';

interface Envelope {
  readonly key: string;
  readonly payload: unknown;
}

export const EventHubLive = (opts: { readonly validate?: boolean } = {}) =>
  Layer.effect(
    EventHub,
    Effect.gen(function* () {
      const pub = yield* PubSub.unbounded<Envelope>();
      const validate = opts.validate ?? true;

      const publish = <T>(topic: Topic<T>, payload: T): Effect.Effect<void> =>
        (validate
          ? Effect.try(() => Schema.decodeUnknownSync(topic.schema)(payload)).pipe(Effect.orDie)
          : Effect.void
        ).pipe(Effect.andThen(PubSub.publish(pub, { key: topic.key, payload })), Effect.asVoid);

      const subscribe = <T>(topic: Topic<T>): Stream.Stream<T> =>
        Stream.map(
          Stream.filter(Stream.fromPubSub(pub), e => e.key === topic.key),
          e => e.payload as T
        );

      return EventHub.of({ publish, subscribe });
    })
  );
