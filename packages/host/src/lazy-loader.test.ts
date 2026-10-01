import { describe, expect, it } from 'vitest';
import { InstallStore, createKernel } from '@bbblank/kernel';
import { definePlugin } from '@bbblank/sdk';
import type { PluginID, SemVer } from '@bbblank/sdk';
import { Layer } from 'effect';
import { LazyPluginLoader } from './lazy-loader.js';
import type { PluginImport } from './lazy-loader.js';

const id = (s: string) => s as PluginID;
const mod = (name: string, deps: ReadonlyArray<string> = []) =>
  definePlugin({
    manifest: {
      id: id(name),
      name,
      version: '1.0.0' as SemVer,
      dependencies: deps.map(d => ({ id: id(d), range: '^1.0.0' })),
    },
    capabilities: [],
    setup: () => {},
  });

const kernel = (catalog: Record<string, PluginImport>, store = InstallStore.memory()) =>
  createKernel({
    capabilities: [],
    capabilityLayer: Layer.empty,
    loader: LazyPluginLoader(new Map(Object.entries(catalog).map(([k, v]) => [id(k), v]))),
    store,
  });

describe('LazyPluginLoader', () => {
  it('imports a plugin only when the kernel needs it', async () => {
    const imported: Array<string> = [];
    const lazy = (name: string, deps?: ReadonlyArray<string>): PluginImport => async () => {
      imported.push(name);
      return mod(name, deps);
    };
    const k = kernel({ a: lazy('a'), b: lazy('b', ['a']), c: lazy('c') });
    expect(imported).toEqual([]);
    await k.view.install(id('a'));
    await k.view.install(id('b'));
    expect(imported).toEqual(['a', 'b']);
    expect(k.view.snapshot().plugins.get(id('b'))?.status).toBe('enabled');
    await k.dispose();
  });

  it('reports a failed import and an id mismatch as load failures', async () => {
    const k = kernel({
      broken: () => Promise.reject(new Error('chunk 404')),
      liar: async () => mod('other'),
    });
    await expect(k.view.install(id('broken'))).rejects.toMatchObject({ _tag: 'PluginLoadError' });
    await expect(k.view.install(id('liar'))).rejects.toMatchObject({ _tag: 'PluginLoadError' });
    await expect(k.view.install(id('missing'))).rejects.toMatchObject({ _tag: 'PluginLoadError' });
    await k.dispose();
  });
});
