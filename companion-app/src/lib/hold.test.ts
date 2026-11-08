import { describe, expect, it } from 'vitest';
import { combine } from './hold.svelte';

describe('difficulty circumstances', () => {
  it('cancels easy against hard and caps at one step', () => {
    expect(combine('hard', 'easy')).toBe('normal');
    expect(combine('normal', 'hard')).toBe('hard');
    expect(combine('easy', 'easy')).toBe('easy');
    expect(combine('hard', 'normal')).toBe('hard');
  });
});
