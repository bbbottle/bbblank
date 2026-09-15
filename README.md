# bbblank

极简插件内核实验：宿主无关的插件系统内核（Effect + TypeScript），
空白 HTML 只是其中一种宿主。设计方案见 [docs/plugin-system-design.md](docs/plugin-system-design.md)。

## 结构

```
apps/
  blog/            # @bbblank/blog —— 空白 HTML 宿主示例（vite + vanilla TS）
packages/
  sdk/             # @bbblank/sdk —— 插件作者契约类型（definePlugin / defineCapability / PluginAPI）
  kernel/          # @bbblank/kernel —— 插件内核（依赖拓扑 / Scope / 权限 / CapabilityBroker）
  host-dom/        # @bbblank/host-dom —— DOM 能力实现（DomCapability，附录 A 的宿主层）
```

依赖方向（禁止反向）：

```
插件 → @bbblank/sdk → effect
@bbblank/kernel → @bbblank/sdk + effect
@bbblank/host-dom、@bbblank/blog → kernel + sdk + 平台 API
```

内核不引用 `document`/`window`/React；DOM 只是宿主通过 Layer 注入的一种 Capability。

## 常用命令

```bash
pnpm install
pnpm dev         # 各包并行 dev（apps/blog 起 vite）
pnpm build       # tsc 构建所有包
pnpm typecheck
pnpm test        # vitest
```

## 实现路线（对应设计文档章节）

1. `packages/sdk`：先实现 §2–§3 的类型基石（`CapabilityDef`、`PluginAPI<Caps>`、`PluginManifest` Schema、`ServiceToken`、`Topic`）。
2. `packages/kernel`：按 §4 实现内核服务——`CapabilityBroker`、`EventHub`、`ServiceRegistry`、`PermissionPolicy`、`InstallStore`、`PluginLoader`、`PluginRegistry`（Kahn 拓扑 + 每插件 `Scope`）。
3. `packages/host-dom`：按附录 A 实现 `DomCapability` 的 browser Layer。
4. `apps/blog`：`createKernel` 组装 runtime，写 `shell` 根插件与一个示例插件。
