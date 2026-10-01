import { describe, expect, it } from "vitest";
import { Layer, Schema } from "effect";
import {
  InstallStore,
  PermissionPolicy,
  PluginLoader,
  createKernel,
} from "@bbblank/kernel";
import type { KernelView } from "@bbblank/kernel";
import { defineTopic, definePlugin } from "@bbblank/sdk";
import type { AnyPluginModule, PluginID, SemVer } from "@bbblank/sdk";
import {
  PluginManager,
  PluginManagerLive,
} from "./plugin-manager-capability.js";
import type {
  PluginCatalogEntry,
  PluginManagerFacade,
} from "./plugin-manager-capability.js";
import type { Activity } from "@bbblank/kernel";

const id = (s: string) => s as PluginID;
const mf = (name: string) => ({
  id: id(name),
  name,
  version: "1.0.0" as SemVer,
});
const tick = () => new Promise((r) => setTimeout(r, 5));

const catalog: ReadonlyArray<PluginCatalogEntry> = [
  {
    id: id("target"),
    name: "Target",
    version: "1.0.0",
    description: "test target",
  },
];

const kernel = (
  mods: Record<string, AnyPluginModule>,
  permission?: Layer.Layer<PermissionPolicy>,
) => {
  const k = createKernel({
    capabilities: [PluginManager],
    capabilityLayer: PluginManagerLive((): KernelView => k.view, catalog),
    loader: PluginLoader.fromMap(
      new Map(Object.entries(mods).map(([key, m]) => [id(key), m])),
    ),
    store: InstallStore.memory(),
    supervision: { backoff: { initial: "1 millis", max: "5 millis" } },
    ...(permission ? { permission } : {}),
  });
  return k;
};

let setups = 0;
const target = definePlugin({
  manifest: mf("target"),
  capabilities: [],
  setup: () => void setups++,
});

const Request = defineTopic(
  "test.request",
  Schema.Struct({ id: Schema.String }),
);

const manager = (expose: (pm: PluginManagerFacade) => void = () => {}) =>
  definePlugin({
    manifest: mf("manager"),
    capabilities: [PluginManager],
    setup: (api) => {
      expose(api.caps.pluginManager);
      api.events.on(Request, ({ id: target }) =>
        api.caps.pluginManager.install(id(target)),
      );
    },
  });

const emitter = (send: (emit: (target: string) => void) => void) =>
  definePlugin({
    manifest: mf("emitter"),
    capabilities: [],
    setup: (api) => send((t) => api.events.emit(Request, { id: t })),
  });

const status = (k: ReturnType<typeof kernel>, name: string) =>
  k.view.snapshot().plugins.get(id(name))?.status;

describe("PluginManager capability", () => {
  it("installs a plugin from an event callback, idempotently", async () => {
    setups = 0;
    let emit!: (t: string) => void;
    const k = kernel({
      manager: manager(),
      emitter: emitter((e) => (emit = e)),
      target,
    });
    await k.view.install(id("manager"));
    await k.view.install(id("emitter"));

    emit("target");
    await tick();
    expect(status(k, "target")).toBe("enabled");

    emit("target");
    await tick();
    expect(setups).toBe(1);
    await k.dispose();
  });

  it("uninstalls other plugins but refuses to uninstall itself", async () => {
    let pm!: PluginManagerFacade;
    const k = kernel({ manager: manager((p) => (pm = p)), target });
    await k.view.install(id("manager"));
    await pm.install(id("target"));
    await pm.uninstall(id("target"));
    expect(status(k, "target")).toBeUndefined();
    await expect(pm.uninstall(id("manager"))).rejects.toThrow(
      /cannot uninstall itself/,
    );
    expect(status(k, "manager")).toBe("enabled");
    await k.dispose();
  });

  it("disables and enables other plugins but refuses to disable itself", async () => {
    let pm!: PluginManagerFacade;
    const k = kernel({ manager: manager((p) => (pm = p)), target });
    await k.view.install(id("manager"));
    await pm.install(id("target"));
    await pm.disable(id("target"));
    expect(status(k, "target")).toBe("disabled");
    await pm.enable(id("target"));
    expect(status(k, "target")).toBe("enabled");
    await expect(pm.disable(id("manager"))).rejects.toThrow(
      /cannot disable itself/,
    );
    expect(status(k, "manager")).toBe("enabled");
    await k.dispose();
  });

  it("read access lists plugins, exposes the catalog and observes activity, but cannot install", async () => {
    let pm!: PluginManagerFacade;
    const k = kernel(
      { manager: manager((p) => (pm = p)), target },
      PermissionPolicy.restrict(() => ({ access: { pluginManager: "read" } })),
    );
    await k.view.install(id("manager"));
    await k.view.install(id("target"));
    expect(pm.list().find((p) => p.id === "manager")).toMatchObject({
      name: "manager",
      version: "1.0.0",
      status: "enabled",
      capabilities: ["pluginManager"],
      dependencies: [],
    });
    expect(pm.catalog()).toEqual(catalog);

    const seen: Array<Activity> = [];
    pm.observe((a) => seen.push(a), { replay: true });
    await tick();
    expect(
      seen.flatMap((a) =>
        a.kind === "lifecycle" ? [`${a.pluginId}:${a.phase}`] : [],
      ),
    ).toEqual(["manager:load", "manager:setup", "target:load", "target:setup"]);
    const audit = (await pm.diagnostics()).audit;
    expect(audit).toContainEqual(
      expect.objectContaining({
        action: "pluginManager:observe",
        outcome: "allowed",
      }),
    );

    expect(() => pm.install(id("target"))).toThrow(
      expect.objectContaining({ _tag: "PermissionDenied" }),
    );
    await k.dispose();
  });

  it("releases subscriptions when the observing plugin stops", async () => {
    let pm!: PluginManagerFacade;
    let changes = 0;
    let activities = 0;
    const k = kernel({
      manager: manager((p) => {
        pm = p;
        p.subscribe(() => void changes++);
        p.observe(() => void activities++);
      }),
      target,
    });
    await k.view.install(id("manager"));
    await tick();
    await pm.install(id("target"));
    await tick();
    expect(changes).toBeGreaterThan(0);
    expect(activities).toBeGreaterThan(0);

    await k.view.disable(id("manager"));
    const [c, a] = [changes, activities];
    await k.view.disable(id("target"));
    await tick();
    expect([changes, activities]).toEqual([c, a]);
    await k.dispose();
  });
});
