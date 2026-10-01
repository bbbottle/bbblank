/** content 的页面组件（React 只出现在插件内部，内核与宿主对此无感知） */
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { PluginEventsBus } from "@bbblank/sdk";
import { ContentNoteChangeTopic, SquareClickTopic } from "./api";
import type { ContentNote, IContentNoteService } from "./api";
import { annotate } from "./annotate";

type routes = "/" | "/notes" | "/photos" | string;

export interface PageDeps {
  readonly noteService: IContentNoteService;
  readonly events: PluginEventsBus;
}

const Square = ({
  size = 12,
  color = "#000",
  onClick,
}: {
  size?: number;
  color?: string;
  onClick?: () => void;
}) => (
  <span
    onClick={onClick}
    style={{
      display: "inline-block",
      width: size,
      height: size,
      background: color,
      cursor: onClick ? "pointer" : undefined,
    }}
  ></span>
);

const useContentNotes = ({ noteService, events }: PageDeps) => {
  const [notes, setNotes] = useState<ReadonlyArray<ContentNote>>(
    noteService.listNotes,
  );

  useEffect(() => {
    setNotes(noteService.listNotes());
    const off = events.on(ContentNoteChangeTopic, setNotes);
    return () => void off();
  }, [noteService, events]);

  return notes;
};

const Annotated = ({
  text,
  notes,
}: {
  readonly text: string;
  readonly notes: ReadonlyArray<ContentNote>;
}) => (
  <>
    {annotate(text, notes).map((s, i) =>
      s.kind === "text" ? s.text : <sup key={`ref-${s.id}-${i}`}>[{s.id}]</sup>,
    )}
  </>
);

export const Entry = (deps: PageDeps) => {
  const letter = deps.noteService.getLetter();
  const notes = useContentNotes(deps);

  return (
    <article>
      <p>{letter.openlings}</p>
      <p>
        <Annotated text={letter.body} notes={notes} />
      </p>
      <div className="signature" style={{ textAlign: "right" }}>
        <p style={{ display: "inline-flex", flexDirection: "column" }}>
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            <span>{letter.author}</span>
            {[0, 1].map((index) => (
              <Square
                key={index}
                onClick={() => deps.events.emit(SquareClickTopic, { index })}
              />
            ))}
          </span>
          <span>{letter.date}</span>
          <span>{letter.address}</span>
        </p>
      </div>
    </article>
  );
};

export const NotFound = ({ path }: { readonly path: string }) => (
  <article>
    <h1>404</h1>
    <a href="/" data-link>
      /
    </a>
  </article>
);

const PAGES: Map<routes, (deps: PageDeps) => ReactElement> = new Map([
  ["/", (deps: PageDeps) => <Entry {...deps} />],
  ["/notes", () => <div>Hi.</div>],
  ["/photos", () => <div>Hi.</div>],
]);

export const pageFor = (path: string, deps: PageDeps): ReactElement =>
  PAGES.get(path)?.(deps) ?? <NotFound path={path} />;
