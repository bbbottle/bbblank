/**
 * playground —— devtools 的 Playground 面板：在浏览器中为 bbki.ng 开发插件。
 * 草稿按仓库结构保存在私有 Storage；运行时在 Worker 中以 TypeScript 6.0.3 编译，链接到页面已加载的模块，
 * 以 dev-<id> 经 Sideload 登记、经 PluginManager 安装，随即出现在 Plugins 面板中。
 * 从 Market 安装。草稿插件经 DevtoolsDeveloper 登记到 Plugins 面板的「可安装（仅开发者）」分组，不出现在 Market。
 */
import { definePlugin, Storage } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { Dom, PluginManager, Sideload } from "@bbblank/host-dom";
import {
  DevtoolsDeveloper,
  DevtoolsPanels,
  DevtoolsPluginId,
  panelSlot,
} from "../devtools/api";
import { PlaygroundPluginId } from "./api";
import { createCompiler } from "./compiler";
import { playgroundPanel } from "./panel";
import { createRunner } from "./runner";

const PANEL = "playground";

export const playground = definePlugin({
  manifest: {
    id: PlaygroundPluginId,
    name: "Devtools Playground",
    version: "0.1.0" as SemVer,
    // devtools.developer 服务自 devtools 1.1.0 起提供
    dependencies: [{ id: DevtoolsPluginId, range: "^1.1.0" }],
  },
  capabilities: [Dom, Storage, Sideload, PluginManager],
  setup: async (api) => {
    const { dom, storage, sideload, pluginManager } = api.caps;
    const [panels, developer] = await Promise.all([
      api.services.get(DevtoolsPanels),
      api.services.get(DevtoolsDeveloper),
    ]);
    const compiler = createCompiler();
    const panel = playgroundPanel({
      storage,
      pm: pluginManager,
      runner: createRunner(compiler, sideload, pluginManager),
      compiler,
      developer,
    });

    api.lifecycle.addCleanup(() => {
      panel.dispose();
      compiler.dispose();
    });
    // 启动即读取草稿并登记到 Plugins 面板，无需先打开 Playground
    await panel.init();
    // 排在 Sources（15）之后
    api.lifecycle.addCleanup(
      panels.register({ id: PANEL, title: "Playground", order: 17 }),
    );
    api.lifecycle.addCleanup(
      panels.onShown(PANEL, (shown) => shown && panel.update("shown")),
    );
    dom.mount(panelSlot(PANEL), (host) => {
      host.append(panel.el);
      return () => panel.el.remove();
    });
  },
});
