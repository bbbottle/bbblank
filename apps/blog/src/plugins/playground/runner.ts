/**
 * 运行草稿插件：编译 → 链接 → 以 dev-<id> 登记到 Sideload → 经 PluginManager 安装。
 * 再次运行先卸载旧版本：内核在卸载时清除模块缓存，重新安装才会加载新模块。
 */
import type { AnyPluginModule, PluginID } from "@bbblank/sdk";
import { SIDELOAD_PREFIX } from "@bbblank/host-dom";
import type { PluginManagerFacade, SideloadFacade } from "@bbblank/host-dom";
import type { Compiler, Diagnostic } from "./compiler";
import { link } from "./linker";
import type { Files } from "./workspace";
import { pluginDir } from "./workspace";

export interface Problem extends Diagnostic {
  readonly path: string;
}

export type RunResult =
  | { readonly ok: true; readonly id: PluginID; readonly ms: number }
  | { readonly ok: false; readonly problems: ReadonlyArray<Problem> };

const isPluginModule = (v: unknown): v is AnyPluginModule =>
  typeof v === "object" &&
  v !== null &&
  "kind" in v &&
  "manifest" in v &&
  typeof (v as { manifest: { id?: unknown } }).manifest?.id === "string";

/** 草稿插件的 id：dev-<草稿名>（与代码中 manifest.id 无关，安装前即可确定，供 Plugins 面板判断是否已安装） */
export const devIdOf = (name: string) => `${SIDELOAD_PREFIX}${name}` as PluginID;

export const createRunner = (compiler: Compiler, sideload: SideloadFacade, pm: PluginManagerFacade) => {
  const installed = (id: PluginID) => pm.list().some((p) => p.id === id);

  const stop = async (id: PluginID) => {
    if (installed(id)) await pm.uninstall(id);
    sideload.unregister(id);
  };

  const run = async (name: string, files: Files): Promise<RunResult> => {
    const t0 = performance.now();
    const dir = pluginDir(name);
    const own = Object.entries(files)
      .filter(([path]) => path.startsWith(dir))
      .map(([path, code]) => ({ path, code }));
    const { files: compiled } = await compiler.compile(own);
    const problems = compiled.flatMap((f) => f.diagnostics.map((d) => ({ path: f.path, ...d })));
    if (problems.length) return { ok: false, problems };

    const ns = await link(compiled, `${dir}index.ts`);
    const mod = Object.values(ns).find(isPluginModule);
    if (!mod) throw new Error(`${dir}index.ts 未导出插件（definePlugin 的返回值）`);

    const id = devIdOf(name);
    await stop(id);
    sideload.register(id, { ...mod, manifest: { ...mod.manifest, id } });
    await pm.install(id);
    return { ok: true, id, ms: Math.round(performance.now() - t0) };
  };

  return { run, stop };
};

export type Runner = ReturnType<typeof createRunner>;
