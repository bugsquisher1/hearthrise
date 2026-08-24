#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/combat-style.mjs — THE COMBAT STYLE IS SERVER STATE, AND THE SERVER
//                          ROUTES XP TO THE SKILL THE PLAYER PICKED.
//
//   node tests/combat-style.mjs            # the guard
//   node tests/combat-style.mjs --list     # the mutation catalogue
//   node tests/combat-style.mjs --selftest # every mutation must be CAUGHT
//
// Ships with: supabase/migrations/2026-08-24-combat-style.sql
//             supabase/functions/hr-accrue/accrual.js   (resolveStyle)
//             supabase/functions/hr-accrue/index.ts · set-activity.js
//             src/net/goal-claim.js setStyle · src/net/accrue.js
//             reconcileCombatStyle · src/legacy.js applyCombatStyle
//
// ── THE DEFECT THIS EXISTS FOR (P0, live — Paione, 2026-08-24) ───────────
// "When training combat, Strength/Defense/HP exp is not saving — only Attack
//  saves; the rest reset to level 1."
//
// accrual.js settled every combat window with `resolveStyle(eq.weaponType,
// null)`. `null` makes resolveStyle fall to the FIRST key of the weapon family —
// `sword.accurate` — which routes 100% of styled XP to ATTACK. Skills are
// server-of-record and ARMED, so each settle retired the client's predicted
// Strength/Defence XP and wrote the server's Attack-only answer instead. The
// player's chosen style had no server home: it lived in the save blob, then in
// the client_state RESIDUE bag, which is self-only and which the server is
// forbidden to read for authority.
//
// ── WHAT THIS FILE PROVES, AND WHAT IT CANNOT ───────────────────────────
// It drives the REAL engine function (computeAccrual) over a real span with a
// real seed, so section B is a behavioural proof and not a grep. It also BINDS
// the two catalogues that must never disagree:
//   (A) src/core/styles.js COMBAT_STYLES / DEFAULT_STYLE_KEYS — what the picker
//       renders and what the simulation actually pays from
//   (B) public.hr_combat_styles                                — what the server
//       will ACCEPT
// A style the server would refuse, a style the server would accept that the
// client cannot render, or a default that differs, fails the build BY NAME.
//
// It CANNOT prove: the SQL function's runtime behaviour (that is the migration's
// own §8 gate, which executes buy/refuse/merge/replay/mid-absence probes at apply
// time and rolls them back), production's ACL, or the browser transport.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMBAT_STYLES, DEFAULT_STYLE_KEYS, resolveStyle, normaliseStyleKeys }
  from '../src/core/styles.js';
import { computeAccrual, deriveTickMs } from '../supabase/functions/hr-accrue/accrual.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = join(ROOT, 'supabase', 'migrations', '2026-08-24-combat-style.sql');

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/* ⚠ EVERY "THIS TEXT MUST NOT APPEAR" SCAN READS THE **CODE**, NOT THE FILE.
   Learned immediately and the hard way: this file's first run failed three of
   its own assertions on its own DOCUMENTATION — the migration header explains
   why it does not stamp `accrued_to = now()` and does not `insert into
   public.player_ledger`, and accrual.js's comment quotes the old
   `resolveStyle(eq.weaponType, null)` line it replaced. That is the exact
   false-positive class run-sql-tests.mjs already documents ("the pressure a
   false-positive lint creates is to stop writing the comment, i.e. it taxes
   exactly the documentation this codebase depends on"). So: strip first, scan
   second. The quote-aware SQL stripper is the same one that file uses. */
const stripSql = (sql) => sql.split('\n').map((line) => {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "'") q = !q;
    else if (!q && line[i] === '-' && line[i + 1] === '-') return line.slice(0, i);
  }
  return line;
}).join('\n');

/* Good enough for this file's purpose and no more: it removes block comments and
   line comments. It is NOT a JS parser — a slash-slash inside a string literal
   would be cut — which is why it is used ONLY for the negative scans in section
   C. Over-stripping can only ever remove COMMENT text, never a statement, so it
   cannot hide a real occurrence. */
const stripJs = (js) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────
   Each is a defect somebody could plausibly write, and each must turn this
   guard RED. A guard that cannot demonstrate it sees failure is broken, not
   passing. Applied to the SOURCE TEXT the section reads, so `--selftest`
   exercises the same bytes the guard does. */
const MUTATIONS = {
  style_ignored: {
    why: 'THE ORIGINAL P0: the engine goes back to resolveStyle(weaponType, null), so every '
       + 'styled grant routes to Attack whatever the player picked.',
    file: 'accrual.js',
    find: 'resolveStyle(eq.weaponType, normaliseStyleKeys({ ...(inp.combatStyle || {}) }))',
    replace: 'resolveStyle(eq.weaponType, null)',
  },
  style_from_body: {
    why: 'The engine reads the style out of the REQUEST instead of the state row — a client '
       + 'could then choose, per call, which skill the server pays.',
    file: 'index.ts',
    find: 'combatStyle: st.combat_style ?? null,',
    replace: 'combatStyle: (body && body.combatStyle) ?? st.combat_style ?? null,',
  },
  catalogue_drift: {
    why: 'A style the client can render that the server would refuse — the player presses a '
       + 'button and nothing happens, forever.',
    file: 'migration',
    find: "('sword',  'defensive',  false, 3),",
    replace: "('sword',  'defensiv',   false, 3),",
  },
  no_collect_first: {
    why: 'The mid-absence refusal is deleted, so a flip re-routes (and, through speedMod, '
       + 're-prices) a whole unpaid night retroactively.',
    file: 'migration',
    find: "return jsonb_build_object('ok', false, 'error', 'collect_first',",
    replace: "return jsonb_build_object('ok', true, 'error', 'ignored',",
  },
  inner_client_callable: {
    why: 'The ungated inner is granted to authenticated — the rate gate becomes decoration.',
    file: 'migration',
    find: 'revoke execute on function public.hr_set_style__ungated(text, text, int, uuid) from public;',
    replace: 'grant execute on function public.hr_set_style__ungated(text, text, int, uuid) to authenticated;',
  },
  stamps_accrued_to: {
    why: 'The verb stamps accrued_to, which CONFISCATES the unpaid window the collect_first '
       + 'refusal exists to protect.',
    file: 'migration',
    find: '     set combat_style = v_map,',
    replace: '     set combat_style = v_map, accrued_to = now(),',
  },
};

const FILES = {
  'accrual.js':  join(ROOT, 'supabase', 'functions', 'hr-accrue', 'accrual.js'),
  'index.ts':    join(ROOT, 'supabase', 'functions', 'hr-accrue', 'index.ts'),
  'set-activity.js': join(ROOT, 'supabase', 'functions', 'hr-accrue', 'set-activity.js'),
  'accrue.js':   join(ROOT, 'src', 'net', 'accrue.js'),
  'goal-claim.js': join(ROOT, 'src', 'net', 'goal-claim.js'),
  'legacy.js':   join(ROOT, 'src', 'legacy.js'),
  'migration':   MIG,
};

// ════════════════════════════════════════════════════════════════════════
// A. THE CATALOGUE IS BOUND TO src/core/styles.js, IN BOTH DIRECTIONS
// ════════════════════════════════════════════════════════════════════════
/* Parses the §2 insert block rather than the whole file, so a style named in a
   COMMENT cannot satisfy the check — that is exactly the false-green a naive
   `includes()` would hand back. */
function parseCatalogue(sql) {
  const start = sql.indexOf('insert into public.hr_combat_styles');
  if (start < 0) return null;
  const end = sql.indexOf(';', start);
  const block = sql.slice(start, end);
  const rows = [];
  const re = /\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*,\s*(true|false)\s*,\s*(\d+)\s*\)/g;
  let m;
  while ((m = re.exec(block))) {
    rows.push({ family: m[1], key: m[2], isDefault: m[3] === 'true', ord: Number(m[4]) });
  }
  return rows;
}

function sectionA(sql) {
  const rows = parseCatalogue(sql);
  ok(rows && rows.length > 0, 'A: the migration has no parseable hr_combat_styles insert block');
  if (!rows || !rows.length) return;

  const sqlPairs = new Set(rows.map((r) => `${r.family}/${r.key}`));
  const jsPairs = new Set();
  for (const family of Object.keys(COMBAT_STYLES)) {
    for (const key of Object.keys(COMBAT_STYLES[family])) jsPairs.add(`${family}/${key}`);
  }

  for (const p of jsPairs) {
    ok(sqlPairs.has(p),
      `A: src/core/styles.js has "${p}" and public.hr_combat_styles does NOT — the picker would `
      + 'render a button whose every press is refused unknown_style, forever');
  }
  for (const p of sqlPairs) {
    ok(jsPairs.has(p),
      `A: public.hr_combat_styles accepts "${p}" and src/core/styles.js has no such style — the `
      + 'server would store a key resolveStyle falls back from, i.e. a silent routing default');
  }

  /* THE DEFAULTS. resolveStyle treats an absent family key as `Object.keys(family)[0]`,
     so the catalogue's `is_default` must agree with BOTH the authored first key
     AND DEFAULT_STYLE_KEYS — three copies of one fact that this binds together. */
  for (const family of Object.keys(COMBAT_STYLES)) {
    const firstKey = Object.keys(COMBAT_STYLES[family])[0];
    ok(DEFAULT_STYLE_KEYS[family] === firstKey,
      `A: DEFAULT_STYLE_KEYS.${family} is "${DEFAULT_STYLE_KEYS[family]}" but resolveStyle falls `
      + `back to "${firstKey}" (the first authored key) — the two disagree about "unchosen"`);
    const flagged = rows.filter((r) => r.family === family && r.isDefault);
    ok(flagged.length === 1,
      `A: hr_combat_styles has ${flagged.length} defaults for ${family}, expected exactly 1`);
    if (flagged.length === 1) {
      ok(flagged[0].key === firstKey,
        `A: hr_combat_styles marks ${family}/${flagged[0].key} default; the engine resolves `
        + `${family} to "${firstKey}"`);
    }
  }

  /* NOT ONE SIMULATION NUMBER IN SQL. The whole "bind, never duplicate" rule
     rests on the migration answering only "does this pair exist". */
  const block = sql.slice(sql.indexOf('create table if not exists public.hr_combat_styles'));
  for (const knob of ['accuracyMod', 'damageMod', 'speedMod', 'defenseMod', 'accuracy_mod',
                      'damage_mod', 'speed_mod', 'xp_share']) {
    ok(!new RegExp(`\\b${knob}\\b`).test(block.slice(0, block.indexOf('hr_set_style__ungated'))),
      `A: the migration carries a "${knob}" column — the simulation's numbers live in exactly `
      + 'one place (src/core/styles.js) and a second copy in SQL is the b222 shape');
  }
}

// ════════════════════════════════════════════════════════════════════════
// B. THE ENGINE ROUTES XP TO THE CHOSEN STYLE — BEHAVIOURAL
// ════════════════════════════════════════════════════════════════════════
const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const NOW_MS = FROM_MS + 4 * 3600000;
const SEED = 0x5eed1234;
const MONSTER = Object.keys(MONSTERS).includes('goblin') ? 'goblin' : Object.keys(MONSTERS)[0];

function baseSkills() {
  return { attack: 5000, strength: 5000, defense: 5000, hitpoints: 5000, ranged: 5000, magic: 5000 };
}

function accrue(combatStyle) {
  return computeAccrual({
    userId: '00000000-0000-4000-8000-0000000000c5',
    slot: 0,
    nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
    activeKind: 'combat', activeId: MONSTER,
    capMs: 12 * 3600000, seed: SEED,
    hp: 60, maxHp: 60, gold: 0,
    skills: baseSkills(),
    equipment: {},                 // bare hands ⇒ weaponType 'sword'
    combatStyle,
    items: ITEMS, monsters: MONSTERS,
  });
}

function sectionB() {
  /* The CONTROL. `null` is what a database without the migration hands the
     engine, and it must still behave exactly as it did before: Accurate, i.e.
     Attack only. Without this the two assertions below are satisfied by an
     engine that pays every skill on every style. */
  const base = accrue(null);
  ok(base.accrued === true, `B: the control span accrued nothing (${base.reason})`);
  if (!base.accrued) return;
  const bx = base.delta.xp || {};
  ok((bx.attack || 0) > 0,
    'B: CONTROL — a null style paid no Attack XP; the fixture is not fighting and every '
    + 'assertion below would be vacuous');
  ok(!(bx.strength > 0) && !(bx.defense > 0),
    `B: CONTROL — a null style paid strength=${bx.strength || 0} defense=${bx.defense || 0}; `
    + 'the pre-migration default is Accurate (Attack only) and this fixture cannot tell the '
    + 'styles apart if it pays everything');

  /* DEFENSIVE — the P0, stated as a test. `sword.defensive` is `xp:{defense:1}`. */
  const def = accrue({ sword: 'defensive' });
  ok(def.accrued === true, `B: the defensive span accrued nothing (${def.reason})`);
  const dx = (def.delta && def.delta.xp) || {};
  ok((dx.defense || 0) > 0,
    'B: THE P0 — a character whose SERVER-STORED style is sword/defensive was paid '
    + `defense=${dx.defense || 0}. The settle is still routing by the family default, which is `
    + 'exactly the bug Paione reported ("Strength/Defense/HP exp is not saving").');
  ok(!(dx.attack > 0),
    `B: sword/defensive paid attack=${dx.attack} — Defensive is xp:{defense:1}, so any Attack `
    + 'grant means the style was ignored or merged with the default');

  /* AGGRESSIVE — a second, independent route, so B is not satisfied by an engine
     that hard-codes Defence. */
  const agg = accrue({ sword: 'aggressive' });
  const ax = (agg.delta && agg.delta.xp) || {};
  ok((ax.strength || 0) > 0 && !(ax.attack > 0),
    `B: sword/aggressive paid strength=${ax.strength || 0} attack=${ax.attack || 0}; `
    + 'Aggressive is xp:{strength:1}');

  /* HITPOINTS IS UNCONDITIONAL — it is not a styled route, and the report named
     it. It must be paid under EVERY style. */
  for (const [name, out] of [['null', bx], ['defensive', dx], ['aggressive', ax]]) {
    ok((out.hitpoints || 0) > 0,
      `B: no Hitpoints XP under the ${name} style — hitXpRoute pays floor(dmg*1.33) on every `
      + 'landed hit regardless of style, so zero means the fight itself is not landing');
  }

  /* THE TOTAL IS PRESERVED. A style is a ROUTE, not a multiplier: the styled XP
     of Defensive and Aggressive must be within rounding of each other, or a
     player could pick a style for more XP rather than for a different skill. */
  const styled = (m) => (m.attack || 0) + (m.strength || 0) + (m.defense || 0);
  const dTot = styled(dx), aTot = styled(ax);
  ok(dTot > 0 && Math.abs(dTot - aTot) <= Math.max(4, dTot * 0.02),
    `B: styled XP totals differ (defensive ${dTot} vs aggressive ${aTot}) — both are speedMod `
    + '1.00 single-skill routes over the same seed, so a gap means a style is paying a bonus');

  /* A PARTIAL MAP IS NORMAL, AND A FOREIGN FAMILY MUST NOT LEAK. Choosing a bow
     style must not change how a sword fight is routed. */
  const foreign = accrue({ ranged: 'longrange' });
  const fx = (foreign.delta && foreign.delta.xp) || {};
  ok(JSON.stringify(fx) === JSON.stringify(bx),
    'B: a ranged-only style map changed a SWORD fight — resolveStyle is reading the wrong '
    + 'family, so one weapon\'s choice would re-route another weapon\'s XP');

  /* THE INPUT IS NOT MUTATED. normaliseStyleKeys mutates and returns its
     argument; handing it the input row would write the four defaults back and
     destroy the "{} means chosen nothing" distinction the column is defined on. */
  const probe = { sword: 'defensive' };
  accrue(probe);
  ok(JSON.stringify(probe) === '{"sword":"defensive"}',
    `B: computeAccrual MUTATED its combatStyle input (${JSON.stringify(probe)}) — `
    + 'normaliseStyleKeys must be handed a COPY, or "chose nothing" becomes indistinguishable '
    + 'from "chose the default"');

  /* speedMod REACHES THE TICK. It is the half of a style that changes the
     PAYOUT rather than the route, and an engine that routed correctly while
     swinging at the baseline would silently over-pay Longrange. */
  const rapid = deriveTickMs({}, ITEMS, resolveStyle('ranged', { ranged: 'rapid' }));
  const long = deriveTickMs({}, ITEMS, resolveStyle('ranged', { ranged: 'longrange' }));
  ok(long > rapid,
    `B: deriveTickMs gives Longrange ${long}ms and Rapid ${rapid}ms — speedMod (1.10) is not `
    + 'reaching the swing interval, so the server would pay a Longrange night at Rapid pace');

  /* AND resolveStyle ITSELF, directly: the fallback the engine relies on. */
  ok(resolveStyle('sword', normaliseStyleKeys({})).xp.attack === 1,
    'B: an empty style map no longer resolves sword to Accurate — the "absent column ⇒ '
    + 'pre-migration behaviour" degrade is broken');
}

// ════════════════════════════════════════════════════════════════════════
// C. THE WIRE — never from a body, mirrored across both input builders
// ════════════════════════════════════════════════════════════════════════
function sectionC(src) {
  const accrual = stripJs(src['accrual.js']);
  const index = stripJs(src['index.ts']);
  const setAct = stripJs(src['set-activity.js']);

  ok(!/resolveStyle\(\s*eq\.weaponType\s*,\s*null\s*\)/.test(accrual),
    'C: accrual.js still contains resolveStyle(eq.weaponType, null) — the P0 line is back');
  ok(/normaliseStyleKeys\(/.test(accrual),
    'C: accrual.js never calls normaliseStyleKeys — a partial style map would leave the other '
    + 'families unresolved');

  /* THE A14 MIRROR. index.ts and set-activity.js build the SAME engine input; a
     field present in one and absent in the other means a COLLECT and an ACCRUE
     over the same window route XP differently, which is the exact divergence
     class A14 exists to catch. */
  for (const [name, text] of [['index.ts', index], ['set-activity.js', setAct]]) {
    ok(/combatStyle:\s*st\.combat_style\s*\?\?\s*null/.test(text),
      `C: ${name} does not read combatStyle from the state row as \`st.combat_style ?? null\` — `
      + 'either it is missing (the collect and the accrue would route differently) or it is '
      + 'reading it from somewhere that is not the row hr_apply locks');
  }

  /* NOT FROM THE REQUEST. request.js is the only reader of the body; a style key
     there would be a client-chosen routing argument. */
  const request = stripJs(src['request.js'] || '');
  ok(!/combat_?[Ss]tyle/.test(request),
    'C: request.js parses a combatStyle field out of the request body — the style must come '
    + 'from player_state and nowhere else');
  for (const [name, text] of [['index.ts', index], ['set-activity.js', setAct]]) {
    ok(!/(body|req|intent)\s*\.\s*combat_?[Ss]tyle/.test(text),
      `C: ${name} reads a combat style off the request — never trust a client value that '
      + 'decides which skill the server pays`);
  }
}

// ════════════════════════════════════════════════════════════════════════
// D. THE MIGRATION'S LOAD-BEARING PROPERTIES (static; §8 proves them live)
// ════════════════════════════════════════════════════════════════════════
function sectionD(raw) {
  const sql = stripSql(raw);
  // revoke BEFORE grant, for both functions.
  for (const fn of ['hr_set_style', 'hr_set_style__ungated']) {
    const rev = sql.indexOf(`revoke execute on function public.${fn}(`);
    const gnt = sql.indexOf(`grant  execute on function public.${fn}(`);
    ok(rev > 0, `D: ${fn} is never revoked — a new SECURITY DEFINER function is born PUBLIC`);
    if (gnt > 0) ok(rev < gnt, `D: ${fn} is granted before it is revoked`);
  }
  ok(!/grant\s+execute\s+on\s+function\s+public\.hr_set_style__ungated/.test(sql),
    'D: the __ungated inner is granted to something — the rate gate would be decoration');
  ok(!/grant[^\n]*hr_set_style[^\n]*to\s+hr_engine/.test(sql),
    'D: hr_set_style is granted to hr_engine — the accrual engine would be able to choose '
    + 'which skill it pays');

  ok(/hr_rpc_gate\('hr_set_style'\)/.test(sql),
    'D: the wrapper does not consult hr_rpc_gate — an ungated client RPC');

  /* ⚠ THE TWO NEGATIVE SCANS BELOW READ THE **VERB'S BODY**, not the file.
     §8's commit gate asserts these same properties at apply time, and it does so
     by naming the forbidden text in SQL STRING LITERALS ('update x set
     accrued_to = now()' is its own blindness CONTROL). A whole-file scan reads
     the gate's controls as violations — the guard would then be red exactly
     because the migration checks itself, which is the worst possible incentive
     to build in. Scope it to §3 and both stay honest. */
  const bodyStart = raw.indexOf('create or replace function public.hr_set_style__ungated');
  const bodyEnd = raw.indexOf('create or replace function public.hr_set_style(');
  ok(bodyStart > 0 && bodyEnd > bodyStart, 'D: cannot locate the hr_set_style__ungated body');
  const body = (bodyStart > 0 && bodyEnd > bodyStart) ? stripSql(raw.slice(bodyStart, bodyEnd)) : '';
  ok(/collect_first/.test(body),
    'D: the collect_first refusal is gone from the verb body — a flip would re-route (and, '
    + 'through speedMod, partly re-price) a whole unpaid night retroactively');
  ok(!/set\s+accrued_to\s*=/.test(body) && !/accrued_to\s*=\s*now\(\)/.test(body),
    'D: the verb stamps accrued_to — that confiscates the window collect_first protects');
  ok(!/insert\s+into\s+(public\.)?player_ledger/.test(body),
    'D: hr_set_style writes a player_ledger row at a 30/min bucket — journal rule 6 (game_events '
    + 'reached 1.6M rows from six players) forbids a per-gesture journal. Drop the bucket first.');
  /* CONTROL for the two scans above: they must be able to SEE what they look
     for. Without this a mis-sliced body makes both pass by being empty. */
  ok(/set\s+accrued_to\s*=/.test('update x set accrued_to = now()')
     && /insert\s+into\s+public\.player_ledger/.test('insert into public.player_ledger (a)')
     && body.length > 500,
    'D: the negative scans are BLIND — either the patterns do not match a known positive or the '
    + `extracted body is ${body.length} bytes`);
  ok(/pg_advisory_xact_lock\(hashtextextended\(v_uid::text \|\| ':' \|\| v_slot::text, 0\)\)/.test(sql),
    'D: the advisory lock is not byte-for-byte hr_apply\'s key — a lock on a different key is '
    + 'not a lock');
  ok(/security definer set search_path/.test(sql),
    'D: a SECURITY DEFINER body with no pinned search_path is a search_path hijack');
  ok(/version\s*=\s*version \+ 1/.test(sql),
    'D: the write does not bump version — an in-flight accrual holding the old version would '
    + 'price the window at the style the player has since changed');
  ok(/revoke all on public\.hr_combat_styles from public, anon, authenticated, service_role/.test(sql),
    'D: hr_combat_styles keeps a client grant (and "revoke all" is required — the default ACL '
    + 'also grants TRUNCATE, which bypasses RLS)');
  ok(/enable row level security/.test(sql), 'D: hr_combat_styles has no RLS');
  ok(/do \$\$/.test(sql), 'D: the migration has no self-verifying do-block');
  ok(!/^\s*begin\s*;/im.test(sql) && !/^\s*commit\s*;/im.test(sql),
    'D: the migration carries its own BEGIN/COMMIT — the applier owns the transaction');
}

// ════════════════════════════════════════════════════════════════════════
// E. THE CLIENT HALF IS WIRED
// ════════════════════════════════════════════════════════════════════════
function sectionE(src) {
  ok(/hr_set_style/.test(src['goal-claim.js']),
    'E: no client transport calls hr_set_style — the server would never learn the choice and '
    + 'the P0 stays live however good the migration is');
  ok(/settleBeforeIntent/.test(src['goal-claim.js']),
    'E: setStyle does not settle first — under live settlement (~90s) the server\'s 60s grace '
    + 'means most flips would be refused collect_first and silently dropped');
  ok(/HearthriseGoalClaim[\s\S]{0,400}setStyle|setStyle/.test(src['legacy.js']),
    'E: applyCombatStyle — the ONE writer of G.combatStyle — does not tell the server');
  ok(/reconcileCombatStyle/.test(src['accrue.js']),
    'E: nothing reconciles the style off the envelope, so the picker can disagree with what '
    + 'the engine pays and the choice still dies on a device change');
  /* client-state.js belongs to another workstream this cycle; the residue entry
     stays and is now DISPLAY continuity only. Assert we did not touch it. */
  ok(/'combatStyle'/.test(src['client-state.js'] || ''),
    'E: combatStyle left RESIDUE_FIELDS — display continuity across a reload would break for '
    + 'anyone whose server row has not been written yet');
}

// ════════════════════════════════════════════════════════════════════════
// Driver
// ════════════════════════════════════════════════════════════════════════
async function loadSources(mutation) {
  const src = {};
  for (const [name, path] of Object.entries(FILES)) {
    src[name] = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
  }
  src['request.js'] = (await readFile(
    join(ROOT, 'supabase', 'functions', 'hr-accrue', 'request.js'), 'utf8')).replace(/\r\n/g, '\n');
  src['client-state.js'] = (await readFile(
    join(ROOT, 'src', 'net', 'client-state.js'), 'utf8')).replace(/\r\n/g, '\n');
  if (mutation) {
    const m = MUTATIONS[mutation];
    if (!m) throw new Error(`unknown mutation "${mutation}"`);
    const text = src[m.file];
    const n = text.split(m.find).length - 1;
    if (n !== 1) {
      const e = new Error(`mutation "${mutation}" anchor matched ${n} times in ${m.file} (need 1)`);
      e.harness = true; throw e;
    }
    src[m.file] = text.replace(m.find, m.replace);
  }
  return src;
}

export async function combatStyleGuard({ mutation = null, skipRuntime = false } = {}) {
  problems.length = 0;
  const src = await loadSources(mutation);
  sectionA(src['migration']);
  sectionC(src);
  sectionD(src['migration']);
  sectionE(src);
  /* Section B imports the REAL module, so a source-text mutation cannot reach
     it — under --mutate the static sections are the graded ones. */
  if (!skipRuntime && !mutation) sectionB();
  return problems.slice();
}

const isMain = process.argv[1]
  && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url));
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n  ${m.why}\n`);
    process.exit(0);
  }
  if (argv.includes('--selftest')) {
    let bad = 0;
    for (const id of Object.keys(MUTATIONS)) {
      const p = await combatStyleGuard({ mutation: id });
      if (!p.length) { console.error(`  UNCAUGHT  ${id} — ${MUTATIONS[id].why}`); bad++; }
      else console.log(`  caught    ${id} (${p.length})`);
    }
    process.exit(bad ? 1 : 0);
  }
  const mut = (argv.find((a) => a.startsWith('--mutate=')) || '').split('=')[1] || null;
  const p = await combatStyleGuard({ mutation: mut });
  for (const s of p) console.error(`  FAIL  ${s}`);
  console.log(p.length ? `combat-style: ${p.length} problem(s)` : 'combat-style: green');
  process.exit(p.length ? 1 : 0);
}
