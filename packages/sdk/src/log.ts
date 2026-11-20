/**
 * 平台级日志 Topic —— 插件经 `api.events.emit(LogTopic, { level, message })` 往活动流写日志。
 * 归属在 sdk 而非某个插件：日志是通用设施，发布方只依赖 sdk，不依赖 devtools。
 * `devtools-console` 只是活动流的查看器（对 `bbblank.log` 特判渲染）；无人订阅时事件照常进入活动流环形缓冲。
 */
import { Schema } from "effect";
import { defineTopic } from "./topic.js";

export const LogEntrySchema = Schema.Struct({
  level: Schema.Literals(["info", "warn", "error"]),
  message: Schema.String,
});

export type LogEntry = Schema.Schema.Type<typeof LogEntrySchema>;

export const LogTopic = defineTopic("bbblank.log", LogEntrySchema);
