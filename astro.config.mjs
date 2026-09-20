// @ts-check
import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'

// AUROS — site config.
//
// Spec §6D: "Static site, one serverless function. Astro, static output. No client-side framework for
// content pages." So: `output: 'static'`, and NO Cloudflare adapter here. The single Worker is a
// separate deployable with its own wrangler.jsonc; binding an SSR adapter to the site would turn every
// content page into a function invocation for no benefit and would cost Lighthouse points on TTFB.
//
// @astrojs/mdx must be registered explicitly. Without it, `.mdx` files are not recognised, the content
// collections load ZERO entries, and the build fails at render with "no entry in the pages collection"
// — which reads like a missing document and is actually a missing integration. That cost a build.
export default defineConfig({
  output: 'static',
  site: 'https://auros.pages.dev',
  integrations: [mdx()],
  build: {
    // One .html per route with no trailing-slash redirect, which is what a static host wants.
    format: 'file',
  },
  markdown: {
    // Syntax highlighting is theme-bound and the design system (§7) fixes the palette, so the
    // highlighter is configured where the tokens are, not here.
    shikiConfig: { theme: 'github-light', wrap: true },
  },
  vite: {
    build: {
      // §7 bans remote assets. Inlining small assets keeps request count down without reaching for a CDN.
      assetsInlineLimit: 2048,
    },
  },
})
