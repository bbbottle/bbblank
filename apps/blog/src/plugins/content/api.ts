/**
 * content 对外契约：插件 id、`content.noteService`、`content.routes`、`content.posts` 服务与事件（只有类型与 Token，不含实现）。
 * 其他插件只 import 本文件，不依赖 content 的实现代码。
 */
import { defineService, defineTopic } from "@bbblank/sdk";
import type { Cleanup, PluginID } from "@bbblank/sdk";
import { defineSlot } from "@bbblank/host-dom";
import type { Slot } from "@bbblank/host-dom";
import { Schema } from "effect";
import { NoteSchema } from "../shell/api";

/** 供依赖声明、`[data-plugin]` 选择器使用 */
export const ContentPluginId = "content" as PluginID;

export const LetterSchema = Schema.Struct({
  openlings: Schema.String,
  body: Schema.String,
  author: Schema.String,
  date: Schema.String,
  address: Schema.String,
});

export const ContentNodeSchema = Schema.Struct({
  contentStr: Schema.String,
  note: NoteSchema,
});

export type ContentNote = Schema.Schema.Type<typeof ContentNodeSchema>;

export type Letter = Schema.Schema.Type<typeof LetterSchema>;

export interface IContentNoteService {
  /** 原始信件（不含笔记标记） */
  getLetter: () => Letter;
  listNotes: () => ReadonlyArray<ContentNote>;
  /** 按 note.id 新增或替换：正文在 contentStr 之后标注 `[id]`，并同步到 shell 的脚注 */
  upsertNote: (contentNote: ContentNote) => void;
  /** 移除正文标记与对应脚注；id 不存在时无操作 */
  delNote: (id: number) => void;
}

export const ContentNoteService = defineService<IContentNoteService>(
  "content.noteService",
);

/**
 * 页面路由由提供页面的插件登记（content 只内置 "/" 等自身页面）：
 *   api.lifecycle.addCleanup((await api.services.get(ContentRoutes)).register("/blog"));
 *   api.caps.dom.mount(routeSlot("/blog"), (host) => render(host));
 * 路由激活时 content 把页面区域提供为 routeSlot(path)。登记方停用（Cleanup）时路由随之消失，
 * 若当前正处于该路由则导航回 "/"。
 */
export interface ContentRoutesService {
  /** path 与内置页面或已登记路由重复时抛错 */
  register(path: string): Cleanup;
}

export const ContentRoutes = defineService<ContentRoutesService>("content.routes");

export const routeSlot = (path: string): Slot => defineSlot(`content.route.${path}`);

/** 博客文章（cf.bbki.ng/posts 的条目） */
export const PostSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  /** 远程 HTML：未经净化，渲染前须经使用方自己的 Html capability（html.trust）处理 */
  content: Schema.String,
  author: Schema.String,
  /** ISO 8601，可直接按字符串比较 */
  createdAt: Schema.String,
});

export type Post = Schema.Schema.Type<typeof PostSchema>;

/**
 * 文章读取服务：同一页面会话内共享一次请求结果（失败不缓存）。
 * signal 只取消调用方自己的等待，不中断其他调用方共享的请求。
 */
export interface PostsService {
  /** 全部文章，按 createdAt 降序 */
  list(signal?: AbortSignal): Promise<ReadonlyArray<Post>>;
  /** 最近 limit 篇 */
  recent(limit: number, signal?: AbortSignal): Promise<ReadonlyArray<Post>>;
  /** 标题完全相同的文章；不存在时为 undefined */
  byTitle(title: string, signal?: AbortSignal): Promise<Post | undefined>;
}

export const ContentPosts = defineService<PostsService>("content.posts");

/** 用户点击信件署名旁的方块；index 为方块序号（从 0 开始） */
export const SquareClickTopic = defineTopic(
  "content.square.click",
  Schema.Struct({ index: Schema.Number }),
);

export const ContentNoteChangeTopic = defineTopic(
  "content.notes.change",
  Schema.Array(ContentNodeSchema),
);
