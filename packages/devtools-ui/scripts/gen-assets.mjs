// 把 vendor/ 中的 chrome-devtools-frontend 资源生成为 TS 字符串模块（src/generated/assets.ts）。
// 更新 vendor/ 后执行：pnpm --filter @bbblank/devtools-ui gen-assets
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = join(root, "vendor");
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

const icons = readdirSync(join(vendor, "icons"))
  .filter((f) => f.endsWith(".svg"))
  .sort()
  .map((f) => [basename(f, ".svg"), readFileSync(join(vendor, "icons", f), "utf8").trim()]);

const out = [
  "// 由 scripts/gen-assets.mjs 从 vendor/ 生成，请勿手改。",
  "// 来源：chrome-devtools-frontend（BSD-3-Clause，见 vendor/LICENSE）。",
  "",
  `export const designTokens = ${JSON.stringify(readFileSync(join(vendor, "design_system_tokens.css"), "utf8"))};`,
  "",
  "export const iconSvgs = {",
  ...icons.map(([name, svg]) => `  ${JSON.stringify(name)}: ${JSON.stringify(svg)},`),
  "} as const;",
  "",
];

mkdirSync(join(root, "src", "generated"), { recursive: true });
writeFileSync(join(root, "src", "generated", "assets.ts"), out.join("\n"));
console.log(`assets.ts: tokens + ${icons.length} icons (${icons.map(([n]) => camel(n)).join(", ")})`);
