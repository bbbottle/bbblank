/**
 * devtools-sources —— Sources 面板：浏览 GitHub 仓库中 apps/blog 的源码（固定到构建所对应的提交），
 * 语法着色、行号、折叠与 Chrome DevTools 的 Sources 面板一致（CodeMirror 6）。
 * 不随 devtools 缺省安装，需在 Market 中安装。
 * 经 DevtoolsPanels 登记标签，内容经 Dom.mount 挂入 panelSlot（契约见 ../devtools/api）。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { Dom } from "@bbblank/host-dom";
import { DevtoolsPanels, DevtoolsPluginId, panelSlot } from "../devtools/api";
import { DevtoolsSourcesPluginId } from "./api";
import { sourcesPanel } from "./panel";

const PANEL = "sources";

export const devtoolsSources = definePlugin({
  manifest: {
    id: DevtoolsSourcesPluginId,
    name: "DevTools Sources",
    version: "1.0.0" as SemVer,
    dependencies: [{ id: DevtoolsPluginId, range: "^1.0.0" }],
  },
  capabilities: [Dom],
  setup: async (api) => {
    const panels = await api.services.get(DevtoolsPanels);
    const panel = sourcesPanel();

    // Chrome 的标签顺序：Elements、Console、Sources、Network
    api.lifecycle.addCleanup(panels.register({ id: PANEL, title: "Sources", order: 15 }));
    api.lifecycle.addCleanup(panels.onShown(PANEL, (shown) => shown && panel.update("shown")));
    api.caps.dom.mount(panelSlot(PANEL), (host) => {
      host.append(panel.el);
      return () => panel.el.remove();
    });
  },
});
