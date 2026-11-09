import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };
import { existsSync, readFileSync } from 'node:fs';

// ../site.json names the apps' data repository; ../links.json is copied in from it by scripts/data.sh
const readJson = (path: string) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {});
const site = readJson(new URL('../site.json', import.meta.url).pathname);
const links = readJson(new URL('../links.json', import.meta.url).pathname);

// GitHub Pages serves the app from /<repo>/, so the workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/';
// PREVIEW=1 builds a plain web page (no service worker) for hosts that can't run one.
const pwa = !process.env.PREVIEW;

export default defineConfig({
  base,
  // rules modules (../modules/e9-core etc.) are imported at build time; let the dev server read them
  server: { fs: { allow: ['.', '../modules', '../engine'] } },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // the suite's name (../site.json "name"): the Companion is "<name> Companion"
    __SUITE_NAME__: JSON.stringify(site.name ?? 'Hexmarch'),
    // ../links.json is shared with the Atlas; an empty link is hidden
    __PATREON_URL__: JSON.stringify(links.patreon ?? ''),
    __DATA_URL__: JSON.stringify(site.data?.url ?? '')
  },
  plugins: [
    svelte(),
    pwa && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      // The Atlas is published beside the app (<base>atlas/); module pages live on the data site.
      // The app's offline shell must not answer for those pages, or a map opens as another copy of the app.
      // Match each with or without its trailing slash: /Hexmarch/atlas (as typed or bookmarked) used to open the Companion.
      workbox: { navigateFallbackDenylist: [/\/(modules|atlas|scribe)(\/|\?|$)/] },
      manifest: {
        // the hexagon groups the apps on a home screen (Heph 2026-11-08); the icon label uses the plain short name
        name: '⬢ Companion',
        short_name: 'Companion',
        description: 'Characters, followers and dice for E9 and its settings, Materia Mundi among them.',
        theme_color: '#2b2118',
        background_color: '#f4ecdc',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        // Links and files from other apps open in the installed Companion (lib/share.ts; WORKFLOWS.md "Apps talk by links")
        share_target: { action: './', method: 'GET', params: { title: 'share-title', text: 'share-text', url: 'share-url' } },
        file_handlers: [{ action: './', accept: { 'application/json': ['.json'] } }],
        // an open Companion window takes the link instead of a second window opening
        launch_handler: { client_mode: ['navigate-existing', 'auto'] },
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  test: {
    // ../engine is the shared editing engine (Scribe); its tests run here too
    include: ['src/**/*.test.ts', '../engine/**/*.test.ts'],
    // Module layouts read their layout.css as text (lib/layout/layouts.ts).
    css: { include: [/layout\/layout\.css/] }
  }
});
