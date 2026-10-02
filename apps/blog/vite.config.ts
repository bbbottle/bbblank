import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * 构建所对应的提交（devtools-sources 据此读取 GitHub 上同一版本的源码）。
 * GitHub Actions 中取 GITHUB_SHA；本地取 HEAD，并标记工作区是否有未提交改动。
 */
const git = (...args: Array<string>) => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
const commit = process.env.GITHUB_SHA ?? git("rev-parse", "HEAD");
const dirty = !process.env.GITHUB_SHA && git("status", "--porcelain") !== "";

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(commit),
    __BUILD_DIRTY__: JSON.stringify(dirty),
  },
  resolve: {
    alias: {
      "@bbblank/sdk": fileURLToPath(
        new URL("../../packages/sdk/src/index.ts", import.meta.url),
      ),
      "@bbblank/kernel": fileURLToPath(
        new URL("../../packages/kernel/src/index.ts", import.meta.url),
      ),
      "@bbblank/host-dom": fileURLToPath(
        new URL("../../packages/host/src/index.ts", import.meta.url),
      ),
      "@bbblank/devtools-ui": fileURLToPath(
        new URL("../../packages/devtools-ui/src/index.ts", import.meta.url),
      ),
    },
  },
  build: {
    rolldownOptions: {
      treeshake: {
        // @material/material-color-utilities 未声明 sideEffects，缺省会整包打入（devtools 只用到调色板生成）
        moduleSideEffects: (id) => (/[\\/]@material[\\/]material-color-utilities[\\/]/.test(id) ? false : undefined),
      },
      output: {
        codeSplitting: {
          groups: [
            // 只被 React 插件（shell/content）用到：随这些插件按需加载，不进入启动路径
            {
              name: "react",
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
            // 启动路径必需：内核、宿主 capability 与各插件的 api.ts 契约（插件目录静态引用），合并为一个 chunk
            {
              name: "runtime",
              test: /[\\/]node_modules[\\/](effect|dompurify)[\\/]|[\\/]packages[\\/](sdk|kernel|host)[\\/]src[\\/]|[\\/]src[\\/]plugins[\\/][^\\/]+[\\/]api\.ts$/,
            },
            // devtools-sources 的编辑器内核（CodeMirror 6 视图 / 状态 / 语言框架 / lezer 运行时）
            {
              name: "codemirror",
              test: /[\\/]node_modules[\\/](@codemirror[\\/](view|state|language|search)|@lezer[\\/](common|highlight|lr)|style-mod|crelt|w3c-keyname|@marijn[\\/]find-cluster-break)[\\/]/,
            },
            // 各语言解析器：打开对应类型的文件时才加载（html 依赖 javascript 与 css，各自独立成 chunk 以免 .ts 文件连带加载 html）
            {
              name: "codemirror-lang-shared",
              test: /[\\/]node_modules[\\/]@codemirror[\\/](autocomplete|lint)[\\/]/,
            },
            ...["javascript", "css", "html", "json", "markdown"].map((lang) => ({
              name: `codemirror-lang-${lang}`,
              test: new RegExp(`[\\\\/]node_modules[\\\\/](@codemirror[\\\\/]lang-${lang}|@lezer[\\\\/]${lang})[\\\\/]`),
            })),
            // devtools 与各面板插件共用的 UI 套件（含调色板生成）：随 devtools 按需加载
            {
              name: "devtools-ui",
              test: /[\\/]packages[\\/]devtools-ui[\\/]src[\\/]|[\\/]node_modules[\\/]@material[\\/]material-color-utilities[\\/]/,
            },
          ],
        },
      },
    },
  },
});
