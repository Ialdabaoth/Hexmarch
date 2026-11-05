import { describe, expect, it } from 'vitest';
import { creatureNotes, creatureTemplate, loadModuleCreatures, usualCount } from './module-creatures';
import { newCreature } from '../bestiary/creature';
import type { SavedModule } from './modules';

const mod: SavedModule = {
  base: 'https://example.org/site/',
  id: 'isle-of-mists',
  path: 'modules/isle-of-mists/',
  fetchedAt: 0,
  manifest: {
    format: 'mm-module/1', id: 'isle-of-mists', title: 'Beyond the Pale', version: '0.3.5', license: 'CC0-1.0',
    sites: [{ slug: 'baile-atha-troim', name: 'Baile Átha Troim' }],
    encounters: 'encounters.json', bestiary: { mm: 'bestiary/mm.json' }
  }
};

const files: Record<string, unknown> = {
  'https://example.org/site/modules/isle-of-mists/encounters.json': {
    encounters: {
      creatures: {
        guard: { name: 'Guard', kind: 'npc', is: 'warrior', troupe: { keep: 50 }, lair: { site: 'baile-atha-troim' } },
        sergeant: { name: 'Sergeant-at-Arms', kind: 'npc', lair: { site: 'baile-atha-troim' } },
        ghost: { name: 'Grey Lady', kind: 'monster' }
      }
    }
  },
  'https://example.org/site/modules/isle-of-mists/bestiary/mm.json': {
    format: 'e9-bestiary/1',
    creatures: {
      guard: { from: 'blank', replace: { level: 1, armor: '3', hp: '1d6+1', attacks: ['Spear (2d6 pierce)'], talents: ['alertness'] } },
      sergeant: { from: 'guard', replace: { level: 3 }, adjust: { abilities: { str: 1 } } }
    }
  }
};

const fetcher = (async (url: string) =>
  url in files ? new Response(JSON.stringify(files[url])) : new Response('', { status: 404 })) as unknown as typeof fetch;

describe('module creatures', () => {
  it('reads the fiction and the ruleset stat blocks the manifest names', async () => {
    const cs = await loadModuleCreatures(mod, 'mm', fetcher);
    expect(cs.map((c) => c.name)).toEqual(['Grey Lady', 'Guard', 'Sergeant-at-Arms']);
    const guard = cs.find((c) => c.id === 'guard')!;
    expect(guard).toMatchObject({ key: 'isle-of-mists/guard', kind: 'npc', is: 'warrior', home: 'Baile Átha Troim', moduleTitle: 'Beyond the Pale' });
    expect(usualCount(guard)).toBe(50);
    expect(cs.find((c) => c.id === 'ghost')!.template).toBeUndefined();
  });

  it('gives nothing for a ruleset without stats, and nothing for a module without creatures', async () => {
    const cs = await loadModuleCreatures(mod, 'ose', fetcher);
    expect(cs.every((c) => !c.template)).toBe(true);
    expect(await loadModuleCreatures({ ...mod, path: 'elsewhere/', manifest: { ...mod.manifest, encounters: undefined } }, 'mm', fetcher)).toEqual([]);
  });

  it('builds a copy named as the fiction names it, through another module creature', async () => {
    const cs = await loadModuleCreatures(mod, 'mm', fetcher);
    const sgt = cs.find((c) => c.id === 'sergeant')!;
    const c = newCreature(creatureTemplate(sgt), 1, { creature: (id) => sgt.others[id] }, () => 0.5);
    expect(c.name).toBe('Sergeant-at-Arms');
    expect(c.stats.level).toBe(3);
    expect(c.stats.armor).toBe('3');
    expect(c.stats.abilities.str).toBe(1);
    expect(c.stats.attacks[0]).toMatchObject({ name: 'Spear', damage: '2d6' });
    expect(creatureNotes(cs.find((x) => x.id === 'guard')!)).toBe('Warrior. Lives at Baile Átha Troim. From Beyond the Pale.');
  });
});
