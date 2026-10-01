/**
 * devtools —— 仿 Chrome DevTools 的插件面板（底部抽屉）。
 * 独立挂在 RootSlot（不依赖 shell），停用 shell 时仍可观察级联停用与恢复；
 * 数据经 PluginManager capability 读取（list / subscribe / observe），操作同样经它执行。
 */
import { definePlugin, Storage } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { Dom, PluginManager, RootSlot } from "@bbblank/host-dom";
import { DevtoolsOpenTopic, DevtoolsPluginId } from "./api";
import { createDevtools } from "./devtools";
import { Model } from "./model";

/** 挂在 RootSlot 中其他挂载（shell 等）之后 */
const WEIGHT = 1000;

export const devtools = definePlugin({
  manifest: {
    id: DevtoolsPluginId,
    name: "DevTools",
    version: "1.0.0" as SemVer,
  },
  capabilities: [Dom, PluginManager, Storage],
  setup: (api) => {
    const { dom, pluginManager, storage } = api.caps;
    const model = new Model(pluginManager);

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

    const ui = createDevtools(model, DevtoolsPluginId, storage, dock);

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
