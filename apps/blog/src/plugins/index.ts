import type { AnyPluginModule } from "@bbblank/sdk";
import { content } from "./content";
import { shell } from "./shell";

/** 内置插件：随应用打包；远程插件改用 EsmPluginLoader（白名单 + SRI） */
export const builtins: ReadonlyArray<AnyPluginModule> = [shell, content];
