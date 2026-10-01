/** §10.10 活动流 */
import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { definePlugin, defineTopic } from "@bbblank/sdk";
import type { AnyPluginModule } from "@bbblank/sdk";
import type { Activity } from "./activity-log.js";
import { id, makeKernel, mf, rejection } from "./test-kit.js";

const Ping = defineTopic("test.ping", Schema.Struct({ n: Schema.Number }));

const lifecycle = (log: ReadonlyArray<Activity>) =>
  log.flatMap((a) =>
    a.kind === "lifecycle" ? [`${a.pluginId}:${a.phase}:${a.outcome}`] : [],
  );

describe("activity stream", () => {
  it("records load / setup / stop phases with durations", async () => {
    const p = definePlugin({
      manifest: mf("p"),
      capabilities: [],
      setup: () => {},
    });
    const k = makeKernel({ p });
    const seen: Array<Activity> = [];
    k.view.observe((a) => seen.push(a));
    await k.view.install(id("p"));
    await k.view.disable(id("p"));
    await k.view.enable(id("p"));
    // 已加载的模块不再记录 load
    expect(lifecycle(seen)).toEqual([
      "p:load:ok",
      "p:setup:ok",
      "p:stop:ok",
      "p:setup:ok",
    ]);
    for (const a of seen)
      if (a.kind === "lifecycle")
        expect(a.durationMs).toBeGreaterThanOrEqual(0);
    expect(seen.map((a) => a.seq)).toEqual(
      [...seen.keys()].map((i) => seen[0]!.seq + i),
    );
    await k.dispose();
  });

  it("records a failed setup with its error", async () => {
    const bad = definePlugin({
      manifest: mf("bad"),
      capabilities: [],
      setup: () => {
        throw new Error("boom");
      },
    });
    const k = makeKernel({ bad }, { supervision: { maxRestarts: 0 } });
    const seen: Array<Activity> = [];
    k.view.observe((a) => seen.push(a));
    await rejection(k.view.install(id("bad")));
    const setup = seen.find(
      (a) => a.kind === "lifecycle" && a.phase === "setup",
    );
    expect(setup).toMatchObject({
      outcome: "error",
      error: { tag: "PluginSetupError" },
    });
    await k.dispose();
  });

  it("records published events with publisher, payload and subscriber count, before delivery", async () => {
    let emit!: (n: number) => void;
    const order: Array<string> = [];
    const pub = definePlugin({
      manifest: mf("pub"),
      capabilities: [],
      setup: (api) => void (emit = (n) => api.events.emit(Ping, { n })),
    });
    const sub = definePlugin({
      manifest: mf("sub"),
      capabilities: [],
      setup: (api) =>
        void api.events.on(Ping, () => void order.push("delivered")),
    });
    const k = makeKernel({ pub, sub } as Record<string, AnyPluginModule>);
    await k.view.install(id("sub"));
    await k.view.install(id("pub"));
    k.view.observe((a) => {
      if (a.kind === "event") order.push("recorded");
    });
    emit(1);
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual(["recorded", "delivered"]);

    const events: Array<Activity> = [];
    k.view.observe((a) => events.push(a), { replay: true });
    expect(events.filter((a) => a.kind === "event")).toEqual([
      expect.objectContaining({
        topic: "test.ping",
        publisher: "pub",
        payload: { n: 1 },
        subscribers: 1,
      }),
    ]);
    await k.dispose();
  });

  it("records invalid payloads", async () => {
    let emit!: () => void;
    const pub = definePlugin({
      manifest: mf("pub"),
      capabilities: [],
      setup: (api) =>
        void (emit = () => api.events.emit(Ping, { n: "x" } as never)),
    });
    const k = makeKernel({ pub });
    await k.view.install(id("pub"));
    const seen: Array<Activity> = [];
    k.view.observe((a) => seen.push(a));
    expect(() => emit()).toThrow();
    expect(seen).toEqual([
      expect.objectContaining({
        kind: "event-invalid",
        topic: "test.ping",
        publisher: "pub",
      }),
    ]);
    await k.dispose();
  });

  it("replays history, isolates throwing observers, and honours capacity 0", async () => {
    const p = definePlugin({
      manifest: mf("p"),
      capabilities: [],
      setup: () => {},
    });
    const k = makeKernel({ p }, { activity: { capacity: 2 } });
    k.view.observe(() => {
      throw new Error("observer bug");
    });
    await k.view.install(id("p"));
    await k.view.disable(id("p"));
    const replayed: Array<Activity> = [];
    const off = k.view.observe((a) => replayed.push(a), { replay: true });
    expect(lifecycle(replayed)).toEqual(["p:setup:ok", "p:stop:ok"]);
    off();
    await k.view.enable(id("p"));
    expect(replayed).toHaveLength(2);
    await k.dispose();

    const silent = makeKernel({ p }, { activity: { capacity: 0 } });
    const none: Array<Activity> = [];
    silent.view.observe((a) => none.push(a));
    await silent.view.install(id("p"));
    expect(none).toEqual([]);
    await silent.dispose();
  });
});
