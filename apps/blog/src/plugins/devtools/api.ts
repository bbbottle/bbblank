/**
 * devtools 对外契约：插件 id 与打开面板的事件。
 */
import { defineTopic } from "@bbblank/sdk";
import type { PluginID } from "@bbblank/sdk";
import { Schema } from "effect";

export const DevtoolsPluginId = "devtools" as PluginID;

/** 请求打开 devtools 面板；devtools 未启用时无人订阅，事件被忽略 */
export const DevtoolsOpenTopic = defineTopic(
  "devtools.open",
  Schema.Struct({}),
);
