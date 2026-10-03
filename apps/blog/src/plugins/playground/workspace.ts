/**
 * 草稿工作区：仓库路径 → 文件内容，保存在 Playground 的私有 Storage（只存不执行）。
 * 草稿目录与仓库一致：apps/blog/src/plugins/<name>/，相对路径（如 ../content/api）与仓库中相同。
 */
import { Schema } from "effect";
import type { StorageFacade } from "@bbblank/sdk";
import { PLUGINS_DIR } from "./modules";

const STORAGE_KEY = "workspace";

const WorkspaceSchema = Schema.Struct({ files: Schema.Record(Schema.String, Schema.String) });

export type Files = Record<string, string>;

export const NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

export const pluginDir = (name: string) => `${PLUGINS_DIR}${name}/`;

/** 文件所属的草稿插件名 */
export const pluginOf = (path: string) => path.slice(PLUGINS_DIR.length).split("/")[0]!;

export const pluginNames = (files: Files) => [...new Set(Object.keys(files).map(pluginOf))].sort();

export const loadWorkspace = async (storage: StorageFacade): Promise<Files> => {
  const raw = await storage.get(STORAGE_KEY);
  if (!raw) return {};
  try {
    return { ...Schema.decodeUnknownSync(WorkspaceSchema)(JSON.parse(raw)).files };
  } catch {
    return {};
  }
};

export const saveWorkspace = (storage: StorageFacade, files: Files) =>
  storage.set(STORAGE_KEY, JSON.stringify({ files }));

const camel = (name: string) => name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const pascal = (name: string) => camel(name).replace(/^[a-z]/, (c) => c.toUpperCase());

/** 新插件模板：按仓库约定生成 api.ts（对外契约）与 index.ts（插件定义） */
export const template = (name: string): Files => {
  const dir = pluginDir(name);
  const idConst = `${pascal(name)}PluginId`;
  return {
    [`${dir}api.ts`]: `/**
 * ${name} 对外契约：插件 id。
 */
import type { PluginID } from "@bbblank/sdk";

export const ${idConst} = "${name}" as PluginID;
`,
    [`${dir}index.ts`]: `/**
 * ${name} —— 启用时为正文「留下一点」添加笔记，停用时移除。
 * 在 Playground 中运行时，插件 id 加上 dev- 前缀（dev-${name}），以区别于插件目录中的插件。
 */
import { definePlugin } from "@bbblank/sdk";
import type { SemVer } from "@bbblank/sdk";
import { ContentNoteService, ContentPluginId } from "../content/api";
import { ${idConst} } from "./api";

const NOTE_ID = 100;

export const ${camel(name)} = definePlugin({
  manifest: {
    id: ${idConst},
    name: "${pascal(name)}",
    version: "0.1.0" as SemVer,
    dependencies: [{ id: ContentPluginId, range: "^1.0.0" }],
  },
  capabilities: [],
  setup: async (api) => {
    const notes = await api.services.get(ContentNoteService);
    notes.upsertNote({
      contentStr: "留下一点",
      note: { id: NOTE_ID, content: "来自 Playground 的笔记。" },
    });
    return () => notes.delNote(NOTE_ID);
  },
});
`,
  };
};
