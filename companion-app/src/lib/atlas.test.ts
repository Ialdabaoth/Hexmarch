import { describe, expect, it } from 'vitest';
import { atlasUrl, isAtlasMessage } from './atlas';

describe('atlas', () => {
  it('builds the Atlas address for a module', () => {
    expect(atlasUrl('https://ialdabaoth.github.io/MateriaMundiRPG/', 'isle-of-mists', 'https://ialdabaoth.github.io/apps/atlas/')).toBe(
      'https://ialdabaoth.github.io/apps/atlas/?module=isle-of-mists&site=https%3A%2F%2Fialdabaoth.github.io%2FMateriaMundiRPG%2F'
    );
  });

  it('accepts view and party messages', () => {
    expect(isAtlasMessage({ type: 'hexmarch-atlas', event: 'party-new', module: 'isle-of-mists', party: { id: 'p-kells', name: 'Kells' } })).toBe(true);
    expect(isAtlasMessage({ type: 'hexmarch-atlas', event: 'active', module: 'isle-of-mists', party: 'p-kells' })).toBe(true);
    expect(isAtlasMessage({ type: 'hexmarch-atlas', event: 'invite', module: 'isle-of-mists', party: 'p-kells' })).toBe(true);
    expect(isAtlasMessage({ type: 'hexmarch-atlas', event: 'view', module: 'isle-of-mists', hash: '#world:6847:C587' })).toBe(true);
    expect(isAtlasMessage({ type: 'hexmarch-atlas', event: 'view', module: 'isle-of-mists', hash: '#march:0907' })).toBe(true);
    expect(isAtlasMessage({ type: 'hexmarch-atlas', event: 'party', module: 'isle-of-mists', party: 'p-kells', hex: 'world:6947:25B2', hours: 0.4 })).toBe(true);
    expect(isAtlasMessage({ type: 'hexmarch-atlas', event: 'party', module: 'isle-of-mists', party: 'p-kells', hex: null, hours: 0 })).toBe(true);
  });

  it('refuses anything else', () => {
    expect(isAtlasMessage({ type: 'hexmarch-atlas', event: 'party', module: 'x', hex: null, hours: 0 })).toBe(false);
    expect(isAtlasMessage({ type: 'hexmarch-atlas', event: 'active', module: 'x', party: 'Not An Id' })).toBe(false);
    expect(isAtlasMessage({ type: 'hexmarch-atlas', event: 'party-new', module: 'x', party: { name: 'no id' } })).toBe(false);
    expect(isAtlasMessage(null)).toBe(false);
    expect(isAtlasMessage({ type: 'mm-viewer', event: 'view', module: 'x', hash: '#world' })).toBe(false);
    expect(isAtlasMessage({ type: 'hexmarch-atlas', event: 'view', module: 'x', hash: 'javascript:alert(1)' })).toBe(false);
    expect(isAtlasMessage({ type: 'hexmarch-atlas', event: 'party', module: 'x', party: 'p-kells', hex: 'world:6947:25I2', hours: 0 })).toBe(false);
    expect(isAtlasMessage({ type: 'hexmarch-atlas', event: 'party', module: 'x', party: 'p-kells', hex: 'world:6947:25B2', hours: -1 })).toBe(false);
    expect(isAtlasMessage({ type: 'hexmarch-atlas', event: 'party', module: '../x', party: 'p-kells', hex: null, hours: 0 })).toBe(false);
  });
});
