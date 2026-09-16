/**
 * 类型基石与 Manifest —— 设计文档 §2.1 / §3.1
 * 任何跨越动态 import() 的类型：先写 Schema，再 typeof X.Type 导出类型。
 */
<<<<<<< HEAD

import { Schema } from "effect";

export const PluginID = Schema.String.pipe(Schema.brand("PluginID"));
export type PluginID = typeof PluginID;

export const SemVer = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\d+\.\d+\.\d+/)),
  Schema.brand("SemVer"),
);
export type SemVer = typeof SemVer;

export const PluginPerm = Schema.Literals(["guest", "admin"]);
=======
import { Schema } from 'effect';

export const PluginID = Schema.String.pipe(Schema.brand('PluginID'));
export type PluginID = typeof PluginID.Type;

export const SemVer = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\d+\.\d+\.\d+/)),
  Schema.brand('SemVer')
);
export type SemVer = typeof SemVer.Type;

export const PluginPerm = Schema.Literals(['guest', 'admin']);
>>>>>>> 439e5ed0047a57aee2d667b2aed6184834693bcb
export type PluginPerm = typeof PluginPerm.Type;

export const PluginManifest = Schema.Struct({
  id: PluginID,
  name: Schema.String,
  version: SemVer,
<<<<<<< HEAD
  perm: Schema.optionalKey(PluginPerm),
  dependencies: Schema.optionalKey(Schema.Array(PluginID)),
  capabilities: Schema.Array(Schema.String),
});

export type PluginManifest = typeof PluginManifest;
=======
  perm: Schema.optionalKey(PluginPerm), // 缺省视为 "guest"
  dependencies: Schema.optionalKey(Schema.Array(PluginID)),
  /** 运行时校验用；类型级信息在 definePlugin 的泛型里 */
  capabilities: Schema.Array(Schema.String),
});
export type PluginManifest = typeof PluginManifest.Type;

/** 由插件模块合成完整 manifest：capabilities 元组的 id 填入 */
export const manifestOf = (
  m: { manifest: Omit<PluginManifest, 'capabilities'>; capabilities: ReadonlyArray<{ id: string }> }
): PluginManifest => ({
  ...m.manifest,
  capabilities: m.capabilities.map(c => c.id),
});
>>>>>>> 439e5ed0047a57aee2d667b2aed6184834693bcb
