import { createRoot } from "react-dom/client";
import { createNotes } from "./Notes";
import { FooterNoteService } from "./api";
import { PluginEventsBus } from "@bbblank/sdk";

export const renderNotes = (
  host: HTMLElement,
  fnService: FooterNoteService,
  evtBus: PluginEventsBus,
) => {
  const root = createRoot(host);
  root.render(createNotes(fnService, evtBus));
};
