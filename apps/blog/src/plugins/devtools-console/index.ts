/**
 * devtools-console —— Console 面板：活动流中的事件。发布为普通消息，背压丢弃为警告，校验失败与生命周期失败为错误；警告与错误数显示在标签上。
 * 经 DevtoolsPanels 登记标签，内容经 Dom.mount 挂入 panelSlot（契约见 ../devtools/api）。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { Dom, PluginManager } from "@bbblank/host-dom";
import { DevtoolsModel, frameScheduler } from "@bbblank/devtools-ui";
import { DevtoolsPanels, DevtoolsPluginId, panelSlot } from "../devtools/api";
import { DevtoolsConsolePluginId } from "./api";
import { consolePanel, issueCount } from "./panel";

const PANEL = "console";

export const devtoolsConsole = definePlugin({
  manifest: {
    id: DevtoolsConsolePluginId,
    name: "DevTools Console",
    version: "1.0.0" as SemVer,
    dependencies: [{ id: DevtoolsPluginId, range: "^1.0.0" }],
  },
  capabilities: [Dom, PluginManager],
  setup: async (api) => {
    const { dom, pluginManager } = api.caps;
    const panels = await api.services.get(DevtoolsPanels);
    const model = new DevtoolsModel(pluginManager, { activity: true });
    const panel = consolePanel(model);

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
    // 警告与错误数显示在标签上（与面板是否可见无关）
    const badge = () => panels.setBadge(PANEL, issueCount(model.activity));
    badge();
    api.lifecycle.addCleanup(model.onChange(badge));

    api.lifecycle.addCleanup(panels.register({ id: PANEL, title: "Console", order: 10 }));
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
