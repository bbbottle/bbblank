/** 小乌鸦合集页面：展示形式与 /blog 相同，远程 HTML 经 Html capability 净化后渲染，末尾为返回主页的方块链接 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { HtmlFacade, TrustedHtml } from "@bbblank/host-dom";
import type { Post, PostsService } from "../content/api";

const POST_TITLE = "小乌鸦合集";

type RenderedPost = Omit<Post, "content"> & { readonly content: TrustedHtml };

type PostState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "missing" }
  | { readonly kind: "ready"; readonly post: RenderedPost };

const Square = ({ size = 12, color = "#000" }: { size?: number; color?: string }) => (
  <span style={{ display: "inline-block", width: size, height: size, background: color }}></span>
);

const LittleCrow = ({ html, posts }: { readonly html: HtmlFacade; readonly posts: PostsService }) => {
  const [state, setState] = useState<PostState>({ kind: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    posts.byTitle(POST_TITLE, ctrl.signal).then(
      (post) =>
        setState(post ? { kind: "ready", post: { ...post, content: html.trust(post.content) } } : { kind: "missing" }),
      (e: unknown) => {
        if (!ctrl.signal.aborted) setState({ kind: "error", message: String(e) });
      },
    );
    return () => ctrl.abort();
  }, [html, posts]);

  if (state.kind === "loading") return;
  return (
    <section>
      {state.kind === "ready" ? (
        <article style={{ marginTop: "6rem" }}>
          <h3>{state.post.title}</h3>
          <p className="heti-meta heti-small">
            <time dateTime={state.post.createdAt}>{state.post.createdAt.slice(0, 10)}</time>
          </p>
          <div dangerouslySetInnerHTML={{ __html: state.post.content.html }} />
        </article>
      ) : (
        <p style={{ marginTop: "6rem" }}>
          {state.kind === "missing" ? `没有找到标题为「${POST_TITLE}」的文章。` : `文章加载失败：${state.message}`}
        </p>
      )}
      <hr style={{ marginTop: "6rem" }} />
      <p className="heti-meta heti-small">
        <a data-link href="/">
          <Square />
        </a>
      </p>
    </section>
  );
};

/** 在 host 中渲染小乌鸦合集页面；返回卸载函数 */
export const renderLittleCrow = (host: HTMLElement, html: HtmlFacade, posts: PostsService) => {
  const root = createRoot(host);
  root.render(<LittleCrow html={html} posts={posts} />);
  return () => root.unmount();
};
