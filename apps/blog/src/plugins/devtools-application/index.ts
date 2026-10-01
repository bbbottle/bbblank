/**
 * devtools-application —— Application 面板：安装记录（实时）、审计日志与事件统计（来自诊断导出，按需刷新）。
 * 经 DevtoolsPanels 登记标签，内容经 Dom.mount 挂入 panelSlot（契约见 ../devtools/api）。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { Dom, PluginManager } from "@bbblank/host-dom";
import { DevtoolsModel, frameScheduler } from "@bbblank/devtools-ui";
import { DevtoolsPanels, DevtoolsPluginId, panelSlot } from "../devtools/api";
import { DevtoolsApplicationPluginId } from "./api";
import { applicationPanel } from "./panel";

const PANEL = "application";

export const devtoolsApplication = definePlugin({
  manifest: {
    id: DevtoolsApplicationPluginId,
    name: "DevTools Application",
    version: "1.0.0" as SemVer,
    dependencies: [{ id: DevtoolsPluginId, range: "^1.0.0" }],
  },
  capabilities: [Dom, PluginManager],
  setup: async (api) => {
    const { dom, pluginManager } = api.caps;
    const panels = await api.services.get(DevtoolsPanels);
    const model = new DevtoolsModel(pluginManager);
    const panel = applicationPanel(model);

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

    api.lifecycle.addCleanup(panels.register({ id: PANEL, title: "Application", order: 30 }));
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
