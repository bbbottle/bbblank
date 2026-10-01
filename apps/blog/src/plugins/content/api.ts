/**
 * content 对外契约：插件 id 与 `content.selection` 服务（只有类型与 Token，不含实现）。
 * 其他插件只 import 本文件，不依赖 content 的实现代码。
 */
import { defineService } from "@bbblank/sdk";
import type { PluginID } from "@bbblank/sdk";
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

export interface IContentNoteService {
  upsertNote: (contentNote: ContentNote) => void;
}

export const ContentNoteService = defineService<IContentNoteService>(
  "content.noteService",
);

export type Letter = Schema.Schema.Type<typeof LetterSchema>;
