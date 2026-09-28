/**
 * AuditLog —— 设计文档 §10.5：授权决策与特权操作的审计。
 * 缺省实现：内存环形缓冲 + 结构化日志（带 pluginId 注解）；宿主可替换为持久化实现。
 */
import { Clock, Context, Effect, Layer } from 'effect';
import type { PluginID } from '@bbblank/sdk';

export interface AuditEntry {
  readonly at: number;
  readonly pluginId: PluginID;
  readonly action: string;
  readonly target?: string;
  readonly outcome: 'allowed' | 'denied';
}

export interface AuditLogShape {
  readonly record: (entry: Omit<AuditEntry, 'at'>) => Effect.Effect<void>;
  readonly recent: Effect.Effect<ReadonlyArray<AuditEntry>>;
}

export class AuditLog extends Context.Service<AuditLog, AuditLogShape>()('@kernel/AuditLog') {
  static readonly memory = (capacity = 500) =>
    Layer.sync(AuditLog, () => {
      const buf: Array<AuditEntry> = [];
      return AuditLog.of({
        record: entry =>
          Effect.gen(function* () {
            const e: AuditEntry = { at: yield* Clock.currentTimeMillis, ...entry };
            buf.push(e);
            if (buf.length > capacity) buf.shift();
            yield* (e.outcome === 'denied' ? Effect.logWarning : Effect.logDebug)(
              'audit',
              e.action,
              e.target ?? '',
              e.outcome
            ).pipe(Effect.annotateLogs({ pluginId: e.pluginId }));
          }),
        recent: Effect.sync(() => buf.slice()),
      });
    });
}
