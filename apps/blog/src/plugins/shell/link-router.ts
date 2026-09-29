/** 站内链接（a[data-link]）交给路由，不整页刷新；返回取消拦截函数 */
export const interceptLinks = (host: HTMLElement, navigate: (path: string) => void) => {
  const doc = host.ownerDocument;
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.('a[data-link]');
    if (!(a instanceof HTMLAnchorElement) || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (a.origin !== doc.location.origin) return;
    e.preventDefault();
    navigate(a.pathname);
  };
  host.addEventListener('click', onClick);
  return () => host.removeEventListener('click', onClick);
};
