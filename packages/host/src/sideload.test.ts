import { describe, expect, it } from "vitest";
import { Layer } from "effect";
import { InstallStore, PermissionPolicy, PluginLoader, createKernel } from "@bbblank/kernel";
import { definePlugin } from "@bbblank/sdk";
import type { AnyPluginModule, PluginID, SemVer } from "@bbblank/sdk";
import { Sideload, SideloadLive, SideloadLoader, SideloadRegistry } from "./sideload.js";
import type { SideloadFacade } from "./sideload.js";

const id = (s: string) => s as PluginID;
const plugin = (name: string, onSetup: () => void = () => {}) =>
  definePlugin({
    manifest: { id: id(name), name, version: "1.0.0" as SemVer },
    capabilities: [],
    setup: onSetup,
  });

const kernel = (
  registry: SideloadRegistry,
  catalog: Record<string, AnyPluginModule>,
  extra: ReadonlyArray<AnyPluginModule> = [],
  permission?: Layer.Layer<PermissionPolicy>,
) =>
  createKernel({
    capabilities: [Sideload],
    capabilityLayer: SideloadLive(registry),
    loader: SideloadLoader(
      registry,
      PluginLoader.fromMap(
        new Map([...Object.entries(catalog), ...extra.map((m) => [m.manifest.id, m] as const)].map(([k, m]) => [id(k), m])),
      ),
    ),
    store: InstallStore.memory(),
    ...(permission ? { permission } : {}),
  });

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("expected rejection");
    },
    (e: unknown) => e as { _tag?: string; message?: string },
  );

describe("SideloadLoader", () => {
  it("loads registered dev- modules; reinstall after uninstall picks up the new module", async () => {
    const registry = new SideloadRegistry();
    const seen: Array<string> = [];
    const k = kernel(registry, { shipped: plugin("shipped") });

    registry.set(id("dev-x"), plugin("dev-x", () => void seen.push("v1")));
    await k.view.install(id("dev-x"));
    registry.set(id("dev-x"), plugin("dev-x", () => void seen.push("v2")));
    await k.view.disable(id("dev-x"));
    await k.view.enable(id("dev-x"));
    expect(seen).toEqual(["v1", "v1"]); // 停用 / 启用沿用已缓存的模块

    await k.view.uninstall(id("dev-x"));
    await k.view.install(id("dev-x"));
    expect(seen).toEqual(["v1", "v1", "v2"]); // 卸载清除缓存，重新安装加载新模块

    await k.view.install(id("shipped")); // 非 dev- id 交给 fallback
    expect(k.view.snapshot().plugins.get(id("shipped"))?.status).toBe("enabled");
    await k.dispose();
  });

  it("does not fall back for unregistered dev- ids, and validates manifest id", async () => {
    const registry = new SideloadRegistry();
    // fallback 中即使存在同名模块，也不会被加载
    const k = kernel(registry, {}, [plugin("dev-y")]);
    const missing = await rejection(k.view.install(id("dev-y")));
    expect(missing._tag).toBe("PluginLoadError");

    registry.set(id("dev-z"), plugin("dev-other"));
    const mismatch = await rejection(k.view.install(id("dev-z")));
    expect(mismatch._tag).toBe("PluginLoadError");
    expect(String((mismatch as { cause?: unknown }).cause)).toContain('declares id "dev-other"');
    await k.dispose();
  });
});

describe("Sideload capability", () => {
  const user = (onFacade: (f: SideloadFacade) => void) =>
    definePlugin({
      manifest: { id: id("pg"), name: "pg", version: "1.0.0" as SemVer },
      capabilities: [Sideload],
      setup: (api) => onFacade(api.caps.sideload),
    });

  it("registers dev- modules with write access; rejects other ids", async () => {
    const registry = new SideloadRegistry();
    let facade!: SideloadFacade;
    const k = kernel(registry, { pg: user((f) => (facade = f)) });
    await k.view.install(id("pg"));

    facade.register(id("dev-a"), plugin("dev-a"));
    expect(registry.has(id("dev-a"))).toBe(true);
    expect(() => facade.register(id("about"), plugin("about"))).toThrow(/dev-/);
    expect(() => facade.register(id("dev-"), plugin("dev-"))).toThrow(/dev-/);
    facade.unregister(id("dev-a"));
    expect(registry.has(id("dev-a"))).toBe(false);

    const audit = (await k.view.diagnostics()).audit.filter((a) => a.pluginId === "pg").map((a) => `${a.action}:${a.target}`);
    expect(audit).toEqual(expect.arrayContaining(["sideload:register:dev-a", "sideload:unregister:dev-a"]));
    await k.dispose();
  });

  it("requires write access", async () => {
    const registry = new SideloadRegistry();
    let facade!: SideloadFacade;
    const k = kernel(
      registry,
      { pg: user((f) => (facade = f)) },
      [],
      PermissionPolicy.restrict(() => ({ access: { sideload: "read" } })),
    );
    await k.view.install(id("pg"));
    expect(() => facade.register(id("dev-a"), plugin("dev-a"))).toThrow();
    expect(registry.has(id("dev-a"))).toBe(false);
    await k.dispose();
  });
});
