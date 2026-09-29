/**
 * `content.selection` 服务实现：两路通知
 * - live：跟随每次 selectionchange（绘制选区用）
 * - settled：选区稳定后才发（消费"选中结果"用）
 */
import type { ContentSelectionService, SelectionSnapshot } from './api';

type Listener = (s: SelectionSnapshot | undefined) => void;

const channel = () => {
  const listeners = new Set<Listener>();
  let current: SelectionSnapshot | undefined;
  return {
    listeners,
    current: () => current,
    publish: (next: SelectionSnapshot | undefined) => {
      if (!next && !current) return;
      current = next;
      for (const cb of listeners) {
        try {
          cb(next);
        } catch (e) {
          console.error('[content] selection listener failed', e);
        }
      }
    },
  };
};

export const createSelectionService = () => {
  const live = channel();
  const settled = channel();
  const service: ContentSelectionService = {
    current: settled.current,
    onChange: (cb, opts) => {
      const { listeners } = opts?.live ? live : settled;
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
  return {
    service,
    publishLive: live.publish,
    publishSettled: settled.publish,
    /** 两路同时清空（页面重新渲染、卸载时旧 Range 失效） */
    reset: () => {
      live.publish(undefined);
      settled.publish(undefined);
    },
  };
};
