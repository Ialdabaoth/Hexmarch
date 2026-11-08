import { diceToShow } from './shapes';
import type { LogEntry } from '../checks';

// three.js is large, so the dice scene loads on its own the first time it's needed.
let scene: Promise<typeof import('./scene')> | null = null;
const load = () => (scene ??= import('./scene'));

export function preloadDice(): void {
  load().catch(() => (scene = null));
}

// Plays the roll on 3D dice and resolves when they settle, with how many dice were
// shown (0 when none were). Never throws: if WebGL or the module isn't available the
// roll just shows without dice. A while after landing, the dice move into any
// [data-die-slot] elements on the page (the roll result's dice row).
export async function showDice(entry: Pick<LogEntry, 'dice'>, colors?: { body: string; ink: string }): Promise<number> {
  const dice = diceToShow(entry.dice ?? []);
  if (!dice.length) return 0;
  try {
    const { throwDice, setDiceColors } = await load();
    if (colors) setDiceColors(colors.body, colors.ink);
    return (await throwDice(dice)) ? dice.length : 0;
  } catch (e) {
    scene = null;
    console.warn('3D dice unavailable', e);
    return 0;
  }
}

// The roll result closed: the dice resting in it go too.
export function releaseDice(): void {
  scene?.then((m) => m.releaseDice()).catch(() => {});
}

export const DEFAULT_DICE_COLOR = '#9b3524';
export const DEFAULT_DICE_INK = '#fdf3dc';

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
