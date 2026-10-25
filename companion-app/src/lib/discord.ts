import { headline, rolledLine, type LogEntry } from './checks';

const WEBHOOK = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export function isWebhookUrl(url: string): boolean {
  return WEBHOOK.test(url.trim());
}

const COLORS = { success: 0x3f8f4f, failure: 0xa33b2b, critical: 0xd4a017 } as const;

export function webhookPayload(entry: LogEntry) {
  return {
    username: entry.who.slice(0, 80) || 'Materia Mundi',
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
