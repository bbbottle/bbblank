import { Context, Effect, Scope } from "effect";
import { PluginID } from "./manifest.js";

/**
 * Capability 定义与推导 —— 设计文档 §2.2 / §2.3
 *
 * TODO：
 * - `CapabilityDef<Id, Shape, Facade>`：`{ id, tag: Context.Service<Id, Shape>, facade }`
 * - `FacadeContext`：`{ pluginId, scoped, run, runSync }`
 * - `defineCapability(id, facade)`
 * - 推导：`FacadeOf<C>` / `IdOf<C>` / `CapabilityRecord<Caps>`（mapped type + `as` 键重映射）
 */

export type Cleanup = () => void | Promise<void>;

export interface CapabilityDef<Id extends string, Shape, Facade> {
  readonly id: Id;
  readonly tag: Context.Service<Id, Shape>;
  readonly facade: (shape: Shape, ctx: FacadeContext) => Facade;
}

export interface FacadeContext {
  readonly pluginId: PluginID;
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

export type AnyCapability = CapabilityDef<string, unknown, unknown>;

export type FacadeOf<C> =
  C extends CapabilityDef<string, unknown, infer F> ? F : never;
export type IdOf<C> =
  C extends CapabilityDef<infer I, unknown, unknown> ? I : never;

export type CapabilityRecord<Caps extends ReadonlyArray<AnyCapability>> = {
  readonly [C in Caps[number] as IdOf<C>]: FacadeOf<C>;
};
