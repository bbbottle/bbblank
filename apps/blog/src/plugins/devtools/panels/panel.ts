import type { Model } from "../model";

export interface Panel {
  readonly id: string;
  readonly title: string;
  readonly el: HTMLElement;
  /** 面板可见时才调用；what 指出模型中哪部分发生了变化 */
  update(what: "plugins" | "activity" | "shown"): void;
}

export type PanelFactory = (model: Model, self: string) => Panel;
