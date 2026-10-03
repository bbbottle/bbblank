/**
 * Sideload —— 运行期登记插件模块（如 devtools Playground 在浏览器中编译出的插件）。
 * - SideloadRegistry：宿主持有的登记表。
 * - SideloadLoader(registry, fallback)：先查登记表、再交给原加载器；内核无需改动即可加载登记的模块。
 * - Sideload capability：register / unregister 需要 write 并写审计；id 必须以 `dev-` 开头，不能覆盖目录内插件。
 * 模块结构与 manifest（含 manifest.id 与登记 id 一致）仍由内核的 validateModule 校验。
 */
import { Effect, Layer } from "effect";
import { PluginLoadError, PluginLoader } from "@bbblank/kernel";
import { defineCapability } from "@bbblank/sdk";
import type { PluginID } from "@bbblank/sdk";

/** 运行期登记的插件 id 前缀 */
export const SIDELOAD_PREFIX = "dev-";

export const isSideloadId = (id: string) => id.startsWith(SIDELOAD_PREFIX) && id.length > SIDELOAD_PREFIX.length;

export class SideloadRegistry {
  readonly #mods = new Map<PluginID, unknown>();
  get(id: PluginID) {
    return this.#mods.get(id);
  }
  has(id: PluginID) {
    return this.#mods.has(id);
  }
  set(id: PluginID, mod: unknown) {
    this.#mods.set(id, mod);
  }
  delete(id: PluginID) {
    this.#mods.delete(id);
  }
}

/** 登记表优先，其余 id 交给 fallback；登记表中的 id 不会回落到 fallback（避免同名目录插件被意外加载） */
export const SideloadLoader = (registry: SideloadRegistry, fallback: Layer.Layer<PluginLoader>) =>
  Layer.effect(
    PluginLoader,
    Effect.gen(function* () {
      const base = yield* PluginLoader;
      return PluginLoader.of({
        load: (id) => {
          if (!isSideloadId(id)) return base.load(id);
          const mod = registry.get(id);
          return mod === undefined
            ? Effect.fail(new PluginLoadError({ id, cause: "sideload module not registered" }))
            : Effect.succeed(mod as never);
        },
        listAvailable: base.listAvailable,
      });
    }),
  ).pipe(Layer.provide(fallback));

export interface SideloadShape {
  readonly register: (id: PluginID, mod: unknown) => Effect.Effect<void>;
  readonly unregister: (id: PluginID) => Effect.Effect<void>;
}

export interface SideloadFacade {
  /** 登记（或替换）模块；之后经 PluginManager.install(id) 安装。已安装的旧版本须先卸载，内核才会重新加载 */
  register(id: PluginID, mod: unknown): void;
  unregister(id: PluginID): void;
}

export const Sideload = defineCapability<"sideload", SideloadShape, SideloadFacade>(
  "sideload",
  (s, ctx) => {
    const write = (action: string, id: PluginID, eff: Effect.Effect<void>) => {
      ctx.require("write");
      if (!isSideloadId(id)) throw new Error(`sideload id must start with "${SIDELOAD_PREFIX}": ${id}`);
      ctx.audit(action, id);
      ctx.runSync(eff);
    };
    return {
      register: (id, mod) => write("register", id, s.register(id, mod)),
      unregister: (id) => write("unregister", id, s.unregister(id)),
    };
  },
);

export const SideloadLive = (registry: SideloadRegistry) =>
  Layer.succeed(Sideload.tag, {
    register: (id, mod) => Effect.sync(() => registry.set(id, mod)),
    unregister: (id) => Effect.sync(() => registry.delete(id)),
  });
