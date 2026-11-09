// The parts of a module manifest the engine reads (WORKFLOWS.md "Dependencies", SCRIBE.md sections 2 and 3).
// Works for adventure modules (hexmarch-module/1), rules modules (hexmarch-rules/1) and campaigns alike; every other
// field is kept as it came.

import { isVersion, validRange } from './semver';

export interface FieldPatch {
  was: string; // hash of the upstream value when the patch was made (hash.ts hashValue)
  now: unknown;
}

export interface Patch {
  base: string; // module version the patch was made against
  fields: Record<string, FieldPatch>;
}

export interface Start {
  id: string;
  title?: string;
  date?: string;
  hour?: number;
  site?: string;
  scenes?: string[];
  revealed?: { places?: string[]; hexes?: string[] };
  handouts?: string[];
  levels?: [number, number];
  uses?: string[];
  note?: string;
}

export interface RulesOption {
  id: string;
  title?: string;
  ruleset?: string;
  requires?: Record<string, string>;
}

export interface Decision {
  // which module's version of a contested id wins, or "house" for the campaign's own
  pick: string;
  note?: string;
  spoiler?: boolean;
}

export interface Manifest {
  id: string;
  version: string;
  title?: string;
  kind?: string; // "rules", "campaign"; adventure modules leave it out
  format?: string;
  system?: string[];
  requires: Record<string, string>; // in order: for a campaign, the root first
  recommends: Record<string, string>;
  conflicts: Record<string, string>;
  overrides: string[];
  exclude: string[];
  decisions: Record<string, Decision>;
  patches: Record<string, Patch>;
  starts: Start[];
  options: RulesOption[];
  option?: string; // the option this module uses its root with (the first module in requires): "e9" for mm-core
  [key: string]: unknown;
}

const ID = /^[a-z0-9][a-z0-9-]*$/;

function ranges(v: unknown, field: string, id: string): Record<string, string> {
  if (v === undefined) return {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${id}: "${field}" must map module ids to version ranges.`);
  const out: Record<string, string> = {};
  for (const [k, r] of Object.entries(v as Record<string, unknown>)) {
    if (!ID.test(k)) throw new Error(`${id}: "${k}" in "${field}" is not a module id.`);
    if (typeof r !== 'string' || !validRange(r)) throw new Error(`${id}: "${r}" for ${k} in "${field}" is not a version range.`);
    out[k] = r;
  }
  return out;
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const obj = <T>(v: unknown): Record<string, T> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {});

export function readManifest(raw: unknown): Manifest {
  const m = obj<unknown>(raw);
  const id = m.id;
  if (typeof id !== 'string' || !ID.test(id)) throw new Error(`"${String(id)}" is not a module id.`);
  if (typeof m.version !== 'string' || !isVersion(m.version)) throw new Error(`${id}: "${String(m.version)}" is not a version.`);
  const system = typeof m.system === 'string' ? [m.system] : list(m.system);
  return {
    ...m,
    id,
    version: m.version,
    system,
    requires: ranges(m.requires, 'requires', id),
    recommends: ranges(m.recommends, 'recommends', id),
    conflicts: ranges(m.conflicts, 'conflicts', id),
    overrides: list(m.overrides),
    exclude: list(m.exclude),
    decisions: obj<Decision>(m.decisions),
    patches: obj<Patch>(m.patches),
    starts: Array.isArray(m.starts) ? (m.starts as Start[]) : [],
    options: Array.isArray(m.options) ? (m.options as RulesOption[]) : []
  } as Manifest;
}

// What a module needs, counting a chosen option (mm-core's "e9" option requires e9-core).
export function requiresOf(m: Manifest, option?: string): Record<string, string> {
  const opt = option ? m.options.find((o) => o.id === option) : undefined;
  if (option && !opt) throw new Error(`${m.id} has no option "${option}".`);
  return { ...m.requires, ...(opt ? ranges(opt.requires, 'requires', `${m.id}/${option}`) : {}) };
}

// The module an id belongs to: ids are <module>/<kind>/<slug> (WORKFLOWS.md "Stable ids").
export function ownerOf(id: string): string {
  return id.split('/')[0];
}
