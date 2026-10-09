/** /blog 页面：最近几篇文章，远程 HTML 经 Html capability 净化后渲染 */
import { Fragment, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { HtmlFacade, TrustedHtml } from "@bbblank/host-dom";
import type { Post, PostsService } from "../content/api";

const RECENT_POSTS = 4;

type RenderedPost = Omit<Post, "content"> & { readonly content: TrustedHtml };

type PostsState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly posts: ReadonlyArray<RenderedPost> };

const Square = ({
  size = 12,
  color = "#000",
  blink,
}: {
  size?: number;
  color?: string;
  blink?: boolean;
}) => (
  <span
    className={blink ? "blink" : ""}
    style={{
      display: "inline-block",
      width: size,
      height: size,
      background: color,
      transition: "opacity .2s",
    }}
  ></span>
);

const Blog = ({
  html,
  posts,
}: {
  readonly html: HtmlFacade;
  readonly posts: PostsService;
}) => {
  const [state, setState] = useState<PostsState>({ kind: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    posts.recent(RECENT_POSTS, ctrl.signal).then(
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
  }, [html, posts]);

  if (state.kind === "loading")
    return (
      <div style={{ display: "grid", placeItems: "center" }}>
        <Square blink />
      </div>
    );
  if (state.kind === "error") return <p>文章加载失败：{state.message}</p>;
  return (
    <section>
      {state.posts.map((p, i) => (
        <Fragment key={p.id}>
          <article style={{ marginTop: "6rem" }}>
            <h3>{p.title}</h3>
            <p className="heti-meta heti-small">
              <time dateTime={p.createdAt}>{p.createdAt.slice(0, 10)}</time>
            </p>
            <div dangerouslySetInnerHTML={{ __html: p.content.html }} />
          </article>
        </Fragment>
      ))}
      <hr style={{ marginTop: "6rem" }} />
      <p className="heti-meta heti-small">
        <a data-link href="/">
          <Square />
        </a>
      </p>
    </section>
  );
};

/** 在 host 中渲染 /blog 页面；返回卸载函数 */
export const renderBlog = (
  host: HTMLElement,
  html: HtmlFacade,
  posts: PostsService,
) => {
  const root = createRoot(host);
  root.render(<Blog html={html} posts={posts} />);
  return () => root.unmount();
};
