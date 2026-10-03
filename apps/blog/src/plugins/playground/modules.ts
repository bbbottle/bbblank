/**
 * Playground 中允许 import 的模块。
 * - @bbblank/sdk、@bbblank/host-dom、各插件的 api.ts（仓库路径 apps/blog/src/plugins/<name>/api）：
 *   与页面正在运行的是同一份实例（服务、事件、插槽的标识按对象身份匹配）。
 * - effect（含 effect/<Module> 子路径）：独立打包的副本，首次被 import 时加载（见 vite.config.ts 的说明）。
 */
import * as sdk from "@bbblank/sdk";
import * as hostDom from "@bbblank/host-dom";
import effectUrl from "virtual:playground-effect-url";

export const PLUGINS_DIR = "apps/blog/src/plugins/";

type Namespace = Record<string, unknown>;

const apis = import.meta.glob<Namespace>("../*/api.ts", { eager: true });

const shared: ReadonlyMap<string, Namespace> = new Map<string, Namespace>([
  ["@bbblank/sdk", sdk],
  ["@bbblank/host-dom", hostDom],
  ...Object.entries(apis).map(([path, mod]) => [`${PLUGINS_DIR}${path.slice(3).replace(/\.ts$/, "")}`, mod] as const),
]);

export const isEffectSpecifier = (spec: string) => spec === "effect" || /^effect\/[A-Za-z]+$/.test(spec);

let effect: Promise<Namespace> | undefined;
export const loadEffect = () => (effect ??= import(/* @vite-ignore */ effectUrl) as Promise<Namespace>);

/** 模块解析表：effect 须先经 loadEffect() 加载后传入 */
export const lookupWith =
  (effectNs: Namespace | undefined) =>
  (key: string): Namespace | undefined => {
    const hit = shared.get(key);
    if (hit) return hit;
    if (!effectNs || !isEffectSpecifier(key)) return undefined;
    if (key === "effect") return effectNs;
    const ns = effectNs[key.slice("effect/".length)];
    return typeof ns === "object" && ns !== null ? (ns as Namespace) : undefined;
  };
