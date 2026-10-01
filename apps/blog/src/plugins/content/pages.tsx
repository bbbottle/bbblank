/** content 的页面组件（React 只出现在插件内部，内核与宿主对此无感知） */
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { Cleanup, PluginEventsBus } from "@bbblank/sdk";
import { ContentNoteChangeTopic, SquareClickTopic } from "./api";
import type { ContentNote, IContentNoteService } from "./api";
import { annotate, distribute, letterFields } from "./annotate";
import type { Routes } from "./routes";

export interface PageDeps {
  readonly noteService: IContentNoteService;
  readonly events: PluginEventsBus;
  /** 外部插件登记的路由 */
  readonly routes: Routes;
  /** 把页面区域提供为 routeSlot(path)，登记方经 Dom.mount 挂载页面内容 */
  readonly provideRoute: (path: string, el: HTMLElement) => Cleanup;
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
      s.kind === "text" ? s.text : <sup key={`ref-${s.id}-${i}`}>[{s.label}]</sup>,
    )}
  </>
);

export const Entry = (deps: PageDeps) => {
  const letter = deps.noteService.getLetter();
  const notes = useContentNotes(deps);
  const fields = letterFields(letter);
  const [openlings, body, author, date, address] = distribute(
    fields,
    notes,
  ).map((ns, i) => <Annotated text={fields[i]!} notes={ns} />);

  return (
    <article>
      <p>{openlings}</p>
      <p>{body}</p>
      <div className="signature" style={{ textAlign: "right" }}>
        <p style={{ display: "inline-flex", flexDirection: "column" }}>
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            <span>{author}</span>
            {[0, 1].map((index) => (
              <Square
                key={index}
                onClick={() => deps.events.emit(SquareClickTopic, { index })}
              />
            ))}
          </span>
          <span>{date}</span>
          <span>{address}</span>
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

/** 登记路由的页面区域：挂载期间提供为 routeSlot(path) */
const RouteHost = ({ path, provide }: { readonly path: string; readonly provide: PageDeps["provideRoute"] }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const off = provide(path, ref.current!);
    return () => void off();
  }, [path, provide]);
  return <div ref={ref} />;
};

/** content 自身的页面；其余路径由外部插件经 content.routes 登记 */
const PAGES: ReadonlyMap<string, (deps: PageDeps) => ReactElement> = new Map([
  ["/", (deps: PageDeps) => <Entry {...deps} />],
  ["/notes", () => <div>Hi.</div>],
  ["/photos", () => <div>Hi.</div>],
]);

export const builtinPaths: ReadonlySet<string> = new Set(PAGES.keys());

export const pageFor = (path: string, deps: PageDeps): ReactElement =>
  PAGES.get(path)?.(deps) ??
  (deps.routes.has(path) ? (
    <RouteHost key={path} path={path} provide={deps.provideRoute} />
  ) : (
    <NotFound path={path} />
  ));
