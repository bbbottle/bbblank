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
import { createFooterNoteService } from "./footer-note-service";
import { renderNotes } from "./renderer";

export const shell = definePlugin({
  manifest: {
    id: ShellPluginId,
    name: "Shell",
    version: "1.1.0" as SemVer,
    services: { provide: [FooterNote.key] },
  },
  capabilities: [Dom, Router],
  setup: (api) => {
    const { dom, router } = api.caps;

    const fnService = createFooterNoteService(api.events);

    api.services.register(FooterNote, fnService);

    dom.head.addStyle(css);

    dom.mount(RootSlot, (host) => {
      const layout = buildLayout(host);

      renderNotes(layout.footer, fnService, api.events);

      const offs = [
        dom.provideSlot(ShellSlots.headerRight, layout.headerRight),
        dom.provideSlot(ShellSlots.main, layout.main),
        dom.provideSlot(ShellSlots.footer, layout.footer),
      ];

      const offLinks = interceptLinks(host, router.navigate);

      return () => {
        offLinks();
        for (const off of offs) void off();
      };
    });
  },
});
