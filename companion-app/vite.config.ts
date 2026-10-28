import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// GitHub Pages serves the app from /<repo>/, so the workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/';
// PREVIEW=1 builds a plain web page (no service worker) for hosts that can't run one.
const pwa = !process.env.PREVIEW;

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    svelte(),
    pwa && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Materia Mundi Companion',
        short_name: 'Materia Mundi',
        description: 'Characters, followers and dice for the Materia Mundi RPG.',
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
