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
export async function showDice(entry: Pick<LogEntry, 'dice'>, colors?: { body: string; ink: string }): Promise<void> {
  const dice = diceToShow(entry.dice ?? []);
  if (!dice.length) return;
  try {
    const { throwDice, setDiceColors } = await load();
    if (colors) setDiceColors(colors.body, colors.ink);
    await throwDice(dice);
  } catch (e) {
    scene = null;
    console.warn('3D dice unavailable', e);
  }
}

export const DEFAULT_DICE_COLOR = '#9b3524';
export const DEFAULT_DICE_INK = '#fdf3dc';

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
