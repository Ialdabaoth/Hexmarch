// Handing a link to another Hexmarch app (Heph 2026-11-10: a link to another app opened as a page inside the current
// app, so Scribe showed the Atlas, the Atlas showed the Companion). Apps never navigate their own window to another
// app. Instead:
//   1. an open window of the target app on this device takes the link (BroadcastChannel; same browser profile only),
//   2. otherwise a new window opens on it (the installed app when the browser routes links to it; Chrome on a
//      computer: the app's settings, "Open supported links"),
//   3. otherwise (a blocked popup: no tap to open it from) the caller shows the link as a button to tap.
// The link itself is unchanged: an app opening it reads it exactly as if it had been typed in.

export type HandOff = 'taken' | 'opened' | 'blocked';

const CHANNEL = 'hexmarch-handoff';
type Offer = { type: 'offer'; id: string; url: string };
type Taken = { type: 'taken'; id: string };

// The app a link is for: the site path up to its first folder (<site>/companion/, <site>/atlas/, <site>/scribe/).
export function appOf(url: string, site: string): string | null {
  try {
    const u = new URL(url), s = new URL(site);
    if (u.origin !== s.origin || !u.pathname.startsWith(s.pathname)) return null;
    const first = u.pathname.slice(s.pathname.length).split('/')[0];
    return first ? s.pathname + first + '/' : null;
  } catch {
    return null;
  }
}

// `site`: the folder holding the apps (the Launcher's address). Waits up to `wait` ms for an open window to answer.
export async function handOff(url: string, site: string, wait = 400): Promise<HandOff> {
  if (typeof BroadcastChannel !== 'undefined' && appOf(url, site)) {
    const ch = new BroadcastChannel(CHANNEL);
    const id = Math.random().toString(36).slice(2);
    const taken = await new Promise<boolean>((ok) => {
      const t = setTimeout(() => ok(false), wait);
      ch.onmessage = (e: MessageEvent<Taken>) => {
        if (e.data?.type === 'taken' && e.data.id === id) (clearTimeout(t), ok(true));
      };
      ch.postMessage({ type: 'offer', id, url } satisfies Offer);
    });
    ch.close();
    if (taken) return 'taken';
  }
  const w = typeof window === 'undefined' ? null : window.open(url, '_blank');
  if (!w) return 'blocked';
  try {
    w.opener = null;
  } catch {
    /* another app's window */
  }
  return 'opened';
}

// Load a link here as if it were opened fresh: a link that differs only after # would otherwise not reload the page.
export function reloadAt(url: string) {
  const same = (u: URL) => u.origin + u.pathname + u.search;
  const before = same(new URL(location.href));
  location.assign(url);
  if (same(new URL(url, location.href)) === before) location.reload();
}

// In each app: take links offered for this app (its folder, `mine`) by loading them here, the same as opening them.
export function takeHandOffs(mine: string, site: string, open: (url: string) => void = reloadAt) {
  if (typeof BroadcastChannel === 'undefined') return;
  const ch = new BroadcastChannel(CHANNEL);
  const own = new URL(mine, location.href).pathname;
  let busy = false;
  ch.onmessage = (e: MessageEvent<Offer>) => {
    const d = e.data;
    if (busy || d?.type !== 'offer' || typeof d.url !== 'string' || appOf(d.url, site) !== own) return;
    busy = true; // one window takes it
    ch.postMessage({ type: 'taken', id: d.id } satisfies Taken);
    open(d.url);
  };
}
