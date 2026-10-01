import type { PluginEventsBus } from "@bbblank/sdk";
import { isTrustedHtml } from "@bbblank/host-dom";
import type { FooterNoteService, Note } from "../shell/api";
import { ContentNoteChangeTopic } from "./api";
import type { ContentNote, IContentNoteService, Letter } from "./api";
import { letterFields, numberNotes } from "./annotate";

const sameContent = (a: Note["content"], b: Note["content"]) =>
  isTrustedHtml(a) && isTrustedHtml(b) ? a.html === b.html : a === b;

export const createContentNoteService = (
  letter: Letter,
  evtBus: PluginEventsBus,
  footerNote: () => Promise<FooterNoteService>,
): IContentNoteService => {
  const fields = letterFields(letter);
  const notes: Map<number, ContentNote> = new Map();

  /** 重新编号（note.order）；返回序号发生变化的笔记，供同步到脚注 */
  const renumber = (): Array<Note> => {
    const changed: Array<Note> = [];
    for (const [id, order] of numberNotes(fields, notes.values())) {
      const n = notes.get(id)!;
      if (n.note.order === order) continue;
      const next = { ...n, note: { ...n.note, order } };
      notes.set(id, next);
      changed.push(next.note);
    }
    return changed;
  };

  const publish = (sync: (s: FooterNoteService) => void) => {
    evtBus.emit(ContentNoteChangeTopic, Array.from(notes.values()));
    void footerNote().then(sync);
  };

  return {
    getLetter: () => letter,
    listNotes: () => Array.from(notes.values()),
    upsertNote: (contentNote) => {
      const { id } = contentNote.note;
      const prev = notes.get(id);
      if (
        prev?.contentStr === contentNote.contentStr &&
        sameContent(prev.note.content, contentNote.note.content)
      )
        return;
      // order 由本服务统一分配，调用方传入的值不生效；先沿用旧序号，contentStr 变化时由 renumber 修正
      const { order: _ignored, ...note } = contentNote.note;
      notes.set(id, {
        ...contentNote,
        note: prev?.note.order === undefined ? note : { ...note, order: prev.note.order },
      });
      const changed = renumber();
      const current = notes.get(id)!.note;
      publish((s) => {
        for (const n of changed) if (n.id !== id) s.upsertNote(n);
        s.upsertNote(current);
      });
    },
    delNote: (id) => {
      const prev = notes.get(id);
      if (!prev) return;
      notes.delete(id);
      const changed = renumber();
      publish((s) => {
        s.delNote(prev.note);
        for (const n of changed) s.upsertNote(n);
      });
    },
  };
};
