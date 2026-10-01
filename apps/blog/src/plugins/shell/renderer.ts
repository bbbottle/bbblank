import { createRoot } from "react-dom/client";
import { createNotes } from "./Notes";
import { FooterNoteService, Note, NoteChangeTopic } from "./api";
import { PluginEventsBus } from "@bbblank/sdk";

export const renderNotes = (
  host: HTMLElement,
  fnService: FooterNoteService,
  evtBus: PluginEventsBus,
) => {
  const syncClass = (notes: ReadonlyArray<Note>) =>
    void host.classList.toggle("heti-fn", notes.length > 0);
  syncClass(fnService.listNotes());
  const off = evtBus.on(NoteChangeTopic, syncClass);

  const root = createRoot(host);
  root.render(createNotes(fnService, evtBus));

  return async () => {
    await off();
    root.unmount();
  };
};
