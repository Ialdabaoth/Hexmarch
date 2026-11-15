// Hexmarch procedures runner (EVENTS_FORMAT.md, Heph 2026-11-15: "Procedures lives primarily in the Atlas").
// A module's events speak in fiction (triggers, d6/d20 tables, macro names); each ruleset's procedures speak in mechanics.
// load() gathers both and reports anything missing; ask() answers the Atlas's questions (travel, sight-range); run()
// runs a procedure or a trigger into one Events log entry. Nothing here touches the page: the Atlas applies the effects.
// Plain script: the Atlas page inlines it (atlas_app.py), and node tests require() it.
(function (root) {
  'use strict';
  const DEPTH = 6;  // calls and nested tables share one depth limit, so a loop can never hang the app (section 3)
  const isObj = x => x && typeof x === 'object' && !Array.isArray(x);

  // rules: the rules modules' procedures files, built into the page; mod: the module's events.json (build.py), or null
  function load(ruleset, rules, mod) {
    const report = [], procs = {}, aliases = {}, macros = {}, vocab = {}, tables = {}, triggers = [];
    const serves = f => isObj(f) && Array.isArray(f.rules) && f.rules.includes(ruleset);
    // lookup order (section 3): the module's procedures, then the ruleset's; aliases from either, then lookup again
    const layers = [];
    for (const [name, f] of Object.entries((mod && mod.procedures) || {})) if (serves(f)) layers.push({ from: `module ${name}`, f });
    for (const f of rules || []) if (serves(f)) layers.push({ from: f.source || 'ruleset', f });
    for (const { f } of layers) {
      for (const [k, v] of Object.entries(f.procedures || {})) if (!(k in procs)) procs[k] = v;
      for (const [k, v] of Object.entries(f.aliases || {})) if (!(k in aliases)) aliases[k] = v;
      for (const [k, v] of Object.entries(f.macros || {})) macros[k] = Object.assign({}, v, macros[k] || {});
    }
    const ev = (mod && mod.events) || {};
    for (const t of Array.isArray(ev.triggers) ? ev.triggers : []) if (isObj(t) && t.id && !t.off) triggers.push(t);
    // a ruleset's own triggers (its procedures files' "triggers", such as E9's lost check each shift); a module trigger with the same id wins
    for (const { from, f } of layers) for (const t of Array.isArray(f.triggers) ? f.triggers : []) if (isObj(t) && t.id && !t.off && !triggers.some(x => x.id === t.id)) triggers.push(Object.assign({ from }, t));
    Object.assign(tables, isObj(ev.tables) ? ev.tables : {});
    Object.assign(vocab, isObj(ev.macros) ? ev.macros : {});
    for (const w of (mod && mod.report) || []) report.push(w);
    const lib = { ruleset, procs, aliases, macros, vocab, tables, triggers, report, calendar: ev.calendar || null };
    // the contract (section 3): every name events.json uses resolves for this ruleset, and every macro name expands
    const names = new Set();
    const walk = x => { if (Array.isArray(x)) x.forEach(walk); else if (isObj(x)) { if (typeof x.call === 'string') names.add(x.call); Object.values(x).forEach(walk); } };
    walk(triggers); walk(tables);
    for (const n of names) if (!find(lib, n)) report.push(`"${n}" is not a procedure of ${ruleset}`);
    for (const [k, vals] of Object.entries(vocab)) for (const v of Array.isArray(vals) ? vals : []) if (!(macros[k] && v in macros[k])) report.push(`macro ${k}: "${v}" has no meaning in ${ruleset}`);
    for (const t of triggers) if (t.run && t.run.table && !tables[t.run.table]) report.push(`trigger "${t.id}": no table "${t.run.table}"`);
    return lib;
  }

  function find(lib, name) {
    if (lib.procs[name]) return { name, p: lib.procs[name] };
    const a = lib.aliases[name];
    return a && lib.procs[a] ? { name: a, p: lib.procs[a] } : null;
  }

  // dice: "2d6+1", "d20", "3"; rng() is in [0, 1)
  function dice(expr, rng) {
    const s = String(expr).replace(/\s+/g, ''), m = s.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!m) return /^-?\d+(\.\d+)?$/.test(s) ? { total: +s, rolls: [] } : null;
    const n = +(m[1] || 1), d = +m[2], rolls = [];
    for (let i = 0; i < Math.min(n, 100); i++) rolls.push(1 + Math.floor(rng() * d));
    return { total: rolls.reduce((a, b) => a + b, 0) + +(m[3] || 0), rolls };
  }

  // {who}, {threat}, {threat.damage}: a macro argument reads as its name, and its fields as the ruleset's meaning
  function fill(t, vars) {
    return String(t).replace(/\{([\w-]+)(?:\.([\w-]+))?\}/g, (all, a, b) => {
      const v = vars[a];
      if (b) return v && isObj(v.meaning) && b in v.meaning ? String(v.meaning[b]) : isObj(v) && b in v ? String(v[b]) : all;
      return v === undefined ? all : isObj(v) ? String(v.name ?? v.total ?? all) : String(v);
    });
  }
  // a template, then plain arithmetic if that is what it became ("{mi} * {pace} / 3" -> 1.5): numbers, + - * / and brackets only
  function arith(t) {
    const tok = t.match(/\d+(?:\.\d+)?|[-+*/()]/g); if (!tok || tok.join('') !== t.replace(/\s+/g, '')) return null;
    let i = 0;
    const atom = () => { const x = tok[i++]; if (x === '(') { const v = sum(); if (tok[i++] !== ')') throw 0; return v; } if (x === '-') return -atom(); if (x === undefined || isNaN(+x)) throw 0; return +x; };
    const prod = () => { let v = atom(); while (tok[i] === '*' || tok[i] === '/') { const o = tok[i++], w = atom(); v = o === '*' ? v * w : v / w; } return v; };
    const sum = () => { let v = prod(); while (tok[i] === '+' || tok[i] === '-') { const o = tok[i++], w = prod(); v = o === '+' ? v + w : v - w; } return v; };
    try { const v = sum(); return i === tok.length && isFinite(v) ? v : null; } catch (e) { return null; }
  }
  const value = (x, vars) => { if (typeof x !== 'string') return x; const f = fill(x, vars); if (/^-?\d+(\.\d+)?$/.test(f)) return +f; const a = /[-+*/]/.test(f) ? arith(f) : null; return a === null ? f : a; };

  // the arguments a call passes: fiction only. A macro name becomes {name, meaning} so templates read either.
  function args(lib, w, vars) {
    const out = {};
    for (const [k, v] of Object.entries(w || {})) {
      const val = value(v, vars);
      out[k] = lib.vocab[k] && typeof val === 'string' ? { name: val, meaning: (lib.macros[k] || {})[val] || {} } : val;
    }
    return out;
  }

  function newEntry(name) { return { proc: name, text: [], players: [], rolls: [], effects: [], warnings: [] }; }

  // run a procedure by name into entry; returns its result (a `result` step), if any
  function call(lib, name, w, ctx, entry, depth) {
    if (depth > DEPTH) { entry.warnings.push(`stopped at "${name}": deeper than ${DEPTH} calls`); return undefined; }
    const f = find(lib, name);
    if (!f) { entry.warnings.push(`"${name}" is not a procedure of ${lib.ruleset}`); return undefined; }
    const vars = Object.assign({}, ctx.vars || {}, w);
    for (const p of f.p.params || []) if (!(p in vars)) vars[p] = '';
    return steps(lib, f.p.steps || [], vars, ctx, entry, depth);
  }

  function say(step, vars, entry) {
    if (step.text) entry.text.push(fill(step.text, vars));
    if (step.show && step.players) entry.players.push(fill(step.players, vars));
  }

  function steps(lib, list, vars, ctx, entry, depth) {
    let result;
    for (const s of list) {
      if (!isObj(s)) continue;
      if ('result' in s) { result = answerOf(s.result, vars); continue; }
      if (s.walk) {  // once per hex of the route, by the app that knows the map (ctx.walk). "stop": "queued" (the default) stops at the first hex where
        // something joins the queue, "never" goes on to the end; a `halt` effect in the walked procedure stops it there either way
        if (!ctx.walk) { entry.warnings.push(`"${s.walk}" needs a map to walk`); continue; }
        // "then": procedures run in each hex after the walked one, with the same params; the Atlas skips them in a dry run (previews,
        // estimates), so the walked procedure stays roll-free and the rolls along the way live in these
        ctx.walk(s.walk, vars, (name, w) => { const e = newEntry(name); const r = call(lib, name, w, Object.assign({}, ctx, { vars: {} }), e, depth + 1); return Object.assign(e, { result: r }); }, entry, s.stop === 'never' ? 'never' : 'queued',
          (Array.isArray(s.then) ? s.then : s.then ? [s.then] : []).filter(x => typeof x === 'string'));
        say(s, vars, entry); continue;
      }
      if (s.each) {  // a roll for every party member in a mode ("*": everyone), each at the `vs` grade eased by the Help they get
        // (ctx.party [{id, name, modes, ease: {mode: steps}}]); "combine" any (one success), all (every one), or each (per member):
        // the answer {pass, passed: [names], failed: [names], n} branches, and an effect with "for": "<as>.failed" targets each
        const everyone = s.each === '*' || s.each === 'everyone', ms = (Array.isArray(ctx.party) ? ctx.party : []).filter(m => isObj(m) && (everyone || (Array.isArray(m.modes) && m.modes.includes(s.each))));
        const passed = [], failed = [];
        for (const m of ms) {
          const em = s.ease || (everyone ? '' : s.each), vs = ease(value(s.vs, vars), em ? +((m.ease || {})[em] || 0) : 0, s.floor || 'easy');  // "ease": whose Help counts
          const r = rollOne(lib, s.roll, vs, m.name || m.id, ctx, entry, depth);
          if (r) entry.rolls[entry.rolls.length - 1] = Object.assign(entry.rolls[entry.rolls.length - 1], { who: m.name || m.id, ...(vs !== undefined && vs !== '' ? { vs } : {}), ...(s.secret ? { secret: true } : {}) });
          (r && r.pass === true ? passed : failed).push(m.name || m.id);
        }
        const how = s.combine === 'all' || s.combine === 'each' ? s.combine : 'any';
        const out = { pass: how === 'any' ? passed.length > 0 : failed.length === 0, passed, failed, n: ms.length };
        if (s.as) vars[s.as] = out; vars.roll = passed.length + '/' + ms.length; say(s, vars, entry); continue;
      }
      if (s.role) { vars.who = vars[s.role] || (ctx.roles && ctx.roles[s.role]) || s.role; say(s, vars, entry); continue; }
      if (s.roll) {
        const r = rollOne(lib, value(s.roll, vars), value(s.vs, vars), vars.who, ctx, entry, depth);
        if (r && s.show && entry.rolls.length) entry.rolls[entry.rolls.length - 1].show = true;
        if (s.as) vars[s.as] = r;
        vars.roll = r ? r.total : '?'; say(s, vars, entry); continue;
      }
      if (s.branch) {
        const r = vars[s.branch];
        let pick;
        if (Array.isArray(s.ranges)) { const n = r && typeof r.total === 'number' ? r.total : NaN; pick = (s.ranges.find(x => Array.isArray(x.roll) && n >= x.roll[0] && n <= (x.roll[1] ?? x.roll[0])) || {}).steps; }
        else if (r && typeof r.pass === 'boolean') pick = r.pass ? s.pass : s.fail;
        else { entry.warnings.push(`can't tell how "${s.branch}" went; neither branch ran`); continue; }
        result = steps(lib, pick || [], vars, ctx, entry, depth) ?? result; continue;
      }
      if (s.table) { table(lib, value(s.table, vars), vars, ctx, entry, depth + 1); say(s, vars, entry); continue; }
      if (s.call) { const r = call(lib, s.call, args(lib, s.with, vars), ctx, entry, depth + 1); if (s.as) vars[s.as] = r; say(s, vars, entry); continue; }
      if (s.effect) {  // the fixed list (section 7); the Atlas applies what it can and lists the rest. "for": "r.failed" makes one per name
        const list = s.for ? path(vars, s.for) : [null];
        for (const name of Array.isArray(list) ? list : []) {
          if (name !== null) { vars.who = name; vars.target = name; }
          const e = { effect: s.effect };
          for (const [k, v] of Object.entries(s)) if (!['effect', 'text', 'players', 'show', 'for'].includes(k)) e[k] = value(v, vars);
          if (name !== null && e.target === undefined) e.target = name;
          if (typeof e.amount === 'string') { const d = dice(e.amount, ctx.rng); if (d) e.amount = d.total; }
          vars.amount = e.amount; entry.effects.push(e); say(s, vars, entry);
        }
        continue;
      }
      say(s, vars, entry);  // note, or a step with only text
    }
    return result;
  }

  // dice ("2d6") or a ruleset roll (save, attack, check: its own procedure answers {total, pass}), logged; undefined: no answer
  function rollOne(lib, roll, vs, who, ctx, entry, depth) {
    const d = dice(roll, ctx.rng);
    if (d) { entry.rolls.push({ roll: String(roll), total: d.total, rolls: d.rolls }); return d; }
    const k = entry.rolls.length, got = call(lib, roll, { vs, who }, ctx, entry, depth + 1), r = isObj(got) ? got : got === undefined ? undefined : { total: got };
    const inner = entry.rolls.splice(k).map(x => x.total);  // the check's own dice go inside its one log line
    if (r === undefined) entry.warnings.push(`no answer for the ${roll} roll${who ? ' (' + who + ')' : ''}; the referee decides`);
    else entry.rolls.push({ roll, ...(inner.length ? { dice: inner } : {}), ...r });
    return r;
  }
  // a grade made n steps easier, never past the floor (E9 Help: never past easy); impossible and automatic stay as they are
  const GRADES = ['impossible', 'hard', 'normal', 'easy', 'automatic'];
  function ease(g, n, floor) {
    const k = GRADES.indexOf(g), f = GRADES.indexOf(floor); if (!n || k < 1 || k >= 4) return g;
    return GRADES[Math.max(k, Math.min(k + n, f < 0 ? 3 : f))];
  }
  const path = (vars, p) => String(p).replace(/^\{|\}$/g, '').split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);

  // {"result": 3} or {"result": {"by": "terrain", "of": {...}, "else": 3}}
  function answer(r, vars) {
    if (!isObj(r)) return r;
    if (r.by) { const k = vars[r.by]; return r.of && k != null && k in r.of ? r.of[k] : r.else; }
    return r;
  }
  function answerOf(r, vars) { return typeof r === 'string' ? value(r, vars) : answer(r, vars); }

  // a d20 or d6 table (MODULE_FORMAT.md section 6); a big one is a d6 choosing among d20 sub-tables
  function table(lib, id, vars, ctx, entry, depth) {
    if (depth > DEPTH) { entry.warnings.push(`stopped at table "${id}": deeper than ${DEPTH}`); return; }
    let t = typeof id === 'string' ? lib.tables[id] : id;
    if (!isObj(t)) { entry.warnings.push(`no table "${id}"`); return; }
    if (isObj(t.sub)) { const d = dice('d6', ctx.rng); entry.rolls.push({ roll: 'd6', total: d.total, table: t.id || id }); t = t.sub[String(d.total)]; if (!isObj(t)) { entry.warnings.push(`table "${id}" has no sub-table ${d.total}`); return; } }
    const die = t.die === 'd6' ? 'd6' : 'd20', d = dice(die, ctx.rng);
    entry.rolls.push({ roll: die, total: d.total, table: t.id || id });
    const row = (t.rows || []).find(x => Array.isArray(x.roll) && d.total >= x.roll[0] && d.total <= (x.roll[1] ?? x.roll[0]));
    if (!row) { entry.warnings.push(`table "${t.id || id}" has no row for ${d.total}`); return; }
    if (row.text) entry.text.push(fill(row.text, vars));
    if (row.call) call(lib, row.call, args(lib, row.with, vars), ctx, entry, depth + 1);
    if (row.table) table(lib, row.table, vars, ctx, entry, depth + 1);
  }

  // a question the Atlas asks (travel, sight-range): silent, no log; undefined when the ruleset has no answer
  function ask(lib, name, w) {
    if (!lib || !find(lib, name)) return undefined;
    const entry = newEntry(name);
    const r = call(lib, name, w || {}, { rng: () => 0.5, vars: {} }, entry, 0);
    return r === undefined || isObj(r) ? undefined : r;
  }

  // a trigger's run ({table} or {call, with}), or a procedure by name, into one log entry
  function run(lib, what, ctx) {
    ctx = Object.assign({ rng: Math.random, vars: {}, roles: {} }, ctx || {});
    if (typeof what === 'string') { const e = newEntry(what); call(lib, what, {}, ctx, e, 0); return e; }
    const t = what || {}, r = t.run || {}, e = newEntry(t.label || t.id || r.call || r.table || '?');
    if (t.id) e.trigger = t.id;
    if (r.table) table(lib, r.table, Object.assign({}, ctx.vars), ctx, e, 1);
    else if (r.call) call(lib, r.call, args(lib, r.with, ctx.vars), ctx, e, 0);
    else e.warnings.push('this trigger runs nothing');
    return e;
  }

  // what a procedure will roll, without rolling: each roll step's label (or its dice), through the calls it makes and the tables it uses
  function rollsOf(lib, name, depth = 0, seen = new Set()) {
    const f = find(lib, name); if (!f || depth > DEPTH || seen.has(f.name)) return []; seen.add(f.name);
    const out = [], walk = list => { for (const s of list || []) { if (!isObj(s)) continue;
      if (s.roll) out.push(s.label || (dice(s.roll, () => 0) ? s.roll : s.roll + ' roll'));
      if (s.table) out.push((lib.tables[s.table] || {}).title || s.table);
      if (s.call) out.push(...rollsOf(lib, s.call, depth + 1, seen));
      if (s.walk) out.push(...rollsOf(lib, s.walk, depth + 1, seen));
      for (const t of Array.isArray(s.then) ? s.then : s.then ? [s.then] : []) out.push(...rollsOf(lib, t, depth + 1, seen));
      walk(s.pass); walk(s.fail); for (const x of s.ranges || []) walk(x.steps); } };
    walk(f.p.steps); return out;
  }
  // what a procedure offers where (section 7, "Offers"): [{name, label, about, default}] for a context such as "hex"
  function offers(lib, where) {
    return Object.entries(lib.procs).filter(([, p]) => p && p.offer === where).map(([name, p]) => ({ name, label: p.label || name, about: p.about || '', default: p.default === true }));
  }

  const api = { load, ask, run, dice, fill, value, rollsOf, offers, DEPTH };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.HexmarchProcedures = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
