import { afterEach, describe, expect, it, vi } from 'vitest';
import { addMail, answer, joinLine, joinRequest, mailFileName, post, readMailFile, sendBack } from './mail';
import { editPost } from './discord';

const NOW = new Date('2026-11-09T14:00:00Z');

describe('requests between player and referee', () => {
  it('sends a character to join, and the referee sends it back with a note', () => {
    const join = joinRequest('kells-1422', { id: 'holly' }, { id: 'holly', flavor: { name: 'Holly' } }, 'Ann', undefined, NOW);
    expect(join).toMatchObject({ campaign: 'kells-1422', kind: 'join', to: 'referee', from: { role: 'player', character: 'holly', name: 'Ann' } });
    expect(mailFileName(join, 'Holly Ó Briain')).toBe('kells-1422-join-holly-briain.json');
    const back = sendBack(join, 'Pick a second language', NOW);
    expect(back).toMatchObject({ kind: 'sent-back', to: 'holly', re: join.id, body: { note: 'Pick a second language' } });
    expect(readMailFile([join, back]).map((e) => e.kind)).toEqual(['join', 'sent-back']);
  });

  it('keeps each message once, and records the answer', () => {
    const join = joinRequest('k', { id: 'a' }, {}, '', undefined, NOW);
    let list = addMail([], { envelope: join, box: 'in' });
    expect(addMail(list, { envelope: join, box: 'in' })).toBe(list);
    list = answer(list, join.id, { kind: 'approved', at: NOW.toISOString() });
    expect(list[0].answer?.kind).toBe('approved');
  });
});

describe('a Discord channel as the mailbox', () => {
  afterEach(() => vi.unstubAllGlobals());
  const hook = 'https://discord.com/api/webhooks/123/abc-DEF';

  it('posts a readable line with the request attached, and keeps the post id', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: '999' }), { status: 200 });
    });
    const join = joinRequest('kells-1422', { id: 'holly' }, { id: 'holly' }, 'Dana', 'p-kells', NOW);
    expect(await post(hook, join, joinLine('Dana', 'Holly', 'sent'), 'Holly')).toBe('999');
    expect(calls[0].url).toBe(`${hook}?wait=true`);
    const fd = calls[0].init.body as FormData;
    expect(JSON.parse(String(fd.get('payload_json'))).content).toBe('⏳ Dana asks to join with Holly (waiting for the referee)');
    const file = fd.get('files[0]') as File;
    expect(file.name).toBe('kells-1422-join-holly.json');
    expect(JSON.parse(await file.text()).id).toBe(join.id);
  });

  it('mentions only the campaign\'s ping, so Discord notifies the referee', async () => {
    const bodies: string[] = [];
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => (bodies.push(String((init.body as FormData).get('payload_json'))), new Response('{"id":"1"}')));
    const join = joinRequest('kells-1422', { id: 'holly' }, { id: 'holly' }, 'Dana', undefined, NOW);
    await post(hook, join, 'line', 'Holly', '<@&123456789012345678>');
    await post(hook, join, 'line', 'Holly', '<@123456789012345678>');
    expect(JSON.parse(bodies[0])).toMatchObject({ content: '<@&123456789012345678> line', allowed_mentions: { parse: [], roles: ['123456789012345678'] } });
    expect(JSON.parse(bodies[1]).allowed_mentions).toEqual({ parse: [], users: ['123456789012345678'] });
  });

  it('edits its own post as the request moves on', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response('{}', { status: 200 })));
    await editPost(hook, '999', joinLine('Dana', 'Holly', 'live'));
    expect([calls[0].url, calls[0].init.method]).toEqual([`${hook}/messages/999`, 'PATCH']);
    expect(JSON.parse(String(calls[0].init.body)).content).toBe('✅ Dana joined with Holly');
    expect(joinLine('', '', 'sent-back')).toBe('↩️ A player asks to join with a character: sent back with a note');
  });

  it('still posts plain JSON to any other mailbox', async () => {
    let body = '';
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => ((body = String(init.body)), new Response('ok', { status: 200 })));
    const join = joinRequest('kells-1422', { id: 'holly' }, { id: 'holly' }, 'Dana', undefined, NOW);
    expect(await post('https://script.google.com/macros/s/x/exec', join)).toBeUndefined();
    expect(JSON.parse(body).id).toBe(join.id);
  });
});
