# bbblank — Agent Guidelines

宿主无关插件内核实验仓库。设计方案：`docs/plugin-system-design.md`（唯一权威，改动以文档为准）。

## 硬性约束

- `@bbblank/kernel` 与 `@bbblank/sdk` **不得 import** `document`、`window`、React、Node 内建模块或任何平台 API；它们只依赖 `effect`（sdk 仅用 effect 的类型与 Schema）。
- 平台能力一律做成 Capability（`defineCapability` + `Layer`），由宿主在 `createKernel` 时注入；参考 `packages/host-dom`。
- 包间依赖方向：`sdk` ← `kernel` ← `host-dom`/`apps/*`，禁止反向。
- TypeScript `strict`，ESM（`"type": "module"`），NodeNext 解析；包内引用必须带 `.js` 后缀。

## 工具链

pnpm@11 workspace；TypeScript 7；vitest 5；effect `4.0.0-rc.112`（v4 API，不要混用 v3 写法）。
测试放在 `src/**/*.test.ts`，Effect 测试优先用 `@effect/vitest`。
