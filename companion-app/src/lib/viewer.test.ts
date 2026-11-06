import { describe, expect, it } from 'vitest';
import { isViewerMessage } from './viewer';

const hex = {
  type: 'mm-viewer', event: 'hex', module: 'season-1', version: 'v0.1.0', hash: '#world:0533', map: 'world', hex: '0533',
  scale: '3-mile hex', terrain: 'grass', sites: [{ slug: 'callainn', name: 'Callainn', href: '#p-callainn--callainn' }]
};

describe('isViewerMessage', () => {
  it('accepts view and hex messages', () => {
    expect(isViewerMessage({ type: 'mm-viewer', event: 'view', module: 'season-1', hash: '#atlas-3', map: 'world' })).toBe(true);
    expect(isViewerMessage(hex)).toBe(true);
    expect(isViewerMessage({ ...hex, terrain: null, map: 'p-an-uaimh' })).toBe(true);
    expect(isViewerMessage({ type: 'mm-viewer', event: 'select', module: 'season-1', hash: '#p-an-uaimh' })).toBe(true);
    expect(isViewerMessage({ type: 'mm-viewer', event: 'view', module: 'season-1', hash: '#atlas-3', map: 'world', title: 'Atlas page 3', small: 'hex 0105' })).toBe(true);
  });

  it('accepts tools and key messages', () => {
    expect(isViewerMessage({ type: 'mm-viewer', event: 'tools', module: 'isle-of-mists', lang: 'ga', langs: [{ value: 'ga', label: 'Gaeilge' }, { value: 'en', label: 'English' }], edges: true, zoom: 32 })).toBe(true);
    expect(isViewerMessage({ type: 'mm-viewer', event: 'key', module: 'isle-of-mists', hash: '#world', terrain: [], places: [], creatures: [] })).toBe(true);
    expect(isViewerMessage({ type: 'mm-viewer', event: 'tools', module: 'isle-of-mists', lang: 'ga', langs: 'ga', edges: true, zoom: 32 })).toBe(false);
    expect(isViewerMessage({ type: 'mm-viewer', event: 'key', module: 'isle-of-mists', hash: '#world', terrain: {}, places: [], creatures: [] })).toBe(false);
  });

  it('refuses anything else', () => {
    expect(isViewerMessage(null)).toBe(false);
    expect(isViewerMessage('mm-viewer')).toBe(false);
    expect(isViewerMessage({ ...hex, type: 'other' })).toBe(false);
    expect(isViewerMessage({ ...hex, hex: '53' })).toBe(false);
    expect(isViewerMessage({ ...hex, map: '../x' })).toBe(false);
    expect(isViewerMessage({ ...hex, sites: [{ name: 1 }] })).toBe(false);
    expect(isViewerMessage({ ...hex, event: 'boom' })).toBe(false);
    expect(isViewerMessage({ type: 'mm-viewer', event: 'select', module: 'season-1', hash: 'javascript:alert(1)' })).toBe(false);
    expect(isViewerMessage({ type: 'mm-viewer', event: 'view', module: 'season-1', hash: '#world', map: 'world', title: 7 })).toBe(false);
  });
});
