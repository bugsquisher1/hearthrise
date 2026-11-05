#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/town-shows.mjs — WHAT GOLD BUYS IN HAVORA, AND THE SEAMS THE SINK LANES SHARE (Tyler 2026-11-04; the designer's board section
//   "2026-11-04 Gold sinks"; 2027-02-27-gold-sinks-catalogue.generated.sql, 2027-02-27-gold-sinks-seams.sql; src/data/gold-sinks.js).
//
//   node tests/town-shows.mjs             the guard
//   node tests/town-shows.mjs --list      the mutation catalogue
//   node tests/town-shows.mjs --selftest  every planted defect must turn its arm red
//   node tests/town-shows.mjs --mutate=<id>
//
// mutant-anchors: supabase/migrations/2027-02-27-gold-sinks-seams.sql
//
// The real chain replayed (PGlite), the real client modules; production untouched:
//   TS-RULES   hr_sink_rules holds exactly the data file's rows; setup slots are one row: free + prices = the hero's setup limit
//   TS-PRICE   hr_sink_price climbs, ends in null, reads a Level; every helper here is the owner's: no client role can call one
//   TS-TITLE   replacing ONLY hr_title_of's body (what lane/c-hero-sinks does) reaches the chat row through hr_chat_send, the hero's
//              look and a stranger's town read, and a forged from_title on an insert never survives
//   TS-COLORS  a hero's base_colors reach a stranger's town read; none chosen reads null
//   TS-TOWN    replacing ONLY hr_town_extras / hr_town_shows_of reaches the town read as `extras` / `shows`; the read keeps what it had
//   TS-AGAIN   a second apply of both files is byte-identical and never overwrites a body a later lane put in a stub
//   TS-CLIENT  the walker keeps a title and colors and refuses junk; the plate reads "Marlow the Wolfer · 18"; a chat line carries the
//              title and draws it; the Works stubs stay hidden
// TRUE CONCURRENCY is unverified here (PGlite is one backend); the lock order is the migration header's.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = '000000c0-0000-4000-a000-0000901d7a01';
const B = '000000c0-0000-4000-a000-0000901d7a02';
const idem = () => crypto.randomUUID();
const MIG = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
const CATALOGUE = '2027-02-27-gold-sinks-catalogue.generated.sql';
const SEAMS = '2027-02-27-gold-sinks-seams.sql';
const LOOK = 'public.hr_town_look(uuid,integer)';
const VIEW = 'public.hr_town_view(integer,text,integer,integer,bigint,integer,integer)';
const CHAT_ROW = 'public.hr_chat_row(public.chat_messages)';
const NAME_TRIGGER = 'public.hr_chat_name_authority()';
const PRICE = 'public.hr_sink_price(text,integer,integer)';
const THE_MAP = 'town_common';

/* ── THE PLANTED DEFECTS ─────────────────────────────────────────────────────
   db: a live body edited inside the arm's transaction (fn, find, replace). ddl: a statement in it. sql: an edit of a migration's TEXT the
   arm re-applies. js: a client module, copied and edited. Each names the arm that must go red. */
export const MUTANTS = {
  price_wrong_rung: { arm: 'TS-PRICE', why: 'the first purchase is charged the second rung',
    db: [PRICE, 'r.prices[greatest(coalesce(p_bought, 0), 0) + 1]', 'r.prices[greatest(coalesce(p_bought, 0), 0) + 2]'] },
  price_ignores_level: { arm: 'TS-PRICE', why: 'a Level price reads Level 1 for everyone',
    db: [PRICE, 'r.price_base + r.price_per_level * greatest(coalesce(p_level, 1), 1)', 'r.price_base + r.price_per_level'] },
  helper_open_to_clients: { arm: 'TS-PRICE', why: 'a client role can call a helper', ddl: `grant execute on function public.hr_title_of(uuid, integer) to authenticated` },
  rules_drift: { arm: 'TS-RULES', why: 'the table no longer says what the data file says', ddl: `update public.hr_sink_rules set prices = array[1, 2, 3]::bigint[] where sink_id = 'round'` },
  setups_past_limit: { arm: 'TS-RULES', why: 'free + prices is more than a hero can hold', ddl: `update public.hr_sink_rules set free = 3 where sink_id = 'setup_slot'` },
  title_not_stamped: { arm: 'TS-TITLE', why: 'the trigger stops stamping the title',
    db: [NAME_TRIGGER, "  new.from_title := case when new.from_id is null then null\n                         else left(public.hr_title_of(new.from_id, coalesce(new.from_slot, 0)), 40) end;\n", ''] },
  title_from_client: { arm: 'TS-TITLE', why: 'a forged title survives the insert',
    db: [NAME_TRIGGER, "  new.from_title := case when new.from_id is null then null\n", "  new.from_title := case when new.from_id is null or new.from_title is not null then new.from_title\n"] },
  row_drops_title: { arm: 'TS-TITLE', why: 'the chat row leaves the title out', db: [CHAT_ROW, "'from_title', m.from_title, ", ''] },
  row_drops_crier: { arm: 'TS-TITLE', why: 'the chat row leaves the Crier flag out', db: [CHAT_ROW, ", 'crier', m.crier", ''] },
  look_drops_title: { arm: 'TS-TITLE', why: 'a stranger never sees the title', db: [LOOK, "'title', left(public.hr_title_of(p_user, p_slot), 40),", "'title', null,"] },
  look_drops_colors: { arm: 'TS-COLORS', why: 'a stranger never sees the colors',
    db: [LOOK, "(select nullif(po.base_colors, '{}'::jsonb) from public.player_outfits po where po.user_id = p_user and po.slot = p_slot)", 'null::jsonb'] },
  view_drops_extras: { arm: 'TS-TOWN', why: 'the town read never carries the Works', db: [VIEW, "    'extras', public.hr_town_extras(p_map));", "    'extras', '{}'::jsonb);"] },
  view_drops_shows: { arm: 'TS-TOWN', why: 'the town read never carries the shows', db: [VIEW, "    'shows', public.hr_town_shows_of(p_map),\n", "    'shows', null,\n"] },
  stub_overwrites: { arm: 'TS-AGAIN', why: 'a second apply puts the stub back over a later lane\'s body',
    sql: [SEAMS, "  if to_regprocedure('public.hr_title_of(uuid,integer)') is null then\n    create function public.hr_title_of(p_user uuid, p_slot int)",
      "  if true then\n    create or replace function public.hr_title_of(p_user uuid, p_slot int)"] },
  repin_lost: { arm: 'TS-AGAIN', why: 'a second apply refuses because the pin forgot this file\'s own image',
    sql: [SEAMS, "('public.hr_town_look(uuid,integer)', '1a6ceebe218f985e63f182e3fa9515f2', '4e2d78833019b7001758dd04a1fb60cb')", "('public.hr_town_look(uuid,integer)', '1a6ceebe218f985e63f182e3fa9515f2', '00000000000000000000000000000000')"] },
  walker_keeps_junk: { arm: 'TS-CLIENT', why: 'a title that is not plain words reaches the plate',
    js: ['src/session/town-presence.js', [["    title: typeof w.title === 'string' && TITLE.test(w.title) ? w.title : null,", '    title: w.title,']]] },
  plate_no_title: { arm: 'TS-CLIENT', why: 'the town label drops the title',
    js: ['src/world/town-scene.js', [["w.name + (w.title ? ' ' + w.title : '') + (w.level", 'w.name + (w.level']]] },
  line_no_title: { arm: 'TS-CLIENT', why: 'a chat line drops the title',
    js: ['src/social/chat-lines.js', [["    title: !whisper && typeof row.from_title === 'string' && TITLE.test(row.from_title) ? row.from_title : null,", '    title: null,']]] },
  extras_merged: { arm: 'TS-CLIENT', why: 'an answer with no extras keeps the last ones',
    js: ['src/session/town-presence.js', [["    this._extras = b.extras && typeof b.extras === 'object' && !Array.isArray(b.extras) ? b.extras : null;", "    this._extras = b.extras && typeof b.extras === 'object' && !Array.isArray(b.extras) ? b.extras : this._extras;"]]] },
  works_shown: { arm: 'TS-CLIENT', why: 'the Works tab shows before its lane lands',
    js: ['src/shell/windows/havora/works.js', [["shown: false", 'shown: true']]] },
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
async function hero(db, uid, slot, name) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'town-shows guard') on conflict (user_id) do nothing`, [uid]);
  const dye = await one(db, 'select min(idx) from public.hr_outfit_dyes');
  const r = await as(db, uid, 'select public.hr_create_hero($1::int, $2, $3::jsonb, $4::uuid)', [slot, name, JSON.stringify({ head: dye, body: dye, legs: dye, feet: dye }), idem()]);
  if (!r || r.ok !== true) throw Object.assign(new Error(`hr_create_hero(${slot}, ${name}): ` + JSON.stringify(r)), { harness: true });
  await db.query('update public.player_state set stamina_ms = 28800000, stamina_at = now() where user_id = $1 and slot = $2', [uid, slot]);
}
/* A stranger's read of the square, with `whose` standing in it. */
async function strangerSees(db, whose, viewer) {
  await db.query("update public.hr_flags set enabled = true where key = 'town_presence'");
  await as(db, whose, 'select public.hr_town_here(0, $1)', [THE_MAP]);
  await db.query('update public.town_bodies set look = null, look_at = null where user_id = $1', [whose]);
  const read = await as(db, viewer, 'select public.hr_town_view(0, $1, null, null, null, null, null)', [THE_MAP]);
  return { read, walker: (read && read.walkers || []).find((w) => w.id === whose) || null };
}

const ARMS = {
  'TS-RULES': async (db, X) => {
    const out = [];
    const rows = await q(db, 'select * from public.hr_sink_rules order by sink_id');
    const want = Object.keys(X.GS.SINK_RULES).sort();
    if (rows.map((r) => r.sink_id).join() !== want.join()) out.push(`the table holds ${rows.map((r) => r.sink_id)}, the data file ${want}`);
    for (const r of rows) {
      const d = X.GS.SINK_RULES[r.sink_id];
      if (!d) continue;
      const same = (a, b) => JSON.stringify(a === null || a === undefined ? null : a) === JSON.stringify(b === null || b === undefined ? null : b);
      const prices = (r.prices || []).map(Number);
      if (!same(prices, d.prices || [])) out.push(`${r.sink_id}: prices ${prices} against ${d.prices}`);
      if (Number(r.free) !== (d.free || 0)) out.push(`${r.sink_id}: free ${r.free} against ${d.free}`);
      for (const [col, key] of [['price_base', 'priceBase'], ['price_per_level', 'pricePerLevel'], ['per_day', 'perDay'], ['seconds', 'seconds'], ['book_s', 'bookS'], ['gap_s', 'gapS'], ['min_level', 'minLevel'], ['max_letters', 'maxLetters'], ['per_minute', 'perMinute']]) {
        if (!same(r[col] === null ? null : Number(r[col]), d[key])) out.push(`${r.sink_id}.${col}: ${r[col]} against ${d[key]}`);
      }
      if (!same(r.offers, d.offers)) out.push(`${r.sink_id}.offers: ${r.offers} against ${d.offers}`);
    }
    const setup = rows.find((r) => r.sink_id === 'setup_slot');
    const limit = Number(await one(db, `select public.hr_hunt_limit('presets')`));
    if (!setup || setup.free + setup.prices.length !== limit) out.push(`setup_slot's free + prices is not the hero's limit of ${limit}`);
    if (rows.some((r) => /boss|call/.test(r.sink_id))) out.push('a boss call row landed: that lane is not approved');
    return out;
  },

  'TS-PRICE': async (db) => {
    const out = [];
    const price = (s, n, l) => one(db, 'select public.hr_sink_price($1, $2::int, $3::int)', [s, n, l === undefined ? null : l]);
    const seen = [];
    for (let n = 0; n <= 5; n++) seen.push(await price('powder', n));
    if (seen.map((v) => (v === null ? 'null' : Number(v))).join() !== '2000,4000,6000,8000,10000,null') out.push(`the powder ladder reads ${seen}`);
    if (Number(await price('setup_slot', 0)) !== 5000 || Number(await price('setup_slot', 2)) !== 40000 || (await price('setup_slot', 3)) !== null) out.push('the setup ladder reads wrong');
    if (Number(await price('hero_colors', 0, 18)) !== 2400 || Number(await price('hero_colors', 0, 45)) !== 3750) out.push(`a Level price reads ${await price('hero_colors', 0, 18)} at 18`);
    if ((await price('no_such_sink', 0)) !== null) out.push('an unknown sink has a price');
    for (const fn of [PRICE, 'public.hr_sink_lock(uuid)', 'public.hr_title_of(uuid,integer)', 'public.hr_town_extras(text)', 'public.hr_town_shows_of(text)', CHAT_ROW, LOOK]) {
      for (const role of ['anon', 'authenticated']) if (await one(db, 'select has_function_privilege($1, $2, $3)', [role, fn, 'execute'])) out.push(`${role} reaches ${fn}`);
    }
    for (const role of ['anon', 'authenticated']) {
      if (await one(db, `select has_table_privilege($1, 'public.hr_sink_rules', 'select') or has_table_privilege($1, 'public.hr_sink_rules', 'insert,update,delete')`, [role])) out.push(`${role} reaches hr_sink_rules`);
      if (await one(db, `select has_table_privilege($1, 'public.chat_messages', 'insert') or has_table_privilege($1, 'public.chat_messages', 'update')`, [role])) out.push(`${role} can write a chat row, so it can set crier`);
    }
    return out;
  },

  'TS-TITLE': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel');
    /* THE STUB: nothing worn reads null everywhere. */
    let sent = await as(db, A, 'select public.hr_chat_send(0, $1, $2)', ['global', 'plain words first']);
    if (!sent || sent.ok !== true) return ['hr_chat_send refused the first line: ' + JSON.stringify(sent)];
    if (!('from_title' in sent.line) || sent.line.from_title !== null || sent.line.crier !== false) out.push('a line with the stub reads ' + JSON.stringify(sent.line));
    /* WHAT THE HERO LANE DOES: this body, and nothing else. */
    await db.exec(`create or replace function public.hr_title_of(p_user uuid, p_slot int) returns text language sql stable security definer set search_path = public, pg_catalog as $fn$
      select case when p_user = '${A}'::uuid then 'the Wolfer' end $fn$`);
    sent = await as(db, A, 'select public.hr_chat_send(0, $1, $2)', ['global', 'and a title now']);
    if (!sent || sent.ok !== true) return ['hr_chat_send refused the second line: ' + JSON.stringify(sent)];
    if (sent.line.from_title !== 'the Wolfer') out.push('the chat row carries ' + JSON.stringify(sent.line.from_title));
    const stored = await one(db, 'select from_title from public.chat_messages where id = $1', [sent.line.id]);
    if (stored !== 'the Wolfer') out.push('the stored line holds ' + stored);
    const history = await as(db, B, 'select public.hr_chat_recent(0)');
    if (!history || !Array.isArray(history.lines) || !history.lines.some((l) => l.from_title === 'the Wolfer')) out.push('the chat history drops the title: ' + JSON.stringify(history).slice(0, 200));
    /* A FORGED TITLE never survives, by any path that can insert at all. */
    const forged = await q(db, `insert into public.chat_messages (channel, from_id, from_slot, from_name, from_title, body) values ('global', $1, 0, 'x', 'the Forged', 'zz') returning from_title`, [B]);
    if (forged[0].from_title !== null) out.push('a forged from_title on a hero wearing none survived: ' + forged[0].from_title);
    const forged2 = await q(db, `insert into public.chat_messages (channel, from_id, from_slot, from_name, from_title, body) values ('global', $1, 0, 'x', 'the Forged', 'zz') returning from_title`, [A]);
    if (forged2[0].from_title !== 'the Wolfer') out.push('a forged from_title beat the worn one: ' + forged2[0].from_title);
    /* A STRANGER'S READ OF THE SQUARE */
    const { walker } = await strangerSees(db, A, B);
    if (!walker) out.push('the stranger never saw the hero');
    else if (walker.title !== 'the Wolfer') out.push('the stranger reads the title ' + JSON.stringify(walker.title));
    const none = await one(db, 'select public.hr_town_look($1::uuid, 0)', [B]);
    if (none.title !== null || !('title' in none)) out.push('a hero wearing none has a look of ' + JSON.stringify(none));
    return out;
  },

  'TS-COLORS': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel');
    const dyes = (await q(db, 'select idx from public.hr_outfit_dyes order by idx limit 4')).map((r) => Number(r.idx));
    const chosen = { head: dyes[0], body: dyes[1], legs: dyes[2], feet: dyes[3] };
    await db.query('update public.player_outfits set base_colors = $2::jsonb where user_id = $1 and slot = 0', [A, JSON.stringify(chosen)]);
    const { walker } = await strangerSees(db, A, B);
    if (!walker) return ['the stranger never saw the hero'];
    if (JSON.stringify(walker.colors) !== JSON.stringify(await one(db, 'select $1::jsonb', [JSON.stringify(chosen)]))) out.push('the stranger reads colors ' + JSON.stringify(walker.colors));
    await db.query(`update public.player_outfits set base_colors = '{}'::jsonb where user_id = $1 and slot = 0`, [A]);
    const look = await one(db, 'select public.hr_town_look($1::uuid, 0)', [A]);
    if (look.colors !== null) out.push('a hero with none chosen reads ' + JSON.stringify(look.colors));
    return out;
  },

  'TS-TOWN': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel');
    const before = await strangerSees(db, A, B);
    if (!before.read || before.read.ok !== true) return ['the town read answered ' + JSON.stringify(before.read)];
    if (JSON.stringify(before.read.extras) !== '{}' || before.read.shows !== null) out.push(`the stubs read extras ${JSON.stringify(before.read.extras)}, shows ${JSON.stringify(before.read.shows)}`);
    for (const k of ['map', 'inst', 'cap', 'full', 'cursor', 'area', 'walkers', 'gone', 'me', 'hearth']) if (!(k in before.read)) out.push(`the town read lost ${k}`);
    await db.exec(`create or replace function public.hr_town_extras(p_map text) returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
      select jsonb_build_object('works', jsonb_build_object('map', p_map, 'stage', 2)) $fn$`);
    await db.exec(`create or replace function public.hr_town_shows_of(p_map text) returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
      select jsonb_build_object('round', p_map) $fn$`);
    const after = await as(db, B, 'select public.hr_town_view(0, $1, null, null, null, null, null)', [THE_MAP]);
    if (!after.extras || !after.extras.works || after.extras.works.stage !== 2 || after.extras.works.map !== THE_MAP) out.push('a later lane\'s extras never reached the read: ' + JSON.stringify(after.extras));
    if (!after.shows || after.shows.round !== THE_MAP) out.push('the shows never reached the read: ' + JSON.stringify(after.shows));
    return out;
  },

  'TS-AGAIN': async (db, X, mutant) => {
    const out = [];
    const seams = mutant && mutant.sql ? plantSql(MIG(SEAMS), mutant.sql) : MIG(SEAMS);
    const inventory = async () => (await q(db, `select p.oid::regprocedure::text fn, md5(pg_get_functiondef(p.oid)) m from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname in ('hr_sink_price', 'hr_sink_lock', 'hr_title_of', 'hr_town_extras', 'hr_town_shows_of', 'hr_town_look', 'hr_town_view', 'hr_chat_row', 'hr_chat_name_authority') order by 1`))
      .map((r) => r.fn + ':' + r.m).join('\n');
    /* a later lane has put its body in a stub, as the hero lane will */
    await db.exec(`create or replace function public.hr_title_of(p_user uuid, p_slot int) returns text language sql stable security definer set search_path = public, pg_catalog as $fn$ select 'the Later Lane'::text $fn$`);
    await db.exec(`revoke execute on function public.hr_title_of(uuid, integer) from public, anon, authenticated, service_role`);
    const was = await inventory();
    const rows = JSON.stringify(await q(db, 'select * from public.hr_sink_rules order by sink_id'));
    await db.exec('savepoint again');
    try {
      await db.exec(MIG(CATALOGUE));
      await db.exec(seams);
    } catch (e) {
      out.push('the second apply refused: ' + String(e.message).split('\n')[0].slice(0, 180));
      await db.exec('rollback to savepoint again');
      return out;
    }
    if ((await inventory()) !== was) out.push('a second apply moved a body');
    if (JSON.stringify(await q(db, 'select * from public.hr_sink_rules order by sink_id')) !== rows) out.push('a second apply moved a price row');
    if ((await one(db, 'select public.hr_title_of($1::uuid, 0)', [A])) !== 'the Later Lane') out.push('a second apply put the stub back over a later lane\'s body');
    return out;
  },

  'TS-CLIENT': async (db, X) => {
    const out = [];
    const W = (o) => ({ id: A, slot: 0, name: 'Marlow', x: 10, y: 10, gx: 10, gy: 10, dir: 's', level: 18, ...o });
    const w = X.TP.walkerOf(W({ title: 'the Wolfer', colors: { head: 1, body: 2, legs: 3, feet: 4 } }));
    if (w.title !== 'the Wolfer' || !w.colors || w.colors.feet !== 4) out.push('a good walker lost its title or colors: ' + JSON.stringify(w));
    if (X.TP.walkerOf(W({ title: '<b>Rich</b>' })).title !== null) out.push('a title with markup reached the plate');
    if (X.TP.walkerOf(W({ title: 7 })).title !== null) out.push('a title that is no string reached the plate');
    if (X.TP.walkerOf(W({ colors: { head: 1 } })).colors !== null) out.push('half a set of colors passed');
    if (X.TP.walkerOf(W({ colors: { head: -1, body: 2, legs: 3, feet: 4 } })).colors !== null) out.push('a negative dye passed');
    if (X.TP.walkerOf(W({})).title !== null || X.TP.walkerOf(W({})).colors !== null) out.push('a walker from an older answer does not read null');

    const plates = [X.TS.plateTextOf(X.TP.walkerOf(W({ title: 'the Wolfer' }))), X.TS.plateTextOf(X.TP.walkerOf(W({ id: B, name: 'Tamsel' })))];
    if (plates[0] !== 'Marlow the Wolfer · 18' || plates[1] !== 'Tamsel · 18') out.push('the plates read ' + JSON.stringify(plates));

    const row = (o) => ({ id: 'aaaaaaaa-0000-4000-8000-0000000000a1', channel: 'global', from_id: A, from_name: 'Marlow', from_slot: 0, from_level: 18, from_weapon: null, from_role: null, body: 'hi', created_at: '2026-11-04T09:00:00Z', ...o });
    const line = X.CL.lineOf(row({ from_title: 'the Wolfer' }), { tz: 'utc' });
    if (!line || line.title !== 'the Wolfer') out.push('a chat line lost its title: ' + JSON.stringify(line));
    if (X.CL.lineOf(row({ from_title: '<img src=x>' }), { tz: 'utc' }).title !== null) out.push('markup reached a chat line\'s title');
    if (X.CL.lineOf(row({}), { tz: 'utc' }).title !== null) out.push('a row with no title does not read null');

    /* REPLACED BY EVERY ANSWER, never merged upward */
    let answer = { ok: true, status: 200, body: { ok: true, walkers: [], gone: [], extras: { works: { stage: 1 } } } };
    let clock = 1000;
    const tp = new X.TP.TownPresence({ server: { rpc: async () => answer }, slot: 0, timers: { setTimer: () => 1, clearTimer: () => {} }, now: () => clock });
    tp.show(THE_MAP);
    await tp.read();
    const first = tp.extras();
    answer = { ok: true, status: 200, body: { ok: true, walkers: [], gone: [] } };
    clock += 5000;
    await tp.read();
    if (!first || first.works.stage !== 1) out.push('the first answer\'s extras were not held: ' + JSON.stringify(first));
    if (tp.extras() !== null) out.push('an answer with no extras kept the last ones');
    tp.destroy();

    if (X.WK.WORKS_TAB.shown !== false || X.WK.worksHtml() !== '') out.push('the Works tab is not hidden');
    if (X.TW.townWorksSwap({}, { works: { stage: 4 } }) !== null) out.push('the map draws Works before its lane lands');
    return out;
  },
};

function plantSql(text, [, find, repl]) {
  if (text.split(find).length !== 2) throw Object.assign(new Error('sql mutant anchor not found once: ' + find.slice(0, 80)), { harness: true });
  return text.replace(find, () => repl);
}

async function loadReaders(root) {
  const u = (p) => pathToFileURL(join(root, p)).href + '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
  return {
    GS: await import(u('src/data/gold-sinks.js')),
    TP: await import(u('src/session/town-presence.js')),
    TS: await import(u('src/world/town-scene.js')),
    CL: await import(u('src/social/chat-lines.js')),
    WK: await import(u('src/shell/windows/havora/works.js')),
    TW: await import(u('src/world/town-works.js')),
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
    console.log(bad ? `town-shows: ${bad} arm(s) red` : `town-shows: all ${Object.keys(ARMS).length} arms green`);
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
        const dir = mkdtempSync(join(tmpdir(), 'hr-ts-'));
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
  console.log(missed ? `town-shows --selftest: ${missed} of ${ids.length} mutant(s) survived` : `town-shows --selftest: all ${ids.length} mutants killed`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
