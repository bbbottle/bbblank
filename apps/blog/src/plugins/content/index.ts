/**
 * content —— 按当前路由把页面渲染进 `main` slot（React 只在本插件内部使用），
 * 并注册 `content.noteService` 服务（契约见 ./api）：外部插件可为正文插入笔记，
 * 笔记标记渲染在正文中，内容通过 shell 的 FooterNote 服务写入脚注；
 * 以及 `content.routes` 服务：外部插件登记自己的页面路由，内容经 Dom.mount 挂入 routeSlot(path)。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { Dom, Router } from "@bbblank/host-dom";
import { FooterNote, ShellPluginId, ShellSlots } from "../shell/api";
import { renderPages } from "./renderer";
import {
  ContentNoteService,
  ContentPluginId,
  ContentRoutes,
  routeSlot,
} from "./api";
import { letter } from "./letter";
import { createContentNoteService } from "./note-service";
import { builtinPaths } from "./pages";
import { createRoutes } from "./routes";

export const content = definePlugin({
  manifest: {
    id: ContentPluginId,
    name: "Content",
    version: "1.1.1" as SemVer,
    // FooterNote 服务自 shell 1.1.0 起提供
    dependencies: [{ id: ShellPluginId, range: "^1.1.0" }],
    // 提供服务需要在 manifest 中声明（§10.5），否则 register 会抛 PermissionDenied
    services: { provide: [ContentNoteService.key, ContentRoutes.key] },
  },
  capabilities: [Dom, Router],
  setup: (api) => {
    const { dom, router } = api.caps;

    const noteService = createContentNoteService(letter, api.events, () =>
      api.services.get(FooterNote),
    );
    api.services.register(ContentNoteService, noteService);

    const routes = createRoutes(router, builtinPaths);
    api.services.register(ContentRoutes, routes.service);

    dom.mount(ShellSlots.main, (host) => {
      const stopRender = renderPages(host, router, {
        noteService,
        events: api.events,
        routes,
        provideRoute: (path, el) => dom.provideSlot(routeSlot(path), el),
      });
      return async () => {
        await stopRender();
      };
    });
  },
});
