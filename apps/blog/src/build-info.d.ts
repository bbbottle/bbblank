/// <reference types="vite/client" />

/** 由 vite.config.ts 的 define 在构建时写入 */
/** 构建所对应的提交 SHA；无法获取时为空字符串 */
declare const __BUILD_COMMIT__: string;
/** 本地构建时工作区是否有未提交改动（此时 GitHub 上的源码与运行的代码可能不一致） */
declare const __BUILD_DIRTY__: boolean;

/** Playground 用户代码使用的 effect（独立打包的静态资源 URL，见 vite.config.ts） */
declare module "virtual:playground-effect-url" {
  const url: string;
  export default url;
}

/** Playground 语言服务的类型文件包（JSON 静态资源 URL，见 build/playground-types.ts） */
declare module "virtual:playground-types-url" {
  const url: string;
  export default url;
}
