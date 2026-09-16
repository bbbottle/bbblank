import { Schema } from "effect";
/**
 * 事件 Topic —— 设计文档 §3.3
 * payload 是数据，带 Schema 以便运行时校验（dev 下 decodeUnknownSync）。
 */
<<<<<<< HEAD
export interface Topic<T> {
  readonly key: string;
  readonly schema: Schema.Decoder<T>;
}
export const defineTopic = <T>(
  key: string,
  schema: Schema.Decoder<T>,
): Topic<T> => ({ key, schema });
=======
import type { Schema } from 'effect';

export interface Topic<T> {
  readonly key: string;
  /** Decoder<T>：只保留解码视图；DecodingServices=never 才能用 decodeUnknownSync */
  readonly schema: Schema.Decoder<T>;
}

export const defineTopic = <T>(key: string, schema: Schema.Decoder<T>): Topic<T> => ({
  key,
  schema,
});
>>>>>>> 439e5ed0047a57aee2d667b2aed6184834693bcb
