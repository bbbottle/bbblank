/**
 * 插件错误联合 —— 设计文档 §4.1 / §10
 * 插件可见的契约错误（PluginSetupError / PermissionDenied / StorageError / EventPayloadInvalid）
 * 定义在 sdk，此处 re-export 并纳入联合。
 */
import { Cause, Data } from 'effect';
import { EventPayloadInvalid, PermissionDenied, PluginSetupError, StorageError } from '@bbblank/sdk';
import type { PluginID } from '@bbblank/sdk';

export { EventPayloadInvalid, PermissionDenied, PluginSetupError, StorageError };

export class PluginNotFound extends Data.TaggedError('PluginNotFound')<{ id: PluginID }> {}
export class PluginLoadError extends Data.TaggedError('PluginLoadError')<{
  id: PluginID;
  cause: unknown;
}> {}
export class ManifestInvalid extends Data.TaggedError('ManifestInvalid')<{
  id: string;
  issue: string;
}> {}
export class CapabilityMissing extends Data.TaggedError('CapabilityMissing')<{
  id: PluginID;
  capability: string;
}> {}
export class DependencyMissing extends Data.TaggedError('DependencyMissing')<{
  id: PluginID;
  missing: ReadonlyArray<PluginID>;
}> {}
export class DependencyVersionMismatch extends Data.TaggedError('DependencyVersionMismatch')<{
  id: PluginID;
  dependency: PluginID;
  range: string;
  actual: string;
}> {}
export class DependencyCycle extends Data.TaggedError('DependencyCycle')<{
  cycle: ReadonlyArray<PluginID>;
}> {}
export class DependentsActive extends Data.TaggedError('DependentsActive')<{
  id: PluginID;
  dependents: ReadonlyArray<PluginID>;
}> {}
export class SdkIncompatible extends Data.TaggedError('SdkIncompatible')<{
  id: PluginID;
  required: string;
  actual: string;
}> {}
export class ConfigInvalid extends Data.TaggedError('ConfigInvalid')<{
  id: PluginID;
  issue: string;
}> {}

export type PluginError =
  | PluginNotFound
  | PluginLoadError
  | ManifestInvalid
  | PluginSetupError
  | PermissionDenied
  | CapabilityMissing
  | DependencyMissing
  | DependencyVersionMismatch
  | DependencyCycle
  | DependentsActive
  | SdkIncompatible
  | ConfigInvalid
  | StorageError;

/** 可序列化的错误摘要：进入 PluginRecord.lastError 与诊断导出 */
export interface SerializedError {
  readonly tag: string;
  readonly message: string;
}

const safeJson = (v: unknown): string => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

export const describeError = (e: unknown): SerializedError => {
  if (Cause.isCause(e)) return describeError(Cause.squash(e));
  if (typeof e === 'object' && e !== null && '_tag' in e) {
    const { _tag, cause, ...rest } = e as Record<string, unknown>;
    const detail = Object.keys(rest).length > 0 ? safeJson(rest) : '';
    const inner = cause === undefined ? '' : describeError(cause).message;
    return { tag: String(_tag), message: [detail, inner].filter(Boolean).join(': ') };
  }
  if (e instanceof Error) return { tag: e.name, message: e.message };
  return { tag: 'Unknown', message: typeof e === 'string' ? e : safeJson(e) };
};
