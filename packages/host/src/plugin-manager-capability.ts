/**
 * PluginManagerCapability —— 让被授权的插件安装/卸载其他插件。
 * 写：install / uninstall（需 write 授权并写审计）。插件不能卸载自身。
 */
import { Effect, Layer } from 'effect';
import { defineCapability } from '@bbblank/sdk';
import type { PluginID } from '@bbblank/sdk';
import type { KernelView } from '@bbblank/kernel';

export interface PluginManagerShape {
  readonly install: (id: PluginID) => Effect.Effect<void, unknown>;
  readonly uninstall: (id: PluginID) => Effect.Effect<void, unknown>;
}

export interface PluginManagerFacade {
  /** 已安装时仅确保其处于启用状态 */
  install(id: PluginID): Promise<void>;
  uninstall(id: PluginID): Promise<void>;
}

export const PluginManager = defineCapability<'pluginManager', PluginManagerShape, PluginManagerFacade>(
  'pluginManager',
  (s, ctx) => ({
    install: id => {
      ctx.require('write');
      ctx.audit('plugin:install', id);
      return ctx.run(s.install(id));
    },
    uninstall: id => {
      ctx.require('write');
      if (id === ctx.pluginId) return Promise.reject(new Error(`plugin ${id} cannot uninstall itself`));
      ctx.audit('plugin:uninstall', id);
      return ctx.run(s.uninstall(id));
    },
  })
);

/** capabilityLayer 先于 kernel 构造，故以 getter 延迟取得 KernelView */
export const PluginManagerLive = (view: () => KernelView) =>
  Layer.succeed(PluginManager.tag, {
    install: id => Effect.tryPromise({ try: () => view().install(id), catch: e => e }),
    uninstall: id => Effect.tryPromise({ try: () => view().uninstall(id), catch: e => e }),
  });
