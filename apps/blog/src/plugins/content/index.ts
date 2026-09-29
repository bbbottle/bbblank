/**
 * content —— 按当前路由把页面渲染进 `main` slot（React 只在本插件内部使用），
 * 并注册 `content.selection` 服务（契约见 ./api）：外部插件可读取/订阅正文中的选中文本。
 */
import { definePlugin } from '@bbblank/sdk';
import type { SemVer } from '@bbblank/sdk';
import { Dom, Router } from '@bbblank/host-dom';
import { ShellSlots } from '../shell/api';
import { ContentPluginId, ContentSelection } from './api';
import { renderPages } from './renderer';
import { createSelectionService } from './selection-service';
import { trackSelection } from './selection-tracker';

export const content = definePlugin({
  manifest: {
    id: ContentPluginId,
    name: 'Content',
    version: '1.0.0' as SemVer,
    // 提供服务需要在 manifest 中声明（§10.5），否则 register 会抛 PermissionDenied
    services: { provide: [ContentSelection.key] },
  },
  capabilities: [Dom, Router],
  setup: api => {
    const { dom, router } = api.caps;
    const selection = createSelectionService();
    // register 返回的 Cleanup 已被内核纳入插件 Scope：插件停用时服务自动注销
    api.services.register(ContentSelection, selection.service);

    dom.mount(ShellSlots.main, host => {
      const stopRender = renderPages(host, router, selection.reset);
      const stopTracking = trackSelection(host, selection.publishLive, selection.publishSettled);
      return async () => {
        stopTracking();
        selection.reset();
        await stopRender();
      };
    });
  },
});
