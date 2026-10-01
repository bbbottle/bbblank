/**
 * plugin-manager —— 管理其他插件的插件：订阅页面事件，经 PluginManager capability 安装/卸载插件。
 * 当前规则：点击 content 的方块 → 安装 about（已安装时 install 只确保其启用，重复点击无副作用）。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { PluginManager } from "@bbblank/host-dom";
import { SquareClickTopic } from "../content/api";
import { AboutPluginId } from "../about/api";
import { PluginManagerPluginId } from "./api";

export const pluginManager = definePlugin({
  manifest: {
    id: PluginManagerPluginId,
    name: "Plugin Manager",
    version: "1.0.0" as SemVer,
  },
  capabilities: [PluginManager],
  setup: (api) => {
    const { pluginManager } = api.caps;
    api.events.on(SquareClickTopic, () => pluginManager.install(AboutPluginId));
  },
});
