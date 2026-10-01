/**
 * shell 对外契约：提供的挂载点。其他插件只 import 本文件，不依赖 shell 的实现。
 */
import { defineService, defineTopic } from "@bbblank/sdk";
import type { PluginID } from "@bbblank/sdk";
import { defineSlot } from "../../../../../packages/host/src";
import { Schema } from "effect";

export const ShellPluginId = "shell" as PluginID;

export const NoteSchema = Schema.Struct({
  id: Schema.Number,
  content: Schema.String,
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
