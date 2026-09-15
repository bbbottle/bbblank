/**
 * PermissionPolicy —— 设计文档 §4.3，内核内部服务（Tag 不在 sdk）。
 * 策略式权限：默认实现只提供 permOf/requireAdmin；宿主可替换整个 Layer 以收紧策略
 * （如 admin 插件白名单）。
 */
import { Context, Effect, Layer } from 'effect';
import type { PluginManifest, PluginPerm } from '@bbblank/sdk';
import { PermissionDenied } from './errors.js';

export interface PermissionPolicyShape {
  /** manifest 权限声明 + 本次激活的整体校验（宿主策略挂钩点） */
  readonly check: (manifest: PluginManifest) => Effect.Effect<void, PermissionDenied>;
  /** 需要 admin 权限的操作前置断言 */
  readonly requireAdmin: (manifest: PluginManifest) => Effect.Effect<void, PermissionDenied>;
  readonly permOf: (manifest: PluginManifest) => PluginPerm;
}

export class PermissionPolicy extends Context.Service<PermissionPolicy, PermissionPolicyShape>()(
  '@kernel/PermissionPolicy'
) {
  static readonly permissive = Layer.succeed(
    PermissionPolicy,
    PermissionPolicy.of({
      check: () => Effect.void,
      requireAdmin: manifest =>
        manifest.perm === 'admin'
          ? Effect.void
          : Effect.fail(new PermissionDenied({ id: manifest.id, required: 'admin' })),
      permOf: manifest => manifest.perm ?? 'guest',
    })
  );
}
