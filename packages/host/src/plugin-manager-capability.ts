/**
 * PluginManagerCapability —— 设计文档附录 A：让被授权的插件观察并管理其他插件。
 * 读：list / subscribe / observe（活动流，§10.10，写审计）/ diagnostics / catalog。
 * 写：install / uninstall / enable / disable（需 write 授权并写审计）。插件不能停用或卸载自身。
 */
import { Effect, Layer } from "effect";
import { defineCapability } from "@bbblank/sdk";
import type { Cleanup, Dependency, PluginID } from "@bbblank/sdk";
import type {
  Activity,
  Diagnostics,
  KernelView,
  PluginRecord,
  PluginStatus,
  SerializedError,
} from "@bbblank/kernel";

/** RegistrySnapshot 中一条记录的纯数据投影 */
export interface PluginInfo {
  readonly id: PluginID;
  /** 加载失败的插件没有 manifest，以下 manifest 字段取缺省值 */
  readonly name: string;
  readonly version?: string;
  readonly kind?: "plain" | "effect";
  readonly status: PluginStatus;
  readonly restarts: number;
  readonly lastError?: SerializedError;
  readonly dependencies: ReadonlyArray<Dependency>;
  readonly capabilities: ReadonlyArray<string>;
  readonly provides: ReadonlyArray<string>;
}

/** 宿主登记的可安装插件元数据（无需加载插件代码即可展示，市场的数据源） */
export interface PluginCatalogEntry {
  readonly id: PluginID;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
}

export interface PluginManagerShape {
  readonly list: Effect.Effect<ReadonlyArray<PluginInfo>>;
  readonly subscribe: (cb: () => void) => Effect.Effect<() => void>;
  readonly observe: (
    cb: (a: Activity) => void,
    replay: boolean,
  ) => Effect.Effect<() => void>;
  readonly diagnostics: Effect.Effect<Diagnostics, unknown>;
  readonly catalog: ReadonlyArray<PluginCatalogEntry>;
  readonly install: (id: PluginID) => Effect.Effect<void, unknown>;
  readonly uninstall: (id: PluginID) => Effect.Effect<void, unknown>;
  readonly enable: (id: PluginID) => Effect.Effect<void, unknown>;
  readonly disable: (id: PluginID) => Effect.Effect<void, unknown>;
}

export interface PluginManagerFacade {
  list(): ReadonlyArray<PluginInfo>;
  /** 插件状态变化时回调；随调用方插件的 Scope 释放 */
  subscribe(cb: () => void): Cleanup;
  /** 活动流；replay 时先回放内核缓冲区中的历史。随调用方插件的 Scope 释放 */
  observe(
    cb: (a: Activity) => void,
    opts?: { readonly replay?: boolean },
  ): Cleanup;
  diagnostics(): Promise<Diagnostics>;
  catalog(): ReadonlyArray<PluginCatalogEntry>;
  /** 已安装时仅确保其处于启用状态 */
  install(id: PluginID): Promise<void>;
  uninstall(id: PluginID): Promise<void>;
  enable(id: PluginID): Promise<void>;
  disable(id: PluginID): Promise<void>;
}

export const PluginManager = defineCapability<
  "pluginManager",
  PluginManagerShape,
  PluginManagerFacade
>("pluginManager", (s, ctx) => {
  /** 订阅类：注销函数登记为插件 Scope 的 finalizer，插件停用时自动注销 */
  const scopedSubscription = (subscribe: Effect.Effect<() => void>): Cleanup =>
    ctx.scoped(
      Effect.asVoid(
        Effect.acquireRelease(subscribe, (off) => Effect.sync(off)),
      ),
    );
  const write = (
    action: string,
    id: PluginID,
    eff: Effect.Effect<void, unknown>,
    self: boolean,
  ) => {
    ctx.require("write");
    if (!self && id === ctx.pluginId)
      return Promise.reject(new Error(`plugin ${id} cannot ${action} itself`));
    ctx.audit(action, id);
    return ctx.run(eff);
  };
  return {
    list: () => ctx.runSync(s.list),
    subscribe: (cb) => scopedSubscription(s.subscribe(ctx.guard(cb))),
    observe: (cb, opts) => {
      ctx.audit("observe");
      return scopedSubscription(
        s.observe(ctx.guard(cb), opts?.replay ?? false),
      );
    },
    diagnostics: () => ctx.run(s.diagnostics),
    catalog: () => s.catalog,
    install: (id) => write("install", id, s.install(id), true),
    enable: (id) => write("enable", id, s.enable(id), true),
    // 在自身回调中关闭自身 Scope 会自锁
    uninstall: (id) => write("uninstall", id, s.uninstall(id), false),
    disable: (id) => write("disable", id, s.disable(id), false),
  };
});

const toInfo = (r: PluginRecord): PluginInfo => ({
  id: r.id,
  name: r.manifest?.name ?? r.id,
  ...(r.manifest ? { version: r.manifest.version } : {}),
  ...(r.kind ? { kind: r.kind } : {}),
  status: r.status,
  restarts: r.restarts,
  ...(r.lastError ? { lastError: r.lastError } : {}),
  dependencies: r.manifest?.dependencies ?? [],
  capabilities: r.manifest?.capabilities ?? [],
  provides: r.manifest?.services?.provide ?? [],
});

/** capabilityLayer 先于 kernel 构造，故以 getter 延迟取得 KernelView */
export const PluginManagerLive = (
  view: () => KernelView,
  catalog: ReadonlyArray<PluginCatalogEntry> = [],
) => {
  const call = (f: () => Promise<void>) =>
    Effect.tryPromise({ try: f, catch: (e) => e });
  return Layer.succeed(PluginManager.tag, {
    list: Effect.sync(() =>
      [...view().snapshot().plugins.values()].map(toInfo),
    ),
    subscribe: (cb) => Effect.sync(() => view().subscribe(cb)),
    observe: (cb, replay) => Effect.sync(() => view().observe(cb, { replay })),
    diagnostics: Effect.tryPromise({
      try: () => view().diagnostics(),
      catch: (e) => e,
    }),
    catalog,
    install: (id) => call(() => view().install(id)),
    uninstall: (id) => call(() => view().uninstall(id)),
    enable: (id) => call(() => view().enable(id)),
    disable: (id) => call(() => view().disable(id)),
  });
};
