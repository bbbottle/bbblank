/**
 * shell 对外契约：提供的挂载点。其他插件只 import 本文件，不依赖 shell 的实现。
 */
import { defineService, defineTopic } from "@bbblank/sdk";
import type { PluginID } from "@bbblank/sdk";
import { defineSlot } from "../../../../../packages/host/src";
import { TrustedHtmlSchema } from "@bbblank/host-dom";
import { Schema } from "effect";

export const ShellPluginId = "shell" as PluginID;

export const NoteSchema = Schema.Struct({
  id: Schema.Number,
  /** 字符串按纯文本渲染；HTML 须经 Html capability 的 trust() 取得 TrustedHtml */
  content: Schema.Union([Schema.String, TrustedHtmlSchema]),
  /** 显示序号：脚注按 order 升序排列并以其为编号，须与正文角标一致；缺省时排在末尾、按写入顺序编号 */
  order: Schema.optionalKey(Schema.Number),
});

export const ShellSlots = {
  headerRight: defineSlot("header.right"),
  main: defineSlot("main"),
  footer: defineSlot("footer"),
} as const;

export type Note = Schema.Schema.Type<typeof NoteSchema>;

export interface FooterNoteService {
  upsertNote: (note: Note) => void;
  delNote: (note: Note) => void;
  clearNotes: () => void;
  listNotes: () => Array<Note>;
}

export const FooterNote = defineService<FooterNoteService>("shell.footerNote");

export const NoteChangeTopic = defineTopic(
  "shell.footerNotes.change",
  Schema.Array(NoteSchema),
);

/**
 * 脚注中可交互的元素：TrustedHtml 内容里带 data-action 的元素被点击（或聚焦后按 Enter）时发布。
 * noteId 为脚注所属笔记的 id，action 为 data-action 的值；由笔记的写入方订阅并解释。
 */
export const FootnoteActionTopic = defineTopic(
  "shell.footnote.action",
  Schema.Struct({ noteId: Schema.Number, action: Schema.String }),
);
