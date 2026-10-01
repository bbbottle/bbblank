/**
 * plugin-manager 对外契约：插件 id 与请求事件。
 */
import { defineTopic } from "@bbblank/sdk";
import type { PluginID } from "@bbblank/sdk";
import { Schema } from "effect";

export const PluginManagerPluginId = "plugin-manager" as PluginID;

/**
 * 请求打开 devtools：未安装时先安装 devtools 及其缺省面板插件，再打开面板。
 * 与 DevtoolsOpenTopic 的区别：后者只由已启用的 devtools 响应，不负责安装。
 */
export const DevtoolsRequestTopic = defineTopic("plugin-manager.devtools.request", Schema.Struct({}));
