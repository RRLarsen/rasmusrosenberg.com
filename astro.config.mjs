// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.rasmusrosenberg.com',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  // sitemap-index.xml for search engines; the 404 page is left out
  integrations: [sitemap({ filter: (page) => !page.includes('/404') })],
  // Old Wix addresses, so existing links and search results keep working.
  redirects: {
    '/home': '/',
    '/general-4': '/book/',
    '/services-7': '/expertise/',
    '/services-7-1': '/tools/',
    '/publications': '/research/',
    '/cv': '/about/',
    // renamed 2026-10-23
    '/blog-media': '/media/',
  },
});
