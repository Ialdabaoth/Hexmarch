import { describe, expect, it } from 'vitest';
import { loadRepo, moduleUrl, normaliseBase, parseModule, parseRepo, viewerUrl } from './modules';

const repo = { format: 'mm-repo/1', name: 'MM: Season 1', modules: [{ id: 'season-1', path: 'modules/season-1/' }] };
const manifest = { format: 'mm-module/1', id: 'season-1', title: 'Season 1', version: '1.0.0', license: 'CC0-1.0', books: [] };

// A fake site: serves the given JSON by URL, and 404s anything else.
function site(files: Record<string, unknown>): typeof fetch {
  return (async (url: string) => {
    if (!(url in files)) return new Response('nope', { status: 404 });
    return new Response(JSON.stringify(files[url]), { status: 200 });
  }) as typeof fetch;
}

describe('normaliseBase', () => {
  it('keeps the site root with a trailing slash', () => {
    expect(normaliseBase('https://heph.github.io/mm')).toBe('https://heph.github.io/mm/');
    expect(normaliseBase('https://heph.github.io/mm/mm.json?x=1#y')).toBe('https://heph.github.io/mm/');
  });
  it('refuses plain http except for localhost', () => {
    expect(() => normaliseBase('http://example.com/mm/')).toThrow(/https/);
    expect(normaliseBase('http://localhost:4173/')).toBe('http://localhost:4173/');
  });
  it('rejects text that is not an address', () => {
    expect(() => normaliseBase('not a url')).toThrow(/web address/);
  });
});

describe('parsing', () => {
  it('builds the module and viewer links', () => {
    expect(moduleUrl('https://a.io/mm/', 'season-1')).toBe('https://a.io/mm/season-1/module.json');
    expect(viewerUrl('https://a.io/mm/', 'season-1')).toBe('https://a.io/mm/season-1/');
  });
  it('rejects the wrong repository format and empty module lists', () => {
    expect(() => parseRepo({ ...repo, format: 'other' })).toThrow(/mm-repo\/1/);
    expect(() => parseRepo({ ...repo, modules: [] })).toThrow(/no modules/);
    expect(() => parseRepo({ ...repo, modules: [{ id: 'Bad Id', path: 'x' }] })).toThrow(/not valid/);
  });
  it('rejects a manifest whose id does not match mm.json', () => {
    expect(() => parseModule({ ...manifest, id: 'other' }, 'season-1')).toThrow(/mm.json lists/);
    expect(() => parseModule({ ...manifest, format: 'mm-module/2' }, 'season-1')).toThrow(/mm-module\/1/);
  });
});

describe('loadRepo', () => {
  it('reads mm.json and each module manifest from the site', async () => {
    const fetcher = site({
      'https://a.io/mm/mm.json': repo,
      'https://a.io/mm/season-1/module.json': manifest,
    });
    const out = await loadRepo('https://a.io/mm/', fetcher, () => 42);
    expect(out.base).toBe('https://a.io/mm/');
    expect(out.modules).toEqual([{ base: 'https://a.io/mm/', id: 'season-1', fetchedAt: 42, manifest }]);
  });
  it('reports a missing module clearly', async () => {
    const fetcher = site({ 'https://a.io/mm/mm.json': repo });
    await expect(loadRepo('https://a.io/mm/', fetcher)).rejects.toThrow(/season-1\/module.json \(404\)/);
  });
});
