/**
 * PermissionPolicy —— 设计文档 §10.5，内核内部服务（Tag 不在 sdk）。
 * 有效授权 = manifest 申请 ∩ 宿主上限；按 capability 的 read/write + 按服务 key 的 provide。
 */
import { Context, Effect, Layer } from 'effect';
import type { AccessLevel, PluginManifest } from '@bbblank/sdk';
import { PermissionDenied } from './errors.js';

export interface PermissionPolicyShape {
  /** 激活闸门（宿主策略挂钩点，如插件白名单） */
  readonly check: (manifest: PluginManifest) => Effect.Effect<void, PermissionDenied>;
  /** 对某 capability 的有效授权；undefined = 拒绝 */
  readonly access: (manifest: PluginManifest, capability: string) => AccessLevel | undefined;
  /** 是否允许提供（register）某服务 */
  readonly canProvide: (manifest: PluginManifest, serviceKey: string) => boolean;
}

/** 宿主给某插件的上限；access 中缺失的 capability 视为拒绝 */
export interface PermissionLimits {
  readonly access?: Readonly<Record<string, AccessLevel>>;
  readonly provide?: ReadonlyArray<string>;
}

const rank = { read: 0, write: 1 } as const;
export const accessSatisfies = (granted: AccessLevel, required: AccessLevel) =>
  rank[granted] >= rank[required];

const requested = (m: PluginManifest, cap: string): AccessLevel => m.access?.[cap] ?? 'write';
const listed = (list: ReadonlyArray<string> | undefined, key: string) =>
  !!list && (list.includes('*') || list.includes(key));

export class PermissionPolicy extends Context.Service<PermissionPolicy, PermissionPolicyShape>()(
  '@kernel/PermissionPolicy'
) {
  /** 信任 manifest 申请 */
  static readonly permissive = Layer.succeed(
    PermissionPolicy,
    PermissionPolicy.of({
      check: () => Effect.void,
      access: requested,
      canProvide: (m, key) => listed(m.services?.provide, key),
    })
  );

  /** 宿主按插件给出上限；limitsFor 返回 undefined 的插件不允许激活 */
  static readonly restrict = (limitsFor: (m: PluginManifest) => PermissionLimits | undefined) =>
    Layer.succeed(
      PermissionPolicy,
      PermissionPolicy.of({
        check: m =>
          limitsFor(m)
            ? Effect.void
            : Effect.fail(new PermissionDenied({ id: m.id, required: 'plugin:activate' })),
        access: (m, cap) => {
          const max = limitsFor(m)?.access?.[cap];
          if (!max) return undefined;
          const req = requested(m, cap);
          return accessSatisfies(max, req) ? req : max;
        },
        canProvide: (m, key) => listed(m.services?.provide, key) && listed(limitsFor(m)?.provide, key),
      })
    );
}
