import { Context, Effect, Scope } from "effect";
import { PluginID } from "./manifest.js";

/**
 * Capability 定义与推导 —— 设计文档 §2.2 / §2.3
 */
<<<<<<< HEAD

export type Cleanup = () => void | Promise<void>;

export interface CapabilityDef<Id extends string, Shape, Facade> {
  readonly id: Id;
  readonly tag: Context.Service<Id, Shape>;
=======
import { Context } from 'effect';
import type { Effect, Scope } from 'effect';
import type { PluginID } from './manifest.js';

export type Cleanup = () => void | Promise<void>;

/** 宿主侧：Effect 形态，供内核与 Effect 插件使用 */
export interface CapabilityDef<Id extends string, Shape, Facade> {
  readonly id: Id;
  readonly tag: Context.Service<Id, Shape>;
  /** 把 Effect Shape 投影为插件可见的 Promise/回调 Facade；内核在激活时调用 */
>>>>>>> 439e5ed0047a57aee2d667b2aed6184834693bcb
  readonly facade: (shape: Shape, ctx: FacadeContext) => Facade;
}

export interface FacadeContext {
  readonly pluginId: PluginID;
<<<<<<< HEAD
=======
  /** 在插件 Scope 内运行需要 Scope 的 Effect，返回可提前撤销的 Cleanup */
>>>>>>> 439e5ed0047a57aee2d667b2aed6184834693bcb
  readonly scoped: (eff: Effect.Effect<void, never, Scope.Scope>) => Cleanup;
  readonly run: <A, E>(eff: Effect.Effect<A, E>) => Promise<A>;
  readonly runSync: <A, E>(eff: Effect.Effect<A, E>) => A;
}

export const defineCapability = <Id extends string, Shape, Facade>(
  id: Id,
<<<<<<< HEAD
  facade: CapabilityDef<Id, Shape, Facade>["facade"],
=======
  facade: CapabilityDef<Id, Shape, Facade>['facade']
>>>>>>> 439e5ed0047a57aee2d667b2aed6184834693bcb
): CapabilityDef<Id, Shape, Facade> => ({
  id,
  tag: Context.Service<Id, Shape>(`@capability/${id}`),
  facade,
});

<<<<<<< HEAD
export type AnyCapability = CapabilityDef<string, unknown, unknown>;

export type FacadeOf<C> =
  C extends CapabilityDef<string, unknown, infer F> ? F : never;
export type IdOf<C> =
  C extends CapabilityDef<infer I, unknown, unknown> ? I : never;

=======
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
>>>>>>> 439e5ed0047a57aee2d667b2aed6184834693bcb
export type CapabilityRecord<Caps extends ReadonlyArray<AnyCapability>> = {
  readonly [C in Caps[number] as IdOf<C>]: FacadeOf<C>;
};
