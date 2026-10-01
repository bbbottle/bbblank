/** 在 host 中创建 React root，按路由渲染页面；登记路由增删时重绘当前页面；返回卸载函数 */
import { createRoot } from "react-dom/client";
import type { RouterFacade } from "@bbblank/host-dom";
import { pageFor } from "./pages";
import type { PageDeps } from "./pages";

export const renderPages = (host: HTMLElement, router: RouterFacade, deps: PageDeps) => {
  const root = createRoot(host);
  let path = router.current();
  const render = () => root.render(pageFor(path, deps));
  const offRoutes = deps.routes.onChange(render);
  const off = router.onChange((p) => {
    path = p;
    render();
  });
  return async () => {
    offRoutes();
    await off();
    root.unmount();
  };
};
