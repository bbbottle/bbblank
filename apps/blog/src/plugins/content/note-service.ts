import type { PluginEventsBus } from "@bbblank/sdk";
import { isTrustedHtml } from "@bbblank/host-dom";
import type { FooterNoteService, Note } from "../shell/api";
import { ContentNoteChangeTopic } from "./api";
import type { ContentNote, IContentNoteService, Letter } from "./api";

const sameContent = (a: Note["content"], b: Note["content"]) =>
  isTrustedHtml(a) && isTrustedHtml(b) ? a.html === b.html : a === b;

export const createContentNoteService = (
  letter: Letter,
  evtBus: PluginEventsBus,
  footerNote: () => Promise<FooterNoteService>,
): IContentNoteService => {
  const notes: Map<number, ContentNote> = new Map();

  return {
    getLetter: () => letter,
    listNotes: () => Array.from(notes.values()),
    upsertNote: (contentNote) => {
      const prev = notes.get(contentNote.note.id);
      if (
        prev?.contentStr === contentNote.contentStr &&
        sameContent(prev.note.content, contentNote.note.content)
      )
        return;
      notes.set(contentNote.note.id, contentNote);
      evtBus.emit(ContentNoteChangeTopic, Array.from(notes.values()));
      void footerNote().then((s) => s.upsertNote(contentNote.note));
    },
    delNote: (id) => {
      const prev = notes.get(id);
      if (!prev) return;
      notes.delete(id);
      evtBus.emit(ContentNoteChangeTopic, Array.from(notes.values()));
      void footerNote().then((s) => s.delNote(prev.note));
    },
  };
};
