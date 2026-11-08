// E9 Bridge for Foundry VTT (v12, v13): the Foundry side of the e9-vtt/1 adapter protocol (ENCOUNTER_FORMAT.md section 14.2).
// The referee (a GM) opens the E9 Atlas from Foundry; the Atlas then sends commands here with window.postMessage.
// Only messages from that window, from the Atlas's own origin, carrying this session's pairing code, are obeyed, and only for a GM.
const MOD = 'e9-bridge', PROTOCOL = 'e9-vtt/1';
let atlas = null, pair = null;

Hooks.once('init', () => {
  game.settings.register(MOD, 'atlasUrl', {
    name: 'E9 Atlas address', hint: 'Where the E9 Atlas lives. Change it only for a copy of the Atlas you host yourself.',
    scope: 'world', config: true, type: String, default: 'https://ialdabaoth.github.io/MateriaMundiRPG/atlas/'
  });
  game.settings.register(MOD, 'folder', {
    name: 'Folder for map pictures', hint: 'Inside Foundry\'s data folder.', scope: 'world', config: true, type: String, default: 'e9-maps'
  });
});

// a button in the scene controls (left toolbar, token tools) opens the Atlas
Hooks.on('getSceneControlButtons', controls => {
  if (!game.user.isGM) return;
  const tool = { name: 'e9-atlas', title: 'Open the E9 Atlas', icon: 'fas fa-map', button: true, onClick: openAtlas, onChange: openAtlas };
  if (Array.isArray(controls)) controls.find(c => c.name === 'token')?.tools.push(tool);   // v12
  else if (controls.tokens) controls.tokens.tools['e9-atlas'] = { ...tool, order: 99 };   // v13
});

function atlasUrl() { return new URL(game.settings.get(MOD, 'atlasUrl')); }
function openAtlas() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(4));
  pair = Array.from(r, v => abc[v % abc.length]).join('');
  const u = atlasUrl(); u.searchParams.set('vtt', 'foundry'); u.searchParams.set('pair', pair);
  atlas = window.open(u.href, 'e9-atlas');
  ui.notifications.info(`E9 Atlas opened. Pairing code ${pair}: check that the Atlas shows the same code.`, { permanent: true });
}
globalThis.E9Bridge = { open: openAtlas };

window.addEventListener('message', async ev => {
  const d = ev.data;
  if (!atlas || ev.source !== atlas || ev.origin !== atlasUrl().origin || !d || d.protocol !== PROTOCOL || d.pair !== pair) return;
  const reply = body => atlas.postMessage({ protocol: PROTOCOL, pair, id: d.id, ...body }, ev.origin);
  if (!game.user.isGM) return reply({ ok: false, error: 'Only a GM can run E9 commands' });
  const fn = COMMANDS[d.cmd];
  if (!fn) return reply({ ok: false, error: `Unknown command ${d.cmd}` });
  try { reply({ ok: true, result: await fn(d.args || {}) }); }
  catch (err) { console.error('E9 Bridge', d.cmd, err); reply({ ok: false, error: err.message }); }
});

const FP = () => foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
const sceneOf = id => { const s = game.scenes.get(id); if (!s) throw new Error('That scene is gone'); return s; };
const DISPOSITION = { hostile: -1, neutral: 0, friendly: 1, secret: -2 };

const COMMANDS = {
  hello: () => ({ vtt: 'foundry', version: game.modules.get(MOD)?.version, foundry: game.version, system: game.system.id,
    can: ['scene', 'walls', 'doors', 'lights', 'tokens', 'move', 'hide', 'activate'] }),

  // build the scene from the Universal VTT file, or find the one built for this map before
  async 'scene.open'({ map, title, uvtt }) {
    let scene = game.scenes.find(s => s.getFlag(MOD, 'map') === map);
    if (!scene) {
      if (!uvtt) throw new Error('No map file sent');
      const px = uvtt.resolution.pixels_per_grid, [w, h] = [uvtt.resolution.map_size.x, uvtt.resolution.map_size.y];
      const ox = uvtt.resolution.map_origin?.x || 0, oy = uvtt.resolution.map_origin?.y || 0, ft = uvtt.e9?.grid?.ft || 5;
      const P = p => [Math.round((p.x - ox) * px), Math.round((p.y - oy) * px)];
      // the picture goes to the data folder; the scene points at it
      const dir = game.settings.get(MOD, 'folder'), name = map.replace(/[^a-z0-9-]+/gi, '-') + '.png';
      try { await FP().createDirectory('data', dir); } catch (e) { /* already there */ }
      const blob = await (await fetch('data:image/png;base64,' + uvtt.image)).blob();
      const up = await FP().upload('data', dir, new File([blob], name, { type: 'image/png' }), {}, { notify: false });
      const src = up?.path || `${dir}/${name}`;
      scene = await Scene.create({
        name: title || map, width: w * px, height: h * px, padding: 0,
        background: { src }, grid: { type: 1, size: px, distance: ft, units: 'ft' },
        tokenVision: true, fog: { exploration: true }, flags: { [MOD]: { map } }
      });
      const walls = [];
      for (const line of uvtt.line_of_sight || []) for (let k = 1; k < line.length; k++) walls.push({ c: [...P(line[k - 1]), ...P(line[k])] });
      for (const line of uvtt.objects_line_of_sight || []) for (let k = 1; k < line.length; k++) walls.push({ c: [...P(line[k - 1]), ...P(line[k])] });
      // doors: the e9 block keeps secret and locked; a plain Universal VTT portal is an ordinary door
      const e9doors = uvtt.e9?.doors || [];
      (uvtt.portals || []).forEach((pt, k) => { const d = e9doors[k] || {};
        walls.push({ c: [...P(pt.bounds[0]), ...P(pt.bounds[1])], door: d.secret ? 2 : 1, ds: d.locked ? 2 : pt.closed === false ? 1 : 0 }); });
      if (walls.length) await scene.createEmbeddedDocuments('Wall', walls);
      const lights = (uvtt.lights || []).map(l => { const [x, y] = P(l.position), dim = l.range * ft;
        return { x, y, config: { dim, bright: dim / 2, color: '#' + String(l.color || 'ffffffff').slice(-6), alpha: .4 } }; });
      if (lights.length) await scene.createEmbeddedDocuments('AmbientLight', lights);
    }
    return { scene: scene.id, link: `${location.origin}/game`, label: scene.name };  // the world's join page; the scene is named in vtt.json
  },

  async 'scene.activate'({ scene }) { await sceneOf(scene).activate(); return true; },

  // creatures: actorless tokens named after the creature (the E9 card stays the stat block for now)
  async 'tokens.spawn'({ scene, tokens }) {
    const s = sceneOf(scene), px = s.grid.size, out = {};
    const made = await s.createEmbeddedDocuments('Token', tokens.map(t => ({
      name: t.name, x: t.square[0] * px, y: t.square[1] * px, width: t.size || 1, height: t.size || 1,
      texture: { src: t.img || 'icons/svg/mystery-man.svg' }, hidden: !!t.hidden, actorLink: false,
      disposition: DISPOSITION[t.disposition] ?? -1, flags: { [MOD]: { id: t.id, creature: t.creature } }
    })));
    made.forEach((d, k) => { out[tokens[k].id] = d.id; });
    return { tokens: out };
  },

  // the "teleport": each player character's token goes to the next entrance square, made from the actor if it isn't on the scene
  async 'party.place'({ scene, squares, actors }) {
    const s = sceneOf(scene), px = s.grid.size, out = {};
    const list = actors === 'players' || !actors
      ? [...new Set(game.users.filter(u => !u.isGM && u.character).map(u => u.character))]
      : actors.map(id => game.actors.get(id) || game.actors.find(a => a.getFlag(MOD, 'character') === id)).filter(Boolean);
    for (const [k, actor] of list.entries()) {
      const sq = squares[k] || squares[squares.length - 1] || [0, 0], x = sq[0] * px, y = sq[1] * px;
      const tok = s.tokens.find(t => t.actorId === actor.id);
      if (tok) await tok.update({ x, y }, { animate: false });
      else { const data = (await actor.getTokenDocument({ x, y })).toObject(); const [d] = await s.createEmbeddedDocuments('Token', [data]); out[actor.id] = d.id; continue; }
      out[actor.id] = tok.id;
    }
    return { tokens: out };
  },

  async 'tokens.move'({ scene, moves }) {  // moves: [{id, square}], id is the E9 id or a Foundry token id
    const s = sceneOf(scene), px = s.grid.size;
    await s.updateEmbeddedDocuments('Token', moves.map(m => ({ _id: find(s, m.id).id, x: m.square[0] * px, y: m.square[1] * px })));
    return true;
  },
  async 'tokens.remove'({ scene, ids }) { const s = sceneOf(scene); await s.deleteEmbeddedDocuments('Token', ids.map(id => find(s, id).id)); return true; },
  async 'tokens.reveal'({ scene, ids }) { const s = sceneOf(scene); await s.updateEmbeddedDocuments('Token', ids.map(id => ({ _id: find(s, id).id, hidden: false }))); return true; },
  bye: () => { pair = null; atlas = null; return true; }
};

function find(scene, id) {
  const t = scene.tokens.get(id) || scene.tokens.find(t => t.getFlag(MOD, 'id') === id);
  if (!t) throw new Error(`No token ${id}`); return t;
}
