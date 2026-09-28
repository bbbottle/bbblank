/** §10.1 并发、有序停机、bootstrap 半失败语义 */
import { assert, describe, it } from '@effect/vitest';
import { definePlugin } from '@bbblank/sdk';
import type { AnyPluginModule } from '@bbblank/sdk';
import { InstallStore } from './install-store.js';
import { id, makeKernel, mf, rejection, sleep, statusOf } from './test-kit.js';

const dep = (name: string, range = '^1.0.0') => ({ id: id(name), range });

describe('lifecycle: concurrency', () => {
  it('concurrent enable of the same plugin builds its Scope exactly once', async () => {
    let setups = 0;
    const p = definePlugin({
      manifest: mf('p'),
      capabilities: [] as const,
      setup: async () => {
        setups++;
        await sleep(10);
      },
    });
    const k = makeKernel({ p });
    await k.view.install(id('p'));
    await k.view.disable(id('p'));
    setups = 0;
    await Promise.all([k.view.enable(id('p')), k.view.enable(id('p')), k.view.enable(id('p'))]);
    assert.strictEqual(setups, 1);
    assert.strictEqual(statusOf(k, 'p'), 'enabled');
    await k.dispose();
  });

  it('concurrent install of the same plugin activates once', async () => {
    let setups = 0;
    const p = definePlugin({
      manifest: mf('p'),
      capabilities: [] as const,
      setup: async () => {
        setups++;
        await sleep(5);
      },
    });
    const k = makeKernel({ p });
    await Promise.all([k.view.install(id('p')), k.view.install(id('p'))]);
    assert.strictEqual(setups, 1);
    await k.dispose();
  });

  it('enable(dependent) racing disable(dependency) never leaves a dependent without its dependency', async () => {
    const a = definePlugin({ manifest: mf('a'), capabilities: [] as const, setup: () => {} });
    const b = definePlugin({
      manifest: mf('b', { dependencies: [dep('a')] }),
      capabilities: [] as const,
      setup: () => sleep(5),
    });
    for (let i = 0; i < 10; i++) {
      const k = makeKernel({ a, b });
      await k.view.install(id('a'));
      await k.view.install(id('b'));
      await k.view.disable(id('b'));
      const results = await Promise.allSettled([k.view.enable(id('b')), k.view.disable(id('a'))]);
      const bOn = statusOf(k, 'b') === 'enabled';
      const aOn = statusOf(k, 'a') === 'enabled';
      assert.ok(!bOn || aOn, `iteration ${i}: b enabled while a is ${statusOf(k, 'a')}`);
      // 恰好一个成功：先得锁者赢，另一方得到 DependencyMissing / DependentsActive
      assert.strictEqual(results.filter(r => r.status === 'fulfilled').length, 1);
      await k.dispose();
    }
  });

  it('observers see the intermediate starting state', async () => {
    let release!: () => void;
    const p = definePlugin({
      manifest: mf('p'),
      capabilities: [] as const,
      setup: () => new Promise<void>(r => (release = r)),
    });
    const k = makeKernel({ p });
    const seen: Array<string | undefined> = [];
    const unsub = k.view.subscribe(() => seen.push(statusOf(k, 'p')));
    const done = k.view.install(id('p'));
    await sleep(5);
    assert.strictEqual(statusOf(k, 'p'), 'starting');
    release();
    await done;
    unsub();
    assert.include(seen, 'starting');
    assert.strictEqual(statusOf(k, 'p'), 'enabled');
    await k.dispose();
  });
});

describe('lifecycle: ordered shutdown', () => {
  it('dispose closes plugins in reverse topological order (dependents first)', async () => {
    const order: Array<string> = [];
    const mk = (name: string, deps: Array<string>) =>
      definePlugin({
        manifest: mf(name, { dependencies: deps.map(d => dep(d)) }),
        capabilities: [] as const,
        setup: () => () => void order.push(name),
      });
    const k = makeKernel({
      a: mk('a', []),
      b: mk('b', ['a']),
      c: mk('c', ['b']),
      d: mk('d', ['a']),
    });
    for (const n of ['a', 'b', 'c', 'd']) await k.view.install(id(n));
    await k.dispose();
    const pos = (n: string) => order.indexOf(n);
    assert.strictEqual(order.length, 4);
    assert.ok(pos('c') < pos('b'));
    assert.ok(pos('b') < pos('a'));
    assert.ok(pos('d') < pos('a'));
    assert.strictEqual(order.at(-1), 'a');
  });

  it('a hanging cleanup is bounded by timeouts.stop and does not block the rest', async () => {
    const order: Array<string> = [];
    const a = definePlugin({
      manifest: mf('a'),
      capabilities: [] as const,
      setup: () => () => void order.push('a'),
    });
    const b = definePlugin({
      manifest: mf('b', { dependencies: [dep('a')] }),
      capabilities: [] as const,
      setup: () => () => new Promise<void>(() => {}),
    });
    const k = makeKernel({ a, b }, { timeouts: { stop: '20 millis' } });
    await k.view.install(id('a'));
    await k.view.install(id('b'));
    await k.dispose();
    assert.deepEqual(order, ['a']);
  });
});

describe('lifecycle: bootstrap partial failure', () => {
  it('failed plugins do not block others; dependents of failures are marked failed', async () => {
    const ok = (name: string, deps: Array<string> = []): AnyPluginModule =>
      definePlugin({
        manifest: mf(name, { dependencies: deps.map(d => dep(d)) }),
        capabilities: [] as const,
        setup: () => {},
      });
    const boom = definePlugin({
      manifest: mf('boom'),
      capabilities: [] as const,
      setup: () => {
        throw new Error('kaboom');
      },
    });
    const k = makeKernel(
      { boom, child: ok('child', ['boom']), solo: ok('solo'), grand: ok('grand', ['child']) },
      {
        store: InstallStore.memory([
          id('boom'),
          id('child'),
          id('solo'),
          id('grand'),
          id('ghost'), // loader 中不存在
        ]),
      }
    );
    const report = await k.bootstrap();
    assert.deepEqual([...report.enabled], [id('solo')]);
    const failed = new Map(report.failed.map(f => [f.id, f.error.tag]));
    assert.strictEqual(failed.get(id('boom')), 'PluginSetupError');
    assert.strictEqual(failed.get(id('child')), 'DependencyMissing');
    assert.strictEqual(failed.get(id('grand')), 'DependencyMissing');
    assert.strictEqual(failed.get(id('ghost')), 'PluginLoadError');
    // 实际态收敛为 failed，而不是悬空
    for (const n of ['boom', 'child', 'grand', 'ghost']) assert.strictEqual(statusOf(k, n), 'failed');
    assert.strictEqual(statusOf(k, 'solo'), 'enabled');
    await k.dispose();
  });

  it('dependency cycles are reported per plugin instead of failing bootstrap', async () => {
    const mk = (name: string, d: string) =>
      definePlugin({
        manifest: mf(name, { dependencies: [dep(d)] }),
        capabilities: [] as const,
        setup: () => {},
      });
    const k = makeKernel(
      { x: mk('x', 'y'), y: mk('y', 'x') },
      { store: InstallStore.memory([id('x'), id('y')]) }
    );
    const report = await k.bootstrap();
    assert.deepEqual(
      report.failed.map(f => f.error.tag),
      ['DependencyCycle', 'DependencyCycle']
    );
    await k.dispose();
  });

  it('disabled records are registered but not activated', async () => {
    let setups = 0;
    const p = definePlugin({ manifest: mf('p'), capabilities: [] as const, setup: () => void setups++ });
    const k = makeKernel({ p }, { store: InstallStore.memory([{ id: id('p'), enabled: false }]) });
    await k.bootstrap();
    assert.strictEqual(setups, 0);
    assert.strictEqual(statusOf(k, 'p'), 'disabled');
    await k.dispose();
  });

  it('disable refuses while dependents are active', async () => {
    const a = definePlugin({ manifest: mf('a'), capabilities: [] as const, setup: () => {} });
    const b = definePlugin({ manifest: mf('b', { dependencies: [dep('a')] }), capabilities: [] as const, setup: () => {} });
    const k = makeKernel({ a, b });
    await k.view.install(id('a'));
    await k.view.install(id('b'));
    const err = await rejection(k.view.disable(id('a')));
    assert.strictEqual(err._tag, 'DependentsActive');
    await k.dispose();
  });
});
