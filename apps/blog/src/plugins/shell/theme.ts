/** 站点视觉规范：设计变量与对 heti 的覆盖；须在 ./styles 的 css 之后注入（同一 @layer 内后出现者优先） */
export const theme = `
  :root {
    color-scheme: light dark;
    --bb-bg: #ffffff;
    --bb-fg: #222222;
    --bb-muted: #707070;
    --bb-rule: #cccccc;
    --bb-selection: rgba(0, 0, 0, .08);
    --bb-space: 24px;
    --bb-ease: cubic-bezier(.23, 1, .32, 1);
    --bb-mark: 2px;
    --blink-speed: 1.2s;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bb-bg: #161616;
      --bb-fg: #d4d4d4;
      --bb-muted: #8c8c8c;
      --bb-rule: #404040;
      --bb-selection: rgba(255, 255, 255, .12);
    }
  }

  body { margin: 0; background: var(--bb-bg); color: var(--bb-fg); }
  .shell { max-width: 37rem; margin: 0 auto; padding: 0 1.25rem; min-height: 100%; box-sizing: border-box;
    display: flex; flex-direction: column; }
  .shell ::selection { background: var(--bb-selection); }
  .shell p { text-wrap: pretty; }
  .shell { text-autospace: normal; }

  .shell > header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 0; }
  .shell > header nav a { margin-right: 1rem; }
  .shell > header:has(> div:empty) { display: none; }
  .shell > main { flex: 1; padding-block-start: calc(var(--bb-space) * 3); }
  /* 正文：行高 1.75；段距 12px（与首行缩进配合，不再使用 heti 的 12px / 24px） */
  .shell > main { line-height: 1.75; }
  .shell > main p { margin-block: 12px; }
  @media (max-width: 640px) {
    .shell > main { padding-block-start: calc(var(--bb-space) * 2); }
  }
  .shell > header:not(:has(> div:empty)) + main { padding-block-start: 0; }
  .shell > main section > * + * { margin-block-start: calc(var(--bb-space) * 4); }
  /* 文章列表：相邻文章之间以 --bb-mark 方块分节，上下各 4 个间距单位；清零相邻处正文的外边距，使间距不受远程 HTML 影响 */
  .shell > main .bb-posts > article + article { margin-block-start: 0; }
  .shell > main .bb-posts > article + article::before {
    content: "";
    display: block;
    inline-size: var(--bb-mark);
    block-size: var(--bb-mark);
    margin: calc(var(--bb-space) * 4) auto;
    background: var(--bb-muted);
  }
  .shell > main .bb-posts > article + article > div > :first-child { margin-block-start: 0; }
  .shell > main .bb-posts > article:not(:last-child) > div > :last-child { margin-block-end: 0; }

  .shell > footer { padding-block-end: calc(var(--bb-space) * 2); }
  /* 脚注分隔线：取正文宽度的 1/3（书籍版式），以伪元素绘制，几何位置与原 1px 上边框相同 */
  .shell.heti > footer.heti-fn { border-block-start: 0; color: var(--bb-muted); }
  .shell.heti > footer.heti-fn::before {
    content: "";
    display: block;
    inline-size: calc(100% / 3);
    block-size: 1px;
    background: var(--bb-rule);
  }
  /* 与脚注对齐：12px 同 .heti .heti-fn ol 的 margin-block-start，32px 同 .heti ol 的 padding-inline-start；编号位置以 --bb-mark 方块代替 */
  .shell.heti > footer .bb-footer-back { position: relative; margin-block: 12px 0; padding-inline-start: 32px; text-indent: 0; text-align: start; }
  .shell.heti > footer .bb-footer-back::before {
    content: "";
    position: absolute;
    inset-inline-start: calc(32px - 8px - var(--bb-mark));
    inset-block-start: calc(50% - var(--bb-mark) / 2);
    inline-size: var(--bb-mark);
    block-size: var(--bb-mark);
    background: currentColor;
  }
  .shell.heti .heti-fn li:target,
  .shell.heti sup:target,
  .shell.heti sup a:target { background-color: var(--bb-selection); }
  /* 正文中的脚注引用：不加方括号，灰色，左右各 .125em；不参与中西文自动间距（否则上标内再增加约 1.5px）；链接到对应脚注，不画下划线 */
  .shell.heti > main sup { margin-inline: .125em; color: var(--bb-muted); text-autospace: no-autospace; }
  .shell.heti > main sup a,
  .shell.heti > main sup a:hover { background-image: none; padding: 0; }
  @media (hover: hover) {
    .shell.heti > main sup a:hover { color: var(--bb-fg); }
  }

  .shell figure > img { max-width: 100%; }
  .shell figcaption { padding: 4px; font-size: smaller; color: var(--bb-muted); }

  /* 链接下划线：以 1px 点、4px 周期的渐变绘制，颜色为当前文字色的 50%（比原生 dotted 下划线更轻）；悬停时为实线 */
  .shell {
    --bb-underline-dotted: repeating-linear-gradient(90deg, color-mix(in srgb, currentColor 50%, transparent) 0 1px, transparent 1px 4px);
    --bb-underline-solid: linear-gradient(color-mix(in srgb, currentColor 50%, transparent), color-mix(in srgb, currentColor 50%, transparent));
  }
  .shell a,
  .shell.heti a:hover {
    color: inherit;
    border: 0;
    margin: 0;
    padding: 0 0 .1em;
    text-decoration: none;
    background: var(--bb-underline-dotted) 0 100% / 100% 1px no-repeat;
  }

  /* 脚注中的可交互元素（FootnoteActionTopic）；选择器需高于 heti 的 .heti abbr[title]（cursor: help） */
  .shell.heti > footer [data-action] {
    cursor: pointer;
    appearance: none;
    font: inherit;
    color: inherit;
    border: 0;
    margin: 0;
    padding: 0 0 .1em;
    text-decoration: none;
    background: var(--bb-underline-dotted) 0 100% / 100% 1px no-repeat;
  }
  @media (hover: hover) {
    .shell.heti a:hover,
    .shell.heti > footer [data-action]:hover { background-image: var(--bb-underline-solid); }
  }
  /* 强制颜色模式会去掉背景图，改回原生下划线 */
  @media (forced-colors: active) {
    .shell a,
    .shell.heti > footer [data-action] { text-decoration: underline; }
  }

  .shell :focus-visible { outline: 1px solid currentColor; outline-offset: 2px; }

  .bb-square { display: inline-block; inline-size: .75em; block-size: .75em; background: currentColor; vertical-align: middle; }
  button.bb-square {
    appearance: none;
    border: 0;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
    transition: opacity 120ms ease-out, transform 120ms var(--bb-ease);
  }
  @media (hover: hover) {
    button.bb-square:hover { opacity: .7; }
  }
  button.bb-square:active { transform: scale(.92); }
  button.bb-square:focus-visible { outline-offset: 1px; }

  .signature { text-align: right; }
  .signature > p { display: inline-flex; flex-direction: column; text-indent: 0; }
  .signature-name { display: inline-flex; align-items: center; gap: .25em; }

  @keyframes blink {
    0%, 100% { opacity: .5; }
    50% { opacity: 0; }
  }
  .blink { opacity: 0; animation: blink var(--blink-speed) ease-in-out 300ms infinite; }

  @keyframes bb-enter { from { opacity: 0; } }
  .shell > main > *,
  .shell > main section,
  .shell > footer > * { animation: bb-enter 150ms ease-out; }

  @media (prefers-reduced-motion: reduce) {
    .blink { animation: none; opacity: .5; }
    .shell > main > *,
    .shell > main section,
    .shell > footer > * { animation: none; }
    button.bb-square { transition: none; }
  }

  @media print {
    :root { --bb-bg: #ffffff; --bb-fg: #000000; --bb-muted: #555555; --bb-rule: #999999; }
    .shell a,
    .shell.heti > footer [data-action] { background: none; text-decoration: underline dotted; }
    .shell > footer:has(.bb-footer-back) { display: none; }
    .shell > main > *,
    .shell > main section,
    .shell > footer > * { animation: none; }
  }
`;
