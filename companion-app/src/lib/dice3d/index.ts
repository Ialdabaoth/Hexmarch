import { diceToShow } from './shapes';
import type { LogEntry } from '../checks';

// three.js is large, so the dice scene loads on its own the first time it's needed.
let scene: Promise<typeof import('./scene')> | null = null;
const load = () => (scene ??= import('./scene'));

export function preloadDice(): void {
  load().catch(() => (scene = null));
}

// Plays the roll on 3D dice and resolves when they settle. Never throws:
// if WebGL or the module isn't available the roll just shows without dice.
export async function showDice(entry: LogEntry): Promise<void> {
  const dice = diceToShow(entry.dice ?? []);
  if (!dice.length) return;
  try {
    const { throwDice } = await load();
    await throwDice(dice);
  } catch (e) {
    scene = null;
    console.warn('3D dice unavailable', e);
  }
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
