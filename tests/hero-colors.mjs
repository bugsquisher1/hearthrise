#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hero-colors.mjs — A HERO'S FOUR COLORS: FREE AT CREATION, PAID TO CHANGE, DRAWN FOR EVERYONE (Tyler 2026-11-04; the designer's board section
//   "2026-11-04 Gold sinks", "Hero colors: one simplification"; 2027-03-05-hero-colors.sql; src/data/gold-sinks.js `hero_colors`; src/world/hero-dye.js).
//
//   node tests/hero-colors.mjs             the guard
//   node tests/hero-colors.mjs --list      the mutation catalogue
//   node tests/hero-colors.mjs --selftest  every planted defect must turn its arm red
//   node tests/hero-colors.mjs --mutate=<id>
//
// mutant-anchors: supabase/migrations/2027-03-05-hero-colors.sql src/world/hero-dye.js src/session/hero-color-intents.js src/session/character-sections.js src/session/party-sections.js src/session/town-presence.js src/data/outfits.js src/shell/intent-words.js src/shell/windows/character/outfit.js src/world/core/compose.js src/world/town-scene.js src/world/walk-scene.js src/hunt-view/scene.js src/session/refusal.js
//
// EVERY NUMBER HERE IS READ FROM THE ROW. The real chain replayed (PGlite), real client roles, the real client modules; production untouched:
//   HC-QUOTE   the window's read is the row at the hero's Level; a stale or forged price is quote_changed; a price of nothing is bad_quote; a short purse is insufficient_gold; refused means not charged, colors unmoved
//   HC-ONCE    a replayed key charges once; one save is exactly one journal row of kind shop; the same key on other colors is intent_mismatch
//   HC-FORGED  a forged index, region, color value or shape is refused before any charge; the free outfit verb takes no colors at all
//   HC-SAME    colors_same, whichever way round the keys came and at any price, charges nothing
//   HC-CAP     the per-hero cap holds at the row's number, with its number in the refusal; another hero's day is its own; yesterday's saves don't count
//   HC-CREATE  creation is free, journals nothing and stores the picks; a named hero can't re-create itself to recolor for free
//   HC-HUNT    a hunting hero may save, as the pattern says: one charge, the running hunt doesn't move, and the next envelope carries the colors
//   HC-TOWN    another player sees the save in town from the server's own read, without the hero moving; a reload keeps it; a hero with none draws undyed
//   HC-PARTY   every seat carries its hero's colors, null when none; the party's reader turns them into a look key
//   HC-ART     hr_outfits.regions equal the data's, and each is exactly what that outfit's mask keys in the shipped atlas; the druid has no mask and says why
//   HC-SETTLE  no section a settle builds prices anything: the envelope carries no price, and no section, seat or look reads hr_sink_price (tests/settle-budget.mjs counts the calls)
//   HC-GRANT   the verb and its read are the client's and baselined; no helper is
//   HC-AGAIN   a second apply is byte-identical
//   HC-CLIENT  the reader, the button's number and the refusal's words, from the row; ONE intent with four indices and the QUOTE, never a color; a stale quote re-reads
//   HC-DYE     the look cache: at most one bake a frame; the cap holds; a look on screen is never evicted, past the cap a hero draws undyed; the hero you play takes a place anyway;
//              the masks load only on the first dyed hero; two sets an outfit can't tell apart share a sheet; the recolour keeps each pixel's value and touches only masked pixels
//   HC-DRAW    a walker, a seat and the hero you play all reach compose with a key; compose keeps it on the unit it draws; a frame's list carries it for the backend
//   HC-PAINT   the canvas backend draws a baked look from its sheet, undyed until then, and repaints a held frame when the look lands
// TRUE CONCURRENCY is unverified here (PGlite is one backend); two presses on one hero are ordered by hr_hunt_lock (the migration's header).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ownHeroSlots, asOldLadder } from './_slots.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = '000000c0-0000-4000-a000-0000901dc101';
const B = '000000c0-0000-4000-a000-0000901dc102';
const idem = () => crypto.randomUUID();
const MIG = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
const FILE = '2027-03-05-hero-colors.sql';
const CATALOGUE = '2027-03-05-outfits-catalogue.generated.sql';
const SET = 'public.hr_hero_colors_set(integer,jsonb,bigint,uuid)';
const WEAR = 'public.hr_outfit_set(integer,text,jsonb,uuid)';
const PRICE = 'public.hr_hero_colors_price(uuid,integer)';
const READ = 'public.hr_hero_colors_view(integer)';
const COUNT = 'public.hr_hero_colors_saved_today(uuid,integer)';
const TOUCH = 'public.hr_town_look_touch(uuid,integer)';
const VIEW = 'public.hr_outfit_view(uuid,integer)';
const SEATS = 'public.hr_social_party_view(uuid,integer)';
const THE_MAP = 'town_common';
const C1 = { head: 1, body: 2, legs: 3, feet: 4 };
const C2 = { head: 5, body: 6, legs: 7, feet: 8 };

/* ── THE PLANTED DEFECTS ─────────────────────────────────────────────────────
   db: a live body edited inside the arm's transaction (fn, find, replace). ddl: a statement in it. sql: an edit of the migration's TEXT the arm re-applies.
   js: a client module, copied and edited. Each names the arm that must go red. */
export const MUTANTS = {
  price_from_client: { arm: 'HC-QUOTE', why: 'the verb charges the client\'s number', db: [SET, '  if v_price <> p_price then\n', '  if false then\n'] },
  quote_ignores_level: { arm: 'HC-QUOTE', why: 'the price forgets the Level', db: [PRICE, "public.hr_level_of(p_user, p_slot)", '1'] },
  no_replay: { arm: 'HC-ONCE', why: 'a replayed key is not looked up, so hr_apply answers it and the colors move again',
    db: [SET, '  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;\n  if not public.hr_rpc_gate', '  if not public.hr_rpc_gate'] },
  key_ignores_colors: { arm: 'HC-ONCE', why: 'the same key buys another set for nothing',
    db: [SET, "  v_verb := c_verb || ':' || (v_new->>'head') || '.' || (v_new->>'body') || '.' || (v_new->>'legs') || '.' || (v_new->>'feet') || ':' || p_price;\n", "  v_verb := c_verb || ':x:' || p_price;\n"] },
  journal_kind: { arm: 'HC-ONCE', why: 'the journal row is not a shop row', db: [SET, "jsonb_build_object('kind', 'shop', 'intent', v_verb,", "jsonb_build_object('kind', 'trade', 'intent', v_verb,"] },
  colors_unchecked: { arm: 'HC-FORGED', why: 'the verb stores whatever came', db: [SET, '  if v_bad is not null then return', '  if false then return'] },
  free_verb_takes_colors: { arm: 'HC-FORGED', why: 'the free verb recolors a forged call', db: [WEAR, "  if coalesce(p_colors, '{}'::jsonb) <> '{}'::jsonb then\n", '  if false then\n'] },
  same_charges: { arm: 'HC-SAME', why: 'a save that changes nothing charges', db: [SET, '  if v_was = v_new then\n', '  if false then\n'] },
  same_after_price: { arm: 'HC-SAME', why: 'a stale button reads quote_changed before it reads colors_same',
    db: [SET, '  if v_was = v_new then\n', "  if v_was = v_new and public.hr_hero_colors_price(v_uid, p_slot) = p_price then\n"] },
  no_cap: { arm: 'HC-CAP', why: 'the cap is never read', db: [SET, '>= v_cap then\n', '>= v_cap + 1000000 then\n'] },
  cap_hardcoded: { arm: 'HC-CAP', why: 'the cap ignores the row', db: [SET, "  select r.per_day into v_cap from public.hr_sink_rules r where r.sink_id = 'hero_colors';\n", '  v_cap := 10;\n'] },
  cap_per_account: { arm: 'HC-CAP', why: 'one hero\'s saves count against another', db: [COUNT, 'l.user_id = p_user and l.slot = p_slot and', 'l.user_id = p_user and p_slot = p_slot and'] },
  cap_ever: { arm: 'HC-CAP', why: 'yesterday\'s saves still count', db: [COUNT, ' and l.at >= public.hr_utc_day_start(now())', ''] },
  look_not_touched: { arm: 'HC-TOWN', why: 'a hero standing still keeps its old look for everyone', db: [SET, '  perform public.hr_town_look_touch(v_uid, p_slot);\n', ''] },
  touch_waits: { arm: 'HC-TOWN', why: 'the touch moves no changed_at, so no delta carries it', db: [TOUCH, ', changed_at = now()', ''] },
  wear_not_touched: { arm: 'HC-TOWN', why: 'a new outfit keeps the old look for everyone', db: [WEAR, '  perform public.hr_town_look_touch(v_uid, p_slot);\n', ''] },
  colors_lost_on_wear: { arm: 'HC-TOWN', why: 'changing outfit forgets the colors',
    db: [WEAR, "do update set outfit_id = excluded.outfit_id, colors = '{}'::jsonb, updated_at = now();", "do update set outfit_id = excluded.outfit_id, colors = '{}'::jsonb, base_colors = '{}'::jsonb, updated_at = now();"] },
  seats_drop_colors: { arm: 'HC-PARTY', why: 'a party can\'t draw each other',
    db: [SEATS, "'colors', (select nullif(po.base_colors, '{}'::jsonb) from public.player_outfits po\n                                                                   where po.user_id = m.user_id and po.slot = m.slot)", "'colors', null::jsonb"] },
  region_hat: { arm: 'HC-ART', why: 'the server names a region the masks don\'t key', ddl: "update public.hr_outfits set regions = '{hat,robe,trim}' where outfit_id = 'witch'" },
  druid_regions: { arm: 'HC-ART', why: 'the druid offers colors its art can\'t show', ddl: "update public.hr_outfits set regions = '{head}' where outfit_id = 'druid'" },
  verb_open_to_anon: { arm: 'HC-GRANT', why: 'anon can save', ddl: `grant execute on function ${SET} to anon` },
  helper_open: { arm: 'HC-GRANT', why: 'a helper is the client\'s', ddl: `grant execute on function ${TOUCH} to authenticated` },
  no_baseline: { arm: 'HC-GRANT', why: 'the verb is not on the client baseline', ddl: "delete from public.hr_client_rpc_baseline where proname = 'hr_hero_colors_set'" },
  repin_lost: { arm: 'HC-AGAIN', why: 'a second apply refuses because the pin forgot this file\'s own image', sql: [FILE, /('public\.hr_outfit_set\(integer,text,jsonb,uuid\)', '3b261fe4efc49f28df681742affc584f', ')[0-9a-f]{32}'/, '$100000000000000000000000000000000\''] },
  words_same_lost: { arm: 'HC-CLIENT', why: 'colors_same has no words', js: ['src/data/refusal-words.js', [["  colors_same: 'Those are already this hero\\'s colors. Nothing was charged.',\n", '']]] },
  words_limit_hardcoded: { arm: 'HC-CLIENT', why: 'the limit\'s words ignore the server\'s number', js: ['src/shell/intent-words.js', [["return 'A hero can change colors ' + r.figures.per_day + ' times a day. More after midnight UTC.';", "return 'A hero can change colors 10 times a day. More after midnight UTC.';"]]] },
  figures_dropped: { arm: 'HC-CLIENT', why: 'the session drops the limit\'s number', js: ['src/session/refusal.js', [["'slots', 'price', 'per_day']", "'slots', 'price']"]]] },
  press_own_price: { arm: 'HC-CLIENT', why: 'the press sends a price of its own', js: ['src/session/hero-color-intents.js', [['p_colors, p_price: price,', 'p_colors, p_price: 1,']]] },
  press_sends_color: { arm: 'HC-CLIENT', why: 'the press sends a color value', js: ['src/session/hero-color-intents.js', [['const p_colors = { head: colors.head, body: colors.body, legs: colors.legs, feet: colors.feet };', "const p_colors = { head: '#ff00ff', body: colors.body, legs: colors.legs, feet: colors.feet };"]]] },
  stale_not_reread: { arm: 'HC-CLIENT', why: 'a stale quote stays on the button', js: ['src/session/hero-color-intents.js', [["const RE_READS = Object.freeze(['quote_changed', 'colors_same']);", 'const RE_READS = Object.freeze([]);']]] },
  reader_invents_price: { arm: 'HC-CLIENT', why: 'an answer with no price reads as a price', js: ['src/session/hero-color-intents.js', [['b.ok === true && Number.isSafeInteger(b.price) && b.price > 0) return', 'b.ok === true) return']]] },
  price_in_section: { arm: 'HC-SETTLE', why: 'the envelope prices a save on every settle', db: [VIEW, "'owned', to_jsonb(v_owned)", "'owned', to_jsonb(v_owned), 'colors_price', public.hr_hero_colors_price(p_user, p_slot)"] },
  read_open_to_anon: { arm: 'HC-GRANT', why: 'anon can read a hero\'s price', ddl: `grant execute on function ${READ} to anon` },
  key_half_set: { arm: 'HC-CLIENT', why: 'half a set of colors becomes a look', js: ['src/data/outfits.js', [['if (!Number.isInteger(v) || v < 0 || v >= DYE_COUNT) return null;', 'if (!Number.isInteger(v)) return head + \'.0.0.0\';']]] },
  knight_says_nothing: { arm: 'HC-CLIENT', why: 'the try-on doesn\'t say which parts change', js: ['src/shell/windows/character/outfit.js', [["return 'On this outfit your colors change: ' + parts + '. The rest stays as drawn.'", "return 'Pick your colors.'"]]] },
  druid_silent: { arm: 'HC-CLIENT', why: 'the druid\'s picker does nothing and says nothing', js: ['src/shell/windows/character/outfit.js', [['if (!row.regions.length) return row.plain;', "if (!row.regions.length) return '';"]]] },
  no_cap_in_cache: { arm: 'HC-DYE', why: 'the sheets grow past the cap', js: ['src/world/hero-dye.js', [['if (looks.size < cap) return true;', 'return true;']]] },
  evicts_on_screen: { arm: 'HC-DYE', why: 'a look on screen is evicted for a new one, and re-baked forever', js: ['src/world/hero-dye.js', [['const gone = oldest || (own ? forced : null);', 'const gone = oldest || forced;']]] },
  own_waits: { arm: 'HC-DYE', why: 'the hero you play stays undyed in a full town', js: ['src/world/hero-dye.js', [['const gone = oldest || (own ? forced : null);', 'const gone = oldest;']]] },
  bakes_all_at_once: { arm: 'HC-DYE', why: 'a crowd\'s looks all bake in one frame', js: ['src/world/hero-dye.js', [['      bake(q.s, q.id, q.key, q.own, q.k);\n      return true;\n', '      bake(q.s, q.id, q.key, q.own, q.k);\n      for (const r of queue.splice(0)) { queued.delete(r.k); if (roomFor(r.own)) bake(r.s, r.id, r.key, r.own, r.k); }\n      return true;\n']]] },
  masks_loaded_up_front: { arm: 'HC-DYE', why: 'every page downloads the masks', js: ['src/world/hero-dye.js', [["  let masks = null, asked = false, failed = false;\n", "  let masks = null, asked = true, failed = false;\n  getMasks().then((m) => { masks = m; });\n"]]] },
  legs_split_a_knight: { arm: 'HC-DYE', why: 'two sets an outfit can\'t tell apart take two sheets', js: ['src/world/hero-dye.js', [["(s.shows.has(i) ? parts[i] : '-')", 'parts[i]']]] },
  recolor_outside_mask: { arm: 'HC-DYE', why: 'the recolour reaches unmasked pixels', js: ['src/world/hero-dye.js', [["    const ramp = ramps[regionOfKey(mask[i], mask[i + 1], mask[i + 2], mask[i + 3])];\n", "    const ramp = ramps[regionOfKey(mask[i], mask[i + 1], mask[i + 2], mask[i + 3])] || ramps.find(Boolean);\n"]]] },
  loses_shading: { arm: 'HC-DYE', why: 'a dyed pixel loses its value', js: ['src/world/hero-dye.js', [['const [r, g, b] = hsv(h, s, (v / 255) * (0.4 + 0.6 * dv));', 'const [r, g, b] = hsv(h, s, dv);']]] },
  walker_no_dye: { arm: 'HC-DRAW', why: 'a stranger draws undyed', js: ['src/world/town-scene.js', [['          dye: p.w.dye,\n', '']]] },
  hero_no_dye: { arm: 'HC-DRAW', why: 'the hero you play draws undyed in town', js: ['src/world/walk-scene.js', [['dye: o.heroDye ? o.heroDye() : null, ', '']]] },
  compose_drops: { arm: 'HC-DRAW', why: 'compose loses the key', js: ['src/world/core/compose.js', [['if (u.dye) Object.assign(d, { dye: u.dye, dyeOwn: isHero });', '']]] },
  scene_drops: { arm: 'HC-DRAW', why: 'a hunt draws the party undyed', js: ['src/hunt-view/scene.js', [['grey, under, dye: dyeOf(u) };', 'grey, under };']]] },
  scene_own_only: { arm: 'HC-DRAW', why: 'a hunt draws only the hero you play in colors', js: ['src/hunt-view/scene.js', [['    return who ? who.dye : null;\n', '    return null;\n']]] },
  seat_no_key: { arm: 'HC-PARTY', why: 'the party reader drops the colors', js: ['src/session/party-sections.js', [[', dye: dyeKeyOf(p.colors) });', ', dye: null });']]] },
  backend_undyed: { arm: 'HC-PAINT', why: 'the backend never draws a look', js: ['src/world/render/canvas-backend.js', [["if (d.dye && dyes) { const dyed = dyes.source(d.id, d.dye, d.sx, d.sy); if (dyed) return dyed; }", '']]] },
  backend_held: { arm: 'HC-PAINT', why: 'a look landing never repaints a held frame', js: ['src/world/render/canvas-backend.js', [['if (dyes) for (const d of list.sprites) if (d.dye) s.add(dyes.has(d.id, d.dye));', '']]] },
  backend_no_pump: { arm: 'HC-PAINT', why: 'nothing bakes while a frame is held', js: ['src/world/render/canvas-backend.js', [['    dyes.pump();\n', '']]] },
};

const q = async (db, sql, params) => (await db.query(sql, params)).rows;
const one = async (db, sql, params) => { const r = await q(db, sql, params); return r[0] ? Object.values(r[0])[0] : undefined; };
const claims = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.headers', $3, true)`,
  [uid || '', uid ? JSON.stringify({ sub: uid, role: 'authenticated' }) : '', JSON.stringify({ 'cf-connecting-ip': '198.51.100.' + (uid ? parseInt(uid.slice(-2), 16) % 200 + 10 : 1) })]);
/* A verb as a signed-in player presses it: its session, its role. */
async function as(db, uid, sql, params) {
  await claims(db, uid);
  await db.exec('set local role authenticated');
  try { return await one(db, sql, params); } finally { await db.exec('reset role'); await claims(db, null); }
}
const save = (db, slot, colors, price, key, uid = A) => as(db, uid, 'select public.hr_hero_colors_set($1::int, $2::jsonb, $3::bigint, $4::uuid)', [slot, JSON.stringify(colors), price, key || idem()]);
const wear = (db, slot, outfit, colors = {}, uid = A) => as(db, uid, 'select public.hr_outfit_set($1::int, $2, $3::jsonb, $4::uuid)', [slot, outfit, JSON.stringify(colors), idem()]);
async function hero(db, uid, slot, name, colors = C1) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'hero-colors guard') on conflict (user_id) do nothing`, [uid]);
  if (slot > 0) await ownHeroSlots((sql, p) => db.query(sql, p), uid, slot);   // one slot to start (2027-03-25-hero-slots-one.sql)
  const r = await as(db, uid, 'select public.hr_create_hero($1::int, $2, $3::jsonb, $4::uuid)', [slot, name, JSON.stringify(colors), idem()]);
  if (!r || r.ok !== true) throw Object.assign(new Error(`hr_create_hero(${slot}, ${name}): ` + JSON.stringify(r)), { harness: true });
  await db.query(`insert into public.account_wallet (user_id, gold) values ($1, 100000000) on conflict (user_id) do update set gold = excluded.gold`, [uid]);
  await db.query('update public.player_state set stamina_ms = 28800000, stamina_at = now() where user_id = $1 and slot = $2', [uid, slot]);
}
const purse = (db, uid = A) => one(db, 'select gold from public.account_wallet where user_id = $1', [uid]).then(Number);
const base = (db, slot, uid = A) => one(db, 'select base_colors from public.player_outfits where user_id = $1 and slot = $2', [uid, slot]);
const quote = (db, slot, uid = A) => as(db, uid, 'select public.hr_hero_colors_view($1::int)', [slot]).then((r) => r.price);
const journal = (db, slot, uid = A) => q(db, `select kind, intent, gold from public.player_ledger where user_id = $1 and slot = $2 and split_part(intent, ':', 1) = 'hero_colors_set' order by id`, [uid, slot]);
const rule = async (db) => { const r = (await q(db, `select price_base, price_per_level, per_day from public.hr_sink_rules where sink_id = 'hero_colors'`))[0]; return { base: Number(r.price_base), per: Number(r.price_per_level), perDay: Number(r.per_day) }; };
const calm = (db) => db.query('delete from public.hr_rate_counters');
const same = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort());

/* ── A CANVAS THAT DOES ITS SUMS IN NODE: the real hero-dye.js and canvas-backend.js, no browser. ── */
function fakeImage(w, h, paint) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b, a] = paint(x, y); const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a; }
  return { width: w, height: h, data, naturalWidth: w, naturalHeight: h };
}
function fakeDoc(log) {
  const canvases = [];
  const make = () => {
    const c = { _w: 0, _h: 0, data: new Uint8ClampedArray(0), addEventListener() {}, style: {} };
    Object.defineProperty(c, 'width', { get: () => c._w, set: (v) => { c._w = v; c.data = new Uint8ClampedArray(c._w * c._h * 4); } });
    Object.defineProperty(c, 'height', { get: () => c._h, set: (v) => { c._h = v; c.data = new Uint8ClampedArray(c._w * c._h * 4); } });
    c.getContext = () => ({
      imageSmoothingEnabled: false,
      clearRect() { c.data.fill(0); },
      drawImage(src, sx, sy, sw, sh, dx, dy) {
        if (log) log.push({ into: c, from: src, sx, sy, sw, sh, dx, dy });
        for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
          const a = ((sy + y) * src.width + sx + x) * 4, b = ((dy + y) * c._w + dx + x) * 4;
          for (let n = 0; n < 4; n++) c.data[b + n] = src.data[a + n];
        }
      },
      getImageData: (x, y, w, h) => ({ data: c.data.slice(), width: w, height: h }),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData(img) { c.data.set(img.data); },
    });
    canvases.push(c);
    return c;
  };
  return { canvases, createElement: () => make(), defaultView: { performance: { now: () => 0 } } };
}
const FW = 2, FH = 2;
const fakeRow = (ox) => ({ frame: [FW, FH], anims: { idle: { dirs: { s: [[ox, 0]] } }, walk: { dirs: { s: [[ox + FW, 0], [ox + 2 * FW, 0]] } } } });
const KEYS = [[255, 0, 0, 255], [0, 255, 0, 255]];
/* The atlas: every pixel the same mid grey; the mask: the top row head, the second row body, on sprite `a`; sprite `b` has no mask. */
function fakeArt() {
  const image = fakeImage(24, 2, () => [120, 120, 120, 255]);
  const maskImage = fakeImage(6, 2, (x, y) => KEYS[y]);
  const row = fakeRow(0), rowC = fakeRow(6), rowD = fakeRow(12);
  const manifest = { sprites: { a_mask: fakeRow(0), c_mask: fakeRow(0), d_mask: fakeRow(0) } };
  return { image, row, rowC, rowD, masks: { manifest, image: maskImage } };
}

const ARMS = {
  'HC-QUOTE': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    const R = await rule(db);
    const level = Number(await one(db, 'select public.hr_level_of($1::uuid, 0)', [A]));
    const price = R.base + R.per * level;
    if (Number(await quote(db, 0)) !== price) out.push(`the read quotes ${await quote(db, 0)}, the row at Level ${level} says ${price}`);
    const was = await purse(db);
    for (const p of [price + 1, price - 1, 1]) {
      const r = await save(db, 0, C2, p);
      if (!r || r.error !== 'quote_changed' || Number(r.price) !== price) out.push(`a price of ${p} answered ` + JSON.stringify(r));
    }
    const zero = await save(db, 0, C2, 0);
    if (!zero || zero.error !== 'bad_quote') out.push('a price of nothing answered ' + JSON.stringify(zero));
    /* the row moved: what the button showed is stale */
    await db.query(`update public.hr_sink_rules set price_base = price_base + 500 where sink_id = 'hero_colors'`);
    const stale = await save(db, 0, C2, price);
    if (!stale || stale.error !== 'quote_changed' || Number(stale.price) !== price + 500) out.push('a moved row answered ' + JSON.stringify(stale));
    await db.query(`update public.hr_sink_rules set price_base = price_base - 500 where sink_id = 'hero_colors'`);
    /* a short purse: hr_apply's own refusal */
    await db.query('update public.account_wallet set gold = $2 where user_id = $1', [A, price - 1]);
    const short = await save(db, 0, C2, price);
    if (!short || short.error !== 'insufficient_gold') out.push('a short purse answered ' + JSON.stringify(short));
    await db.query('update public.account_wallet set gold = $2 where user_id = $1', [A, was]);
    if (await purse(db) !== was || !same(await base(db, 0), C1) || (await journal(db, 0)).length) out.push('a refused save moved something');
    /* a Level moves the quote */
    await db.query('update public.player_state set level_xp = $2 where user_id = $1 and slot = 0', [A, 5000000]);
    const higher = Number(await one(db, 'select public.hr_level_of($1::uuid, 0)', [A]));
    if (higher === level) out.push('CONTROL: the Level did not move');
    if (Number(await quote(db, 0)) !== R.base + R.per * higher) out.push(`at Level ${higher} the read quotes ${await quote(db, 0)}`);
    return out;
  },

  'HC-ONCE': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    const price = Number(await quote(db, 0));
    const was = await purse(db), key = idem();
    const r = await save(db, 0, C2, price, key);
    if (!r || r.ok !== true || !same(r.outfit.base, C2)) return ['the save answered ' + JSON.stringify(r)];
    const again = await save(db, 0, C2, price, key);
    if (!again || again.ok !== true) out.push('the replay answered ' + JSON.stringify(again));
    if (await purse(db) !== was - price) out.push(`one key moved the purse by ${was - await purse(db)}, the price is ${price}`);
    const rows = await journal(db, 0);
    if (rows.length !== 1) out.push(rows.length + ' journal rows for one save');
    else if (rows[0].kind !== 'shop' || rows[0].intent !== `hero_colors_set:5.6.7.8:${price}` || Number(rows[0].gold) !== -price) out.push('the journal row reads ' + JSON.stringify(rows[0]));
    const other = await save(db, 0, C1, price, key);
    if (!other || other.error !== 'intent_mismatch' || !same(await base(db, 0), C2)) out.push('one key on other colors answered ' + JSON.stringify(other));
    return out;
  },

  'HC-FORGED': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    const price = Number(await quote(db, 0)), was = await purse(db);
    const dyes = await q(db, 'select idx from public.hr_outfit_dyes');
    const past = Math.max(...dyes.map((d) => Number(d.idx))) + 1;
    for (const [what, colors] of [
      ['an index past the last dye', { ...C2, head: past }], ['a negative index', { ...C2, head: -1 }], ['a fraction', { ...C2, head: 1.5 }],
      ['a color value', { ...C2, head: '#ff00ff' }], ['a named color', { ...C2, body: 'red' }], ['a region the hero has no', { hat: 1, body: 2, legs: 3, feet: 4 }],
      ['three regions', { head: 1, body: 2, legs: 3 }], ['a fifth region', { ...C2, cape: 1 }], ['a list', [1, 2, 3, 4]], ['nothing', null]]) {
      const r = await save(db, 0, colors, price);
      if (!r || r.ok === true || !['bad_colors', 'bad_region', 'bad_dye'].includes(r.error)) out.push(`${what} answered ` + JSON.stringify(r));
    }
    if (await purse(db) !== was || !same(await base(db, 0), C1) || (await journal(db, 0)).length) out.push('a forged save moved something');
    /* the free verb is no way round the price */
    const free = await wear(db, 0, 'knight', { head: 9, body: 9 });
    if (!free || free.error !== 'bad_colors') out.push('the free verb answered ' + JSON.stringify(free));
    if (!same(await base(db, 0), C1) || await one(db, `select colors <> '{}'::jsonb from public.player_outfits where user_id = $1 and slot = 0`, [A])) out.push('the free verb stored a color');
    /* what another player reads is an index and nothing else: the stored set is exactly four whole numbers */
    const stored = await base(db, 0);
    if (Object.keys(stored).sort().join() !== 'body,feet,head,legs' || !Object.values(stored).every(Number.isInteger)) out.push('the stored set is ' + JSON.stringify(stored));
    return out;
  },

  'HC-SAME': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    const price = Number(await quote(db, 0)), was = await purse(db);
    const flipped = { feet: C1.feet, legs: C1.legs, body: C1.body, head: C1.head };
    for (const [colors, p] of [[C1, price], [flipped, price], [C1, price + 7]]) {
      const r = await save(db, 0, colors, p);
      if (!r || r.error !== 'colors_same') out.push(`the same colors at ${p} answered ` + JSON.stringify(r));
    }
    if (await purse(db) !== was || (await journal(db, 0)).length) out.push('colors_same charged');
    return out;
  },

  'HC-CAP': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, A, 1, 'Tamsel');
    const R = await rule(db);
    const price = Number(await quote(db, 0));
    const setOf = (i) => ({ head: i % 16, body: (i + 1) % 16, legs: (i + 2) % 16, feet: (i + 3) % 16 });
    /* the design's number of saves, each real (the bucket is the outfit's 20 a minute: calmed so the bucket isn't what is tested) */
    for (let i = 0; i < R.perDay; i++) {
      await calm(db);
      const r = await save(db, 0, setOf(i + 5), price);
      if (!r || r.ok !== true) return out.concat(`save ${i + 1} of ${R.perDay} answered ` + JSON.stringify(r));
    }
    const was = await purse(db);
    await calm(db);
    const over = await save(db, 0, setOf(1), price);
    if (!over || over.error !== 'colors_limit' || Number(over.per_day) !== R.perDay) out.push('past the cap answered ' + JSON.stringify(over));
    if (await purse(db) !== was) out.push('past the cap it charged');
    /* the same colors past the cap still say so first; another hero's day is its own, though the purse is one */
    const other = await save(db, 1, C2, Number(await quote(db, 1)));
    if (!other || other.ok !== true) out.push('another hero\'s first save answered ' + JSON.stringify(other));
    /* yesterday's saves don't count */
    await db.exec('alter table public.player_ledger disable trigger user');
    await db.query(`update public.player_ledger set at = at - interval '1 day' where user_id = $1 and slot = 0 and split_part(intent, ':', 1) = 'hero_colors_set'`, [A]);
    await db.exec('alter table public.player_ledger enable trigger user');
    const next = await save(db, 0, setOf(1), price);
    if (!next || next.ok !== true) out.push('a new UTC day answered ' + JSON.stringify(next));
    /* the row moves the cap */
    await db.query(`update public.hr_sink_rules set per_day = 1 where sink_id = 'hero_colors'`);
    const flipped = await save(db, 0, setOf(2), price);
    if (!flipped || flipped.error !== 'colors_limit' || Number(flipped.per_day) !== 1) out.push('a cap of 1 answered ' + JSON.stringify(flipped));
    return out;
  },

  'HC-CREATE': async (db) => {
    const out = [];
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [A]);
    await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'hero-colors guard') on conflict (user_id) do nothing`, [A]);
    await db.query('insert into public.account_wallet (user_id, gold) values ($1, 1000) on conflict (user_id) do update set gold = excluded.gold', [A]);
    const r = await as(db, A, 'select public.hr_create_hero(0, $1, $2::jsonb, $3::uuid)', ['Marlow', JSON.stringify(C2), idem()]);
    if (!r || r.ok !== true) return ['creation answered ' + JSON.stringify(r)];
    if (!same(await base(db, 0), C2)) out.push('the picks read ' + JSON.stringify(await base(db, 0)));
    if (await purse(db) < 1000) out.push('creation cost gold');
    if ((await journal(db, 0)).length) out.push('creation journalled a save');
    if (await one(db, `select count(*)::int from public.player_ledger where user_id = $1 and gold < 0`, [A])) out.push('creation charged something');
    const redo = await as(db, A, 'select public.hr_create_hero(0, $1, $2::jsonb, $3::uuid)', ['Marlow', JSON.stringify(C1), idem()]);
    if (!redo || redo.error !== 'already_created' || !same(await base(db, 0), C2)) out.push('a second creation answered ' + JSON.stringify(redo));
    return out;
  },

  'HC-HUNT': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await db.query('update public.hr_hunt_config set enabled = true where id');
    const GEN = await import(pathToFileURL(join(ROOT, 'tools/gen-hunt-sessions.mjs')).href);
    const room = { id: 'hc_cellar', hunt: 'mill_cellar', map: 'hc_cellar', start: [[1, 1]], pockets: [{ room: [3, 1, 6, 3], spawns: [{ monster: 'rat', x: 4, y: 2 }] }], route: [0], respawnMs: 60000, pullDist: 1.5 };
    const { rows, spawns } = GEN.groundRows({ hc_cellar: room });
    for (const g of rows) await db.query(`insert into public.hr_hunt_grounds (hunt_id, ground_id, pockets, spawns, respawn_ms, seats, density_max) values ($1,$2,$3,$4,$5,$6,$7::int[])
      on conflict (hunt_id) do update set ground_id = excluded.ground_id, pockets = excluded.pockets, spawns = excluded.spawns, respawn_ms = excluded.respawn_ms, seats = excluded.seats, density_max = excluded.density_max`,
      [g.hunt, g.ground, g.pockets, g.spawns, g.respawn, g.seats, g.dmax]);
    await db.query('delete from public.hr_hunt_ground_spawns where hunt_id = $1', ['mill_cellar']);
    for (const x of spawns) await db.query('insert into public.hr_hunt_ground_spawns (hunt_id, monster_id, n) values ($1,$2,$3) on conflict do nothing', [x.hunt, x.monster, x.n]);
    const entered = await as(db, A, `select public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, $1::uuid)`, [idem()]);
    if (!entered || entered.ok !== true) return ['the hunt would not open: ' + JSON.stringify(entered)];
    const session = (await q(db, 'select id, preset, settled_to, leave_at, ended_at from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is null', [A]))[0];
    if (!session) return ['no open session after the enter'];
    const price = Number(await quote(db, 0)), was = await purse(db);
    const r = await save(db, 0, C2, price);
    if (!r || r.ok !== true) return out.concat('a hunting hero\'s save answered ' + JSON.stringify(r));
    if (await purse(db) !== was - price) out.push('the hunting save moved the purse by ' + (was - await purse(db)));
    const after = (await q(db, 'select id, preset, settled_to, leave_at, ended_at from public.hunt_sessions where id = $1', [session.id]))[0];
    if (JSON.stringify(after) !== JSON.stringify(session)) out.push('the running hunt moved: ' + JSON.stringify(after));
    const env = await one(db, 'select public.hr_state_of($1::uuid, 0)', [A]);
    if (!same(env.outfit.base, C2)) out.push('the next envelope carries ' + JSON.stringify(env.outfit.base));
    return out;
  },

  'HC-TOWN': async (db, X) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel', C2);
    await db.query("update public.hr_flags set enabled = true where key = 'town_presence'");
    await as(db, A, 'select public.hr_town_here(0, $1)', [THE_MAP]);
    await db.query('update public.town_bodies set look = null, look_at = null');
    /* the viewer stands where it stood: a delta names the last read's centre, so a body already in the area isn't "just entered" */
    const body = (await q(db, 'select station_id from public.town_bodies where user_id = $1', [A]))[0];
    if (!body) return ['CONTROL: the hero has no body in town'];
    const whole0 = await as(db, B, 'select public.hr_town_view(0, $1, null, null, null, null, null)', [THE_MAP]);
    const seenAt = (whole0.walkers || []).find((w) => w.id === A);
    if (!seenAt) return ['the stranger never saw the hero'];
    const viewAt = (cursor) => as(db, B, 'select public.hr_town_view(0, $1, $2::int, $3::int, $4::bigint, $2::int, $3::int)', [THE_MAP, seenAt.x, seenAt.y, cursor]);
    const whole = await viewAt(null);
    const w0 = (whole.walkers || []).find((w) => w.id === A);
    if (!w0 || !same(w0.colors, C1)) return ['the stranger reads ' + JSON.stringify(w0 && w0.colors)];
    /* in a delta, a hero who hasn't moved isn't sent... */
    await db.query(`update public.town_bodies set changed_at = now() - interval '1 minute', since = now() - interval '1 minute' where user_id = $1`, [A]);
    const quiet = await viewAt(whole.cursor);
    if ((quiet.walkers || []).some((w) => w.id === A)) return ['CONTROL: a still hero was in the delta'];
    /* ...until its colors change: the delta carries them, the hero still hasn't moved, and only the server said so */
    const price = Number(await quote(db, 0));
    const r = await save(db, 0, C2, price);
    if (!r || r.ok !== true) return ['the save answered ' + JSON.stringify(r)];
    const delta = await viewAt(whole.cursor);
    const w1 = (delta.walkers || []).find((w) => w.id === A);
    if (!w1 || !same(w1.colors, C2)) out.push('the next delta carries ' + JSON.stringify(w1 && w1.colors));
    if (w1) {
      if (w1.x !== w0.x || w1.y !== w0.y) out.push('saving a color moved the hero');
      const seen = X.TP.walkerOf(w1);
      if (!seen || seen.dye !== '5.6.7.8') out.push('the stranger\'s client reads the walker as ' + JSON.stringify(seen));
    }
    /* changing outfit: the same news, the colors follow, and it is free */
    const was = await purse(db);
    const w = await wear(db, 0, 'ranger');
    if (!w || w.ok !== true || !same(w.outfit.base, C2) || await purse(db) !== was) out.push('changing outfit answered ' + JSON.stringify(w));
    await db.query(`update public.town_bodies set changed_at = now() - interval '1 minute' where user_id = $1`, [A]);
    await wear(db, 0, 'sorcerer');
    const d3 = await viewAt(whole.cursor);
    const w3 = (d3.walkers || []).find((x) => x.id === A);
    if (!w3 || !w3.outfit || w3.outfit.id !== 'sorcerer' || !same(w3.colors, C2)) out.push('a new outfit reads ' + JSON.stringify(w3 && { outfit: w3.outfit, colors: w3.colors }));
    /* a reload: the same section, from the server */
    const env = await one(db, 'select public.hr_state_of($1::uuid, 0)', [A]);
    if (!same(env.outfit.base, C2)) out.push('a reload reads ' + JSON.stringify(env.outfit.base));
    /* none chosen: drawn as the art is */
    await db.query(`update public.player_outfits set base_colors = '{}'::jsonb where user_id = $1 and slot = 0`, [A]);
    const none = X.TP.walkerOf(Object.assign({}, w1 || w0, await one(db, 'select public.hr_town_look($1::uuid, 0)', [A])));
    if (!none || none.dye !== null) out.push('a hero with none reads ' + JSON.stringify(none && none.dye));
    return out;
  },

  'HC-PARTY': async (db, X) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel', C2);
    const id = await one(db, `insert into public.hunt_parties (hunt_id, leader_user, leader_slot, max_size) values ('mill_cellar', $1, 0, 4) returning id`, [A]);
    await db.query('insert into public.hunt_party_members (party_id, user_id, slot, seat) values ($1, $2, 0, 0)', [id, A]);
    await db.query('insert into public.hunt_party_members (party_id, user_id, slot, seat) values ($1, $2, 0, 1)', [id, B]);
    const seats = (await one(db, 'select public.hr_state_of($1::uuid, 0)', [A])).party_people;
    const by = new Map((seats || []).map((s) => [s.user, s]));
    if (!by.get(A) || !same(by.get(A).colors, C1)) out.push('the first seat reads ' + JSON.stringify(by.get(A)));
    if (!by.get(B) || !same(by.get(B).colors, C2)) out.push('the second seat reads ' + JSON.stringify(by.get(B)));
    await db.query(`update public.player_outfits set base_colors = '{}'::jsonb where user_id = $1 and slot = 0`, [B]);
    const after = (await one(db, 'select public.hr_state_of($1::uuid, 0)', [A])).party_people;
    const sb = (after || []).find((s) => s.user === B);
    if (!sb || sb.colors !== null) out.push('a seat with none reads ' + JSON.stringify(sb));
    /* the section's reader, as the hunt scene reads it */
    const cs = { read: (k) => (k === 'party_people' ? seats : undefined) };
    const people = X.PS.partyPeopleOf(cs);
    const dyes = Array.from(people.values()).map((p) => p.dye).sort();
    if (dyes.join() !== ['1.2.3.4', '5.6.7.8'].join()) out.push('the party reader reads ' + JSON.stringify(dyes));
    return out;
  },

  'HC-ART': async (db, X) => {
    const out = [];
    const server = new Map((await q(db, 'select outfit_id, regions from public.hr_outfits')).map((r) => [r.outfit_id, r.regions]));
    const { OUTFIT_ROWS, BASE_REGIONS, MASK_COLOURS } = X.OF;
    for (const [id, r] of Object.entries(OUTFIT_ROWS)) if (JSON.stringify(server.get(id)) !== JSON.stringify(r.regions)) out.push(`${id}: the server's regions ${JSON.stringify(server.get(id))}, the data's ${JSON.stringify(r.regions)}`);
    if (X.OF.validate().length) out.push('outfits.js: ' + X.OF.validate().join('; '));
    /* WHAT THE PICKER OFFERS IS WHAT THE ART SHOWS: read off the shipped atlas, pixel by pixel. */
    const { decodePNG } = await import(pathToFileURL(join(ROOT, 'tools/world-art/png.mjs')).href);
    const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-hunt-masks.json'), 'utf8'));
    const img = decodePNG(readFileSync(join(ROOT, 'assets/world/atlas-hunt-masks.png')));
    const { OUTFITS } = X.HO;
    for (const [id, r] of Object.entries(OUTFIT_ROWS)) {
      const m = manifest.sprites[OUTFITS[id] + '_mask'];
      if (!m) { if (r.regions.length) out.push(`${id}: it offers ${r.regions} and has no mask`); else if (!r.plain) out.push(`${id}: no mask, no words`); continue; }
      const seen = new Set();
      const [fw, fh] = m.frame;
      for (const clip of Object.values(m.anims)) for (const list of Object.values(clip.dirs)) for (const [sx, sy] of list) {
        for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
          const i = ((sy + y) * img.width + sx + x) * 4;
          if (img.data[i + 3] < 128) continue;
          const k = MASK_COLOURS.findIndex((c) => c[0] === img.data[i] && c[1] === img.data[i + 1] && c[2] === img.data[i + 2]);
          if (k < 0) out.push(`${id}: a mask pixel is no region's key`); else seen.add(BASE_REGIONS[k]);
        }
      }
      const keyed = BASE_REGIONS.filter((g) => seen.has(g));
      if (keyed.join() !== r.regions.join()) out.push(`${id}: its mask keys ${keyed}, its row offers ${r.regions}`);
    }
    return out;
  },

  'HC-SETTLE': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    const env = await one(db, 'select public.hr_state_of($1::uuid, 0)', [A]);
    if (JSON.stringify(env).includes('colors_price') || (env.outfit && 'price' in env.outfit)) out.push('the envelope carries a price');
    /* every section's function, the seats and the look: a settle or a town read builds these. None may price anything, directly or through the helper. */
    const fns = (await q(db, 'select fn from public.hr_state_sections')).map((r) => r.fn).concat(['hr_town_look', 'hr_social_party_view', 'hr_outfit_owned']);
    for (const fn of new Set(fns)) {
      for (const r of await q(db, "select p.prosrc from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1", [fn])) {
        if (/hr_hero_colors_(price|saved_today|view)/.test(r.prosrc)) out.push(fn + ' reads the colors quote on the settle path');
      }
    }
    return out;
  },

  'HC-GRANT': async (db) => {
    const out = [];
    const can = (role, fn) => one(db, 'select has_function_privilege($1, $2, $3)', [role, fn, 'execute']);
    if (!await can('authenticated', SET)) out.push('a player cannot save');
    if (await can('anon', SET)) out.push('anon can save');
    if (!await can('authenticated', READ)) out.push('a player cannot read the price');
    if (await can('anon', READ)) out.push('anon can read the price');
    if (!(await one(db, "select count(*)::int from public.hr_client_rpc_baseline where proname = 'hr_hero_colors_view' and grantee = 'authenticated'"))) out.push('the read is not on the client baseline');
    for (const f of [PRICE, COUNT, TOUCH, VIEW, SEATS]) for (const role of ['anon', 'authenticated']) if (await can(role, f)) out.push(`${role} reaches ${f}`);
    if (!(await one(db, `select count(*)::int from public.hr_client_rpc_baseline where proname = 'hr_hero_colors_set' and grantee = 'authenticated'`))) out.push('the verb is not on the client baseline');
    return out;
  },

  'HC-AGAIN': async (db, X, mutant) => {
    const out = [];
    const text = mutant && mutant.sql ? plantSql(MIG(FILE), mutant.sql) : MIG(FILE);
    const inventory = async () => (await q(db, `select p.oid::regprocedure::text fn, md5(pg_get_functiondef(p.oid)) m from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname in ('hr_hero_colors_price', 'hr_hero_colors_view', 'hr_hero_colors_saved_today', 'hr_town_look_touch', 'hr_hero_colors_set', 'hr_outfit_set', 'hr_title_wear', 'hr_social_party_view') order by 1`)).map((r) => r.fn + ':' + r.m).join('\n');
    const rows = () => q(db, 'select outfit_id, regions, premium, sort from public.hr_outfits order by outfit_id').then(JSON.stringify);
    const was = await inventory(), rowsWere = await rows();
    await db.exec('savepoint again');
    /* the file's own self-check makes a second hero unpaid: re-applied on the ladder it was written against (tests/_slots.mjs) */
    try { await db.exec(MIG(CATALOGUE)); await asOldLadder((sql) => db.exec(sql), () => db.exec(text)); } catch (e) {
      out.push('the second apply refused: ' + String(e.message).split('\n')[0].slice(0, 180));
      await db.exec('rollback to savepoint again');
      return out;
    }
    if ((await inventory()) !== was) out.push('a second apply moved a body');
    if ((await rows()) !== rowsWere) out.push('a second apply moved a catalogue row');
    return out;
  },

  'HC-CLIENT': async (db, X) => {
    const out = [];
    const R = X.GS.SINK_RULES.hero_colors;
    const gp = (n) => n.toLocaleString('en-US') + ' gp';
    /* THE READER: what the server sent, or nothing */
    const cs0 = (sec) => ({ read: (k) => (k === 'outfit' ? sec : undefined) });
    const good = X.CS.outfitOf(cs0({ worn: 'knight', owned: ['knight'], base: C2 }));
    if (!good || !same(good.base, C2) || !good.owned.has('knight')) out.push('the reader reads ' + JSON.stringify(good));
    const none = X.CS.outfitOf(cs0({ worn: null, owned: [], base: {} }));
    if (!none || none.base !== null) out.push('a section with no colors reads ' + JSON.stringify(none));
    if (X.OF.dyeKeyOf({ head: 1 }) !== null || X.OF.dyeKeyOf({ ...C1, head: X.OF.DYE_COUNT }) !== null || X.OF.dyeKeyOf({ ...C1, head: '#fff' }) !== null || X.OF.dyeKeyOf(null) !== null) out.push('dyeKeyOf passes junk');
    if (X.OF.dyeKeyOf(C1) !== '1.2.3.4') out.push('dyeKeyOf reads ' + X.OF.dyeKeyOf(C1));
    /* THE WORDS, the design's, with the server's number */
    const said = (body) => X.IW.refusalText(X.REF.refusalOf({ ok: true, body: Object.assign({ ok: false }, body) }));
    if (said({ error: 'colors_same' }) !== 'Those are already this hero\'s colors. Nothing was charged.') out.push('colors_same says ' + said({ error: 'colors_same' }));
    if (said({ error: 'colors_limit', per_day: R.perDay }) !== `A hero can change colors ${R.perDay} times a day. More after midnight UTC.`) out.push('colors_limit says ' + said({ error: 'colors_limit', per_day: R.perDay }));
    if (said({ error: 'colors_limit', per_day: 3 }) !== 'A hero can change colors 3 times a day. More after midnight UTC.') out.push('a moved row still says ' + said({ error: 'colors_limit', per_day: 3 }));
    if (!X.IW.refusalWords('colors_limit') || X.IW.refusalWords('colors_limit') === X.RW.REFUSAL_FALLBACK) out.push('colors_limit has no plain line');
    /* THE TRY-ON TELLS THE TRUTH: every part by its name; the druid says why it has none, and that the colors stay */
    const knight = X.OW.showsWords(X.OF.OUTFIT_ROWS.knight, false);
    if (!/Plume, Waist cloth/.test(knight) || !/rest stays as drawn/.test(knight)) out.push('the knight\'s try-on says ' + knight);
    const hidden = X.OW.showsWords(X.OF.OUTFIT_ROWS.knight, true);
    if (!/doesn't show/.test(hidden)) out.push('a save the knight can\'t show says ' + hidden);
    const druid = X.OW.showsWords(X.OF.OUTFIT_ROWS.druid, false);
    if (!/green/.test(druid) || !/every other outfit/.test(druid)) out.push('the druid says ' + JSON.stringify(druid));
    /* the creation step's words and what a new hero wears: the real kit, the real look */
    if (X.HC.START_OUTFIT !== 'knight' || !/plume and waist cloth/.test(X.HC.startWords())) out.push('the step says ' + X.HC.startWords());
    const start = X.SK.START_EQUIPMENT;
    if (!start.shield || start.weapon !== 'practice_sword') out.push('the start kit moved: the step previews the tank\'s outfit');
    /* the picks shown on the small outfits together show every region */
    const shownRegions = new Set([X.HC.START_OUTFIT, ...X.HC.OTHER_OUTFITS].flatMap((id) => X.OF.OUTFIT_ROWS[id].regions));
    for (const g of X.OF.BASE_REGIONS) if (!shownRegions.has(g)) out.push(`no outfit in the creation step shows ${g}`);
    /* THE WINDOW'S READ: the server's number, or nothing; never a default */
    const reads = [{ ok: true, body: { ok: true, price: 2400 } }, { ok: true, body: { ok: true } }, { ok: true, body: { ok: false, error: 'rate_limited' } }];
    const reader = { server: { rpc: async (name, body) => { if (name !== 'hr_hero_colors_view' || body.p_slot !== 2) out.push('the read sent ' + name + ' ' + JSON.stringify(body)); return reads.shift(); } } };
    const r1 = await X.HI.readColorsPrice(reader, { slot: 2 });
    if (!r1.ok || r1.price !== 2400) out.push('the read reads ' + JSON.stringify(r1));
    const r2 = await X.HI.readColorsPrice(reader, { slot: 2 });
    if (r2.ok) out.push('an answer with no price reads ' + JSON.stringify(r2));
    const r3 = await X.HI.readColorsPrice(reader, { slot: 2 });
    if (r3.ok || r3.error !== 'rate_limited') out.push('a refused read reads ' + JSON.stringify(r3));
    /* ONE INTENT WITH THE QUOTE, FOUR INDICES, NO COLOR; a stale quote re-reads, so the next press is priced right */
    const calls = [];
    let loads = 0;
    const answers = [{ ok: true, body: { ok: true } }, { ok: true, body: { ok: false, error: 'quote_changed' } }, { ok: true, body: { ok: false, error: 'colors_same' } }];
    const account = { server: { rpc: async (name, body) => { calls.push({ name, body }); return answers.shift(); } } };
    const c = { slot: 2, status: 'open', load: async () => { loads++; return true; } };
    const a1 = await X.HI.saveHeroColors(account, c, C2, 2400);
    if (!a1.ok || calls.length !== 1 || calls[0].name !== 'hr_hero_colors_set' || calls[0].body.p_slot !== 2 || calls[0].body.p_price !== 2400 || !calls[0].body.p_idem || !same(calls[0].body.p_colors, C2)) out.push('the press sent ' + JSON.stringify(calls));
    if (calls[0] && Object.values(calls[0].body.p_colors).some((v) => !Number.isInteger(v))) out.push('the press sent a color value');
    if (loads !== 1) out.push('an accepted save re-read ' + loads + ' times');
    const a2 = await X.HI.saveHeroColors(account, c, C2, 2400);
    if (a2.ok || a2.error !== 'quote_changed') out.push('a stale quote answered ' + JSON.stringify(a2));
    if (loads !== 2) out.push('a stale quote did not re-read');
    await X.HI.saveHeroColors(account, c, C2, 2400);
    if (loads !== 3) out.push('colors_same did not re-read');
    const bad = await X.HI.saveHeroColors(account, c, { head: 1 }, 2400);
    if (bad.ok || calls.length !== 3) out.push('half a set went out');
    const zero = await X.HI.saveHeroColors(account, c, C2, 0);
    if (zero.ok || calls.length !== 3) out.push('a price of 0 went out');
    if ('Save colors: ' + gp(2400) !== 'Save colors: 2,400 gp') out.push('the money format moved');
    return out;
  },

  'HC-DYE': async (db, X) => {
    const out = [];
    let clock = 1000;
    const css = (t) => ({ '--dye-1': '#c23a2a', '--dye-2': '#3d6234', '--dye-3': '#2b4a6a', '--dye-4': '#f2a03a', '--dye-5': '#5e1a1f' }[t] || '#6a6865');
    const art = fakeArt();
    const log = [];
    const doc = fakeDoc(log);
    let asked = 0;
    const make = (cap) => X.HD.createHeroDye({ doc, version: 'x', css, now: () => clock, cap, masks: () => { asked++; return Promise.resolve(art.masks); } });
    const d = make(3);
    /* NOTHING LOADS UNTIL A DYED HERO IS IN VIEW */
    if (asked) out.push('the masks loaded before anyone wanted them');
    d.want('a', null, false, art.row, art.image);
    if (asked) out.push('an undyed hero loaded the masks');
    d.want('a', '1.2.3.4', false, art.row, art.image);
    await new Promise((r) => setTimeout(r, 0));
    if (asked !== 1) out.push(`the masks were asked ${asked} times`);
    /* A SPRITE WITH NO MASK (the druid): undyed, and no sheet */
    d.want('b', '1.2.3.4', false, fakeRow(18), art.image);
    if (d.pump() || d.has('b', '1.2.3.4') || d.source('b', '1.2.3.4', 18, 0)) out.push('a sprite with no mask took a sheet');
    if (d.stats().looks !== 0) out.push('a look baked with nobody wanting it');
    /* AT MOST ONE BAKE PER PUMP */
    const keys = ['1.2.1.1', '2.2.1.1', '3.2.1.1', '4.2.1.1', '5.2.1.1'];
    for (const k of keys) d.want('a', k, false, art.row, art.image);
    if (!d.pump() || d.stats().bakes !== 1) out.push('a pump baked ' + d.stats().bakes);
    /* not yet ready: undyed, never a stub; ready: from the sheet */
    if (d.source('a', keys[1], 0, 0)) out.push('a look not baked has a source');
    if (!d.has('a', keys[0]) || !d.source('a', keys[0], 0, 0)) out.push('a baked look has no source');
    d.pump(); d.pump();
    if (d.stats().looks !== 3) out.push('after three pumps ' + d.stats().looks + ' looks');
    /* THE CAP HOLDS, AND A LOOK ON SCREEN IS NEVER EVICTED: all three still drawn, a fourth stays undyed however often it asks */
    for (let f = 0; f < 5; f++) {
      clock += 16;
      for (const k of keys.slice(0, 3)) d.want('a', k, false, art.row, art.image);
      d.want('a', keys[3], false, art.row, art.image);
      d.want('a', keys[4], false, art.row, art.image);
      d.pump();
      d.pump();
    }
    if (d.stats().looks !== 3 || d.stats().evicted !== 0 || d.has('a', keys[3])) out.push('past the cap with all on screen: ' + JSON.stringify(d.stats()));
    if (d.source('a', keys[3], 0, 0)) out.push('past the cap a hero has a sheet');
    /* THE HERO YOU PLAY TAKES A PLACE ANYWAY, from the least recently drawn other look, and bakes first */
    clock += 16;
    for (const k of keys.slice(1, 3)) d.want('a', k, false, art.row, art.image);
    clock += 16;
    d.want('a', '5.5.1.1', true, art.row, art.image);
    d.want('a', keys[3], false, art.row, art.image);
    d.pump();
    if (!d.has('a', '5.5.1.1') || d.stats().evicted !== 1 || d.stats().looks !== 3 || d.has('a', keys[0])) out.push('the hero you play: ' + JSON.stringify(d.stats()));
    /* ...but never a look that is also someone's own hero on another pane's frame */
    /* A LOOK NOT DRAWN FOR A WHILE GIVES UP ITS PLACE: the crowd left */
    clock += X.HD.STALE_MS + 1;
    d.want('a', '5.5.1.1', true, art.row, art.image);
    d.want('a', keys[3], false, art.row, art.image);
    d.pump();
    if (!d.has('a', keys[3]) || d.stats().looks !== 3) out.push('a stale look kept its place: ' + JSON.stringify(d.stats()));
    /* EVICTED MEANS FREED */
    const gone = doc.canvases.filter((c) => c._w === 0 && c._h > 0).length;
    if (gone !== d.stats().evicted) out.push(`${d.stats().evicted} evicted, ${gone} sheets freed`);
    /* TWO SETS AN OUTFIT CAN'T TELL APART SHARE A SHEET: this mask keys head and body only */
    const before = d.stats().bakes;
    clock += X.HD.STALE_MS + 1;
    d.want('a', '5.5.9.9', true, art.row, art.image);
    if (d.pump() || d.stats().bakes !== before || !d.has('a', '5.5.9.9')) out.push('legs split a knight: ' + JSON.stringify(d.stats()));
    /* SAME PIXELS, NEW COLOURS: the sheet carries the recolour; the source frame maps to its own cell */
    const s = d.source('a', '5.5.1.1', 2, 0);
    if (!s || s.sy !== 0 || s.sx !== 2) out.push('a frame maps to ' + JSON.stringify(s && { sx: s.sx, sy: s.sy }));
    /* THE RECOLOUR: value kept, hue taken, outside the mask untouched */
    const px = new Uint8ClampedArray([200, 200, 200, 255, 100, 100, 100, 255, 90, 90, 90, 255, 50, 60, 70, 0]);
    const mk = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255]);
    X.HD.recolourPixels(px, mk, ['#c23a2a', null, null, null]);
    if (!(px[0] > px[1] && px[0] > px[2])) out.push('a dyed pixel did not take the hue: ' + [px[0], px[1], px[2]]);
    if (!(px[0] > px[4] * 1.5)) out.push('a dyed pixel lost its value: ' + [px[0], px[4]]);
    if (px[8] !== 90 || px[9] !== 90 || px[10] !== 90) out.push('an unmasked pixel moved');
    if (px[12] !== 50) out.push('a transparent pixel moved');
    return out;
  },

  'HC-DRAW': async (db, X) => {
    const out = [];
    /* A WALKER'S COLORS REACH ITS UNIT */
    const map = { id: 'm', kind: 'town', T: 32, w: 8, h: 8, ground: new Array(64).fill('flagstone'), start: [1, 1], mask: new Uint8Array(64), walkable: () => true, objects: [], buildings: [], lights: [] };
    const walker = X.TP.walkerOf({ id: '00000000-0000-4000-a000-000000000001', slot: 0, name: 'Marlow', x: 2, y: 2, gx: 2, gy: 2, dir: 's', colors: C2 });
    if (!walker || walker.dye !== '5.6.7.8') out.push('the walker reads ' + JSON.stringify(walker));
    const sprites = { outfit_knight: { anims: { idle: { fps: 5, loop: true, dirs: { s: [[0, 0]] } }, walk: { fps: 8, loop: true, dirs: { s: [[0, 0]] } } } } };
    let units = [];
    try {
      const cast = X.TN.createTownCast(map, { sprites });
      units = cast.frame([walker], 1000);
    } catch (e) { out.push('the town cast threw: ' + String(e.message).slice(0, 160)); }
    if (units.length !== 1 || units[0].dye !== '5.6.7.8') out.push('the unit reads ' + JSON.stringify(units[0] && units[0].dye));
    /* THE HERO YOU PLAY */
    try {
      const walk = X.WK.createWalkScene(map, { at: [1, 1], sprites, openClasses: [], maps: {}, heroSprite: () => 'outfit_knight', heroDye: () => '1.2.3.4' });
      const f = walk.frame({ kind: 'town', walkers: [] }, 1000);
      if (f.hero.dye !== '1.2.3.4') out.push('the hero you play reads ' + JSON.stringify(f.hero.dye));
    } catch (e) { out.push('the walk scene threw: ' + String(e.message).slice(0, 160)); }
    /* A HUNT: the viewed hero's own section; everyone else's seat */
    const book = { sprite: () => ({ anims: { walk: { fps: 8, loop: true, dirs: { s: [[0, 0]] } }, idle: { fps: 5, loop: true, dirs: { s: [[0, 0]] } } } }), frames: () => 1, facing: (i, a, d) => d };
    const tl = { units: () => [1, 2, 3], positionAt: (u) => ({ x: u, y: 1, moving: false, d: 0, hx: 0, hy: 1 }), hpAt: () => null, delayMs: () => 0, serverNowAt: () => null, forget: () => false };
    const heroes = new Map([[1, { seat: 0, role: 'tank', name: 'Me' }], [2, { seat: 1, role: 'ranger', name: 'Tamsel' }], [3, { seat: 2, role: 'mage', name: 'NoColors' }]]);
    const people = new Map([[0, { id: 'a', slot: 0, dye: '1.2.3.4' }], [1, { id: 'b', slot: 0, dye: '5.6.7.8' }], [2, { id: 'c', slot: 0, dye: null }]]);
    const read = () => ({ units: new Map(), heroes, people, viewed: 1, viewedShield: 0, poseAtMs: null, entrance: null, huntName: null, huntFromMs: null, self: heroes.get(1), look: 'outfit_knight', dye: '1.2.3.4', level: 1, shown: () => false });
    const scene = X.SC.createHuntScene({ timeline: tl, book, read });
    const f = scene.frame(1000);
    if (!f.hero || f.hero.dye !== '1.2.3.4') out.push('the viewed hero in a hunt reads ' + JSON.stringify(f.hero && f.hero.dye));
    const of = (u) => (f.units.find((d) => d.unit === u) || {}).dye;
    if (of(2) !== '5.6.7.8') out.push('a party member reads ' + JSON.stringify(of(2)));
    if (of(3) !== null) out.push('a member with none reads ' + JSON.stringify(of(3)));
    /* COMPOSE KEEPS IT ON THE UNIT IT DRAWS */
    const bk = X.BK.createBook({ hunt: { size: [64, 64], sprites: { outfit_knight: { class: 'unit', layer: 'unit', frame: [4, 4], anchor: [2, 3], footprint: [1, 1], hover: 0, height: 4, shadow: null, anims: { idle: { fps: 5, loop: true, dirs: { s: [[0, 0]] } } } } }, terrain: {} } });
    const fm = { id: 'm', kind: 'town', T: 32, w: 8, h: 8, ground: new Array(64).fill('flagstone'), groundTerrain: null, objects: [], buildings: [], lights: [], rockBlocks: null, faces: {}, light: 'day', outdoor: true, focus: null };
    let list = null;
    try {
      list = X.CP.composeFrame(fm, bk, { hero: { id: 'outfit_knight', x: 2, y: 2, dye: '1.2.3.4' }, units: [{ id: 'outfit_knight', x: 3, y: 3, dye: '5.6.7.8' }, { id: 'outfit_knight', x: 4, y: 4 }], t: 0 }, { ox: 0, oy: 0, w: 256, h: 256 }, { materials: {}, sprites: bk.sprites, openClasses: [], lights: {} }, 32);
    } catch (e) { out.push('compose threw: ' + String(e.message).slice(0, 200)); }
    if (list) {
      const units2 = list.sprites.filter((d) => d.kind === 'unit');
      const dyes = units2.map((d) => d.dye || null).sort();
      if (JSON.stringify(dyes) !== JSON.stringify(['1.2.3.4', '5.6.7.8', null])) out.push('compose carries ' + JSON.stringify(dyes));
      const own = units2.filter((d) => d.dyeOwn).map((d) => d.dye);
      if (own.join() !== '1.2.3.4') out.push('compose marks as yours ' + JSON.stringify(own));
    }
    return out;
  },

  'HC-PAINT': async (db, X) => {
    const out = [];
    /* the real backend over a fake canvas: it composes, wants, pumps, decides whether to paint, and paints a unit from its look's sheet */
    const art = fakeArt();
    const log = [];
    const doc0 = fakeDoc(log);
    let clock = 1000;
    const css = (t) => (String(t).startsWith('--dye-') ? '#c23a2a' : '#101010');
    const atlas = fakeImage(24, 2, () => [120, 120, 120, 255]);
    const dyes = X.HD.createHeroDye({ doc: doc0, version: 'x', css, now: () => clock, cap: 2, masks: () => Promise.resolve(art.masks) });
    const row = { class: 'unit', layer: 'unit', frame: [FW, FH], anchor: [1, 1], footprint: [1, 1], hover: 0, height: 2, shadow: null, anims: { idle: { fps: 5, loop: true, dirs: { s: [[0, 0]] } }, walk: { fps: 8, loop: true, dirs: { s: [[2, 0], [4, 0]] } } } };
    const book = X.BK.createBook({ hunt: { size: [24, 2], sprites: { a: row }, terrain: {} } });
    const win = { innerWidth: 400, innerHeight: 300, devicePixelRatio: 1, performance: { now: () => clock }, addEventListener() {}, removeEventListener() {},
      setTimeout: () => 0, clearTimeout() {}, requestIdleCallback: () => 0, cancelIdleCallback() {}, matchMedia: () => ({ matches: false }) };
    const ctxOf = new Map();
    const paints = [];
    const canvasDoc = { createElement() {
      const c = { width: 0, height: 0, style: {}, addEventListener() {}, setAttribute() {}, removeEventListener() {}, remove() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }), getContext() {
        if (ctxOf.has(c)) return ctxOf.get(c);
        const g = new Proxy({ imageSmoothingEnabled: false, globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '', font: '', textAlign: '', textBaseline: '', measureText: () => ({ width: 1 }),
          drawImage(src, sx, sy) { paints.push({ src, sx, sy }); } }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
        ctxOf.set(c, g);
        return g;
      } };
      return c;
    } };
    const map = { id: 'm', kind: 'town', T: 32, w: 8, h: 8, ground: new Array(64).fill('flagstone'), groundTerrain: null, objects: [], buildings: [], lights: [], faces: {}, light: 'day', outdoor: false, focus: null, patches: [], blend: null, start: [1, 1], rockBlocks: null };
    const tables = { materials: { flagstone: {} }, sprites: book.sprites, openClasses: [], lights: {} };
    const cb = X.CB.createCanvasBackend({ win, doc: canvasDoc, book, images: { hunt: atlas }, tables, css, dyes });
    cb.mount({ appendChild() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }) });
    cb.setMap(map);
    const state = { hero: { id: 'a', x: 2, y: 2, dye: '1.2.3.4', anim: 'idle', dir: 's' }, t: 0 };
    let guard = 0;
    while (!cb.ready(state) && guard++ < 1000) { /* its view's ground */ }
    const frame = async () => { clock += 16; paints.length = 0; cb.sync(state); await new Promise((r) => setTimeout(r, 0)); };
    const fromSheet = () => paints.filter((p) => p.src !== atlas && p.sx === 0 && p.sy === 0 && p.src.data && p.src.width === 8 * FW);
    const fromAtlas = () => paints.filter((p) => p.src === atlas);
    await frame();
    /* the frame before the look lands: drawn undyed, from the atlas */
    if (!fromAtlas().length) out.push('CONTROL: the first frame drew the hero from nowhere: ' + paints.length + ' paints');
    /* the next frames bake it, with nothing else on screen moving: the held frame must repaint once it lands */
    let painted = false;
    for (let i = 0; i < 6 && !painted; i++) { await frame(); painted = fromSheet().length > 0; }
    if (!dyes.has('a', '1.2.3.4')) out.push('nothing baked the look while the frame stood still: ' + JSON.stringify(dyes.stats()));
    if (!painted) out.push('the hero never drew from its sheet');
    /* and then a still world holds again: a look on screen costs a still town no paint */
    for (let i = 0; i < 3; i++) await frame();
    if (paints.length) out.push('with its look baked, a still frame painted ' + paints.length + ' times');
    return out;
  },
};

function plantSql(text, [, find, repl]) {
  if (find instanceof RegExp) {
    if (!find.test(text)) throw Object.assign(new Error('sql mutant anchor not found: ' + find), { harness: true });
    return text.replace(find, repl);
  }
  if (text.split(find).length !== 2) throw Object.assign(new Error('sql mutant anchor not found once: ' + find.slice(0, 80)), { harness: true });
  return text.replace(find, () => repl);
}

async function loadReaders(root) {
  const v = (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
  const u = (p) => pathToFileURL(join(root, p)).href + '?v=' + v;
  return {
    GS: await import(u('src/data/gold-sinks.js')),
    OF: await import(u('src/data/outfits.js')),
    HO: await import(u('src/data/hunt-outfits.js')),
    SK: await import(u('src/data/start-kit.js')),
    CS: await import(u('src/session/character-sections.js')),
    TP: await import(u('src/session/town-presence.js')),
    PS: await import(u('src/session/party-sections.js')),
    HI: await import(u('src/session/hero-color-intents.js')),
    REF: await import(u('src/session/refusal.js')),
    IW: await import(u('src/shell/intent-words.js')),
    RW: await import(u('src/data/refusal-words.js')),
    OW: await import(u('src/shell/windows/character/outfit.js')),
    HC: await import(u('src/app/hero-create.js')),
    HD: await import(u('src/world/hero-dye.js')),
    TN: await import(u('src/world/town-scene.js')),
    WK: await import(u('src/world/walk-scene.js')),
    SC: await import(u('src/hunt-view/scene.js')),
    CP: await import(u('src/world/core/compose.js')),
    BK: await import(u('src/world/core/book.js')),
    CB: await import(u('src/world/render/canvas-backend.js')),
  };
}

/* One arm in its own transaction, the planted defect (if any) inside it. */
async function runArm(db, X, id, mutant) {
  await db.query('begin');
  try {
    if (mutant && mutant.db) {
      const [fn, find, repl] = mutant.db;
      const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [fn])).split(String.fromCharCode(13)).join('');
      if (def.split(find).length !== 2) throw Object.assign(new Error(`mutant anchor not found once in ${fn}: ${find.slice(0, 80)}`), { harness: true });
      await db.exec(def.replace(find, () => repl));
    }
    if (mutant && mutant.ddl) await db.exec(mutant.ddl);
    return await ARMS[id](db, X, mutant);
  } finally { await db.query('rollback'); await claims(db, null).catch(() => {}); }
}

async function main() {
  if (process.argv.includes('--list')) { for (const [id, m] of Object.entries(MUTANTS)) console.log(`${id}  [${m.arm}]  ${m.why}`); return; }
  const { bootReplay } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(1); }
  const X = await loadReaders(ROOT);
  const pick = (process.argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
  if (!(process.argv.includes('--selftest') || pick)) {
    let bad = 0;
    for (const id of Object.keys(ARMS)) {
      let p;
      try { p = await runArm(db, X, id, null); } catch (e) { p = ['threw: ' + String(e && e.stack || e).slice(0, 600)]; }
      if (p.length) { bad++; for (const m of p) console.error(`✗ ${id}: ${m}`); } else console.log(`✓ ${id}`);
    }
    console.log(bad ? `hero-colors: ${bad} arm(s) red` : `hero-colors: all ${Object.keys(ARMS).length} arms green`);
    process.exit(bad ? 1 : 0);
  }
  if (pick && !MUTANTS[pick]) { console.error('unknown mutant ' + pick); process.exit(2); }
  let missed = 0;
  const ids = pick ? [pick] : Object.keys(MUTANTS);
  for (const id of ids) {
    const m = MUTANTS[id];
    let p;
    try {
      if (m.js) {
        const dir = mkdtempSync(join(tmpdir(), 'hr-hc-'));
        try {
          cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true, filter: (s) => !/\.(png|webp|jpg|ogg|mp3)$/.test(s) });
          const f = join(dir, m.js[0]);
          let src = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
          for (const [find, repl] of m.js[1]) {
            if (src.split(find).length !== 2) throw Object.assign(new Error('js mutant anchor not found once: ' + find.slice(0, 60)), { harness: true });
            src = src.replace(find, () => repl);
          }
          writeFileSync(f, src);
          p = await runArm(db, await loadReaders(dir), m.arm, null);
        } finally { rmSync(dir, { recursive: true, force: true }); }
      } else p = await runArm(db, X, m.arm, m);
    } catch (e) {
      if (e && e.harness) { console.error(`✗ ${id}: harness: ${e.message}`); missed++; continue; }
      p = ['threw: ' + String(e && e.message || e).slice(0, 200)];
    }
    if (p.length) console.log(`✓ ${m.arm} goes red on ${id}: ${m.why}`);
    else { console.error(`✗ ${m.arm} stayed GREEN on ${id}: ${m.why}`); missed++; }
  }
  console.log(missed ? `hero-colors --selftest: ${missed} of ${ids.length} mutant(s) survived` : `hero-colors --selftest: all ${ids.length} mutants killed`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
