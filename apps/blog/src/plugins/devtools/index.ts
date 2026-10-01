/**
 * devtools —— 仿 Chrome DevTools 的插件面板（底部抽屉）。
 * 独立挂在 RootSlot（不依赖 shell），停用 shell 时仍可观察级联停用与恢复；
 * 内置 Plugins 与 Market 面板（安装入口不随面板插件卸载而消失），其余面板由面板插件经 DevtoolsPanels 服务登记、
 * 经 Dom.mount 挂入 panelSlot(id)（契约见 ./api）。
 */
import { definePlugin, Storage } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { Dom, PluginManager, RootSlot } from "@bbblank/host-dom";
import { DevtoolsModel } from "@bbblank/devtools-ui";
import { DevtoolsOpenTopic, DevtoolsPanels, DevtoolsPluginId, panelSlot } from "./api";
import { createDevtools } from "./devtools";

/** 挂在 RootSlot 中其他挂载（shell 等）之后 */
const WEIGHT = 1000;

export const devtools = definePlugin({
  manifest: {
    id: DevtoolsPluginId,
    name: "DevTools",
    version: "1.0.0" as SemVer,
    services: { provide: [DevtoolsPanels.key] },
  },
  capabilities: [Dom, PluginManager, Storage],
  setup: (api) => {
    const { dom, pluginManager, storage } = api.caps;
    const model = new DevtoolsModel(pluginManager);

    // 停靠：面板打开时把页面的可视区域收缩到面板上方（与 Chrome 底部停靠一致），不遮挡任何内容。
    // body 改为固定定位的滚动容器；切换前后把滚动位置在视口与 body 之间转移
    let undock: (() => void) | undefined;
    const dock = (height: number | undefined) => {
      const docked = undock !== undefined;
      const y = docked ? document.body.scrollTop : (document.scrollingElement?.scrollTop ?? 0);
      undock?.();
      undock = undefined;
      if (height === undefined) {
        if (docked) window.scrollTo(0, y);
        return;
      }
      const off = dom.head.addStyle(
        // height: auto——由 inset 决定高度，覆盖页面可能设置的 height（如 shell 的 100%）
        `body { position: fixed; inset: 0 0 ${height}px 0; height: auto; overflow: auto; }`,
      );
      undock = () => void off();
      document.body.scrollTop = y;
    };
    api.lifecycle.addCleanup(() => dock(undefined));

    const ui = createDevtools(model, DevtoolsPluginId, storage, {
      dock,
      provideSlot: (id, el) => dom.provideSlot(panelSlot(id), el),
    });
    api.services.register(DevtoolsPanels, ui.panels);

    api.events.on(DevtoolsOpenTopic, () => ui.open());

    dom.mount(
      RootSlot,
      (host) => {
        host.append(ui.host);
        return () => {
          ui.dispose();
          ui.host.remove();
        };
      },
      WEIGHT,
    );
  },
});
