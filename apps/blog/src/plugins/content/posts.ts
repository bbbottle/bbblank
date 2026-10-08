/**
 * content.posts 服务的实现：拉取 cf.bbki.ng 的文章列表，响应体先经 Schema 解码再使用。
 * 同一页面会话内共享一次成功的请求结果；请求失败时移出缓存，下次调用重新请求。
 */
import { Schema } from "effect";
import { PostSchema } from "./api";
import type { Post, PostsService } from "./api";

const POSTS_URL = "https://cf.bbki.ng/posts";

const decodeResponse = Schema.decodeUnknownSync(Schema.Struct({ data: Schema.Array(PostSchema) }));

const load = async (): Promise<ReadonlyArray<Post>> => {
  const res = await fetch(POSTS_URL);
  if (!res.ok) throw new Error(`GET ${POSTS_URL} ${res.status}`);
  return [...decodeResponse(await res.json()).data].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/** 调用方取消时只放弃自己的等待：共享的请求继续进行，供其他调用方使用 */
const abortable = <A>(p: Promise<A>, signal?: AbortSignal): Promise<A> => {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<A>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
};

export const createPostsService = (): PostsService => {
  let cached: Promise<ReadonlyArray<Post>> | undefined;
  const list = (signal?: AbortSignal) => {
    if (!cached) {
      const p = load();
      p.catch(() => {
        if (cached === p) cached = undefined;
      });
      cached = p;
    }
    return abortable(cached, signal);
  };
  return {
    list,
    recent: async (limit, signal) => (await list(signal)).slice(0, limit),
    byTitle: async (title, signal) => (await list(signal)).find((p) => p.title === title),
  };
};
