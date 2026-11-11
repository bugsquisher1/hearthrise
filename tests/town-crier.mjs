#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/town-crier.mjs — THE TOWN CRIER: A PAID LINE THAT PAYS ONLY AFTER EVERY GATE (Tyler 2026-11-04; 2027-02-27-town-crier.sql; the designer's board section).
//
//   node tests/town-crier.mjs             the guard
//   node tests/town-crier.mjs --list      the mutation catalogue
//   node tests/town-crier.mjs --selftest  every planted defect must turn its arm red
//   node tests/town-crier.mjs --mutate=<id>
//
// mutant-anchors: supabase/migrations/2027-02-27-town-crier.sql supabase/migrations/2027-03-16-crier-muted.sql src/data/refusal-words.js src/session/town-intents.js
//
// The real chain replayed (PGlite), the real client modules; production untouched:
//   TC-LINE    a clean line pays once, one ledger row (kind shop, crier:line:<price>), reaches Global with crier = true, counts on Gold Given, climbs per account; a replay charges once
//   TC-WORDS   a word the mask would change and a web address, in every shape, are refused before the charge; so is a second item link; plain words with dots pass
//   TC-GATES   Level 10; 120 letters; 5 a day per account across heroes; a stale or forged price gets quote_changed; a short purse pays nothing
//   TC-GAP     one line per 30 s server-wide, refused before the charge; a line that loses the race rolls back whole
//   TC-OFF     the town_crier flag off stops it, charging nothing
//   TC-MUTE    a muted account is refused before the rule, the words and the charge, with the mute's end; the quote says it first; lifted, the line pays
//   TC-FORGE   no client role can insert or update a chat row, so crier = true has no other path; the helpers are the owner's; only the verb is the client's
//   TC-WORDS-C every refusal says why in the designer's sentence, with the server's numbers
//   TC-CLIENT  a line carries its flag; the button reads the server's price; a player's plain line never reads as the Crier's
// TRUE CONCURRENCY is tests/town-shows-race.mjs's (PGlite is one backend).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ownHeroSlots } from './_slots.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = '000000c0-0000-4000-a000-0000901d8a01';
const B = '000000c0-0000-4000-a000-0000901d8a02';
const idem = () => crypto.randomUUID();
const SEND = 'public.hr_crier_send(integer,text,bigint,uuid)';
const QUOTE = 'public.hr_town_crier_quote(uuid)';

export const MUTANTS = {
  no_mask_check: { arm: 'TC-WORDS', why: 'a masked word is paid for and shouted in stars', db: [SEND, '  if public.hr_chat_mask(v_body) is distinct from v_body then\n', '  if false then\n'] },
  no_link_check: { arm: 'TC-WORDS', why: 'a web address is shouted', db: [SEND, '  if public.hr_crier_has_link(v_body) then\n', '  if false then\n'] },
  second_link: { arm: 'TC-WORDS', why: 'two item links pass', db: [SEND, "'g')) > 1 then\n", "'g')) > 3 then\n"] },
  link_rule_narrow: { arm: 'TC-WORDS', why: 'a bare domain slips past the rule', db: ['public.hr_crier_has_link(text)', '|[a-z0-9-][.](com|net|org|gg|io|tv|co|me|ly|app|xyz|info|ru|de|uk|us|ca|shop|link|site|online|club|fun|live|stream)([^a-z0-9]|$)', ''] },
  no_level_gate: { arm: 'TC-GATES', why: 'a throwaway hero shouts', db: [SEND, '  if v_lv < v_rule.min_level then\n', '  if false then\n'] },
  no_length_gate: { arm: 'TC-GATES', why: 'a line past 120 letters is paid for', db: [SEND, '  if length(v_body) > v_rule.max_letters then\n', '  if false then\n'] },
  no_day_limit: { arm: 'TC-GATES', why: 'the day\'s cap is never read', db: [SEND, '  if v_price is null then\n', '  if false then\n'] },
  count_per_hero: { arm: 'TC-GATES', why: 'each hero climbs its own ladder', db: ['public.hr_sink_bought_today(uuid,text,text[])', 'l.slot = any (array[0, 1, 2, 3, 4, 5])', 'l.slot = 0'] },
  trusts_client_price: { arm: 'TC-GATES', why: 'a forged price is charged', db: [SEND, '  if v_price <> p_price then\n', '  v_price := p_price;\n  if false then\n'] },
  no_gap_read: { arm: 'TC-GAP', why: 'two lines go out inside 30 s', db: [SEND, "    if v_wait > 0 then raise exception using errcode = 'HR939', message = 'crier_busy'; end if;\n", '', "  if v_wait > 0 then\n    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'crier_busy', 'wait_s', v_wait)); end if;\n", ''] },
  race_keeps_charge: { arm: 'TC-GAP', why: 'a line that lost the race keeps the charge', db: [SEND, "    if v_wait > 0 then raise exception using errcode = 'HR939', message = 'crier_busy'; end if;\n", "    if v_wait > 0 then return jsonb_build_object('ok', false, 'error', 'crier_busy', 'wait_s', 1); end if;\n"] },
  flag_ignored: { arm: 'TC-OFF', why: 'the server-wide stop stops nothing', db: [SEND, "  if not public.hr_flag_on('town_crier') then\n", '  if false then\n'] },
  flag_missing: { arm: 'TC-OFF', why: 'the flag row is gone, and the stop can\'t be thrown', ddl: "delete from public.hr_flags where key = 'town_crier'" },
  mute_unread: { arm: 'TC-MUTE', why: 'a muted press pays and dies at the row lock, a raised error and no refusal', db: [SEND, '  if public.hr_chat_muted_until(v_uid) is not null then\n', '  if false then\n'] },
  quote_hides_mute: { arm: 'TC-MUTE', why: 'the quote never says the mute, so the tab can\'t say why before a press', db: [QUOTE, "'muted_until', public.hr_chat_muted_until(p_user),", "'muted_until', null::timestamptz,"] },
  client_may_insert: { arm: 'TC-FORGE', why: 'a client role can insert a chat row', ddl: 'grant insert on public.chat_messages to authenticated' },
  client_may_flag: { arm: 'TC-FORGE', why: 'a client role can set the flag', ddl: 'grant update (crier) on public.chat_messages to authenticated' },
  helper_open: { arm: 'TC-FORGE', why: 'a client can read the quote helper directly', ddl: 'grant execute on function public.hr_town_crier_quote(uuid) to authenticated' },
  line_not_flagged: { arm: 'TC-LINE', why: 'a paid line isn\'t a Crier line', db: [SEND, "public.hr_chat_role_pick(v_uid, p_slot), true)", "public.hr_chat_role_pick(v_uid, p_slot), false)"] },
  not_on_the_board: { arm: 'TC-LINE', why: 'a paid line never reaches Gold Given', db: [SEND, '    perform public.hr_gold_given_add(v_uid, p_slot, v_price);\n', ''] },
  no_replay: { arm: 'TC-LINE', why: 'a retried key isn\'t answered from the journal', db: [SEND,
    "  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);\n  if v_r is not null then return public.hr_note_rejection('crier', p_slot, v_r); end if;\n  if not public.hr_flag_on", '  if not public.hr_flag_on',
    "  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision\n  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);\n  if v_r is not null then return public.hr_note_rejection('crier', p_slot, v_r); end if;\n", ''] },
  wrong_channel: { arm: 'TC-LINE', why: 'a paid line goes to the wrong channel', db: [SEND, "values ('global', v_uid, 'Adventurer', v_body,", "values ('system', v_uid, 'Adventurer', v_body,"] },
  words_lose_numbers: { arm: 'TC-WORDS-C', why: 'the Level gate names no hero',
    js: ['src/shell/sink-words.js', [["if (r.error === 'crier_level' && num(r.need) && num(r.level)) return", 'if (false) return']]] },
  line_ignores_flag: { arm: 'TC-CLIENT', why: 'a Crier line draws as a plain line',
    js: ['src/social/chat-lines.js', [['    crier: !whisper && row.crier === true,', '    crier: false,']]] },
  mute_words_gone: { arm: 'TC-WORDS-C', why: 'a muted press reads the chat\'s mute line, not the Crier\'s',
    js: ['src/data/refusal-words.js', [["    muted: 'The Game Master has muted you, so the Crier is off.',\n", '']]] },
  quote_drops_mute: { arm: 'TC-CLIENT', why: 'the tab never learns of the mute the server quoted',
    js: ['src/session/town-intents.js', [["mutedUntil: typeof c.muted_until === 'string' && c.muted_until ? c.muted_until : null", 'mutedUntil: null']]] },
  button_has_no_price: { arm: 'TC-CLIENT', why: 'the Crier\'s button hides the server\'s price',
    js: ['src/shell/windows/chat-crier.js', [["return CRIER.cry + (Number.isSafeInteger(price) ? ': ' + gold(price) : '');", 'return CRIER.cry;']]] },
};

const q = async (db, sql, params) => (await db.query(sql, params)).rows;
const one = async (db, sql, params) => { const r = await q(db, sql, params); return r[0] ? Object.values(r[0])[0] : undefined; };
const claims = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.headers', $3, true)`,
  [uid || '', uid ? JSON.stringify({ sub: uid, role: 'authenticated' }) : '', JSON.stringify({ 'cf-connecting-ip': '198.51.100.' + (uid ? parseInt(uid.slice(-2), 16) % 200 + 10 : 1) })]);
async function as(db, uid, sql, params) {
  await claims(db, uid);
  await db.exec('set local role authenticated');
  try { return await one(db, sql, params); } finally { await db.exec('reset role'); await claims(db, null); }
}
async function hero(db, uid, slot, name, level = 12) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'town-crier guard') on conflict (user_id) do nothing`, [uid]);
  const dye = await one(db, 'select min(idx) from public.hr_outfit_dyes');
  if (slot > 0) await ownHeroSlots((sql, p) => db.query(sql, p), uid, slot);   // one slot to start (2027-03-25-hero-slots-one.sql)
  const r = await as(db, uid, 'select public.hr_create_hero($1::int, $2, $3::jsonb, $4::uuid)', [slot, name, JSON.stringify({ head: dye, body: dye, legs: dye, feet: dye }), idem()]);
  if (!r || r.ok !== true) throw Object.assign(new Error(`hr_create_hero(${slot}, ${name}): ` + JSON.stringify(r)), { harness: true });
  await db.query('update public.player_state set level_xp = public.hr_char_xp_for_level($3) where user_id = $1 and slot = $2', [uid, slot, level]);
  await db.query('update public.account_wallet set gold = 1000000 where user_id = $1', [uid]);
}
const cry = (db, u, slot, body, price, key) => as(db, u, 'select public.hr_crier_send($1::int, $2, $3::bigint, $4::uuid)', [slot, body, price, key || idem()]);
const purse = async (db, u) => Number(await one(db, 'select gold from public.account_wallet where user_id = $1', [u]));
const calm = (db) => db.query('delete from public.hr_rate_counters');
/* A line older than the gap, so the next can go: the chat table is immutable to everyone else. */
async function theGapPasses(db) {
  await db.exec('alter table public.chat_messages disable trigger hr_chat_immutable');
  await db.query("update public.chat_messages set created_at = created_at - interval '31 seconds' where crier");
  await db.exec('alter table public.chat_messages enable trigger hr_chat_immutable');
  await calm(db);
}
const nothingMoved = async (db, u, gold = 1000000) => {
  const out = [];
  if ((await purse(db, u)) !== gold) out.push('it charged: ' + (await purse(db, u)));
  if (Number(await one(db, "select count(*) from public.player_ledger where user_id = $1 and kind = 'shop' and intent like 'crier:%'", [u])) !== (gold === 1000000 ? 0 : 1)) out.push('it journalled');
  return out;
};

const ARMS = {
  'TC-LINE': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    const key = idem();
    const r = await cry(db, A, 0, 'selling rat tails, ask Marlow', 1000, key);
    if (!r || r.ok !== true) return ['a clean line answered ' + JSON.stringify(r)];
    if (r.line.channel !== 'global' || r.line.crier !== true || r.line.from_name !== 'Marlow' || r.line.body !== 'selling rat tails, ask Marlow') out.push('the line reads ' + JSON.stringify(r.line));
    if ((await purse(db, A)) !== 999000) out.push('the purse reads ' + (await purse(db, A)));
    const replay = await cry(db, A, 0, 'selling rat tails, ask Marlow', 1000, key);
    if (!replay || replay.ok !== true) out.push('a replayed key answered ' + JSON.stringify(replay));
    if ((await purse(db, A)) !== 999000) out.push('a replayed key charged again: ' + (await purse(db, A)));
    const rows = await q(db, "select intent, gold::bigint g from public.player_ledger where user_id = $1 and kind = 'shop'", [A]);
    if (rows.length !== 1 || rows[0].intent !== 'crier:line:1000' || Number(rows[0].g) !== -1000) out.push('the journal reads ' + JSON.stringify(rows));
    if (Number(await one(db, 'select count(*) from public.chat_messages where crier and from_id = $1', [A])) !== 1) out.push('a replay posted twice');
    if (Number(await one(db, 'select sum(gold) from public.account_gold_given where user_id = $1', [A])) !== 1000) out.push('Gold Given reads wrong');
    await theGapPasses(db);
    const second = await cry(db, A, 0, 'rat tails, last call', 2000);
    if (!second || second.ok !== true || second.n !== 2) out.push('the second line at 2,000 answered ' + JSON.stringify(second));
    const seen = await as(db, A, 'select public.hr_town_sinks_view(0)');
    if (seen.crier.price !== 4000 || seen.crier.n !== 2 || seen.crier.last_line !== 'rat tails, last call') out.push('the window reads ' + JSON.stringify(seen.crier));
    /* a hunting hero may cry: chat works in a hunt, and only the shows are in town */
    await theGapPasses(db);
    await db.query('update public.player_state set stamina_ms = 28800000, stamina_at = now() where user_id = $1 and slot = 0', [A]);
    const hunt = await one(db, 'select g.hunt_id from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id order by coalesce(h.band_min, 0), g.hunt_id limit 1');
    const entered = await as(db, A, "select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, gen_random_uuid())", [hunt]);
    if (!entered || entered.ok !== true) return out.concat('hr_hunt_enter: ' + JSON.stringify(entered));
    const hunting = await cry(db, A, 0, 'from the Mill Cellar', 4000);
    if (!hunting || hunting.ok !== true) out.push('a hunting hero\'s line answered ' + JSON.stringify(hunting));
    return out;
  },

  'TC-WORDS': async (db) => {
    let out = [];
    await hero(db, A, 0, 'Marlow');
    const stem = await one(db, "select b.stem from public.hr_name_blocklist b where b.match = 'substring' and length(b.stem) between 3 and 12 order by length(b.stem), b.stem limit 1");
    const bad = stem + 'qz';
    if (await one(db, 'select public.hr_chat_mask($1) = $1', [bad])) return ['the fixture: the mask changes nothing on ' + bad];
    const w = await cry(db, A, 0, 'buy from ' + bad + ' now', 1000);
    if (w.error !== 'crier_word') out.push('a masked word answered ' + JSON.stringify(w));
    await calm(db);
    for (const line of ['see http://example.test/x', 'see HTTPS://EXAMPLE.TEST', 'www.example.test deals', 'join discord.gg/abc', 'go to hearthdeals.com today', 'goldshop.io', 'hearthdeals dot com', 'ftp://x.test']) {
      const r = await cry(db, A, 0, line, 1000);
      if (r.error !== 'crier_link') out.push(`"${line}" answered ` + JSON.stringify(r));
      await calm(db);
    }
    const two = await cry(db, A, 0, 'trading [[item:bronze_sword]] for [[item:bronze_helm]]', 1000);
    if (two.error !== 'crier_links') out.push('two item links answered ' + JSON.stringify(two));
    const none = await cry(db, A, 0, '   ', 1000);
    if (none.error !== 'empty') out.push('an empty line answered ' + JSON.stringify(none));
    out = out.concat(await nothingMoved(db, A));
    /* PLAIN WORDS THAT LOOK A LITTLE LIKE ONE PASS: a stop at a sentence's end, a price with a dot, one item link */
    const fine = await one(db, "select array_agg(public.hr_crier_has_link(x)) from unnest(array['selling 1.5k rat tails. ask marlow.', 'wts bronze sword. pst', 'a.m. raid at the sewer', 'trade [[item:bronze_sword]] now', 'dotted the i']) x");
    if (fine.some(Boolean)) out.push('plain words read as a web address: ' + JSON.stringify(fine));
    await calm(db);
    const one_link = await cry(db, A, 0, 'selling [[item:bronze_sword]]', 1000);
    if (!one_link || one_link.ok !== true) out.push('one item link answered ' + JSON.stringify(one_link));
    return out;
  },

  'TC-GATES': async (db) => {
    let out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, A, 1, 'Sorrel');
    await hero(db, B, 0, 'Tamsel', 9);
    /* LEVEL 10 */
    const low = await cry(db, B, 0, 'hello everyone', 1000);
    if (low.error !== 'crier_level' || low.level !== 9 || low.need !== 10) out.push('a Level 9 hero answered ' + JSON.stringify(low));
    out = out.concat(await nothingMoved(db, B));
    /* 120 LETTERS */
    const long = await cry(db, A, 0, 'a'.repeat(121), 1000);
    if (long.error !== 'crier_long' || long.n !== 121 || long.max !== 120) out.push('121 letters answered ' + JSON.stringify(long));
    /* A STALE OR FORGED PRICE */
    for (const forged of [1, 999, 1001, 16000]) {
      await calm(db);
      const r = await cry(db, A, 0, 'selling rat tails', forged);
      if (r.error !== 'quote_changed' || Number(r.price) !== 1000) out.push(`a price of ${forged} answered ` + JSON.stringify(r));
    }
    await calm(db);
    for (const bad of [0, -1000]) { const r = await cry(db, A, 0, 'selling rat tails', bad); if (r.error !== 'bad_quote') out.push(`a price of ${bad} answered ` + JSON.stringify(r)); }
    out = out.concat(await nothingMoved(db, A));
    /* A SHORT PURSE */
    await db.query('update public.account_wallet set gold = 10 where user_id = $1', [A]);
    await calm(db);
    const poor = await cry(db, A, 0, 'selling rat tails', 1000);
    if (poor.error !== 'insufficient_gold') out.push('a short purse answered ' + JSON.stringify(poor));
    if (await one(db, 'select exists (select 1 from public.chat_messages where crier and from_id = $1)', [A])) out.push('a short purse posted a line');
    await db.query('update public.account_wallet set gold = 1000000 where user_id = $1', [A]);
    /* FIVE A DAY FROM ONE ACCOUNT, ACROSS HEROES: the climb is the account's */
    const prices = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < prices.length; i++) {
      await theGapPasses(db);
      const r = await cry(db, A, i % 2, 'line ' + i, prices[i]);
      if (!r || r.ok !== true) { out.push(`line ${i} at ${prices[i]} answered ` + JSON.stringify(r)); break; }
    }
    await theGapPasses(db);
    const over = await cry(db, A, 0, 'one more', 16000);
    if (over.error !== 'crier_limit' || over.per_day !== 5) out.push('a sixth line answered ' + JSON.stringify(over));
    if ((await purse(db, A)) !== 1000000 - 31000) out.push('five lines cost ' + (1000000 - (await purse(db, A))));
    const seen = await as(db, A, 'select public.hr_town_sinks_view(1)');
    if (seen.crier.price !== null) out.push('the window still quotes a price past the cap');
    return out;
  },

  'TC-GAP': async (db) => {
    let out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel');
    const first = await cry(db, A, 0, 'selling rat tails', 1000);
    if (!first || first.ok !== true) return ['the first line answered ' + JSON.stringify(first)];
    /* someone else inside 30 s: refused, before the charge */
    const busy = await cry(db, B, 0, 'buying rat tails', 1000);
    if (busy.error !== 'crier_busy' || !(busy.wait_s >= 1 && busy.wait_s <= 30)) out.push('a line inside the gap answered ' + JSON.stringify(busy));
    out = out.concat(await nothingMoved(db, B));
    /* THE RACE: another line lands while the charge waits on the Crier's key. The whole purchase rolls back. */
    await theGapPasses(db);
    await db.exec(`create or replace function public.hr__zz_line() returns trigger language plpgsql as $f$ begin
        insert into public.chat_messages (channel, from_id, from_name, from_slot, body, crier) values ('global', '${A}', 'x', 0, 'first in', true);
        return new; end $f$;
      create trigger hr__zz_line before insert on public.player_ledger for each row execute function public.hr__zz_line();`);
    const key = idem();
    const lost = await cry(db, B, 0, 'buying rat tails', 1000, key);
    await db.exec('drop trigger hr__zz_line on public.player_ledger; drop function public.hr__zz_line()');
    if (lost.error !== 'crier_busy' || lost.ok !== false) out.push('a line that lost the race answered ' + JSON.stringify(lost));
    out = out.concat(await nothingMoved(db, B));
    if (await one(db, 'select exists (select 1 from public.player_intents where user_id = $1 and intent_id = $2)', [B, key])) out.push('it spent its key');
    if (await one(db, 'select exists (select 1 from public.chat_messages where crier and from_id = $1)', [B])) out.push('it posted its line');
    if (await one(db, 'select exists (select 1 from public.account_gold_given where user_id = $1)', [B])) out.push('it counted on the board');
    /* the same key, the gap clear: it buys it, once */
    await calm(db);
    const again = await cry(db, B, 0, 'buying rat tails', 1000, key);
    if (!again || again.ok !== true) out.push('the same key afterwards answered ' + JSON.stringify(again));
    if ((await purse(db, B)) !== 999000) out.push('the same key left the purse at ' + (await purse(db, B)));
    return out;
  },

  'TC-OFF': async (db) => {
    let out = [];
    await hero(db, A, 0, 'Marlow');
    if ((await one(db, "select enabled from public.hr_flags where key = 'town_crier'")) !== true) return ['the flag is not on: nobody can throw it'];
    await db.query("update public.hr_flags set enabled = false where key = 'town_crier'");
    const off = await cry(db, A, 0, 'selling rat tails', 1000);
    if (off.error !== 'crier_off') out.push('the flag off answered ' + JSON.stringify(off));
    out = out.concat(await nothingMoved(db, A));
    const seen = await as(db, A, 'select public.hr_town_sinks_view(0)');
    if (seen.crier.on !== false) out.push('the window still says the Crier is on');
    return out;
  },

  'TC-MUTE': async (db) => {
    let out = [];
    await hero(db, A, 0, 'Marlow');
    await db.query("insert into public.hr_chat_mutes (user_id, until, at) values ($1, now() + interval '1 hour', now())", [A]);
    /* the tab reads it before a press: the window's own read, the one the client parses */
    const seen = await as(db, A, 'select public.hr_town_sinks_view(0)');
    if (!seen.crier || typeof seen.crier.muted_until !== 'string') out.push('the window\'s quote of a muted account reads ' + JSON.stringify(seen.crier));
    /* a press anyway (a stale tab): refused with the mute's end, before the words and the charge */
    const key = idem();
    const r = await cry(db, A, 0, 'selling rat tails', 1000, key);
    if (!r || r.ok !== false || r.error !== 'muted' || typeof r.until !== 'string') out.push('a muted press answered ' + JSON.stringify(r));
    const link = await cry(db, A, 0, 'join discord.gg/abc', 1000);
    if (!link || link.error !== 'muted') out.push('a muted web address answered ' + JSON.stringify(link) + ' (the mute is the first thing to say)');
    out = out.concat(await nothingMoved(db, A));
    if (await one(db, 'select exists (select 1 from public.player_intents where user_id = $1 and intent_id = $2)', [A, key])) out.push('a muted press spent its key');
    /* lifted: the quote reads null and the same key pays */
    await db.query('delete from public.hr_chat_mutes where user_id = $1', [A]);
    const free = await as(db, A, 'select public.hr_town_sinks_view(0)');
    if (!free.crier || !('muted_until' in free.crier) || free.crier.muted_until !== null) out.push('the quote of a free account reads ' + JSON.stringify(free.crier));
    await calm(db);
    const paid = await cry(db, A, 0, 'selling rat tails', 1000, key);
    if (!paid || paid.ok !== true) out.push('the lifted account\'s press answered ' + JSON.stringify(paid));
    return out;
  },

  'TC-FORGE': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    const refused = async (sql, params) => {
      await db.exec('savepoint forge');
      await claims(db, A);
      await db.exec('set local role authenticated');
      let denied = false;
      try { await db.query(sql, params); } catch (e) { denied = /permission denied/.test(String(e.message)); }
      await db.exec('rollback to savepoint forge');
      await db.exec('reset role');
      await claims(db, null);
      return denied;
    };
    if (!(await refused("insert into public.chat_messages (channel, from_id, from_name, from_slot, body, crier) values ('global', $1, 'x', 0, 'free', true)", [A]))) out.push('a client inserted a Crier line');
    if (!(await refused('update public.chat_messages set crier = true where from_id = $1', [A]))) out.push('a client set the flag');
    for (const role of ['anon', 'authenticated']) {
      for (const fn of ['public.hr_town_crier_quote(uuid)', 'public.hr_crier_has_link(text)']) if (await one(db, 'select has_function_privilege($1, $2, $3)', [role, fn, 'execute'])) out.push(`${role} reaches ${fn}`);
    }
    if (await one(db, "select has_function_privilege('anon', $1, 'execute')", [SEND])) out.push('anon reaches the verb');
    if (!(await one(db, "select has_function_privilege('authenticated', $1, 'execute')", [SEND]))) out.push('a player can\'t reach the verb');
    /* the name and title are the server's on the verb's own insert too */
    const r = await cry(db, A, 0, 'selling rat tails', 1000);
    if (!r.ok || r.line.from_name !== 'Marlow' || r.line.from_title !== null) out.push('the line reads ' + JSON.stringify(r.line));
    return out;
  },

  'TC-WORDS-C': async (db, X) => {
    const out = [];
    const R = (o, name) => X.IW.refusalText({ ok: false, verb: 'crier', ...o }, name ? { slot: 0, read: () => null, name } : null);
    const want = [
      [{ error: 'crier_word' }, 'The Crier won\'t shout that word. Change it. You weren\'t charged.'],
      [{ error: 'crier_link' }, 'The Crier won\'t shout web addresses. You weren\'t charged.'],
      [{ error: 'crier_long', n: 133, max: 120 }, 'The Crier shouts 120 letters at most. That\'s 133.'],
      [{ error: 'crier_limit', perDay: 5 }, 'The Crier takes 5 lines a day from one account. More after midnight UTC.'],
      [{ error: 'crier_busy', waitS: 12 }, 'The Crier is shouting someone else\'s line. Try again in 12 seconds. You weren\'t charged.'],
      [{ error: 'crier_off' }, 'The Crier is off duty right now. You weren\'t charged.'],
      [{ error: 'quote_changed', price: 2000 }, 'The price moved to 2,000 gp. You weren\'t charged. Press again to pay it.'],
      /* a muted press, said for the Crier (the raised row lock reads the same code through src/session/server.js raisedCode) */
      [{ error: 'muted' }, 'The Game Master has muted you, so the Crier is off.'],
    ];
    for (const [r, words] of want) if (R(r) !== words) out.push(JSON.stringify(r) + ' reads: ' + R(r));
    const lv = X.SW.sinkRefusal({ verb: 'crier', error: 'crier_level', need: 10, level: 7 }, 'Marlow');
    if (lv !== 'The Crier takes words from Level 10 heroes and up. Marlow is Level 7.') out.push('the Level gate reads: ' + lv);
    return out;
  },

  'TC-CLIENT': async (db, X) => {
    const out = [];
    const row = (o) => ({ id: 'aaaaaaaa-0000-4000-8000-0000000000a1', channel: 'global', from_id: A, from_name: 'Marlow', from_slot: 0, from_level: 18, from_weapon: null, from_role: null, body: 'hi', created_at: '2026-11-04T09:00:00Z', ...o });
    if (X.CL.lineOf(row({ crier: true }), { tz: 'utc' }).crier !== true) out.push('a Crier line lost its flag');
    if (X.CL.lineOf(row({ crier: 'true' }), { tz: 'utc' }).crier !== false) out.push('a flag that isn\'t the server\'s boolean passed');
    if (X.CL.lineOf(row({}), { tz: 'utc' }).crier !== false) out.push('a plain line reads as the Crier\'s');
    if (X.CC.cryWords(1000) !== 'Cry it: 1,000 gp') out.push('the button reads ' + X.CC.cryWords(1000));
    if (X.CC.cryWords(null) !== 'Cry it') out.push('with no quote the button reads ' + X.CC.cryWords(null));
    /* the window's read as the server sends it: a standing mute reaches the tab, and none reads null */
    const sinks = (crier) => X.TI.parseSinks({ ok: true, powder: { n: 0, per_day: 5, price: 500 }, round: { n: 0, per_day: 3, price: 800 }, crier });
    const crierRow = { n: 0, per_day: 5, price: 1000, min_level: 10, max_letters: 120, gap_s: 30, on: true, wait_s: 0, last_line: null };
    if (sinks({ ...crierRow, muted_until: '2026-11-06T03:00:00+00:00' }).crier.mutedUntil !== '2026-11-06T03:00:00+00:00') out.push('a quoted mute never reaches the tab');
    if (sinks({ ...crierRow, muted_until: null }).crier.mutedUntil !== null) out.push('no mute reads as one');
    return out;
  },
};

async function loadReaders(root) {
  const u = (p) => pathToFileURL(join(root, p)).href + '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
  return {
    IW: await import(u('src/shell/intent-words.js')),
    SW: await import(u('src/shell/sink-words.js')),
    CL: await import(u('src/social/chat-lines.js')),
    CC: await import(u('src/shell/windows/chat-crier.js')),
    TI: await import(u('src/session/town-intents.js')),
  };
}

async function runArm(db, X, id, mutant) {
  await db.query('begin');
  try {
    if (mutant && mutant.db) {
      const [fn, ...pairs] = mutant.db;
      let def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [fn])).split(String.fromCharCode(13)).join('');
      for (let i = 0; i < pairs.length; i += 2) {
        if (def.split(pairs[i]).length !== 2) throw Object.assign(new Error(`mutant anchor not found once in ${fn}: ${pairs[i].slice(0, 80)}`), { harness: true });
        def = def.replace(pairs[i], () => pairs[i + 1]);
      }
      await db.exec(def);
    }
    if (mutant && mutant.ddl) await db.exec(mutant.ddl);
    return await ARMS[id](db, X);
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
    console.log(bad ? `town-crier: ${bad} arm(s) red` : `town-crier: all ${Object.keys(ARMS).length} arms green`);
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
        const dir = mkdtempSync(join(tmpdir(), 'hr-tc-'));
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
  console.log(missed ? `town-crier --selftest: ${missed} of ${ids.length} mutant(s) survived` : `town-crier --selftest: all ${ids.length} mutants killed`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
