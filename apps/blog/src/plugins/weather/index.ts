/**
 * weather —— 按需安装的插件：启用时查询长沙今日天气，为正文「长沙」添加笔记；停用/卸载时移除。
 * 乐观插入：先以占位内容写入笔记，查询在后台进行，完成后按同一 id 更新为天气或失败提示。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { ContentNoteService, ContentPluginId } from "../content/api";
import { WeatherPluginId } from "./api";
import { fetchTodayWeather } from "./forecast";

const NOTE_ID = 3;

export const weather = definePlugin({
  manifest: {
    id: WeatherPluginId,
    name: "Weather",
    version: "1.0.0" as SemVer,
    dependencies: [{ id: ContentPluginId, range: "^1.0.0" }],
  },
  capabilities: [],
  setup: async (api) => {
    const notes = await api.services.get(ContentNoteService);
    const ctrl = new AbortController();
    const show = (content: string) =>
      notes.upsertNote({ contentStr: "长沙", note: { id: NOTE_ID, content } });

    show("...");
    fetchTodayWeather(ctrl.signal).then(
      (content) => {
        if (!ctrl.signal.aborted) show(content);
      },
      (e: unknown) => {
        if (ctrl.signal.aborted) return;
        console.warn("[weather] forecast failed", e);
        notes.delNote(NOTE_ID);
      },
    );

    return () => {
      ctrl.abort();
      notes.delNote(NOTE_ID);
    };
  },
});
