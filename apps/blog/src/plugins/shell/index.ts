/**
 * shell —— 根插件：在宿主预置的 RootSlot 中搭骨架，提供 ShellSlots（见 ./api），
 * 并把站内链接交给路由。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { Dom, RootSlot, Router } from "@bbblank/host-dom";
import { FooterNote, ShellPluginId, ShellSlots } from "./api";
import { buildLayout } from "./layout";
import { interceptLinks } from "./link-router";
import { css } from "./styles";
import { theme } from "./theme";
import { createFooterNoteService } from "./footer-note-service";
import { renderFooter } from "./renderer";

/** 脚注只属于 Entry（content 的 "/" 路由）；其他页面的 footer 显示返回 Entry 的链接（见 ./renderer） */
const ENTRY_PATH = "/";

export const shell = definePlugin({
  manifest: {
    id: ShellPluginId,
    name: "Shell",
    version: "1.4.1" as SemVer,
    services: { provide: [FooterNote.key] },
  },
  capabilities: [Dom, Router],
  setup: (api) => {
    const { dom, router } = api.caps;

    const fnService = createFooterNoteService(api.events);

    api.services.register(FooterNote, fnService);

    dom.head.addStyle(css);
    dom.head.addStyle(theme);

    dom.mount(RootSlot, (host) => {
      const layout = buildLayout(host);

      const stopFooter = renderFooter(layout.footer, fnService, api.events, router, ENTRY_PATH);

      const offs = [
        dom.provideSlot(ShellSlots.headerRight, layout.headerRight),
        dom.provideSlot(ShellSlots.main, layout.main),
        dom.provideSlot(ShellSlots.footer, layout.footer),
      ];

      const offLinks = interceptLinks(host, router.navigate);

      return () => {
        offLinks();
        void stopFooter();
        for (const off of offs) void off();
      };
    });
  },
});
