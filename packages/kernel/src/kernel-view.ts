/**
 * KernelView —— 设计文档 §5，内核对宿主暴露的最小门面
 *
 * 不含 Effect 类型：React/Lit/Svelte/纯 DOM 宿主都能直接订阅。
 *
 * TODO：`snapshot / subscribe / enable / disable / install / uninstall`，
 * 内部用 `ManagedRuntime` 的 runSync/runPromise/runFork 转接
 * （subscribe 内部是 `SubscriptionRef.changes |> Stream.runForEach`，
 *   取消时 `Fiber.interrupt`）。
 */
export {};
