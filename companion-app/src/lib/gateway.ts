// The referee's live Discord reader (WORKFLOWS "Adapters, mixed per campaign": Discord Mail). Discord's REST API
// refuses a bot's requests from a web page (no CORS), but its gateway WebSocket works from a browser (Heph's test,
// 2026-11-12). So while the referee's Companion is open it holds the gateway with the referee's own bot and hears
// each new post in the campaign channel; a post with a message file attached is mail. It hears nothing while the
// app is closed: posts made then need the referee's Apps Script or opening the file by hand.

const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';
// GUILDS | GUILD_MESSAGES | MESSAGE_CONTENT
const INTENTS = (1 << 0) | (1 << 9) | (1 << 15);
// Close codes that a retry won't fix, with what the referee can do.
const FATAL: Record<number, string> = {
  4004: 'Discord refused the bot token',
  4010: 'Discord refused the connection',
  4011: 'the bot needs sharding',
  4012: 'Discord refused the connection',
  4013: 'Discord refused the connection',
  4014: 'switch on Message Content Intent (Developer Portal › your app › Bot)'
};

export interface DiscordPost {
  id: string;
  channel_id: string;
  content?: string;
  attachments?: { url: string; filename: string; content_type?: string }[];
}

export type GatewayStatus =
  | { state: 'off' }
  | { state: 'connecting' }
  | { state: 'listening'; server?: string }
  | { state: 'no-channel' }
  | { state: 'failed'; reason: string };

// A webhook knows its own channel and server: GET on the webhook URL (no bot needed) returns them.
export async function webhookInfo(url: string, f: typeof fetch = fetch): Promise<{ channel: string; guild: string }> {
  const res = await f(url.trim());
  if (!res.ok) throw new Error(`Discord said ${res.status}`);
  const w = (await res.json()) as { channel_id?: string; guild_id?: string };
  if (!w.channel_id) throw new Error("Discord didn't say which channel the webhook posts to");
  return { channel: w.channel_id, guild: w.guild_id ?? '' };
}

// A bot token's first part is its application id in base64, so the referee never copies that id separately.
export function botAppId(token: string): string {
  const head = token.trim().split('.')[0] ?? '';
  try {
    const id = atob(head.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(head.length / 4) * 4, '='));
    return /^\d{15,21}$/.test(id) ? id : '';
  } catch {
    return '';
  }
}

// What the reader needs and nothing more: View Channel (1024) + Read Message History (65536).
export const BOT_PERMISSIONS = 1024 + 65536;

// Discord's "add this bot to a server" page, filled in: the campaign's server picked when the webhook says which.
export function inviteLink(appId: string, guild = ''): string {
  const q = new URLSearchParams({ client_id: appId, scope: 'bot', permissions: String(BOT_PERMISSIONS) });
  if (guild) { q.set('guild_id', guild); q.set('disable_guild_select', 'true'); }
  return `https://discord.com/oauth2/authorize?${q}`;
}

// The message files on a post: JSON attachments (the app names them <campaign>-<kind>-<who>.json).
export function mailAttachments(p: DiscordPost): string[] {
  return (p.attachments ?? []).filter((a) => /\.json$/i.test(a.filename) || /json/.test(a.content_type ?? '')).map((a) => a.url);
}

type Socket = Pick<WebSocket, 'send' | 'close'> & {
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: (() => void) | null;
};

// One live connection for one channel. Reconnects after drops (waiting longer each time); stops for good on a
// refused token or missing intent.
export class Gateway {
  private ws: Socket | null = null;
  private beat: ReturnType<typeof setInterval> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private seq: number | null = null;
  private tries = 0;
  private stopped = false;
  private seen = false;

  constructor(
    private token: string,
    private channel: string,
    private onPost: (p: DiscordPost) => void,
    private onStatus: (s: GatewayStatus) => void,
    private open: (url: string) => Socket = (u) => new WebSocket(u) as unknown as Socket
  ) {}

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    clearInterval(this.beat);
    clearTimeout(this.retry);
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(); } catch { /* already closed */ }
    this.onStatus({ state: 'off' });
  }

  private connect() {
    this.onStatus({ state: 'connecting' });
    this.seen = false;
    let ws: Socket;
    try { ws = this.open(GATEWAY); } catch (e) { return this.fail(e instanceof Error ? e.message : String(e)); }
    this.ws = ws;
    ws.onmessage = (ev) => this.message(JSON.parse(ev.data));
    ws.onerror = () => {};
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      clearInterval(this.beat);
      this.ws = null;
      if (this.stopped) return;
      if (FATAL[ev.code]) return this.fail(FATAL[ev.code]);
      this.again();
    };
  }

  private again() {
    this.onStatus({ state: 'connecting' });
    const wait = Math.min(60_000, 1000 * 2 ** this.tries++);
    this.retry = setTimeout(() => !this.stopped && this.connect(), wait);
  }

  private fail(reason: string) {
    this.stopped = true;
    this.onStatus({ state: 'failed', reason });
  }

  private send(d: unknown) {
    try { this.ws?.send(JSON.stringify(d)); } catch { /* the close handler reconnects */ }
  }

  private message(m: { op: number; t?: string; s?: number | null; d: any }) {
    if (typeof m.s === 'number') this.seq = m.s;
    if (m.op === 10) {
      clearInterval(this.beat);
      this.beat = setInterval(() => this.send({ op: 1, d: this.seq }), m.d.heartbeat_interval);
      this.send({ op: 2, d: { token: this.token, intents: INTENTS, properties: { os: 'browser', browser: 'hexmarch', device: 'hexmarch' } } });
    } else if (m.op === 1) this.send({ op: 1, d: this.seq });
    else if (m.op === 7) this.ws?.close(4000);
    else if (m.op === 9) this.ws?.close(4000);
    else if (m.t === 'READY') {
      this.tries = 0;
      if (!m.d.guilds?.length) this.fail('the bot is in no server: invite it to the campaign’s server');
    } else if (m.t === 'GUILD_CREATE') {
      const has = [...(m.d.channels ?? []), ...(m.d.threads ?? [])].some((c: { id: string }) => c.id === this.channel);
      if (has) { this.seen = true; this.onStatus({ state: 'listening', server: m.d.name }); }
      else if (!this.seen) this.onStatus({ state: 'no-channel' });
    } else if (m.t === 'MESSAGE_CREATE' && m.d.channel_id === this.channel) this.onPost(m.d as DiscordPost);
  }
}
