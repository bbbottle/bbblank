/** 极简 DOM 构造：devtools 不引入 UI 框架，组件直接操作 Shadow DOM */

export type Child = Node | string | number | null | undefined | false;

type Props = {
  readonly class?: string;
  readonly style?: string;
  readonly title?: string;
  readonly [attr: `data-${string}`]: string | undefined;
  readonly [event: `on${string}`]: ((e: any) => void) | undefined;
} & Readonly<Record<string, unknown>>;

export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: ReadonlyArray<Child | ReadonlyArray<Child>>
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === false || v === null) continue;
    if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === "class") el.className = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  append(el, children);
  return el;
};

export const append = (
  el: Node,
  children: ReadonlyArray<Child | ReadonlyArray<Child>>,
) => {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(
      typeof c === "object" ? c : document.createTextNode(String(c)),
    );
  }
};

/** 用新内容替换元素的全部子节点 */
export const replace = (
  el: Element,
  ...children: ReadonlyArray<Child | ReadonlyArray<Child>>
) => {
  el.replaceChildren();
  append(el, children);
};

/** 重复渲染时合并到同一帧 */
export const frameScheduler = (render: () => void) => {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      render();
    });
  };
};

/** 注册自定义元素；插件停用后重新启用时定义已存在，跳过 */
export const define = (name: string, ctor: CustomElementConstructor) => {
  if (!customElements.get(name)) customElements.define(name, ctor);
};
