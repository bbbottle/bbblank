/**
 * shell 对外契约：提供的挂载点。其他插件只 import 本文件，不依赖 shell 的实现。
 */
import { defineSlot } from "@bbblank/host-dom";

export const ShellSlots = {
  headerRight: defineSlot("header.right"),
  main: defineSlot("main"),
  footer: defineSlot("footer"),
} as const;
