/** 小乌鸦合集页面：展示形式与 /blog 相同，远程 HTML 经 Html capability 净化后渲染，末尾为返回主页的方块链接 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { HtmlFacade, TrustedHtml } from "@bbblank/host-dom";
import type { Post, PostsService } from "../content/api";
import { ShellClass } from "../shell/api";

const POST_TITLE = "小乌鸦合集";

type RenderedPost = Omit<Post, "content"> & { readonly content: TrustedHtml };

type PostState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "missing" }
  | { readonly kind: "ready"; readonly post: RenderedPost };

const LittleCrow = ({
  html,
  posts,
}: {
  readonly html: HtmlFacade;
  readonly posts: PostsService;
}) => {
  const [state, setState] = useState<PostState>({ kind: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    posts.byTitle(POST_TITLE, ctrl.signal).then(
      (post) =>
        setState(
          post
            ? {
                kind: "ready",
                post: { ...post, content: html.trust(post.content) },
              }
            : { kind: "missing" },
        ),
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

  return (
    <section>
      {state.kind === "ready" ? (
        <article>
          <div dangerouslySetInnerHTML={{ __html: state.post.content.html }} />
        </article>
      ) : (
        <p>
          {state.kind === "missing"
            ? `没有找到标题为「${POST_TITLE}」的文章。`
            : `文章加载失败：${state.message}`}
        </p>
      )}

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

/** 在 host 中渲染小乌鸦合集页面；返回卸载函数 */
export const renderLittleCrow = (
  host: HTMLElement,
  html: HtmlFacade,
  posts: PostsService,
) => {
  const root = createRoot(host);
  root.render(<LittleCrow html={html} posts={posts} />);
  return () => root.unmount();
};
