import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
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
