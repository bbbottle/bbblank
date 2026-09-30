/** 页面骨架：只负责建 DOM，返回各挂载点对应的元素 */
export const buildLayout = (host: HTMLElement) => {
  const doc = host.ownerDocument;

  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    parent: HTMLElement,
  ) => parent.appendChild(doc.createElement(tag));

  host.className = "shell heti heti--ancient";

  const header = el("header", host);

  return {
    headerRight: el("div", header),
    main: el("main", host),
    footer: el("footer", host),
  };
};
