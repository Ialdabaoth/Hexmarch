// Preparation limits (MM pp. 15-21, E9 pp. 16-18). Each level allows so many
// preparations of each circle, and any of them may hold magic of a lower circle.

export interface PrepCheck {
  // Preparations allowed of each circle at this level; index 0 is the first circle.
  allowed: number[];
  // The highest circle this level can prepare.
  maxCircle: number;
  // Indexes into the preparation list that don't fit the level's limits.
  over: number[];
}

// `penalty` is taken off each circle's allowance, e.g. a wizard in light armor.
export function checkPreparations(slots: number[][], level: number, prepared: { circle: number }[], penalty: number[] = []): PrepCheck {
  const row = slots[Math.min(Math.max(level, 1), slots.length) - 1] ?? [];
  const allowed = row.map((n, k) => Math.max(0, n - (penalty[k] ?? 0)));
  const free = [...allowed];
  const over: number[] = [];
  // Place the highest circles first, each into the lowest free slot that can hold it.
  const order = prepared.map((p, i) => ({ circle: p.circle, i })).sort((a, b) => b.circle - a.circle);
  for (const { circle, i } of order) {
    const slot = free.findIndex((n, k) => n > 0 && k + 1 >= circle);
    if (slot < 0) over.push(i);
    else free[slot]--;
  }
  const maxCircle = allowed.reduce((m, n, k) => (n > 0 ? k + 1 : m), 0);
  return { allowed, maxCircle, over: over.sort((a, b) => a - b) };
}

type ArmorRule = { light: number[]; blockedBy: string[] };

// What a wizard's armor does to their magic: light armor costs preparations, and
// heavier armor (or, in E9, a shield) stops prepared spells being cast at all.
export function armorEffect(rule: ArmorRule | undefined, worn: string | undefined, shield: boolean): { penalty: number[]; blockedBy?: string } {
  if (!rule) return { penalty: [] };
  const blockedBy =
    worn && rule.blockedBy.includes(worn) ? `${worn} armor` : shield && rule.blockedBy.includes('shield') ? 'a shield' : undefined;
  return { penalty: worn === 'light' ? rule.light : [], blockedBy };
}

// How many glamours a druid can know at this level; null means every one.
export function knownLimit(known: (number | null)[] | undefined, level: number): number | null | undefined {
  if (!known) return undefined;
  return known[Math.min(Math.max(level, 1), known.length) - 1] ?? null;
}
