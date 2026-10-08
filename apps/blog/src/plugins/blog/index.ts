/**
 * blog —— 按需安装的插件：提供 /blog 页面（经 content.routes 登记、内容挂入 routeSlot），
 * 并为正文添加指向 /blog 的笔记。停用/卸载时笔记与路由一并移除；若正处于 /blog，content 导航回 /。
 * 笔记含链接、页面含远程 HTML，均需经 Html capability（write）生成 TrustedHtml。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { Dom, Html } from "@bbblank/host-dom";
import {
  ContentNoteService,
  ContentPluginId,
  ContentPosts,
  ContentRoutes,
  routeSlot,
} from "../content/api";
import type { Note } from "../shell/api";
import { BlogPluginId } from "./api";
import { renderBlog } from "./page";

const ROUTE = "/blog";

export const blog = definePlugin({
  manifest: {
    id: BlogPluginId,
    name: "Blog",
    version: "1.2.0" as SemVer,
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

    api.lifecycle.addCleanup(routes.register(ROUTE));
    dom.mount(routeSlot(ROUTE), (host) => renderBlog(host, html, posts));

    const note: Readonly<Note> = {
      id: 2,
      content: html.trust(`<a href="${ROUTE}" data-link>blog</a>`),
    };
    notes.upsertNote({ contentStr: "组装好的文字", note });
    return () => notes.delNote(note.id);
  },
});
