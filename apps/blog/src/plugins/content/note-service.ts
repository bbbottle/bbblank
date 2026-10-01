import type { PluginEventsBus } from "@bbblank/sdk";
import type { FooterNoteService } from "../shell/api";
import { ContentNoteChangeTopic } from "./api";
import type { ContentNote, IContentNoteService, Letter } from "./api";

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
      notes.set(contentNote.note.id, contentNote);
      evtBus.emit(ContentNoteChangeTopic, Array.from(notes.values()));
      void footerNote().then((s) => s.upsertNote(contentNote.note));
    },
  };
};
