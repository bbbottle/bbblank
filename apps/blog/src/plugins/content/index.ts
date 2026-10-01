/**
 * content —— 按当前路由把页面渲染进 `main` slot（React 只在本插件内部使用），
 * 并注册 `content.selection` 服务（契约见 ./api）：外部插件可读取/订阅正文中的选中文本。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { Dom, Router } from "@bbblank/host-dom";
import { ShellSlots } from "../shell/api";
import { renderPages } from "./renderer";
import { ContentPluginId } from "./api";

export const content = definePlugin({
  manifest: {
    id: ContentPluginId,
    name: "Content",
    version: "1.0.0" as SemVer,
  },
  capabilities: [Dom, Router],
  setup: (api) => {
    const { dom, router } = api.caps;

    dom.mount(ShellSlots.main, (host) => {
      const stopRender = renderPages(host, router);
      return async () => {
        await stopRender();
      };
    });
  },
});
