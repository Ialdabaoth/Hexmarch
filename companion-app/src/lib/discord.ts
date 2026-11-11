import { headline, rolledLine, type LogEntry } from './checks';

const WEBHOOK = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export function isWebhookUrl(url: string): boolean {
  return WEBHOOK.test(url.trim());
}

const COLORS = { success: 0x3f8f4f, failure: 0xa33b2b, critical: 0xd4a017 } as const;

export function webhookPayload(entry: LogEntry) {
  return {
    username: entry.who.slice(0, 80) || `${__SUITE_NAME__} Companion`,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: headline(entry).slice(0, 256),
        description: `*${rolledLine(entry)}*`,
        color: entry.outcome ? COLORS[entry.outcome] : 0x6b5a45
      }
    ]
  };
}

export async function postToDiscord(url: string, entry: LogEntry): Promise<void> {
  const res = await fetch(url.trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(webhookPayload(entry))
  });
  if (!res.ok) throw new Error(`Discord said ${res.status}`);
}

// The campaign's Discord channel as a mailbox (WORKFLOWS "Adapters, mixed per campaign": Discord Mail; players post
// through a webhook, so they need no Discord account). A request posts as a line people can read plus the envelope
// as a file, which the referee's app (or the referee, by hand) opens. ?wait=true returns the message, whose id
// lets the sender edit the post later (the witness post: "waiting" -> "joined" or "sent back").
export async function postMail(url: string, file: { name: string; data: unknown }, content: string): Promise<string> {
  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({ content: content.slice(0, 2000), allowed_mentions: { parse: [] } }));
  fd.append('files[0]', new Blob([JSON.stringify(file.data)], { type: 'application/json' }), file.name);
  const res = await fetch(`${url.trim()}?wait=true`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`Discord said ${res.status}`);
  const m = (await res.json()) as { id?: unknown };
  return typeof m.id === 'string' ? m.id : '';
}

// Edits a post this webhook made (only the webhook that posted it can).
export async function editPost(url: string, id: string, content: string): Promise<void> {
  const res = await fetch(`${url.trim()}/messages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content.slice(0, 2000), allowed_mentions: { parse: [] } })
  });
  if (!res.ok) throw new Error(`Discord said ${res.status}`);
}

// The referee tells the table something: a description, or a handout with a picture.
export function tableMessage(who: string, text: string, image = '') {
  return {
    username: who.slice(0, 80),
    allowed_mentions: { parse: [] },
    embeds: [{ description: text.slice(0, 4096), color: 0x6b5a45, ...(/^https:\/\//.test(image) ? { image: { url: image } } : {}) }]
  };
}
export async function postMessage(url: string, payload: object): Promise<void> {
  const res = await fetch(url.trim(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`Discord said ${res.status}`);
}
