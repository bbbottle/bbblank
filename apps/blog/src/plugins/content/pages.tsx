/** content 的页面组件（React 只出现在插件内部，内核与宿主对此无感知） */
import type { ReactElement } from "react";

type routes = "/" | "/notes" | "/photos" | string;

const Square = ({
  size = 12,
  color = "#000",
}: {
  size?: number;
  color?: string;
}) => (
  <span
    style={{
      display: "inline-block",
      width: size,
      height: size,
      background: color,
    }}
  ></span>
);

export const Entry = () => {
  return (
    <article>
      <p>你好：</p>
      <p>
        十年前的我会想在这里实现宇宙中最绚丽的动画，现在？也许只想留下一点利用咖啡时间组装好的文字，和手机最近拍到的照片。现在，开始珍惜刷牙、剪指甲、擦眼镜、喝水、走路、发呆、洗碗的时间。
      </p>
      <div className="signature" style={{ textAlign: "right" }}>
        <p style={{ display: "inline-flex", flexDirection: "column" }}>
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            <span>周</span>
            <Square />
            <Square />
          </span>
          <span>二零二六 九月三十</span>
          <span>长沙</span>
        </p>
      </div>
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

const PAGES: Map<routes, ReactElement> = new Map([
  ["/", <Entry />],
  ["/notes", <div>Hi.</div>],
  ["/photos", <div>Hi.</div>],
]);

export const pageFor = (path: string): ReactElement => {
  const notFound = <NotFound path={path} />;

  return PAGES.get(path) ?? notFound;
};
