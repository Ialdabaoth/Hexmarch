// Getting the newest app onto a device. The service worker (vite-plugin-pwa, autoUpdate) installs a new version
// in the background and takes over at once, but the page already open keeps running the old code until it
// reloads. A player who taps an invitation on a phone that last opened the app weeks ago would then meet an
// old build that can't read the campaign (Heph 2026-11-09). So:
// - an invitation being opened is kept in sessionStorage until it has opened, surviving a reload;
// - when a new version takes over soon after the page opened, or while an invitation waits, the page reloads.

const PENDING = 'hexmarch-pending-invite';
const TRIES = 'hexmarch-pending-invite-tries';
const opened = Date.now();

function session(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function keepInvite(search: string) {
  session()?.setItem(PENDING, search);
}

export function pendingInvite(): string {
  return session()?.getItem(PENDING) ?? '';
}

export function inviteDone() {
  session()?.removeItem(PENDING);
  session()?.removeItem(TRIES);
}

export function watchForNewVersion() {
  const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  // no controller yet: this is the first install, and the page already runs the newest code
  if (!sw?.controller) return;
  let done = false;
  sw.addEventListener('controllerchange', () => {
    if (done || (Date.now() - opened > 20000 && !pendingInvite())) return;
    done = true;
    location.reload();
  });
}

// Asks for a newer app, once per invitation: true when the page is about to reload into it.
export async function updateForInvite(): Promise<boolean> {
  const s = session();
  const tries = Number(s?.getItem(TRIES) ?? 0);
  if (!s || tries >= 1) return false;
  s.setItem(TRIES, String(tries + 1));
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch (e) {
    console.warn('Update check failed', e);
  }
  // a new version takes over and watchForNewVersion reloads; if none came, reload anyway to fetch fresh files
  setTimeout(() => location.reload(), 4000);
  return true;
}
