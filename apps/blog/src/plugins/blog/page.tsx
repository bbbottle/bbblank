/** /blog 页面：最近几篇文章，远程 HTML 经 Html capability 净化后渲染 */
import { Fragment, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { HtmlFacade, TrustedHtml } from "@bbblank/host-dom";
import type { Post, PostsService } from "../content/api";
import { ShellClass } from "../shell/api";

const RECENT_POSTS = 4;

type RenderedPost = Omit<Post, "content"> & { readonly content: TrustedHtml };

type PostsState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly posts: ReadonlyArray<RenderedPost> };

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
      <span
        className={`${ShellClass.square} ${ShellClass.blink}`}
        role="status"
        aria-label="加载中"
      />
    );
  if (state.kind === "error") return <p>文章加载失败：{state.message}</p>;
  return (
    <section>
      {state.posts.map((p, i) => (
        <Fragment key={p.id}>
          <article>
            <time dateTime={p.createdAt} className="heti-small">
              {/* p.createdAt.slice(0, 10) */}.
            </time>
            <div dangerouslySetInnerHTML={{ __html: p.content.html }} />
          </article>
        </Fragment>
      ))}

      <article>
        <time className="heti-small">{/* p.createdAt.slice(0, 10) */}.</time>
        <div>
          <p>
            <a data-link href="/">
              返回
            </a>
          </p>
        </div>
      </article>
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
