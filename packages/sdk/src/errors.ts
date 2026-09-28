/**
 * 契约错误 —— 设计文档 §3.4 / §10
 * 出现在插件可见类型面上的错误归 sdk；kernel 的 PluginError 联合包含它们。
 */
import { Data } from 'effect';
import type { PluginID } from './manifest.js';

/** 插件 setup / layer 可抛出的错误 */
export class PluginSetupError extends Data.TaggedError('PluginSetupError')<{
  id: PluginID;
  cause: unknown;
}> {}

/** 授权不足；required 形如 "capability:dom:write" / "service:provide:theme" */
export class PermissionDenied extends Data.TaggedError('PermissionDenied')<{
  id: PluginID;
  required: string;
}> {}

/** Storage capability / KeyValueStore 的失败 */
export class StorageError extends Data.TaggedError('StorageError')<{
  op: string;
  cause: unknown;
}> {}

/** emit 的 payload 未通过 Topic Schema 校验 */
export class EventPayloadInvalid extends Data.TaggedError('EventPayloadInvalid')<{
  topic: string;
  issue: string;
}> {}
