/** devtools 的数据模型：插件列表与活动流的本地副本，变化时通知面板 */
import type { PluginID } from "@bbblank/sdk";
import type { Activity } from "@bbblank/kernel";
import type { PluginInfo, PluginManagerFacade } from "@bbblank/host-dom";

/** 与内核环形缓冲同量级；超出后丢弃最旧记录 */
const MAX_ACTIVITY = 1000;

export class Model {
  plugins: ReadonlyArray<PluginInfo> = [];
  readonly activity: Array<Activity> = [];
  readonly #listeners = new Set<(what: "plugins" | "activity") => void>();

  constructor(readonly pm: PluginManagerFacade) {
    this.plugins = pm.list();
    pm.subscribe(() => {
      this.plugins = pm.list();
      this.#emit("plugins");
    });
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
