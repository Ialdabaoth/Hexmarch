import { describe, expect, it } from 'vitest';
import { atlasUrl, isAtlasMessage, partyHex } from './atlas';

describe('atlas', () => {
  it('builds the Atlas address for a module', () => {
    expect(atlasUrl('https://ialdabaoth.github.io/MateriaMundiRPG/', 'isle-of-mists')).toBe('https://ialdabaoth.github.io/MateriaMundiRPG/atlas/?module=isle-of-mists');
  });

  it('accepts view and party messages', () => {
    expect(isAtlasMessage({ type: 'e9-atlas', event: 'view', module: 'isle-of-mists', hash: '#world:6847:C587' })).toBe(true);
    expect(isAtlasMessage({ type: 'e9-atlas', event: 'view', module: 'isle-of-mists', hash: '#march:0907' })).toBe(true);
    expect(isAtlasMessage({ type: 'e9-atlas', event: 'party', module: 'isle-of-mists', hex: 'world:6947:25B2', hours: 0.4 })).toBe(true);
    expect(isAtlasMessage({ type: 'e9-atlas', event: 'party', module: 'isle-of-mists', hex: null, hours: 0 })).toBe(true);
  });

  it('refuses anything else', () => {
    expect(isAtlasMessage(null)).toBe(false);
    expect(isAtlasMessage({ type: 'mm-viewer', event: 'view', module: 'x', hash: '#world' })).toBe(false);
    expect(isAtlasMessage({ type: 'e9-atlas', event: 'view', module: 'x', hash: 'javascript:alert(1)' })).toBe(false);
    expect(isAtlasMessage({ type: 'e9-atlas', event: 'party', module: 'x', hex: 'world:6947:25I2', hours: 0 })).toBe(false);
    expect(isAtlasMessage({ type: 'e9-atlas', event: 'party', module: 'x', hex: 'world:6947:25B2', hours: -1 })).toBe(false);
    expect(isAtlasMessage({ type: 'e9-atlas', event: 'party', module: '../x', hex: null, hours: 0 })).toBe(false);
  });

  it('reads old party positions as legacy links', () => {
    const at = { base: 'b', module: 'isle-of-mists', label: '' };
    expect(partyHex({ ...at, map: 'atlas', hex: 'world:6947:25B2' })).toBe('world:6947:25B2');
    expect(partyHex({ ...at, map: 'world', hex: '0706' })).toBe('legacy:world:0706');
    expect(partyHex({ ...at, map: 'l-1330', hex: '0405' })).toBe('legacy:l-1330');
  });
});
