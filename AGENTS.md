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

## 验证

- `pnpm -r typecheck && pnpm -r --if-present test && pnpm -r build`
- kernel 测试共用工具在 `packages/kernel/src/test-kit.ts`（已从 `tsconfig.build.json` 排除）；`makeKernel` 缺省把监管退避设为 1–5ms。
- 涉及监管器/重启的测试不要轮询中间态（重启可能快于轮询），用 setup 次数等单调量推进。
- v4 陷阱：`Effect.runSync*` 使用独立的 "sync" 调度器；可能挂起的关闭/中断不要放进 `runSync`（参考 `plugin-api.ts` 的 `closer`）。

## apps/blog 插件目录约定

- 每个插件一个目录 `apps/blog/src/plugins/<name>/`：`index.ts` 只放插件定义与 setup 编排；`api.ts` 是对外契约（服务 Token、Slot、插件 id，只有类型与常量）；其余文件是内部实现。
- 跨插件只能 import 对方的 `api.ts`，不得 import 其内部文件；新插件在 `plugins/index.ts` 的 `plugins` 目录中登记（`id` 取自其 `api.ts`，`load: () => import("./<name>")`，`builtin` 表示首次访问自动安装）。
- 代码分割：`plugins/index.ts` 只能静态 import 各插件的 `api.ts`，插件实现一律经 `import()` 由 `LazyPluginLoader` 按需加载；`api.ts` 须保持轻量（不得引入 React 等重依赖），因其进入启动 chunk。chunk 分组见 `apps/blog/vite.config.ts`（`runtime` / `react`）。
