// Discord as the campaign's mailbox, set up from Scribe (Heph 2026-11-12: "creating a discord bot" needs a very
// straightforward flow-through). Only a channel webhook is needed, no bot: players' Companions post requests to it,
// mentioning the campaign's ping so Discord itself notifies the referee (engine readPing, Hexmarch #64).

const WEBHOOK = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+\/?$/;
export const isWebhook = (url: string) => WEBHOOK.test(url.trim());

// Something that starts like a webhook but isn't one whole, e.g. cut short when copying.
export const looksLikeWebhook = (url: string) => /discord(?:app)?\.com\/api\/webhooks/.test(url);

export type PingKind = 'me' | 'role' | 'here' | 'none';

// The ping from the choice and what was pasted: a user id or <@id> for "me", a role id or <@&id> for "role".
// '' for none; null when what was pasted isn't the right kind of id.
export function pingFrom(kind: PingKind, pasted: string): string | null {
  if (kind === 'none') return '';
  if (kind === 'here') return '@here';
  const t = pasted.trim();
  const m = /^<?@?(!|&)?(\d{15,21})>?$/.exec(t);
  if (!m) return null;
  if (kind === 'role' && m[1] && m[1] !== '&') return null;
  if (kind === 'me' && m[1] === '&') return null;
  return kind === 'role' ? `<@&${m[2]}>` : `<@${m[2]}>`;
}

// The other way round, for showing a saved ping.
export function pingChoice(ping: string | undefined): { kind: PingKind; pasted: string } {
  if (!ping) return { kind: 'none', pasted: '' };
  if (ping === '@here') return { kind: 'here', pasted: '' };
  const m = /^<@(&?)(\d+)>$/.exec(ping);
  return m ? { kind: m[1] ? 'role' : 'me', pasted: m[2] } : { kind: 'none', pasted: '' };
}

// Who a post may notify: only the ping, never anyone a player's text happens to mention.
export function allowedMentions(ping: string): { parse: string[]; users?: string[]; roles?: string[] } {
  if (ping === '@here') return { parse: ['everyone'] };
  const m = /^<@(&?)(\d+)>$/.exec(ping);
  return m ? (m[1] ? { parse: [], roles: [m[2]] } : { parse: [], users: [m[2]] }) : { parse: [] };
}

// "Send a test post": the same kind of post a join request makes, so the referee sees the notification arrive.
export async function testPost(url: string, ping: string, title: string, f: typeof fetch = fetch): Promise<void> {
  if (!isWebhook(url)) throw new Error("That isn't a whole Discord webhook address. Copy it again from Discord.");
  let res: Response;
  try {
    res = await f(url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `${ping ? ping + ' ' : ''}Hexmarch test: players' requests for “${title}” will arrive in this channel.`.slice(0, 2000),
        allowed_mentions: allowedMentions(ping)
      })
    });
  } catch {
    throw new Error("Couldn't reach Discord. Check your connection and try again.");
  }
  if (res.status === 401 || res.status === 404) throw new Error('Discord doesn\'t know that webhook. It may have been deleted; make a new one and paste it again.');
  if (!res.ok) throw new Error(`Discord said ${res.status}.`);
}
