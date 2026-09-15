/**
 * DomCapability —— 设计文档附录 A
 *
 * DOM 只是宿主注入的一种 Capability，不属于内核。
 *
 * TODO：
 * - `DomShape`：分区挂载（发放带 `data-plugin` 归属的挂载点）/ head 操作 / router / storage 子面
 * - `Dom = defineCapability<'dom', DomShape, DomFacade>('dom', facade)`
 * - `DomBrowser`：browser Layer 实现
 * - `DomLinkedom`：linkedom/happy-dom Layer 实现（预渲染/测试用，同内核零改动）
 */
export {};
