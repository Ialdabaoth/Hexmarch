import { describe, expect, it } from 'vitest';
import { artUrl, makeArt, missingFrom, readArt } from './art';

const PIC = 'data:image/jpeg;base64,/9j/AAAA';

describe('art files', () => {
  it('round-trips pictures', () => {
    expect(readArt(JSON.parse(JSON.stringify(makeArt({ abc123: PIC }))))).toEqual({ abc123: PIC });
  });

  it('refuses other files and skips entries that are not pictures', () => {
    expect(() => readArt({ format: 'materia-mundi-characters' })).toThrow(/art file/);
    expect(readArt({ format: 'materia-mundi-art', version: 1, pictures: { ok: PIC, bad: 'https://x/y.png', 'no/slash': PIC, js: 'data:text/html;base64,AA' } })).toEqual({ ok: PIC });
  });

  it('finds art.json beside the campaign file unless told otherwise', () => {
    expect(artUrl('https://a.github.io/c/campaign.json')).toBe('https://a.github.io/c/art.json');
    expect(artUrl('https://a.github.io/c/campaign.json', 'pictures/art.json')).toBe('https://a.github.io/c/pictures/art.json');
  });

  it('takes only pictures that are wanted and missing', () => {
    expect(missingFrom({ a: PIC, b: PIC, c: PIC }, ['a', 'b', 'z'], { a: PIC })).toEqual({ b: PIC });
  });
});
