/**
 * 契约错误 —— 设计文档 §3.4
 * 出现在插件可见类型面上的错误归 sdk；kernel 的 PluginError 联合包含它。
 */
import { Data } from 'effect';
import type { PluginID } from './manifest.js';

/** 插件 setup / layer 可抛出的错误 */
export class PluginSetupError extends Data.TaggedError('PluginSetupError')<{
  id: PluginID;
  cause: unknown;
}> {}
