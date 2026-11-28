/**
 * 路由切换时的滚动位置：经站内链接进入新页面时回到顶部；前进 / 后退时恢复该路径上次离开时的位置。
 * 页面内容可能异步渲染，恢复时观察 shell 根元素尺寸变化并重试，最长 RESTORE_TIMEOUT 毫秒，用户滚动后立即停止。
 */
const RESTORE_TIMEOUT = 1500;
const USER_SCROLL = ["wheel", "touchstart", "keydown"] as const;

export const createScrollKeeper = (host: HTMLElement) => {
  const doc = host.ownerDocument;
  const win = doc.defaultView!;
  const saved = new Map<string, number>();
  let current = doc.location.pathname;
  let pushed = false;
  let stopRestore: (() => void) | undefined;

  win.history.scrollRestoration = "manual";

  const restore = (y: number) => {
    stopRestore?.();
    win.scrollTo(0, y);
    if (win.scrollY >= y - 1) return;
    const stop = () => {
      ro.disconnect();
      win.clearTimeout(timer);
      for (const t of USER_SCROLL) win.removeEventListener(t, stop);
      stopRestore = undefined;
    };
    const ro = new ResizeObserver(() => {
      win.scrollTo(0, y);
      if (win.scrollY >= y - 1) stop();
    });
    const timer = win.setTimeout(stop, RESTORE_TIMEOUT);
    ro.observe(host);
    for (const t of USER_SCROLL) win.addEventListener(t, stop, { passive: true });
    stopRestore = stop;
  };

  return {
    /** 站内链接导航之前调用：记录当前位置，并标记下一次路由变化来自链接 */
    beforeNavigate: (path: string) => {
      if (path === current) return;
      saved.set(current, win.scrollY);
      pushed = true;
    },
    /** Router.onChange 回调：路径不变（如页内锚点）时不处理 */
    onRoute: (path: string) => {
      if (path === current) return;
      if (!pushed) saved.set(current, win.scrollY);
      current = path;
      restore(pushed ? 0 : (saved.get(path) ?? 0));
      pushed = false;
    },
    dispose: () => {
      stopRestore?.();
      win.history.scrollRestoration = "auto";
    },
  };
};
