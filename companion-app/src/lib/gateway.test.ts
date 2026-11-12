import { afterEach, describe, expect, it, vi } from 'vitest';
import { Gateway, botAppId, inviteLink, mailAttachments, webhookInfo, type DiscordPost, type GatewayStatus } from './gateway';

function fakeSocket() {
  const sent: any[] = [];
  const ws = {
    sent,
    onmessage: null as ((ev: { data: string }) => void) | null,
    onclose: null as ((ev: { code: number }) => void) | null,
    onerror: null as (() => void) | null,
    send: (d: string) => sent.push(JSON.parse(d)),
    close: vi.fn(),
    recv(m: object) { ws.onmessage?.({ data: JSON.stringify(m) }); }
  };
  return ws;
}

function setup() {
  const sockets: ReturnType<typeof fakeSocket>[] = [];
  const posts: DiscordPost[] = [], status: GatewayStatus[] = [];
  const g = new Gateway('tok', '222', (p) => posts.push(p), (s) => status.push(s), () => { const s = fakeSocket(); sockets.push(s); return s; });
  g.start();
  return { g, sockets, posts, status };
}

afterEach(() => vi.useRealTimers());

describe('Discord gateway reader', () => {
  it('identifies, listens once the channel is seen, and passes on posts in that channel only', () => {
    vi.useFakeTimers();
    const { sockets, posts, status } = setup();
    const ws = sockets[0];
    ws.recv({ op: 10, d: { heartbeat_interval: 1000 } });
    expect(ws.sent[0]).toMatchObject({ op: 2, d: { token: 'tok' } });
    ws.recv({ op: 0, s: 1, t: 'READY', d: { guilds: [{ id: '1' }] } });
    ws.recv({ op: 0, s: 2, t: 'GUILD_CREATE', d: { name: 'Table', channels: [{ id: '222' }] } });
    expect(status.at(-1)).toEqual({ state: 'listening', server: 'Table' });
    ws.recv({ op: 0, s: 3, t: 'MESSAGE_CREATE', d: { id: 'a', channel_id: '999' } });
    ws.recv({ op: 0, s: 4, t: 'MESSAGE_CREATE', d: { id: 'b', channel_id: '222' } });
    expect(posts.map((p) => p.id)).toEqual(['b']);
    vi.advanceTimersByTime(1000);
    expect(ws.sent.at(-1)).toEqual({ op: 1, d: 4 });
  });

  it('says when the bot is in no server, or cannot see the channel', () => {
    const a = setup();
    a.sockets[0].recv({ op: 0, t: 'READY', d: { guilds: [] } });
    expect(a.status.at(-1)).toMatchObject({ state: 'failed' });
    const b = setup();
    b.sockets[0].recv({ op: 0, t: 'READY', d: { guilds: [{ id: '1' }] } });
    b.sockets[0].recv({ op: 0, t: 'GUILD_CREATE', d: { name: 'Other', channels: [{ id: '5' }] } });
    expect(b.status.at(-1)).toEqual({ state: 'no-channel' });
  });

  it('reconnects after a drop but stops on a missing intent', () => {
    vi.useFakeTimers();
    const { sockets, status } = setup();
    sockets[0].onclose?.({ code: 1006 });
    vi.advanceTimersByTime(1000);
    expect(sockets.length).toBe(2);
    sockets[1].onclose?.({ code: 4014 });
    expect(status.at(-1)).toMatchObject({ state: 'failed', reason: expect.stringContaining('Message Content Intent') });
    vi.advanceTimersByTime(120_000);
    expect(sockets.length).toBe(2);
  });

  it('stop closes and does not reconnect', () => {
    vi.useFakeTimers();
    const { g, sockets, status } = setup();
    g.stop();
    expect(sockets[0].close).toHaveBeenCalled();
    vi.advanceTimersByTime(120_000);
    expect(sockets.length).toBe(1);
    expect(status.at(-1)).toEqual({ state: 'off' });
  });

  it('finds message files on a post and the channel a webhook posts to', async () => {
    expect(mailAttachments({ id: '1', channel_id: '2', attachments: [
      { url: 'https://cdn/x.json', filename: 'kells-join-ana.json' },
      { url: 'https://cdn/p.png', filename: 'map.png', content_type: 'image/png' }
    ] })).toEqual(['https://cdn/x.json']);
    const f = vi.fn(async () => new Response(JSON.stringify({ channel_id: '222' }))) as unknown as typeof fetch;
    expect(await webhookInfo('https://discord.com/api/webhooks/1/abc', f)).toEqual({ channel: '222', guild: '' });
  });
});

describe('setting up the bot', () => {
  it('reads the application id from a token and builds the invite for the campaign server', () => {
    const token = `${btoa('123456789012345678').replace(/=+$/, '')}.Gx1abc.secretpart`;
    expect(botAppId(token)).toBe('123456789012345678');
    expect(botAppId('nonsense')).toBe('');
    const u = new URL(inviteLink('123456789012345678', '999888777666555444'));
    expect(Object.fromEntries(u.searchParams)).toEqual({ client_id: '123456789012345678', scope: 'bot', permissions: '66560', guild_id: '999888777666555444', disable_guild_select: 'true' });
  });
});
