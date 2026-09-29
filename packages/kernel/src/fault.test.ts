/** §10.2 故障隔离、监管重启、熔断 */
import { assert, describe, it } from '@effect/vitest';
import { Schema } from 'effect';
import { definePlugin, defineService, defineTopic } from '@bbblank/sdk';
import { id, makeKernel, mf, sleep, statusOf, waitFor } from './test-kit.js';

const Ping = defineTopic('ping', Schema.Struct({ fail: Schema.Boolean }));

const flaky = (name: string, counter: { setups: number }) =>
  definePlugin({
    manifest: mf(name),
    capabilities: [] as const,
    setup: api => {
      counter.setups++;
      api.events.on(Ping, p => {
        if (p.fail) throw new Error('callback exploded');
      });
    },
  });

const emitter = definePlugin({
  manifest: mf('emitter'),
  capabilities: [] as const,
  setup: () => {},
});

describe('fault isolation', () => {
  it('a throwing event callback is attributed to the subscriber, which is restarted', async () => {
    const c = { setups: 0 };
    let emit!: (fail: boolean) => void;
    const pub = definePlugin({
      manifest: mf('pub'),
      capabilities: [] as const,
      setup: api => {
        emit = fail => api.events.emit(Ping, { fail });
      },
    });
    const k = makeKernel({ sub: flaky('sub', c), pub });
    await k.view.install(id('sub'));
    await k.view.install(id('pub'));
    assert.doesNotThrow(() => emit(true)); // 不逃逸到发布方
    await waitFor(() => c.setups === 2 && statusOf(k, 'sub') === 'enabled');
    const rec = k.view.snapshot().plugins.get(id('sub'))!;
    assert.strictEqual(rec.restarts, 1);
    assert.strictEqual(statusOf(k, 'pub'), 'enabled');
    await k.dispose();
  });

  it('async callback rejection is also caught', async () => {
    let setups = 0;
    let emit!: () => void;
    const sub = definePlugin({
      manifest: mf('sub'),
      capabilities: [] as const,
      setup: api => {
        setups++;
        api.events.on(Ping, async () => {
          throw new Error('async boom');
        });
        emit = () => api.events.emit(Ping, { fail: true });
      },
    });
    const k = makeKernel({ sub });
    await k.view.install(id('sub'));
    emit();
    await waitFor(() => setups === 2 && statusOf(k, 'sub') === 'enabled');
    await k.dispose();
  });

  it('circuit breaker: exceeding maxRestarts quarantines the plugin and fails its dependents', async () => {
    const c = { setups: 0 };
    let emit!: () => void;
    const pub = definePlugin({
      manifest: mf('pub'),
      capabilities: [] as const,
      setup: api => {
        emit = () => api.events.emit(Ping, { fail: true });
      },
    });
    const child = definePlugin({
      manifest: mf('child', { dependencies: [{ id: id('sub'), range: '*' }] }),
      capabilities: [] as const,
      setup: () => {},
    });
    const k = makeKernel({ sub: flaky('sub', c), pub, child }, { supervision: { maxRestarts: 2 } });
    await k.view.install(id('pub'));
    await k.view.install(id('sub'));
    await k.view.install(id('child'));
    // 以 setup 次数推进（重启可能快于轮询，不能依赖观察到中间态）
    for (let i = 1; i <= 3; i++) {
      await waitFor(
        () => c.setups === i && statusOf(k, 'sub') === 'enabled' && statusOf(k, 'child') === 'enabled'
      );
      emit();
    }
    await waitFor(() => statusOf(k, 'sub') === 'quarantined');
    assert.strictEqual(c.setups, 3); // 初次 + 2 次重启
    assert.strictEqual(statusOf(k, 'child'), 'failed');
    assert.strictEqual(k.view.snapshot().plugins.get(id('child'))?.lastError?.tag, 'DependencyMissing');
    assert.strictEqual(statusOf(k, 'pub'), 'enabled');

    // 显式 enable 解除熔断
    await k.view.enable(id('sub'));
    assert.strictEqual(statusOf(k, 'sub'), 'enabled');
    await k.dispose();
  });

  it('maxRestarts = 0 leaves the plugin failed without restarting', async () => {
    const c = { setups: 0 };
    let emit!: () => void;
    const pub = definePlugin({
      manifest: mf('pub'),
      capabilities: [] as const,
      setup: api => {
        emit = () => api.events.emit(Ping, { fail: true });
      },
    });
    const k = makeKernel({ sub: flaky('sub', c), pub }, { supervision: { maxRestarts: 0 } });
    await k.view.install(id('sub'));
    await k.view.install(id('pub'));
    emit();
    await waitFor(() => statusOf(k, 'sub') === 'failed');
    await sleep(20);
    assert.strictEqual(c.setups, 1);
    assert.strictEqual(k.view.snapshot().plugins.get(id('sub'))?.lastError?.message, 'callback exploded');
    await k.dispose();
  });

  it('service method failures are attributed to the provider; the caller still sees the error', async () => {
    interface Calc {
      readonly div: (a: number, b: number) => number;
    }
    const CalcSvc = defineService<Calc>('calc');
    let providerSetups = 0;
    const provider = definePlugin({
      manifest: mf('provider', { services: { provide: ['calc'] } }),
      capabilities: [] as const,
      setup: api => {
        providerSetups++;
        api.services.register(CalcSvc, {
          div: (a, b) => {
            if (b === 0) throw new RangeError('div by zero');
            return a / b;
          },
        });
      },
    });
    let calc!: Calc;
    const consumer = definePlugin({
      manifest: mf('consumer'),
      capabilities: [] as const,
      setup: async api => {
        calc = await api.services.get(CalcSvc);
      },
    });
    const k = makeKernel({ provider, consumer });
    await k.view.install(id('provider'));
    await k.view.install(id('consumer'));
    assert.strictEqual(calc.div(6, 3), 2);
    assert.throws(() => calc.div(1, 0), RangeError);
    await waitFor(() => providerSetups === 2 && statusOf(k, 'provider') === 'enabled');
    assert.strictEqual(statusOf(k, 'consumer'), 'enabled');
    await k.dispose();
  });

  it('a fault reported while the plugin is still starting is handled once it is enabled', async () => {
    let setups = 0;
    let k!: ReturnType<typeof makeKernel>;
    const p = definePlugin({
      manifest: mf('p'),
      capabilities: [] as const,
      setup: async () => {
        if (++setups === 1) k.view.reportFault(id('p'), new Error('during setup'));
        await sleep(5);
      },
    });
    k = makeKernel({ p });
    await k.view.install(id('p'));
    await waitFor(() => setups === 2 && statusOf(k, 'p') === 'enabled');
    await k.dispose();
  });

  it('reportFault from the host restarts the plugin; faults for disabled plugins are ignored', async () => {
    let setups = 0;
    const p = definePlugin({ manifest: mf('p'), capabilities: [] as const, setup: () => void setups++ });
    const k = makeKernel({ p, emitter });
    await k.view.install(id('p'));
    k.view.reportFault(id('p'), new Error('window.onerror'));
    await waitFor(() => setups === 2 && statusOf(k, 'p') === 'enabled');
    await k.view.disable(id('p'));
    k.view.reportFault(id('p'), new Error('late'));
    await sleep(20);
    assert.strictEqual(statusOf(k, 'p'), 'disabled');
    await k.dispose();
  });
});
