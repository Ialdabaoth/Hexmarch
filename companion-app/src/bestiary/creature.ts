// Creatures the referee runs: monsters, NPCs and beasts, built from a template and then
// replaced or adjusted (modules/CREATURES_FORMAT.md, section 4). A creature taken into
// play is a copy: its stats are resolved once and its hit points rolled per member, so
// later changes to the bestiary or the module never touch a fight in progress.

import { roll, rollDie, describe as describeRoll, type Rng } from '../lib/dice';
import type { LogEntry } from '../lib/checks';
import { BESTIARY, levelOf, rollHp, type AbilityKey, type Monster, type SaveKind, type WithRef } from './bestiary';

export const SAVE_KINDS: SaveKind[] = ['doom', 'hold', 'blast', 'trick', 'curse', 'fear'];
export const ABILITY_KEYS: AbilityKey[] = ['con', 'str', 'dex', 'int', 'wis', 'cha'];
// Calls and nested templates share the procedures' depth limit (EVENTS_FORMAT.md section 3).
export const MAX_DEPTH = 6;

export interface Attack {
  name: string;
  // A dice expression in d6 terms ("2d6+3", "d6÷2", "1"), or '' when the book gives none.
  damage: string;
  // Whatever else the book says about it: damage type, reach, "x2".
  note: string;
}

// A creature's stats once its template is resolved, for one ruleset.
export interface CreatureStats {
  name: string;
  kind: string;
  ref?: string;
  page?: number;
  level: number;
  size: string;
  movement: string;
  armor: string;
  // Hit points as a formula ("(3d6+6)x2", "per hd") or a number.
  hp: string;
  attacks: Attack[];
  saves: Partial<Record<SaveKind, number>>;
  abilities: Record<AbilityKey, number>;
  // Talents the creature is trained in, rolled with one threshold.
  talents: string[];
  // Set by the template or the referee; otherwise the ruleset's NPC table gives it by level.
  talentThreshold?: number;
  // The book's reaction line ("1-2 fearful, 3-5 wary, 6 aggressive").
  behavior?: string;
  special: string[];
  summary: string;
}

// "Start with X, then replace or adjust as follows."
export interface CreatureTemplate {
  from: string;
  replace?: Record<string, unknown>;
  adjust?: Record<string, unknown>;
}

export interface TemplateSources {
  // A bestiary entry by reference, e.g. "mm:wolf-mastiff".
  bestiary?: (ref: string) => WithRef<Monster> | undefined;
  // Another creature's template by id, for variants.
  creature?: (id: string) => CreatureTemplate | undefined;
}

const DEFAULT_SOURCES: TemplateSources = { bestiary: (ref) => BESTIARY.get(ref) };

export function zeroAbilityAdjustments(): Record<AbilityKey, number> {
  return { con: 0, str: 0, dex: 0, int: 0, wis: 0, cha: 0 };
}

export function blankStats(): CreatureStats {
  return {
    name: 'New creature', kind: 'monster', level: 1, size: 'Medium', movement: 'Normal', armor: '0', hp: '1d6',
    attacks: [], saves: {}, abilities: zeroAbilityAdjustments(), talents: [], special: [], summary: ''
  };
}

// The book's attack line as separate attacks: "bite (2d6+3 piercing), claws (3d6+3 sunder) x2".
export function parseAttacks(text: string): Attack[] {
  if (!text.trim() || /^as mortal$/i.test(text.trim())) return [];
  return splitTop(text).map((part) => {
    const p = part.trim();
    const paren = p.match(/^([^(]*)\((.*)\)(.*)$/);
    const head = paren ? paren[1] : p;
    const dice = p.match(DICE)?.[0] ?? '';
    const bare = !dice && paren ? (paren[2].trim().match(/^(\d+)$/)?.[1] ?? '') : '';
    const damage = (dice || bare).replace(/\s+/g, '');
    const name = head.replace(dice, '').replace(/\s+/g, ' ').trim() || 'Attack';
    const rest = paren ? `${paren[2].replace(dice, '').replace(bare ? /^\s*\d+\s*$/ : /$^/, '')} ${paren[3]}` : '';
    return { name, damage, note: rest.replace(/\s+/g, ' ').trim() };
  });
}

const DICE = /\d*d6(?:\s*[+-]\s*\d+)?(?:\s*÷\s*\d+)?/i;

// Splits on commas and semicolons that aren't inside brackets.
function splitTop(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.filter((s) => s.trim());
}

// A bestiary entry as stats to build on.
export function monsterStats(m: WithRef<Monster>): CreatureStats {
  const special = [m.abilities, m.feat].filter((s): s is string => !!s);
  return {
    name: m.name,
    kind: m.kind,
    ref: m.ref,
    page: m.page,
    level: levelOf(m) ?? 1,
    size: m.size,
    movement: m.movement,
    armor: m.armor,
    hp: m.hp,
    attacks: parseAttacks(m.attacks),
    saves: { ...(m.saves ?? {}) },
    abilities: { ...zeroAbilityAdjustments(), ...(m.adjustments ?? {}) },
    talents: [],
    ...(m.behavior ? { behavior: m.behavior } : {}),
    special,
    summary: m.summary
  };
}

export class TemplateError extends Error {}

// Resolves "from", then applies "replace", then "adjust".
export function resolveTemplate(t: CreatureTemplate, sources: TemplateSources = DEFAULT_SOURCES, depth = 0): CreatureStats {
  if (depth >= MAX_DEPTH) throw new TemplateError(`Templates nest deeper than ${MAX_DEPTH} at "${t.from}"`);
  const base = baseStats(t.from, sources, depth);
  if (t.replace) applyReplace(base, t.replace);
  if (t.adjust) applyAdjust(base as unknown as Record<string, unknown>, t.adjust, '');
  return base;
}

function baseStats(from: string, sources: TemplateSources, depth: number): CreatureStats {
  if (!from || from === 'blank') return blankStats();
  if (from === 'pc' || from.startsWith('npc:')) throw new TemplateError(`"${from}" templates arrive in a later version`);
  if (from.includes(':')) {
    const m = (sources.bestiary ?? DEFAULT_SOURCES.bestiary!)(from);
    if (!m) throw new TemplateError(`No bestiary entry "${from}"`);
    return monsterStats(m);
  }
  const other = sources.creature?.(from);
  if (!other) throw new TemplateError(`No creature "${from}"`);
  return resolveTemplate(other, sources, depth + 1);
}

// Overwrites fields outright. Keys may be dotted ("saves.fear").
export function applyReplace(stats: CreatureStats, replace: Record<string, unknown>) {
  for (const [key, value] of Object.entries(replace)) {
    const path = key.split('.');
    let target = stats as unknown as Record<string, unknown>;
    for (const p of path.slice(0, -1)) {
      if (typeof target[p] !== 'object' || target[p] === null) target[p] = {};
      target = target[p] as Record<string, unknown>;
    }
    const last = path[path.length - 1];
    target[last] = last === 'attacks' && Array.isArray(value) ? value.map(toAttack) : structuredClone(value);
  }
}

function toAttack(a: unknown): Attack {
  if (typeof a === 'string') return parseAttacks(a)[0] ?? { name: a, damage: '', note: '' };
  const o = (a ?? {}) as Partial<Attack>;
  return { name: String(o.name ?? 'Attack'), damage: String(o.damage ?? ''), note: String(o.note ?? '') };
}

// Changes fields relative to the template: numbers add, objects recurse, and lists take
// {"add": [...], "remove": [...]} (attacks match by name, other lists by value).
export function applyAdjust(target: Record<string, unknown>, adjust: Record<string, unknown>, at: string) {
  for (const [key, change] of Object.entries(adjust)) {
    const where = at ? `${at}.${key}` : key;
    const cur = target[key];
    if (typeof change === 'number') {
      if (cur === undefined || typeof cur === 'number') target[key] = (cur ?? 0) + change;
      else throw new TemplateError(`Can't add a number to "${where}"`);
    } else if (change && typeof change === 'object' && !Array.isArray(change) && ('add' in change || 'remove' in change) && (Array.isArray(cur) || cur === undefined)) {
      const ops = change as { add?: unknown[]; remove?: unknown[] };
      const isAttacks = key === 'attacks';
      const keyOf = (x: unknown) => (isAttacks ? String((x as Attack).name ?? x).toLowerCase() : JSON.stringify(x));
      const removing = new Set((ops.remove ?? []).map((x) => (isAttacks ? String(x).toLowerCase() : JSON.stringify(x))));
      const list = ((cur as unknown[]) ?? []).filter((x) => !removing.has(keyOf(x)));
      for (const x of ops.add ?? []) list.push(isAttacks ? toAttack(x) : structuredClone(x));
      target[key] = list;
    } else if (change && typeof change === 'object' && !Array.isArray(change)) {
      if (cur !== undefined && (typeof cur !== 'object' || cur === null || Array.isArray(cur))) throw new TemplateError(`"${where}" isn't a group of values`);
      const obj = (cur as Record<string, unknown>) ?? {};
      applyAdjust(obj, change as Record<string, unknown>, where);
      target[key] = obj;
    } else {
      throw new TemplateError(`Can't adjust "${where}"; use replace`);
    }
  }
}

// ---- Creatures in play ----

export type CreatureKind = 'monster' | 'npc' | 'beast';

export interface Creature {
  id: string;
  name: string;
  kind: CreatureKind;
  owner: 'referee';
  // How it was made, so a later version can rebuild it.
  template: CreatureTemplate;
  stats: CreatureStats;
  // A troupe is one creature with a count; each member has its own hit points.
  hp: number[];
  hpMax: number[];
  attitude: string;
  notes: string;
}

// Hit points for one member: the printed formula, or level d6 where the book says "per hd".
export function rollMemberHp(stats: CreatureStats, rng: Rng = Math.random): number {
  const f = stats.hp.trim();
  if (/^\d+$/.test(f)) return Math.max(1, Number(f));
  if (/\dd\d|^d\d/i.test(f)) return rollHp(f, rng);
  return rollHp(`${Math.max(1, Math.round(stats.level))}d6`, rng);
}

export function newCreature(template: CreatureTemplate, count = 1, sources: TemplateSources = DEFAULT_SOURCES, rng: Rng = Math.random): Creature {
  const stats = resolveTemplate(template, sources);
  const n = Math.max(1, Math.min(99, Math.floor(count)));
  const hpMax = Array.from({ length: n }, () => rollMemberHp(stats, rng));
  const kind: CreatureKind = stats.kind === 'mortal' ? 'npc' : stats.kind === 'animal' || stats.kind === 'fey beast' ? 'beast' : 'monster';
  return { id: crypto.randomUUID(), name: stats.name, kind, owner: 'referee', template: structuredClone(template), stats, hp: [...hpMax], hpMax, attitude: 'Indifferent', notes: '' };
}

// Rolls one damage expression; "÷2" halves the total, rounding down, at least 1.
export function damageRollEntry(who: string, attack: Attack, rng: Rng = Math.random): LogEntry {
  const m = attack.damage.match(/^(.*?)(?:÷(\d+))?$/)!;
  const r = roll(m[1], rng);
  const div = m[2] ? Number(m[2]) : 1;
  const total = div > 1 ? Math.max(1, Math.floor(r.total / div)) : r.total;
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    who,
    label: `${attack.name} damage${attack.note ? ` (${attack.note})` : ''}`,
    detail: `${attack.damage}: ${describeRoll(r)}${div > 1 ? ` ÷ ${div} → ${total}` : ''}`,
    total,
    dice: r.groups.flatMap((g) => g.rolls.map((value, i) => ({ sides: g.sides, value, kept: g.kept[i] })))
  };
}

// The book's behaviour line as bands: "1-2 fearful, 3-5 wary, 6 aggressive".
export function reactionBands(behavior: string): { lo: number; hi: number; result: string }[] {
  return [...behavior.matchAll(/(\d)(?:\s*-\s*(\d))?\s+([a-z][a-z ]*?)(?=,|$)/gi)].map((m) => ({ lo: Number(m[1]), hi: Number(m[2] ?? m[1]), result: m[3].trim() }));
}

export function reactionEntry(who: string, behavior: string, rng: Rng = Math.random): LogEntry {
  const value = rollDie(6, rng);
  const band = reactionBands(behavior).find((b) => value >= b.lo && value <= b.hi);
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    who,
    label: `Reaction: ${band?.result ?? 'see notes'}`,
    detail: `D6: ${value} (${behavior})`,
    total: value,
    dice: [{ sides: 6, value, kept: true }]
  };
}
