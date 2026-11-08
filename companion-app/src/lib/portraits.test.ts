import { describe, expect, it } from 'vitest';
import { isWebImageUrl, portraitSrc } from './portraits';

describe('portraits', () => {
  it('finds a picture for each kind of portrait link', () => {
    const cache = { abc: 'data:image/jpeg;base64,AAAA' };
    expect(portraitSrc('cache:abc', cache)).toBe('data:image/jpeg;base64,AAAA');
    expect(portraitSrc('cache:gone', cache)).toBe('');
    expect(portraitSrc('https://example.com/a.png', cache)).toBe('https://example.com/a.png');
    expect(portraitSrc('', cache)).toBe('');
  });

  it('takes only https web links', () => {
    expect(isWebImageUrl(' https://example.com/a.png ')).toBe(true);
    expect(isWebImageUrl('http://example.com/a.png')).toBe(false);
    expect(isWebImageUrl('javascript:alert(1)')).toBe(false);
  });
});
