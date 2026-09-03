import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/**
 * The public page. Static output, zero client JS by default.
 *
 * `site` is not decoration — the sitemap, the canonical link and every
 * Open Graph URL are absolute, and an absolute URL cannot be derived from a
 * relative build. Getting this wrong is the single most common way a launch
 * ships with `localhost` in its social cards.
 */
export default defineConfig({
  site: 'https://wayleaf.app',
  integrations: [sitemap()],
  build: { inlineStylesheets: 'always' },
});
