import { createRoot } from "react-dom/client";
import type { RouterFacade } from "@bbblank/host-dom";
import { createBackLink, createNotes } from "./Notes";
import { FooterNoteService, Note, NoteChangeTopic } from "./api";
import { PluginEventsBus } from "@bbblank/sdk";

/** footer：Entry 路由渲染脚注（无脚注时不加 heti-fn，即不显示分隔线），其余路由渲染返回 Entry 的链接 */
export const renderFooter = (
  host: HTMLElement,
  fnService: FooterNoteService,
  evtBus: PluginEventsBus,
  router: RouterFacade,
  entryPath: string,
) => {
  let notes: ReadonlyArray<Note> = fnService.listNotes();
  let path = router.current();
  const root = createRoot(host);

  const sync = () => {
    const isEntry = path === entryPath;
    host.classList.toggle("heti-fn", !isEntry || notes.length > 0);
    root.render(isEntry ? createNotes(fnService, evtBus) : createBackLink(entryPath));
  };
  sync();

  const offNotes = evtBus.on(NoteChangeTopic, (n) => {
    notes = n;
    sync();
  });
  const offRoute = router.onChange((p) => {
    path = p;
    sync();
  });

  return async () => {
    await offNotes();
    await offRoute();
    root.unmount();
  };
};
