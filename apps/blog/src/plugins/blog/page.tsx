/** /blog 页面：最近几篇文章，远程 HTML 经 Html capability 净化后渲染 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { HtmlFacade, TrustedHtml } from "@bbblank/host-dom";
import type { Post, PostsService } from "../content/api";
import { ShellClass } from "../shell/api";

const RECENT_POSTS = 4;

type RenderedPost = Omit<Post, "content"> & { readonly content: TrustedHtml };

type PostsState =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly posts: ReadonlyArray<RenderedPost> };

const Blog = ({
  html,
  posts,
  onError,
}: {
  readonly html: HtmlFacade;
  readonly posts: PostsService;
  readonly onError: (e: unknown) => void;
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
        if (ctrl.signal.aborted) return;
        onError(e);
        setState({ kind: "error" });
      },
    );
    return () => ctrl.abort();
  }, [html, posts, onError]);

  if (state.kind === "loading")
    return (
      <span
        className={`${ShellClass.square} ${ShellClass.blink}`}
        role="status"
        aria-label="加载中"
      />
    );
  if (state.kind === "error") return <p>文章加载失败，请稍后刷新。</p>;
  return (
    <section className={ShellClass.posts}>
      {state.posts.map((p) => (
        <article key={p.id}>
          <div dangerouslySetInnerHTML={{ __html: p.content.html }} />
        </article>
      ))}
    </section>
  );
};

/** 在 host 中渲染 /blog 页面；返回卸载函数 */
export const renderBlog = (
  host: HTMLElement,
  html: HtmlFacade,
  posts: PostsService,
  onError: (e: unknown) => void,
) => {
  const root = createRoot(host);
  root.render(<Blog html={html} posts={posts} onError={onError} />);
  return () => root.unmount();
};
