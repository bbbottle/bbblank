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
    const ui = createDevtools(model, DevtoolsPluginId, storage);

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
