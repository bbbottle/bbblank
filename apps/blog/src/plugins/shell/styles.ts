export const css = `
  body { margin: 0; background: var(--bg, #fff); color: var(--fg, #222);
    font: 16px/1.7 system-ui, -apple-system, sans-serif; }
  .shell { max-width: 42rem; margin: 0 auto; padding: 0 1.25rem; min-height: 100vh;
    display: flex; flex-direction: column; }
  .shell > header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 0; }
  .shell > header nav a { margin-right: 1rem; }
  .shell > main { flex: 1; }
  .shell > footer { padding: 2rem 0; opacity: .6; font-size: .875rem; }
  a { color: var(--link, #0969da); text-decoration: none; }
  a:hover { text-decoration: underline; }
`;
