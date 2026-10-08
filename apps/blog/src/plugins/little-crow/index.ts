/**
 * little-crow —— 在 Market 中安装的插件：为正文「和小乌鸦」添加笔记「小乌鸦合集」（指向小乌鸦合集页面的链接），
 * 并经 content.routes 提供该页面（内容挂入 routeSlot），文章经 content.posts 读取。停用 / 卸载时笔记与路由一并移除；若正处于该页面，content 导航回 /。
 * 笔记含链接、页面含远程 HTML，均需经 Html capability（write）生成 TrustedHtml。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { Dom, Html } from "@bbblank/host-dom";
import { ContentNoteService, ContentPluginId, ContentPosts, ContentRoutes, routeSlot } from "../content/api";
import type { Note } from "../shell/api";
import { LITTLE_CROW_ROUTE, LittleCrowPluginId } from "./api";
import { renderLittleCrow } from "./page";

const NOTE_ID = 5;

export const littleCrow = definePlugin({
  manifest: {
    id: LittleCrowPluginId,
    name: "Little Crow",
    version: "1.1.0" as SemVer,
    // content.posts 自 content 1.2.0 起提供
    dependencies: [{ id: ContentPluginId, range: "^1.2.0" }],
  },
  capabilities: [Html, Dom],
  setup: async (api) => {
    const { html, dom } = api.caps;
    const [notes, routes, posts] = await Promise.all([
      api.services.get(ContentNoteService),
      api.services.get(ContentRoutes),
      api.services.get(ContentPosts),
    ]);

    api.lifecycle.addCleanup(routes.register(LITTLE_CROW_ROUTE));
    dom.mount(routeSlot(LITTLE_CROW_ROUTE), (host) => renderLittleCrow(host, html, posts));

    const note: Readonly<Note> = {
      id: NOTE_ID,
      content: html.trust(`<a href="${LITTLE_CROW_ROUTE}" data-link>小乌鸦合集</a>`),
    };
    notes.upsertNote({ contentStr: "和小乌鸦", note });
    return () => notes.delNote(note.id);
  },
});
