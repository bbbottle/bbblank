import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build as viteBuild, defineConfig } from "vite";
import type { Plugin, Rollup } from "vite";
import { collectPlaygroundTypes } from "./build/playground-types.ts";

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

/**
 * Playground 用户代码使用的 effect：单独打包为一个静态资源，按需加载。
 * 不复用页面中的 effect 实例：页面实例被完整保留会使启动 chunk 的 gzip 体积从约 60 kB 增至约 230 kB（每个模块只能位于一个 chunk）。
 * effect v4 的类型标识为字符串（如 "~effect/Schema"），不同副本之间按结构互通。
 * 开发模式下直接返回 effect 入口文件的 /@fs 路径（与预构建依赖互为独立实例，语义与生产一致）。
 */
const PLAYGROUND_EFFECT = "virtual:playground-effect-url";
const playgroundEffect = (): Plugin => {
  let command: "serve" | "build" = "build";
  return {
    name: "bbblank:playground-effect",
    configResolved: (c) => void (command = c.command),
    resolveId: (id) => (id === PLAYGROUND_EFFECT ? `\0${PLAYGROUND_EFFECT}` : undefined),
    async load(id) {
      if (id !== `\0${PLAYGROUND_EFFECT}`) return;
      const entry = createRequire(import.meta.url).resolve("effect");
      if (command === "serve") return `export default ${JSON.stringify(`/@fs${entry}`)};`;
      const out = (await viteBuild({
        configFile: false,
        logLevel: "silent",
        build: {
          write: false,
          minify: true,
          lib: { entry, formats: ["es"], fileName: "effect" },
          rolldownOptions: { output: { codeSplitting: false } },
        },
      })) as Rollup.RollupOutput | Array<Rollup.RollupOutput>;
      const chunk = (Array.isArray(out) ? out[0]! : out).output[0];
      const ref = this.emitFile({ type: "asset", name: "playground-effect.js", source: chunk.code });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
  };
};

/**
 * Playground 语言服务的类型文件包（见 build/playground-types.ts）：构建时生成为 JSON 静态资源，开发时由中间件按请求生成。
 */
const PLAYGROUND_TYPES = "virtual:playground-types-url";
const PLAYGROUND_TYPES_DEV_PATH = "/@bbblank/playground-types.json";
const playgroundTypes = (): Plugin => {
  let command: "serve" | "build" = "build";
  return {
    name: "bbblank:playground-types",
    configResolved: (c) => void (command = c.command),
    configureServer: (server) =>
      void server.middlewares.use(PLAYGROUND_TYPES_DEV_PATH, (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(collectPlaygroundTypes()));
      }),
    resolveId: (id) => (id === PLAYGROUND_TYPES ? `\0${PLAYGROUND_TYPES}` : undefined),
    load(id) {
      if (id !== `\0${PLAYGROUND_TYPES}`) return;
      if (command === "serve") return `export default ${JSON.stringify(PLAYGROUND_TYPES_DEV_PATH)};`;
      const ref = this.emitFile({
        type: "asset",
        name: "playground-types.json",
        source: JSON.stringify(collectPlaygroundTypes()),
      });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
  };
};

export default defineConfig({
  plugins: [playgroundEffect(), playgroundTypes()],
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
      // 子路径须排在包名之前：别名按前缀匹配，先匹配者生效
      "@bbblank/devtools-ui/editor": fileURLToPath(
        new URL("../../packages/devtools-ui/src/editor.ts", import.meta.url),
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
              test: /[\\/]node_modules[\\/](@codemirror[\\/](view|state|language|search|commands|autocomplete|lint)|@lezer[\\/](common|highlight|lr)|style-mod|crelt|w3c-keyname|@marijn[\\/]find-cluster-break)[\\/]/,
            },
            // 各语言解析器：打开对应类型的文件时才加载（html 依赖 javascript 与 css，各自独立成 chunk 以免 .ts 文件连带加载 html）
            ...["javascript", "css", "html", "json", "markdown"].map((lang) => ({
              name: `codemirror-lang-${lang}`,
              test: new RegExp(`[\\\\/]node_modules[\\\\/](@codemirror[\\\\/]lang-${lang}|@lezer[\\\\/]${lang})[\\\\/]`),
            })),
            // devtools 与各面板插件共用的 UI 套件（含调色板生成）：随 devtools 按需加载
            {
              name: "devtools-ui",
              // editor.ts 由使用方按需 import()，不并入本组，否则打开 devtools 即会连带加载 CodeMirror
              test: /[\\/]packages[\\/]devtools-ui[\\/]src[\\/](?!editor\.ts$)|[\\/]node_modules[\\/]@material[\\/]material-color-utilities[\\/]/,
            },
          ],
        },
      },
    },
  },
});
