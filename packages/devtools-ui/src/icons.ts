/** Chrome DevTools 图标（vendor/icons，BSD-3-Clause），fill 已替换为 currentColor 以便着色 */
import { iconSvgs } from "./generated/assets.js";

const svgs = {
  clear: iconSvgs.clear,
  cross: iconSvgs.cross,
  "cross-circle": iconSvgs["cross-circle-filled"],
  extension: iconSvgs.extension,
  filter: iconSvgs.filter,
  gear: iconSvgs.gear,
  info: iconSvgs.info,
  refresh: iconSvgs.refresh,
  "triangle-down": iconSvgs["triangle-down"],
  "triangle-right": iconSvgs["triangle-right"],
  warning: iconSvgs["warning-filled"],
} as const;

export type IconName = keyof typeof svgs;

/** 图标内容为随源码分发的静态 SVG，不含外部输入，可直接作为 innerHTML */
export const icon = (name: IconName, cls = "") => {
  const el = document.createElement("span");
  el.className = `icon ${cls}`.trim();
  el.innerHTML = svgs[name];
  return el;
};
