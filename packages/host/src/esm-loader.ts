/**
 * EsmPluginLoader —— 设计文档 §10.4，生产加载器（DOM 宿主）。
 * 白名单 origin → 大小限制（Content-Length + 实际字节）→ SRI 校验 → Blob URL import()。
 * 执行的是被校验过的那份字节，而不是二次请求的结果。结构/manifest 校验由内核完成。
 */
import { Effect, Layer } from 'effect';
import { PluginLoadError, PluginLoader } from '@bbblank/kernel';
import type { AnyPluginModule, PluginID, PluginManifest } from '@bbblank/sdk';

export interface CatalogEntry {
  readonly url: string;
  /** SRI：`sha256-…` / `sha384-…` / `sha512-…`，空格分隔多个表示任一匹配即可 */
  readonly integrity?: string;
  /** 可选：供 listAvailable 展示，免去加载 */
  readonly manifest?: PluginManifest;
}

export interface EsmLoaderOptions {
  readonly catalog: Readonly<Record<string, CatalogEntry>>;
  /** 允许的 origin（按 URL.origin 精确比较） */
  readonly allowOrigins: ReadonlyArray<string>;
  /** 缺省 1 MiB */
  readonly maxBytes?: number;
  /** 缺省 10s；内核的 timeouts.load 另行兜底 */
  readonly timeoutMs?: number;
  /** 缺省 true；仅开发环境可关闭 */
  readonly requireIntegrity?: boolean;
  /** 解析相对 url 的基准，缺省 location.href */
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  /** 执行已校验的代码并返回模块命名空间；缺省 Blob URL + import() */
  readonly importModule?: (code: string) => Promise<unknown>;
}

const ALGS = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' } as const;

const toBase64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

/** 任一声明的摘要匹配即通过；无可识别算法视为失败 */
export const verifyIntegrity = async (bytes: Uint8Array, integrity: string): Promise<boolean> => {
  for (const token of integrity.trim().split(/\s+/)) {
    const [alg, expected] = token.split(/-(.*)/s) as [string, string | undefined];
    const algo = ALGS[alg as keyof typeof ALGS];
    if (!algo || !expected) continue;
    const digest = await crypto.subtle.digest(algo, bytes as Uint8Array<ArrayBuffer>);
    if (toBase64(digest) === expected) return true;
  }
  return false;
};

const importViaBlob = async (code: string) => {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    return await import(/* @vite-ignore */ url);
  } finally {
    URL.revokeObjectURL(url);
  }
};

const readLimited = async (res: Response, maxBytes: number): Promise<Uint8Array> => {
  const declared = Number(res.headers.get('content-length') ?? NaN);
  if (declared > maxBytes) throw new Error(`bundle too large: ${declared} > ${maxBytes}`);
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`bundle too large: >${maxBytes}`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
};

export const EsmPluginLoader = (opts: EsmLoaderOptions) => {
  const {
    catalog,
    allowOrigins,
    maxBytes = 1 << 20,
    timeoutMs = 10_000,
    requireIntegrity = true,
    fetch: doFetch = globalThis.fetch.bind(globalThis),
    importModule = importViaBlob,
  } = opts;

  const loadOnce = async (id: PluginID): Promise<unknown> => {
    const entry = catalog[id];
    if (!entry) throw new Error('plugin not in catalog');
    const url = new URL(entry.url, opts.baseUrl ?? globalThis.location?.href);
    if (!allowOrigins.includes(url.origin)) throw new Error(`origin not allowed: ${url.origin}`);
    if (requireIntegrity && !entry.integrity) throw new Error('missing integrity');

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(new Error('load timeout')), timeoutMs);
    try {
      const res = await doFetch(url, { signal: ctl.signal, credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = await readLimited(res, maxBytes);
      if (entry.integrity && !(await verifyIntegrity(bytes, entry.integrity))) {
        throw new Error('integrity mismatch');
      }
      const ns = (await importModule(new TextDecoder().decode(bytes))) as { default?: unknown };
      if (!ns?.default) throw new Error('module has no default export');
      return ns.default;
    } finally {
      clearTimeout(timer);
    }
  };

  return Layer.succeed(
    PluginLoader,
    PluginLoader.of({
      load: id =>
        Effect.tryPromise({
          try: () => loadOnce(id) as Promise<AnyPluginModule>,
          catch: cause => new PluginLoadError({ id, cause }),
        }),
      listAvailable: Effect.succeed(
        Object.values(catalog).flatMap(e => (e.manifest ? [e.manifest] : []))
      ),
    })
  );
};
