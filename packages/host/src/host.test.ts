import { describe, expect, it } from 'vitest';
import { Effect, Layer } from 'effect';
import { InstallStore, PluginLoader, createKernel } from '@bbblank/kernel';
import { definePlugin } from '@bbblank/sdk';
import type { PluginID, SemVer } from '@bbblank/sdk';
import { EsmPluginLoader, verifyIntegrity } from './esm-loader.js';
import { localStorageKeyValue } from './local-storage.js';

const id = (s: string) => s as PluginID;
const CODE = 'export default { hello: 1 }';
const bytes = new TextEncoder().encode(CODE);
const sri = async (alg: 'SHA-384' | 'SHA-256', data: Uint8Array) =>
  `${alg.replace('-', '').toLowerCase()}-${btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest(alg, data as Uint8Array<ArrayBuffer>))))}`;

const plugin = definePlugin({
  manifest: { id: id('remote'), name: 'Remote', version: '1.0.0' as SemVer },
  capabilities: [] as const,
  setup: () => {},
});

const fakeFetch = (body: Uint8Array, headers: Record<string, string> = {}) =>
  (async () => new Response(body as Uint8Array<ArrayBuffer>, { status: 200, headers })) as typeof fetch;

const load = (opts: Parameters<typeof EsmPluginLoader>[0]) =>
  Effect.runPromise(
    Effect.flatMap(Effect.service(PluginLoader), l => l.load(id('remote'))).pipe(
      Effect.provide(EsmPluginLoader(opts)),
      Effect.flip
    )
  ).then(
    e => ({ ok: false as const, cause: String((e as { cause: unknown }).cause) }),
    () => ({ ok: true as const })
  );

describe('EsmPluginLoader', () => {
  const base = { allowOrigins: ['https://cdn.example'], baseUrl: 'https://cdn.example/' };

  it('verifies SRI and imports exactly the verified bytes', async () => {
    const integrity = await sri('SHA-384', bytes);
    let imported: string | undefined;
    const layer = EsmPluginLoader({
      ...base,
      catalog: { remote: { url: '/p.js', integrity } },
      fetch: fakeFetch(bytes),
      importModule: async code => ((imported = code), { default: plugin }),
    });
    const mod = await Effect.runPromise(
      Effect.flatMap(Effect.service(PluginLoader), l => l.load(id('remote'))).pipe(Effect.provide(layer))
    );
    expect(mod).toBe(plugin);
    expect(imported).toBe(CODE);
  });

  it('rejects integrity mismatch, disallowed origins, missing SRI and oversized bundles', async () => {
    const wrong = await sri('SHA-384', new TextEncoder().encode('tampered'));
    const good = await sri('SHA-256', bytes);
    const importModule = async () => ({ default: plugin });

    expect(
      await load({ ...base, catalog: { remote: { url: '/p.js', integrity: wrong } }, fetch: fakeFetch(bytes), importModule })
    ).toMatchObject({ ok: false, cause: expect.stringContaining('integrity mismatch') });

    expect(
      await load({ ...base, catalog: { remote: { url: 'https://evil.example/p.js', integrity: good } }, fetch: fakeFetch(bytes), importModule })
    ).toMatchObject({ ok: false, cause: expect.stringContaining('origin not allowed') });

    expect(
      await load({ ...base, catalog: { remote: { url: '/p.js' } }, fetch: fakeFetch(bytes), importModule })
    ).toMatchObject({ ok: false, cause: expect.stringContaining('missing integrity') });

    expect(
      await load({ ...base, maxBytes: 8, catalog: { remote: { url: '/p.js', integrity: good } }, fetch: fakeFetch(bytes), importModule })
    ).toMatchObject({ ok: false, cause: expect.stringContaining('too large') });
  });

  it('verifyIntegrity accepts any matching digest in a multi-token SRI', async () => {
    const good = await sri('SHA-256', bytes);
    expect(await verifyIntegrity(bytes, `sha512-bogus ${good}`)).toBe(true);
    expect(await verifyIntegrity(bytes, 'md5-abc')).toBe(false);
  });
});

describe('localStorageKeyValue', () => {
  it('backs a durable InstallStore across kernel instances', async () => {
    localStorage.clear();
    const p = definePlugin({
      manifest: { id: id('p'), name: 'P', version: '1.0.0' as SemVer },
      capabilities: [] as const,
      setup: () => {},
    });
    const make = () =>
      createKernel({
        capabilities: [],
        capabilityLayer: Layer.empty,
        loader: PluginLoader.fromMap(new Map([[id('p'), p]])),
        store: InstallStore.fromKeyValue.pipe(Layer.provide(localStorageKeyValue())),
      });
    const k1 = make();
    await k1.view.install(id('p'));
    await k1.dispose();
    expect(localStorage.getItem('bbblank:install:p')).toBe('{"id":"p","enabled":true}');

    const k2 = make();
    const report = await k2.bootstrap();
    expect(report.enabled).toEqual([id('p')]);
    await k2.dispose();
  });
});
