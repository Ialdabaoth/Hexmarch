// Tap a roll for a normal roll. Press and hold to turn the button black and bring up Easy
// above it and Hard below it, drawn in the button's own shape, slide onto one and let go to roll at that difficulty. Letting go anywhere
// else cancels. Keyboard users get a normal roll from Enter or Space.

import type { Difficulty } from '../rules/rules';

const HOLD_MS = 350;
const SLOP = 10; // px of movement allowed before a press counts as a scroll
const GAP = 18; // px between the held button and each choice
const MIN_H = 40; // short buttons get taller choices, so the label clears the arrow

// The open menu, drawn by HoldMenu.svelte. x and y are the held button's centre; w, h and
// radius copy its frame; offset is how far each choice's centre sits above or below it.
export const holdMenu = $state({
  open: false,
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  radius: '0px',
  offset: 0,
  hover: null as Difficulty | null
});

function hoverAt(x: number, y: number): Difficulty | null {
  // Generous targets: anywhere past halfway toward a choice, within a thumb's width sideways.
  if (Math.abs(x - holdMenu.x) > holdMenu.w / 2 + 40) return null;
  const dy = y - holdMenu.y;
  if (dy <= -holdMenu.offset / 2) return 'easy';
  if (dy >= holdMenu.offset / 2) return 'hard';
  return null;
}

export function holdRoll(node: HTMLElement, onroll: (d: Difficulty) => void) {
  let handler = onroll;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | null = null;
  let held = false;
  let swallowClick = false;

  const reset = () => {
    clearTimeout(timer);
    start = null;
    if (held) {
      holdMenu.open = false;
      holdMenu.hover = null;
      node.classList.remove('held');
    }
    held = false;
  };

  const down = (e: PointerEvent) => {
    if (e.button !== 0 || (node as HTMLButtonElement).disabled) return;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      held = true;
      swallowClick = true;
      const box = node.getBoundingClientRect();
      const w = box.width;
      const h = Math.max(box.height, MIN_H);
      const offset = box.height / 2 + GAP + h / 2;
      // Keep both choices on screen when the button is near an edge.
      const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
      Object.assign(holdMenu, {
        open: true,
        x: clamp(box.left + box.width / 2, w / 2 + 8, window.innerWidth - w / 2 - 8),
        y: clamp(box.top + box.height / 2, offset + h / 2 + 8, window.innerHeight - offset - h / 2 - 8),
        w,
        h,
        radius: getComputedStyle(node).borderRadius || '0px',
        offset,
        hover: null
      });
      node.classList.add('held');
      try { node.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      window.getSelection()?.removeAllRanges();
      navigator.vibrate?.(10);
    }, HOLD_MS);
  };

  const move = (e: PointerEvent) => {
    if (!start) return;
    if (held) holdMenu.hover = hoverAt(e.clientX, e.clientY);
    else if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) reset();
  };

  const up = () => {
    if (held && holdMenu.hover) handler(holdMenu.hover);
    reset();
  };

  // Stop the page from scrolling while the menu is open.
  const touchmove = (e: TouchEvent) => {
    if (held) e.preventDefault();
  };

  const click = (e: MouseEvent) => {
    e.preventDefault();
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    handler('normal');
  };

  const contextmenu = (e: Event) => e.preventDefault();
  // Belt and braces for iOS: refuse to start a selection, and drop any that slipped in.
  const selectstart = (e: Event) => e.preventDefault();

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', reset);
  node.addEventListener('touchmove', touchmove, { passive: false });
  node.addEventListener('click', click);
  node.addEventListener('contextmenu', contextmenu);
  node.addEventListener('selectstart', selectstart);
  node.classList.add('holdable');

  return {
    update(next: (d: Difficulty) => void) {
      handler = next;
    },
    destroy() {
      reset();
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', reset);
      node.removeEventListener('touchmove', touchmove);
      node.removeEventListener('click', click);
      node.removeEventListener('contextmenu', contextmenu);
      node.removeEventListener('selectstart', selectstart);
    }
  };
}

// Circumstances on top of a base difficulty: easy and hard cancel out (p. 10).
export function combine(base: Difficulty, circumstance: Difficulty): Difficulty {
  const step = { easy: -1, normal: 0, hard: 1 } as const;
  const n = Math.max(-1, Math.min(1, step[base] + step[circumstance]));
  return n < 0 ? 'easy' : n > 0 ? 'hard' : 'normal';
}
