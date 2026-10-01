import type { ContentNote } from "./api";

export type Segment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "ref"; readonly id: number };

/** 在每条笔记 contentStr 首次出现的位置之后插入引用标记；未命中的笔记忽略 */
export const annotate = (
  text: string,
  notes: ReadonlyArray<ContentNote>,
): ReadonlyArray<Segment> => {
  const marks = notes
    .flatMap(({ contentStr, note }) => {
      const at = contentStr ? text.indexOf(contentStr) : -1;
      return at < 0 ? [] : [{ end: at + contentStr.length, id: note.id }];
    })
    .sort((a, b) => a.end - b.end || a.id - b.id);

  const segments: Array<Segment> = [];
  let cursor = 0;
  for (const { end, id } of marks) {
    if (end > cursor) segments.push({ kind: "text", text: text.slice(cursor, end) });
    segments.push({ kind: "ref", id });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) });
  return segments;
};
