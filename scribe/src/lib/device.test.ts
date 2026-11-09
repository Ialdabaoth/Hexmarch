import { describe, expect, it } from 'vitest';
import { campaignLink, scribeRecord } from './device';
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
