/**
 * shell —— 根插件：在宿主预置的 `root` slot 中搭骨架，定义
 * `header.left` / `header.right` / `main` / `footer` slot，并把站内链接交给路由。
 */
import { definePlugin } from "@bbblank/sdk";
import type { PluginID, SemVer } from "@bbblank/sdk";
import { Dom, Router } from "@bbblank/host-dom";

const css = `
  body { margin: 0; background: var(--bg, #fff); color: var(--fg, #222);
    font: 16px/1.7 system-ui, -apple-system, sans-serif; }
  .shell { max-width: 42rem; margin: 0 auto; padding: 0 1.25rem; min-height: 100vh;
    display: flex; flex-direction: column; }
  .shell > header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 0; }
  .shell > header nav a { margin-right: 1rem; }
  .shell > main { flex: 1; }
  .shell > footer { padding: 2rem 0; opacity: .6; font-size: .875rem; }
  a { color: var(--link, #0969da); text-decoration: none; }
  a:hover { text-decoration: underline; }
`;

export const shell = definePlugin({
  manifest: {
    id: "shell" as PluginID,
    name: "Shell",
    version: "1.0.0" as SemVer,
  },
  capabilities: [Dom, Router],
  setup: (api) => {
    const { dom, router } = api.caps;
    dom.head.addStyle(css);

    dom.mount("root", (host) => {
      const doc = host.ownerDocument;
      const el = <K extends keyof HTMLElementTagNameMap>(
        tag: K,
        parent: HTMLElement,
      ) => parent.appendChild(doc.createElement(tag));
      host.className = "shell";
      const header = el("header", host);
      const slots = {
        "header.left": el("nav", header),
        "header.right": el("div", header),
        main: el("main", host),
        footer: el("footer", host),
      };
      const offs = Object.entries(slots).map(([name, node]) =>
        dom.defineSlot(name, node),
      );

      // 站内链接（a[data-link]）走 History 路由，不整页刷新
      const onClick = (e: MouseEvent) => {
        const a = (e.target as Element | null)?.closest?.("a[data-link]");
        if (
          !(a instanceof HTMLAnchorElement) ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey
        )
          return;
        if (a.origin !== doc.location.origin) return;
        e.preventDefault();
        router.navigate(a.pathname);
      };
      host.addEventListener("click", onClick);
      return () => {
        host.removeEventListener("click", onClick);
        for (const off of offs) void off();
      };
    });
  },
});
