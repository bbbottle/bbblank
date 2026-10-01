/** content 的页面组件（React 只出现在插件内部，内核与宿主对此无感知） */
import { Fragment, useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { PluginEventsBus } from "@bbblank/sdk";
import type { HtmlFacade, TrustedHtml } from "@bbblank/host-dom";
import { ContentNoteChangeTopic, SquareClickTopic } from "./api";
import type { ContentNote, IContentNoteService } from "./api";
import { annotate, distribute, letterFields } from "./annotate";
import { fetchPosts } from "./posts";
import type { Post } from "./posts";

type routes = "/" | "/blog" | "/notes" | "/photos" | string;

export interface PageDeps {
  readonly noteService: IContentNoteService;
  readonly events: PluginEventsBus;
  readonly html: HtmlFacade;
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

const RECENT_POSTS = 4;

type RenderedPost = Omit<Post, "content"> & { readonly content: TrustedHtml };

type PostsState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly posts: ReadonlyArray<RenderedPost> };

export const Blog = ({ html }: PageDeps) => {
  const [state, setState] = useState<PostsState>({ kind: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    fetchPosts(RECENT_POSTS, ctrl.signal).then(
      (posts) =>
        setState({
          kind: "ready",
          posts: posts.map((p) => ({ ...p, content: html.trust(p.content) })),
        }),
      (e: unknown) => {
        if (!ctrl.signal.aborted)
          setState({ kind: "error", message: String(e) });
      },
    );
    return () => ctrl.abort();
  }, [html]);

  if (state.kind === "loading") return;
  if (state.kind === "error") return <p>文章加载失败：{state.message}</p>;
  return (
    <section>
      {state.posts.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && <hr />}
          <article>
            <h3>{p.title}</h3>
            <p className="heti-meta heti-small">
              <time dateTime={p.createdAt}>{p.createdAt.slice(0, 10)}</time>
            </p>
            <div dangerouslySetInnerHTML={{ __html: p.content.html }} />
          </article>
        </Fragment>
      ))}
      <hr />
      <p className="heti-meta heti-small">
        <a data-link href="/">
          <Square />
        </a>
      </p>
    </section>
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
  ["/blog", (deps: PageDeps) => <Blog {...deps} />],
  ["/notes", () => <div>Hi.</div>],
  ["/photos", () => <div>Hi.</div>],
]);

export const pageFor = (path: string, deps: PageDeps): ReactElement =>
  PAGES.get(path)?.(deps) ?? <NotFound path={path} />;
