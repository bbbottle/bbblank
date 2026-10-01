// @vitest-environment jsdom
// happy-dom 下 DOMPurify 报告 isSupported 但净化结果错误，故此文件改用 jsdom
import { describe, expect, it } from 'vitest';
import { Schema } from 'effect';
import { InstallStore, PermissionPolicy, PluginLoader, createKernel } from '@bbblank/kernel';
import { definePlugin } from '@bbblank/sdk';
import type { PluginID, SemVer } from '@bbblank/sdk';
import { Html, HtmlLive, TrustedHtmlSchema, isTrustedHtml } from './html-capability.js';
import type { HtmlFacade } from './html-capability.js';

const id = (s: string) => s as PluginID;

const withHtml = async (access?: 'read' | 'write') => {
  let html!: HtmlFacade;
  const p = definePlugin({
    manifest: { id: id('p'), name: 'p', version: '1.0.0' as SemVer },
    capabilities: [Html],
    setup: api => void (html = api.caps.html),
  });
  const k = createKernel({
    capabilities: [Html],
    capabilityLayer: HtmlLive(window),
    loader: PluginLoader.fromMap(new Map([[id('p'), p]])),
    store: InstallStore.memory(),
    ...(access ? { permission: PermissionPolicy.restrict(() => ({ access: { html: access } })) } : {}),
  });
  await k.view.install(id('p'));
  return { html, k };
};

describe('Html capability', () => {
  it('strips dangerous markup but keeps links and data attributes', async () => {
    const { html, k } = await withHtml();
    const t = html.trust('<a href="/blog" data-link onclick="x()">blog</a><script>x()</script><a href="javascript:x()">j</a>');
    expect(t.html).toContain('<a href="/blog" data-link="">blog</a>');
    expect(t.html).not.toMatch(/script|onclick|javascript:/);
    expect(Object.isFrozen(t)).toBe(true);
    await k.dispose();
  });

  it('only issued values are trusted', async () => {
    const { html, k } = await withHtml();
    const forged = { html: '<img src=x onerror=alert(1)>' };
    expect(isTrustedHtml(forged)).toBe(false);
    expect(Schema.is(TrustedHtmlSchema)(forged)).toBe(false);
    expect(Schema.is(TrustedHtmlSchema)(html.trust('<b>ok</b>'))).toBe(true);
    await k.dispose();
  });

  it('read access cannot trust', async () => {
    const { html, k } = await withHtml('read');
    expect(() => html.trust('<b>x</b>')).toThrow(expect.objectContaining({ _tag: 'PermissionDenied' }));
    await k.dispose();
  });
});
