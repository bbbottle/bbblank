/**
 * 零依赖 semver 子集 —— 设计文档 §10.3
 * range：`*`、`1.2.3`、`^1.2.3`、`~1.2.3`、`>=`/`>`/`<=`/`<`/`=`；空格 = 且，`||` = 或。
 */

export interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly pre: ReadonlyArray<string>;
}

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export const parseVersion = (s: string): Version | undefined => {
  const m = VERSION_RE.exec(s.trim());
  return m
    ? { major: +m[1]!, minor: +m[2]!, patch: +m[3]!, pre: m[4] ? m[4].split('.') : [] }
    : undefined;
};

const comparePre = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): number => {
  if (a.length === 0 || b.length === 0) return b.length - a.length; // 无预发布 > 有预发布
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) return +x - +y;
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
};

export const compareVersions = (a: Version, b: Version): number =>
  a.major - b.major || a.minor - b.minor || a.patch - b.patch || comparePre(a.pre, b.pre);

type Op = '>' | '>=' | '<' | '<=' | '=';
interface Comparator {
  readonly op: Op;
  readonly v: Version;
}

const v = (major: number, minor: number, patch: number): Version => ({
  major,
  minor,
  patch,
  pre: [],
});

/** 一个 token → 一组"且"比较器；非法返回 undefined */
const parseToken = (tok: string): ReadonlyArray<Comparator> | undefined => {
  if (tok === '*' || tok === 'x') return [];
  const m = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(tok);
  if (!m) return undefined;
  const ver = parseVersion(m[2]!);
  if (!ver) return undefined;
  switch (m[1]) {
    case '^': {
      const upper =
        ver.major > 0
          ? v(ver.major + 1, 0, 0)
          : ver.minor > 0
            ? v(0, ver.minor + 1, 0)
            : v(0, 0, ver.patch + 1);
      return [
        { op: '>=', v: ver },
        { op: '<', v: { ...upper, pre: ['0'] } },
      ];
    }
    case '~':
      return [
        { op: '>=', v: ver },
        { op: '<', v: { ...v(ver.major, ver.minor + 1, 0), pre: ['0'] } },
      ];
    case undefined:
      return [{ op: '=', v: ver }];
    default:
      return [{ op: m[1] as Op, v: ver }];
  }
};

/** range → 析取范式：外层"或"，内层"且" */
const parseRange = (range: string): ReadonlyArray<ReadonlyArray<Comparator>> | undefined => {
  const alts: Array<ReadonlyArray<Comparator>> = [];
  for (const alt of range.split('||')) {
    const toks = alt
      .trim()
      .replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1')
      .split(/\s+/)
      .filter(Boolean);
    const cs: Array<Comparator> = [];
    for (const t of toks.length ? toks : ['*']) {
      const parsed = parseToken(t);
      if (!parsed) return undefined;
      cs.push(...parsed);
    }
    alts.push(cs);
  }
  return alts;
};

export const isValidRange = (range: string): boolean => parseRange(range) !== undefined;

const test = (c: Comparator, ver: Version): boolean => {
  const d = compareVersions(ver, c.v);
  switch (c.op) {
    case '>':
      return d > 0;
    case '>=':
      return d >= 0;
    case '<':
      return d < 0;
    case '<=':
      return d <= 0;
    case '=':
      return d === 0;
  }
};

export const satisfies = (version: string, range: string): boolean => {
  const ver = parseVersion(version);
  const alts = parseRange(range);
  return !!ver && !!alts && alts.some(cs => cs.every(c => test(c, ver)));
};

/**
 * sdk 兼容窗口（§10.3）：插件按 sdk `built` 编译，内核链接 sdk `runtime`。
 * ≥1.x：主版本相同且 built.minor ≤ runtime.minor；0.x：主、次版本都相同。
 */
export const isSdkCompatible = (built: string, runtime: string): boolean => {
  const b = parseVersion(built);
  const r = parseVersion(runtime);
  if (!b || !r || b.major !== r.major) return false;
  return r.major === 0 ? b.minor === r.minor : b.minor <= r.minor;
};
