/**
 * plugin-manager —— 管理其他插件的插件：订阅页面事件，经 PluginManager capability 安装/卸载插件。
 * 点击 content 的方块：
 * 1. devtools 已安装（任意状态）→ 确保其启用并打开面板；
 * 2. 否则 about、blog、weather 均已启用 → 安装 devtools 并打开面板；
 * 3. 否则安装这批插件（已安装时 install 只确保其启用）。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { PluginManager } from "@bbblank/host-dom";
import { SquareClickTopic } from "../content/api";
import { AboutPluginId } from "../about/api";
// import { BlogPluginId } from "../blog/api";
import { DevtoolsOpenTopic, DevtoolsPluginId } from "../devtools/api";
// import { WeatherPluginId } from "../weather/api";
import { PluginManagerPluginId } from "./api";

const batch = [AboutPluginId];

export const pluginManager = definePlugin({
  manifest: {
    id: PluginManagerPluginId,
    name: "Plugin Manager",
    version: "1.0.0" as SemVer,
  },
  capabilities: [PluginManager],
  setup: (api) => {
    const { pluginManager } = api.caps;
    api.events.on(SquareClickTopic, async () => {
      const status = new Map(pluginManager.list().map((p) => [p.id, p.status]));
      const batchReady = batch.every((id) => status.get(id) === "enabled");
      if (!status.has(DevtoolsPluginId) && !batchReady) {
        await Promise.all(batch.map((id) => pluginManager.install(id)));
        return;
      }
      // install 返回时 devtools 的 setup 已完成、已订阅打开事件
      await pluginManager.install(DevtoolsPluginId);
      api.events.emit(DevtoolsOpenTopic, {});
    });
  },
});
