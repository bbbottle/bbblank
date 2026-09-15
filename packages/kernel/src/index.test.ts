import { assert, describe, it } from '@effect/vitest';
import { Context, Effect, Layer, Schema } from 'effect';
import {
  defineCapability,
  defineEffectPlugin,
  definePlugin,
  defineTopic,
  PluginID,
  PluginSetupError,
  SemVer,
} from '@bbblank/sdk';
import { createKernel } from './create-kernel.js';
import { InstallStore } from './install-store.js';
import { PluginLoader } from './plugin-loader.js';
import { PermissionPolicy } from './permission-policy.js';
import { PermissionDenied } from './errors.js';
import { topoLevels } from './topo.js';

interface EchoShape {
  readonly shout: (s: string) => Effect.Effect<string>;
}
interface EchoFacade {
  readonly shout: (s: string) => string;
}
const Echo = defineCapability<'echo', EchoShape, EchoFacade>('echo', (shape, ctx) => ({
  shout: s => ctx.runSync(shape.shout(s)),
}));
const EchoLive = Layer.succeed(Echo.tag, { shout: s => Effect.succeed(s.toUpperCase()) });

const makeKernel = (mods: Parameters<typeof PluginLoader.fromMap>[0]) =>
  createKernel({
    capabilities: [Echo],
    capabilityLayer: EchoLive,
    loader: PluginLoader.fromMap(mods),
    store: InstallStore.memory(),
    permission: PermissionPolicy.permissive,
    dev: false,
  });

const id = (s: string) => s as PluginID;
const v = '1.0.0' as SemVer;

describe('kernel', () => {
  it('install + activate a plain plugin with a capability facade', async () => {
    let seen: string | undefined;
    const p = definePlugin({
      manifest: { id: id('p1'), name: 'P1', version: v },
      capabilities: [Echo],
      setup: api => {
        seen = api.caps.echo.shout('hi');
      },
    });
    const k = makeKernel(new Map([[id('p1'), p]]));
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
      manifest: { id: id('sub'), name: 'Sub', version: v },
      capabilities: [] as const,
      setup: api => {
        api.events.on(Tick, p => received.push(p.n));
      },
    });
    const pub = definePlugin({
      manifest: { id: id('pub'), name: 'Pub', version: v, dependencies: [id('sub')] },
      capabilities: [] as const,
      setup: api => {
        api.events.emit(Tick, { n: 1 });
      },
    });
    const k = makeKernel(
      new Map([
        [id('sub'), sub],
        [id('pub'), pub],
      ])
    );
    await k.view.install(id('sub'));
    await k.view.install(id('pub'));
    assert.deepEqual(received, [1]);

    await k.view.disable(id('pub'));
    await k.view.disable(id('sub'));
    await k.dispose();
  });

  it('effect plugin: layer R bounded by declared capabilities', async () => {
    class Counter extends Context.Service<Counter, { readonly hit: () => void }>()('counter') {}
    let hits = 0;
    const fx = defineEffectPlugin({
      manifest: { id: id('fx'), name: 'FX', version: v },
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
    const k = makeKernel(new Map([[id('fx'), fx]]));
    await k.view.install(id('fx'));
    assert.strictEqual(k.view.snapshot().plugins.get(id('fx'))?.status, 'enabled');
    await k.dispose();
  });

  it('guest plugin cannot register inter-plugin services', async () => {
    const bad = definePlugin({
      manifest: { id: id('bad'), name: 'Bad', version: v },
      capabilities: [] as const,
      setup: api => {
        api.services.register({ key: 'x' } as never, {});
      },
    });
    const k = makeKernel(new Map([[id('bad'), bad]]));
    let err: unknown;
    try {
      await k.view.install(id('bad'));
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof PluginSetupError);
    assert.ok(err.cause instanceof PermissionDenied);
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
