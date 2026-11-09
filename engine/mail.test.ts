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
