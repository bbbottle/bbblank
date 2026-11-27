/** 站点视觉规范：设计变量与对 heti 的覆盖；须在 ./styles 的 css 之后注入（同一 @layer 内后出现者优先） */
export const theme = `
  :root {
    color-scheme: light dark;
    --bb-bg: #ffffff;
    --bb-fg: #222222;
    --bb-muted: #707070;
    --bb-rule: #e6e6e6;
    --bb-selection: rgba(0, 0, 0, .08);
    --bb-space: 24px;
    --bb-ease: cubic-bezier(.23, 1, .32, 1);
    --blink-speed: 1.2s;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bb-bg: #161616;
      --bb-fg: #d4d4d4;
      --bb-muted: #8c8c8c;
      --bb-rule: #2e2e2e;
      --bb-selection: rgba(255, 255, 255, .12);
    }
  }

  body { margin: 0; background: var(--bb-bg); color: var(--bb-fg); }
  .shell { max-width: 37rem; margin: 0 auto; padding: 0 1.25rem; min-height: 100%; box-sizing: border-box;
    display: flex; flex-direction: column; }
  .shell ::selection { background: var(--bb-selection); }
  .shell p { text-wrap: pretty; }

  .shell > header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 0; }
  .shell > header nav a { margin-right: 1rem; }
  .shell > header:has(> div:empty) { display: none; }
  .shell > main { flex: 1; padding-block-start: calc(var(--bb-space) * 3); }
  @media (max-width: 640px) {
    .shell > main { padding-block-start: calc(var(--bb-space) * 2); }
  }
  .shell > header:not(:has(> div:empty)) + main { padding-block-start: 0; }
  .shell > main section > * + * { margin-block-start: calc(var(--bb-space) * 4); }

  .shell > footer { padding-block-end: calc(var(--bb-space) * 2); }
  .shell.heti > footer.heti-fn { border-block-start-color: var(--bb-rule); color: var(--bb-muted); }
  /* 与脚注对齐：12px 同 .heti .heti-fn ol 的 margin-block-start，32px 同 .heti ol 的 padding-inline-start；保留 heti 的编号标记 */
  .shell.heti > footer .bb-footer-back { margin-block: 12px 0; padding-inline-start: 32px; }
  .shell.heti .heti-fn li:target,
  .shell.heti sup:target,
  .shell.heti sup a:target { background-color: var(--bb-selection); }

  .shell figure > img { max-width: 100%; }
  .shell figcaption { padding: 4px; font-size: smaller; color: var(--bb-muted); }

  .shell a,
  .shell.heti a:hover {
    color: inherit;
    border: 0;
    padding: 0;
    margin: 0;
    text-decoration-line: underline;
    text-decoration-style: dotted;
    text-decoration-thickness: 1px;
    text-underline-offset: .3em;
  }
  @media (hover: hover) {
    .shell.heti a:hover { text-decoration-style: solid; }
  }

  /* 脚注中的可交互元素（FootnoteActionTopic）；选择器需高于 heti 的 .heti abbr[title]（cursor: help） */
  .shell.heti > footer [data-action] {
    cursor: pointer;
    appearance: none;
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    margin: 0;
    text-decoration: underline dotted 1px;
    text-underline-offset: .3em;
  }
  @media (hover: hover) {
    .shell.heti > footer [data-action]:hover { text-decoration-style: solid; }
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
`;
