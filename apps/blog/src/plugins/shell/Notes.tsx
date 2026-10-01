import { useEffect, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { FootnoteActionTopic, FooterNoteService, Note, NoteChangeTopic } from "./api";
import { PluginEventsBus } from "@bbblank/sdk";
import { isTrustedHtml } from "@bbblank/host-dom";

/** 把脚注 HTML 中 [data-action] 元素的点击 / Enter 转为 FootnoteActionTopic */
const actionHandlers = (noteId: number, evtBus: PluginEventsBus) => {
  const fire = (e: MouseEvent | KeyboardEvent) => {
    const el = (e.target as Element).closest<HTMLElement>("[data-action]");
    if (!el || !e.currentTarget.contains(el)) return;
    e.preventDefault();
    evtBus.emit(FootnoteActionTopic, { noteId, action: el.dataset.action ?? "" });
  };
  return {
    onClick: fire,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter") fire(e);
    },
  };
};

export const NoteItem = ({ note, evtBus }: { note: Note; evtBus: PluginEventsBus }) =>
  isTrustedHtml(note.content) ? (
    <li
      value={note.order}
      dangerouslySetInnerHTML={{ __html: note.content.html }}
      {...actionHandlers(note.id, evtBus)}
    />
  ) : (
    <li value={note.order}>{note.content}</li>
  );

const byOrder = (a: Note, b: Note) =>
  (a.order ?? Infinity) - (b.order ?? Infinity);

const useNotes = (fnService: FooterNoteService, evtBus: PluginEventsBus) => {
  const [notes, setNotes] = useState<ReadonlyArray<Note>>(
    fnService.listNotes(),
  );

  useEffect(() => {
    const off = evtBus.on(NoteChangeTopic, setNotes);
    return () => {
      off();
    };
  }, []);

  return notes;
};

export const Notes = ({
  fnService,
  evtBus,
}: {
  fnService: FooterNoteService;
  evtBus: PluginEventsBus;
}) => {
  const notes = useNotes(fnService, evtBus);

  return (
    <ol>
      {[...notes].sort(byOrder).map((n) => (
        <NoteItem key={n.id} note={n} evtBus={evtBus} />
      ))}
    </ol>
  );
};

export const createNotes = (
  fnService: FooterNoteService,
  evtBus: PluginEventsBus,
) => {
  return <Notes fnService={fnService} evtBus={evtBus} />;
};
