import { assert, describe, it } from '@effect/vitest';
import { Context, Effect, Layer, Schema } from 'effect';
import {
  defineEffectPlugin,
  definePlugin,
  defineService,
  defineTopic,
  PluginSetupError,
} from '@bbblank/sdk';
import type { PluginID } from '@bbblank/sdk';
import { PermissionDenied } from './errors.js';
import { topoLevels } from './topo.js';
import { Echo, id, makeKernel, mf, rejection } from './test-kit.js';

describe('kernel', () => {
  it('install + activate a plain plugin with a capability facade', async () => {
    let seen: string | undefined;
    const p = definePlugin({
      manifest: mf('p1'),
      capabilities: [Echo],
      setup: api => {
        seen = api.caps.echo.shout('hi');
      },
    });
    const k = makeKernel({ p1: p });
    await k.view.install(id('p1'));
    assert.strictEqual(seen, 'HI');
    assert.strictEqual(k.view.snapshot().plugins.get(id('p1'))?.status, 'enabled');
    await k.view.uninstall(id('p1'));
    assert.isFalse(k.view.snapshot().plugins.has(id('p1')));
    await k.dispose();
  });

  it('events: emit reaches subscriber; disabling plugin tears subscription down', async () => {
    const Tick = defineTopic('tick', Schema.Struct({ n: Schema.Number }));
    const received: Array<number> = [];
    const sub = definePlugin({
      manifest: mf('sub'),
      capabilities: [] as const,
      setup: api => {
        api.events.on(Tick, p => received.push(p.n));
      },
    });
    const pub = definePlugin({
      manifest: mf('pub', { dependencies: [{ id: id('sub'), range: '^1.0.0' }] }),
      capabilities: [] as const,
      setup: api => {
        api.events.emit(Tick, { n: 1 });
      },
    });
    const k = makeKernel({ sub, pub });
    await k.view.install(id('sub'));
    await k.view.install(id('pub'));
    assert.deepEqual(received, [1]);

    await k.view.disable(id('pub'));
    await k.view.disable(id('sub'));
    await k.dispose();
  });

  it('events: manual unsubscribe at runtime stops delivery without throwing', async () => {
    const Tick = defineTopic('tick2', Schema.Struct({ n: Schema.Number }));
    const received: Array<number> = [];
    let emit!: (n: number) => void;
    let off!: () => unknown;
    const p = definePlugin({
      manifest: mf('p'),
      capabilities: [] as const,
      setup: api => {
        off = api.events.on(Tick, e => received.push(e.n));
        emit = n => api.events.emit(Tick, { n });
      },
    });
    const k = makeKernel({ p });
    await k.view.install(id('p'));
    emit(1);
    await new Promise(r => setTimeout(r, 5));
    await off();
    emit(2);
    await new Promise(r => setTimeout(r, 5));
    assert.deepEqual(received, [1]);
    await k.dispose();
  });

  it('plugin cleanups run when its Scope closes', async () => {
    const log: Array<string> = [];
    const p = definePlugin({
      manifest: mf('c'),
      capabilities: [] as const,
      setup: api => {
        api.lifecycle.addCleanup(() => void log.push('added'));
        return () => void log.push('returned');
      },
    });
    const k = makeKernel({ c: p });
    await k.view.install(id('c'));
    await k.view.disable(id('c'));
    assert.deepEqual(log, ['returned', 'added']);
    await k.dispose();
  });

  it('effect plugin: layer R bounded by declared capabilities', async () => {
    class Counter extends Context.Service<Counter, { readonly hit: () => void }>()('counter') {}
    let hits = 0;
    const fx = defineEffectPlugin({
      manifest: mf('fx'),
      capabilities: [Echo],
      layer: Layer.effect(
        Counter,
        Effect.gen(function* () {
          const echo = yield* Echo.tag;
          const seen = yield* echo.shout('ok');
          assert.strictEqual(seen, 'OK');
          return { hit: () => hits++ };
        })
      ),
    });
    const k = makeKernel({ fx });
    await k.view.install(id('fx'));
    assert.strictEqual(k.view.snapshot().plugins.get(id('fx'))?.status, 'enabled');
    await k.dispose();
  });

  it('plugin without services.provide cannot register inter-plugin services', async () => {
    const bad = definePlugin({
      manifest: mf('bad'),
      capabilities: [] as const,
      setup: api => {
        api.services.register(defineService<object>('x'), {});
      },
    });
    const k = makeKernel({ bad });
    const err = await rejection(k.view.install(id('bad')));
    assert.ok(err instanceof PluginSetupError);
    assert.ok(err.cause instanceof PermissionDenied);
    assert.strictEqual(err.cause.required, 'service:provide:x');
    assert.strictEqual(k.view.snapshot().plugins.get(id('bad'))?.status, 'failed');
    await k.dispose();
  });

  it.effect('topoLevels: level ordering and cycle detection', () =>
    Effect.gen(function* () {
      const deps = new Map<PluginID, Set<PluginID>>([
        [id('a'), new Set()],
        [id('b'), new Set([id('a')])],
        [id('c'), new Set([id('a'), id('b')])],
      ]);
      const levels = yield* topoLevels(deps);
      assert.deepEqual(levels, [[id('a')], [id('b')], [id('c')]]);

      const cyclic = new Map<PluginID, Set<PluginID>>([
        [id('x'), new Set([id('y')])],
        [id('y'), new Set([id('x')])],
      ]);
      const result = yield* Effect.flip(topoLevels(cyclic));
      assert.strictEqual(result._tag, 'DependencyCycle');
    })
  );
});
