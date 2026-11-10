import { describe, expect, it } from 'vitest';
import { appsScriptCode, appsScriptStore, fileUrl, githubStore, newKey, servicesFor, upload } from './adapters';
import { checkUpload, pointer } from './publish';

const files = { 'campaign.json': { a: 1 }, 'snapshot.json': { revision: 2, name: 'Ó Néill' } };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('github store', () => {
  it('reads owner/repo in its usual spellings, and refuses others', () => {
    expect(githubStore('https://github.com/heph/kells-1422.git', '/play/')).toEqual({ kind: 'github', owner: 'heph', repo: 'kells-1422', branch: 'main', dir: 'play' });
    expect(() => githubStore('kells')).toThrow(/owner\/name/);
    expect(() => githubStore('heph/kells', 'a b')).toThrow(/folder/);
  });

  it('gives raw addresses players can read, and the pointer names the adapter', () => {
    const s = servicesFor(githubStore('heph/kells', 'c1'));
    expect(s.read).toBe('https://raw.githubusercontent.com/heph/kells/main/c1/snapshot.json');
    expect(s.pointer).toBe('https://raw.githubusercontent.com/heph/kells/main/c1/campaign.json');
    expect(s.folder).toBe('https://raw.githubusercontent.com/heph/kells/main/c1/');
    expect(pointer('c', 'C', s).adapters.store).toBe('github');
  });

  it('creates new files and replaces old ones by their sha', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === 'https://api.github.com/repos/heph/kells') return json(200, { private: false, default_branch: 'main' });
      if (url.endsWith('/branches/main')) return json(200, {});
      if (!init?.method) return url.includes('campaign.json') ? json(200, { sha: 'abc' }) : json(404, { message: 'Not Found' });
      return json(201, {});
    }) as typeof fetch;
    expect(await upload(githubStore('heph/kells', 'c1'), ' tok ', files, 'Publish', f)).toBe(true);
    const puts = calls.filter((c) => c.init?.method === 'PUT');
    expect(puts.map((c) => c.url)).toEqual([
      'https://api.github.com/repos/heph/kells/contents/c1/campaign.json',
      'https://api.github.com/repos/heph/kells/contents/c1/snapshot.json'
    ]);
    const [a, b] = puts.map((c) => JSON.parse(String(c.init!.body)));
    expect(a.sha).toBe('abc');
    expect(b.sha).toBeUndefined();
    expect(new TextDecoder().decode(Uint8Array.from(atob(b.content), (ch) => ch.charCodeAt(0)))).toContain('Ó Néill');
    expect((puts[0].init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('says what went wrong', async () => {
    const f = (async () => json(401, { message: 'Bad credentials' })) as unknown as typeof fetch;
    await expect(upload(githubStore('heph/kells'), 'tok', files, 'x', f)).rejects.toThrow(/refused the key/);
    await expect(upload(githubStore('heph/kells'), '', files)).rejects.toThrow(/token/);
    const missing = (async () => json(404, { message: 'Not Found' })) as unknown as typeof fetch;
    await expect(upload(githubStore('heph/kells'), 'tok', files, 'x', missing)).rejects.toThrow(/doesn't know the repository heph\/kells/);
    const secret = (async () => json(200, { private: true })) as unknown as typeof fetch;
    await expect(upload(githubStore('heph/kells'), 'tok', files, 'x', secret)).rejects.toThrow(/private/);
  });

  it('writes the first files of a brand-new repository without naming a branch', async () => {
    const puts: Record<string, unknown>[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      if (url === 'https://api.github.com/repos/heph/kells') return json(200, { private: false, default_branch: 'main' });
      if (url.endsWith('/branches/main')) return json(404, { message: 'Branch not found' });
      if (url.includes('/commits')) return json(409, { message: 'Git Repository is empty.' });
      if (init?.method === 'PUT') return puts.push(JSON.parse(String(init.body))), json(201, {});
      return json(404, {});
    }) as typeof fetch;
    await upload(githubStore('heph/kells'), 'tok', files, 'x', f);
    expect(puts[0].branch).toBeUndefined();
    expect(puts[1].branch).toBe('main');
  });

  it('names a missing branch', async () => {
    const f = (async (url: string) =>
      url.endsWith('/kells') ? json(200, { default_branch: 'main' }) : url.includes('/commits') ? json(200, []) : json(404, {})) as unknown as typeof fetch;
    await expect(upload(githubStore('heph/kells', '', 'play'), 'tok', files, 'x', f)).rejects.toThrow(/no branch called play/);
  });
});

describe('apps script store', () => {
  it('takes only a deployed web app address', () => {
    expect(appsScriptStore('https://script.google.com/macros/s/AKfy/exec?x=1').url).toBe('https://script.google.com/macros/s/AKfy/exec');
    expect(() => appsScriptStore('https://script.google.com/macros/s/AKfy/dev')).toThrow(/exec/);
    expect(fileUrl(appsScriptStore('https://script.google.com/macros/s/A/exec'), 'snapshot.json')).toBe('https://script.google.com/macros/s/A/exec?file=snapshot.json');
  });

  it('posts both files as text/plain, and reports a wrong key', async () => {
    let sent: RequestInit | undefined;
    const ok = (async (_u: string, init?: RequestInit) => ((sent = init), json(200, { ok: true }))) as typeof fetch;
    await upload(appsScriptStore('https://script.google.com/macros/s/A/exec'), 'k', files, 'x', ok);
    expect((sent!.headers as Record<string, string>)['Content-Type']).toMatch(/^text\/plain/);
    expect(JSON.parse(String(sent!.body))).toMatchObject({ action: 'publish', key: 'k' });
    const bad = (async () => json(200, { ok: false, error: 'key' })) as unknown as typeof fetch;
    await expect(upload(appsScriptStore('https://script.google.com/macros/s/A/exec'), 'k', files, 'x', bad)).rejects.toThrow(/key/);
  });

  it('the script itself publishes and serves the files (run against a stand-in Drive)', () => {
    const key = newKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const drive = new Map<string, string>();
    const file = (name: string) => ({ setContent: (t: string) => drive.set(name, t), getBlob: () => ({ getDataAsString: () => drive.get(name)! }) });
    const folder = {
      getId: () => 'F',
      createFolder: () => folder,
      getFilesByName: (n: string) => ({ hasNext: () => drive.has(n), next: () => file(n) }),
      createFile: (n: string, t: string) => drive.set(n, t)
    };
    const props = new Map<string, string>();
    const env = {
      PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => props.set(k, v) }) },
      DriveApp: { getFolderById: () => folder, getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => folder },
      ScriptApp: { getScriptId: () => 'S' },
      LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ text: t, setMimeType() { return this; } }) }
    };
    const run = new Function(...Object.keys(env), `${appsScriptCode(key)}\nreturn { doGet, doPost };`);
    const { doGet, doPost } = run(...Object.values(env)) as { doGet: (e: unknown) => { text: string }; doPost: (e: unknown) => { text: string } };
    const post = (b: unknown) => JSON.parse(doPost({ postData: { contents: JSON.stringify(b) } }).text);
    expect(JSON.parse(doGet({ parameter: { file: 'snapshot.json' } }).text)).toEqual({ ok: false, error: 'missing' });
    expect(post({ action: 'publish', key: 'wrong', files: {} })).toEqual({ ok: false, error: 'key' });
    expect(post({ action: 'publish', key, files: { 'snapshot.json': '{"revision":1}', 'evil.js': 'x' } })).toEqual({ ok: true });
    expect(post({ action: 'publish', key, files: { 'snapshot.json': '{"revision":2}' } })).toEqual({ ok: true });
    expect(JSON.parse(doGet({ parameter: { file: 'snapshot.json' } }).text)).toEqual({ revision: 2 });
    expect(drive.has('evil.js')).toBe(false);
  });

  it("the Test button counts the script's not-yet-published answer as missing", async () => {
    const f = (async () => json(200, { ok: false, error: 'missing' })) as unknown as typeof fetch;
    const s = servicesFor(appsScriptStore('https://script.google.com/macros/s/A/exec'));
    const r = await checkUpload(s, { pointer: pointer('c', 'C', s), snapshot: { revision: 1 } as never }, f);
    expect(r).toEqual({ pointer: 'missing', snapshot: 'missing' });
  });
});
