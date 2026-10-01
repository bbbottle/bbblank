/** /blog 的数据源：拉取 cf.bbki.ng 的文章列表，响应体先经 Schema 解码再使用 */
import { Schema } from "effect";

const POSTS_URL = "https://cf.bbki.ng/posts";

const PostSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  /** 远程 HTML，渲染前须经 Html capability 净化 */
  content: Schema.String,
  author: Schema.String,
  createdAt: Schema.String,
});

export type Post = Schema.Schema.Type<typeof PostSchema>;

const decodeResponse = Schema.decodeUnknownSync(
  Schema.Struct({ data: Schema.Array(PostSchema) }),
);

/** 按 createdAt（ISO 8601，可直接按字符串比较）降序取最近 limit 篇 */
export const fetchPosts = async (
  limit: number,
  signal?: AbortSignal,
): Promise<ReadonlyArray<Post>> => {
  const res = await fetch(POSTS_URL, { signal });
  if (!res.ok) throw new Error(`GET ${POSTS_URL} ${res.status}`);
  return [...decodeResponse(await res.json()).data]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
};
