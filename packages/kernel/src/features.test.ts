/** §10.3 版本、§10.5 权限、§10.6 背压、§10.7 配置、§10.8 持久化、§10.9 诊断 */
import { assert, describe, it } from '@effect/vitest';
import { Context, Effect, Layer, Schema } from 'effect';
import {
  defineEffectPlugin,
  definePlugin,
  defineTopic,
  EventPayloadInvalid,
  isSdkCompatible,
  PermissionDenied,
  satisfies,
  Storage,
} from '@bbblank/sdk';
import type { AnyPluginModule } from '@bbblank/sdk';
import { createKernel } from './create-kernel.js';
import { InstallStore } from './install-store.js';
import { PermissionPolicy } from './permission-policy.js';
import { PluginLoader } from './plugin-loader.js';
import { PluginStorageLive } from './plugin-storage.js';
import { Echo, id, makeKernel, mf, rejection, sharedKv, sleep, statusOf, v, waitFor } from './test-kit.js';

const noop = (name: string, extra?: object): AnyPluginModule =>
  definePlugin({ manifest: mf(name, extra), capabilities: [] as const, setup: () => {} });

describe('semver', () => {
  it('satisfies: caret / tilde / comparators / or', () => {
    const cases: Array<[string, string, boolean]> = [
      ['1.2.3', '^1.2.0', true],
      ['2.0.0', '^1.2.0', false],
      ['0.2.5', '^0.2.1', true],
      ['0.3.0', '^0.2.1', false],
      ['1.2.9', '~1.2.3', true],
      ['1.3.0', '~1.2.3', false],
      ['1.5.0', '>=1.2.0 <2.0.0', true],
      ['2.0.0-rc.1', '^1.0.0', false],
      ['3.1.0', '^1.0.0 || ^3.0.0', true],
      ['1.0.0', '1.0.0', true],
      ['9.9.9', '*', true],
    ];
    for (const [ver, range, ok] of cases) assert.strictEqual(satisfies(ver, range), ok, `${ver} ${range}`);
  });

  it('sdk compatibility window', () => {
    assert.isTrue(isSdkCompatible('0.1.0', '0.1.5'));
    assert.isFalse(isSdkCompatible('0.1.0', '0.2.0'));
    assert.isTrue(isSdkCompatible('1.2.0', '1.4.0'));
    assert.isFalse(isSdkCompatible('1.5.0', '1.4.0'));
    assert.isFalse(isSdkCompatible('1.0.0', '2.0.0'));
  });
});

describe('versions & manifest validation', () => {
  it('dependency range mismatch fails with DependencyVersionMismatch', async () => {
    const k = makeKernel({
      router: noop('router'),
      app: noop('app', { dependencies: [{ id: id('router'), range: '^2.0.0' }] }),
    });
    await k.view.install(id('router'));
    const err = await rejection(k.view.install(id('app')));
    assert.strictEqual(err._tag, 'DependencyVersionMismatch');
    assert.strictEqual(err.actual, '1.0.0');
    await k.dispose();
  });

  it('plugins built against an incompatible sdk are rejected', async () => {
    const k = makeKernel({ old: noop('old', { sdkVersion: v('9.0.0') }) });
    const err = await rejection(k.view.install(id('old')));
    assert.strictEqual(err._tag, 'SdkIncompatible');
    await k.dispose();
  });

  it('manifests not matching the current schema are rejected (no migration)', async () => {
    const legacy = definePlugin({
      manifest: { ...mf('legacy'), dependencies: ['core'] } as never,
      capabilities: [] as const,
      setup: () => {},
    });
    const k = makeKernel({ legacy });
    const err = await rejection(k.view.install(id('legacy')));
    assert.strictEqual(err._tag, 'ManifestInvalid');
    await k.dispose();
  });

  it('loader returning a malformed module fails with ManifestInvalid', async () => {
    const k = makeKernel({ bad: { kind: 'plain', manifest: mf('bad'), capabilities: [] } as never });
    const err = await rejection(k.view.install(id('bad')));
    assert.strictEqual(err._tag, 'ManifestInvalid');
    await k.dispose();
  });
});

describe('permissions', () => {
  it('capability access is intersected with host limits; facade write methods are gated and audited', async () => {
    let caught: unknown;
    const p = definePlugin({
      manifest: mf('p'),
      capabilities: [Echo],
      setup: api => {
        assert.strictEqual(api.caps.echo.shout('x'), 'X'); // read 允许
        try {
          api.caps.echo.reset();
        } catch (e) {
          caught = e;
        }
      },
    });
    const k = makeKernel(
      { p },
      { permission: PermissionPolicy.restrict(() => ({ access: { echo: 'read' } })) }
    );
    await k.view.install(id('p'));
    assert.ok(caught instanceof PermissionDenied);
    assert.strictEqual((caught as PermissionDenied).required, 'capability:echo:write');
    const { audit } = await k.view.diagnostics();
    assert.ok(audit.some(e => e.action === 'capability:grant' && e.target === 'echo:read'));
    assert.ok(audit.some(e => e.action === 'echo:require:write' && e.outcome === 'denied'));
    await k.dispose();
  });

  it('a capability denied by policy prevents activation', async () => {
    const p = definePlugin({ manifest: mf('p'), capabilities: [Echo], setup: () => {} });
    const k = makeKernel({ p }, { permission: PermissionPolicy.restrict(() => ({})) });
    const err = await rejection(k.view.install(id('p')));
    assert.strictEqual(err._tag, 'PermissionDenied');
    assert.strictEqual(err.required, 'capability:echo');
    await k.dispose();
  });

  it('plugins may narrow their own access in the manifest', async () => {
    let caught: unknown;
    const p = definePlugin({
      manifest: mf('p', { access: { echo: 'read' as const } }),
      capabilities: [Echo],
      setup: api => {
        try {
          api.caps.echo.reset();
        } catch (e) {
          caught = e;
        }
      },
    });
    const k = makeKernel({ p });
    await k.view.install(id('p'));
    assert.ok(caught instanceof PermissionDenied);
    await k.dispose();
  });
});

describe('event backpressure', () => {
  const Tick = defineTopic('tick', Schema.Struct({ n: Schema.Number }));

  const setup = (strategy: 'dropping' | 'sliding') => {
    const got: Array<number> = [];
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    let emit!: (n: number) => void;
    const slow = definePlugin({
      manifest: mf('slow'),
      capabilities: [] as const,
      setup: api => {
        api.events.on(Tick, async p => {
          got.push(p.n);
          await gate;
        });
      },
    });
    const pub = definePlugin({
      manifest: mf('pub'),
      capabilities: [] as const,
      setup: api => {
        emit = n => api.events.emit(Tick, { n });
      },
    });
    const k = makeKernel({ slow, pub }, { events: { capacity: 2, strategy } });
    return { k, got, release: () => release(), emit: (n: number) => emit(n) };
  };

  it('dropping: a slow subscriber drops newest messages into dead letters', async () => {
    const t = setup('dropping');
    await t.k.view.install(id('slow'));
    await t.k.view.install(id('pub'));
    t.emit(1);
    await sleep(5); // 1 被取走，消费者卡在 gate
    for (const n of [2, 3, 4, 5]) t.emit(n);
    t.release();
    await waitFor(() => t.got.length === 3);
    assert.deepEqual(t.got, [1, 2, 3]);
    const { events } = await t.k.view.diagnostics();
    assert.strictEqual(events.dropped, 2);
    assert.deepEqual(
      events.deadLetters.map(d => [d.subscriber, d.reason]),
      [
        ['slow', 'dropped-newest'],
        ['slow', 'dropped-newest'],
      ]
    );
    await t.k.dispose();
  });

  it('sliding: drops oldest messages', async () => {
    const t = setup('sliding');
    await t.k.view.install(id('slow'));
    await t.k.view.install(id('pub'));
    t.emit(1);
    await sleep(5);
    for (const n of [2, 3, 4, 5]) t.emit(n);
    t.release();
    await waitFor(() => t.got.length === 3);
    assert.deepEqual(t.got, [1, 4, 5]);
    await t.k.dispose();
  });

  it('payload validation is on by default and throws to the emitter', async () => {
    let caught: unknown;
    const pub = definePlugin({
      manifest: mf('pub'),
      capabilities: [] as const,
      setup: api => {
        try {
          api.events.emit(Tick, { n: 'nope' } as never);
        } catch (e) {
          caught = e;
        }
      },
    });
    const k = makeKernel({ pub });
    await k.view.install(id('pub'));
    assert.ok(caught instanceof EventPayloadInvalid);
    await k.dispose();
  });
});

describe('plugin config', () => {
  const Config = Schema.Struct({ greeting: Schema.String });

  it('setup receives the decoded config; reconfigure validates, persists and restarts', async () => {
    const seen: Array<string> = [];
    const p = definePlugin({
      manifest: mf('greeter'),
      capabilities: [] as const,
      configSchema: Config,
      defaultConfig: { greeting: 'hello' },
      setup: (_api, config) => {
        seen.push(config.greeting);
      },
    });
    const child = noop('child', { dependencies: [{ id: id('greeter'), range: '*' }] });
    const kv = new Map<string, string>();
    const store = InstallStore.fromKeyValue.pipe(Layer.provide(sharedKv(kv)));
    const k = makeKernel({ greeter: p, child }, { store });
    await k.view.install(id('greeter'));
    await k.view.install(id('child'));
    assert.deepEqual(seen, ['hello']);

    const err = await rejection(k.view.reconfigure(id('greeter'), { greeting: 42 }));
    assert.strictEqual(err._tag, 'ConfigInvalid');
    assert.deepEqual(seen, ['hello']); // 无副作用

    await k.view.reconfigure(id('greeter'), { greeting: 'hi' });
    assert.deepEqual(seen, ['hello', 'hi']);
    assert.strictEqual(statusOf(k, 'child'), 'enabled'); // 级联重启后恢复
    assert.deepEqual(JSON.parse(kv.get('bbblank:install:greeter')!), {
      id: 'greeter',
      enabled: true,
      config: { greeting: 'hi' },
    });
    await k.dispose();
  });

  it('effect plugins receive config through a layer factory', async () => {
    class Greeting extends Context.Service<Greeting, string>()('greeting') {}
    let got: string | undefined;
    const fx = defineEffectPlugin({
      manifest: mf('fx'),
      capabilities: [] as const,
      configSchema: Config,
      layer: (c: typeof Config.Type) =>
        Layer.effect(
          Greeting,
          Effect.sync(() => (got = c.greeting))
        ),
    });
    const k = makeKernel({ fx });
    await k.view.install(id('fx'), { config: { greeting: 'yo' } });
    assert.strictEqual(got, 'yo');
    await k.dispose();
  });

  it('invalid stored config fails activation with ConfigInvalid', async () => {
    const p = definePlugin({
      manifest: mf('p'),
      capabilities: [] as const,
      configSchema: Config,
      setup: () => {},
    });
    const k = makeKernel(
      { p },
      { store: InstallStore.memory([{ id: id('p'), enabled: true, config: { greeting: 1 } }]) }
    );
    const report = await k.bootstrap();
    assert.strictEqual(report.failed[0]?.error.tag, 'ConfigInvalid');
    await k.dispose();
  });
});

describe('persistence & recovery', () => {
  const kernelWith = (kv: Map<string, string>, mods: Record<string, AnyPluginModule>) =>
    makeKernel(mods, { store: InstallStore.fromKeyValue.pipe(Layer.provide(sharedKv(kv))) });

  it('desired state survives restarts; disable is persisted; corrupted records are skipped', async () => {
    const kv = new Map<string, string>();
    const mods = { a: noop('a'), b: noop('b') };
    const k1 = kernelWith(kv, mods);
    await k1.view.install(id('a'));
    await k1.view.install(id('b'));
    await k1.view.disable(id('b'));
    await k1.dispose();

    kv.set('bbblank:install:junk', '{not json');
    const k2 = kernelWith(kv, mods);
    const report = await k2.bootstrap();
    assert.deepEqual([...report.enabled], [id('a')]);
    assert.strictEqual(statusOf(k2, 'b'), 'disabled');
    assert.isFalse(k2.view.snapshot().plugins.has(id('junk')));

    await k2.view.uninstall(id('a'));
    assert.isFalse(kv.has('bbblank:install:a'));
    await k2.dispose();
  });

  it('Storage capability is namespaced per plugin, gated by access, and cleared on uninstall', async () => {
    const kv = new Map<string, string>();
    let reader!: { get: (k: string) => Promise<string | undefined>; set: (k: string, v: string) => Promise<void> };
    const writer = definePlugin({
      manifest: mf('writer'),
      capabilities: [Storage],
      setup: async api => {
        await api.caps.storage.set('theme', 'dark');
      },
    });
    const ro = definePlugin({
      manifest: mf('ro', { access: { storage: 'read' as const } }),
      capabilities: [Storage],
      setup: api => {
        reader = api.caps.storage;
      },
    });
    const kvLayer = sharedKv(kv);
    const k = createKernel({
      capabilities: [Storage],
      capabilityLayer: PluginStorageLive.pipe(Layer.provide(kvLayer)),
      loader: PluginLoader.fromMap(new Map([[id('writer'), writer], [id('ro'), ro]])),
      store: InstallStore.fromKeyValue.pipe(Layer.provide(kvLayer)),
    });
    await k.view.install(id('writer'));
    await k.view.install(id('ro'));
    assert.strictEqual(kv.get('bbblank:plugin:writer:theme'), 'dark');
    assert.strictEqual(await reader.get('theme'), undefined); // 看不到别的插件的命名空间
    const err = await rejection(reader.set('x', 'y'));
    assert.ok(err instanceof PermissionDenied);

    await k.view.uninstall(id('writer'));
    assert.isFalse(kv.has('bbblank:plugin:writer:theme'));
    await k.dispose();
  });
});

describe('diagnostics', () => {
  it('exports a JSON-serializable health report', async () => {
    const boom = definePlugin({
      manifest: mf('boom'),
      capabilities: [] as const,
      setup: () => {
        throw new Error('nope');
      },
    });
    const k = makeKernel({ ok: noop('ok'), boom });
    await k.view.install(id('ok'));
    await rejection(k.view.install(id('boom')));
    const d = await k.view.diagnostics();
    const round = JSON.parse(JSON.stringify(d));
    assert.deepEqual(round, d);
    assert.isFalse(d.healthy);
    const b = d.plugins.find(p => p.id === 'boom')!;
    assert.strictEqual(b.status, 'failed');
    assert.strictEqual(b.lastError?.tag, 'PluginSetupError');
    assert.include(b.lastError?.message ?? '', 'nope');
    await k.dispose();
  });
});
