/**
 * devtools-network —— Network 面板：活动流中的生命周期阶段（加载 / 启用 / 停止）耗时与瀑布图。
 * 经 DevtoolsPanels 登记标签，内容经 Dom.mount 挂入 panelSlot（契约见 ../devtools/api）。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { Dom, PluginManager } from "@bbblank/host-dom";
import { DevtoolsModel, frameScheduler } from "@bbblank/devtools-ui";
import { DevtoolsPanels, DevtoolsPluginId, panelSlot } from "../devtools/api";
import { DevtoolsNetworkPluginId } from "./api";
import { networkPanel } from "./panel";

const PANEL = "network";

export const devtoolsNetwork = definePlugin({
  manifest: {
    id: DevtoolsNetworkPluginId,
    name: "DevTools Network",
    version: "1.0.0" as SemVer,
    dependencies: [{ id: DevtoolsPluginId, range: "^1.0.0" }],
  },
  capabilities: [Dom, PluginManager],
  setup: async (api) => {
    const { dom, pluginManager } = api.caps;
    const panels = await api.services.get(DevtoolsPanels);
    const model = new DevtoolsModel(pluginManager, { activity: true });
    const panel = networkPanel(model);

    // 只在可见时渲染；同一帧内的多次变化合并
    let shown = false;
    const pending = new Set<"plugins" | "activity">();
    const flush = frameScheduler(() => {
      if (shown) for (const what of pending) panel.update(what);
      pending.clear();
    });
    api.lifecycle.addCleanup(
      model.onChange((what) => {
        pending.add(what);
        flush();
      }),
    );

    api.lifecycle.addCleanup(panels.register({ id: PANEL, title: "Network", order: 20 }));
    api.lifecycle.addCleanup(
      panels.onShown(PANEL, (s) => {
        shown = s;
        if (s) panel.update("shown");
      }),
    );
    dom.mount(panelSlot(PANEL), (host) => {
      host.append(panel.el);
      return () => panel.el.remove();
    });
  },
});
