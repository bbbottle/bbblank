import { afterEach, describe, expect, it } from 'vitest';
import { Layer } from 'effect';
import { InstallStore, PermissionPolicy, PluginLoader, createKernel } from '@bbblank/kernel';
import { definePlugin } from '@bbblank/sdk';
import type { AnyPluginModule, PluginID, SemVer } from '@bbblank/sdk';
import { Dom, DomLive } from './dom-capability.js';
import { Router, RouterLive } from './router-capability.js';

const id = (s: string) => s as PluginID;
const mf = (name: string, extra: object = {}) => ({ id: id(name), name, version: '1.0.0' as SemVer, ...extra });
const tick = () => new Promise(r => setTimeout(r, 5));

const kernel = (mods: Record<string, AnyPluginModule>, permission?: Layer.Layer<PermissionPolicy>) =>
  createKernel({
    capabilities: [Dom, Router],
    capabilityLayer: Layer.mergeAll(DomLive(document), RouterLive(window)),
    loader: PluginLoader.fromMap(new Map(Object.entries(mods).map(([k, m]) => [id(k), m]))),
    store: InstallStore.memory(),
    supervision: { backoff: { initial: '1 millis', max: '5 millis' } },
    ...(permission ? { permission } : {}),
  });

const shell = definePlugin({
  manifest: mf('shell'),
  capabilities: [Dom],
  setup: api => {
    api.caps.dom.mount('root', host => {
      const main = host.appendChild(document.createElement('main'));
      const off = api.caps.dom.defineSlot('main', main);
      return off;
    });
  },
});

const widget = (name: string, weight: number) =>
  definePlugin({
    manifest: mf(name),
    capabilities: [Dom],
    setup: api => {
      api.caps.dom.mount('main', host => {
        host.textContent = name;
        return () => void (host.dataset.cleaned = 'yes');
      }, weight);
    },
  });

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('Dom capability', () => {
  it('mounts wait for their slot, order by weight, and follow the slot lifecycle', async () => {
    const k = kernel({ shell, a: widget('a', 10), b: widget('b', 5) });
    await k.view.install(id('a')); // slot 尚未定义：挂起
    expect(document.querySelector('[data-plugin="a"]')).toBeNull();

    await k.view.install(id('shell'));
    await k.view.install(id('b'));
    const texts = () => [...document.querySelectorAll('main > [data-slot="main"]')].map(e => e.textContent);
    expect(texts()).toEqual(['b', 'a']);

    await k.view.disable(id('shell')); // slot 撤销 → 挂载卸载
    expect(document.querySelector('main')).toBeNull();
    await k.view.enable(id('shell')); // slot 恢复 → 挂回
    expect(texts()).toEqual(['b', 'a']);

    await k.view.disable(id('a'));
    expect(texts()).toEqual(['b']);
    await k.dispose();
    expect(document.body.children.length).toBe(0);
  });

  it('head styles are layered per plugin and removed on disable', async () => {
    const themed = definePlugin({
      manifest: mf('themed'),
      capabilities: [Dom],
      setup: api => {
        api.caps.dom.head.addStyle(':root { color: red }');
        api.caps.dom.head.addMeta({ name: 'x-test', content: '1' });
      },
    });
    const k = kernel({ themed });
    await k.view.install(id('themed'));
    expect(document.head.querySelector('style[data-plugin="themed"]')?.textContent).toContain('@layer plugin-themed');
    expect(document.head.querySelector('meta[name="x-test"]')).not.toBeNull();
    await k.view.disable(id('themed'));
    expect(document.head.children.length).toBe(0);
    await k.dispose();
  });

  it('a throwing render is attributed to the plugin instead of breaking the host', async () => {
    let setups = 0;
    const bad = definePlugin({
      manifest: mf('bad'),
      capabilities: [Dom],
      setup: api => {
        setups++;
        if (setups === 1) api.caps.dom.mount('root', () => { throw new Error('render boom'); });
      },
    });
    const k = kernel({ bad });
    await k.view.install(id('bad'));
    await tick();
    await tick();
    expect(setups).toBe(2); // 监管器重启
    await k.dispose();
  });

  it('read-only access cannot mount', async () => {
    let err: unknown;
    const ro = definePlugin({
      manifest: mf('ro'),
      capabilities: [Dom],
      setup: api => {
        try {
          api.caps.dom.mount('root', () => {});
        } catch (e) {
          err = e;
        }
      },
    });
    const k = kernel({ ro }, PermissionPolicy.restrict(() => ({ access: { dom: 'read' } })));
    await k.view.install(id('ro'));
    expect((err as { _tag: string })._tag).toBe('PermissionDenied');
    await k.dispose();
  });
});

describe('Router capability', () => {
  it('reports the current path, navigates via history and notifies listeners', async () => {
    history.replaceState(null, '', '/');
    const seen: Array<string> = [];
    let nav!: (p: string) => void;
    const r = definePlugin({
      manifest: mf('r'),
      capabilities: [Router],
      setup: api => {
        api.caps.router.onChange(p => seen.push(p));
        nav = api.caps.router.navigate;
      },
    });
    const k = kernel({ r });
    await k.view.install(id('r'));
    await tick();
    nav('/about');
    await tick();
    expect(location.pathname).toBe('/about');
    expect(seen).toEqual(['/', '/about']);
    await k.dispose();
  });
});
