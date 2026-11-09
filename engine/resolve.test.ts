import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readManifest } from './manifest';
import { lockedVersions, lockfile, memoryRegistry, resolve } from './resolve';

const json = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const e9core = json('../modules/e9-core/module.json');
// mm-core comes from the data repo (scripts/data.sh); a copy in hand stands in when it hasn't been fetched
const mmPath = new URL('../modules/mm-core/module.json', import.meta.url);
const mmcore = existsSync(mmPath)
  ? JSON.parse(readFileSync(mmPath, 'utf8'))
  : { format: 'e9-rules/1', kind: 'rules', id: 'mm-core', version: '0.1.0', options: [{ id: 'e9', requires: { 'e9-core': '^0.1' } }] };

const btp = (v: string, extra = {}) => ({ format: 'mm-module/1', id: 'isle-of-mists', title: 'Beyond the Pale', version: v, requires: { 'mm-core': '^0.1' }, ...extra });
const campaign = (extra = {}) =>
  readManifest({ id: 'kells-1422', version: '0.1.0', kind: 'campaign', option: 'e9', requires: { 'mm-core': '^0.1', 'isle-of-mists': '^0.4' }, ...extra });

describe('resolve', () => {
  it('pulls in the root, its option and the modules, dependencies first', async () => {
    const reg = memoryRegistry([e9core, mmcore, btp('0.4.10'), btp('0.4.11')]);
    const r = await resolve(campaign(), reg);
    expect(r.problems).toEqual([]);
    expect(r.modules.map((m) => `${m.manifest.id}@${m.manifest.version}`)).toEqual([`e9-core@${e9core.version}`, 'mm-core@0.1.0', 'isle-of-mists@0.4.11']);
  });

  it('keeps the locked version while it still fits', async () => {
    const reg = memoryRegistry([e9core, mmcore, btp('0.4.10'), btp('0.4.11')]);
    const r = await resolve(campaign(), reg, { locked: { 'isle-of-mists': '0.4.10' } });
    expect(r.modules.find((m) => m.manifest.id === 'isle-of-mists')!.manifest.version).toBe('0.4.10');
  });

  it('reports a range nothing meets, and a module nobody publishes', async () => {
    const reg = memoryRegistry([e9core, mmcore, btp('0.4.11', { requires: { 'mm-core': '^0.2', 'hansa': '^0.1' } })]);
    const r = await resolve(campaign({ requires: { 'mm-core': '^0.1', 'isle-of-mists': '^0.4' } }), reg);
    expect(r.problems).toContainEqual(expect.objectContaining({ kind: 'blocked', id: 'mm-core' }));
    expect(r.problems).toContainEqual(expect.objectContaining({ kind: 'missing', id: 'hansa' }));
  });

  it('refuses two roots, and declared conflicts', async () => {
    const other = { format: 'e9-rules/1', kind: 'rules', id: 'ose-core', version: '1.0.0' };
    const clash = btp('0.4.11', { conflicts: { 'ose-core': '*' } });
    const r = await resolve(campaign({ requires: { 'mm-core': '^0.1', 'ose-core': '^1', 'isle-of-mists': '^0.4' } }), memoryRegistry([e9core, mmcore, other, clash]));
    expect(r.problems).toContainEqual({ kind: 'roots', roots: ['mm-core', 'ose-core'] });
    expect(r.problems).toContainEqual({ kind: 'conflict', id: 'isle-of-mists', with: 'ose-core', range: '*' });
  });

  it('writes a lockfile with manifest hashes that reads back', async () => {
    const top = campaign();
    const r = await resolve(top, memoryRegistry([e9core, mmcore, btp('0.4.11')]));
    const lock = await lockfile(top, r);
    expect(lock.format).toBe('e9-lock/1');
    expect(lock.modules.map((m) => m.id)).toEqual(['e9-core', 'mm-core', 'isle-of-mists']);
    expect(lock.modules[0].hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(lockedVersions(lock)['isle-of-mists']).toBe('0.4.11');
  });
});
