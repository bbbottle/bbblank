/**
 * blog —— 按需安装的插件：启用时为正文添加指向 /blog 的笔记，停用/卸载时移除。
 * 笔记含链接，需经 Html capability（write）生成 TrustedHtml，否则脚注只会按纯文本渲染。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { Html } from "@bbblank/host-dom";
import { ContentNoteService, ContentPluginId } from "../content/api";
import { BlogPluginId } from "./api";
import { Note } from "../shell/api";

export const blog = definePlugin({
  manifest: {
    id: BlogPluginId,
    name: "Blog",
    version: "1.0.0" as SemVer,
    dependencies: [{ id: ContentPluginId, range: "^1.0.0" }],
  },
  capabilities: [Html],
  setup: async (api) => {
    const notes = await api.services.get(ContentNoteService);
    const note: Readonly<Note> = {
      id: 2,
      content: api.caps.html.trust('<a href="/blog" data-link>blog</a>'),
    };
    notes.upsertNote({ contentStr: "组装好的文字", note });
    return () => notes.delNote(note.id);
  },
});
