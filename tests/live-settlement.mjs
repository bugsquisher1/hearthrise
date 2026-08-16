// ════════════════════════════════════════════════════════════════════════
// tests/live-settlement.mjs — PHASE 0 OF LIVE SETTLEMENT, GRADED.
//
//   node tests/live-settlement.mjs             # the guard (engine + SQL)
//   node tests/live-settlement.mjs --engine    # engine half only (fast, no DB)
//   node tests/live-settlement.mjs --mutate    # plant real defects, prove RED
//
// Spec: docs/design/live-settlement.md §0 (finding P3), §2.2, §10 PHASE 0.
//
// ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────
// `computeAccrual` built `state = { monsterHp: 0, monsterMaxHp: 0 }` on every
// call, so every accrual window started a FRESH monster at full HP and threw
// away all damage dealt since the last watermark. Any target whose time-to-kill
// exceeds the window therefore paid ZERO — not less, zero — at every cadence,
// forever. It is also a LIVE under-payment today on every `set_activity`
// collect, because a collect is a window boundary too.
//
// ── WHY THE DRAGON, AND WHY IT IS AN HONEST FIXTURE ─────────────────────
// The measurement needs a fight the window cannot finish, and it needs the
// character to SURVIVE the hour — a fixture that dies mid-span ends the span,
// and every later window is then unpayable, which reads as "the carry did not
// work" when it was only ever the death check (the same trap tools/race-test.mjs
// documents). So SLOW is a real 520 HP dragon against real mediocre offence
// (~488 ticks per kill, about 20 minutes at the honest 2.4 s swing) and a
// player HP pool large enough to outlast the hour. Nothing else is tuned.
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────
//   SETTLE-1   an hour of 90 s windows pays the SAME kills as one 60-minute
//              window (3, not 0), at four cadences. Mutation-proven.
//   SETTLE-1a  a null `fight` input (a database with no column) is byte-for-byte
//              the pre-Phase-0 behaviour, and OMITS the delta key — the
//              self-configuring switch, which is what makes the migration and
//              the deploy safe in either order.
//   SETTLE-1b  a fight is VOIDED by an activity change, in hr_apply, on real
//              PostgreSQL — including a switch back to the SAME monster. This
//              is "can you bank a nearly-dead boss?", answered.
//   SETTLE-1c  hostile `fight` deltas (negative hp, hp above the monster's max,
//              a different monster, a gathering node, a non-integer, an unknown
//              key, a huge kill count) are REFUSED by hr_apply against the
//              GENERATED catalogue — not by the engine, and not clamped.
//   SETTLE-1d  AWAY-1 PARITY: a span that starts at full monster HP produces a
//              byte-identical delta with the fight carry present and absent. A
//              carried fight must be the only divergence.
//   SETTLE-1e  the engine's own fail-closed read guard: a carried fight naming
//              a monster the pointer does not name starts fresh.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { computeAccrual, normaliseFight } from '../supabase/functions/hr-accrue/accrual.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { bootReplay, ROOT } from './schema-replay.mjs';

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

const NOW = Date.UTC(2026, 2, 15, 12, 0, 0);
const HOUR = 3600000;
const TARGET = 'dragon';

/* Mediocre offence, a body that outlasts the hour. See the header for why the
   survival term is a fixture property and not a thumb on the scale. */
const SLOW = {
  activeId: TARGET, hp: 200000, maxHp: 200000,
  skills: { attack: 60000, strength: 60000, defence: 20000000, hitpoints: 40000000 },
};

function mk(fromMs, toMs, seed, fight, over) {
  return {
    userId: '00000000-0000-4000-8000-000000000001', slot: 0,
    nowMs: toMs, accruedToMs: fromMs, activeSinceMs: NOW - HOUR,
    activeKind: 'combat', activeId: TARGET, capMs: 12 * HOUR,
    seed, gold: 0, equipment: {}, items: ITEMS, monsters: MONSTERS, inventory: {},
    autoEatEnabled: false, autoEatFood: null, autoEatPct: 0,
    ...SLOW, fight, ...(over || {}),
  };
}

/* One hour, settled at `slice`, carrying the engine's own end-of-window
   checkpoint forward exactly as hr_apply would store it and hr_state_of would
   return it. The seed VARIES per window because it really does in production —
   hr_seed is salted with `accrue:<accrued_to>` — so this measures the property
   under the real seeding, not under a convenient one. */
function settleHour(slice, fight0) {
  let kills = 0; let gold = 0; let fight = fight0;
  for (let i = 0; i < HOUR / slice; i++) {
    const r = computeAccrual(mk(NOW - HOUR + i * slice, NOW - HOUR + (i + 1) * slice, 43 + i, fight));
    if (!r.accrued) continue;
    kills += r.summary.kills;
    gold += r.delta.gold || 0;
    if (fight0 !== null) fight = r.delta.fight;
  }
  return { kills, gold };
}

// ── SETTLE-1 + 1a + 1e — the engine half ───────────────────────────────────
export function engineGuard() {
  const whole = computeAccrual(mk(NOW - HOUR, NOW, 42, {}));
  ok(whole.accrued === true, 'SETTLE-1: the 60-minute reference window did not accrue');
  ok(whole.summary.died === false,
    'SETTLE-1: the reference fixture DIED inside the hour, so every later window is unpayable and '
    + 'this guard would measure the death check instead of the carry. Fix the fixture, not the test.');
  const ref = whole.summary.kills;
  ok(ref >= 3,
    `SETTLE-1: the reference window pays ${ref} kills. The fixture must be a fight the WINDOW cannot `
    + 'finish and the HOUR can, or there is nothing to carry and the guard is vacuous.');

  const CADENCES = [60000, 90000, 120000, 300000];
  for (const slice of CADENCES) {
    const carried = settleHour(slice, {});
    ok(carried.kills === ref,
      `SETTLE-1: an hour settled every ${slice / 1000}s pays ${carried.kills} kills against the `
      + `60-minute window's ${ref}. A settled span must be the SAME simulation started from a `
      + 'checkpoint — if these differ, the checkpoint is losing or inventing progress.');
    ok(carried.gold > 0,
      `SETTLE-1: an hour settled every ${slice / 1000}s paid ${carried.gold} gold`);

    // SETTLE-1a — THE MUTATION IS BUILT IN. `null` is not a mutant: it is the
    // real behaviour of a database with no `fight` column, and it is exactly
    // the defect. If this ever stops being 0, the carry has become unconditional
    // and the migration/deploy ordering is no longer safe in either order.
    const bare = settleHour(slice, null);
    ok(bare.kills === 0,
      `SETTLE-1a: with no fight column, an hour settled every ${slice / 1000}s pays ${bare.kills} `
      + 'kills. It must pay ZERO — that is the defect being fixed, and a carry that works without '
      + 'the column means the engine is reading state from somewhere it does not own.');
  }

  const noCol = computeAccrual(mk(NOW - HOUR, NOW, 42, null));
  ok(!('fight' in noCol.delta),
    'SETTLE-1a: the engine proposed a `fight` key with no column to write it to. hr_apply answers '
    + 'unknown_delta_key with a 409, which costs the player the whole window — the null input is the '
    + 'switch and it is not being read.');
  const withCol = computeAccrual(mk(NOW - HOUR, NOW, 42, {}));
  ok(withCol.delta.fight && typeof withCol.delta.fight === 'object',
    'SETTLE-1a: with the column present the engine wrote no checkpoint back, so the next window '
    + 'restarts the fight and the column is decoration');

  // SETTLE-1d — PARITY. A span that starts at FULL monster HP must be
  // byte-identical with the carry present and absent. A carried fight is the
  // ONLY thing Phase 0 is allowed to change.
  const stripFight = (r) => {
    const d = { ...r.delta }; delete d.fight;
    return JSON.stringify({ delta: d, summary: r.summary, grantMs: r.grantMs, tickMs: r.tickMs });
  };
  ok(stripFight(noCol) === stripFight(withCol),
    'SETTLE-1d PARITY: a span that starts at full monster HP produced a DIFFERENT delta depending on '
    + 'whether the fight column exists. Phase 0 must be invisible to every span that was already '
    + 'correct — anything else is a balance change wearing a bug-fix label.');

  // ...and the same on the AWAY-1 fixture's shape: a fresh fight, seeded.
  const freshA = computeAccrual(mk(NOW - HOUR, NOW, 777, null, { activeId: 'goblin' }));
  const freshB = computeAccrual(mk(NOW - HOUR, NOW, 777, {}, { activeId: 'goblin' }));
  ok(stripFight(freshA) === stripFight(freshB),
    'SETTLE-1d PARITY: the goblin fixture diverges between a database with and without the fight '
    + 'column, on a span that starts fresh either way');

  // SETTLE-1e — the engine's fail-closed READ guard. A checkpoint naming a
  // monster the pointer does not name must start fresh, not resume.
  const wrongFoe = computeAccrual(mk(NOW - HOUR, NOW, 42, { monster: 'goblin', hp: 1, kills: 0 }));
  ok(stripFight(wrongFoe) === stripFight(withCol),
    'SETTLE-1e: a carried fight naming a DIFFERENT monster was resumed against the current target. '
    + 'It must fail closed and start fresh — otherwise 1 HP of a goblin is 1 HP of a dragon, and the '
    + 'delta key becomes a mint.');
  const resumed = computeAccrual(mk(NOW - HOUR, NOW, 42, { monster: TARGET, hp: 1, kills: 0 }));
  ok(resumed.summary.kills > ref,
    `SETTLE-1e: resuming the CORRECT monster at 1 HP paid ${resumed.summary.kills} kills against a `
    + `fresh window's ${ref}. If it does not pay more, the seeding is not being read at all and the `
    + 'mismatch assertion above is vacuous.');

  // The normaliser refuses every dishonest shape rather than repairing it.
  for (const [what, raw] of [
    ['a negative hp', { monster: TARGET, hp: -5, kills: 0 }],
    ['a zero hp', { monster: TARGET, hp: 0, kills: 0 }],
    ['a fractional hp', { monster: TARGET, hp: 1.5, kills: 0 }],
    ['a non-string monster', { monster: 42, hp: 5, kills: 0 }],
    ['an id with punctuation', { monster: 'dra gon;', hp: 5, kills: 0 }],
    ['an array', [1, 2, 3]],
  ]) {
    const n = normaliseFight(raw);
    ok(n !== null && Object.keys(n).length === 0,
      `SETTLE-1c(engine): normaliseFight repaired ${what} into ${JSON.stringify(n)} instead of `
      + 'reading it as "no fight". A corrupt checkpoint must cost one restarted fight, never become '
      + 'the server\'s opinion of the truth.');
  }
  ok(normaliseFight(null) === null && normaliseFight(undefined) === null,
    'SETTLE-1a: normaliseFight lost the null — the no-column switch depends on it');

  engineGuard.report = [
    `dragon (${MONSTERS[TARGET].hp} hp), 60 min: one window ${ref} kills / ${whole.delta.gold}g · `
    + CADENCES.map((s) => `${s / 1000}s ${settleHour(s, {}).kills}k`).join(' · ')
    + ` · no column ${settleHour(90000, null).kills}k`,
  ];
}

// ── SETTLE-1b + 1c — the SQL half, on real PostgreSQL ──────────────────────
export async function sqlGuard() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) {
    problems.push(`SETTLE-SQL: the migration chain would not apply — ${e.message}`);
    return;
  }
  const uid = '000000fe-0000-4000-a000-0000000000fe';
  await db.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query('insert into profiles(id, display_name) values ($1,$2) '
    + 'on conflict (id) do update set display_name = excluded.display_name', [uid, 'FightProbe']);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const cr = (await db.query('select hr_create_character(0) r')).rows[0].r;
  if (cr.ok !== true) {
    problems.push(`SETTLE-SQL: hr_create_character failed — ${JSON.stringify(cr)}`);
    return;
  }

  let version = Number((await db.query(
    'select version::text v from player_state where user_id=$1 and slot=0', [uid])).rows[0].v);
  let n = 0;
  const apply = async (delta) => {
    await db.exec('set role hr_engine');
    let r;
    try {
      r = (await db.query('select hr_apply($1,0,$2,$3,$4::jsonb) r',
        [uid, version, `00000000-0000-4000-b000-${String(++n).padStart(12, '0')}`,
          JSON.stringify(delta)])).rows[0].r;
    } catch (e) { r = { ok: false, error: '__exception', message: e.message }; }
    await db.exec('reset role');
    if (r && r.ok === true) version += 1;
    return r;
  };
  const fightRow = async () => (await db.query(
    'select fight from player_state where user_id=$1 and slot=0', [uid])).rows[0].fight;

  const MAX = MONSTERS[TARGET].hp;

  // A CONTROL FIRST. Everything below asserts a REFUSAL, and a probe that
  // cannot make an honest call succeed would report a clean bill for a
  // completely broken hr_apply.
  let r = await apply({ activity: { kind: 'combat', id: TARGET, restart: true },
                        journal: { kind: 'combat', intent: 'probe_start' } });
  ok(r && r.ok === true, `SETTLE-SQL control: could not start a fight — ${JSON.stringify(r)}`);
  r = await apply({ fight: { monster: TARGET, hp: Math.floor(MAX / 2), kills: 2 },
                    journal: { kind: 'combat', intent: 'probe_checkpoint' } });
  ok(r && r.ok === true,
    `SETTLE-SQL control: an HONEST checkpoint was refused — ${JSON.stringify(r)}. Every refusal `
    + 'asserted below would then pass for the wrong reason.');
  let stored = await fightRow();
  ok(stored && Number(stored.hp) === Math.floor(MAX / 2) && stored.monster === TARGET
     && Number(stored.kills) === 2,
    `SETTLE-SQL control: the honest checkpoint stored ${JSON.stringify(stored)}`);

  // ── SETTLE-1c — HOSTILE CHECKPOINTS, REFUSED BY THE DATABASE ────────────
  // Each is a forged delta a compromised Edge Function could send. The clamp is
  // re-derived from hr_activities.max_hp under the row lock; nothing here is
  // checked against a maximum the caller supplied.
  const HOSTILE = [
    ['hp above the monster max', { monster: TARGET, hp: MAX + 1, kills: 0 }, 'bad_fight_hp'],
    ['a wildly huge hp', { monster: TARGET, hp: 99999999, kills: 0 }, 'bad_fight_hp'],
    ['a negative hp', { monster: TARGET, hp: -1, kills: 0 }, 'bad_fight_hp'],
    ['a zero hp (a dead monster is not a fight)', { monster: TARGET, hp: 0, kills: 0 }, 'bad_fight_hp'],
    ['a fractional hp', { monster: TARGET, hp: 1.5, kills: 0 }, 'bad_fight_hp'],
    ['a monster that does not exist', { monster: 'ancient_wyrm_of_gold', hp: 1, kills: 0 }, 'unknown_monster'],
    ['a GATHERING node as the monster', { monster: 'normal_tree', hp: 1, kills: 0 }, 'unknown_monster'],
    ['a negative kill count', { monster: TARGET, hp: 5, kills: -1 }, 'bad_fight_kills'],
    ['an absurd kill count', { monster: TARGET, hp: 5, kills: 1e12 }, 'bad_fight_kills'],
    ['an unknown key', { monster: TARGET, hp: 5, kills: 0, xp: 999999 }, 'bad_fight'],
    /* ── OMISSION (Security F2, 2026-08-16) ─────────────────────────────
       These two were ACCEPTED before the presence test, and the reason is pure
       three-valued logic: `jsonb_typeof(v_fight->'hp')` of an absent key is SQL
       NULL, `NULL <> 'number'` is NULL, and a disjunction of NULLs is NULL — so
       the type gate never fired, and then `(v_fight->>'hp')::numeric` was NULL
       too, so every comparison in the CEILING CHECK was NULL and the clamp was
       skipped entirely. A checkpoint with NO HP AT ALL was stored. It happened
       to be an under-payment rather than a mint only because normaliseFight
       independently refuses a missing hp on the read side — i.e. the database's
       gate was decorative and the Edge Function was the only thing holding,
       which is the exact inversion of this file's posture. A gate that admits
       by omission is not a gate. */
    ['NO hp key at all', { monster: TARGET, kills: 0 }, 'bad_fight'],
    ['NO kills key at all', { monster: TARGET, hp: 5 }, 'bad_fight'],
    ['only a monster', { monster: TARGET }, 'bad_fight'],
    ['a string hp', { monster: TARGET, hp: '5', kills: 0 }, 'bad_fight'],
    ['an array instead of an object', [1, 2], 'bad_fight'],
    ['a scalar instead of an object', 7, 'bad_fight'],
  ];
  for (const [what, fight, code] of HOSTILE) {
    const before = await fightRow();
    const res = await apply({ fight, journal: { kind: 'combat', intent: 'probe_hostile' } });
    ok(res && res.ok === false && res.error === code,
      `SETTLE-1c: hr_apply accepted ${what} (${JSON.stringify(fight)}) — got `
      + `${JSON.stringify(res)}, expected error '${code}'. The engine's proposal must be CHECKED, `
      + 'not trusted: a forged 1 HP on the highest-value boss kills it on the first swing of every '
      + 'window, forever.');
    const after = await fightRow();
    ok(JSON.stringify(before) === JSON.stringify(after),
      `SETTLE-1c: ${what} was refused but the stored fight CHANGED (${JSON.stringify(before)} -> `
      + `${JSON.stringify(after)}). A rejected delta must roll back whole.`);
  }

  // ── SETTLE-1b — THE VOID. "Can you bank a nearly-dead boss?" ────────────
  // Arm the exploit properly: one HP off the highest-value target this fixture
  // can name, stored and confirmed.
  r = await apply({ fight: { monster: TARGET, hp: 1, kills: 9 },
                    journal: { kind: 'combat', intent: 'probe_bank' } });
  ok(r && r.ok === true, `SETTLE-1b: could not arm the bank — ${JSON.stringify(r)}`);
  stored = await fightRow();
  ok(stored && Number(stored.hp) === 1,
    `SETTLE-1b: the 1 HP bank did not store (${JSON.stringify(stored)}), so the void below proves `
    + 'nothing');

  const VOIDS = [
    ['switching to another monster', { kind: 'combat', id: 'goblin', restart: true }],
    ['switching to a gathering node', { kind: 'gather', id: 'normal_tree', restart: true }],
    ['going idle', { kind: 'idle', id: null }],
    // THE ONE A DELTA-ONLY RULE WOULD MISS, and the exploit as actually stated:
    // re-declaring the SAME target. The post-state check cannot see this (the
    // row still says dragon), so it is the `p_delta ? 'activity'` arm alone that
    // refuses it — which is why both arms exist.
    ['re-declaring the SAME monster', { kind: 'combat', id: TARGET, restart: true }],
  ];
  for (const [what, activity] of VOIDS) {
    // Re-arm each time, so each case is tested against a real banked fight.
    await apply({ activity: { kind: 'combat', id: TARGET, restart: true },
                  journal: { kind: 'combat', intent: 'probe_rearm' } });
    await apply({ fight: { monster: TARGET, hp: 1, kills: 9 },
                  journal: { kind: 'combat', intent: 'probe_rearm2' } });
    const armed = await fightRow();
    ok(armed && Number(armed.hp) === 1, `SETTLE-1b: could not re-arm before "${what}"`);

    const res = await apply({ activity, journal: { kind: 'combat', intent: 'probe_switch' } });
    ok(res && res.ok === true, `SETTLE-1b: the switch (${what}) was refused — ${JSON.stringify(res)}`);
    const after = await fightRow();
    ok(after && Object.keys(after).length === 0,
      `SETTLE-1b: ${what} did NOT void the banked fight — player_state.fight is still `
      + `${JSON.stringify(after)}. That is the exploit: bank a nearly-dead boss, switch away, switch `
      + 'back, and finish it on the first swing. It must be voided on any activity change, including '
      + 'a switch back to the same target.');
  }

  // ...and the SAME delta carrying both keys cannot beat it. This is the
  // reason the `activity` arm is FIRST and unconditional in the CASE.
  await apply({ activity: { kind: 'combat', id: TARGET, restart: true },
                journal: { kind: 'combat', intent: 'probe_rearm3' } });
  r = await apply({ activity: { kind: 'combat', id: TARGET, restart: true },
                    fight: { monster: TARGET, hp: 1, kills: 0 },
                    journal: { kind: 'combat', intent: 'probe_combined' } });
  ok(r && r.ok === true, `SETTLE-1b: the combined delta was refused — ${JSON.stringify(r)}`);
  stored = await fightRow();
  ok(stored && Object.keys(stored).length === 0,
    'SETTLE-1b: a delta carrying BOTH `activity` and `fight` kept the fight '
    + `(${JSON.stringify(stored)}). The activity arm must win unconditionally, or the void is one `
    + 'extra delta key away from being bypassed.');

  // ── SETTLE-1f — THE INTENT KEY IS NOT BRICKED BY A REFUSAL (Security F3) ─
  // The accrual engine DERIVES its intent key from (user, slot, watermark,
  // version, salt). A `bad_fight_hp` moves neither the watermark nor the
  // version, so an honest retry re-derives a BYTE-IDENTICAL key — and a stored
  // rejection is replayed, not re-evaluated, until hr_intents_prune runs up to
  // 25 hours later. The trigger is routine rather than hostile: raise a
  // monster's HP in the payload before re-applying the catalogue and every
  // player on that monster is frozen for a day, with re-applying the catalogue
  // NOT unfreezing them. This asserts the SAME KEY works afterwards.
  {
    await apply({ activity: { kind: 'combat', id: TARGET, restart: true },
                  journal: { kind: 'combat', intent: 'probe_brick_setup' } });
    const key = '00000000-0000-4000-c000-00000000beef';
    const raw = async (v, delta) => {
      await db.exec('set role hr_engine');
      let out;
      try {
        out = (await db.query('select hr_apply($1,0,$2,$3,$4::jsonb) r',
          [uid, v, key, JSON.stringify(delta)])).rows[0].r;
      } catch (e) { out = { ok: false, error: '__exception', message: e.message }; }
      await db.exec('reset role');
      return out;
    };
    // 1. The refusal, on a freshly claimed key.
    const bad = await raw(version, { fight: { monster: TARGET, hp: MAX + 500, kills: 0 },
                                     journal: { kind: 'combat', intent: 'probe_brick' } });
    ok(bad && bad.ok === false && bad.error === 'bad_fight_hp',
      `SETTLE-1f: the setup refusal did not fire — ${JSON.stringify(bad)}; the retry below would `
      + 'then prove nothing');
    // 2. THE SAME KEY, an honest delta — exactly what a retry re-derives.
    const retry = await raw(version, { fight: { monster: TARGET, hp: 7, kills: 1 },
                                       journal: { kind: 'combat', intent: 'probe_brick' } });
    ok(retry && retry.ok === true,
      'SETTLE-1f: a bad_fight_hp rejection BRICKED the intent key — the honest retry on the same '
      + `derived key answered ${JSON.stringify(retry)} instead of succeeding. The engine cannot `
      + 'change that key (it is derived from an unmoved watermark and version), so the character is '
      + 'frozen until hr_intents_prune, up to 25 hours. Release the bad_fight* class in '
      + 'c_release_codes exactly as version_conflict is released.');
    if (retry && retry.ok === true) version += 1;
    const after = await fightRow();
    ok(after && Number(after.hp) === 7,
      `SETTLE-1f: the retry reported ok but stored ${JSON.stringify(after)} — a released key must be `
      + 'a genuine first run, not a replayed envelope');
  }

  // ── THE CEILING IS REAL, AND IT IS THE GENERATED ONE, FOR EVERY MONSTER ──
  // Security F4: one sample is not a verdict. `dragon` alone would not notice a
  // generator that emitted the wrong field, an off-by-one on a tier, or a
  // monster added to src/data with no ceiling — and the clamp is only as good
  // as the id it is looked up by.
  {
    const rows = (await db.query(
      "select activity_id, max_hp from hr_activities where kind='combat'")).rows;
    const inDb = new Map(rows.map((r) => [r.activity_id, r.max_hp === null ? null : Number(r.max_hp)]));
    const authored = Object.keys(MONSTERS);
    ok(authored.length > 50,
      `SETTLE-1c: only ${authored.length} authored monsters — the sweep would be near-vacuous`);
    ok(inDb.size === authored.length,
      `SETTLE-1c: hr_activities has ${inDb.size} combat rows against ${authored.length} authored `
      + 'monsters. A monster with no row cannot be fought; a row with no monster is a ceiling for '
      + 'something that does not exist.');
    const mismatched = [];
    for (const id of authored) {
      if (inDb.get(id) !== Math.trunc(Number(MONSTERS[id].hp))) {
        mismatched.push(`${id}: db ${inDb.get(id)} vs authored ${MONSTERS[id].hp}`);
      }
    }
    ok(mismatched.length === 0,
      `SETTLE-1c: ${mismatched.length} of ${authored.length} combat ceilings disagree with `
      + `src/data/monsters.js — ${mismatched.slice(0, 3).join('; ')}. The re-clamp IS this number, so `
      + 'a drift silently widens or narrows it for those monsters, and a raise deployed to the '
      + 'payload before the catalogue is re-applied 409s every window for them.');
    sqlGuard.report = [`ceiling parity: ${authored.length}/${authored.length} combat ids match `
      + `src/data/monsters.js (max ${Math.max(...authored.map((i) => MONSTERS[i].hp))} hp)`];
  }
  const nulls = (await db.query(
    "select count(*)::int n from hr_activities where kind='combat' and max_hp is null")).rows[0].n;
  ok(nulls === 0,
    `SETTLE-1c: ${nulls} combat activities carry no max_hp — the clamp is vacuous for them`);

  // ── NO CLIENT MAY WRITE ANY OF THIS ─────────────────────────────────────
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const can = (await db.query(
      "select has_function_privilege($1,'public.hr_apply(uuid,integer,bigint,uuid,jsonb)','execute') c",
      [role])).rows[0].c;
    ok(can === false, `SETTLE-SQL: hr_apply is executable by ${role} — that is the whole game`);
  }
  const pol = (await db.query(
    "select count(*)::int n from pg_policies where schemaname='public' and tablename='player_state' "
    + "and cmd in ('INSERT','UPDATE','DELETE','ALL')")).rows[0].n;
  ok(pol === 0, `SETTLE-SQL: ${pol} client write policies on player_state — a client could author `
    + 'its own fight state');
}

// ── The derivation is not hand-edited ──────────────────────────────────────
export async function derivationGuard() {
  const order = JSON.parse(await readFile(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8'));
  ok(order.order[order.order.length - 1] === '2026-08-17-fight-carry.sql',
    'SETTLE-SQL: 2026-08-17-fight-carry.sql is not LAST in the apply order. It is the last toucher of '
    + 'hr_apply AND hr_state_of; a file applied after it silently deletes the whole carry while every '
    + 'self-check still passes.');
  const sql = await readFile(
    join(ROOT, 'supabase', 'migrations', '2026-08-17-fight-carry.sql'), 'utf8');
  for (const term of ['hr_activities', 'bad_fight_hp', "when p_delta ? 'activity' then '{}'::jsonb",
    'player_state_fight_object', 'v_fight_max',
    "v_fight ? 'monster' and v_fight ? 'hp' and v_fight ? 'kills'",   // F2
    'any (c_release_codes)']) {                                       // F3
    ok(sql.includes(term), `SETTLE-SQL: the migration no longer contains "${term}"`);
  }
  /* Security F5 — THE STANDING RULE MUST BE WRITTEN WHERE THE OPERATOR LOOKS.
     A monster's hp is now a deploy-order dependency, and an ordering rule that
     lives only in a review thread is an ordering rule nobody follows at 2am. */
  ok(/STANDING RULE — A MONSTER'S HP IS NOW A DEPLOY-ORDER DEPENDENCY/.test(sql),
    'SETTLE-SQL: the migration header no longer states the standing ship-order rule (catalogue '
    + 're-apply BEFORE the Edge payload). Raising a monster\'s hp payload-first 409s every combat '
    + 'window for that monster.');
  const notes = JSON.parse(await readFile(
    join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8'))._order_notes || {};
  ok(/monsters\.js/.test(notes['2026-08-17-fight-carry.sql'] || ''),
    'SETTLE-SQL: _order_notes for the fight-carry migration no longer names the src/data/monsters.js '
    + 'deploy-order dependency — the apply order is where the operator reads what must run first');
}

export async function runAll({ engineOnly = false } = {}) {
  problems.length = 0;
  engineGuard();
  await derivationGuard();
  if (!engineOnly) await sqlGuard();
  return problems.slice();
}

// ── The mutation harness — a guard that cannot fail is not a guard ─────────
const MUTANTS = [
  {
    id: 'no-seed',
    what: 'the engine ignores the carried checkpoint (the shipped defect)',
    file: 'supabase/functions/hr-accrue/accrual.js',
    from: '    monsterHp: resumed ? resumed.hp : 0,',
    to: '    monsterHp: 0,',
  },
  {
    id: 'no-emit',
    what: 'the engine never writes a checkpoint back',
    file: 'supabase/functions/hr-accrue/accrual.js',
    from: '  if (fight0) {\n    const alive',
    to: '  if (false) {\n    const alive',
  },
  {
    id: 'unconditional-carry',
    what: 'the carry ignores the no-column switch',
    file: 'supabase/functions/hr-accrue/accrual.js',
    from: '  const fight0 = normaliseFight(inp.fight);',
    to: '  const fight0 = normaliseFight(inp.fight) || {};',
  },
  {
    id: 'trusting-foe',
    what: 'the read guard drops the monster-id agreement',
    file: 'supabase/functions/hr-accrue/accrual.js',
    from: "  const resumed = (fight0 && fight0.monster === inp.activeId",
    to: '  const resumed = (fight0 && fight0.monster',
  },
  {
    id: 'no-void',
    what: 'an activity change no longer voids the banked fight',
    file: 'supabase/migrations/2026-08-17-fight-carry.sql',
    from: "           fight        = case when p_delta ? 'activity' then '{}'::jsonb\n",
    to: '           fight        = case when false then \'{}\'::jsonb\n',
  },
  {
    id: 'no-hp-ceiling',
    what: 'the hp upper bound is dropped (a forged 1-HP boss becomes legal at any value)',
    file: 'supabase/migrations/2026-08-17-fight-carry.sql',
    from: "           or (v_fight->>'hp')::numeric > v_fight_max then",
    to: "           or false then",
  },
  {
    /* Security F2. Reinstates the SHIPPED hole exactly: without the presence
       test, jsonb_typeof of an absent key is NULL and the whole gate — type AND
       ceiling — is skipped by three-valued logic. */
    id: 'no-presence-test',
    what: 'the key-presence test is dropped, so an omitted hp skips the whole ceiling check',
    file: 'supabase/migrations/2026-08-17-fight-carry.sql',
    from: "        if not (v_fight ? 'monster' and v_fight ? 'hp' and v_fight ? 'kills') then",
    to: '        if false then',
  },
  {
    /* Security F3. Reinstates the shipped narrow release. */
    id: 'narrow-release',
    what: 'only version_conflict releases the intent key, so bad_fight_hp bricks it for ~25h',
    file: 'supabase/migrations/2026-08-17-fight-carry.sql',
    from: "     and v_out->>'error' = any (c_release_codes) then",
    to: "     and v_out->>'error' = 'version_conflict' then",
  },
  {
    id: 'no-monster-lookup',
    what: 'the monster ceiling is not looked up at all, so any id is admitted',
    file: 'supabase/migrations/2026-08-17-fight-carry.sql',
    from: '        if v_fight_max is null then',
    to: '        v_fight_max := 999999999;\n        if false then',
  },
];

/* ⚠ EACH MUTANT RUNS IN A CHILD PROCESS, and that is not a style choice. The
   first draft re-imported this module through a cache-busting URL — which busts
   THIS module's cache and not `accrual.js`'s, so every engine mutant ran
   against the ORIGINAL engine still resident in the module registry and
   reported SLIPPED. Four real, correctly-planted defects graded as undetectable
   by a harness that never loaded them: the "planted bug that was never planted"
   family, one level up. A fresh process has a fresh registry, and the SQL
   mutants need one anyway because bootReplay caches nothing across a run. */
async function mutate() {
  const { writeFile } = await import('node:fs/promises');
  const { spawnSync } = await import('node:child_process');
  const { snapshot, assertNoResidue, noteDirtyTree, finish } = await import('./mutation-safety.mjs');
  let bad = 0;
  /* THE SAME HAZARD THIS HARNESS'S NEIGHBOUR SHIPPED, closed before it could
     produce the same incident. A `finally` covers a throw; it does not cover a
     SIGTERM from a harness timeout, which is exactly how artisan-accrual's M1
     left an item-duplication bug in the deployed accrual engine on 2026-08-16.
     Two of the mutants below edit that SAME file, and one edits the migration
     hr_apply is generated from. See tests/mutation-safety.mjs. */
  assertNoResidue(MUTANTS.map((m) => ({ file: join(ROOT, m.file), from: m.from, to: m.to })));
  noteDirtyTree([...new Set(MUTANTS.map((m) => m.file))], { cwd: ROOT });
  for (const m of MUTANTS) {
    const path = join(ROOT, m.file);
    const original = snapshot(path);
    const hits = original.split(m.from).length - 1;
    if (hits !== 1) {
      console.log(`  ! ${m.id}: anchor matched ${hits} times, must match 1 — the mutant is not being `
        + 'planted, so its "caught" verdict would be meaningless');
      bad++;
      continue;
    }
    const mutated = original.replace(m.from, m.to);
    if (mutated === original) {
      console.log(`  ! ${m.id}: the patch changed nothing`);
      bad++;
      continue;
    }
    await writeFile(path, mutated, 'utf8');
    let out;
    try {
      out = spawnSync(process.execPath,
        [join(ROOT, 'tests', 'live-settlement.mjs'), ...(m.file.endsWith('.sql') ? [] : ['--engine'])],
        { encoding: 'utf8', timeout: 900000 });
    } finally {
      await writeFile(path, original, 'utf8');
    }
    const caught = out.status !== 0;
    if (caught) {
      const n = (out.stdout || '').split('\n').filter((l) => l.startsWith('  x ')).length;
      console.log(`  ✓ ${m.id} CAUGHT (${n || '?'}) — ${m.what}`);
    } else { console.log(`  ✗ ${m.id} SLIPPED — ${m.what}`); bad++; }
  }
  return bad;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--mutate')) {
    console.log('Live-settlement Phase 0 — mutation harness:');
    const bad = await mutate();
    // Restores, RE-HASHES against the pre-mutation snapshot, and exits 3 naming
    // the file if anything is still mutated.
    (await import('./mutation-safety.mjs')).finish(bad ? 1 : 0);
  }
  const found = await runAll({ engineOnly: process.argv.includes('--engine') });
  if (found.length) {
    console.log('Live settlement Phase 0 — FAILED:');
    for (const p of found) console.log('  x ' + p);
    process.exit(1);
  }
  console.log('Live settlement Phase 0 — the in-flight fight is server state, carried and re-clamped.');
  for (const line of engineGuard.report || []) console.log(`  ${line}`);
  /* Printed on every run, deliberately: the ceiling-parity count is the number
     that tells an operator the catalogue and src/data still agree, and a number
     nobody sees is a number nobody notices moving. */
  for (const line of sqlGuard.report || []) console.log(`  ${line}`);
}
