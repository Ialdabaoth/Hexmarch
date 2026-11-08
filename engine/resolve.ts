// Resolve a module's dependencies to one exact version each, and write the lockfile
// (WORKFLOWS.md "Campaign stack": one version per module, no automatic solver, the referee decides).

import { canonical, sha256 } from './hash';
import { readManifest, requiresOf, type Manifest } from './manifest';
import { compare, maxSatisfying, satisfies } from './semver';

// Where manifests come from. `versions` lists every published version of a module (newest last or in any
// order); a host that only publishes the latest returns one.
export interface Registry {
  versions(id: string): Promise<Manifest[]>;
}

export interface Resolved {
  manifest: Manifest;
  // who asked for it, and with which range
  wanted: { by: string; range: string }[];
}

export type Problem =
  | { kind: 'missing'; id: string; wanted: { by: string; range: string }[] }
  | { kind: 'blocked'; id: string; wanted: { by: string; range: string }[]; available: string[] }
  | { kind: 'conflict'; id: string; with: string; range: string }
  | { kind: 'roots'; roots: string[] }
  | { kind: 'cycle'; path: string[] };

export interface Resolution {
  // dependency order: everything a module requires comes before it
  modules: Resolved[];
  problems: Problem[];
}

export interface ResolveOptions {
  // keep these exact versions when they still meet every range (the lockfile)
  locked?: Record<string, string>;
  // which option each module is used with ({"mm-core": "e9"})
  options?: Record<string, string>;
}

// `top` is the module being opened (a campaign, or any module in Scribe); it is not looked up in the registry.
export async function resolve(top: Manifest, registry: Registry, opts: ResolveOptions = {}): Promise<Resolution> {
  const cache = new Map<string, Manifest[]>();
  const all = async (id: string) => {
    if (!cache.has(id)) cache.set(id, await registry.versions(id));
    return cache.get(id)!;
  };
  // the top module's `option` is the option it uses its root with (the first module it requires)
  const root = Object.keys(top.requires)[0];
  const optionFor = (m: Manifest) => (m.id === top.id ? undefined : opts.options?.[m.id] ?? (m.id === root ? top.option : undefined)) || undefined;
  let chosen = new Map<string, Manifest>();
  let problems: Problem[] = [];
  let wanted = new Map<string, { by: string; range: string }[]>();

  // Settle by rounds: collect every range that the top module and the current picks ask for, re-pick each
  // module against all of them, and repeat until nothing changes (a newer pick can require something else).
  for (let round = 0; round < 50; round++) {
    wanted = new Map();
    for (const m of [top, ...chosen.values()]) {
      for (const [id, range] of Object.entries(requiresOf(m, optionFor(m)))) {
        if (!wanted.has(id)) wanted.set(id, []);
        wanted.get(id)!.push({ by: m.id, range });
      }
    }
    const next = new Map<string, Manifest>();
    problems = [];
    for (const [id, w] of wanted) {
      const versions = await all(id);
      if (!versions.length) {
        problems.push({ kind: 'missing', id, wanted: w });
        continue;
      }
      const pick = pickVersion(versions, w.map((x) => x.range), opts.locked?.[id]);
      if (!pick) {
        problems.push({ kind: 'blocked', id, wanted: w, available: versions.map((v) => v.version).sort(compare) });
        continue;
      }
      next.set(id, pick);
    }
    const same = next.size === chosen.size && [...next].every(([id, m]) => chosen.get(id)?.version === m.version);
    chosen = next;
    if (same) break;
  }

  for (const m of [top, ...chosen.values()]) {
    for (const [id, range] of Object.entries(m.conflicts)) {
      const other = id === top.id ? top : chosen.get(id);
      if (other && satisfies(other.version, range)) problems.push({ kind: 'conflict', id: m.id, with: id, range });
    }
  }

  // P2: one root. A rules module that no other chosen rules module requires is a root.
  const rules = [...chosen.values()].filter((m) => m.kind === 'rules');
  const required = new Set(rules.flatMap((m) => Object.keys(requiresOf(m, optionFor(m)))));
  const roots = rules.filter((m) => !required.has(m.id)).map((m) => m.id);
  if (roots.length > 1) problems.push({ kind: 'roots', roots });

  // dependency order, following each module's requires in the order written
  const order: Resolved[] = [];
  const done = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (done.has(id)) return;
    const m = chosen.get(id);
    if (!m) return;
    if (path.includes(id)) {
      problems.push({ kind: 'cycle', path: [...path, id] });
      return;
    }
    for (const dep of Object.keys(requiresOf(m, optionFor(m)))) visit(dep, [...path, id]);
    done.add(id);
    order.push({ manifest: m, wanted: wanted.get(id) ?? [] });
  };
  for (const id of Object.keys(top.requires)) visit(id, [top.id]);
  return { modules: order, problems };
}

function pickVersion(versions: Manifest[], rs: string[], locked?: string): Manifest | null {
  if (locked && rs.every((r) => satisfies(locked, r))) {
    const keep = versions.find((v) => v.version === locked);
    if (keep) return keep;
  }
  const best = maxSatisfying(versions.map((v) => v.version), rs);
  return best ? versions.find((v) => v.version === best)! : null;
}

export interface Lockfile {
  format: 'e9-lock/1';
  module: string; // the module this lock belongs to
  modules: { id: string; version: string; hash: string }[];
}

export async function lockfile(top: Manifest, resolution: Resolution): Promise<Lockfile> {
  return {
    format: 'e9-lock/1',
    module: top.id,
    modules: await Promise.all(resolution.modules.map(async ({ manifest: m }) => ({ id: m.id, version: m.version, hash: await sha256(canonical(m)) })))
  };
}

export function lockedVersions(lock: Lockfile | undefined): Record<string, string> {
  return Object.fromEntries((lock?.modules ?? []).map((m) => [m.id, m.version]));
}

// A registry over manifests already in hand (tests, a referee's saved modules, the Companion's built-in rules).
export function memoryRegistry(raw: unknown[]): Registry {
  const by = new Map<string, Manifest[]>();
  for (const r of raw) {
    const m = readManifest(r);
    if (!by.has(m.id)) by.set(m.id, []);
    by.get(m.id)!.push(m);
  }
  return { versions: async (id) => by.get(id) ?? [] };
}
