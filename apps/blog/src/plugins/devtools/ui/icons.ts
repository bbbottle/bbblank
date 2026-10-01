/** Chrome DevTools 图标（vendor/icons，BSD-3-Clause），fill 已替换为 currentColor 以便着色 */
import clear from "../vendor/icons/clear.svg?raw";
import cross from "../vendor/icons/cross.svg?raw";
import crossCircle from "../vendor/icons/cross-circle-filled.svg?raw";
import extension from "../vendor/icons/extension.svg?raw";
import gear from "../vendor/icons/gear.svg?raw";
import filter from "../vendor/icons/filter.svg?raw";
import info from "../vendor/icons/info.svg?raw";
import refresh from "../vendor/icons/refresh.svg?raw";
import triangleDown from "../vendor/icons/triangle-down.svg?raw";
import triangleRight from "../vendor/icons/triangle-right.svg?raw";
import warning from "../vendor/icons/warning-filled.svg?raw";

const svgs = {
  clear,
  cross,
  "cross-circle": crossCircle,
  extension,
  filter,
  gear,
  info,
  refresh,
  "triangle-down": triangleDown,
  "triangle-right": triangleRight,
  warning,
} as const;

export type IconName = keyof typeof svgs;

/** 图标内容为随源码分发的静态 SVG，不含外部输入，可直接作为 innerHTML */
export const icon = (name: IconName, cls = "") => {
  const el = document.createElement("span");
  el.className = `icon ${cls}`.trim();
  el.innerHTML = svgs[name];
  return el;
};
