// External links open in a new tab. Every page passes through here (in the dev server and when
// the static build renders each page), so links from templates, data and generated HTML (APA
// references, the CV) are all covered. A link to another site gets target="_blank" and
// rel="noopener", plus hidden text so screen readers announce the new tab.
import { defineMiddleware } from 'astro:middleware';

const OWN_HOSTS = new Set(['rasmusrosenberg.com', 'www.rasmusrosenberg.com', 'localhost', '127.0.0.1']);

const isExternal = (href: string) => {
  if (!/^https?:\/\//i.test(href)) return false;
  try { return !OWN_HOSTS.has(new URL(href).hostname); } catch { return false; }
};

export function markExternalLinks(html: string) {
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs: string, inner: string) => {
    const href = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/i);
    const url = href?.[2] ?? href?.[3];
    if (!url || !isExternal(url) || /\btarget\s*=/i.test(attrs)) return whole;
    const rel = /\brel\s*=/i.test(attrs) ? attrs : `${attrs} rel="noopener"`;
    return `<a${rel} target="_blank">${inner}<span class="visually-hidden"> (opens in a new tab)</span></a>`;
  });
}

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  if (!response.headers.get('content-type')?.includes('text/html')) return response;
  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(markExternalLinks(html), { status: response.status, statusText: response.statusText, headers });
});
