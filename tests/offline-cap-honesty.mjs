#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/offline-cap-honesty.mjs — THE CLIENT MAY PROMISE ONLY THE AWAY HOURS
//                                  THE SERVER PAYS (CLAUDE.md §6)
//
//   node tests/offline-cap-honesty.mjs             # the guard
//   node tests/offline-cap-honesty.mjs --selftest  # every mutation must be CAUGHT
//
// The away limit is hr_offline_cap_ms (chain end of tests/schema-apply-order.json).
// Until 2026-09-27 the client summed renown (+12h) and property (+4h) perks the
// server never paid, and printed the sum on six surfaces.
//
//   OCH-1  the chain-end hr_offline_cap_ms parses: a base and its `v_hours +` terms.
//   OCH-2  every `offlineHours` value under src/** (smoke excluded) equals a server
//          term of its source (clans.js clan, renown.js RANKS, homestead.js TIERS),
//          both ways; no other file may carry the key.
//   OCH-3  on CODE lines (classify() from comment-ratio-ratchet.mjs), no string
//          literal puts a number of hours or a percentage next to offline/away, or
//          raise/extend next to "away limit"/"offline cap", outside the allowlist.
//   OCH-4  legacy.js offlineCapHours reads G._vigour and no client perk; chain-end
//          hr_vigour_of floors at c_base_h*60 over hr_offline_cap_ms; the
//          2026-09-22 anchored patch projects vigour and is in the apply order.
//
// Credential-free, database-free. Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from './comment-ratio-ratchet.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const VIGOUR_PATCH = '2026-09-22-vigour-daily.sql';
const VIGOUR_ANCHOR = "'vigour', public.hr_vigour_of";

/* A private copy of codex-claims' chain-end reader (that one is module-private). */
function chainEndBody(order, sql, fn) {
  let body = null;
  for (const f of order) {
    const text = sql[f];
    if (typeof text !== 'string') continue;
    const re = new RegExp('^create or replace function public\\.' + fn + '\\s*\\(', 'gim');
    let m;
    while ((m = re.exec(text))) {
      const tag = /as\s+(\$[a-z_]*\$)/i.exec(text.slice(m.index));
      if (!tag) continue;
      const start = m.index + tag.index + tag[0].length;
      const end = text.indexOf(tag[1], start);
      if (end > start) body = { file: f, text: text.slice(start, end).replace(/--[^\n]*/g, '') };
    }
  }
  return body;
}

const walk = (dir, out = []) => {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) { if (p !== 'src/features/smoke') walk(p, out); } else if (p.endsWith('.js')) out.push(p);
  }
  return out;
};

export function loadWorld() {
  const order = JSON.parse(read('tests/schema-apply-order.json')).order;
  const sql = {};
  for (const f of order) { try { sql[f] = read('supabase/migrations/' + f); } catch (e) { /* not on disk */ } }
  const files = {};
  for (const p of walk('src')) files[p] = read(p);
  files['index.html'] = read('index.html');
  return { order, sql, files };
}

const sourceOf = (cond) => (/clan/i.test(cond) ? 'clan' : /renown/i.test(cond) ? 'renown'
  : /tier|property/i.test(cond) ? 'property' : 'unknown');

/* OCH-3's allowlist: file → literal text that is true (the server pays it). */
const ALLOW = [
  ['src/features/clans.js', /^\+1h offline cap$/], ['src/features/clans.js', /^\+2h offline cap$/],
  ['src/features/workers.js', /up to 24h/],
];
const PROMISE = [
  /\d+\s*(h|hrs?|hours?)\b[^'"`]{0,24}\b(offline|away)\b/i,
  /\d+\s*%[^'"`]{0,24}\b(offline|away)\b/i,
  /\b(rais(e|es|ing)|extends?)\b[^'"`]{0,24}\b(away limit|offline cap)\b/i,
  /\b(away (limit|max)|offline cap)\b[^'"`]{0,30}\b(rais(e|es|ing)|extends?)\b/i,
];
const LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\\n]|\\.)*`/g;

export function check(w) {
  const bad = [];
  const fail = (id, msg) => bad.push(id + ': ' + msg);

  // ── OCH-1 ──
  const cap = chainEndBody(w.order, w.sql, 'hr_offline_cap_ms');
  const baseM = cap && /c_base_h\s+constant\s+int\s*:=\s*(\d+)/i.exec(cap.text);
  if (!cap || !baseM) { fail('OCH-1', 'no chain-end hr_offline_cap_ms with a c_base_h constant'); return bad; }
  const baseH = Number(baseM[1]);
  const terms = [];
  const termRe = /if\s+([^;]*?)>=\s*(\d+)\s+then\s+v_hours\s*:=\s*v_hours\s*\+\s*(\d+)/gi;
  let t;
  while ((t = termRe.exec(cap.text))) terms.push({ src: sourceOf(t[1]), at: Number(t[2]), h: Number(t[3]) });
  terms.filter((x) => x.src === 'unknown').forEach((x) => fail('OCH-1', 'a term of unknown source at >= ' + x.at));

  // ── OCH-2 ──
  const want = (src) => terms.filter((x) => x.src === src).map((x) => x.at + ':' + x.h).sort().join(',');
  const client = { clan: [], renown: [], property: [] };
  const clans = w.files['src/features/clans.js'] || '';
  for (const m of clans.matchAll(/\{\s*offlineHours:\s*(\d+),\s*label:\s*'\+(\d+)h offline cap'\s*\},\s*\/\/\s*Lv(\d+)/g)) {
    if (m[1] !== m[2]) fail('OCH-2', 'clans.js Lv' + m[3] + ' label says +' + m[2] + 'h but pays ' + m[1]);
    client.clan.push(m[3] + ':' + m[1]);
  }
  for (const m of (w.files['src/features/renown.js'] || '').matchAll(/min:\s*(\d+),[^\n]*perk:\s*\{[^}\n]*offlineHours:\s*(\d+)/g)) client.renown.push(m[1] + ':' + m[2]);
  const hs = w.files['src/features/homestead.js'] || '';
  const tiers = hs.slice(hs.indexOf('var TIERS = ['), hs.indexOf('];', hs.indexOf('var TIERS = [')));
  let ti = -1;
  for (const line of tiers.split('\n')) {
    if (/\{\s*id:\s*'/.test(line)) ti++;
    const m = /offlineHours:\s*(\d+)/.exec(line);
    if (m && Number(m[1]) > 0) client.property.push(ti + ':' + m[1]);
  }
  for (const src of Object.keys(client)) {
    const got = client[src].sort().join(',');
    if (got !== want(src)) fail('OCH-2', src + ' offline hours client [' + got + '] != server [' + want(src) + ']');
  }
  for (const [p, text] of Object.entries(w.files)) {
    if (p === 'index.html' || /features\/(clans|renown|homestead)\.js$/.test(p)) continue;
    if (/offlineHours\s*:\s*[1-9]/.test(text)) fail('OCH-2', p + ' carries an offlineHours value no server term backs');
  }

  // ── OCH-3 ──
  for (const [p, text] of Object.entries(w.files)) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      const hits = (p === 'index.html' ? [line] : (line.match(LITERAL) || [])).filter((s) => PROMISE.some((re) => re.test(s)));
      if (!hits.length) return;
      if (p !== 'index.html') {                // CODE line only: classify's own verdict on this line
        const before = classify(lines.slice(0, i).join('\n')).code, upto = classify(lines.slice(0, i + 1).join('\n')).code;
        if (upto === before) return;
      }
      for (const s of hits) {
        const inner = s.replace(/^['"`]|['"`]$/g, '');
        if (ALLOW.some(([f, re]) => f === p && re.test(inner))) continue;
        fail('OCH-3', p + ':' + (i + 1) + ' promises away time the server does not pay: ' + s.slice(0, 120));
      }
    });
  }

  // ── OCH-4 ──
  const leg = w.files['src/legacy.js'] || '';
  const at = leg.indexOf('function offlineCapHours(){');
  const fnBody = at < 0 ? '' : leg.slice(at, leg.indexOf('\n}', at));
  if (!fnBody) fail('OCH-4', 'legacy.js has no offlineCapHours');
  else {
    if (/HearthriseRenown|HearthriseHomestead|HearthriseClans|offlineBonusHours/.test(fnBody)) fail('OCH-4', 'offlineCapHours reads a client perk');
    if (!/_vigour/.test(fnBody)) fail('OCH-4', 'offlineCapHours does not read the server meter (G._vigour)');
  }
  const vig = chainEndBody(w.order, w.sql, 'hr_vigour_of');
  const floor = vig && /c_floor_min\s+constant\s+int\s*:=\s*(\d+)/i.exec(vig.text);
  if (!floor || Number(floor[1]) !== baseH * 60) fail('OCH-4', 'hr_vigour_of c_floor_min != c_base_h*60 (' + (floor && floor[1]) + ' vs ' + baseH * 60 + ')');
  if (!vig || !/greatest\s*\(\s*c_floor_min[\s\S]{0,200}hr_offline_cap_ms/i.test(vig.text)) fail('OCH-4', 'hr_vigour_of grant is not greatest(c_floor_min, hr_offline_cap_ms)');
  if (w.order.indexOf(VIGOUR_PATCH) < 0 || (w.sql[VIGOUR_PATCH] || '').indexOf(VIGOUR_ANCHOR) < 0) fail('OCH-4', VIGOUR_PATCH + ' does not project vigour in hr_state_of');
  return bad;
}

const clone = (w) => ({ order: w.order.slice(), sql: { ...w.sql }, files: { ...w.files } });
const edit = (w, where, key, from, to) => {
  const c = clone(w);
  if (c[where][key].indexOf(from) < 0) throw new Error('selftest anchor missing in ' + key + ': ' + from);
  c[where][key] = c[where][key].replace(from, to);
  return c;
};
const capFile = (w) => chainEndBody(w.order, w.sql, 'hr_offline_cap_ms').file;
const vigFile = (w) => chainEndBody(w.order, w.sql, 'hr_vigour_of').file;
const RENOWN_TERM = "  if coalesce(v_renown_high, 0) >= 400 then v_hours := v_hours + 1; end if;\n";
const SERF = "perk: null,                            unlock: 'The Serf title";

function selftest(w) {
  const MUT = [
    ['M1 offlineHours:1 back on farmstead', 'OCH-2', (x) => edit(x, 'files', 'src/features/homestead.js', "plots: 6,  workers: 2,", "plots: 6,  workers: 2, offlineHours: 1,")],
    ['M2 "+2h offline cap" back into a desc', 'OCH-3', (x) => edit(x, 'files', 'src/features/homestead.js', "Unlocks the Library and a third worker.", "Unlocks the Library, a third worker, +2h offline cap.")],
    ['M3 clan Lv7 label and value to 3', 'OCH-2', (x) => edit(x, 'files', 'src/features/clans.js', "{ offlineHours: 2, label: '+2h offline cap' }", "{ offlineHours: 3, label: '+3h offline cap' }")],
    ['M4a renown term in SQL, RANKS mismatched (none)', 'OCH-2', (x) => edit(x, 'sql', capFile(x), '  if coalesce(v_clan_lv, 0) >= 4', RENOWN_TERM + '  if coalesce(v_clan_lv, 0) >= 4')],
    ['M4b renown term in SQL, RANKS says +2', 'OCH-2', (x) => edit(edit(x, 'sql', capFile(x), '  if coalesce(v_clan_lv, 0) >= 4', RENOWN_TERM + '  if coalesce(v_clan_lv, 0) >= 4'), 'files', 'src/features/renown.js', SERF, "perk: { offlineHours: 2 }, unlock: 'The Serf title")],
    ['M5 HearthriseRenown read back in offlineCapHours', 'OCH-4', (x) => edit(x, 'files', 'src/legacy.js', 'var A=window.HearthriseAccrual;', 'var A=window.HearthriseAccrual; var R=window.HearthriseRenown;')],
    ['M6 c_floor_min 600', 'OCH-4', (x) => edit(x, 'sql', vigFile(x), 'c_floor_min   constant int := 720;', 'c_floor_min   constant int := 600;')],
    ['M7 vigour anchor text removed', 'OCH-4', (x) => { const c = clone(x); c.sql[VIGOUR_PATCH] = c.sql[VIGOUR_PATCH].split(VIGOUR_ANCHOR).join("'vigour_x', public.hr_vigour_of"); return c; }],
    ['M8 "+25% offline progress" back on Hearth Hall', 'OCH-3', (x) => edit(x, 'files', 'src/legacy.js', '3 character slots and exclusive cosmetics.', '3 character slots, +25% offline progress, exclusive cosmetics.')],
  ];
  let caught = 0;
  const clean = check(w);
  if (clean.length) { console.error('✗ selftest: the clean tree is red, so no catch below means anything:\n  ' + clean.join('\n  ')); return 1; }
  for (const [name, id, mk] of MUT) {
    const r = check(mk(w));
    const ok = r.some((m) => m.startsWith(id + ':'));
    console.log((ok ? '  ✓ caught ' : '  ✗ MISSED ') + name + (ok ? ' (' + id + ')' : ' — got: ' + JSON.stringify(r)));
    if (ok) caught++;
  }
  /* M4's accepting half: the exactly matching RANKS value must pass OCH-2. */
  const match = check(edit(edit(w, 'sql', capFile(w), '  if coalesce(v_clan_lv, 0) >= 4', RENOWN_TERM + '  if coalesce(v_clan_lv, 0) >= 4'), 'files', 'src/features/renown.js', SERF, "perk: { offlineHours: 1 }, unlock: 'The Serf title"));
  const accepted = !match.some((m) => m.startsWith('OCH-2:'));
  console.log((accepted ? '  ✓ accepted ' : '  ✗ REFUSED ') + 'M4c renown term matched exactly by RANKS' + (accepted ? '' : ' — ' + JSON.stringify(match)));
  console.log((caught === MUT.length && accepted ? '✓' : '✗') + ' offline-cap-honesty selftest: ' + caught + '/' + MUT.length + ' mutations caught');
  return caught === MUT.length && accepted ? 0 : 1;
}

let world;
try { world = loadWorld(); } catch (e) { console.error('✗ offline-cap-honesty: harness: ' + (e && e.message)); process.exit(2); }
if (process.argv.includes('--selftest')) process.exit(selftest(world));
const bad = check(world);
if (bad.length) { console.error('✗ offline-cap-honesty:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('✓ offline-cap-honesty: the client promises only the away hours hr_offline_cap_ms pays');
