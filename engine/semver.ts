// Semantic versions and npm-style ranges, as WORKFLOWS.md "Versioning" and "Dependencies" use them.
// No dependencies, so the Companion, the Atlas and Scribe can all share it.

export interface Version {
  major: number;
  minor: number;
  patch: number;
  pre: (string | number)[];
}

const FULL = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(v: string): Version {
  const m = FULL.exec(v.trim());
  if (!m) throw new Error(`"${v}" is not a version (expected 1.2.3 or 1.0.0-alpha.1).`);
  const pre = m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [];
  return { major: +m[1], minor: +m[2], patch: +m[3], pre };
}

export function isVersion(v: string): boolean {
  return FULL.test(v.trim());
}

// -1, 0 or 1. A prerelease sorts before its release: 1.0.0-alpha < 1.0.0-beta < 1.0.0.
export function compare(a: string | Version, b: string | Version): number {
  const x = typeof a === 'string' ? parseVersion(a) : a;
  const y = typeof b === 'string' ? parseVersion(b) : b;
  for (const k of ['major', 'minor', 'patch'] as const) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    if (typeof p === 'number' && typeof q === 'number') return p < q ? -1 : 1;
    if (typeof p === 'number') return -1;
    if (typeof q === 'number') return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

// What kind of update going from one version to another is: WORKFLOWS.md's patch / minor / major.
// Before 1.0.0 nothing is promised, so a change of the first non-zero part counts as major (as npm's ^ does).
export function bump(from: string, to: string): 'none' | 'patch' | 'minor' | 'major' | 'downgrade' {
  const c = compare(from, to);
  if (c === 0) return 'none';
  if (c > 0) return 'downgrade';
  const a = parseVersion(from), b = parseVersion(to);
  if (a.major !== b.major) return 'major';
  if (a.major === 0 && a.minor !== b.minor) return 'major';
  if (a.minor !== b.minor) return 'minor';
  if (a.major === 0 && a.minor === 0 && a.patch !== b.patch) return 'major';
  return a.patch !== b.patch ? 'patch' : 'minor'; // only the prerelease changed: treat as minor
}

type Op = '>=' | '>' | '<=' | '<' | '=';
interface Comparator {
  op: Op;
  v: Version;
}

const PARTIAL = /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?$/;

interface Partial3 {
  parts: (number | null)[]; // null = missing or wildcard
  pre: (string | number)[];
}

function partial(s: string): Partial3 {
  const m = PARTIAL.exec(s);
  if (!m) throw new Error(`"${s}" is not a version range.`);
  const num = (p: string | undefined) => (p === undefined || /^[xX*]$/.test(p) ? null : Number(p));
  const parts = [num(m[1]), num(m[2]), num(m[3])];
  // a wildcard ends the precise part: 1.x.3 means 1.x
  const cut = parts.indexOf(null);
  if (cut >= 0) for (let i = cut; i < 3; i++) parts[i] = null;
  const pre = m[4] && cut < 0 ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [];
  return { parts, pre };
}

const ver = (a: number, b: number, c: number, pre: (string | number)[] = []): Version => ({ major: a, minor: b, patch: c, pre });
// the lowest version of the next line up: <2.0.0-0 keeps 2.0.0-alpha out of ^1
const below = (a: number, b: number, c: number): Comparator => ({ op: '<', v: ver(a, b, c, [0]) });

function desugar(token: string): Comparator[] {
  const t = token.trim();
  if (t === '' || t === '*' || /^[xX]$/.test(t)) return [];
  const op = /^(>=|<=|>|<|=|\^|~)/.exec(t)?.[1] ?? '';
  const { parts, pre } = partial(t.slice(op.length).trim());
  const [a, b, c] = parts;
  if (a === null) return op === '<' || op === '>' ? [{ op: '<', v: ver(0, 0, 0, [0]) }] : [];
  const lo = ver(a, b ?? 0, c ?? 0, pre);
  if (op === '^') {
    if (a > 0 || b === null) return [{ op: '>=', v: lo }, below(a + 1, 0, 0)];
    if (b > 0 || c === null) return [{ op: '>=', v: lo }, below(0, b + 1, 0)];
    return [{ op: '>=', v: lo }, below(0, 0, c + 1)];
  }
  if (op === '~') return [{ op: '>=', v: lo }, b === null ? below(a + 1, 0, 0) : below(a, b + 1, 0)];
  if (op === '' || op === '=') {
    if (c !== null) return [{ op: '=', v: lo }];
    return [{ op: '>=', v: lo }, b === null ? below(a + 1, 0, 0) : below(a, b + 1, 0)];
  }
  if (op === '>' && c === null) return [{ op: '>=', v: b === null ? ver(a + 1, 0, 0) : ver(a, b + 1, 0) }];
  if (op === '<=' && c === null) return [b === null ? below(a + 1, 0, 0) : below(a, b + 1, 0)];
  if (op === '<' && c === null) return [{ op: '<', v: ver(a, b ?? 0, 0, [0]) }];
  return [{ op: op as Op, v: lo }];
}

function sets(range: string): Comparator[][] {
  return range.split('||').map((alt) => {
    // "1.2.3 - 2.0.0" (hyphen range)
    const h = /^\s*(\S+)\s+-\s+(\S+)\s*$/.exec(alt);
    if (h) return [...desugar('>=' + h[1]), ...desugar(partial(h[2]).parts.includes(null) ? '<=' + h[2] : '<=' + h[2])];
    return alt.trim().split(/\s+/).flatMap((tok) => desugar(tok.replace(/^(>=|<=|>|<|=)\s+/, '$1')));
  });
}

function test(c: Comparator, v: Version): boolean {
  const r = compare(v, c.v);
  switch (c.op) {
    case '>=': return r >= 0;
    case '>': return r > 0;
    case '<=': return r <= 0;
    case '<': return r < 0;
    case '=': return r === 0;
  }
}

export function validRange(range: string): boolean {
  try {
    sets(range);
    return true;
  } catch {
    return false;
  }
}

// npm's rule for prereleases: 1.0.0-beta satisfies a range only when one of its comparators names a
// prerelease of 1.0.0 itself, so "^1.0" never picks up a beta by accident.
export function satisfies(version: string, range: string): boolean {
  const v = parseVersion(version);
  return sets(range).some((set) => {
    if (!set.every((c) => test(c, v))) return false;
    if (!v.pre.length) return true;
    return set.some((c) => c.v.pre.length > 0 && !(c.v.pre.length === 1 && c.v.pre[0] === 0 && c.op === '<') &&
      c.v.major === v.major && c.v.minor === v.minor && c.v.patch === v.patch);
  });
}

// The highest version that meets every range, or null.
export function maxSatisfying(versions: string[], ranges: string[]): string | null {
  const ok = versions.filter((v) => ranges.every((r) => satisfies(v, r)));
  return ok.length ? ok.sort(compare)[ok.length - 1] : null;
}
