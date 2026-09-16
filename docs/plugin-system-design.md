# 宿主无关插件内核技术方案（Effect 4 / TypeScript）

> 版本：v3
> 前置：`effect@4.0.0-rc.x`、TypeScript 5.x（`strict`、`exactOptionalPropertyTypes`）
> 定位：为"空白 HTML 微内核博客"等任意宿主提供同一套插件内核；本文只描述内核与契约，DOM 宿主作为附录中的一个实例。

---

## 0. 一页摘要

- **内核（`@kernel/core`）不 import 任何宿主 API**：无 `document`、无 `window`、无 React、无 Node 内建模块。它只依赖 `effect`。
- 内核只做六件事：**安装态、依赖拓扑、每插件一个 Scope、能力（Capability）注入、插件间服务发现、事件总线**。
- **Capability 是宿主提供的 Layer**，用 `Context.Service` 定义；插件在 manifest 中以 **类型级元组** 声明所需 Capability，`PluginAPI<Caps>` 的类型由该元组推导——没声明的能力在类型上不存在，运行时也拿不到。
- 插件契约仍是 Promise + Cleanup 的薄层（作者不必学 Effect）；同时提供 `defineEffectPlugin` 让偏好 Effect 的插件直接以 Layer 参与。
- 所有跨动态边界的数据（manifest、事件负载）都用 `Schema` 描述：**编译期强类型 + 运行时校验**，两者来自同一个定义。
- UI、路由、存储、DOM 都不是内核概念，全部是 Capability。

---

## 1. 分层与依赖方向

```
┌────────────────────────────────────────────────────────────┐
│ 插件层  @kernel/sdk（类型 + definePlugin，零运行时依赖）        │
│   definePlugin({ manifest, capabilities: [Dom, Router], setup }) │
└──────────────▲─────────────────────────────────────────────┘
               │ 只依赖 sdk 类型
┌──────────────┴─────────────────────────────────────────────┐
│ 内核层  @kernel/core（仅依赖 effect）                          │
│   PluginRegistry · DependencyGraph · CapabilityBroker           │
│   ServiceRegistry · EventHub · PermissionPolicy                 │
│   抽象服务：PluginLoader · InstallStore（由宿主实现）            │
└──────────────▲─────────────────────────────────────────────┘
               │ 宿主提供 Layer
┌──────────────┴─────────────────────────────────────────────┐
│ 宿主层  @host/dom · @host/node · @host/linkedom …               │
│   DomCapability.browser · RouterCapability.history              │
│   StorageCapability.localStorage · PluginLoader.esm             │
│   （React/Lit/vanilla 等渲染库只出现在这里或插件内部）            │
└────────────────────────────────────────────────────────────┘
```

依赖严格单向：插件 → sdk（类型）；内核 → effect；宿主 → 内核 + effect + 平台 API。用 `eslint-plugin-boundaries` 或 `tsconfig` `paths` + `noUncheckedSideEffectImports` 在 CI 中强制。

---

## 2. 类型基石

### 2.1 品牌类型与 Schema 共源

```ts
import { Schema } from 'effect';

export const PluginID = Schema.String.pipe(Schema.brand('PluginID'));
export type PluginID = typeof PluginID.Type;

export const SemVer = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\d+\.\d+\.\d+/)),
  Schema.brand('SemVer')
);
export type SemVer = typeof SemVer.Type;

export const PluginPerm = Schema.Literals(['guest', 'admin']);
export type PluginPerm = typeof PluginPerm.Type;
```

原则：**任何会跨越动态 `import()`、`postMessage`、网络的类型，都先写 Schema，再 `typeof X.Type` 导出类型**。不允许手写 interface 后再补校验。

### 2.2 Capability 定义

一个 Capability = 一个 `Context.Service` + 该服务 Shape 的"插件侧投影"。

```ts
import { Context, Effect, Scope } from 'effect';

/** 宿主侧：Effect 形态，供内核与 Effect 插件使用 */
export interface CapabilityDef<Id extends string, Shape, Facade> {
  readonly id: Id;
  readonly tag: Context.Service<Id, Shape>;
  /** 把 Effect Shape 投影为插件可见的 Promise/回调 Facade；内核在激活时调用 */
  readonly facade: (shape: Shape, ctx: FacadeContext) => Facade;
}

export interface FacadeContext {
  readonly pluginId: PluginID;
  /** 在插件 Scope 内运行需要 Scope 的 Effect，返回可提前撤销的 Cleanup */
  readonly scoped: (eff: Effect.Effect<void, never, Scope.Scope>) => Cleanup;
  readonly run: <A, E>(eff: Effect.Effect<A, E>) => Promise<A>;
  readonly runSync: <A, E>(eff: Effect.Effect<A, E>) => A;
}

export const defineCapability = <Id extends string, Shape, Facade>(
  id: Id,
  facade: CapabilityDef<Id, Shape, Facade>['facade']
): CapabilityDef<Id, Shape, Facade> => ({
  id,
  tag: Context.Service<Id, Shape>(`@capability/${id}`),
  facade,
});
```

`Context.Service<Identifier, Shape>(key)` 是 v4 的非 class 形式，适合在这里按 id 参数化生成。

### 2.3 从 Capability 元组推导插件 API 类型

```ts
export type AnyCapability = CapabilityDef<string, unknown, unknown>;

export type FacadeOf<C> = C extends CapabilityDef<string, unknown, infer F> ? F : never;
export type IdOf<C> = C extends CapabilityDef<infer I, unknown, unknown> ? I : never;

/** { dom: DomFacade; router: RouterFacade } */
export type CapabilityRecord<Caps extends ReadonlyArray<AnyCapability>> = {
  readonly [C in Caps[number] as IdOf<C>]: FacadeOf<C>;
};
```

`setup(api)` 中 `api.caps.dom` 是否存在，完全由 `capabilities` 元组决定；访问未声明的能力是 **编译错误**。

---

## 3. 插件契约（`@kernel/sdk`）

### 3.1 Manifest（Schema 定义）

```ts
export const PluginManifest = Schema.Struct({
  id: PluginID,
  name: Schema.String,
  version: SemVer,
  perm: Schema.optionalKey(PluginPerm), // 缺省 "guest"
  dependencies: Schema.optionalKey(Schema.Array(PluginID)),
  /** 运行时校验用；类型级信息在 definePlugin 的泛型里 */
  capabilities: Schema.Array(Schema.String),
});
export type PluginManifest = typeof PluginManifest.Type;
```

### 3.2 `PluginModule<Caps>`

```ts
export type Cleanup = () => void | Promise<void>;

export interface PluginAPI<Caps extends ReadonlyArray<AnyCapability>> {
  readonly manifest: PluginManifest;
  readonly caps: CapabilityRecord<Caps>;
  readonly services: {
    register<T>(token: ServiceToken<T>, impl: T): Cleanup;
    get<T>(token: ServiceToken<T>): Promise<T>;
    tryGet<T>(token: ServiceToken<T>): T | undefined;
  };
  readonly events: {
    on<T>(topic: Topic<T>, cb: (payload: T) => void): Cleanup;
    emit<T>(topic: Topic<T>, payload: T): void;
  };
  readonly lifecycle: {
    addCleanup(c: Cleanup): void;
    onUninstallData(cb: () => void | Promise<void>): Cleanup;
  };
}

export interface PluginModule<
  Caps extends ReadonlyArray<AnyCapability> = ReadonlyArray<AnyCapability>,
> {
  readonly kind: 'plain';
  readonly manifest: Omit<PluginManifest, 'capabilities'>;
  readonly capabilities: Caps;
  readonly setup: (api: PluginAPI<Caps>) => void | Cleanup | Promise<void | Cleanup>;
  readonly onManualInstall?: (api: PluginAPI<Caps>) => void | Promise<void>;
}

export const definePlugin = <const Caps extends ReadonlyArray<AnyCapability>>(
  m: Omit<PluginModule<Caps>, 'kind'>
): PluginModule<Caps> => ({ kind: 'plain', ...m });
```

`const Caps` 让 `capabilities: [Dom, Router]` 推导为元组而非数组，`api.caps` 才能得到精确的键集合。

### 3.3 服务 Token 与事件 Topic

服务只在同一进程内传递（不考虑 Worker 等跨线程宿主），因此 `ServiceToken<T>` 是**纯幻影类型**：只有 `key`，`T` 仅用于编译期约束，实现可以自由包含函数、类实例、闭包。事件 Topic 的 payload 是数据，带 Schema 以便运行时校验。

```ts
declare const ServiceTypeId: unique symbol;
export interface ServiceToken<T> {
  readonly key: string;
  readonly [ServiceTypeId]?: (_: T) => T; // 幻影，保证 T 不变（invariant）
}
export const defineService = <T>(key: string): ServiceToken<T> => ({ key });

export interface Topic<T> {
  readonly key: string;
  // Decoder<T>：只保留解码视图；DecodingServices=never 才能用 decodeUnknownSync
  readonly schema: Schema.Decoder<T>;
}
export const defineTopic = <T>(key: string, schema: Schema.Decoder<T>): Topic<T> => ({
  key,
  schema,
});
```

`EventHub.emit` 在 dev 模式对 payload 做 `Schema.decodeUnknownSync`，prod 跳过。**事件的编译期类型与运行时校验来自同一份 Schema**。

服务不做运行时校验：`register(token, impl)` 的 `impl: T` 由 TypeScript 保证；对动态加载的第三方插件，信任边界落在 manifest 解码与 admin 权限上，而不是服务形状上。例：

```ts
export interface ThemeService {
  readonly current: () => 'light' | 'dark';
  readonly toggle: () => void;
}
export const Theme = defineService<ThemeService>('theme');
```

### 3.4 Effect 形态插件

```ts
export interface EffectPluginModule<Caps extends ReadonlyArray<AnyCapability>, ROut> {
  readonly kind: 'effect';
  readonly manifest: Omit<PluginManifest, 'capabilities'>;
  readonly capabilities: Caps;
  /** R 只能是所声明 Capability 的 Identifier 与内核服务，超出即编译错误 */
  readonly layer: Layer.Layer<
    ROut,
    PluginSetupError,
    IdOf<Caps[number]> | KernelServices | Scope.Scope
  >;
}

export const defineEffectPlugin = <const Caps extends ReadonlyArray<AnyCapability>, ROut>(
  m: Omit<EffectPluginModule<Caps, ROut>, 'kind'>
): EffectPluginModule<Caps, ROut> => ({ kind: 'effect', ...m });
```

这是强类型的关键收益点：**Layer 的 `R` 通道被 manifest 声明的能力集合封顶**。忘记声明 `Router` 却 `yield* RouterCapability.tag`，`tsc` 直接报错，而不是运行时缺服务。

`KernelServices` 与 `PluginSetupError` 都必须声明在 **sdk**——它们出现在插件契约的类型面上，放 kernel 会造成 sdk→kernel 的循环依赖：

```ts
// sdk：插件 setup/layer 可抛出的契约错误（kernel 的 PluginError 联合包含它）
export class PluginSetupError extends Data.TaggedError('PluginSetupError')<{
  id: PluginID;
  cause: unknown;
}> {}

// sdk：插件可依赖的内核服务 Tag（Shape 即契约；实现见 kernel §4.3）
export class ServiceRegistry extends Context.Service<ServiceRegistry, ServiceRegistryShape>()(
  '@kernel/ServiceRegistry'
) {}
export class EventHub extends Context.Service<EventHub, EventHubShape>()('@kernel/EventHub') {}
export type KernelServices = ServiceRegistry | EventHub;
```

原则：**Tag/错误出现在插件可见类型上 = 契约，归 sdk；实现归 kernel**。PermissionPolicy/InstallStore/PluginLoader/CapabilityBroker/PluginRegistry 这类内核内部服务仍留在 kernel。

---

## 4. 内核服务（`@kernel/core`）

统一 `class X extends Context.Service<X, XShape>()("@kernel/X")`。

### 4.1 错误

```ts
import { Data } from 'effect';

export class PluginNotFound extends Data.TaggedError('PluginNotFound')<{ id: PluginID }> {}
export class PluginLoadError extends Data.TaggedError('PluginLoadError')<{
  id: PluginID;
  cause: unknown;
}> {}
export class ManifestInvalid extends Data.TaggedError('ManifestInvalid')<{
  id: string;
  issue: string;
}> {}
// PluginSetupError 定义在 sdk（见 §3.4）：它是插件可抛出的契约错误
export class PermissionDenied extends Data.TaggedError('PermissionDenied')<{
  id: PluginID;
  required: PluginPerm;
}> {}
export class CapabilityMissing extends Data.TaggedError('CapabilityMissing')<{
  id: PluginID;
  capability: string;
}> {}
export class DependencyMissing extends Data.TaggedError('DependencyMissing')<{
  id: PluginID;
  missing: ReadonlyArray<PluginID>;
}> {}
export class DependencyCycle extends Data.TaggedError('DependencyCycle')<{
  cycle: ReadonlyArray<PluginID>;
}> {}
export class DependentsActive extends Data.TaggedError('DependentsActive')<{
  id: PluginID;
  dependents: ReadonlyArray<PluginID>;
}> {}

export type PluginError =
  | PluginNotFound
  | PluginLoadError
  | ManifestInvalid
  | PluginSetupError // 来自 sdk
  | PermissionDenied
  | CapabilityMissing
  | DependencyMissing
  | DependencyCycle
  | DependentsActive;
```

### 4.2 `CapabilityBroker`

内核与宿主之间的唯一接缝。宿主在组装 runtime 时把提供的 Capability 列表交给它。

```ts
export interface CapabilityBrokerShape {
  readonly has: (id: string) => boolean;
  /** 为某插件构建 caps 记录：只包含其声明且宿主提供的能力 */
  readonly facadesFor: (
    manifest: PluginManifest,
    ctx: FacadeContext
  ) => Effect.Effect<Record<string, unknown>, CapabilityMissing>;
  /** Effect 插件用：把声明的能力 Context 子集提取出来 */
  readonly contextFor: (
    manifest: PluginManifest
  ) => Effect.Effect<Context.Context<never>, CapabilityMissing>;
}

export class CapabilityBroker extends Context.Service<CapabilityBroker, CapabilityBrokerShape>()(
  '@kernel/CapabilityBroker'
) {
  static readonly fromDefs = (defs: ReadonlyArray<AnyCapability>) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const ctx = yield* Effect.context<never>();
        const byId = new Map(defs.map(d => [d.id, d] as const));

        const facadesFor: CapabilityBrokerShape['facadesFor'] = (manifest, fctx) =>
          Effect.forEach(manifest.capabilities, id => {
            const def = byId.get(id);
            const shape = def && Context.getOption(ctx, def.tag);
            return def && Option.isSome(shape)
              ? Effect.succeed([id, def.facade(shape.value, fctx)] as const)
              : Effect.fail(new CapabilityMissing({ id: manifest.id, capability: id }));
          }).pipe(Effect.map(Object.fromEntries));

        const contextFor: CapabilityBrokerShape['contextFor'] = manifest =>
          Effect.forEach(manifest.capabilities, id => {
            const def = byId.get(id);
            const shape = def && Context.getOption(ctx, def.tag);
            return def && Option.isSome(shape)
              ? Effect.succeed(Context.make(def.tag, shape.value))
              : Effect.fail(new CapabilityMissing({ id: manifest.id, capability: id }));
          }).pipe(Effect.map(cs => cs.reduce(Context.merge, Context.empty())));

        return CapabilityBroker.of({
          has: id => byId.has(id) && Context.getOption(ctx, byId.get(id)!.tag)._tag === 'Some',
          facadesFor,
          contextFor,
        });
      })
    );
}
```

注意 `fromDefs` 的 Layer 需要宿主在 `Layer.provide` 时把所有 Capability Layer 先合并进来，`Effect.context<never>()` 才能抓到它们（见 §6）。

### 4.3 `ServiceRegistry`、`EventHub`、`PermissionPolicy`

前两个的 **Tag 已在 sdk 声明**（§3.4），kernel 只提供实现；`PermissionPolicy` 是内核内部服务，Tag 直接定义在 kernel。实现要点与 v2 相同（`Ref` + `Deferred` 的等待式 `get`；`PubSub` + `forkScoped` 的订阅；策略式权限），仅两处变化：

- `EventHub.publish` 增加 `Topic<T>` 参数并在 dev 模式做 Schema 校验；
- `ServiceRegistry.register` 记录 `pluginId`，供 devtools 归属查询。

### 4.4 抽象服务：`PluginLoader`、`InstallStore`

```ts
export interface PluginLoaderShape {
  readonly load: (
    id: PluginID
  ) => Effect.Effect<AnyPluginModule, PluginLoadError | ManifestInvalid>;
  readonly listAvailable: Effect.Effect<ReadonlyArray<PluginManifest>>;
}
export class PluginLoader extends Context.Service<PluginLoader, PluginLoaderShape>()(
  '@kernel/PluginLoader'
) {}

export interface InstallStoreShape {
  readonly read: Effect.Effect<ReadonlySet<PluginID>>;
  readonly write: (ids: ReadonlySet<PluginID>) => Effect.Effect<void>;
}
export class InstallStore extends Context.Service<InstallStore, InstallStoreShape>()(
  '@kernel/InstallStore'
) {}
```

内核对 `load` 的返回做 `Schema.decodeUnknownEffect(PluginManifest)`，失败即 `ManifestInvalid`。这是动态边界的第一道校验。内核**不提供**任何默认实现（没有 `localStorage`，没有 `import.meta.glob`）——它们属于宿主。

### 4.5 `PluginRegistry`

状态模型、`topoSort`/`toLevels`、正反向依赖校验、`install` 先启用成功再落盘，均沿用 v2。`activate` 改为通过 `CapabilityBroker`：

```ts
const activate = (rec: PluginRecord) =>
  Effect.gen(function* () {
    yield* (yield* PermissionPolicy).check(rec.manifest);
    const mod = yield* (yield* PluginLoader).load(rec.manifest.id);
    const broker = yield* CapabilityBroker;
    const scope = yield* Scope.make('sequential');
    const kernelCtx = yield* Effect.context<ServiceRegistry | EventHub | PluginRegistry>();

    const fail = (cause: unknown) => new PluginSetupError({ id: rec.manifest.id, cause });
    const rollback = Effect.tapError(() => Scope.close(scope, Exit.void));

    if (mod.kind === 'effect') {
      const capCtx = yield* broker.contextFor(rec.manifest);
      yield* Layer.buildWithScope(mod.layer, scope).pipe(
        Effect.provide(Context.merge(kernelCtx, capCtx)),
        Effect.mapError(fail),
        rollback
      );
      return scope;
    }

    const fctx = makeFacadeContext(rec.manifest.id, scope, kernelCtx);
    const caps = yield* broker.facadesFor(rec.manifest, fctx);
    const api = makePlainAPI(rec.manifest, caps, fctx, kernelCtx);

    yield* Effect.tryPromise({
      try: async () => {
        const cleanup = await mod.setup(api);
        if (cleanup) api.lifecycle.addCleanup(cleanup);
      },
      catch: fail,
    }).pipe(
      Effect.timeout('10 seconds'),
      Effect.catchTag('TimeoutError', e => Effect.fail(fail(e))),
      rollback
    );
    return scope;
  });
```

`makeFacadeContext` 即 v2 §7 中的 `scoped` / `run` / `runSync` 三件套，基于 `Effect.runSyncWith(ctx)` / `Effect.runPromiseWith(ctx)` 与 `Scope.fork(scope)`。

---

## 5. 内核对外的最小门面

内核不知道 React，也不知道 DOM，但宿主 UI 需要观察内核状态。内核暴露一个 **不含 Effect 类型** 的观察门面，是宿主层与内核的第二个接缝：

```ts
export interface KernelView {
  readonly snapshot: () => RegistrySnapshot;
  readonly subscribe: (cb: () => void) => () => void;
  readonly enable: (id: PluginID) => Promise<void>;
  readonly disable: (id: PluginID) => Promise<void>;
  readonly install: (id: PluginID) => Promise<void>;
  readonly uninstall: (id: PluginID) => Promise<void>;
}

// KernelEnv：runtime 内全部服务环境（内核内部服务 + KernelServices + 宿主 Capability），定义在 kernel
export const makeKernelView = (
  rt: ManagedRuntime.ManagedRuntime<KernelEnv, never>
): KernelView => {
  const reg = rt.runSync(Effect.service(PluginRegistry));
  return {
    snapshot: () => rt.runSync(SubscriptionRef.get(reg.state)),
    subscribe: cb => {
      const fiber = rt.runFork(
        SubscriptionRef.changes(reg.state).pipe(Stream.runForEach(() => Effect.sync(cb)))
      );
      return () => {
        rt.runFork(Fiber.interrupt(fiber));
      };
    },
    enable: id => rt.runPromise(reg.enable(id)),
    disable: id => rt.runPromise(reg.disable(id)),
    install: id => rt.runPromise(reg.install(id, { manual: true })),
    uninstall: id => rt.runPromise(reg.uninstall(id)),
  };
};
```

`subscribe`/`snapshot` 恰好是 `useSyncExternalStore` 的签名，也适配 Lit `@lit/task`、Svelte store、或纯 DOM 的手动刷新。

---

## 6. 组装（宿主职责）

```ts
export interface KernelConfig<Caps extends ReadonlyArray<AnyCapability>> {
  readonly capabilities: Caps;
  readonly capabilityLayer: Layer.Layer<IdOf<Caps[number]>>; // 宿主实现，与 capabilities 一一对应
  readonly loader: Layer.Layer<PluginLoader>;
  readonly store: Layer.Layer<InstallStore>;
  readonly permission: Layer.Layer<PermissionPolicy>;
}

export const createKernel = <const Caps extends ReadonlyArray<AnyCapability>>(
  cfg: KernelConfig<Caps>
) => {
  const kernel = PluginRegistry.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(ServiceRegistry.layer, EventHub.layer)),
    Layer.provideMerge(CapabilityBroker.fromDefs(cfg.capabilities)),
    Layer.provideMerge(cfg.capabilityLayer),
    Layer.provideMerge(Layer.mergeAll(cfg.loader, cfg.store, cfg.permission))
  );
  const runtime = ManagedRuntime.make(kernel);
  return {
    runtime,
    view: makeKernelView(runtime),
    bootstrap: () => runtime.runPromise(Effect.flatMap(PluginRegistry, r => r.bootstrap)),
    dispose: () => runtime.dispose(),
  };
};
```

类型约束：`capabilityLayer` 的输出必须覆盖 `capabilities` 中每个 def 的 `Identifier`，少给一个是编译错误——宿主与插件都被同一套类型钳住。

---

## 7. 强类型清单（本方案在编译期能拦住什么）

| 场景                                             | 拦截方式                                     |
| ------------------------------------------------ | -------------------------------------------- |
| 插件访问未声明的能力 `api.caps.router`           | `CapabilityRecord<Caps>` 中无该键            |
| Effect 插件 `yield*` 未声明的 Capability         | Layer `R` 被 `IdOf<Caps[number]>` 封顶       |
| 宿主声明提供 `[Dom, Router]` 却少给 Router Layer | `KernelConfig.capabilityLayer` 类型不匹配    |
| 向 Topic 发送错误形状的 payload                  | `Topic<T>` 泛型                              |
| `register(Theme, impl)` 时 impl 缺少 `toggle`    | `ServiceToken<T>` 幻影类型（invariant）      |
| 宿主处理插件错误漏分支                           | `Effect.catchTags` 对 `PluginError` 联合穷举 |
| 手写 manifest 字段拼错                           | `PluginManifest` Schema 类型                 |

运行时补位（编译期不可知的）：manifest 解码、Capability 是否真的被宿主提供、依赖是否存在/成环、admin 权限、事件 payload 的 dev 模式校验。

---

## 8. 测试

- 内核：全部在 Node 下用内存 Layer 跑，`PluginLoader.fromMap`、`InstallStore.memory`、`CapabilityBroker.fromDefs([])`。内核测试套件里 **禁止出现 `document`**（eslint `no-restricted-globals`）。
- 类型测试：用 `expectTypeOf`（vitest）断言 §7 每一行——例如 `expectTypeOf<PluginAPI<[typeof Dom]>["caps"]>().not.toHaveProperty("router")`。
- 宿主：每个 Capability 实现单独测；DOM 宿主用 happy-dom/linkedom。
- 插件：sdk 提供 `createTestAPI({ caps: { dom: fakeDom } })`，纯 TS，无 effect 依赖。

---

## 9. 与 v2 的差异

| v2                                            | v3                                             |
| --------------------------------------------- | ---------------------------------------------- |
| `UIRegistry`（含 React 组件类型）在内核       | 移出内核；成为 DOM 宿主的一个 Capability       |
| `HostBridge` 单体                             | 拆为多个类型化 Capability + `CapabilityBroker` |
| `PluginAPI` 固定形状                          | `PluginAPI<Caps>` 由 manifest 声明推导         |
| 手写 `PluginManifest` interface               | Schema 共源，动态边界解码                      |
| 事件为固定 `PluginEvents` 映射                | `Topic<T>` 可由插件自行定义并跨插件共享        |
| 内置 `localStorage` / `import.meta.glob` 实现 | 内核零默认实现，全部宿主提供                   |

---

## 附录 A：DOM 宿主实例（`@host/dom`）

仅示意 Capability 如何落地，内核对此一无所知。

```ts
// 分区挂载：每个插件只拿到自己的 host 元素，禁止裸 document
export interface DomShape {
  readonly mount: (pluginId: PluginID, slot: string, render: (host: HTMLElement) => Cleanup, weight?: number) => Effect.Effect<void, never, Scope.Scope>
  readonly head: {
    readonly addMeta: (pluginId: PluginID, attrs: Record<string, string>) => Effect.Effect<void, never, Scope.Scope>
    readonly addStyle: (pluginId: PluginID, css: string) => Effect.Effect<void, never, Scope.Scope>   // 注入到 @layer plugin-<id>
  }
}

export interface DomFacade {
  mount(slot: string, render: (host: HTMLElement) => Cleanup, weight?: number): Cleanup
  head: { addMeta(attrs: Record<string, string>): Cleanup; addStyle(css: string): Cleanup }
}

export const Dom = defineCapability<"dom", DomShape, DomFacade>("dom", (s, ctx) => ({
  mount: (slot, render, weight) => ctx.scoped(s.mount(ctx.pluginId, slot, render, weight)),
  head: {
    addMeta: (attrs) => ctx.scoped(s.head.addMeta(ctx.pluginId, attrs)),
    addStyle: (css) => ctx.scoped(s.head.addStyle(ctx.pluginId, css)),
  },
}))

export const DomBrowser: Layer.Layer<"dom"> = Layer.effect(Dom.tag, Effect.gen(function* () { /* SubscriptionRef 持有 slot 表；mount 用 acquireRelease 增删 <div data-plugin> */ }))
export const DomLinkedom: Layer.Layer<"dom"> = /* 预渲染宿主同构实现 */
```

```ts
// 插件
export default definePlugin({
  manifest: {
    id: 'theme' as PluginID, // 字面量处断言；动态输入走 Schema.decodeUnknownSync
    name: 'Theme',
    version: '1.0.0' as SemVer,
  },
  capabilities: [Dom, Storage],
  async setup(api) {
    const saved = await api.caps.storage.get('theme');
    api.caps.dom.head.addStyle(`:root { color-scheme: ${saved ?? 'light'} }`);
    api.caps.dom.mount('header.right', host => {
      const btn = host.appendChild(document.createElement('button'));
      btn.textContent = '切换主题';
      const onClick = () => api.events.emit(ThemeChanged, { theme: 'dark' });
      btn.addEventListener('click', onClick);
      return () => btn.removeEventListener('click', onClick);
    });
    // 访问 api.caps.router → 编译错误：未声明
  },
});
```

`shell` 根插件（声明 `[Dom]`，定义 `header.left/right`、`main`、`footer` 等 slot 骨架）与 `router`、`content-source`、`markdown`、`comments` 等同为插件；空白 HTML 只需 `<script type="module" src="/kernel-boot.js">`。

## 附录 B：Effect v4 API 速查（新增部分）

| 用途              | API                                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 非 class 服务标识 | `Context.Service<Identifier, Shape>("key")`                                                                                                                                        |
| 读取 Context      | `Context.getOption(ctx, tag)`、`Context.make(tag, value)`、`Context.merge`、`Context.empty()`                                                                                      |
| 服务取用          | `Effect.service(Tag)`、`Effect.serviceOption(Tag)`                                                                                                                                 |
| Schema            | `Schema.Struct`、`Schema.Literals`、`Schema.optionalKey`、`Schema.Array`、`Schema.brand`、`Schema.check(Schema.isPattern(re))`、`Schema.decodeUnknownEffect/Sync`、`typeof S.Type` |
| 其余              | 同 v2 附录 A                                                                                                                                                                       |
