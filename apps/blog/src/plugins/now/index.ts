/**
 * now —— 按需安装的插件（不随方块点击安装，需在 devtools 的 Market 中安装）：
 * 为正文「现在？」添加笔记，内容为本地时间 YYYY-MM-DD HH:mm:ss，每秒更新；停用/卸载时移除。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { ContentNoteService, ContentPluginId } from "../content/api";
import { NowPluginId } from "./api";

const NOTE_ID = 4;

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export const now = definePlugin({
  manifest: {
    id: NowPluginId,
    name: "Now",
    version: "1.0.0" as SemVer,
    dependencies: [{ id: ContentPluginId, range: "^1.0.0" }],
  },
  capabilities: [],
  setup: async (api) => {
    const notes = await api.services.get(ContentNoteService);
    let timer: ReturnType<typeof setTimeout> | undefined;

    // 对齐到整秒再更新，显示的秒数与系统时钟同步跳变，而不是落后最多 1 秒
    const tick = () => {
      const d = new Date();
      notes.upsertNote({ contentStr: "现在？", note: { id: NOTE_ID, content: clock(d) } });
      timer = setTimeout(tick, 1000 - d.getMilliseconds());
    };
    tick();

    return () => {
      clearTimeout(timer);
      notes.delNote(NOTE_ID);
    };
  },
});
