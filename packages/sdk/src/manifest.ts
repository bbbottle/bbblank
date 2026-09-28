/**
 * 类型基石与 Manifest —— 设计文档 §2.1 / §3.1 / §10.3
 * 任何跨越动态 import() 的类型：先写 Schema，再 typeof X.Type 导出类型。
 */
import { Schema } from 'effect';
import { isValidRange } from './semver.js';

/** 当前 sdk 契约版本；definePlugin 写入 manifest.sdkVersion，内核据此做兼容窗口检查 */
export const SDK_VERSION = '0.1.0';
/** 当前 manifest 结构版本；更早的版本由内核迁移链升级 */
export const MANIFEST_SCHEMA_VERSION = 2;

export const PluginID = Schema.String.pipe(Schema.brand('PluginID'));
export type PluginID = typeof PluginID.Type;

export const SemVer = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\d+\.\d+\.\d+/)),
  Schema.brand('SemVer')
);
export type SemVer = typeof SemVer.Type;

export const VersionRange = Schema.String.pipe(
  Schema.check(Schema.makeFilter((s: string) => isValidRange(s), { expected: 'a semver range' }))
);
export type VersionRange = typeof VersionRange.Type;

export const Dependency = Schema.Struct({ id: PluginID, range: VersionRange });
export type Dependency = typeof Dependency.Type;

export const AccessLevel = Schema.Literals(['read', 'write']);
export type AccessLevel = typeof AccessLevel.Type;

export const PluginManifest = Schema.Struct({
  schemaVersion: Schema.Literal(MANIFEST_SCHEMA_VERSION),
  id: PluginID,
  name: Schema.String,
  version: SemVer,
  sdkVersion: Schema.optionalKey(SemVer),
  dependencies: Schema.optionalKey(Schema.Array(Dependency)),
  /** 运行时校验用；类型级信息在 definePlugin 的泛型里 */
  capabilities: Schema.Array(Schema.String),
  /** 每个 capability 申请的访问级别，缺省 "write" */
  access: Schema.optionalKey(Schema.Record(Schema.String, AccessLevel)),
  /** 允许提供的服务 key；"*" 表示任意 */
  services: Schema.optionalKey(
    Schema.Struct({ provide: Schema.optionalKey(Schema.Array(Schema.String)) })
  ),
});
export type PluginManifest = typeof PluginManifest.Type;

/** 插件作者手写的 manifest 部分；access 的键被声明的 capability id 约束 */
export type ManifestInput<CapId extends string = string> = Omit<
  PluginManifest,
  'schemaVersion' | 'sdkVersion' | 'capabilities' | 'access'
> & {
  readonly sdkVersion?: SemVer;
  readonly access?: { readonly [K in CapId]?: AccessLevel };
};

/**
 * 由插件模块合成完整 manifest：schemaVersion 缺省当前版本，capabilities 元组的 id 填入。
 * 结果未经校验（旧 schemaVersion 的模块也走这里），内核会先迁移再解码。
 */
export const manifestOf = (m: {
  readonly manifest: ManifestInput<any>;
  readonly capabilities: ReadonlyArray<{ readonly id: string }>;
}): PluginManifest =>
  ({
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    ...m.manifest,
    capabilities: m.capabilities.map(c => c.id),
  }) as PluginManifest;
