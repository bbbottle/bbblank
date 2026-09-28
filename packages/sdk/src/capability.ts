/**
 * Capability 定义与推导 —— 设计文档 §2.2 / §2.3
 */
import { Context } from 'effect';
import type { Effect, Scope } from 'effect';
import type { AccessLevel, PluginID } from './manifest.js';

export type Cleanup = () => void | Promise<void>;

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
  /** 该插件对本 capability 的有效授权（manifest 申请 ∩ 宿主策略，§10.5） */
  readonly access: AccessLevel;
  /** 授权不足时抛 PermissionDenied 并写审计；写方法开头调用 */
  readonly require: (level: AccessLevel) => void;
  /** 标记一次特权操作进入审计日志 */
  readonly audit: (action: string, target?: string) => void;
  /** 包装插件交给宿主的回调：throw / rejected Promise 被吞掉（返回 undefined），归因到该插件并交给监管器（§10.2） */
  readonly guard: <Args extends ReadonlyArray<unknown>, R>(
    fn: (...args: Args) => R
  ) => (...args: Args) => R | undefined;
  /** 注册卸载时的数据清理（如清空该插件的存储命名空间，§10.8） */
  readonly onUninstall: (eff: Effect.Effect<void, unknown>) => void;
}

export const defineCapability = <Id extends string, Shape, Facade>(
  id: Id,
  facade: CapabilityDef<Id, Shape, Facade>['facade']
): CapabilityDef<Id, Shape, Facade> => ({
  id,
  tag: Context.Service<Id, Shape>(`@capability/${id}`),
  facade,
});

/**
 * 所有 CapabilityDef 的公共超类型。
 * 注意不能写成 `CapabilityDef<string, unknown, unknown>`：
 * `tag: Context.Service<I, S>` 两个参数都是 invariant，具体 def 无法赋给协变版本；
 * 这里用 `any` 绕过参数位置，推导交给 IdOf/FacadeOf 的 infer。
 */
export interface AnyCapability {
  readonly id: string;
  readonly tag: Context.Service<any, any>;
  readonly facade: (shape: any, ctx: FacadeContext) => any;
}

export type FacadeOf<C> = C extends { readonly facade: (shape: any, ctx: FacadeContext) => infer F }
  ? F
  : never;

export type IdOf<C> = C extends { readonly id: infer I } ? (I extends string ? I : never) : never;

/** { dom: DomFacade; router: RouterFacade } */
export type CapabilityRecord<Caps extends ReadonlyArray<AnyCapability>> = {
  readonly [C in Caps[number] as IdOf<C>]: FacadeOf<C>;
};
