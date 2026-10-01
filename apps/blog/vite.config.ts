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
    },
  },
  build: {
    rolldownOptions: {
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
          ],
        },
      },
    },
  },
});
