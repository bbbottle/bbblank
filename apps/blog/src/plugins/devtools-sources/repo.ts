/**
 * 读取 GitHub 仓库中 apps/blog 的源码（固定到构建所对应的提交）。
 * - 文件列表：jsDelivr 的 flat 列表接口（一次请求取得全部文件；GitHub REST API 未认证时每 IP 每小时仅 60 次）。
 * - 文件内容：raw.githubusercontent.com，失败时改用 jsDelivr CDN。两者均返回 access-control-allow-origin: *。
 * 按提交读取的内容不可变，在内存中缓存。
 */
import { Schema } from "effect";

export const REPO = "bbbottle/bbblank";
/** 只展示的目录（仓库内路径，末尾带 /） */
export const ROOT = "apps/blog/";

export const build = { commit: __BUILD_COMMIT__, dirty: __BUILD_DIRTY__ } as const;

const FlatListing = Schema.Struct({
  files: Schema.Array(Schema.Struct({ name: Schema.String, size: Schema.Number })),
});

export interface SourceFile {
  /** 仓库内路径，如 apps/blog/src/main.ts */
  readonly path: string;
  readonly size: number;
}

export const listFiles = async (commit: string, signal?: AbortSignal): Promise<ReadonlyArray<SourceFile>> => {
  const res = await fetch(`https://data.jsdelivr.com/v1/packages/gh/${REPO}@${commit}?structure=flat`, { signal });
  if (!res.ok) throw new Error(`文件列表请求返回 ${res.status}（提交 ${commit.slice(0, 7)} 可能尚未推送到 GitHub）`);
  const { files } = Schema.decodeUnknownSync(FlatListing)(await res.json());
  return files
    .map((f) => ({ path: f.name.replace(/^\//, ""), size: f.size }))
    .filter((f) => f.path.startsWith(ROOT));
};

const contents = new Map<string, Promise<string>>();

const text = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${new URL(url).host} 返回 ${res.status}`);
  return res.text();
};

/** 读取文件内容；同一提交、同一路径只请求一次（失败时移出缓存，允许重试） */
export const fetchFile = (commit: string, path: string): Promise<string> => {
  const key = `${commit}:${path}`;
  let p = contents.get(key);
  if (!p) {
    p = text(`https://raw.githubusercontent.com/${REPO}/${commit}/${path}`).catch(() =>
      text(`https://cdn.jsdelivr.net/gh/${REPO}@${commit}/${path}`),
    );
    p.catch(() => contents.delete(key));
    contents.set(key, p);
  }
  return p;
};

export const githubUrl = (commit: string, path: string, line?: number) =>
  `https://github.com/${REPO}/blob/${commit}/${path}${line ? `#L${line}` : ""}`;
