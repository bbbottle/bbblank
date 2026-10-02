# 宿主无关插件内核技术方案（Effect 4 / TypeScript）

> 版本：v4（在 v3 基础上加入 §10 生产级强化：并发/停机、故障隔离、版本约束、制品安全、细粒度权限、事件背压、插件配置、持久化与恢复、可观测性）
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
import { Schema } from "effect";

export const PluginID = Schema.String.pipe(Schema.brand("PluginID"));
export type PluginID = typeof PluginID.Type;

export const SemVer = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\d+\.\d+\.\d+/)),
  Schema.brand("SemVer"),
);
export type SemVer = typeof SemVer.Type;

// v4：二值 guest/admin 已由按 capability/service 的授权取代（§10.5）
export const AccessLevel = Schema.Literals(["read", "write"]);
export type AccessLevel = typeof AccessLevel.Type;
```

原则：**任何会跨越动态 `import()`、`postMessage`、网络的类型，都先写 Schema，再 `typeof X.Type` 导出类型**。不允许手写 interface 后再补校验。

### 2.2 Capability 定义

一个 Capability = 一个 `Context.Service` + 该服务 Shape 的"插件侧投影"。

```ts
import { Context, Effect, Scope } from "effect";

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
  facade: CapabilityDef<Id, Shape, Facade>["facade"],
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

export type FacadeOf<C> =
  C extends CapabilityDef<string, unknown, infer F> ? F : never;
export type IdOf<C> =
  C extends CapabilityDef<infer I, unknown, unknown> ? I : never;

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
export const Dependency = Schema.Struct({ id: PluginID, range: VersionRange }); // range: "^1.2.0" / ">=1 <2" / "*"
export const AccessLevel = Schema.Literals(["read", "write"]);

export const PluginManifest = Schema.Struct({
  id: PluginID,
  name: Schema.String,
  version: SemVer,
  sdkVersion: Schema.optionalKey(SemVer), // 插件编译时的 sdk 版本，definePlugin 自动写入（§10.3）
  dependencies: Schema.optionalKey(Schema.Array(Dependency)),
  /** 运行时校验用；类型级信息在 definePlugin 的泛型里 */
  capabilities: Schema.Array(Schema.String),
  /** 每个 capability 申请的访问级别，缺省 "write"（§10.5） */
  access: Schema.optionalKey(Schema.Record(Schema.String, AccessLevel)),
  /** 允许提供（register）的服务 key，"*" 表示任意（§10.5） */
  services: Schema.optionalKey(
    Schema.Struct({ provide: Schema.optionalKey(Schema.Array(Schema.String)) }),
  ),
});
export type PluginManifest = typeof PluginManifest.Type;
```

v3 的 `perm: 'guest' | 'admin'` 与 `dependencies: PluginID[]` 已被取代；项目尚未投入使用，不提供迁移，不符合当前 Schema 的 manifest 直接 `ManifestInvalid`。

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
  C = void,
> {
  readonly kind: "plain";
  readonly manifest: ManifestInput<Caps>; // 作者手写部分；sdkVersion/capabilities 由 definePlugin 合成
  readonly capabilities: Caps;
  /** typed config（§10.7）：宿主提供的原始配置经此解码后作为 setup 第二参 */
  readonly configSchema?: Schema.Decoder<C>;
  readonly defaultConfig?: unknown;
  readonly setup: (
    api: PluginAPI<Caps>,
    config: C,
  ) => void | Cleanup | Promise<void | Cleanup>;
  readonly onManualInstall?: (api: PluginAPI<Caps>) => void | Promise<void>;
}

export const definePlugin = <const Caps extends ReadonlyArray<AnyCapability>>(
  m: Omit<PluginModule<Caps>, "kind">,
): PluginModule<Caps> => ({ kind: "plain", ...m });
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
export const defineTopic = <T>(
  key: string,
  schema: Schema.Decoder<T>,
): Topic<T> => ({
  key,
  schema,
});
```

`EventHub.emit` 在 dev 模式对 payload 做 `Schema.decodeUnknownSync`，prod 跳过。**事件的编译期类型与运行时校验来自同一份 Schema**。

服务不做运行时校验：`register(token, impl)` 的 `impl: T` 由 TypeScript 保证；对动态加载的第三方插件，信任边界落在 manifest 解码与 admin 权限上，而不是服务形状上。例：

```ts
export interface ThemeService {
  readonly current: () => "light" | "dark";
  readonly toggle: () => void;
}
export const Theme = defineService<ThemeService>("theme");
```

### 3.4 Effect 形态插件

```ts
export interface EffectPluginModule<
  Caps extends ReadonlyArray<AnyCapability>,
  ROut,
  C = void,
> {
  readonly kind: "effect";
  readonly manifest: ManifestInput<Caps>;
  readonly capabilities: Caps;
  readonly configSchema?: Schema.Decoder<C>;
  readonly defaultConfig?: unknown;
  /** R 只能是所声明 Capability 的 Identifier 与内核服务，超出即编译错误；
   *  需要配置时写成 `(config: C) => Layer`（§10.7） */
  readonly layer:
    PluginLayer<Caps, ROut> | ((config: C) => PluginLayer<Caps, ROut>);
}
type PluginLayer<Caps, ROut> = Layer.Layer<
  ROut,
  PluginSetupError,
  IdOf<Caps[number]> | KernelServices | Scope.Scope
>;

export const defineEffectPlugin = <
  const Caps extends ReadonlyArray<AnyCapability>,
  ROut,
>(
  m: Omit<EffectPluginModule<Caps, ROut>, "kind">,
): EffectPluginModule<Caps, ROut> => ({ kind: "effect", ...m });
```

这是强类型的关键收益点：**Layer 的 `R` 通道被 manifest 声明的能力集合封顶**。忘记声明 `Router` 却 `yield* RouterCapability.tag`，`tsc` 直接报错，而不是运行时缺服务。

`KernelServices` 与 `PluginSetupError` 都必须声明在 **sdk**——它们出现在插件契约的类型面上，放 kernel 会造成 sdk→kernel 的循环依赖：

```ts
// sdk：插件 setup/layer 可抛出的契约错误（kernel 的 PluginError 联合包含它）
export class PluginSetupError extends Data.TaggedError("PluginSetupError")<{
  id: PluginID;
  cause: unknown;
}> {}

// sdk：插件可依赖的内核服务 Tag（Shape 即契约；实现见 kernel §4.3）
export class ServiceRegistry extends Context.Service<
  ServiceRegistry,
  ServiceRegistryShape
>()("@kernel/ServiceRegistry") {}
export class EventHub extends Context.Service<EventHub, EventHubShape>()(
  "@kernel/EventHub",
) {}
export type KernelServices = ServiceRegistry | EventHub;
```

原则：**Tag/错误出现在插件可见类型上 = 契约，归 sdk；实现归 kernel**。PermissionPolicy/InstallStore/PluginLoader/CapabilityBroker/PluginRegistry 这类内核内部服务仍留在 kernel。

---

## 4. 内核服务（`@kernel/core`）

统一 `class X extends Context.Service<X, XShape>()("@kernel/X")`。

### 4.1 错误

```ts
import { Data } from "effect";

export class PluginNotFound extends Data.TaggedError("PluginNotFound")<{
  id: PluginID;
}> {}
export class PluginLoadError extends Data.TaggedError("PluginLoadError")<{
  id: PluginID;
  cause: unknown;
}> {}
export class ManifestInvalid extends Data.TaggedError("ManifestInvalid")<{
  id: string;
  issue: string;
}> {}
// PluginSetupError 定义在 sdk（见 §3.4）：它是插件可抛出的契约错误
// PermissionDenied 移入 sdk（插件调用 facade/services 时可见）；required 形如
// "capability:dom:write" / "service:provide:theme"（§10.5）
export class PermissionDenied extends Data.TaggedError("PermissionDenied")<{
  id: PluginID;
  required: string;
}> {}
export class CapabilityMissing extends Data.TaggedError("CapabilityMissing")<{
  id: PluginID;
  capability: string;
}> {}
export class DependencyMissing extends Data.TaggedError("DependencyMissing")<{
  id: PluginID;
  missing: ReadonlyArray<PluginID>;
}> {}
export class DependencyCycle extends Data.TaggedError("DependencyCycle")<{
  cycle: ReadonlyArray<PluginID>;
}> {}
export class DependentsActive extends Data.TaggedError("DependentsActive")<{
  id: PluginID;
  dependents: ReadonlyArray<PluginID>;
}> {}

// v4 新增（§10）
export class DependencyVersionMismatch extends Data.TaggedError(
  "DependencyVersionMismatch",
)<{
  id: PluginID;
  dependency: PluginID;
  range: string;
  actual: string;
}> {}
export class SdkIncompatible extends Data.TaggedError("SdkIncompatible")<{
  id: PluginID;
  required: string;
  actual: string;
}> {}
export class ConfigInvalid extends Data.TaggedError("ConfigInvalid")<{
  id: PluginID;
  issue: string;
}> {}
// sdk 侧新增的契约错误：StorageError（Storage capability）、EventPayloadInvalid（emit 校验失败，同步抛给发布方）

export type PluginError =
  | PluginNotFound
  | PluginLoadError
  | ManifestInvalid
  | PluginSetupError // 来自 sdk
  | PermissionDenied // 来自 sdk
  | CapabilityMissing
  | DependencyMissing
  | DependencyVersionMismatch
  | DependencyCycle
  | DependentsActive
  | SdkIncompatible
  | ConfigInvalid
  | StorageError; // 来自 sdk
```

### 4.2 `CapabilityBroker`

内核与宿主之间的唯一接缝。宿主在组装 runtime 时把提供的 Capability 列表交给它。

```ts
export interface CapabilityBrokerShape {
  readonly has: (id: string) => boolean;
  /** 为某插件构建 caps 记录：只包含其声明且宿主提供的能力 */
  readonly facadesFor: (
    manifest: PluginManifest,
    ctx: FacadeContext,
  ) => Effect.Effect<Record<string, unknown>, CapabilityMissing>;
  /** Effect 插件用：把声明的能力 Context 子集提取出来 */
  readonly contextFor: (
    manifest: PluginManifest,
  ) => Effect.Effect<Context.Context<never>, CapabilityMissing>;
}

export class CapabilityBroker extends Context.Service<
  CapabilityBroker,
  CapabilityBrokerShape
>()("@kernel/CapabilityBroker") {
  static readonly fromDefs = (defs: ReadonlyArray<AnyCapability>) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const ctx = yield* Effect.context<never>();
        const byId = new Map(defs.map((d) => [d.id, d] as const));

        const facadesFor: CapabilityBrokerShape["facadesFor"] = (
          manifest,
          fctx,
        ) =>
          Effect.forEach(manifest.capabilities, (id) => {
            const def = byId.get(id);
            const shape = def && Context.getOption(ctx, def.tag);
            return def && Option.isSome(shape)
              ? Effect.succeed([id, def.facade(shape.value, fctx)] as const)
              : Effect.fail(
                  new CapabilityMissing({ id: manifest.id, capability: id }),
                );
          }).pipe(Effect.map(Object.fromEntries));

        const contextFor: CapabilityBrokerShape["contextFor"] = (manifest) =>
          Effect.forEach(manifest.capabilities, (id) => {
            const def = byId.get(id);
            const shape = def && Context.getOption(ctx, def.tag);
            return def && Option.isSome(shape)
              ? Effect.succeed(Context.make(def.tag, shape.value))
              : Effect.fail(
                  new CapabilityMissing({ id: manifest.id, capability: id }),
                );
          }).pipe(
            Effect.map((cs) => cs.reduce(Context.merge, Context.empty())),
          );

        return CapabilityBroker.of({
          has: (id) =>
            byId.has(id) &&
            Context.getOption(ctx, byId.get(id)!.tag)._tag === "Some",
          facadesFor,
          contextFor,
        });
      }),
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
    id: PluginID,
  ) => Effect.Effect<AnyPluginModule, PluginLoadError | ManifestInvalid>;
  readonly listAvailable: Effect.Effect<ReadonlyArray<PluginManifest>>;
}
export class PluginLoader extends Context.Service<
  PluginLoader,
  PluginLoaderShape
>()("@kernel/PluginLoader") {}

/** 期望态（desired state）：宿主希望哪些插件被安装/启用、以何配置 */
export const InstallRecord = Schema.Struct({
  id: PluginID,
  enabled: Schema.Boolean,
  config: Schema.optionalKey(Schema.Unknown), // 原始（未解码）配置
});
export interface InstallStoreShape {
  readonly list: Effect.Effect<ReadonlyArray<InstallRecord>, StorageError>;
  readonly put: (rec: InstallRecord) => Effect.Effect<void, StorageError>;
  readonly remove: (id: PluginID) => Effect.Effect<void, StorageError>;
}
export class InstallStore extends Context.Service<
  InstallStore,
  InstallStoreShape
>()("@kernel/InstallStore") {
  static readonly memory: (
    initial?: Iterable<PluginID | InstallRecord>,
  ) => Layer.Layer<InstallStore>;
  /** durable：任何 KeyValueStore（宿主提供 localStorage/IndexedDB/fs 适配）+ Schema JSON 编解码 */
  static readonly fromKeyValue: Layer.Layer<InstallStore, never, KeyValueStore>;
}
```

内核对 `load` 的返回做 `Schema.decodeUnknownEffect(PluginManifest)`，失败即 `ManifestInvalid`。这是动态边界的第一道校验。内核**不提供**任何平台实现（没有 `localStorage`，没有 `import.meta.glob`）——它们属于宿主；内核只提供与平台无关的 `memory` 与"基于抽象 `KeyValueStore`"的组合实现。

### 4.5 `PluginRegistry`

状态模型、`topoSort`/`toLevels`、正反向依赖校验、`install` 先启用成功再落盘，均沿用 v2。`activate` 改为通过 `CapabilityBroker`：

```ts
const activate = (rec: PluginRecord) =>
  Effect.gen(function* () {
    yield* (yield* PermissionPolicy).check(rec.manifest);
    const mod = yield* (yield* PluginLoader).load(rec.manifest.id);
    const broker = yield* CapabilityBroker;
    const scope = yield* Scope.make("sequential");
    const kernelCtx = yield* Effect.context<
      ServiceRegistry | EventHub | PluginRegistry
    >();

    const fail = (cause: unknown) =>
      new PluginSetupError({ id: rec.manifest.id, cause });
    const rollback = Effect.tapError(() => Scope.close(scope, Exit.void));

    if (mod.kind === "effect") {
      const capCtx = yield* broker.contextFor(rec.manifest);
      yield* Layer.buildWithScope(mod.layer, scope).pipe(
        Effect.provide(Context.merge(kernelCtx, capCtx)),
        Effect.mapError(fail),
        rollback,
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
      Effect.timeout("10 seconds"),
      Effect.catchTag("TimeoutError", (e) => Effect.fail(fail(e))),
      rollback,
    );
    return scope;
  });
```

`makeFacadeContext` 即 v2 §7 中的 `scoped` / `run` / `runSync` 三件套，基于 `Effect.runSyncWith(ctx)` / `Effect.runPromiseWith(ctx)` 与 `Scope.fork(scope)`。v4 在 FacadeContext 上追加 `access`、`require`、`audit`、`guard`、`onUninstall`（§10.2 / §10.5 / §10.8）。

> 上面的代码是 v3 形态的示意。v4 的实际激活流程在其外层增加：每插件读写锁（§10.1）、版本与 sdk 兼容校验（§10.3）、config 解码（§10.7）、权限解析与审计（§10.5）、span/日志注解（§10.9）；插件 Scope 不再 fork 自 registry 的 Scope，而是独立创建并由有序停机统一关闭（§10.1）。

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
  rt: ManagedRuntime.ManagedRuntime<KernelEnv, never>,
): KernelView => {
  const reg = rt.runSync(Effect.service(PluginRegistry));
  return {
    snapshot: () => rt.runSync(SubscriptionRef.get(reg.state)),
    subscribe: (cb) => {
      const fiber = rt.runFork(
        SubscriptionRef.changes(reg.state).pipe(
          Stream.runForEach(() => Effect.sync(cb)),
        ),
      );
      return () => {
        rt.runFork(Fiber.interrupt(fiber));
      };
    },
    enable: (id) => rt.runPromise(reg.enable(id)),
    disable: (id) => rt.runPromise(reg.disable(id)),
    install: (id) => rt.runPromise(reg.install(id, { manual: true })),
    uninstall: (id) => rt.runPromise(reg.uninstall(id)),
  };
};
```

`subscribe`/`snapshot` 恰好是 `useSyncExternalStore` 的签名，也适配 Lit `@lit/task`、Svelte store、或纯 DOM 的手动刷新。

v4 追加：`reconfigure(id, rawConfig)`（§10.7）、`reportFault(id, cause)`（宿主把 `window.onerror` 等平台级未捕获异常归因后上报，§10.2）、`diagnostics()`（可 `JSON.stringify` 的诊断导出，§10.9）、`observe(cb, { replay })`（活动流，§10.10）。`PluginRecord` 增加 `lastError`、`restarts` 字段，`status` 扩展为 `starting | enabled | stopping | disabled | failed | quarantined`。

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
  cfg: KernelConfig<Caps>,
) => {
  const kernel = PluginRegistry.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(ServiceRegistry.layer, EventHub.layer)),
    Layer.provideMerge(CapabilityBroker.fromDefs(cfg.capabilities)),
    Layer.provideMerge(cfg.capabilityLayer),
    Layer.provideMerge(Layer.mergeAll(cfg.loader, cfg.store, cfg.permission)),
  );
  const runtime = ManagedRuntime.make(kernel);
  return {
    runtime,
    view: makeKernelView(runtime),
    bootstrap: () =>
      runtime.runPromise(Effect.flatMap(PluginRegistry, (r) => r.bootstrap)),
    dispose: () => runtime.dispose(),
  };
};
```

类型约束：`capabilityLayer` 的输出必须覆盖 `capabilities` 中每个 def 的 `Identifier`，少给一个是编译错误——宿主与插件都被同一套类型钳住。

v4 的 `KernelConfig` 追加可选项（全部有生产可用的默认值）：

```ts
readonly supervision?: Partial<SupervisionPolicy>; // §10.2 重启/熔断
readonly events?: Partial<EventHubOptions>;        // §10.6 容量/策略/校验
readonly timeouts?: { setup?: Duration.Input; stop?: Duration.Input; load?: Duration.Input };
readonly audit?: Layer.Layer<AuditLog>;            // §10.5 缺省为内存环形缓冲 + 结构化日志
```

`dispose()` 先执行有序停机（§10.1）再释放 runtime。`bootstrap()` 不再因单个插件失败而 reject，而是返回 `BootstrapReport`。

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

## 10. 生产级强化（v4）

本章是 v4 的主体。每一节先给**决策**，再给**不变量**（测试据此编写）。

### 10.1 并发与生命周期状态机

**状态机**

```
            install/enable                 setup ok
 (absent) ───────────────▶ starting ──────────────────▶ enabled
                               │ setup/校验失败              │ disable        │ 运行期故障
                               ▼                            ▼                ▼
                            failed ◀──────────────── stopping ◀──── 监管器（§10.2）
                               │ 重启预算耗尽                 │
                               ▼                            ▼
                          quarantined                   disabled
```

- `starting` / `stopping` 是对外可见的中间态，KernelView 订阅者能看到进行中的迁移。
- `failed` 携带 `lastError: { tag, message }`（可序列化）；`quarantined` 只能由显式 `enable` 解除，并清零重启计数。

**互斥：每插件读写锁（`Semaphore` 实现）**

每个插件一个 `Semaphore.makeUnsafe(MAX)`：独占 = 取 `MAX` 个许可，共享 = 取 1 个。

| 操作                          | 锁                        |
| ----------------------------- | ------------------------- |
| `install(A)` / `enable(A)`    | A 独占 + A 的每个依赖共享 |
| `disable(A)` / `uninstall(A)` | A 独占                    |
| 级联重启/隔离 `A`             | A 及其所有传递依赖者独占  |
| 停机                          | 按层逐个独占              |

- 多把锁**按 PluginID 字典序获取**，杜绝死锁。
- 不变量 1：同一插件任意时刻至多一个生命周期操作在执行——并发 `enable(A)` 只会构建一次 Scope，第二个调用观察到 `enabled` 后直接返回。
- 不变量 2：`enable(B)` 持有依赖 A 的共享锁，`disable(A)` 需要 A 的独占锁，因此"B 检查 A 已启用"与"A 被停用"不可能交错；`disable(A)` 看到的依赖者集合是准确的。
- 兄弟插件（共享同一依赖）之间只竞争共享锁，bootstrap 同层仍可并行。
- 生命周期操作内部调用的是"已持锁"版本，Semaphore 不可重入，公开 API 永远只在最外层取锁。

**有序停机（reverse-Kahn）**

- 插件 Scope 由 `Scope.make()` 独立创建（不再 fork 自 registry 的 layer scope），因为 fork 的子 Scope 会按创建逆序关闭，与依赖拓扑无关。
- registry layer 注册一个 finalizer：对所有 `enabled` 插件求 Kahn 分层，**逆序**逐层关闭（层内并行）；依赖者先关，被依赖者最后关。每个插件关闭有 `timeouts.stop`（默认 5s）上限，超时记日志并继续。
- `dispose()` = 有序停机 + `runtime.dispose()`；停机期间监管器不再发起重启。

**bootstrap 半失败语义**

1. 读取 InstallStore 中全部记录；并行加载所有模块（`enabled: false` 的也加载以展示 manifest）。加载/解码失败 → 该插件记 `failed`，不阻断其他插件。
2. 对 `enabled: true` 集合做 Kahn 分层；成环的节点记 `failed(DependencyCycle)`，其余照常。
3. 按层激活，层内并行。任一插件失败 → 记 `failed`；其依赖者在自己的 `enable` 前置检查中得到 `DependencyMissing` / `DependencyVersionMismatch`，同样记 `failed`，**不回滚**同层已成功的插件。
4. **store 不被 bootstrap 改写**：store 是期望态，snapshot 是实际态；二者不一致即"需要关注"，下次启动会重试。这就是启动 reconcile 的收敛规则：期望 enabled 而激活失败 → 实际态收敛为 `failed`，绝不悬空在 `starting`。
5. 返回 `BootstrapReport { enabled: PluginID[]; failed: Array<{ id; error }> }`，bootstrap 本身不失败（除非 store 读取失败）。

### 10.2 故障隔离与监管

**捕获面**：插件代码在内核之外被调用的每个入口都经过 `guard`，异常被归因到插件并投递给监管器，而不是逃逸到宿主调用方的栈上。

| 入口                                  | 处理                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `events.on` 回调                      | 同步 throw / 返回 rejected Promise → 归因订阅者，订阅继续存活                               |
| 插件注册的服务（`services.register`） | impl 被包成 Proxy：方法 throw/reject → 归因**提供者**；调用方仍收到原错误（它必须知道失败） |
| `FacadeContext.scoped` 中的 fiber     | 非中断的失败/defect → 归因该插件                                                            |
| 交给 capability 的插件回调            | capability 实现用 `ctx.guard(cb)` 包装（例如 `dom.mount(slot, ctx.guard(render))`）         |
| 平台级未捕获异常                      | 宿主（如 `window.onerror`/`unhandledrejection`）自行归因后调用 `KernelView.reportFault`     |

Effect 插件自己 fork 的 fiber 不在监管范围内（Effect 作者应使用 `Effect.forkScoped` 并自行处理错误）；其 layer 构建失败仍走 `PluginSetupError`。

**监管器**：registry layer 内一个常驻 fiber，从 `Queue.unbounded<Fault>` 取故障（投递是同步 `offerUnsafe`，可以在任意回调里调用），串行处理：

1. 插件不在 `enabled` → 仅记录日志（例如 disable 之后的迟到回调）。
2. 级联停止：先按逆拓扑停止它的传递依赖者，再停止它本身，状态记 `failed`（`lastError` = 故障原因）。
3. 在滑动窗口 `window`（默认 60s）内计数；超过 `maxRestarts`（默认 3）→ **熔断**：状态记 `quarantined`，被停止的依赖者记 `failed(DependencyMissing)`，不再自动重启。
4. 否则等待指数退避 `min(initial * factor^(n-1), max)`（默认 100ms × 2ⁿ，上限 5s），期间若用户手动改变了该插件状态则放弃；随后重新 `enable`，成功后按拓扑序恢复被级联停止的依赖者；重启失败计入同一预算并回到第 3 步。

```ts
export interface SupervisionPolicy {
  readonly maxRestarts: number; // 0 = 故障即 failed，不重启
  readonly window: Duration.Input;
  readonly backoff: {
    readonly initial: Duration.Input;
    readonly max: Duration.Input;
    readonly factor: number;
  };
}
```

### 10.3 版本与兼容性

**依赖版本约束**：`dependencies: Array<{ id, range }>`。range 语法是 npm semver 的子集，由 sdk 内置的零依赖实现解析：`*`、`1.2.3`（精确）、`^1.2.3`、`~1.2.3`、`>=`/`>`/`<=`/`<`，空格连接表示"且"，`||` 表示"或"。预发布标签参与比较但不做 npm 的"同 tuple 才匹配预发布"特例。`enable` 前置检查：依赖必须 `enabled` 且 `satisfies(dep.version, range)`，否则 `DependencyVersionMismatch`。

**manifest 结构**：只有当前标准一种，不带 schemaVersion、不做迁移；不符合 Schema 即 `ManifestInvalid`。结构演进通过 sdk 版本号表达（见下）。

**sdk 兼容窗口**：

- sdk 导出 `SDK_VERSION`，`definePlugin` / `defineEffectPlugin` 自动把它写入 `manifest.sdkVersion`。内核运行时用它自己链接的 `SDK_VERSION` 做检查：
  - `1.x` 及以后：主版本相同，且插件的次版本 ≤ 内核的次版本（内核向后兼容同主版本内更早的插件）。
  - `0.x`：主、次版本都必须相同（0.x 期间次版本即破坏性版本）。
  - 缺失 `sdkVersion`（手写的旧插件）：放行并记 warning 日志。
- 不满足 → `SdkIncompatible`，插件不会被激活。
- sdk 的发布约定：只增不改的契约变更（新增可选字段、新增 capability）递增次版本；删除/重命名/改变语义递增主版本。

### 10.4 加载与制品安全

- 内核对 `PluginLoader.load` 统一加超时（`timeouts.load`，默认 10s），超时 → `PluginLoadError`；并额外校验返回值的结构（`kind` + `setup`/`layer`），不合格 → `ManifestInvalid`。
- 生产加载器在宿主层实现（DOM 宿主：`EsmPluginLoader`）：
  1. **白名单**：插件 URL 必须来自 `allowOrigins`（按 `URL.origin` 精确比较），否则拒绝。
  2. **大小限制**：先按 `Content-Length`，再按实际读取的字节数，超过 `maxBytes`（默认 1 MiB）拒绝。
  3. **完整性**：catalog 中每项携带 SRI（`sha256-…`/`sha384-…`/`sha512-…`），用 `crypto.subtle.digest` 校验读取到的字节；缺失 SRI 视为拒绝（可显式 `requireIntegrity: false` 关闭，仅用于开发）。
  4. **执行**：校验过的字节构造为 Blob URL 再 `import()`——确保执行的正是被校验的字节，而不是二次请求的结果；模块必须 `export default` 一个插件模块。
  5. 超时由 `AbortController` 实施，同时受内核的 `timeouts.load` 兜底。
- **制品约定**：单文件 ESM（外部依赖全部打包，`@bbblank/sdk` 除类型外不得被打包两份——sdk 运行时部分只有 `definePlugin` 等纯函数，重复打包无害但会使 `SDK_VERSION` 以插件构建时为准，这恰好是兼容性检查需要的）；产物名带内容哈希；sourcemap 单独发布、不内联；catalog（`id → { url, integrity, manifest? }`）作为发布清单与制品一起签发，版本锁以 catalog 为准。

### 10.5 权限模型

- manifest 按资源声明所需权限：`access: { [capabilityId]: 'read' | 'write' }`（缺省 `write`），`services.provide: string[]`（缺省不能提供任何服务）。
- `PermissionPolicy` 是宿主策略点，决定**有效授权** = manifest 申请 ∩ 宿主上限：

```ts
export interface PermissionPolicyShape {
  readonly check: (m: PluginManifest) => Effect.Effect<void, PermissionDenied>; // 激活闸门
  readonly access: (
    m: PluginManifest,
    capability: string,
  ) => AccessLevel | undefined; // undefined = 拒绝
  readonly canProvide: (m: PluginManifest, serviceKey: string) => boolean;
}
PermissionPolicy.permissive; // 信任 manifest 申请
PermissionPolicy.restrict(limitsFor); // 宿主按插件给出上限，取交集
```

- 激活时每个声明的 capability 都解析出有效级别；被拒绝 → `PermissionDenied(capability:<id>)`，插件不会激活。
- 有效级别传给 facade 投影：`FacadeContext.access`；capability 作者在写方法里调用 `ctx.require('write')`，不足则抛 `PermissionDenied(capability:<id>:write)` 并写审计。能力作者也可以直接按 `ctx.access` 返回裁剪后的 facade。
- **审计**：`AuditLog` 服务（缺省：内存环形缓冲 500 条 + 结构化日志）。记录：激活时的授权结果、服务注册（允许/拒绝）、`ctx.require` 拒绝、capability 作者显式调用的 `ctx.audit(action, target)`（用于标记特权操作）。审计条目进入诊断导出。

### 10.6 事件总线背压

- 每个订阅者一个独立的有界队列（缺省容量 1024），慢消费者只影响自己。
- 满时策略（`EventHubOptions.strategy`）：
  - `dropping`（**缺省**）：丢弃新消息；
  - `sliding`：丢弃最旧消息；
  - `suspend`：发布方等待。插件侧 `emit` 是同步 API，因此在 `suspend` 下以 fork 方式发布（fire-and-forget）。
- 被丢弃的消息写入死信环形缓冲（缺省 100 条：`{ topic, subscriber, reason, at }`，不保留 payload 以免泄露/占内存），并计入 `bbblank_events_dropped` 指标。
- Schema 校验由 `events.validate` 控制，**缺省开启**（生产也开启：用校验成本换数据可信）；校验失败的 `emit` 抛 `EventPayloadInvalid` 给发布方。

### 10.7 插件配置

- `configSchema: Schema.Decoder<C>` + `defaultConfig`（编码形态）。原始配置来源优先级：`InstallStore` 记录中的 `config` > `defaultConfig` > `{}`。
- 解码失败 → `ConfigInvalid`，插件不激活。解码后的值作为 `setup(api, config)` 第二参；Effect 插件把 `layer` 写成 `(config) => Layer`。
- `reconfigure(id, raw)`：先解码（失败即返回 `ConfigInvalid`，不做任何改变）→ 落盘 → 若插件已启用则**级联重启**（与 §10.2 相同的停止/恢复顺序，但不计入故障预算）。没有"热更新"语义：配置变化 = 重启该插件的 Scope，插件不需要写配置 diff 逻辑。

### 10.8 持久化与崩溃恢复

- `InstallStore` 记录期望态 `{ id, enabled, config }`，以 `list/put/remove` 细粒度操作表达，便于 durable 实现原子写单条记录。
- 写入时机：`install` 成功后 `put(enabled: true)`；`enable` 成功后 / `disable` 后 `put`；`reconfigure` 解码成功后 `put`；`uninstall` 后 `remove`。失败的 `install` 不落盘。
- durable 实现：内核提供抽象 `KeyValueStore`（`get/set/remove/keys(prefix)`，字符串值）与 `InstallStore.fromKeyValue`（每条记录一个 key，Schema JSON 编解码，损坏记录跳过并记日志）；宿主提供 `KeyValueStore` 的平台实现（DOM：`localStorage`）。
- **插件私有持久状态**：sdk 定义 `Storage` capability（`get/set/remove/keys/clear`，按 pluginId 命名空间隔离，读方法需 `read`、写方法需 `write`）；内核提供基于 `KeyValueStore` 的 `PluginStorageLive`。facade 通过 `ctx.onUninstall` 注册"卸载时清空该插件命名空间"，保证 uninstall 不留垃圾。
- 启动 reconcile 见 §10.1。

### 10.9 可观测性

- **Tracing**：`plugin.install` / `plugin.enable` / `plugin.disable` / `plugin.activate` / `plugin.restart` span，属性含 `plugin.id`、`plugin.version`；失败时 span 状态即失败原因。宿主通过替换 Effect 的 Tracer 接入 OTel。
- **日志**：内核所有针对单个插件的日志经 `Effect.annotateLogs({ pluginId })`；FacadeContext 的 `run/runSync` 也在该注解下运行，capability 实现的日志自动带 `pluginId`。
- **指标**（Effect `Metric`，宿主可导出）：
  - `bbblank_plugin_transitions_total{plugin, status}`
  - `bbblank_plugin_activate_duration`（timer，`plugin`）
  - `bbblank_plugin_faults_total{plugin}`
  - `bbblank_events_published_total{topic}` / `bbblank_events_dropped_total{topic}`
- **诊断导出**：`KernelView.diagnostics()` 返回纯 JSON 对象（无 Map/函数/循环引用），可直接挂到健康检查端点：

```ts
export interface Diagnostics {
  readonly at: number;
  readonly healthy: boolean; // 没有 failed/quarantined
  readonly plugins: ReadonlyArray<{
    id;
    name;
    version;
    kind;
    status;
    restarts;
    lastError?;
    dependencies;
    services: string[];
  }>;
  readonly events: {
    published: number;
    dropped: number;
    deadLetters: ReadonlyArray<DeadLetter>;
  };
  readonly audit: ReadonlyArray<AuditEntry>;
}
```

### 10.10 活动流（Activity）

诊断导出（§10.9）是某一时刻的快照，不足以回答「刚才发生了什么、各阶段耗时多少」。内核另维护一条**活动流**：事件发布与生命周期阶段的有序记录。

```ts
export type Activity =
  | {
      kind: "event";
      seq;
      at;
      topic;
      publisher: string;
      payload: unknown;
      subscribers: number;
    }
  | { kind: "event-invalid"; seq; at; topic; publisher: string; issue: string }
  | {
      kind: "event-dropped";
      seq;
      at;
      topic;
      subscriber: string;
      reason: "dropped-newest" | "dropped-oldest";
    }
  | {
      kind: "lifecycle";
      seq;
      at;
      pluginId;
      phase: "load" | "setup" | "stop";
      durationMs: number;
      outcome: "ok" | "error";
      error?: SerializedError;
    };

export interface ActivityLogShape {
  readonly record: (a: ActivityInput) => Effect.Effect<void>; // 分配 seq，写入环形缓冲并通知观察者
  readonly recent: Effect.Effect<ReadonlyArray<Activity>>;
  readonly observe: (cb: (a: Activity) => void) => Effect.Effect<() => void>;
}
```

- **记录点**：
  - `EventBus.validate` 失败 → `event-invalid`；`deliver` → `event`（`subscribers` 为投递时的订阅者数）；背压丢弃 → `event-dropped`（与死信同源）。`publisher` 为发布插件 id；Effect 插件经 `EventHub.publish` 发布时内核无法归因，记为 `"anonymous"`。
  - `PluginRegistry`：`load`（`PluginLoader.load` + 结构/manifest 校验，已加载的模块不再记录）、`setup`（激活：plain 插件的 `setup()` / Effect 插件的 layer 构建）、`stop`（关闭插件 Scope）。`at` 为阶段开始时间，`durationMs` 为阶段耗时。
- **容量**：环形缓冲，缺省 1000 条（`createKernel({ activity: { capacity } })`，`0` 关闭记录）。`event` 条目**保留 payload 引用**（不复制），用于观察者展示；这是与死信（不保留 payload）的有意区别，因此读取活动流需要授权（见下）。
- **观察**：`KernelView.observe(cb, { replay })`——`replay: true` 先同步回放缓冲区中的历史，再推送新记录；观察者回调抛错被吞掉并记日志，不影响内核。
- **授权**：活动流包含任意插件之间传递的数据，内核不直接向插件暴露它。宿主可把它投影进自己的 capability（如 DOM 宿主的 `PluginManager.observe`，需 `read` 授权并写审计 `pluginManager:observe`），由 `PermissionPolicy` 决定哪些插件可以读取。

### 10.11 与 v3 的差异

| v3                             | v4                                                           |
| ------------------------------ | ------------------------------------------------------------ |
| Registry 操作无互斥            | 每插件读写锁 + 字典序多锁                                    |
| 插件 Scope fork 自 layer scope | 独立 Scope + reverse-Kahn 有序停机                           |
| bootstrap 任一失败即整体失败   | 逐插件 `failed`，返回 `BootstrapReport`                      |
| 运行期异常逃逸到宿主           | guard 归因 + 监管器重启 + 熔断隔离                           |
| `dependencies: PluginID[]`     | `{ id, range }` + `DependencyVersionMismatch`                |
| manifest 无版本                | `sdkVersion` + 兼容窗口检查                                  |
| `perm: guest/admin`            | 按 capability 的 `read/write` + 按服务 key 的 provide + 审计 |
| `PubSub.unbounded`             | 每订阅者有界队列 + 策略 + 死信；校验缺省开启                 |
| 无插件配置                     | `configSchema` + `setup(api, config)` + `reconfigure`        |
| `InstallStore` 只存 ID 集合    | 期望态记录 + durable `fromKeyValue` + 插件 `Storage` 能力    |
| 无可观测性                     | span / 注解日志 / 指标 / JSON 诊断导出 / 活动流              |

---

## 附录 A：DOM 宿主实例（`@host/dom`）

内核对此一无所知。实现见 `packages/host-dom`，示例站点见 `apps/blog`。

**Dom**（`dom-capability.ts`）

```ts
export interface DomFacade {
  mount(
    slot: Slot,
    render: (host: HTMLElement) => Cleanup | void,
    weight?: number,
  ): Cleanup; // write
  provideSlot(slot: Slot, el: HTMLElement): Cleanup; // write，审计
  slots(): ReadonlyArray<Slot>; // read
  head: {
    addMeta(attrs: Record<string, string>): Cleanup;
    addStyle(css: string): Cleanup;
  }; // write
}
export const DomLive: (
  doc?: Document,
  opts?: { root?: HTMLElement },
) => Layer.Layer<"dom">;

// Slot 是 Effect Brand 品牌字符串，裸字符串不能赋给它
export type Slot = string & Brand.Brand<"Slot">;
export const defineSlot = Brand.nominal<Slot>();
export const RootSlot: Slot; // 宿主预置
```

- 分区挂载：每个挂载是一个 `<div data-plugin data-slot data-weight>`，插件只拿到自己的 host 元素；同一 slot 内按 `weight` 升序、同 weight 按挂载先后。
- slot 由插件提供（通常是 shell），宿主只预置 `RootSlot`（缺省 `document.body`）。提供方把自己的 Slot Token 放在独立的契约模块中导出（如 `apps/blog/src/plugins/shell/api.ts`），挂载方 import Token 使用——拼错 slot 是编译错误，而不是运行时静默挂起。
- 先挂载、后提供的 slot 会挂起等待；slot 撤销（shell 停用）时其中挂载全部卸载，重新提供时再挂回——插件启用顺序因此无关紧要，内容插件也无需声明对 shell 的依赖。同一 slot 已被其他插件提供时 `provideSlot` 失败。
- `render` 经 `ctx.guard` 包装：抛错归因到插件并交给监管器，不影响宿主。
- `addStyle` 注入 `@layer plugin-<id>`，插件样式按层隔离优先级。
- 只依赖传入的 `Document`：浏览器与 happy-dom/linkedom（预渲染、测试）共用同一实现。

**Router**（`router-capability.ts`）：`current()` / `onChange(cb)`（read，立即回调一次当前路径）、`navigate(path)`（write，History `pushState`）；`RouterLive(window)` 监听 `popstate`，随 layer 释放。

**存储**：插件私有 KV 用 sdk 的 `Storage` capability + 内核 `PluginStorageLive`；宿主只提供 `localStorageKeyValue()`（`local-storage.ts`），它同时支撑 `InstallStore.fromKeyValue`。

**Html**（`html-capability.ts`）：`trust(raw): TrustedHtml`（write，审计）——经 DOMPurify 去除脚本、事件属性、`javascript:` URL，返回冻结且不可伪造（模块私有 `WeakSet` 登记）的对象；渲染方只对 `isTrustedHtml(x)` 为真的值使用 `innerHTML`，普通字符串一律按文本处理。DOMPurify 报告环境不受支持时退化为整体转义。

**PluginManager**（`plugin-manager-capability.ts`）：让被授权的插件管理其他插件，是活动流（§10.10）在 DOM 宿主中的投影。

```ts
export interface PluginManagerFacade {
  // read
  list(): ReadonlyArray<PluginInfo>; // RegistrySnapshot 的纯数据投影
  subscribe(cb: () => void): Cleanup; // 状态变化
  observe(cb: (a: Activity) => void, opts?: { replay?: boolean }): Cleanup; // 审计 pluginManager:observe
  diagnostics(): Promise<Diagnostics>;
  catalog(): ReadonlyArray<PluginCatalogEntry>; // 宿主登记的可安装插件元数据（市场数据源）
  // write（审计）
  install(id): Promise<void>;
  uninstall(id): Promise<void>;
  enable(id): Promise<void>;
  disable(id): Promise<void>;
}
export const PluginManagerLive: (
  view: () => KernelView,
  catalog?: ReadonlyArray<PluginCatalogEntry>,
) => Layer.Layer<"pluginManager">;
```

- capabilityLayer 先于 kernel 构造，故以 getter 延迟取得 `KernelView`。
- 插件不能 `disable` / `uninstall` 自身（在自身回调中关闭自身 Scope 会自锁），直接 reject。
- `subscribe` / `observe` 的订阅随插件 Scope 释放。

**加载器**：随应用打包的插件用 `LazyPluginLoader`（`lazy-loader.ts`）——目录项为 `() => import(...)`，打包器据此拆分 chunk，只在 install / bootstrap 恢复时加载；远程插件用 `EsmPluginLoader`（`esm-loader.ts`，见 §10.4）。

**组装**（`apps/blog/src/main.ts`）：

```ts
const kv = localStorageKeyValue();
const kernel = createKernel({
  capabilities: [Dom, Router, Storage, PluginManager, Html],
  capabilityLayer: Layer.mergeAll(
    DomLive(document),
    RouterLive(window),
    HtmlLive(window),
    PluginStorageLive.pipe(Layer.provide(kv)),
    PluginManagerLive(() => kernel.view, catalog),
  ),
  loader: LazyPluginLoader(new Map(plugins.map((p) => [p.id, p.load]))),
  store: InstallStore.fromKeyValue.pipe(Layer.provide(kv)),
});
await kernel.bootstrap(); // 按期望态恢复
// 首次访问：按依赖顺序安装 builtin 插件（chunk 预先并行下载）
```

**插件**（`apps/blog/src/plugins`）：每个插件一个目录——

```
plugins/<name>/
  index.ts   插件定义（manifest + setup 编排），只被 plugins/index.ts 以 import() 引用
  api.ts     对外契约（服务 Token / Slot / Topic / 插件 id，只有类型与常量）；其他插件只能 import 它
  *.ts(x)    内部实现，不得跨插件 import
```

`plugins/index.ts` 是插件目录：每项 `{ id, load, builtin, name, version, description }`，只静态 import 各插件的 `api.ts`。

- `shell`（`[Dom, Router]`，builtin）：在 `RootSlot` 中搭骨架，提供 `ShellSlots` 与 `shell.footerNote` 服务（脚注，按 `order` 编号）；站内链接 `a[data-link]` 交给路由；非 Entry 路由隐藏 footer。
- `content`（`[Dom, Router]`，builtin，依赖 `shell ^1.1.0`）：按路由把 React 页面渲染进 `ShellSlots.main`；提供 `content.noteService`（为信件文字添加笔记，按出现位置连续编号并同步到脚注）、`content.routes`（外部插件登记页面路由：路由激活时 content 把页面区域提供为 `routeSlot(path)`，登记方经 `Dom.mount` 挂载内容；登记方停用时路由消失，若正处于该路由则导航回 `/`）与 `content.square.click` 事件。content 只内置自身页面（`/` 等），未登记的路径显示 404。
- `plugin-manager`（`[PluginManager]`，builtin）：订阅 `content.square.click`——devtools 已安装则打开面板；否则若 about / blog / weather 均已启用则安装 devtools 及其缺省面板插件并打开；否则安装这批插件。
- `about` / `blog` / `weather`（按需，依赖 `content ^1.0.0`）：启用时添加笔记、停用时移除；about 的笔记含 `<abbr title="我编程" data-action="open-devtools">程序员</abbr>`，脚注中点击（或聚焦后按 Enter）时 shell 发布 `shell.footnote.action { noteId, action }`，about 转发为 plugin-manager 的 `plugin-manager.devtools.request`（未安装 devtools 时先安装再打开）；blog 另经 `content.routes` 提供 `/blog` 页面（拉取远程文章并经 `Html` 净化，依赖 `content ^1.1.0`），停用后页面、路由与笔记一并消失；blog 的笔记含链接（`Html`），weather 乐观插入占位后更新为 Open-Meteo 查询结果，查询失败时移除。
- `now`（按需，依赖 `content ^1.0.0`，不随方块点击安装，只能在 devtools 的 Market 中安装）：为「现在？」添加笔记，内容为本地时间 `YYYY-MM-DD HH:mm:ss`，对齐整秒每秒更新；停用时停止计时并移除笔记。
- `devtools`（`[Dom, PluginManager, Storage]`，按需；Storage 保存抽屉高度与当前面板）：仿 Chrome DevTools 的底部抽屉，独立挂在 `RootSlot`（不依赖 shell）；内置 Plugins 面板（依赖树与启停；内核的 `disable` 在仍有已启用依赖者时返回 `DependentsActive`，因此由 devtools 按依赖顺序先停用依赖者，重新启用时按逆序恢复）与 Market 面板（插件目录与安装；作为安装入口不做成可卸载的面板插件，否则卸载后页面内再无安装途径），其余面板由面板插件提供（见下）。样式复用 chrome-devtools-frontend 的设计 tokens 与图标（BSD-3-Clause，随源码保留声明），组件为自建 Web Components（Shadow DOM 隔离站点样式）。配色与 Chrome「Match Chrome color theme」同源：Chrome 以浏览器主题色经 Material TonalSpot 生成 `--color-ref-*` 注入 DevTools，tokens 中的数值只是缺省值；页面读不到浏览器主题色，devtools 以可配置的种子色（缺省 `#01696f`，存于 Storage）经同一算法生成调色板。
- `devtools-console` / `devtools-network` / `devtools-application`（`[Dom, PluginManager]`，依赖 `devtools ^1.0.0`）：面板插件，分别是活动流中的事件、生命周期阶段耗时、安装记录与审计。plugin-manager 首次安装 devtools 时一并安装它们；之后可在 Market 中单独卸载、安装。

**devtools 面板扩展**：面板以「服务登记 + 专属插槽」两步接入——

```ts
// devtools/api.ts
export interface PanelSpec { readonly id: string; readonly title: string; readonly order?: number }
export interface DevtoolsPanelsService {
  register(spec: PanelSpec): Cleanup;                         // 出现标签；devtools 随即 provideSlot(panelSlot(id))
  setBadge(id: string, count: number): void;                  // 标签上的计数（0 隐藏）
  onShown(id: string, cb: (shown: boolean) => void): Cleanup; // 面板可见性；隐藏时不必渲染
}
export const DevtoolsPanels = defineService<DevtoolsPanelsService>('devtools.panels');
export const panelSlot = (id: string): Slot => defineSlot(`devtools.panel.${id}`);

// 面板插件 setup
api.lifecycle.addCleanup((await api.services.get(DevtoolsPanels)).register({ id: 'console', title: 'Console', order: 10 }));
api.caps.dom.mount(panelSlot('console'), host => render(host));
```

- **故障归属**：面板内容由面板插件自己经 `Dom.mount` 挂载，渲染异常经其 `ctx.guard` 归因到面板插件并由监管器重启它，devtools 不受影响；若由 devtools 回调面板的 `render`，异常会归因到 devtools。
- **生命周期**：登记的 Cleanup 与挂载都在面板插件 Scope 内，面板插件停用时标签与内容一并移除；devtools 停用时插槽撤销，挂载按 Dom 的 slot 语义卸载（依赖声明保证面板插件先被停用）。
- **最小权限**：devtools 不向面板转交数据；面板需要的数据由面板插件自行申请 capability（如 `PluginManager` 的 read），宿主可单独授权、审计。
- **样式**：插槽位于 devtools 的 Shadow Root 内，面板内容直接使用 devtools 的样式与 tokens；组件、样式、图标、配色与数据模型由 `@bbblank/devtools-ui` 包提供，devtools 与面板插件都静态 import 它（打包为公共 chunk）。

**`@bbblank/devtools-ui`**（`packages/devtools-ui`）：仿 Chrome DevTools 的 UI 套件（DOM 构造、Toolbar / SplitWidget / TreeOutline / DataGrid、设计 tokens 与图标、种子色调色板、插件与活动流的本地模型）。依赖方向：`host-dom`/`kernel`（仅类型）← `devtools-ui` ← `apps/*`。chrome-devtools-frontend 的资源（BSD-3-Clause）保存在 `vendor/`，由 `scripts/gen-assets.mjs` 生成为 TS 字符串模块，使包可直接用 `tsc` 构建、不依赖打包器的 `?raw` 导入。

空白 HTML 只需 `<script type="module" src="/src/main.ts">`。

## 附录 B：Effect v4 API 速查（新增部分）

| 用途              | API                                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 非 class 服务标识 | `Context.Service<Identifier, Shape>("key")`                                                                                                                                        |
| 读取 Context      | `Context.getOption(ctx, tag)`、`Context.make(tag, value)`、`Context.merge`、`Context.empty()`                                                                                      |
| 服务取用          | `Effect.service(Tag)`、`Effect.serviceOption(Tag)`                                                                                                                                 |
| Schema            | `Schema.Struct`、`Schema.Literals`、`Schema.optionalKey`、`Schema.Array`、`Schema.brand`、`Schema.check(Schema.isPattern(re))`、`Schema.decodeUnknownEffect/Sync`、`typeof S.Type` |
| 其余              | 同 v2 附录 A                                                                                                                                                                       |
