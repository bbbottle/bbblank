/** content 的页面组件（React 只出现在插件内部，内核与宿主对此无感知） */
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { Cleanup, PluginEventsBus } from "@bbblank/sdk";
import { ContentNoteChangeTopic, SquareClickTopic } from "./api";
import type { ContentNote, IContentNoteService } from "./api";
import { annotate, distribute, letterFields } from "./annotate";
import type { Routes } from "./routes";
import { FOOTNOTE_ID_PREFIX, ShellClass } from "../shell/api";

export interface PageDeps {
  readonly noteService: IContentNoteService;
  readonly events: PluginEventsBus;
  /** 外部插件登记的路由 */
  readonly routes: Routes;
  /** 把页面区域提供为 routeSlot(path)，登记方经 Dom.mount 挂载页面内容 */
  readonly provideRoute: (path: string, el: HTMLElement) => Cleanup;
  /** 设置页面标题（Dom.head.setTitle），返回恢复函数 */
  readonly setTitle: (title: string) => Cleanup;
}

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
      s.kind === "text" ? s.text : (
        <sup key={`ref-${s.id}-${i}`}>
          <a href={`#${FOOTNOTE_ID_PREFIX}${s.label}`} aria-label={`脚注 ${s.label}`}>
            {s.label}
          </a>
        </sup>
      ),
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
      <div className="signature">
        <p>
          <span className="signature-name">
            <span>{author}</span>
            {[0, 1].map((index) => (
              <button
                key={index}
                type="button"
                className={ShellClass.square}
                aria-label={`署名方块 ${index + 1}`}
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

const SITE_NAME = "bbki.ng";
const NOT_FOUND_TITLE = "此页不存在";

/** 页面标题：挂载期间设为「<title> · bbki.ng」；title 缺省时沿用站点标题 */
const Titled = ({
  title,
  set,
  children,
}: {
  readonly title: string | undefined;
  readonly set: PageDeps["setTitle"];
  readonly children: ReactElement;
}) => {
  useEffect(() => {
    if (!title) return;
    const off = set(`${title} · ${SITE_NAME}`);
    return () => void off();
  }, [title, set]);
  return children;
};

export const NotFound = ({ path }: { readonly path: string }) => (
  <article>
    <p>此页不存在。</p>
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
]);

export const builtinPaths: ReadonlySet<string> = new Set(PAGES.keys());

export const pageFor = (path: string, deps: PageDeps): ReactElement => {
  const page = PAGES.get(path);
  if (page) return page(deps);
  if (deps.routes.has(path))
    return (
      <Titled key={path} title={deps.routes.titleOf(path)} set={deps.setTitle}>
        <RouteHost path={path} provide={deps.provideRoute} />
      </Titled>
    );
  return (
    <Titled key="404" title={NOT_FOUND_TITLE} set={deps.setTitle}>
      <NotFound path={path} />
    </Titled>
  );
};
