// Dice expressions like "3d6", "d20+2", "4d6kh3", "2d6-1 + d4".

export type Rng = () => number;

export interface DieGroup {
  count: number;
  sides: number;
  keep?: { mode: 'kh' | 'kl'; n: number };
  rolls: number[];
  kept: boolean[];
  sign: 1 | -1;
}

export interface RollResult {
  expression: string;
  total: number;
  groups: DieGroup[];
  modifier: number;
}

export function rollDie(sides: number, rng: Rng = Math.random): number {
  return Math.floor(rng() * sides) + 1;
}

const TERM = /([+-]?)\s*(?:(\d*)d(\d+)(?:(kh|kl)(\d+))?|(\d+))/gy;

export function parse(expression: string): { groups: Omit<DieGroup, 'rolls' | 'kept'>[]; modifier: number } {
  if (/[\dd]\s+\d/i.test(expression)) throw new Error(`Missing + or - in "${expression}"`);
  const src = expression.toLowerCase().replace(/\s+/g, '');
  if (!src) throw new Error('Empty dice expression');
  const groups: Omit<DieGroup, 'rolls' | 'kept'>[] = [];
  let modifier = 0;
  TERM.lastIndex = 0;
  let pos = 0;
  while (pos < src.length) {
    TERM.lastIndex = pos;
    const m = TERM.exec(src);
    if (!m || m[0] === '') throw new Error(`Can't read "${expression}"`);
    if (pos > 0 && !m[1]) throw new Error(`Missing + or - in "${expression}"`);
    const sign: 1 | -1 = m[1] === '-' ? -1 : 1;
    if (m[6] !== undefined) {
      modifier += sign * Number(m[6]);
    } else {
      const count = m[2] ? Number(m[2]) : 1;
      const sides = Number(m[3]);
      if (count < 1 || count > 100) throw new Error('Roll between 1 and 100 dice');
      if (sides < 2 || sides > 1000) throw new Error('Dice need 2 to 1000 sides');
      const group: Omit<DieGroup, 'rolls' | 'kept'> = { count, sides, sign };
      if (m[4]) {
        const n = Number(m[5]);
        if (n < 1 || n > count) throw new Error(`Can't keep ${n} of ${count} dice`);
        group.keep = { mode: m[4] as 'kh' | 'kl', n };
      }
      groups.push(group);
    }
    pos = TERM.lastIndex;
  }
  return { groups, modifier };
}

export function roll(expression: string, rng: Rng = Math.random): RollResult {
  const parsed = parse(expression);
  let total = parsed.modifier;
  const groups: DieGroup[] = parsed.groups.map((g) => {
    const rolls = Array.from({ length: g.count }, () => rollDie(g.sides, rng));
    const kept = keepMask(rolls, g.keep);
    const sum = rolls.reduce((acc, r, i) => (kept[i] ? acc + r : acc), 0);
    total += g.sign * sum;
    return { ...g, rolls, kept };
  });
  return { expression, total, groups, modifier: parsed.modifier };
}

function keepMask(rolls: number[], keep?: DieGroup['keep']): boolean[] {
  if (!keep) return rolls.map(() => true);
  const order = rolls
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (keep.mode === 'kh' ? b.r - a.r : a.r - b.r))
    .slice(0, keep.n)
    .map((x) => x.i);
  return rolls.map((_, i) => order.includes(i));
}

export function describe(result: RollResult): string {
  const parts = result.groups.map((g) => {
    const dice = g.rolls.map((r, i) => (g.kept[i] ? String(r) : `~~${r}~~`)).join(', ');
    return `${g.sign < 0 ? '-' : ''}[${dice}]`;
  });
  if (result.modifier) parts.push(result.modifier > 0 ? `+${result.modifier}` : String(result.modifier));
  return parts.join(' ');
}
