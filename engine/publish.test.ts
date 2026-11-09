import { describe, expect, it } from 'vitest';
import { PublishError, checkUpload, pointer, privateParts, publicState, publishParts, readPointer, readSnapshot, snapshot, staticServices } from './publish';

const now = new Date('2026-11-09T13:00:00Z');
const kells = {
  campaign: 'kells-1422', ruleset: 'e9mm', site: 'https://example.org/data/',
  module: { id: 'kells-1422', title: 'Kells, 1422', kind: 'campaign' }, lock: { format: 'e9-lock/1', modules: [] },
  state: { format: 'e9-campaign-state', campaign: 'kells-1422', clock: { start: '3507-05-01', hours: 8 }, revealed: { 'isle-of-mists': { hexes: [], places: ['baile-atha-troim'] } } }
};

describe('services from a static folder', () => {
  it('puts the snapshot and the pointer in the folder', () => {
    expect(staticServices('https://me.github.io/kells', 'https://script.google.com/x/exec')).toEqual({
      folder: 'https://me.github.io/kells/', read: 'https://me.github.io/kells/snapshot.json',
      post: 'https://script.google.com/x/exec', pointer: 'https://me.github.io/kells/campaign.json'
    });
  });
  it('wants web addresses', () => {
    expect(() => staticServices('ftp://x')).toThrow(PublishError);
    expect(() => staticServices('https://x.test/', 'nope')).toThrow(/post URL/);
  });
});

describe('the pointer and the snapshot', () => {
  const s = staticServices('https://me.github.io/kells/');
  it('round-trip through the readers', () => {
    const p = pointer('kells-1422', 'Kells, 1422', s, now);
    expect(readPointer(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(p.adapters).toEqual({ store: 'static', mail: 'manual' });
    const snap = snapshot(kells, null, [], now);
    expect(snap.revision).toBe(1);
    expect(readSnapshot(JSON.parse(JSON.stringify(snap)), 'kells-1422')).toEqual(snap);
  });
  it('counts revisions on from the last publish', () => {
    expect(snapshot(kells, { revision: 4 }, ['env-1'], now)).toMatchObject({ revision: 5, receipts: ['env-1'] });
  });
  it('keeps referee-only parts out', () => {
    const st = publicState({ ...kells.state, private: { x: 1 }, revealed: { 'isle-of-mists': {}, 'ref:heph': {} } });
    expect(st).not.toHaveProperty('private');
    expect(Object.keys(st.revealed as object)).toEqual(['isle-of-mists']);
  });
  it('refuses what is not theirs', () => {
    expect(() => readPointer({ format: 'x' })).toThrow(PublishError);
    expect(() => readSnapshot(snapshot(kells, null, [], now), 'other')).toThrow(/another campaign/);
  });
});

describe('what players see of the party', () => {
  it('lists each character by id, name and player only', () => {
    const st = publicState({ characters: [{ id: 'holly', name: 'Holly', player: 'dana', hp: 7, knowledge: [{ place: 'x' }] }, { nope: 1 }] });
    expect(st.characters).toEqual([{ id: 'holly', name: 'Holly', player: 'dana' }]);
  });
  it("puts each character's knowledge in its player's private part", () => {
    expect(privateParts({ holly: { format: 'k' } })).toEqual({ holly: { characters: { holly: { knowledge: { format: 'k' } } } } });
    expect(snapshot({ ...kells, knowledge: { holly: [] } }, null, [], now).private).toEqual({ holly: { characters: { holly: { knowledge: [] } } } });
  });
});

describe("the parts a snapshot reads from the referee's device", () => {
  it('takes the state, each party member\'s knowledge and the answered join requests', async () => {
    const store: Record<string, unknown> = {
      'state:kells-1422': { ...kells.state, characters: [{ id: 'holly', name: 'Holly', player: 'dana' }] },
      sheets: [{ id: 'holly', knowledge: [{ place: 'baile-atha-troim' }] }, { id: 'npc-not-in-party', knowledge: [{ x: 1 }] }],
      mail: [
        { box: 'in', answer: { kind: 'approved' }, envelope: { id: 'e1', kind: 'join', campaign: 'kells-1422' } },
        { box: 'in', envelope: { id: 'e2', kind: 'join', campaign: 'kells-1422' } },
        { box: 'in', answer: { kind: 'sent-back' }, envelope: { id: 'e3', kind: 'join', campaign: 'other' } },
        { box: 'out', answer: { kind: 'approved' }, envelope: { id: 'e4', kind: 'join', campaign: 'kells-1422' } }
      ]
    };
    const parts = await publishParts('kells-1422', async (k) => store[k]);
    expect(parts.knowledge).toEqual({ holly: [{ place: 'baile-atha-troim' }] });
    expect(parts.receipts).toEqual(['e1']);
    const snap = snapshot({ ...kells, ...parts }, { revision: 3 }, parts.receipts, now);
    expect(snap.private).toEqual({ holly: { characters: { holly: { knowledge: [{ place: 'baile-atha-troim' }] } } } });
    expect(snap.receipts).toEqual(['e1']);
  });
  it('works on a device with nothing played yet', async () => {
    expect(await publishParts('x', async () => undefined)).toEqual({ state: {}, knowledge: {}, receipts: [] });
  });
});

describe('testing the upload', () => {
  const s = staticServices('https://me.github.io/kells/');
  const expected = { pointer: pointer('kells-1422', 'Kells, 1422', s, now), snapshot: snapshot(kells, { revision: 2 }, [], now) };
  const host = (files: Record<string, unknown | number>): typeof fetch =>
    (async (url: string) => {
      const f = files[url];
      if (f === undefined) return new Response('nope', { status: 404 });
      if (typeof f === 'number') return new Response('', { status: f });
      return new Response(typeof f === 'string' ? f : JSON.stringify(f), { status: 200 });
    }) as unknown as typeof fetch;

  it('says both match, whatever the key order', async () => {
    const reordered = JSON.parse(JSON.stringify(expected.snapshot, Object.keys(expected.snapshot).reverse()));
    expect(await checkUpload(s, expected, host({ [s.pointer]: expected.pointer, [s.read]: { ...reordered, ...expected.snapshot } }))).toEqual({ pointer: 'matches', snapshot: 'matches', found: 3 });
  });
  it('tells missing, older, different and unreadable apart', async () => {
    expect(await checkUpload(s, expected, host({}))).toEqual({ pointer: 'missing', snapshot: 'missing' });
    expect(await checkUpload(s, expected, host({ [s.pointer]: { ...expected.pointer, read: 'x' }, [s.read]: { ...expected.snapshot, revision: 2 } }))).toEqual({ pointer: 'different', snapshot: 'older', found: 2 });
    expect(await checkUpload(s, expected, host({ [s.pointer]: '<html>', [s.read]: 500 }))).toEqual({ pointer: 'unreadable', snapshot: 'unreadable' });
    const blocked = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    expect(await checkUpload(s, expected, blocked)).toEqual({ pointer: 'unreadable', snapshot: 'unreadable' });
  });
});
