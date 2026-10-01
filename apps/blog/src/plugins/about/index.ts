/**
 * about —— 按需安装的插件：启用时通过 ContentNoteService 为正文添加作者笔记，停用/卸载时移除。
 * 笔记中的「程序员」是 <abbr title="我编程">，带 data-action：脚注里点击它时，经 plugin-manager 打开 devtools。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { Html } from "@bbblank/host-dom";
import { ContentNoteService, ContentPluginId } from "../content/api";
import { DevtoolsRequestTopic } from "../plugin-manager/api";
import { FootnoteActionTopic } from "../shell/api";
import { AboutPluginId } from "./api";

const NOTE_ID = 1;
const OPEN_DEVTOOLS = "open-devtools";

export const about = definePlugin({
  manifest: {
    id: AboutPluginId,
    name: "About",
    version: "1.1.0" as SemVer,
    dependencies: [{ id: ContentPluginId, range: "^1.0.0" }],
  },
  capabilities: [Html],
  setup: async (api) => {
    const notes = await api.services.get(ContentNoteService);
    const note = {
      id: NOTE_ID,
      content: api.caps.html.trust(
        `1993. <abbr title="我编程" data-action="${OPEN_DEVTOOLS}" tabindex="0">程序员</abbr>.`,
      ),
    };
    notes.upsertNote({ contentStr: "十年前的我", note });

    api.events.on(FootnoteActionTopic, ({ noteId, action }) => {
      if (noteId === NOTE_ID && action === OPEN_DEVTOOLS) api.events.emit(DevtoolsRequestTopic, {});
    });

    return () => notes.delNote(note.id);
  },
});
