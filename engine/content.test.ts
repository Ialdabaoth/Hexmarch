import { describe, expect, it } from 'vitest';
import { excludes, makePatch, stitch, type Layer } from './content';
import { hashValue } from './hash';
import { readManifest } from './manifest';
import { siteEntries, slug } from './sites';

const layer = (m: Record<string, unknown>, entries: Layer['entries']): Layer => ({ manifest: readManifest({ version: '1.0.0', ...m }), entries });

describe('stitch', () => {
  const core = layer({ id: 'e9-core' }, { 'e9-core/spell/sleep': { name: 'Sleep', circle: 1 }, 'e9-core/creature/goblin': { name: 'Goblin', hd: 1 } });

  it('applies declared overrides quietly, later layers winning', async () => {
    const btp = layer({ id: 'btp', overrides: ['e9-core/creature/goblin'] }, { 'e9-core/creature/goblin': { name: 'Goblin', hd: 2 } });
    const w = await stitch([core, btp]);
    expect(w.collisions).toEqual([]);
    expect(w.entries['e9-core/creature/goblin']).toEqual({ value: { name: 'Goblin', hd: 2 }, from: 'btp' });
  });

  it('sends an undeclared clash to the referee, and applies the decision', async () => {
    const a = layer({ id: 'a' }, { 'e9-core/spell/sleep': { name: 'Sleep', circle: 2 } });
    const camp = (pick: string) => layer({ id: 'camp', kind: 'campaign', decisions: { 'e9-core/spell/sleep': { pick } } }, {});
    expect((await stitch([core, a])).collisions).toEqual([{ id: 'e9-core/spell/sleep', modules: ['e9-core', 'a'] }]);
    const w = await stitch([core, a, camp('e9-core')]);
    expect(w.entries['e9-core/spell/sleep'].value).toEqual({ name: 'Sleep', circle: 1 });
    expect(w.collisions[0].decided).toEqual({ pick: 'e9-core' });
  });

  it('slices out excluded ids and groups', async () => {
    expect(excludes(['btp/site/*'], 'btp/site/keep')).toBe(true);
    expect(excludes(['*/spell/*'], 'e9-core/spell/sleep')).toBe(true);
    expect(excludes(['e9-core/spell/sleep'], 'e9-core/spell/sleepy')).toBe(false);
    const w = await stitch([core, layer({ id: 'camp', exclude: ['e9-core/spell/*'] }, {})]);
    expect(w.excluded).toEqual(['e9-core/spell/sleep']);
    expect(Object.keys(w.entries)).toEqual(['e9-core/creature/goblin']);
  });
});

describe('field patches', () => {
  it('stores only what changed, applies it, and flags it once the author changes that field', async () => {
    const upstream = { name: 'Baile Átha Troim', kind: 'castle', note: 'the keep' };
    const patch = (await makePatch('0.4.11', upstream, { ...upstream, note: 'our keep' }))!;
    expect(Object.keys(patch.fields)).toEqual(['note']);
    expect(patch.fields.note.was).toBe(await hashValue('the keep'));

    const mod = (note: string) => layer({ id: 'btp' }, { 'btp/site/baile-atha-troim': { ...upstream, note } });
    const camp = layer({ id: 'camp', patches: { 'btp/site/baile-atha-troim': patch, 'btp/site/gone': patch } }, {});
    const ok = await stitch([mod('the keep'), camp]);
    expect(ok.entries['btp/site/baile-atha-troim'].value.note).toBe('our keep');
    expect(ok.stale).toEqual([]);
    expect(ok.orphanPatches).toEqual(['btp/site/gone']);

    // the author fixed the note upstream: keep theirs on screen and ask
    const later = await stitch([mod('the Pale Keep'), camp]);
    expect(later.entries['btp/site/baile-atha-troim'].value.note).toBe('the Pale Keep');
    expect(later.stale).toEqual([{ id: 'btp/site/baile-atha-troim', field: 'note', base: '0.4.11', upstream: 'the Pale Keep', campaign: 'our keep' }]);
  });

  it('returns no patch when nothing changed', async () => {
    expect(await makePatch('1.0.0', { a: 1 }, { a: 1 })).toBeNull();
  });
});

describe('sites', () => {
  it('slugs place names the way the module build does', () => {
    expect(slug('Baile Átha Troim')).toBe('baile-atha-troim');
    expect(slug("Cnoc na Teamhrach")).toBe('cnoc-na-teamhrach');
  });
  it('gives each place one id across regions', () => {
    const m = { id: 'isle-of-mists', regions: { 'an-mhi': { sites: [['Baile Átha Troim', 53.555, -6.79, 'castle']] }, 'an-phail': { sites: [['Baile Átha Troim', 53.5545, -6.7896, 'castle', 'the keep']] } } };
    expect(siteEntries(m)).toEqual({ 'isle-of-mists/site/baile-atha-troim': { name: 'Baile Átha Troim', lat: 53.555, lon: -6.79, kind: 'castle', region: 'an-mhi' } });
  });
});
