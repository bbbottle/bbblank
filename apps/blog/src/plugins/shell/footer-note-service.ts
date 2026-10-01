import { PluginEventsBus } from "@bbblank/sdk";
import { FooterNoteService, Note, NoteChangeTopic } from "./api";

export const createFooterNoteService = (evtBus: PluginEventsBus) => {
  const notes: Map<Number, Note> = new Map();
  const service: FooterNoteService = {
    upsertNote: (note) => {
      notes.set(note.id, note);
      evtBus.emit(NoteChangeTopic, Array.from(notes.values()));
    },
    delNote: (note) => {
      notes.delete(note.id);
      evtBus.emit(NoteChangeTopic, Array.from(notes.values()));
    },
    clearNotes: () => {
      notes.clear();
      evtBus.emit(NoteChangeTopic, Array.from(notes.values()));
    },
    listNotes: () => Array.from(notes.values()),
  };

  return service;
};
