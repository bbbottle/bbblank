/**
 * devtools 对外契约：插件 id、打开面板的事件，以及面板插件接入用的服务与插槽。
 *
 * 面板插件接入（声明依赖 devtools ^1.0.0）：
 *   const panels = await api.services.get(DevtoolsPanels);
 *   api.lifecycle.addCleanup(panels.register({ id: "console", title: "Console", order: 10 }));
 *   api.caps.dom.mount(panelSlot("console"), (host) => render(host));
 * 插槽位于 devtools 的 Shadow Root 内：面板内容直接使用 @bbblank/devtools-ui 的组件与样式。
 */
import { defineService, defineTopic } from "@bbblank/sdk";
import type { Cleanup, PluginID } from "@bbblank/sdk";
import { defineSlot } from "@bbblank/host-dom";
import type { Slot } from "@bbblank/host-dom";
import { Schema } from "effect";

export const DevtoolsPluginId = "devtools" as PluginID;

/** 请求打开 devtools 面板；devtools 未启用时无人订阅，事件被忽略 */
export const DevtoolsOpenTopic = defineTopic("devtools.open", Schema.Struct({}));

export interface PanelSpec {
  /** 面板 id，同时决定专属插槽 panelSlot(id)；内置面板占用 "plugins" 与 "market" */
  readonly id: string;
  readonly title: string;
  /** 标签顺序，升序；内置 Plugins 为 0、Market 为 1000，缺省 100 */
  readonly order?: number;
}

export interface DevtoolsPanelsService {
  /** 出现标签，并提供插槽 panelSlot(id)；返回的 Cleanup 移除标签与插槽。id 重复时抛错 */
  register(spec: PanelSpec): Cleanup;
  /** 标签上的警告计数；0 隐藏 */
  setBadge(id: string, count: number): void;
  /** 面板可见性变化（选中且抽屉打开为可见）；注册时立即以当前状态回调一次 */
  onShown(id: string, cb: (shown: boolean) => void): Cleanup;
}

export const DevtoolsPanels = defineService<DevtoolsPanelsService>("devtools.panels");

/** 面板插件经 Dom.mount 挂载内容的插槽 */
export const panelSlot = (id: string): Slot => defineSlot(`devtools.panel.${id}`);
