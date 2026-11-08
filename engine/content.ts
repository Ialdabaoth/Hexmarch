// Stitch modules' content into one world: later layers win where they declare an override, undeclared
// clashes go to the referee, exclusions slice content out, and field patches carry a campaign's edits to
// someone else's module (WORKFLOWS.md "Campaign stack", SCRIBE.md section 3).

import { hashValue } from './hash';
import { ownerOf, type Decision, type Manifest, type Patch } from './manifest';

export type Entry = Record<string, unknown>;

export interface Layer {
  manifest: Manifest;
  // every id this module defines or changes: its own ids and the ones it overrides
  entries: Record<string, Entry>;
}

export interface Placed {
  value: Entry;
  from: string; // the module whose version is used ("house" values come from the top module)
}

export interface Collision {
  id: string;
  modules: string[]; // every module that defines the id, in stack order
  decided?: Decision; // the referee's decision, when there is one
}

export interface StaleField {
  id: string;
  field: string;
  base: string; // version the patch was made against
  upstream: unknown; // the author's value now
  campaign: unknown; // the patch's value
}

export interface World {
  entries: Record<string, Placed>;
  collisions: Collision[]; // undeclared clashes, decided or not
  excluded: string[];
  stale: StaleField[]; // patches whose field the author has since changed: shown upstream until decided
  orphanPatches: string[]; // patches on ids no module defines any more
}

// "<id>", "<module>/*", "<module>/<kind>/*" or "*/<kind>/*".
export function excludes(patterns: string[], id: string): boolean {
  return patterns.some((p) => {
    if (p === id) return true;
    if (!p.endsWith('/*')) return false;
    const parts = p.slice(0, -2).split('/');
    const have = id.split('/');
    return parts.every((x, i) => x === '*' || x === have[i]);
  });
}

// `layers` in stack order (the root first, the top module last). The top module's own exclusions,
// decisions and patches are applied.
export async function stitch(layers: Layer[]): Promise<World> {
  const top = layers[layers.length - 1]?.manifest;
  const placed: Record<string, Placed & { all: string[]; quiet: boolean }> = {};
  for (const { manifest: m, entries } of layers) {
    for (const [id, value] of Object.entries(entries)) {
      const prev = placed[id];
      if (!prev) {
        placed[id] = { value, from: m.id, all: [m.id], quiet: true };
        continue;
      }
      // a declared override (or the owner restating its own id) is applied quietly; anything else is a clash
      const declared = m.overrides.includes(id) || ownerOf(id) === m.id;
      placed[id] = { value, from: m.id, all: [...prev.all, m.id], quiet: prev.quiet && declared };
    }
  }
  const collisions: Collision[] = [];
  const decisions = top?.decisions ?? {};
  for (const [id, p] of Object.entries(placed)) {
    if (p.quiet) continue;
    const d = decisions[id];
    collisions.push({ id, modules: p.all, ...(d ? { decided: d } : {}) });
    if (!d) continue;
    const pick = d.pick === 'house' ? top!.id : d.pick;
    const layer = layers.find((l) => l.manifest.id === pick && id in l.entries);
    if (layer) placed[id] = { ...p, value: layer.entries[id], from: d.pick === 'house' ? 'house' : pick };
  }

  const excluded: string[] = [];
  const entries: Record<string, Placed> = {};
  for (const [id, p] of Object.entries(placed)) {
    if (top && excludes(top.exclude, id)) excluded.push(id);
    else entries[id] = { value: p.value, from: p.from };
  }

  const { stale, orphans } = await applyPatches(entries, top?.patches ?? {});
  return { entries, collisions, excluded, stale, orphanPatches: orphans };
}

// Apply field patches in place. A field whose upstream value no longer hashes to `was` is left as the
// author has it and reported, so the referee decides (the update checker's "needs a decision").
export async function applyPatches(entries: Record<string, Placed>, patches: Record<string, Patch>) {
  const stale: StaleField[] = [];
  const orphans: string[] = [];
  for (const [id, patch] of Object.entries(patches)) {
    const e = entries[id];
    if (!e) {
      orphans.push(id);
      continue;
    }
    const value = { ...e.value };
    for (const [field, fp] of Object.entries(patch.fields ?? {})) {
      if ((await hashValue(e.value[field])) === fp.was) value[field] = fp.now;
      else stale.push({ id, field, base: patch.base, upstream: e.value[field], campaign: fp.now });
    }
    entries[id] = { value, from: e.from };
  }
  return { stale, orphans };
}

// The patch that turns `upstream` (the module's entry at version `base`) into `edited`: only the fields
// that differ. A field removed in the edit is stored as null.
export async function makePatch(base: string, upstream: Entry, edited: Entry): Promise<Patch | null> {
  const fields: Patch['fields'] = {};
  for (const k of new Set([...Object.keys(upstream), ...Object.keys(edited)])) {
    const before = await hashValue(upstream[k]);
    if (before !== (await hashValue(edited[k]))) fields[k] = { was: before, now: edited[k] ?? null };
  }
  return Object.keys(fields).length ? { base, fields } : null;
}
