import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };
import links from '../links.json' with { type: 'json' };

// GitHub Pages serves the app from /<repo>/, so the workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/';
// PREVIEW=1 builds a plain web page (no service worker) for hosts that can't run one.
const pwa = !process.env.PREVIEW;

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // ../links.json is shared with the E9 Atlas; an empty link is hidden
    __PATREON_URL__: JSON.stringify(links.patreon ?? '')
  },
  plugins: [
    svelte(),
    pwa && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      // modules/ (map viewers, PDFs, module.json) is published beside the app, under the same base
      // (/MateriaMundiRPG/modules/…). The app's offline shell must not answer for those pages, or a
      // map viewer opens as another copy of the app.
      workbox: { navigateFallbackDenylist: [/\/modules\//] },
      manifest: {
        name: 'E9 Companion',
        short_name: 'E9',
        description: 'Characters, followers and dice for E9 and its settings, Materia Mundi among them.',
        theme_color: '#2b2118',
        background_color: '#f4ecdc',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  test: {
    include: ['src/**/*.test.ts']
  }
});
