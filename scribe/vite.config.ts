import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { existsSync, readFileSync } from 'node:fs';

// Hexmarch Scribe (the name comes from site.json "name"): its own app at <site>/scribe/ (Heph 2026-11-08). scribe_app.py copies dist/ there and adds the
// install manifest and icons. Relative base, so the build works wherever the site lives.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const site = existsSync(new URL('../site.json', import.meta.url)) ? JSON.parse(read('../site.json')) : {};

export default defineConfig({
  base: './',
  // the shared engine (../engine) and the rules modules (../modules/*-core) are read at build time
  server: { fs: { allow: ['.', '../engine', '../modules'] } },
  define: {
    __SCRIBE_VERSION__: JSON.stringify(read('./VERSION').trim()),
    __DATA_URL__: JSON.stringify(site.data?.url ?? ''),
    __SITE_NAME__: JSON.stringify(site.name ?? 'Hexmarch')
  },
  plugins: [svelte()],
  test: { include: ['src/**/*.test.ts'] }
});
