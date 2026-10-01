/**
 * 插件列表与活动流的本地副本，变化时通知订阅方。每个使用者（devtools、各面板插件）各自持有一份：
 * 订阅随各自插件的 Scope 释放，清空等本地操作互不影响。
 */
import type { PluginID } from "@bbblank/sdk";
import type { Activity } from "@bbblank/kernel";
import type { PluginInfo, PluginManagerFacade } from "@bbblank/host-dom";

/** 与内核环形缓冲同量级；超出后丢弃最旧记录 */
const MAX_ACTIVITY = 1000;

export class DevtoolsModel {
  plugins: ReadonlyArray<PluginInfo> = [];
  readonly activity: Array<Activity> = [];
  readonly #listeners = new Set<(what: "plugins" | "activity") => void>();

  /** activity：是否订阅活动流（订阅会写审计 pluginManager:observe；不需要的面板不必订阅） */
  constructor(
    readonly pm: PluginManagerFacade,
    opts: { readonly activity?: boolean } = {},
  ) {
    this.plugins = pm.list();
    pm.subscribe(() => {
      this.plugins = pm.list();
      this.#emit("plugins");
    });
    if (!opts.activity) return;
    // replay：打开 devtools 之前发生的启动、点击等活动同样可见
    pm.observe(
      (a) => {
        this.activity.push(a);
        if (this.activity.length > MAX_ACTIVITY) this.activity.shift();
        this.#emit("activity");
      },
      { replay: true },
    );
  }

  onChange(cb: (what: "plugins" | "activity") => void) {
    this.#listeners.add(cb);
    return () => void this.#listeners.delete(cb);
  }

  clearActivity(kinds: ReadonlyArray<Activity["kind"]>) {
    const keep = this.activity.filter((a) => !kinds.includes(a.kind));
    this.activity.splice(0, this.activity.length, ...keep);
    this.#emit("activity");
  }

  #emit(what: "plugins" | "activity") {
    for (const cb of this.#listeners) cb(what);
  }

  byId(id: string) {
    return this.plugins.find((p) => p.id === id);
  }

  /**
   * 停用 id 的执行顺序：内核的 disable 在仍有已启用依赖者时拒绝（DependentsActive），
   * 因此先停用已启用的依赖者——每一步只停用不再被其余待停用插件依赖的那个，最后是 id 本身。
   */
  disableOrder(id: PluginID): ReadonlyArray<PluginID> {
    const pending = new Set([...this.dependentsOf(id).filter((p) => p.status === "enabled").map((p) => p.id), id]);
    const order: Array<PluginID> = [];
    while (pending.size) {
      const next = [...pending].find(
        (x) => ![...pending].some((y) => y !== x && this.byId(y)?.dependencies.some((d) => d.id === x)),
      );
      if (!next) break;
      order.push(next);
      pending.delete(next);
    }
    return order;
  }

  /** 直接或间接依赖 id 的已安装插件 */
  dependentsOf(id: string): ReadonlyArray<PluginInfo> {
    const out = new Map<string, PluginInfo>();
    const visit = (target: string) => {
      for (const p of this.plugins) {
        if (out.has(p.id) || !p.dependencies.some((d) => d.id === target))
          continue;
        out.set(p.id, p);
        visit(p.id);
      }
    };
    visit(id);
    return [...out.values()];
  }
}

export type ModelChange = "plugins" | "activity" | "shown";

/** 面板视图：el 由面板自行持有；update 只在面板可见时调用（"shown" 表示刚变为可见，应整体刷新） */
export interface PanelView {
  readonly el: HTMLElement;
  update(what: ModelChange): void;
}
