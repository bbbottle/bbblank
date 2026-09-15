/**
 * 依赖拓扑 —— 设计文档 §4.5
 *
 * TODO：Kahn 拓扑排序
 * - 输入：installed/enabled 插件的 dependencies 图
 * - 输出：拓扑层数组（同层可并行初始化）或 `DependencyCycle`（附环上节点）
 * - 禁用时需做反向校验：`DependentsActive`
 */
export {};
