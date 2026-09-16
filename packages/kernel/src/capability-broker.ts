/**
 * CapabilityBroker —— 设计文档 §4.2，内核与宿主之间的唯一接缝。
 * 宿主在组装 runtime 时把提供的 Capability 列表交给它。
 */
import { Context, Effect, Layer, Option } from 'effect';
import type {
  AnyCapability,
  FacadeContext,
  PluginManifest,
} from '@bbblank/sdk';
import { CapabilityMissing } from './errors.js';

export interface CapabilityBrokerShape {
  readonly has: (id: string) => boolean;
  /** 为某插件构建 caps 记录：只包含其声明且宿主提供的能力 */
  readonly facadesFor: (
    manifest: PluginManifest,
    ctx: FacadeContext
  ) => Effect.Effect<Record<string, unknown>, CapabilityMissing>;
  /** Effect 插件用：把声明的能力 Context 子集提取出来（unknown：异构服务联合） */
  readonly contextFor: (
    manifest: PluginManifest
  ) => Effect.Effect<Context.Context<unknown>, CapabilityMissing>;
}

export class CapabilityBroker extends Context.Service<CapabilityBroker, CapabilityBrokerShape>()(
  '@kernel/CapabilityBroker'
) {
  /**
   * 注意：fromDefs 的 Layer 需要宿主在 provide 时把所有 Capability Layer 先合并进来，
   * `Effect.context<never>()` 才能在运行时抓到它们（见 createKernel §6）。
   * 类型上声明 R=never，是刻意为之——capability 集合在编译期对内核不可知。
   */
  static readonly fromDefs = (defs: ReadonlyArray<AnyCapability>) =>
    Layer.effect(
      CapabilityBroker,
      Effect.gen(function* () {
        const ctx = yield* Effect.context<never>();
        const byId = new Map(defs.map(d => [d.id, d] as const));

        const lookup = (id: string) => {
          const def = byId.get(id);
          if (!def) return undefined;
          const shape = Context.getOption(ctx, def.tag);
          return Option.isSome(shape) ? { def, shape: shape.value } : undefined;
        };

        const facadesFor: CapabilityBrokerShape['facadesFor'] = (manifest, fctx) =>
          Effect.forEach(manifest.capabilities, id => {
            const found = lookup(id);
            return found
              ? Effect.succeed([id, found.def.facade(found.shape, fctx)] as const)
              : Effect.fail(new CapabilityMissing({ id: manifest.id, capability: id }));
          }).pipe(Effect.map(entries => Object.fromEntries(entries)));

        const contextFor: CapabilityBrokerShape['contextFor'] = manifest =>
          Effect.forEach(manifest.capabilities, id => {
            const found = lookup(id);
            return found
              ? Effect.succeed(Context.make(found.def.tag, found.shape))
              : Effect.fail(new CapabilityMissing({ id: manifest.id, capability: id }));
          }).pipe(
            Effect.map(cs =>
              cs.reduce((acc, c) => Context.merge(acc, c), Context.empty() as Context.Context<unknown>)
            )
          );

        return CapabilityBroker.of({
          has: id => lookup(id) !== undefined,
          facadesFor,
          contextFor,
        });
      })
    );
}
