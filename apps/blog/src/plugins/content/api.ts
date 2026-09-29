/**
 * content 对外契约：插件 id 与 `content.selection` 服务（只有类型与 Token，不含实现）。
 * 其他插件只 import 本文件，不依赖 content 的实现代码。
 */
import { defineService } from '@bbblank/sdk';
import type { PluginID } from '@bbblank/sdk';

/** 供依赖声明、`[data-plugin]` 选择器使用 */
export const ContentPluginId = 'content' as PluginID;

export interface SelectionSnapshot {
  /** 选中的文本（已 trim） */
  readonly text: string;
  /** 选区的副本；仅在当前页面内容未重新渲染前有效 */
  readonly range: Range;
}

export interface ContentSelectionService {
  /** 当前正文中的选区；没有选中或选区不在正文内时为 undefined */
  current(): SelectionSnapshot | undefined;
  /**
   * 选区变化回调；选区清空或不在正文内时回调 undefined。返回取消订阅函数。
   * 缺省在选区稳定后（拖选结束）才回调；`live: true` 时每次 selectionchange 都回调（用于绘制选区）。
   */
  onChange(
    cb: (selection: SelectionSnapshot | undefined) => void,
    opts?: { readonly live?: boolean }
  ): () => void;
}

export const ContentSelection = defineService<ContentSelectionService>('content.selection');
