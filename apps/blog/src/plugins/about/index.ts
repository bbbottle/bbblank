/**
 * about —— 按需安装的插件：启用时通过 ContentNoteService 为正文添加作者笔记，停用/卸载时移除。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { ContentNoteService, ContentPluginId } from "../content/api";
import { AboutPluginId } from "./api";

export const about = definePlugin({
  manifest: {
    id: AboutPluginId,
    name: "About",
    version: "1.0.0" as SemVer,
    dependencies: [{ id: ContentPluginId, range: "^1.0.0" }],
  },
  capabilities: [],
  setup: async (api) => {
    const notes = await api.services.get(ContentNoteService);
    const note = { id: 1, content: "1993. 程序员." };
    notes.upsertNote({ contentStr: "十年前的我", note });
    return () => notes.delNote(note.id);
  },
});
