/**
 * content 对外契约：插件 id、`content.noteService`、`content.routes` 服务与事件（只有类型与 Token，不含实现）。
 * 其他插件只 import 本文件，不依赖 content 的实现代码。
 */
import { defineService, defineTopic } from "@bbblank/sdk";
import type { Cleanup, PluginID } from "@bbblank/sdk";
import { defineSlot } from "@bbblank/host-dom";
import type { Slot } from "@bbblank/host-dom";
import { Schema } from "effect";
import { NoteSchema } from "../shell/api";

/** 供依赖声明、`[data-plugin]` 选择器使用 */
export const ContentPluginId = "content" as PluginID;

export const LetterSchema = Schema.Struct({
  openlings: Schema.String,
  body: Schema.String,
  author: Schema.String,
  date: Schema.String,
  address: Schema.String,
});

export const ContentNodeSchema = Schema.Struct({
  contentStr: Schema.String,
  note: NoteSchema,
});

export type ContentNote = Schema.Schema.Type<typeof ContentNodeSchema>;

export type Letter = Schema.Schema.Type<typeof LetterSchema>;

export interface IContentNoteService {
  /** 原始信件（不含笔记标记） */
  getLetter: () => Letter;
  listNotes: () => ReadonlyArray<ContentNote>;
  /** 按 note.id 新增或替换：正文在 contentStr 之后标注 `[id]`，并同步到 shell 的脚注 */
  upsertNote: (contentNote: ContentNote) => void;
  /** 移除正文标记与对应脚注；id 不存在时无操作 */
  delNote: (id: number) => void;
}

export const ContentNoteService = defineService<IContentNoteService>(
  "content.noteService",
);

/**
 * 页面路由由提供页面的插件登记（content 只内置 "/" 等自身页面）：
 *   api.lifecycle.addCleanup((await api.services.get(ContentRoutes)).register("/blog"));
 *   api.caps.dom.mount(routeSlot("/blog"), (host) => render(host));
 * 路由激活时 content 把页面区域提供为 routeSlot(path)。登记方停用（Cleanup）时路由随之消失，
 * 若当前正处于该路由则导航回 "/"。
 */
export interface ContentRoutesService {
  /** path 与内置页面或已登记路由重复时抛错 */
  register(path: string): Cleanup;
}

export const ContentRoutes = defineService<ContentRoutesService>("content.routes");

export const routeSlot = (path: string): Slot => defineSlot(`content.route.${path}`);

/** 用户点击信件署名旁的方块；index 为方块序号（从 0 开始） */
export const SquareClickTopic = defineTopic(
  "content.square.click",
  Schema.Struct({ index: Schema.Number }),
);

export const ContentNoteChangeTopic = defineTopic(
  "content.notes.change",
  Schema.Array(ContentNodeSchema),
);
