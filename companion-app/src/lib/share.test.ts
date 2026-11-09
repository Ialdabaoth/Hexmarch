import { describe, expect, it } from 'vitest';
import { readShared, withoutShared } from './share';

describe('shared links', () => {
  it('is nothing when the address has no shared fields', () => {
    expect(readShared('?campaign=x')).toBeNull();
  });
  it('finds a message link in share-url or inside share-text', () => {
    const link = 'https://ialdabaoth.github.io/Hexmarch/#m=abc123';
    expect(readShared(`?share-url=${encodeURIComponent(link)}`)).toEqual({ kind: 'message', hash: '#m=abc123' });
    expect(readShared(`?share-text=${encodeURIComponent(`Holly wants in: ${link} see you Friday`)}`)).toEqual({ kind: 'message', hash: '#m=abc123' });
  });
  it('keeps only the invitation fields of an invitation link', () => {
    const link = 'https://ialdabaoth.github.io/Hexmarch/?campaign=https%3A%2F%2Fx.io%2Fcampaign.json&as=player&character=holly&utm=1';
    const s = readShared(`?share-text=${encodeURIComponent(link)}`);
    expect(s?.kind).toBe('invite');
    const q = new URLSearchParams((s as { search: string }).search);
    expect([q.get('campaign'), q.get('as'), q.get('character'), q.get('utm')]).toEqual(['https://x.io/campaign.json', 'player', 'holly', null]);
  });
  it('says what came when it is neither', () => {
    expect(readShared('?share-title=hello&share-text=no+link+here')).toEqual({ kind: 'other', text: 'no link here hello' });
  });
  it('takes the shared fields out of the address', () => {
    expect(withoutShared('?share-url=x&share-text=y&lang=en')).toBe('?lang=en');
    expect(withoutShared('?share-url=x')).toBe('');
  });
});
