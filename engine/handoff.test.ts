import { describe, expect, it } from 'vitest';
import { appOf } from './handoff';

describe('appOf', () => {
  const site = 'https://ialdabaoth.github.io/Hexmarch/';
  it('names the app folder a link is for', () => {
    expect(appOf('https://ialdabaoth.github.io/Hexmarch/companion/?campaign=x#m=abc', site)).toBe('/Hexmarch/companion/');
    expect(appOf('https://ialdabaoth.github.io/Hexmarch/scribe/#m=abc', site)).toBe('/Hexmarch/scribe/');
    expect(appOf('https://ialdabaoth.github.io/Hexmarch/atlas/?module=b2&invite=blue', site)).toBe('/Hexmarch/atlas/');
  });
  it('leaves out the Launcher, other sites and other folders of the origin', () => {
    expect(appOf('https://ialdabaoth.github.io/Hexmarch/', site)).toBeNull();
    expect(appOf('https://ialdabaoth.github.io/kells-1422/live-1/campaign.json', site)).toBeNull();
    expect(appOf('https://example.org/Hexmarch/companion/', site)).toBeNull();
    expect(appOf('not a link', site)).toBeNull();
  });
});
