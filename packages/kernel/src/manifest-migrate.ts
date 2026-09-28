/**
 * manifest 迁移链 —— 设计文档 §10.3
 * 从 manifest 声明的 schemaVersion（缺省 1）逐步迁移到 MANIFEST_SCHEMA_VERSION，再交给 Schema 解码。
 */
import { Effect, Schema } from 'effect';
import { MANIFEST_SCHEMA_VERSION, PluginManifest } from '@bbblank/sdk';
import { ManifestInvalid } from './errors.js';

type Raw = Record<string, unknown>;

/** migrations[n]：schemaVersion n → n+1 */
const migrations: Record<number, (m: Raw) => Raw> = {
  1: ({ perm, dependencies, ...m }) => ({
    ...m,
    schemaVersion: 2,
    ...(Array.isArray(dependencies)
      ? {
          dependencies: dependencies.map(d =>
            typeof d === 'string' ? { id: d, range: '*' } : d
          ),
        }
      : {}),
    ...(perm === 'admin' ? { services: { provide: ['*'] } } : {}),
  }),
};

const idOf = (raw: unknown) =>
  typeof raw === 'object' && raw !== null && typeof (raw as Raw).id === 'string'
    ? ((raw as Raw).id as string)
    : '<unknown>';

export const migrateManifest = (raw: unknown): Effect.Effect<unknown, ManifestInvalid> =>
  Effect.suspend(() => {
    if (typeof raw !== 'object' || raw === null) {
      return Effect.fail(new ManifestInvalid({ id: idOf(raw), issue: 'manifest is not an object' }));
    }
    let m = raw as Raw;
    let version = m.schemaVersion ?? 1;
    if (typeof version !== 'number' || version > MANIFEST_SCHEMA_VERSION) {
      return Effect.fail(
        new ManifestInvalid({ id: idOf(raw), issue: `unsupported schemaVersion ${String(version)}` })
      );
    }
    while (version < MANIFEST_SCHEMA_VERSION) {
      const step = migrations[version];
      if (!step) {
        return Effect.fail(
          new ManifestInvalid({ id: idOf(raw), issue: `no migration from schemaVersion ${version}` })
        );
      }
      m = step(m);
      version++;
    }
    return Effect.succeed(m);
  });

/** 迁移 + 解码：动态边界的第一道校验 */
export const decodeManifest = (raw: unknown): Effect.Effect<PluginManifest, ManifestInvalid> =>
  Effect.flatMap(migrateManifest(raw), m =>
    Schema.decodeUnknownEffect(PluginManifest)(m).pipe(
      Effect.mapError(e => new ManifestInvalid({ id: idOf(raw), issue: String(e) }))
    )
  );
