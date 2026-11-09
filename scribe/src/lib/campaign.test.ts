import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCampaign, campaignId, describeProblem, startsOf } from './campaign';
import { plainVersion, siteModule } from './data';
import { rootChoices } from './rules';

const json = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const e9core = json('../../../modules/e9-core/module.json');
const mmcore = { format: 'e9-rules/1', kind: 'rules', id: 'mm-core', title: 'Materia Mundi', version: '0.1.0', ruleset: 'mm', options: [{ id: 'e9', title: 'Materia Mundi for E9', ruleset: 'e9mm', requires: { 'e9-core': '^0.1' } }] };
const RULES = [e9core, mmcore];

// the built Beyond the Pale manifest, cut down to what Scribe reads
const btp = siteModule('modules/isle-of-mists/', {
  format: 'mm-module/1', id: 'isle-of-mists', title: 'Beyond the Pale: The Isle of Mists, 1422', version: 'v0.4.11+d6e2247 · 2026-11-08', semver: '0.4.11',
  books: [{ id: 'B2', title: 'The Pale Keep' }, { id: 'B3', title: 'The Palace of Silver and Crimson' }, { id: 'B5', title: 'Dinn Ríg' }, { id: 'B4', title: 'Almhain' }],
  sites: [{ slug: 'baile-atha-troim', name: 'Baile Átha Troim' }],
  starts: [{ id: 'arrive-at-the-keep', title: 'Arriving in the Pale', date: '3507-05-01', hour: 8, site: 'Baile Átha Troim', scenes: ['keep-arrival', 'keep-east-gate'], revealed: { places: ['Baile Átha Troim'] }, levels: [1, 3], uses: ['B2'] }]
});
const roots = rootChoices(RULES);
const mmE9 = roots.find((r) => r.module === 'mm-core' && r.option === 'e9')!;

describe('reading the site', () => {
  it('takes the plain version from the build, or out of the display stamp', () => {
    expect(plainVersion({ semver: '0.4.11', version: 'v0.4.11+abc · x' })).toBe('0.4.11');
    expect(plainVersion({ version: 'v0.4.10+abc1234 · 2026-11-07' })).toBe('0.4.10');
    expect(btp.raw.version).toBe('0.4.11');
  });
  it('offers each rules module and each of its options as a root', () => {
    expect(roots.map((r) => `${r.module}/${r.option}:${r.ruleset}`)).toEqual(['e9-core/:e9', 'mm-core/:mm', 'mm-core/e9:e9mm']);
  });
});

describe('a new campaign from Beyond the Pale', () => {
  it('writes the campaign module, lockfile and first state from the keep start', async () => {
    const b = await buildCampaign({ title: 'Kells, 1422', root: mmE9, modules: ['isle-of-mists'], start: { module: 'isle-of-mists', id: 'arrive-at-the-keep' } }, [btp], RULES, new Date('2026-11-08T22:00:00Z'));
    expect(b.problems).toEqual([]);
    expect(b.manifest).toMatchObject({
      id: 'kells-1422', kind: 'campaign', version: '0.1.0', option: 'e9',
      requires: { 'mm-core': '^0.1.0', 'isle-of-mists': '^0.4.11' },
      start: { module: 'isle-of-mists', id: 'arrive-at-the-keep' },
      exclude: ['isle-of-mists/book/b3', 'isle-of-mists/book/b5', 'isle-of-mists/book/b4']
    });
    expect(Object.keys(b.manifest.requires as object)[0]).toBe('mm-core'); // the root comes first
    expect(b.lock.modules.map((m) => `${m.id}@${m.version}`)).toEqual([`e9-core@${e9core.version}`, 'mm-core@0.1.0', 'isle-of-mists@0.4.11']);
    expect(b.state).toMatchObject({
      format: 'e9-campaign-state', version: 1, campaign: 'kells-1422', revision: 1,
      rules: { ruleset: 'e9mm', module: 'mm-core', option: 'e9', version: '0.1.0' },
      clock: { start: '3507-05-01', hours: 8 }, party: null,
      revealed: { 'isle-of-mists': { hexes: [], places: ['baile-atha-troim'] } },
      session: { number: 0, open: false }, characters: []
    });
  });

  it('takes a hand-placed start', async () => {
    const b = await buildCampaign({ title: 'Test', root: roots[0], modules: ['isle-of-mists'], start: { module: 'isle-of-mists', date: '3507-09-29', hour: 18, site: 'baile-atha-troim' } }, [btp], RULES);
    expect(b.manifest.exclude).toBeUndefined();
    expect(b.state).toMatchObject({ clock: { start: '3507-09-29', hours: 18 }, revealed: { 'isle-of-mists': { places: ['baile-atha-troim'] } } });
  });

  it('explains what blocks a campaign', async () => {
    const needsMore = siteModule('m/', { id: 'needs', title: 'Needs', semver: '1.0.0', requires: { 'mm-core': '^2.0' } });
    const b = await buildCampaign({ title: 'X', root: mmE9, modules: ['needs'], start: null }, [needsMore], RULES);
    expect(b.problems.map(describeProblem)).toEqual(['No version of mm-core fits every request (x wants ^0.1.0; needs wants ^2.0). Published: 0.1.0.']);
  });

  it('names campaigns safely', () => {
    expect(campaignId('  Na Fianna: Ríocht! ')).toBe('na-fianna-riocht');
    expect(campaignId('???')).toBe('campaign');
    expect(startsOf(btp)).toHaveLength(1);
  });
});
