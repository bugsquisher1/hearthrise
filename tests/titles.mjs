#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/titles.mjs — TITLES: GOLD UNLOCKS ONE ONLY AFTER THE KILLS ARE EARNED (Tyler 2026-11-04; the designer's board section
//   "2026-11-04 Gold sinks"; 2027-02-28-titles.sql; src/data/titles.js).
//
//   node tests/titles.mjs             the guard
//   node tests/titles.mjs --list      the mutation catalogue
//   node tests/titles.mjs --selftest  every planted defect must turn its arm red
//   node tests/titles.mjs --mutate=<id>
//
// mutant-anchors: supabase/migrations/2027-02-28-titles.sql src/session/character-sections.js src/session/title-intents.js src/shell/intent-words.js src/social/inspect.js src/app/world-view.js supabase/migrations/2027-03-05-hero-colors.sql
//
// Every price and kill count is read from the row. The real chain replayed (PGlite), real client roles, the real client modules; production untouched:
//   TT-RULES   hr_titles holds exactly the data file's rows, and every title's words survive the client's filters into a plate and a chat line
//   TT-KILLS   GOLD CAN'T SKIP KILLS: refused one short with the server's own count; kills sum across the row's monsters and nothing else (another
//              monster, another hero, a dated counter); the verb has no way to be told a count
//   TT-QUOTE   a stale or forged price is quote_changed, a junk one bad_quote, a short purse insufficient_gold; refused means not charged and not held
//   TT-ONCE    a replayed key charges once; one claim is exactly one journal row of kind shop; a second claim is title_owned
//   TT-WEAR    can't be worn if not held; wearing a second takes the first off; null takes it off; free; a replayed key moves nothing
//   TT-HERO    held, worn and counted per hero, though the purse is the account's
//   TT-SEAM    hr_title_of answers the catalogue's words: into the chat row, a stranger's read of the square and Inspect; a title dropped from the catalogue reads as none;
//              a hero standing still shows a change of title to others in their next delta, and doesn't move for it
//   TT-ZERO    a title at price 0 goes through the one path: legal in the data, the same verb, the kills still checked, no gold moved, one journal row
//   TT-HUNT    a hunting hero may claim and wear, and the running hunt doesn't move
//   TT-GRANT   the two verbs are the client's and baselined; no helper is; no client role reaches the table; the section is registered
//   TT-EDGE    src/data/titles.js stays out of the hr-accrue bundle
//   TT-AGAIN   a second apply of both files is byte-identical
//   TT-CLIENT  the reader refuses junk; ONE intent with the QUOTE and no count; a stale quote re-reads; the refusals in the design's words; the hero's own town label
// TRUE CONCURRENCY is unverified here (PGlite is one backend); two presses on one hero are ordered by hr_hunt_lock (the migration's header).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = '000000c0-0000-4000-a000-0000901d7c01';
const B = '000000c0-0000-4000-a000-0000901d7c02';
const idem = () => crypto.randomUUID();
const MIG = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
const CATALOGUE = '2027-03-12-boss-call-titles-catalogue.generated.sql';
const FILE = '2027-02-28-titles.sql';
const COLORS = '2027-03-05-hero-colors.sql';   // restates hr_title_wear: a second apply of this file is followed by that one's, as the chain orders them
const BUY = 'public.hr_title_buy(integer,text,bigint,uuid)';
const WEAR = 'public.hr_title_wear(integer,text,uuid)';
const OF = 'public.hr_title_of(uuid,integer)';
const KILLS = 'public.hr_title_kills(uuid,integer,text[])';
const VIEW = 'public.hr_titles_view(uuid,integer)';
const INSPECT = 'public.hr_inspect(text,integer)';
const THE_MAP = 'town_common';

/* ── THE PLANTED DEFECTS ─────────────────────────────────────────────────────
   db: a live body edited inside the arm's transaction (fn, find, replace). ddl: a statement in it. sql: an edit of a migration's TEXT the
   arm re-applies. js: a client module, copied and edited. Each names the arm that must go red. */
export const MUTANTS = {
  gold_skips_kills: { arm: 'TT-KILLS', why: 'the kills are never checked', db: [BUY, '  if v_have < v_t.kills then\n', '  if false then\n'] },
  kills_first_monster: { arm: 'TT-KILLS', why: 'only the first monster counts', db: [KILLS, "unnest(p_monsters) m", "unnest(p_monsters[1:1]) m"] },
  kills_any_monster: { arm: 'TT-KILLS', why: 'every kill the hero has counts', db: [KILLS, "and p.key = any (array(select 'ev:kill_monster:' || m from unnest(p_monsters) m))", "and p.key like 'ev:kill_monster:%'"] },
  kills_any_hero: { arm: 'TT-HERO', why: 'the account\'s kills count', db: [KILLS, "where p.user_id = p_user and p.slot = p_slot and p.kind = 'stat'", "where p.user_id = p_user and p.kind = 'stat'"] },
  kills_any_period: { arm: 'TT-KILLS', why: 'a dated counter counts', db: [KILLS, " and p.period_key = ''\n", "\n"] },
  price_from_client: { arm: 'TT-QUOTE', why: 'the verb charges the client\'s number', db: [BUY, '  if v_t.price <> p_price then\n', '  if false then\n'] },
  no_replay: { arm: 'TT-ONCE', why: 'a replayed key is not looked up, so it reads as a second claim', db: [BUY, '  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;\n', ''] },
  owned_unchecked: { arm: 'TT-ONCE', why: 'a second claim reaches the charge',
    db: [BUY, "  if exists (select 1 from public.player_titles h where h.user_id = v_uid and h.slot = p_slot and h.title_id = p_title) then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'title_owned', 'title', p_title)); end if;\n", ''] },
  wrong_kind: { arm: 'TT-ONCE', why: 'the journal row is not kind shop', db: [BUY, "jsonb_build_object('kind', 'shop', 'intent', v_verb,", "jsonb_build_object('kind', 'wallet', 'intent', v_verb,"] },
  wear_not_news: { arm: 'TT-SEAM', why: 'a hero standing still keeps showing its old title until it next walks', db: [WEAR, '  perform public.hr_town_look_touch(v_uid, p_slot);\n', ''] },
  wear_unowned: { arm: 'TT-WEAR', why: 'a title not held can be worn',
    db: [WEAR, "    if not exists (select 1 from public.player_titles h where h.user_id = v_uid and h.slot = p_slot and h.title_id = p_title) then\n      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'title_not_owned', 'title', p_title)); end if;\n", ''] },
  wear_keeps_first: { arm: 'TT-WEAR', why: 'wearing a second leaves the first on, and the index refuses',
    db: [WEAR, "  update public.player_titles h set worn = false where h.user_id = v_uid and h.slot = p_slot and h.worn and h.title_id is distinct from p_title;\n", ''] },
  takeoff_noop: { arm: 'TT-WEAR', why: 'null does not take it off', db: [WEAR, "and h.worn and h.title_id is distinct from p_title;", "and h.worn and h.title_id is distinct from p_title and p_title is not null;"] },
  title_from_client: { arm: 'TT-SEAM', why: 'the seam reads something other than the catalogue', db: [OF, 'select c.words from public.player_titles h join public.hr_titles c on c.title_id = h.title_id', 'select h.title_id from public.player_titles h join public.hr_titles c on c.title_id = h.title_id'] },
  worn_ignored: { arm: 'TT-SEAM', why: 'the seam answers a held title that isn\'t worn', db: [OF, 'and h.slot = p_slot and h.worn', 'and h.slot = p_slot'] },
  inspect_no_title: { arm: 'TT-SEAM', why: 'Inspect leaves the title out', db: [INSPECT, "    'title', left(public.hr_title_of(v_t, v_slot), 40),\n", ''] },
  zero_refused: { arm: 'TT-ZERO', why: 'a price of 0 is refused', db: [BUY, 'if p_price is null or p_price < 0 or p_price > 1000000000 then', 'if p_price is null or p_price < 1 or p_price > 1000000000 then'] },
  section_lies: { arm: 'TT-KILLS', why: 'the section shows a count the verb doesn\'t use', db: [VIEW, "'have', public.hr_title_kills(p_user, p_slot, t.monsters),", "'have', t.kills,"] },
  verb_open_to_anon: { arm: 'TT-GRANT', why: 'anon can claim', ddl: `grant execute on function public.hr_title_buy(integer, text, bigint, uuid) to anon` },
  helper_open: { arm: 'TT-GRANT', why: 'a client role can call a helper', ddl: `grant execute on function public.hr_title_kills(uuid, integer, text[]) to authenticated` },
  table_open: { arm: 'TT-GRANT', why: 'a client can write what a hero holds', ddl: `grant select, insert on public.player_titles to authenticated` },
  no_baseline: { arm: 'TT-GRANT', why: 'the verb is not on the client baseline', ddl: `delete from public.hr_client_rpc_baseline where proname = 'hr_title_wear'` },
  no_section: { arm: 'TT-RULES', why: 'the section is not registered', ddl: `delete from public.hr_state_sections where key = 'titles'` },
  rules_drift: { arm: 'TT-RULES', why: 'the table no longer says what the data file says', ddl: `update public.hr_titles set price = price + 1 where ord = 0` },
  repin_lost: { arm: 'TT-AGAIN', why: 'a second apply refuses because the pin forgot this file\'s own image', sql: [FILE, /and v_md5 is distinct from '[0-9a-f]{32}' then/, "and v_md5 is distinct from '00000000000000000000000000000000' then"] },
  reader_keeps_junk: { arm: 'TT-CLIENT', why: 'a title that is not plain words reaches the sheet', js: ['src/session/character-sections.js', [["typeof r.words !== 'string' || !TITLE_WORDS.test(r.words) || nat(r.price) === null", 'nat(r.price) === null']]] },
  words_no_numbers: { arm: 'TT-CLIENT', why: 'the refusal loses the server\'s count', js: ['src/shell/intent-words.js', [["' has ' + whole(r.figures.have) + '. Gold can\\'t skip kills.'", "'. Gold can\\'t skip kills.'"]]] },
  buy_own_price: { arm: 'TT-CLIENT', why: 'the press sends a price of its own', js: ['src/session/title-intents.js', [["p_title: title, p_price: price, p_idem: newIdem()", 'p_title: title, p_price: 1, p_idem: newIdem()']]] },
  stale_not_reread: { arm: 'TT-CLIENT', why: 'a stale quote stays on the row', js: ['src/session/title-intents.js', [["if (r.error === 'quote_changed' && cs.status !== 'closed') await cs.load();", '']]] },
  title_lost: { arm: 'TT-CLIENT', why: 'the refusal stops naming its title', js: ['src/session/title-intents.js', [["Object.assign(refusalOf(ans), { title: typeof b.title === 'string' && ID.test(b.title) ? b.title : null })", 'refusalOf(ans)']]] },
  own_label_dropped: { arm: 'TT-CLIENT', why: 'the hero\'s own town label loses the title', js: ['src/app/world-view.js', [["view.playerTitle = worn && typeof worn.words === 'string' && TITLE_WORDS.test(worn.words) ? worn.words : null;", 'view.playerTitle = null;']]] },
  inspect_keeps_junk: { arm: 'TT-CLIENT', why: 'markup reaches Inspect', js: ['src/social/inspect.js', [["title: typeof b.title === 'string' && TITLE_WORDS.test(b.title) ? b.title : null,", 'title: b.title,']]] },
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
const buy = (db, slot, title, price, key, uid = A) => as(db, uid, 'select public.hr_title_buy($1::int, $2, $3::bigint, $4::uuid)', [slot, title, price, key || idem()]);
const wear = (db, slot, title, key, uid = A) => as(db, uid, 'select public.hr_title_wear($1::int, $2, $3::uuid)', [slot, title, key || idem()]);
async function hero(db, uid, slot, name) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'titles guard') on conflict (user_id) do nothing`, [uid]);
  const dye = await one(db, 'select min(idx) from public.hr_outfit_dyes');
  const r = await as(db, uid, 'select public.hr_create_hero($1::int, $2, $3::jsonb, $4::uuid)', [slot, name, JSON.stringify({ head: dye, body: dye, legs: dye, feet: dye }), idem()]);
  if (!r || r.ok !== true) throw Object.assign(new Error(`hr_create_hero(${slot}, ${name}): ` + JSON.stringify(r)), { harness: true });
  await db.query(`insert into public.account_wallet (user_id, gold) values ($1, 100000000) on conflict (user_id) do update set gold = excluded.gold`, [uid]);
}
const purse = (db, uid = A) => one(db, 'select gold from public.account_wallet where user_id = $1', [uid]).then(Number);
const titles = (db) => q(db, 'select title_id, words, price, kills, monsters, ord from public.hr_titles order by ord').then((rows) => rows.map((r) => ({ ...r, price: Number(r.price), kills: Number(r.kills) })));
const kills = (db, slot, monster, n, uid = A, period = '') => db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at) values ($1, $2, 'stat', $3, $4, $5, now())
  on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value`, [uid, slot, 'ev:kill_monster:' + monster, period, n]);
const earn = (db, slot, t, uid = A) => kills(db, slot, t.monsters[0], t.kills, uid);
const held = (db, slot, uid = A) => q(db, 'select title_id, worn from public.player_titles where user_id = $1 and slot = $2 order by title_id', [uid, slot]);
const journal = (db, slot) => q(db, `select kind, intent, gold from public.player_ledger where user_id = $1 and slot = $2 and intent like 'title\\_buy:%' order by id`, [A, slot]);
const section = (db, slot) => one(db, 'select public.hr_state_of($1::uuid, $2::int)', [A, slot]).then((e) => e.titles);

const ARMS = {
  'TT-RULES': async (db, X) => {
    const out = [];
    const rows = await titles(db);
    const want = Object.keys(X.T.TITLES);
    if (rows.map((r) => r.title_id).join() !== want.join()) out.push(`the table holds ${rows.map((r) => r.title_id)}, the data file ${want}`);
    for (const r of rows) {
      const d = X.T.TITLES[r.title_id];
      if (!d) continue;
      if (r.words !== d.words || r.price !== d.price || r.kills !== d.kills || r.monsters.join() !== d.monsters.join()) out.push(`${r.title_id} differs from the data file: ` + JSON.stringify(r));
      /* the words survive the seam's own filters */
      const plate = X.TS.plateTextOf(X.TP.walkerOf({ id: A, slot: 0, name: 'Marlow', x: 1, y: 1, gx: 1, gy: 1, dir: 's', level: 18, title: d.words }));
      if (plate !== `Marlow ${d.words} · 18`) out.push(`${r.title_id}'s plate reads ${plate}`);
      const line = X.CL.lineOf({ id: 'aaaaaaaa-0000-4000-8000-0000000000a1', channel: 'global', from_id: A, from_name: 'Marlow', from_slot: 0, from_level: 18, from_weapon: null, from_role: null, from_title: d.words, body: 'hi', created_at: '2026-11-04T09:00:00Z' }, { tz: 'utc' });
      if (!line || line.title !== d.words) out.push(`${r.title_id}'s chat line lost its title`);
      if (d.words.length > 40) out.push(`${r.title_id}'s words are over 40 letters`);
    }
    await hero(db, A, 0, 'Marlow');
    const s = await section(db, 0);
    if (!s || !Array.isArray(s.rows) || s.rows.length !== rows.length) return out.concat('the envelope\'s titles section reads ' + JSON.stringify(s));
    if (s.rows.map((r) => r.id).join() !== want.join()) out.push('the section is not in the catalogue\'s order');
    const r0 = s.rows[0];
    if (r0.price !== rows[0].price || r0.kills !== rows[0].kills || r0.have !== 0 || r0.held !== false || r0.worn !== false || r0.words !== rows[0].words) out.push('a fresh row reads ' + JSON.stringify(r0));
    if (s.worn !== null) out.push('a fresh hero wears ' + s.worn);
    return out;
  },

  'TT-KILLS': async (db) => {
    const out = [];
    const rows = await titles(db);
    const t = rows.find((r) => r.monsters.length >= 2 && r.price > 0);
    await hero(db, A, 0, 'Marlow');
    const was = await purse(db);
    /* THE VERB HAS NO COUNT TO BE TOLD */
    const args = await one(db, `select pg_get_function_identity_arguments($1::regprocedure)`, [BUY]);
    if (args !== 'p_slot integer, p_title text, p_price bigint, p_idem uuid') out.push('the verb takes ' + args);
    /* no kills */
    let r = await buy(db, 0, t.title_id, t.price);
    if (!r || r.error !== 'title_kills' || Number(r.have) !== 0 || Number(r.need) !== t.kills || r.title !== t.title_id) out.push('no kills answered ' + JSON.stringify(r));
    /* one short, split across the row's monsters: the sum counts */
    const each = Math.floor((t.kills - 1) / t.monsters.length);
    for (let i = 0; i < t.monsters.length; i++) await kills(db, 0, t.monsters[i], i === 0 ? t.kills - 1 - each * (t.monsters.length - 1) : each);
    r = await buy(db, 0, t.title_id, t.price);
    if (!r || r.error !== 'title_kills' || Number(r.have) !== t.kills - 1) out.push('one short answered ' + JSON.stringify(r));
    const row = (await section(db, 0)).rows.find((x) => x.id === t.title_id);
    if (row.have !== t.kills - 1) out.push('the section counts ' + row.have);
    /* a monster this title doesn't count, and a dated counter of one it does, change nothing */
    const other = 'goblin';
    if (t.monsters.includes(other)) throw Object.assign(new Error('the probe monster is on the title'), { harness: true });
    await kills(db, 0, other, t.kills);
    await kills(db, 0, t.monsters[0], t.kills, A, '2026-11-04');
    r = await buy(db, 0, t.title_id, t.price);
    if (!r || r.error !== 'title_kills' || Number(r.have) !== t.kills - 1) out.push('other kills changed the count: ' + JSON.stringify(r));
    if (await purse(db) !== was || (await held(db, 0)).length) out.push('a refused claim moved something');
    /* the last kill, and it lands */
    await kills(db, 0, t.monsters[t.monsters.length - 1], each + 1);
    r = await buy(db, 0, t.title_id, t.price);
    if (!r || r.ok !== true) out.push('the earned claim answered ' + JSON.stringify(r));
    return out;
  },

  'TT-QUOTE': async (db) => {
    const out = [];
    const [t] = (await titles(db)).filter((r) => r.price > 1);
    await hero(db, A, 0, 'Marlow');
    await earn(db, 0, t);
    const was = await purse(db);
    for (const forged of [t.price + 1, t.price - 1, 0, 1]) {
      const r = await buy(db, 0, t.title_id, forged);
      if (!r || r.error !== 'quote_changed') out.push(`a price of ${forged} answered ` + JSON.stringify(r));
    }
    for (const junk of [-1, 1000000001]) {
      const r = await buy(db, 0, t.title_id, junk);
      if (!r || r.error !== 'bad_quote') out.push(`a price of ${junk} answered ` + JSON.stringify(r));
    }
    /* THE ROW MOVED UNDER THE PLAYER: what was on screen is stale, and the answer carries the new price */
    await db.query('update public.hr_titles set price = price + 500 where title_id = $1', [t.title_id]);
    const stale = await buy(db, 0, t.title_id, t.price);
    const fresh = stale && stale.titles && stale.titles.rows.find((x) => x.id === t.title_id);
    if (!stale || stale.error !== 'quote_changed' || !fresh || fresh.price !== t.price + 500) out.push('a stale price answered ' + JSON.stringify(stale));
    await db.query('update public.hr_titles set price = $2 where title_id = $1', [t.title_id, t.price]);
    /* unknown titles */
    for (const id of ['zz_nothing', 'Bad Id', null]) {
      const r = await buy(db, 0, id, t.price);
      if (!r || r.error !== 'unknown_title') out.push(`the title ${id} answered ` + JSON.stringify(r));
    }
    if (await purse(db) !== was) out.push('a refused price moved gold');
    if ((await journal(db, 0)).length) out.push('a refused price wrote a journal row');
    if ((await held(db, 0)).length) out.push('a refused price gave a title');
    /* A SHORT PURSE: hr_apply's words, no title */
    await db.query('update public.account_wallet set gold = $2 where user_id = $1', [A, t.price - 1]);
    const short = await buy(db, 0, t.title_id, t.price);
    if (!short || short.error !== 'insufficient_gold') out.push('a short purse answered ' + JSON.stringify(short));
    if (await purse(db) !== t.price - 1 || (await held(db, 0)).length) out.push('a short purse moved something');
    return out;
  },

  'TT-ONCE': async (db) => {
    const out = [];
    const [t] = (await titles(db)).filter((r) => r.price > 0);
    await hero(db, A, 0, 'Marlow');
    await earn(db, 0, t);
    const was = await purse(db);
    const key = idem();
    const first = await buy(db, 0, t.title_id, t.price, key);
    if (!first || first.ok !== true) return ['the claim answered ' + JSON.stringify(first)];
    const replay = await buy(db, 0, t.title_id, t.price, key);
    if (!replay || replay.ok !== true) out.push('the replay answered ' + JSON.stringify(replay));
    if (await purse(db) !== was - t.price) out.push(`the purse moved ${was - await purse(db)}, not ${t.price}`);
    const rows = await journal(db, 0);
    if (rows.length !== 1) out.push(`${rows.length} journal rows for one claim`);
    else if (rows[0].kind !== 'shop' || rows[0].intent !== `title_buy:${t.title_id}:${t.price}` || Number(rows[0].gold) !== -t.price) out.push('the journal row reads ' + JSON.stringify(rows[0]));
    const second = await buy(db, 0, t.title_id, t.price);
    if (!second || second.error !== 'title_owned' || second.title !== t.title_id) out.push('a second claim answered ' + JSON.stringify(second));
    if (await purse(db) !== was - t.price || (await journal(db, 0)).length !== 1) out.push('a second claim charged');
    if ((await held(db, 0)).length !== 1) out.push('a hero holds ' + JSON.stringify(await held(db, 0)));
    /* the section says so; a claim doesn't put it on */
    const row = (await section(db, 0)).rows.find((x) => x.id === t.title_id);
    if (!row.held || row.worn) out.push('after the claim the row reads ' + JSON.stringify(row));
    return out;
  },

  'TT-WEAR': async (db) => {
    const out = [];
    const rows = await titles(db);
    const [t1, t2] = rows;
    await hero(db, A, 0, 'Marlow');
    await earn(db, 0, t1);
    await earn(db, 0, t2);
    let r = await wear(db, 0, t1.title_id);
    if (!r || r.error !== 'title_not_owned' || r.title !== t1.title_id) out.push('wearing one not held answered ' + JSON.stringify(r));
    if ((await one(db, `select public.hr_title_of($1::uuid, 0)`, [A])) !== null) out.push('a refused wear put it on');
    r = await wear(db, 0, 'zz_nothing');
    if (!r || r.error !== 'unknown_title') out.push('wearing an unknown title answered ' + JSON.stringify(r));
    await buy(db, 0, t1.title_id, t1.price);
    await buy(db, 0, t2.title_id, t2.price);
    const was = await purse(db);
    r = await wear(db, 0, t1.title_id);
    if (!r || r.ok !== true || r.worn !== t1.title_id) out.push('wearing answered ' + JSON.stringify(r));
    if ((await one(db, `select public.hr_title_of($1::uuid, 0)`, [A])) !== t1.words) out.push('the first title reads wrong');
    r = await wear(db, 0, t2.title_id);
    if (!r || r.ok !== true) out.push('the swap answered ' + JSON.stringify(r));
    const worn = (await held(db, 0)).filter((x) => x.worn).map((x) => x.title_id);
    if (worn.join() !== t2.title_id) out.push('after the swap the hero wears ' + worn);
    if ((await section(db, 0)).worn !== t2.title_id) out.push('the section\'s worn reads ' + (await section(db, 0)).worn);
    /* the same again changes nothing, and a replayed key moves nothing */
    const key = idem();
    r = await wear(db, 0, t2.title_id, key);
    if (!r || r.ok !== true) out.push('wearing the worn one answered ' + JSON.stringify(r));
    const replay = await wear(db, 0, t2.title_id, key);
    if (!replay || replay.ok !== true) out.push('the replay answered ' + JSON.stringify(replay));
    r = await wear(db, 0, null);
    if (!r || r.ok !== true || r.worn !== null) out.push('taking it off answered ' + JSON.stringify(r));
    if ((await one(db, `select public.hr_title_of($1::uuid, 0)`, [A])) !== null) out.push('taking it off left it on');
    if ((await held(db, 0)).length !== 2) out.push('taking it off lost a title');
    if (await purse(db) !== was) out.push('wearing cost gold');
    return out;
  },

  'TT-HERO': async (db) => {
    const out = [];
    const [t] = (await titles(db)).filter((r) => r.price > 0);
    await hero(db, A, 0, 'Marlow');
    await hero(db, A, 1, 'Tamsel');
    await earn(db, 0, t);
    const was = await purse(db);
    /* the second hero's own count is its own */
    let r = await buy(db, 1, t.title_id, t.price);
    if (!r || r.error !== 'title_kills' || Number(r.have) !== 0) out.push('the other hero\'s claim answered ' + JSON.stringify(r));
    r = await buy(db, 0, t.title_id, t.price);
    if (!r || r.ok !== true) return out.concat('the first hero\'s claim answered ' + JSON.stringify(r));
    await wear(db, 0, t.title_id);
    r = await wear(db, 1, t.title_id);
    if (!r || r.error !== 'title_not_owned') out.push('the other hero wearing it answered ' + JSON.stringify(r));
    if ((await one(db, `select public.hr_title_of($1::uuid, 1)`, [A])) !== null) out.push('the other hero wears it');
    const row = (await section(db, 1)).rows.find((x) => x.id === t.title_id);
    if (row.held || row.worn || row.have !== 0) out.push('the other hero\'s row reads ' + JSON.stringify(row));
    /* the purse is the account's: the second hero pays from it, and may hold its own once it earned it */
    await earn(db, 1, t);
    r = await buy(db, 1, t.title_id, t.price);
    if (!r || r.ok !== true) out.push('the other hero\'s earned claim answered ' + JSON.stringify(r));
    if (await purse(db) !== was - 2 * t.price) out.push('two claims moved the purse by ' + (was - await purse(db)));
    return out;
  },

  'TT-SEAM': async (db) => {
    const out = [];
    const [t] = (await titles(db)).filter((r) => r.price > 0);
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel');
    await earn(db, 0, t);
    await buy(db, 0, t.title_id, t.price);
    /* held, not worn: nothing shows */
    if ((await one(db, `select public.hr_title_of($1::uuid, 0)`, [A])) !== null) out.push('a title held and not worn shows');
    await wear(db, 0, t.title_id);
    /* THE CATALOGUE'S WORDS, in every place the seam reaches */
    if ((await one(db, `select public.hr_title_of($1::uuid, 0)`, [A])) !== t.words) out.push('the seam reads ' + await one(db, `select public.hr_title_of($1::uuid, 0)`, [A]));
    const sent = await as(db, A, 'select public.hr_chat_send(0, $1, $2)', ['global', 'look at me']);
    if (!sent || sent.ok !== true || sent.line.from_title !== t.words) out.push('the chat row reads ' + JSON.stringify(sent));
    const forged = await q(db, `insert into public.chat_messages (channel, from_id, from_slot, from_name, from_title, body) values ('global', $1, 0, 'x', 'the Forged', 'zz') returning from_title`, [A]);
    if (forged[0].from_title !== t.words) out.push('a forged title beat the worn one: ' + forged[0].from_title);
    const insp = await as(db, B, 'select public.hr_inspect($1, 0)', [A]);
    if (!insp || insp.ok !== true || insp.title !== t.words) out.push('Inspect reads ' + JSON.stringify(insp));
    const self = await as(db, B, 'select public.hr_inspect($1, 0)', [B]);
    if (!self || self.title !== null) out.push('Inspect on a hero wearing none reads ' + JSON.stringify(self));
    /* a stranger's read of the square */
    await db.query("update public.hr_flags set enabled = true where key = 'town_presence'");
    await as(db, A, 'select public.hr_town_here(0, $1)', [THE_MAP]);
    await db.query('update public.town_bodies set look = null, look_at = null where user_id = $1', [A]);
    const read = await as(db, B, 'select public.hr_town_view(0, $1, null, null, null, null, null)', [THE_MAP]);
    const w = read && (read.walkers || []).find((x) => x.id === A);
    if (!w || w.title !== t.words) out.push('a stranger reads the walker ' + JSON.stringify(w));
    /* A TITLE IS NEWS: the viewer stays where it stood, the hero stands still, and its next delta still says what the server holds */
    if (w) {
      const viewAt = (cursor) => as(db, B, 'select public.hr_town_view(0, $1, $2::int, $3::int, $4::bigint, $2::int, $3::int)', [THE_MAP, w.x, w.y, cursor]);
      const whole = await viewAt(null);
      await db.query(`update public.town_bodies set changed_at = now() - interval '1 minute', since = now() - interval '1 minute' where user_id = $1`, [A]);
      const quiet = await viewAt(whole.cursor);
      if ((quiet.walkers || []).some((x) => x.id === A)) out.push('CONTROL: a still hero was in the delta');
      else {
        const off = await wear(db, 0, null);
        if (!off || off.ok !== true) out.push('taking it off answered ' + JSON.stringify(off));
        const bare = ((await viewAt(whole.cursor)).walkers || []).find((x) => x.id === A);
        if (!bare || bare.title !== null) out.push('after taking it off the next delta reads ' + JSON.stringify(bare && bare.title));
        await db.query(`update public.town_bodies set changed_at = now() - interval '1 minute' where user_id = $1`, [A]);
        const on = await wear(db, 0, t.title_id);
        if (!on || on.ok !== true) out.push('wearing it again answered ' + JSON.stringify(on));
        const dressed = ((await viewAt(whole.cursor)).walkers || []).find((x) => x.id === A);
        if (!dressed || dressed.title !== t.words) out.push('after wearing it the next delta reads ' + JSON.stringify(dressed && dressed.title));
        else if (dressed.x !== w.x || dressed.y !== w.y) out.push('wearing a title moved the hero');
      }
    }
    /* a title dropped from the catalogue reads as none: no orphan words, no crash */
    await db.query('delete from public.hr_titles where title_id = $1', [t.title_id]);
    if ((await one(db, `select public.hr_title_of($1::uuid, 0)`, [A])) !== null) out.push('a dropped title still shows');
    return out;
  },

  'TT-ZERO': async (db, X) => {
    const out = [];
    const [t] = await titles(db);
    if (X.GEN.problemsOf({ ...X.T.TITLES, zz_prize: { ...X.T.TITLES[t.title_id], name: 'Drain Thief', words: 'the Drain Thief', price: 0 } }).length) out.push('the generator refuses a price of 0');
    await db.query(`insert into public.hr_titles (title_id, words, price, kills, monsters, ord) values ('zz_prize', 'the Drain Thief', 0, 1, array[$1], 9999)`, [t.monsters[0]]);
    await hero(db, A, 0, 'Marlow');
    const was = await purse(db);
    /* the kills still count at price 0 */
    let r = await buy(db, 0, 'zz_prize', 0);
    if (!r || r.error !== 'title_kills') out.push('a price-0 title with no kills answered ' + JSON.stringify(r));
    await kills(db, 0, t.monsters[0], 1);
    r = await buy(db, 0, 'zz_prize', 1);
    if (!r || r.error !== 'quote_changed') out.push('a price of 1 on a free title answered ' + JSON.stringify(r));
    const key = idem();
    r = await buy(db, 0, 'zz_prize', 0, key);
    if (!r || r.ok !== true) return out.concat('the free claim answered ' + JSON.stringify(r));
    const replay = await buy(db, 0, 'zz_prize', 0, key);
    if (!replay || replay.ok !== true) out.push('its replay answered ' + JSON.stringify(replay));
    if (await purse(db) !== was) out.push('a free title moved gold');
    if ((await journal(db, 0)).length !== 1) out.push(`${(await journal(db, 0)).length} journal rows for a free claim`);
    if (!(await held(db, 0)).some((x) => x.title_id === 'zz_prize')) out.push('the free claim gave nothing');
    r = await wear(db, 0, 'zz_prize');
    if (!r || r.ok !== true || (await one(db, `select public.hr_title_of($1::uuid, 0)`, [A])) !== 'the Drain Thief') out.push('wearing the free title answered ' + JSON.stringify(r));
    return out;
  },

  'TT-HUNT': async (db) => {
    const out = [];
    const [t] = (await titles(db)).filter((r) => r.price > 0);
    await hero(db, A, 0, 'Marlow');
    await earn(db, 0, t);
    await db.query('update public.hr_hunt_config set enabled = true where id');
    const GEN = await import(pathToFileURL(join(ROOT, 'tools/gen-hunt-sessions.mjs')).href);
    const room = { id: 'tt_cellar', hunt: 'mill_cellar', map: 'tt_cellar', start: [[1, 1]], pockets: [{ room: [3, 1, 6, 3], spawns: [{ monster: 'rat', x: 4, y: 2 }] }], route: [0], respawnMs: 60000, pullDist: 1.5 };
    const { rows, spawns } = GEN.groundRows({ tt_cellar: room });
    for (const g of rows) await db.query(`insert into public.hr_hunt_grounds (hunt_id, ground_id, pockets, spawns, respawn_ms, seats, density_max) values ($1,$2,$3,$4,$5,$6,$7::int[])
      on conflict (hunt_id) do update set ground_id = excluded.ground_id, pockets = excluded.pockets, spawns = excluded.spawns, respawn_ms = excluded.respawn_ms, seats = excluded.seats, density_max = excluded.density_max`,
      [g.hunt, g.ground, g.pockets, g.spawns, g.respawn, g.seats, g.dmax]);
    await db.query('delete from public.hr_hunt_ground_spawns where hunt_id = $1', ['mill_cellar']);
    for (const x of spawns) await db.query('insert into public.hr_hunt_ground_spawns (hunt_id, monster_id, n) values ($1,$2,$3) on conflict do nothing', [x.hunt, x.monster, x.n]);
    await db.query(`update public.player_state set stamina_ms = 28800000, stamina_at = now() where user_id = $1 and slot = 0`, [A]);
    const entered = await as(db, A, `select public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, $1::uuid)`, [idem()]);
    if (!entered || entered.ok !== true) return ['the hunt would not open: ' + JSON.stringify(entered)];
    const session = (await q(db, 'select id, preset, settled_to, leave_at, ended_at from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is null', [A]))[0];
    const was = await purse(db);
    const r = await buy(db, 0, t.title_id, t.price);
    if (!r || r.ok !== true) return ['a hunting hero\'s claim answered ' + JSON.stringify(r)];
    if (await purse(db) !== was - t.price) out.push('the hunting claim moved the purse by ' + (was - await purse(db)));
    const w = await wear(db, 0, t.title_id);
    if (!w || w.ok !== true) out.push('a hunting hero\'s wear answered ' + JSON.stringify(w));
    const after = (await q(db, 'select id, preset, settled_to, leave_at, ended_at from public.hunt_sessions where id = $1', [session.id]))[0];
    if (JSON.stringify(after) !== JSON.stringify(session)) out.push('the running hunt moved: ' + JSON.stringify(after));
    return out;
  },

  'TT-GRANT': async (db) => {
    const out = [];
    for (const fn of [OF, KILLS, VIEW]) {
      for (const role of ['anon', 'authenticated']) if (await one(db, 'select has_function_privilege($1, $2, $3)', [role, fn, 'execute'])) out.push(`${role} reaches ${fn}`);
    }
    for (const fn of [BUY, WEAR]) {
      if (await one(db, 'select has_function_privilege($1, $2, $3)', ['anon', fn, 'execute'])) out.push(`anon reaches ${fn}`);
      if (!(await one(db, 'select has_function_privilege($1, $2, $3)', ['authenticated', fn, 'execute']))) out.push(`a player cannot reach ${fn}`);
    }
    for (const tb of ['public.player_titles', 'public.hr_titles']) for (const role of ['anon', 'authenticated']) {
      if (await one(db, `select has_table_privilege($1, $2, 'select') or has_table_privilege($1, $2, 'insert,update,delete')`, [role, tb])) out.push(`${role} reaches ${tb}`);
    }
    for (const n of ['hr_title_buy', 'hr_title_wear']) {
      if (!(await one(db, `select count(*)::int from public.hr_client_rpc_baseline where proname = $1 and grantee = 'authenticated'`, [n]))) out.push(`${n} is not on the baseline`);
    }
    try { await db.exec('select public.hr_assert_grant_hygiene(true)'); } catch (e) { out.push('grant hygiene: ' + String(e.message).slice(0, 160)); }
    return out;
  },

  'TT-EDGE': async (db, X) => {
    const out = [];
    const { pack } = await import(pathToFileURL(join(ROOT, 'tools/pack-edge.mjs')).href);
    const { files, problems } = await pack('hr-accrue');
    if (problems && problems.length) out.push('pack-edge says: ' + problems.join('; ').slice(0, 200));
    const names = [...(files instanceof Map ? files.keys() : (files || []).map((f) => f.name || f.path || String(f)))];
    if (names.length < 20) out.push(`the bundle reads as ${names.length} files: the search broke, not the rule`);
    for (const n of names) if (/titles\.js$|gold-sinks\.js$|setup-words\.js$|title-intents\.js$/.test(n)) out.push(`${n} entered the edge bundle`);
    return out;
  },

  'TT-AGAIN': async (db, X, mutant) => {
    const out = [];
    const text = mutant && mutant.sql ? plantSql(MIG(FILE), mutant.sql) : MIG(FILE);
    const inventory = async () => (await q(db, `select p.oid::regprocedure::text fn, md5(pg_get_functiondef(p.oid)) m from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname in ('hr_title_kills', 'hr_titles_view', 'hr_title_of', 'hr_title_buy', 'hr_title_wear', 'hr_inspect') order by 1`)).map((r) => r.fn + ':' + r.m).join('\n');
    await hero(db, A, 0, 'Marlow');
    const [t] = await titles(db);
    await earn(db, 0, t);
    await buy(db, 0, t.title_id, t.price);
    await wear(db, 0, t.title_id);
    const was = await inventory();
    const rows = JSON.stringify(await q(db, 'select * from public.hr_titles order by title_id'));
    await db.exec('savepoint again');
    try {
      await db.exec(MIG(CATALOGUE));
      await db.exec(text);
      await db.exec(MIG(COLORS));
    } catch (e) {
      out.push('the second apply refused: ' + String(e.message).split('\n')[0].slice(0, 180));
      await db.exec('rollback to savepoint again');
      return out;
    }
    if ((await inventory()) !== was) out.push('a second apply moved a body');
    if (JSON.stringify(await q(db, 'select * from public.hr_titles order by title_id')) !== rows) out.push('a second apply moved a catalogue row');
    if ((await one(db, `select public.hr_title_of($1::uuid, 0)`, [A])) !== t.words) out.push('a second apply took a worn title off');
    return out;
  },

  'TT-CLIENT': async (db, X) => {
    const out = [];
    const T = X.T.TITLES;
    const id = Object.keys(T)[1];
    const d = T[id];
    /* THE READER */
    const row = (o) => ({ id, words: d.words, price: d.price, kills: d.kills, have: 12, held: false, worn: false, ...o });
    const cs = (rows, name) => ({ read: (k) => (k === 'titles' ? { worn: null, rows } : k === 'name' ? name : undefined) });
    const read = X.CS.titlesOf(cs([row(), row({ id: 'junk', words: '<b>x</b>' }), row({ id: 'junk2', price: 'free' }), row({ id: 'junk3', have: -1 }), 7]));
    if (!read || read.rows.length !== 1 || read.rows[0].have !== 12 || read.rows[0].price !== d.price) out.push('the reader reads ' + JSON.stringify(read));
    if (X.CS.titlesOf({ read: () => undefined }) !== null) out.push('no section does not read null');
    if (X.CS.wornTitleOf(cs([row({ worn: true })])) !== d.words || X.CS.wornTitleOf(cs([row()])) !== null) out.push('wornTitleOf is wrong');
    /* THE REFUSALS, in the design's words with the server's numbers */
    const wc = (n) => n.toLocaleString('en-US');
    const short = X.REF.refusalOf({ ok: true, body: { ok: false, error: 'title_kills', title: id, need: d.kills, have: 3214 } });
    const c = cs([], 'Marlow');
    short.title = id;
    const said = X.IW.refusalText(short, c);
    if (said !== `${d.name} takes ${wc(d.kills)} ${d.noun}. Marlow has 3,214. Gold can't skip kills.`) out.push('title_kills says ' + JSON.stringify(said));
    if (X.IW.refusalText({ ok: false, error: 'title_owned', title: id }, c) !== 'Marlow already has that title.') out.push('title_owned says ' + X.IW.refusalText({ ok: false, error: 'title_owned', title: id }, c));
    for (const code of ['title_kills', 'title_owned', 'title_not_owned', 'unknown_title']) if (X.IW.refusalWords(code) === X.RW.REFUSAL_FALLBACK) out.push(code + ' has no plain line');
    /* ONE INTENT, THE QUOTE, NO COUNT; a stale quote re-reads; the refusal keeps its title */
    const calls = [];
    let loads = 0;
    const answers = [{ ok: true, body: { ok: true } }, { ok: true, body: { ok: false, error: 'quote_changed' } }, { ok: true, body: { ok: false, error: 'title_kills', title: id, need: 5, have: 1 } }, { ok: true, body: { ok: true } }];
    const account = { server: { rpc: async (name, body) => { calls.push({ name, body }); return answers.shift(); } } };
    const session = { slot: 1, status: 'open', load: async () => { loads++; return true; } };
    const a1 = await X.TI.buyTitle(account, session, id, d.price);
    if (!a1.ok || calls[0].name !== 'hr_title_buy' || calls[0].body.p_slot !== 1 || calls[0].body.p_title !== id || calls[0].body.p_price !== d.price || !calls[0].body.p_idem) out.push('the press sent ' + JSON.stringify(calls[0]));
    if (Object.keys(calls[0].body).sort().join() !== 'p_idem,p_price,p_slot,p_title') out.push('the press sends more than it should: ' + Object.keys(calls[0].body));
    if (loads !== 1) out.push('an accepted claim re-read ' + loads + ' times');
    const a2 = await X.TI.buyTitle(account, session, id, d.price);
    if (a2.ok || a2.error !== 'quote_changed' || loads !== 2) out.push('a stale quote: ' + JSON.stringify(a2) + ', re-reads ' + loads);
    const a3 = await X.TI.buyTitle(account, session, id, d.price);
    if (a3.title !== id || !a3.figures || a3.figures.need !== 5 || a3.figures.have !== 1) out.push('a refusal lost its title or numbers: ' + JSON.stringify(a3));
    if (loads !== 2) out.push('a kills refusal re-read');
    const a4 = await X.TI.wearTitle(account, session, null);
    if (!a4.ok || calls[3].name !== 'hr_title_wear' || calls[3].body.p_title !== null) out.push('Take off sent ' + JSON.stringify(calls[3]));
    const bad = await X.TI.buyTitle(account, session, 'Bad Id', 1);
    if (bad.ok || calls.length !== 4) out.push('a bad id went out');
    /* INSPECT and THE HERO'S OWN LABEL */
    const seen = await X.IN.inspectOf({ rpc: async () => ({ ok: true, body: { ok: true, id: A, name: 'Marlow', slot: 0, level: 18, gear: [], title: d.words } }) }, A, 0);
    if (!seen.ok || seen.view.title !== d.words) out.push('Inspect\'s view reads ' + JSON.stringify(seen));
    const junk = await X.IN.inspectOf({ rpc: async () => ({ ok: true, body: { ok: true, id: A, name: 'Marlow', slot: 0, level: 18, gear: [], title: '<img src=x>' } }) }, A, 0);
    if (!junk.ok || junk.view.title !== null) out.push('markup reached Inspect: ' + JSON.stringify(junk));
    const view = X.WV.worldViewOf({ data: { name: 'Marlow', state: {}, titles: { worn: id, rows: [{ id, words: d.words, worn: true }] } } }, {});
    if (view.playerName !== 'Marlow' || view.playerTitle !== d.words) out.push('the hero\'s own label reads ' + view.playerName + ' / ' + view.playerTitle);
    const bare = X.WV.worldViewOf({ data: { name: 'Marlow', state: {} } }, {});
    if (bare.playerTitle !== null) out.push('no section reads ' + bare.playerTitle);
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
    T: await import(u('src/data/titles.js')),
    GEN: await import(pathToFileURL(join(ROOT, 'tools/gen-title-catalogue.mjs')).href),
    TP: await import(u('src/session/town-presence.js')),
    TS: await import(u('src/world/town-scene.js')),
    CL: await import(u('src/social/chat-lines.js')),
    CS: await import(u('src/session/character-sections.js')),
    TI: await import(u('src/session/title-intents.js')),
    IW: await import(u('src/shell/intent-words.js')),
    RW: await import(u('src/data/refusal-words.js')),
    REF: await import(u('src/session/refusal.js')),
    IN: await import(u('src/social/inspect.js')),
    WV: await import(u('src/app/world-view.js')),
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
    console.log(bad ? `titles: ${bad} arm(s) red` : `titles: all ${Object.keys(ARMS).length} arms green`);
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
        const dir = mkdtempSync(join(tmpdir(), 'hr-tt-'));
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
  console.log(missed ? `titles --selftest: ${missed} of ${ids.length} mutant(s) survived` : `titles --selftest: all ${ids.length} mutants killed`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
