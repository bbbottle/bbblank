/** 在 host 中创建 React root，按路由渲染页面；返回卸载函数 */
import { createRoot } from "react-dom/client";
import type { RouterFacade } from "@bbblank/host-dom";
import { pageFor } from "./pages";

export const renderPages = (
  host: HTMLElement,
  router: RouterFacade,
  /** 每次重新渲染前回调（旧 DOM 即将被替换） */
  beforeRender: () => void,
) => {
  const root = createRoot(host);
  const off = router.onChange((path) => {
    beforeRender();
    root.render(pageFor(path));
  });
  return async () => {
    await off();
    root.unmount();
  };
};
