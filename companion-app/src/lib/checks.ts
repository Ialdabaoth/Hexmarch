import { rollDie, roll, describe, type Rng } from './dice';
import type { Difficulty } from '../rules/rules';

export interface LogEntry {
  id: string;
  at: string;
  who: string;
  label: string;
  // What was rolled, e.g. "D20 vs. 14+: [15, 11] → 15" or "3d6: 4 + 2 + 6"
  detail: string;
  total: number;
  outcome?: 'success' | 'failure' | 'critical';
  // Easy or hard checks; older entries don't have it.
  difficulty?: Difficulty;
  // Each die rolled, for the 3D dice; older entries don't have it.
  dice?: { sides: number; value: number; kept: boolean }[];
}

// "Sapphire - Easy Save vs. Curse: 15 (success)"
export function headline(e: LogEntry): string {
  return `${rollName(e)}: ${e.total}${e.outcome ? ` (${e.outcome})` : ''}`;
}

// "Sapphire - Easy Save vs. Curse", for the roll log, which styles the result itself.
export function rollName(e: LogEntry): string {
  const diff = e.difficulty && e.difficulty !== 'normal' ? `${e.difficulty[0].toUpperCase()}${e.difficulty.slice(1)} ` : '';
  return `${e.who} - ${diff}${e.label}`;
}

// "(Rolled D20 vs. 11+: [15, 11] → 15)"
export function rolledLine(e: LogEntry): string {
  return `(Rolled ${e.detail.replace(/~~(\d+)~~/g, '($1)')})`;
}

// Easy rolls two dice and keeps the better, hard keeps the worse (p. 10).
export function thresholdCheck(
  opts: { who: string; label: string; sides: 6 | 20; threshold: number; difficulty: Difficulty; improvedCritical?: boolean },
  rng: Rng = Math.random
): LogEntry {
  const dice = opts.difficulty === 'normal' ? [rollDie(opts.sides, rng)] : [rollDie(opts.sides, rng), rollDie(opts.sides, rng)];
  const kept = opts.difficulty === 'easy' ? Math.max(...dice) : Math.min(...dice);
  let outcome: LogEntry['outcome'] = kept >= opts.threshold ? 'success' : 'failure';
  // Improved Critical Hit (p. 13): threshold 9+ or better, beat it by 10 or more.
  if (opts.improvedCritical && opts.threshold <= 9 && kept - opts.threshold >= 10) outcome = 'critical';
  const shown = dice.length > 1 ? `[${dice.join(', ')}] → ${kept}` : String(kept);
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    who: opts.who,
    label: opts.label,
    detail: `D${opts.sides} vs. ${opts.threshold}+: ${shown}`,
    total: kept,
    outcome,
    difficulty: opts.difficulty,
    dice: dice.map((value, i) => ({ sides: opts.sides, value, kept: dice.length === 1 || i === dice.indexOf(kept) }))
  };
}

// `min` floors the total, e.g. a hit die never gives less than 1 (p. 9).
export function expressionRoll(opts: { who: string; label: string; expression: string; min?: number }, rng: Rng = Math.random): LogEntry {
  const r = roll(opts.expression, rng);
  const floored = opts.min !== undefined && r.total < opts.min;
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    who: opts.who,
    label: opts.label,
    detail: `${opts.expression}: ${describe(r)}${floored ? ` (minimum ${opts.min})` : ''}`,
    total: floored ? opts.min! : r.total,
    dice: r.groups.flatMap((g) => g.rolls.map((value, i) => ({ sides: g.sides, value, kept: g.kept[i] })))
  };
}
