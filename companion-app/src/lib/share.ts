// Links and files the operating system hands the installed Companion (manifest share_target, file_handlers,
// launch_handler; WORKFLOWS.md "Apps talk by links" and "The Link adapter"). A player shares a message link
// (<app>#m=<data>) or an invitation link (?campaign=…) from a chat app straight to the Companion; Android puts
// it in the share-url, share-text or share-title field of the address. A desktop opens a message file with it.

export const SHARE_KEYS = ['share-url', 'share-text', 'share-title'] as const;

export type Shared =
  | { kind: 'message'; hash: string }
  | { kind: 'invite'; search: string }
  | { kind: 'other'; text: string };

// The first http(s) link in the shared fields, url first (some apps put the link in text instead).
function firstLink(q: URLSearchParams): string | null {
  for (const k of SHARE_KEYS) {
    const m = (q.get(k) ?? '').match(/https?:\/\/[^\s<>"]+/);
    if (m) return m[0];
  }
  return null;
}

// What a share brought, read from the page's query string; null when nothing was shared.
export function readShared(search: string): Shared | null {
  const q = new URLSearchParams(search);
  if (!SHARE_KEYS.some((k) => q.has(k))) return null;
  const link = firstLink(q);
  if (link) {
    let u: URL | null = null;
    try {
      u = new URL(link);
    } catch {
      u = null;
    }
    if (u && /(^#|&)m=/.test(u.hash)) return { kind: 'message', hash: u.hash };
    if (u && u.searchParams.has('campaign')) {
      const keep = new URLSearchParams();
      for (const k of ['campaign', 'as', 'character']) {
        const v = u.searchParams.get(k);
        if (v !== null) keep.set(k, v);
      }
      return { kind: 'invite', search: `?${keep}` };
    }
  }
  return { kind: 'other', text: SHARE_KEYS.map((k) => q.get(k) ?? '').filter(Boolean).join(' ').slice(0, 200) };
}

// The query string with the shared fields taken out, for history.replaceState.
export function withoutShared(search: string): string {
  const q = new URLSearchParams(search);
  for (const k of SHARE_KEYS) q.delete(k);
  return q.size ? `?${q}` : '';
}
