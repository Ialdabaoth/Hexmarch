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

export function checkPreparations(slots: number[][], level: number, prepared: { circle: number }[]): PrepCheck {
  const allowed = slots[Math.min(Math.max(level, 1), slots.length) - 1] ?? [];
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
