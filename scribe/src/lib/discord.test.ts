import { describe, expect, it } from 'vitest';
import { allowedMentions, isWebhook, pingChoice, pingFrom, testPost } from './discord';

const hook = 'https://discord.com/api/webhooks/123456789012345678/abc_DEF-123';

describe('Discord setup in Scribe', () => {
  it('knows a whole webhook address', () => {
    expect(isWebhook(hook)).toBe(true);
    expect(isWebhook(' https://canary.discordapp.com/api/webhooks/1/x ')).toBe(true);
    expect(isWebhook('https://discord.com/api/webhooks/123456789012345678')).toBe(false);
    expect(isWebhook('https://example.com/api/webhooks/1/x')).toBe(false);
  });

  it('reads the ping from the choice and what was pasted', () => {
    expect(pingFrom('me', '123456789012345678')).toBe('<@123456789012345678>');
    expect(pingFrom('me', '<@!123456789012345678>')).toBe('<@123456789012345678>');
    expect(pingFrom('role', '<@&123456789012345678>')).toBe('<@&123456789012345678>');
    expect(pingFrom('role', '123456789012345678')).toBe('<@&123456789012345678>');
    expect(pingFrom('me', '<@&123456789012345678>')).toBeNull();
    expect(pingFrom('me', 'heph')).toBeNull();
    expect(pingFrom('here', 'x')).toBe('@here');
    expect(pingFrom('none', 'x')).toBe('');
    expect(pingChoice('<@&123456789012345678>')).toEqual({ kind: 'role', pasted: '123456789012345678' });
    expect(pingChoice('@here')).toEqual({ kind: 'here', pasted: '' });
    expect(pingChoice(undefined)).toEqual({ kind: 'none', pasted: '' });
  });

  it('lets a post notify only the ping', () => {
    expect(allowedMentions('<@1>')).toEqual({ parse: [], users: ['1'] });
    expect(allowedMentions('<@&2>')).toEqual({ parse: [], roles: ['2'] });
    expect(allowedMentions('@here')).toEqual({ parse: ['everyone'] });
    expect(allowedMentions('')).toEqual({ parse: [] });
  });

  it('sends a test post with the ping, and says when the webhook is gone', async () => {
    let sent: RequestInit | undefined;
    const ok = (async (_u: string, init?: RequestInit) => ((sent = init), new Response(null, { status: 204 }))) as typeof fetch;
    await testPost(hook, '<@123456789012345678>', 'Kells', ok);
    const body = JSON.parse(String(sent!.body));
    expect(body.content).toMatch(/^<@123456789012345678> Hexmarch test/);
    expect(body.allowed_mentions).toEqual({ parse: [], users: ['123456789012345678'] });
    const gone = (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;
    await expect(testPost(hook, '', 'Kells', gone)).rejects.toThrow(/doesn't know that webhook/);
    await expect(testPost('https://discord.com/api/webhooks/1', '', 'Kells', ok)).rejects.toThrow(/whole/);
  });
});
