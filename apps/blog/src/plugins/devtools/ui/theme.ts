/**
 * 动态配色：Chrome 开启「Match Chrome color theme」时，用浏览器主题色（Material You，TonalSpot 方案）
 * 生成 --color-ref-* 调色板并注入 DevTools（devtools://theme/colors.css），design tokens 再由它派生 --sys-color-*。
 * 页面无法读取浏览器主题色，这里以可配置的种子色走同一条生成路径。
 */
import {
  Hct,
  TonalPalette,
  argbFromHex,
  hexFromArgb,
  sanitizeDegreesDouble,
} from "@material/material-color-utilities";

/** 取自 Chrome 青绿主题下 DevTools 的 --sys-color-primary（primary40） */
export const DEFAULT_SEED = "#01696f";

/** design_system_tokens.css 引用到的色阶（各调色板取并集） */
const TONES = [0, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 94, 95, 98, 99, 100];

export const isHexColor = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

/**
 * TonalSpot（2021 规范）的各调色板 = 种子色相 + 固定色度。直接构造 TonalPalette 而不经 SchemeTonalSpot，
 * 避免把整套 DynamicScheme / MaterialDynamicColors 打进 chunk；对多个种子色逐色阶比对，两者结果一致。
 */
export const paletteCss = (seed: string) => {
  const { hue } = Hct.fromInt(argbFromHex(seed));
  const palettes = {
    primary: TonalPalette.fromHueAndChroma(hue, 36),
    secondary: TonalPalette.fromHueAndChroma(hue, 16),
    tertiary: TonalPalette.fromHueAndChroma(sanitizeDegreesDouble(hue + 60), 24),
    neutral: TonalPalette.fromHueAndChroma(hue, 6),
    "neutral-variant": TonalPalette.fromHueAndChroma(hue, 8),
    error: TonalPalette.fromHueAndChroma(25, 84),
  };
  const vars = Object.entries(palettes).flatMap(([name, p]) =>
    TONES.map((t) => `--color-ref-${name}${t}: ${hexFromArgb(p.tone(t))};`),
  );
  return `:host {\n  ${vars.join("\n  ")}\n}`;
};
