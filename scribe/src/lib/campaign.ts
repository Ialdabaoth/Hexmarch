// Steps 1–3 of the campaign view (SCRIBE.md section 1): from a root and some modules to the campaign module, its
// lockfile and its first state file (STATE_FORMAT.md). A campaign has no start of its own (Heph 2026-11-10): its
// start positions are every start of its modules, and each party picks one when the Atlas's Referee mode makes it.

import { lockfile, memoryRegistry, readManifest, resolve, slug, type Lockfile, type Problem, type Start } from '../../../engine';
import type { RootChoice } from './rules';
import type { SiteModule } from './data';

export interface Choices {
  title: string;
  root: RootChoice;
  modules: string[];
}

export interface Built {
  manifest: Record<string, unknown>;
  lock: Lockfile;
  state: Record<string, unknown>;
  problems: Problem[];
}

export function campaignId(title: string): string {
  return slug(title) || 'campaign';
}

// "^0.4.11": this version or any later one that the version rules say is compatible.
const caret = (v: string) => `^${v}`;

export function startsOf(m: SiteModule | undefined): Start[] {
  return m && Array.isArray(m.raw.starts) ? (m.raw.starts as Start[]) : [];
}

export async function buildCampaign(c: Choices, site: SiteModule[], rules: unknown[], now = new Date()): Promise<Built> {
  const id = campaignId(c.title);
  const picked = c.modules.map((m) => site.find((s) => s.id === m)).filter((m): m is SiteModule => !!m);

  const manifest: Record<string, unknown> = {
    id,
    title: c.title.trim() || 'New campaign',
    version: '0.1.0',
    kind: 'campaign',
    license: 'LicenseRef-Private',
    requires: { [c.root.module]: caret(c.root.version), ...Object.fromEntries(picked.map((m) => [m.id, caret(m.version)])) },
    ...(c.root.option ? { option: c.root.option } : {}),
    created: now.toISOString().slice(0, 10)
  };

  const top = readManifest(manifest);
  const resolution = await resolve(top, memoryRegistry([...rules, ...picked.map((m) => m.raw)]));
  const lock = await lockfile(top, resolution);

  const state = {
    format: 'hexmarch-campaign-state',
    version: 1,
    campaign: id,
    revision: 1,
    updated: now.toISOString(),
    rules: { ruleset: c.root.ruleset, module: c.root.module, option: c.root.option, version: c.root.version },
    // parties, each with its own start, clock and sessions, are made after the build in the Atlas's Referee mode
    parties: [],
    active: '',
    revealed: {},
    characters: []
  };
  return { manifest, lock, state, problems: resolution.problems };
}

export function describeProblem(p: Problem): string {
  switch (p.kind) {
    case 'missing': return `${p.id} is needed (by ${p.wanted.map((w) => w.by).join(', ')}) but isn't published anywhere Scribe looked.`;
    case 'blocked': return `No version of ${p.id} fits every request (${p.wanted.map((w) => `${w.by} wants ${w.range}`).join('; ')}). Published: ${p.available.join(', ')}.`;
    case 'conflict': return `${p.id} can't share a campaign with ${p.with} ${p.range}.`;
    case 'roots': return `A campaign has one root, but this one has ${p.roots.join(' and ')}.`;
    case 'cycle': return `These modules require each other in a loop: ${p.path.join(' → ')}.`;
  }
}
