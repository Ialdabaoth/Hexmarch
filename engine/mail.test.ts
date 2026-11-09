import { describe, expect, it } from 'vitest';
import { MailError, envelope, readEnvelope, requestStatus } from './mail';

const NOW = new Date('2026-11-09T14:00:00Z');

describe('e9-mail envelopes', () => {
  it('reads back what it writes', () => {
    const e = envelope({ campaign: 'kells', kind: 'join', from: { role: 'player', character: 'holly', name: 'Ann' }, to: 'referee', body: { character: { id: 'holly' } } }, NOW);
    expect(e.format).toBe('e9-mail');
    expect(e.id).toBeTruthy();
    expect(readEnvelope(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });

  it('refuses what it cannot read', () => {
    expect(() => readEnvelope({ format: 'x' })).toThrow(MailError);
    expect(() => readEnvelope({ format: 'e9-mail', version: 2 })).toThrow(/newer app/);
    expect(() => readEnvelope({ format: 'e9-mail', version: 1, kind: 'gossip', id: 'a', campaign: 'k' })).toThrow(/gossip/);
  });

  it("follows a request: sent, received, live, or sent back", () => {
    const e = { id: 'r1', from: { role: 'player' as const, character: 'holly' } };
    expect(requestStatus(e, null)).toBe('sent');
    expect(requestStatus(e, { receipts: ['r1'], state: { characters: [] } })).toBe('received');
    expect(requestStatus(e, { receipts: [], state: { characters: [] } }, true)).toBe('sent-back');
    expect(requestStatus(e, { receipts: ['r1'], state: { characters: [{ id: 'holly' }] } }, true)).toBe('live');
  });
});

describe('messages as links', () => {
  it('reads back a link it wrote, and keeps it short', async () => {
    const { messageLink, readMessageHash, LINK_LIMIT } = await import('./mail');
    const e = envelope({ campaign: 'kells-1422', kind: 'update', from: { role: 'referee' }, to: 'referee', body: { receipts: ['r1'], knowledge: { holly: [{ creature: 'abbot', name: 'Abbot Fintan' }] } } }, NOW);
    const link = await messageLink('https://x.test/Hexmarch/scribe/#old', e);
    expect(link.startsWith('https://x.test/Hexmarch/scribe/#m=')).toBe(true);
    expect(link.length).toBeLessThan(LINK_LIMIT);
    expect(await readMessageHash(new URL(link).hash)).toEqual(e);
    expect(await readMessageHash('#place=site:x')).toBeNull();
  });

  it('refuses a damaged link', async () => {
    const { decodeMessage } = await import('./mail');
    await expect(decodeMessage('not-a-message')).rejects.toThrow(MailError);
  });
});
