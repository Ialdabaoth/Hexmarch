import { describe, expect, it } from 'vitest';
import { campaignLink, campaignMessage, playFor, scribeRecord, withRefereeInvitation, type SavedCampaign } from './device';
import type { Built } from './campaign';

describe('saving on this device', () => {
  it('writes the record the Companion opens by scribe:<id>', () => {
    (globalThis as { location?: unknown }).location ??= { href: 'https://example.org/Hexmarch/scribe/' };
    const built = { manifest: { id: 'kells-1422', title: 'Kells 1422' }, lock: { format: 'e9-lock/1', modules: [] }, state: {}, problems: [] } as unknown as Built;
    const r = scribeRecord(built, { module: 'mm-core', option: 'e9', ruleset: 'e9mm', title: '', version: '0.1.0' }, 'https://example.org/data', new Date('2026-11-08T23:00:00Z'));
    expect(r).toMatchObject({ format: 'e9-scribe-campaign', version: 1, id: 'kells-1422', site: 'https://example.org/data/', ruleset: 'e9mm', saved: '2026-11-08T23:00:00.000Z' });
    expect(campaignLink(r.id)).toBe('scribe:kells-1422');
  });
});

describe("the creator's Referee invitation", () => {
  const now = new Date('2026-11-09T12:30:00Z');
  it('is added once, beside the invitations already there', () => {
    const player = { id: 'p1', url: 'https://example.org/c/other.json', role: 'player', character: 'sheet-1', added: '2026-11-01T00:00:00.000Z' };
    const once = withRefereeInvitation([player], 'scribe:kells-1422', 'Kells 1422', now, () => 'r1');
    expect(once).toEqual([player, { id: 'r1', url: 'scribe:kells-1422', role: 'referee', name: 'Kells 1422', added: '2026-11-09T12:30:00.000Z' }]);
    expect(withRefereeInvitation(once, 'scribe:kells-1422', 'Kells 1422', now, () => 'r2')).toBe(once);
  });
  it('starts a list when there is none', () => {
    expect(withRefereeInvitation(undefined, 'scribe:x', 'X', now, () => 'r')).toHaveLength(1);
  });
});

describe('apps talk by links', () => {
  const now = new Date('2026-11-09T16:30:00Z');
  it('hands the Companion the record, and the state only when Scribe wrote it', () => {
    const rec = { id: 'kells-1422', manifest: { title: 'Kells 1422' } } as unknown as SavedCampaign;
    const m = campaignMessage(rec, { revision: 1 }, now);
    expect(m).toMatchObject({ format: 'e9-mail', kind: 'campaign', campaign: 'kells-1422', from: { role: 'referee' }, to: 'referee', body: { record: rec, state: { revision: 1 } } });
    expect(campaignMessage(rec, undefined, now).body).toEqual({ record: rec });
  });
  it('publishes the play the Companion sent, unless this device holds newer', async () => {
    const sent = { state: { revision: 5, characters: [] }, knowledge: { holly: [] }, receipts: ['j1'], at: '' };
    const keys = (here: number): Record<string, unknown> => ({ 'play:k': sent, 'state:k': { revision: here, characters: [] } });
    const get = (k: Record<string, unknown>) => async (key: string) => k[key];
    expect(await playFor('k', get(keys(4)))).toEqual({ state: sent.state, knowledge: sent.knowledge, receipts: ['j1'] });
    expect((await playFor('k', get(keys(6)))).state).toEqual({ revision: 6, characters: [] });
    expect((await playFor('k', get({ 'state:k': { revision: 2 } }))).state).toEqual({ revision: 2 });
  });
});
