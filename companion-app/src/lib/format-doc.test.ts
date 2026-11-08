// @ts-expect-error: tests run in Node, the app's tsconfig only has browser types
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { readSheet } from './sheet';
import { Character, freshState, talentThreshold } from './character';

it('the example in CHARACTER_FORMAT.md imports', () => {
  const md = readFileSync(new URL('../../CHARACTER_FORMAT.md', import.meta.url), 'utf8');
  const c = new Character(readSheet(JSON.parse(/```json\n([\s\S]*?)```/.exec(md)![1])), freshState());
  expect(talentThreshold(c, 'stealth')).toBe(3);
  expect(talentThreshold(c, 'agility')).toBe(4);
  expect(c.hpMax).toBe(8);
  expect(c.hp).toBe(8);
  expect(c.level).toBe(2);
});
