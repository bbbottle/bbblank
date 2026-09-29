/**
 * DomCapability —— 设计文档附录 A
 * DOM 只是宿主注入的一种 Capability，不属于内核。
 *
 * 分区挂载：插件只拿到自己的 host 元素（`<div data-plugin data-slot>`），不碰裸 document。
 * slot 表由插件（通常是 shell）定义；先 mount 后定义 slot 的挂载会挂起，slot 出现时再渲染，
 * slot 撤销（shell 停用）时卸载、重新定义时再挂回——插件启用顺序因此无关紧要。
 * 宿主预置 `root` slot（缺省 document.body）。
 * 实现只依赖传入的 Document，浏览器与 happy-dom/linkedom（预渲染/测试）共用。
 */
import { Effect, Layer } from 'effect';
import type { Scope } from 'effect';
import { defineCapability } from '@bbblank/sdk';
import type { Cleanup, PluginID } from '@bbblank/sdk';

export type Render = (host: HTMLElement) => Cleanup | void;

export interface DomShape {
  readonly mount: (
    pluginId: PluginID,
    slot: string,
    render: Render,
    weight?: number
  ) => Effect.Effect<void, never, Scope.Scope>;
  /** 把 el 注册为具名 slot；同名 slot 已被其他插件定义时失败（defect） */
  readonly defineSlot: (
    pluginId: PluginID,
    name: string,
    el: HTMLElement
  ) => Effect.Effect<void, never, Scope.Scope>;
  readonly slots: Effect.Effect<ReadonlyArray<string>>;
  readonly head: {
    readonly addMeta: (
      pluginId: PluginID,
      attrs: Readonly<Record<string, string>>
    ) => Effect.Effect<void, never, Scope.Scope>;
    /** 注入到 `@layer plugin-<id>`，插件样式互不覆盖优先级 */
    readonly addStyle: (pluginId: PluginID, css: string) => Effect.Effect<void, never, Scope.Scope>;
  };
}

export interface DomFacade {
  /** weight 越小越靠前，同 weight 按挂载先后 */
  mount(slot: string, render: Render, weight?: number): Cleanup;
  defineSlot(name: string, el: HTMLElement): Cleanup;
  slots(): ReadonlyArray<string>;
  readonly head: {
    addMeta(attrs: Readonly<Record<string, string>>): Cleanup;
    addStyle(css: string): Cleanup;
  };
}

export const Dom = defineCapability<'dom', DomShape, DomFacade>('dom', (s, ctx) => {
  const write = <A>(f: () => A) => {
    ctx.require('write');
    return f();
  };
  return {
    mount: (slot, render, weight) =>
      write(() => ctx.scoped(s.mount(ctx.pluginId, slot, ctx.guard(render), weight))),
    defineSlot: (name, el) =>
      write(() => {
        ctx.audit('defineSlot', name);
        return ctx.scoped(s.defineSlot(ctx.pluginId, name, el));
      }),
    slots: () => ctx.runSync(s.slots),
    head: {
      addMeta: attrs => write(() => ctx.scoped(s.head.addMeta(ctx.pluginId, attrs))),
      addStyle: css => write(() => ctx.scoped(s.head.addStyle(ctx.pluginId, css))),
    },
  };
});

interface Mount {
  readonly pluginId: PluginID;
  readonly slot: string;
  readonly render: Render;
  readonly weight: number;
  host?: HTMLElement;
  cleanup?: Cleanup | void;
}

const runCleanup = (c: Cleanup | void) => {
  try {
    void Promise.resolve(c?.()).catch(() => {});
  } catch {
    // 插件 cleanup 的同步异常不应阻断卸载
  }
};

export interface DomLiveOptions {
  /** `root` slot 的元素，缺省 document.body */
  readonly root?: HTMLElement;
}

export const DomLive = (doc: Document = globalThis.document, opts: DomLiveOptions = {}) =>
  Layer.sync(Dom.tag, () => {
    const slots = new Map<string, { readonly owner: string; readonly el: HTMLElement }>([
      ['root', { owner: 'host', el: opts.root ?? doc.body }],
    ]);
    const mounts = new Set<Mount>();

    const attach = (m: Mount) => {
      const slot = slots.get(m.slot);
      if (!slot || m.host) return;
      const host = doc.createElement('div');
      host.dataset.plugin = m.pluginId;
      host.dataset.slot = m.slot;
      host.dataset.weight = String(m.weight);
      const next = [...slot.el.children].find(
        c => c instanceof doc.defaultView!.HTMLElement && Number(c.dataset.weight) > m.weight
      );
      slot.el.insertBefore(host, next ?? null);
      m.host = host;
      m.cleanup = m.render(host);
    };

    const detach = (m: Mount) => {
      if (!m.host) return;
      runCleanup(m.cleanup);
      m.host.remove();
      m.host = undefined;
      m.cleanup = undefined;
    };

    const inHead = (pluginId: PluginID, make: () => HTMLElement) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const el = make();
          el.dataset.plugin = pluginId;
          return doc.head.appendChild(el);
        }),
        el => Effect.sync(() => el.remove())
      ).pipe(Effect.asVoid);

    return {
      mount: (pluginId, slot, render, weight = 0) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const m: Mount = { pluginId, slot, render, weight };
            mounts.add(m);
            attach(m);
            return m;
          }),
          m =>
            Effect.sync(() => {
              detach(m);
              mounts.delete(m);
            })
        ).pipe(Effect.asVoid),

      defineSlot: (pluginId, name, el) =>
        Effect.acquireRelease(
          Effect.suspend(() => {
            const existing = slots.get(name);
            if (existing && existing.owner !== pluginId) {
              return Effect.die(new Error(`slot "${name}" already defined by ${existing.owner}`));
            }
            slots.set(name, { owner: pluginId, el });
            for (const m of mounts) if (m.slot === name) attach(m);
            return Effect.void;
          }),
          () =>
            Effect.sync(() => {
              for (const m of mounts) if (m.slot === name) detach(m);
              slots.delete(name);
            })
        ),

      slots: Effect.sync(() => [...slots.keys()]),

      head: {
        addMeta: (pluginId, attrs) =>
          inHead(pluginId, () => {
            const meta = doc.createElement('meta');
            for (const [k, val] of Object.entries(attrs)) meta.setAttribute(k, val);
            return meta;
          }),
        addStyle: (pluginId, css) =>
          inHead(pluginId, () => {
            const style = doc.createElement('style');
            style.textContent = `@layer plugin-${pluginId} {\n${css}\n}`;
            return style;
          }),
      },
    };
  });
