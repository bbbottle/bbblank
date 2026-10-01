import type { ContentNote, Letter } from "./api";

export type Segment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "ref"; readonly id: number; readonly label: number };

/** 参与标注的信件字段，按阅读顺序排列 */
export const letterFields = (l: Letter): ReadonlyArray<string> => [
  l.openlings,
  l.body,
  l.author,
  l.date,
  l.address,
];

/** contentStr 在 fields 中首次出现的位置：所在字段序号与标记插入点；未命中返回 undefined */
export const locate = (fields: ReadonlyArray<string>, contentStr: string) => {
  if (!contentStr) return undefined;
  for (const [field, text] of fields.entries()) {
    const at = text.indexOf(contentStr);
    if (at >= 0) return { field, end: at + contentStr.length };
  }
  return undefined;
};

/** 多个文本字段共用一组笔记：每条笔记只归入按顺序第一个包含其 contentStr 的字段 */
export const distribute = (
  fields: ReadonlyArray<string>,
  notes: ReadonlyArray<ContentNote>,
): ReadonlyArray<ReadonlyArray<ContentNote>> => {
  const buckets = fields.map((): Array<ContentNote> => []);
  for (const n of notes) {
    const at = locate(fields, n.contentStr);
    if (at) buckets[at.field]!.push(n);
  }
  return buckets;
};

/**
 * 按出现位置为笔记编连续序号（1 起）；未在信件中出现的笔记排在最后。
 * 返回 id → 序号。
 */
export const numberNotes = (
  fields: ReadonlyArray<string>,
  notes: Iterable<ContentNote>,
): ReadonlyMap<number, number> => {
  const keyed = [...notes].map((n) => {
    const at = locate(fields, n.contentStr);
    return { id: n.note.id, field: at?.field ?? Infinity, end: at?.end ?? 0 };
  });
  keyed.sort((a, b) => a.field - b.field || a.end - b.end || a.id - b.id);
  return new Map(keyed.map((k, i) => [k.id, i + 1]));
};

/** 在每条笔记 contentStr 首次出现的位置之后插入引用标记（label 取 note.order，缺省为 id）；未命中的笔记忽略 */
export const annotate = (
  text: string,
  notes: ReadonlyArray<ContentNote>,
): ReadonlyArray<Segment> => {
  const marks = notes
    .flatMap(({ contentStr, note }) => {
      const at = contentStr ? text.indexOf(contentStr) : -1;
      return at < 0
        ? []
        : [{ end: at + contentStr.length, id: note.id, label: note.order ?? note.id }];
    })
    .sort((a, b) => a.end - b.end || a.label - b.label);

  const segments: Array<Segment> = [];
  let cursor = 0;
  for (const { end, id, label } of marks) {
    if (end > cursor) segments.push({ kind: "text", text: text.slice(cursor, end) });
    segments.push({ kind: "ref", id, label });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) });
  return segments;
};
