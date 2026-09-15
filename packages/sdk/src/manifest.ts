/**
 * 类型基石与 Manifest —— 设计文档 §2.1 / §3.1
 *
 * TODO：
 * - `PluginID = Schema.String.pipe(Schema.brand('PluginID'))`
 * - `SemVer = Schema.String.pipe(Schema.check(Schema.isPattern(/^\d+\.\d+\.\d+/)), Schema.brand('SemVer'))`
 * - `PluginPerm = Schema.Literals(['guest', 'admin'])`
 * - `PluginManifest`：`Schema.Struct`（id / version / perm / dependencies / capabilities? ——
 *   capabilities 由 `capabilities` 元组推导，manifest 字段可用 `Omit` 掉）
 */

import { Schema } from "effect";

export const PluginID = Schema.String.pipe(Schema.brand("PluginID"));
export type PluginID = typeof PluginID;

export const SemVer = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\d+\.\d+\.\d+/)),
  Schema.brand("SemVer"),
);
export type SemVer = typeof SemVer;

export const PluginPerm = Schema.Literals(["guest", "admin"]);
export type PluginPerm = typeof PluginPerm.Type;

export const PluginManifest = Schema.Struct({
  id: PluginID,
  name: Schema.String,
  version: SemVer,
  perm: Schema.optionalKey(PluginPerm),
  dependencies: Schema.optionalKey(Schema.Array(PluginID)),
  capabilities: Schema.Array(Schema.String),
});

export type PluginManifest = typeof PluginManifest;
