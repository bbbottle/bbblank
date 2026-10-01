import type { DevtoolsModel } from "@bbblank/devtools-ui";

/** devtools 内置面板（目前只有 Plugins）；面板插件改经 DevtoolsPanels 服务接入 */
export interface Panel {
  readonly id: string;
  readonly title: string;
  readonly el: HTMLElement;
  /** 面板可见时才调用；what 指出模型中哪部分发生了变化 */
  update(what: "plugins" | "activity" | "shown"): void;
}

export type PanelFactory = (model: DevtoolsModel, self: string) => Panel;
