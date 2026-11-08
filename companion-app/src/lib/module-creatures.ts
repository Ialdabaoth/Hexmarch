// Creatures a saved module publishes (modules/CREATURES_FORMAT.md): the fiction layer in
// encounters.json and one mechanics layer per ruleset in bestiary/<ruleset>.json, both
// named by the module's manifest. The referee picks one and it is copied into the
// campaign like any other creature, so later module versions never touch it.

import { normalisePath, viewerUrl, type SavedModule } from './modules';
import type { CreatureKind, CreatureTemplate } from '../bestiary/creature';

export interface ModuleCreature {
  // "<module id>/<creature id>", unique across modules.
  key: string;
  moduleId: string;
  moduleTitle: string;
  id: string;
  name: string;
  kind: CreatureKind;
  is?: string;
  // Group sizes by situation, e.g. {"keep": 50}.
  troupe?: Record<string, string | number>;
  // Where they live: a site's name when the module's map has it.
  home?: string;
  description?: string;
  // The ruleset's stat block for this creature; missing when the module has none for it.
  template?: CreatureTemplate;
  // The module's other stat blocks, for templates that start from another creature.
  others: Record<string, CreatureTemplate>;
}

interface Fiction {
  name?: string;
  kind?: string;
  is?: string;
  troupe?: Record<string, string | number>;
  lair?: { site?: string; hex?: string };
  description?: string;
}

const KINDS: CreatureKind[] = ['monster', 'npc', 'beast'];

// The files the manifest names, or the usual names for a module saved before its manifest
// listed them. A module without creatures, or without stats for this ruleset, gives fewer.
export async function loadModuleCreatures(mod: SavedModule, ruleset: string, fetcher: typeof fetch = fetch): Promise<ModuleCreature[]> {
  const m = mod.manifest as Record<string, unknown>;
  const folder = viewerUrl(mod.base, mod.path ?? `${mod.id}/`);
  const get = async (rel: string): Promise<unknown> => {
    const file = normalisePath(rel).replace(/\/$/, '');
    const res = await fetcher(folder + file, { cache: 'no-cache' });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`Could not read ${file} from ${mod.manifest.title} (${res.status}).`);
    return res.json();
  };
  const enc = (await get(typeof m.encounters === 'string' ? m.encounters : 'encounters.json')) as { encounters?: { creatures?: Record<string, Fiction> } } | undefined;
  const fiction = enc?.encounters?.creatures;
  if (!fiction) return [];
  const named = ((m.bestiary ?? {}) as Record<string, unknown>)[ruleset];
  const mech = (await get(typeof named === 'string' ? named : `bestiary/${ruleset}.json`)) as { creatures?: Record<string, CreatureTemplate> } | undefined;
  return moduleCreatures(mod, fiction, mech?.creatures ?? {});
}

export function moduleCreatures(mod: SavedModule, fiction: Record<string, Fiction>, mechanics: Record<string, CreatureTemplate>): ModuleCreature[] {
  const sites = new Map(
    ((mod.manifest as Record<string, unknown>).sites as { slug: string; name: string }[] | undefined ?? []).map((s) => [s.slug, s.name])
  );
  return Object.entries(fiction)
    .map(([id, f]) => ({
      key: `${mod.id}/${id}`,
      moduleId: mod.id,
      moduleTitle: mod.manifest.title,
      id,
      name: f.name ?? id,
      kind: KINDS.includes(f.kind as CreatureKind) ? (f.kind as CreatureKind) : 'monster',
      ...(f.is ? { is: f.is } : {}),
      ...(f.troupe ? { troupe: f.troupe } : {}),
      ...(f.lair?.site ? { home: sites.get(f.lair.site) ?? f.lair.site } : {}),
      ...(f.description ? { description: f.description } : {}),
      ...(mechanics[id] ? { template: mechanics[id] } : {}),
      others: mechanics
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The template stored with the copy: the module's stat block, named as the fiction names it.
export function creatureTemplate(c: ModuleCreature): CreatureTemplate {
  const t = c.template ?? { from: 'blank' };
  return { ...structuredClone(t), replace: { ...(t.replace ?? {}), name: c.name } };
}

// A troupe's usual size when it is a plain number (dice are left to the referee).
export function usualCount(c: ModuleCreature): number | undefined {
  const n = Object.values(c.troupe ?? {})[0];
  return typeof n === 'number' ? n : typeof n === 'string' && /^\d+$/.test(n) ? Number(n) : undefined;
}

// The notes a new copy starts with: who they are and where they live.
export function creatureNotes(c: ModuleCreature): string {
  return [c.is ? `${c.is[0].toUpperCase()}${c.is.slice(1)}.` : '', c.home ? `Lives at ${c.home}.` : '', c.description ?? '', `From ${c.moduleTitle}.`]
    .filter(Boolean)
    .join(' ');
}
