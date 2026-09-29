/**
 * 跟踪 host 内的选区：每次 selectionchange 立即回调 onLive，
 * 拖选过程中连续触发，等稳定 SETTLE_MS 后再回调 onSettled。返回停止跟踪函数。
 */
import type { SelectionSnapshot } from './api';

const SETTLE_MS = 200;

export const trackSelection = (
  host: HTMLElement,
  onLive: (s: SelectionSnapshot | undefined) => void,
  onSettled: (s: SelectionSnapshot | undefined) => void
) => {
  const doc = host.ownerDocument;
  const read = (): SelectionSnapshot | undefined => {
    const sel = doc.getSelection();
    const range = sel && !sel.isCollapsed && sel.rangeCount > 0 ? sel.getRangeAt(0) : undefined;
    const text = sel?.toString().trim();
    return range && text && host.contains(range.commonAncestorContainer)
      ? { text, range: range.cloneRange() }
      : undefined;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onSelectionChange = () => {
    onLive(read());
    clearTimeout(timer);
    timer = setTimeout(() => onSettled(read()), SETTLE_MS);
  };
  doc.addEventListener('selectionchange', onSelectionChange);
  return () => {
    doc.removeEventListener('selectionchange', onSelectionChange);
    clearTimeout(timer);
  };
};
