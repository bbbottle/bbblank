import { useEffect, useState } from "react";
import { FooterNoteService, Note, NoteChangeTopic } from "./api";
import { PluginEventsBus } from "@bbblank/sdk";
import { isTrustedHtml } from "@bbblank/host-dom";

export const NoteItem = ({ content, order }: Note) =>
  isTrustedHtml(content) ? (
    <li value={order} dangerouslySetInnerHTML={{ __html: content.html }} />
  ) : (
    <li value={order}>{content}</li>
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
        <NoteItem key={n.id} {...n} />
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
