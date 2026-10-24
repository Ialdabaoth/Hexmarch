import { rollDie, roll, describe, type Rng } from './dice';
import type { Difficulty } from '../rules/rules';

export interface LogEntry {
  id: string;
  at: string;
  who: string;
  label: string;
  // e.g. "d20 vs 14+ (easy)" or "3d6"
  detail: string;
  total: number;
  outcome?: 'success' | 'failure' | 'critical';
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
    detail: `d${opts.sides} vs ${opts.threshold}+${opts.difficulty === 'normal' ? '' : ` (${opts.difficulty})`}: ${shown}`,
    total: kept,
    outcome
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
    total: floored ? opts.min! : r.total
  };
}
