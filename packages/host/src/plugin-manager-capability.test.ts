import { describe, expect, it } from 'vitest';
import { Layer, Schema } from 'effect';
import { InstallStore, PermissionPolicy, PluginLoader, createKernel } from '@bbblank/kernel';
import type { KernelView } from '@bbblank/kernel';
import { defineTopic, definePlugin } from '@bbblank/sdk';
import type { AnyPluginModule, PluginID, SemVer } from '@bbblank/sdk';
import { PluginManager, PluginManagerLive } from './plugin-manager-capability.js';
import type { PluginManagerFacade } from './plugin-manager-capability.js';

const id = (s: string) => s as PluginID;
const mf = (name: string) => ({ id: id(name), name, version: '1.0.0' as SemVer });
const tick = () => new Promise(r => setTimeout(r, 5));

const kernel = (mods: Record<string, AnyPluginModule>, permission?: Layer.Layer<PermissionPolicy>) => {
  const k = createKernel({
    capabilities: [PluginManager],
    capabilityLayer: PluginManagerLive((): KernelView => k.view),
    loader: PluginLoader.fromMap(new Map(Object.entries(mods).map(([key, m]) => [id(key), m]))),
    store: InstallStore.memory(),
    supervision: { backoff: { initial: '1 millis', max: '5 millis' } },
    ...(permission ? { permission } : {}),
  });
  return k;
};

let setups = 0;
const target = definePlugin({ manifest: mf('target'), capabilities: [], setup: () => void setups++ });

const Request = defineTopic('test.request', Schema.Struct({ id: Schema.String }));

const manager = (expose: (pm: PluginManagerFacade) => void = () => {}) =>
  definePlugin({
    manifest: mf('manager'),
    capabilities: [PluginManager],
    setup: api => {
      expose(api.caps.pluginManager);
      api.events.on(Request, ({ id: target }) => api.caps.pluginManager.install(id(target)));
    },
  });

const emitter = (send: (emit: (target: string) => void) => void) =>
  definePlugin({
    manifest: mf('emitter'),
    capabilities: [],
    setup: api => send(t => api.events.emit(Request, { id: t })),
  });

const status = (k: ReturnType<typeof kernel>, name: string) => k.view.snapshot().plugins.get(id(name))?.status;

describe('PluginManager capability', () => {
  it('installs a plugin from an event callback, idempotently', async () => {
    setups = 0;
    let emit!: (t: string) => void;
    const k = kernel({ manager: manager(), emitter: emitter(e => (emit = e)), target });
    await k.view.install(id('manager'));
    await k.view.install(id('emitter'));

    emit('target');
    await tick();
    expect(status(k, 'target')).toBe('enabled');

    emit('target');
    await tick();
    expect(setups).toBe(1);
    await k.dispose();
  });

  it('uninstalls other plugins but refuses to uninstall itself', async () => {
    let pm!: PluginManagerFacade;
    const k = kernel({ manager: manager(p => (pm = p)), target });
    await k.view.install(id('manager'));
    await pm.install(id('target'));
    await pm.uninstall(id('target'));
    expect(status(k, 'target')).toBeUndefined();
    await expect(pm.uninstall(id('manager'))).rejects.toThrow(/cannot uninstall itself/);
    expect(status(k, 'manager')).toBe('enabled');
    await k.dispose();
  });

  it('read-only access cannot install', async () => {
    let pm!: PluginManagerFacade;
    const k = kernel(
      { manager: manager(p => (pm = p)), target },
      PermissionPolicy.restrict(() => ({ access: { pluginManager: 'read' } }))
    );
    await k.view.install(id('manager'));
    expect(() => pm.install(id('target'))).toThrow(expect.objectContaining({ _tag: 'PermissionDenied' }));
    await k.dispose();
  });
});
