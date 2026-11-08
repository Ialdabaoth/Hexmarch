// Pictures uploaded on this device live in their own store, and a sheet's portrait
// field holds a short "cache:<id>" link to one. Web links (https://) aren't cached;
// the browser loads them from the web each time.
import { createStore, del, entries, set } from 'idb-keyval';

const store = createStore('materia-mundi-portraits', 'portraits');

export const CACHE_PREFIX = 'cache:';

export const isInline = (p: string) => p.startsWith('data:');
export const cachedId = (p: string) => (p.startsWith(CACHE_PREFIX) ? p.slice(CACHE_PREFIX.length) : null);

// Named by content, so the same picture used twice is stored once.
export async function portraitId(dataUrl: string): Promise<string> {
  try {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl));
    return [...new Uint8Array(hash).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return crypto.randomUUID();
  }
}

export async function loadPortraits(): Promise<Record<string, string>> {
  return Object.fromEntries((await entries<string, string>(store)).filter(([, v]) => typeof v === 'string'));
}

export const savePortrait = (id: string, dataUrl: string) => set(id, dataUrl, store);
export const deletePortrait = (id: string) => del(id, store);

// Where an <img> should load a sheet's portrait from: '' when there's none
// (or when a cached picture is missing, as after importing on another device).
export function portraitSrc(p: string, cache: Record<string, string>): string {
  const id = cachedId(p);
  return id === null ? p : (cache[id] ?? '');
}

// Only web links that point at the open web over https.
export function isWebImageUrl(url: string): boolean {
  return /^https:\/\/\S+$/.test(url.trim());
}
