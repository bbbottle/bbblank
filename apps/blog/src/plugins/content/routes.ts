/** 外部插件登记的页面路由（content.routes 服务的实现） */
import type { RouterFacade } from "@bbblank/host-dom";
import type { ContentRoutesService } from "./api";

export const createRoutes = (router: RouterFacade, builtin: ReadonlySet<string>) => {
  const paths = new Set<string>();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const cb of listeners) cb();
  };

  const service: ContentRoutesService = {
    register: (path) => {
      if (builtin.has(path) || paths.has(path)) throw new Error(`route "${path}" is already registered`);
      paths.add(path);
      emit();
      return () => {
        paths.delete(path);
        // 先导航再通知：避免在已失效的路由上闪现 404
        if (router.current() === path) router.navigate("/");
        emit();
      };
    },
  };

  return {
    service,
    has: (path: string) => paths.has(path),
    onChange: (cb: () => void) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
};

export type Routes = ReturnType<typeof createRoutes>;
