/**
 * HtmlCapability —— 受信 HTML 的唯一来源。
 * 写：trust（需 write 授权并写审计）——经 DOMPurify 去除脚本、事件属性、javascript: URL 等高危内容，
 * 返回冻结且不可伪造的 TrustedHtml；渲染方只对 TrustedHtml 使用 innerHTML，普通字符串一律按文本处理。
 */
import DOMPurify from 'dompurify';
import { Effect, Layer, Schema } from 'effect';
import { defineCapability } from '@bbblank/sdk';

export interface TrustedHtml {
  readonly html: string;
}

const issued = new WeakSet<object>();

export const isTrustedHtml = (u: unknown): u is TrustedHtml =>
  typeof u === 'object' && u !== null && issued.has(u);

export const TrustedHtmlSchema = Schema.declare(isTrustedHtml);

export interface HtmlShape {
  readonly sanitize: (raw: string) => Effect.Effect<string>;
}

export interface HtmlFacade {
  trust(raw: string): TrustedHtml;
}

export const Html = defineCapability<'html', HtmlShape, HtmlFacade>('html', (s, ctx) => ({
  trust: raw => {
    ctx.require('write');
    ctx.audit('html:trust');
    const t: TrustedHtml = Object.freeze({ html: ctx.runSync(s.sanitize(raw)) });
    issued.add(t);
    return t;
  },
}));

export const HtmlLive = (win: Window & typeof globalThis = globalThis.window) =>
  Layer.sync(Html.tag, () => {
    const purify = DOMPurify(win);
    // 环境不支持时 DOMPurify 会原样返回输入；此时退化为转义，宁可丢失格式也不放行
    const sanitize = purify.isSupported
      ? (raw: string) => purify.sanitize(raw)
      : (raw: string) => {
          const el = win.document.createElement('div');
          el.textContent = raw;
          return el.innerHTML;
        };
    return { sanitize: raw => Effect.sync(() => sanitize(raw)) };
  });
