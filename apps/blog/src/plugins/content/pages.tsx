/** 页面组件（React 只出现在插件内部，内核与宿主对此无感知） */
import type { ReactElement } from "react";

export const Entry = () => {
  return (
    <article>
      <p>Hi.</p>
      <p>Welcome to my site.</p>
    </article>
  );
};

export const NotFound = ({ path }: { readonly path: string }) => (
  <article>
    <h1>404</h1>
    <a href="/" data-link>
      /
    </a>
  </article>
);

export const pageFor = (path: string): ReactElement =>
  path === "/" ? <Entry /> : <NotFound path={path} />;
