/**
 * content —— 按当前路由把页面渲染进 `main` slot。React 只在这个插件内部使用。
 */
import { createRoot } from 'react-dom/client';
import { definePlugin } from '@bbblank/sdk';
import type { PluginID, SemVer } from '@bbblank/sdk';
import { Dom, Router } from '@bbblank/host-dom';
import { pageFor } from '../entry';

export const content = definePlugin({
  manifest: { id: 'content' as PluginID, name: 'Content', version: '1.0.0' as SemVer },
  capabilities: [Dom, Router],
  setup: api => {
    const { dom, router } = api.caps;
    dom.mount('main', host => {
      const root = createRoot(host);
      const off = router.onChange(path => {
        root.render(pageFor(path));
        host.ownerDocument.title = path === '/' ? 'bbblank' : `${path.slice(1)} · bbblank`;
      });
      return async () => {
        await off();
        root.unmount();
      };
    });
  },
});
