#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-sessions-settle.mjs — HUNT SESSIONS, THE SETTLE (lane C2,
// ruling HR-2026-10-14 §2 / §4 / §5 row C2).
//
//   node tests/hunt-sessions-settle.mjs            the guard
//   node tests/hunt-sessions-settle.mjs --mutate   every planted defect must be CAUGHT
//
// The settle is ./supabase/functions/hr-accrue/hunt-settle.js (read → engine →
// hr_hunt_apply). The DB arms drive THOSE exported pieces against the real
// replayed chain (PGlite, as the hr_engine role), choosing each window's end
// the way the world tick's clock would — so the guard grades the bytes that
// deploy, not a transcription.
//
// ARMS
//   TICK-2     (a) source: nothing under hr-accrue/** reaches the attended
//              kill read or hr_credit_kills; the hunt settle (hunt-settle.js,
//              hunt-seed.js, accrual.js accrueCombat) carries no `away` key,
//              no ctx.away read, no presence/cap/horizon read and no away
//              receipt (gathering KEEPS the receipt until lane G — swap then
//              delete — so it is not forbidden repo-wide).
//              (b) behaviour: a hunt window is byte-identical under every
//              presence- and away-era input (accrued_to, active_since, the
//              offline cap, the live combat-XP watermark, Auto-Eat, stance,
//              stop rules, the Retreat counter, the attended ledger).
//   SEED       the per-swing seed is HMAC-SHA256 keyed by the session's 64-bit
//              secret: equal to an independent reference, distinct per swing /
//              session / secret, and two secrets whose TEXT collides under the
//              32-bit FNV-1a mix it replaced still seed differently; an
//              unseeded swing is refused.
//   MAXHP      a hitpoints level-up never LOWERS max HP (the FX-4 root cause).
//   KNOCKOUT   a hunt window wholly inside `recovering_until` earns nothing and
//              half inside earns about half: exploit R1's door is the engine.
//   VIGOUR     Vigour bounds no hunt (designer ruling, 2026-10-14 loop check:
//              "no cap on combat"): a hunt with the day's meter spent — or far
//              past it — settles byte-identically to one with a full meter (no
//              end, no 0.25x tail); 'vigour' is in no end order.
//   STAMINA-RULE  the pool (Tyler 2026-10-14, "1:1 like Huntera", 12 h): a
//              hunting interval drains 1:1 to 0, a resting one rests 1:1 to the
//              cap (never down to it); a pool of five swings ends the hunt
//              `stamina` after five; the client reader takes the server's value.
//   STAMINA    through the database: a stamina-bound hunt settled on the tick
//              cadence and at a client's odd instants writes the same rows and
//              ends `stamina` at 0; knocked-out time rests the pool (end = start
//              − paid + down); an undrained pool, unbacked knocked-out time, a
//              missing pool and an unproven `stamina` end are refused; the
//              envelope projects the row; an empty pool cannot enter a hunt and
//              a rested one can; the cap row equals the data file.
//   BUY-RULE   NPC basic supplies (Tyler 2026-10-14): a heal the bag lacks is
//              bought from the purse, crafted stock first; a buy the purse
//              cannot cover ends the hunt `gold_out` at the next boundary; a
//              priced arrow is bought per shot until the purse is dry.
//   BUY        through the database, both paths: priced heals bought on the tick
//              cadence and at a client's instants write the same rows; every
//              unit is journalled once at the catalogue price, the gold moved
//              is exactly coins − supply_gold, the tally's Waste carries it;
//              a hunt the purse cannot keep ends `gold_out` (proved).
//   RESUME     an automatic end sends the character back to its last non-hunt
//              activity after the walk home, identically on both paths; a
//              level-locked one leaves it idle; a manual leave resumes nothing.
//   ACTIONBAR  Huntera's bar: 20 slots (21 refused), a `spell` slot refused by
//              name, self_mana_pct accepted and false without a mana pool; an
//              action set's target mode / pull count stored, refused out of
//              range, read by the settle and clamped by the engine.
//   DEATHXP-RULE  the price of a fall (Tyler 2026-10-14): DEATH_XP_LOSS of the
//              level's gap, from in-level progress only, never a de-level.
//   DEATHXP    end to end: fall events state their price, one death_xp row per
//              costly settle, bank = start + gains − price, the row equals the
//              data file; an over-charge / below-start / missing price is refused.
//   FENCE      a hunter is never priced by the old path: the engine answers
//              hunt_open; the database refuses a bare combat accrue row.
//   FRESH      the balance floor (gather review finding 5, master plan M3 "a
//              fresh hero is fighting by 0:02"): a character straight from
//              hr_create_character — the real START_KIT, its default bar, the
//              kit's cooked shrimp in the bag — hunts Mill Cellar for an hour
//              through the real settle (flat knockout, 40% resume, the spawn
//              cycle) and falls fewer than FRESH_MAX_FALLS_PER_H times an hour
//              of hunting and the kit carries the hunt at least FRESH_MIN_MINUTES
//              before any automatic end, on every seed. The numbers are printed.
//   TICK-1     N world-tick windows (90 s) == ONE span, through the database:
//              tally, bag, the character (gold, xp, inventory, hp, max hp,
//              buffs, recovery, fight), the session clock — with heals and a
//              Feast fired by the action bar.
//   BOTH-PATH  a death with a client connected (settles at irregular instants,
//              as hunt_settle / a collect cut them) writes the SAME rows as a
//              death with none (tick windows only): the death rows, the fall
//              and end events, the tally, the bag, the end.
//   TALLY      tally = Σ ledger rows stamped with the session (coins, kills,
//              deaths, xp, loot, supplies); bag loaded = left + used.
//   PRESS      a press lands at the first swing boundary at or after it and
//              never before; with nothing in the bag it is refused bag_empty.
//   END        a bag that runs dry ends the hunt heals_out at its boundary, the
//              pointer goes idle and the `ended` event is journalled.
//   TICK-0     cron to edge: hr_tick_cron_run leases the due session and queues
//              its own `hunts` body; the shipped runTick settles from that body
//              over the real driver — one stamped accrue row, the clock
//              advanced, a malformed selector dropped, a selector naming
//              another session skipped by name.
//   BESTIARY   NO LADDER PRICES A FIGHT (closed rebuild, lane C2: the charm and
//              trophy combat multipliers are deleted): 20,000 counted kills of
//              every spawn pay EXACTLY what none do.
//   RESUME-LINE  the first swing after a knockout lands exactly on the line, to
//              the tick (opening knocked out, cut mid-knockout, inside one
//              window), and a fall is never a free heal.
//   QUIVER     every loosed shot is one arrow out of the bag; a 40-arrow bag
//              fires 40 and ends ammo_out.
//   PARITY     the tick's door, the player's settle door and the composed
//              pieces write the SAME rows for the same window.
//   HEAL       every heal supply heals exactly ITEMS[id].heals, costs one from
//              the bag, and never fires on a body.
//   SLOT       a slot-1 hunt's settle binds every read and write to slot 1.
//   XPDOOR     the client's combat-XP door (hr_credit_combat_xp) pays nothing:
//              hunt_open for a hunter, an empty window for an idle character.
//
// RETIRED GUARDS. --mutate also plants the faults of the guards the closed
// rebuild deleted (world-tick-combat-parity, -resume-alignment, -maxhp-carry,
// -probe-bar, -bestiary-parity, sec-world-tick-m3-seed-label,
// attended-loot-credit, combat-xp-settle-first/-split, accrual-engine's away
// arms), each tagged [guard] in its name; the named arm is the replacement.
// ════════════════════════════════════════════════════════════════════════
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import { SHIM_CRYPTO, SHIM_VAULT, SHIM_NET } from './world-tick-token-shims.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
/* --closed: replay and run every arm with the game CLOSED (hr_flags.closed_mode
   on, as production has been since 2026-10-15 02:25), so a probe or fixture
   that only passes in an open game is caught before an apply. */
const CLOSED = process.argv.includes('--closed');
/* The fixture hunter's account. Closed, it is what an admitted account is in
   production: on the allowlist (everyone else stays refused). */
async function newUser(db) {
  await db.query('insert into auth.users (id) values ($1)', [UID]);
  if (CLOSED) {
    await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'hunt-sessions-settle --closed')
                    on conflict (user_id) do nothing`, [UID]);
  }
}
const FN = join('supabase', 'functions', 'hr-accrue');

async function loadEdge(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return {
    HS: await import(u(join(FN, 'hunt-settle.js'))),
    AC: await import(u(join(FN, 'accrual.js'))),
    SEED: await import(u(join(FN, 'hunt-seed.js'))),
    TR: await import(u(join(FN, 'tick-reads.js'))),
    IN: await import(u(join(FN, 'intents.js'))),
    REQ: await import(u(join(FN, 'request.js'))),
    TK: await import(u(join(FN, 'tick.js'))),
    HSD: await import(u('src/data/hunt-sessions.js')),
    /* The client reader is read from the REAL tree (the mutant copies hold only
       the edge, src/core and src/data). */
    NET: await import(pathToFileURL(join(ROOT, 'src', 'net', 'accrue.js')).href),
    HUNTS: await import(u('src/data/hunts.js')),
    AR: await import(u('src/core/action-rules.js')),
    XP: await import(u('src/core/xp.js')),
    RS: await import(u('src/data/rule-subjects.js')),
    C: await import(u('src/core/combat.js')),
    MONSTERS: (await import(u('src/data/monsters.js'))).MONSTERS,
    ITEMS: (await import(u('src/data/items.js'))).ITEMS,
    root,
  };
}

const canon = (v) => {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
};
const firstDiff = (a, b) => {
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  return `at char ${i}: …${a.slice(Math.max(0, i - 80), i + 80)}… vs …${b.slice(Math.max(0, i - 80), i + 80)}…`;
};
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');

// ═══════════════════════════════════════════════════════════════════════
// ENGINE ARMS (no database)
// ═══════════════════════════════════════════════════════════════════════
const T0 = Date.UTC(2026, 9, 14, 12, 0, 0);
const SID = '00000000-0000-4000-8000-0000000c2e01';
const SECRET = '-4611686018427387904';

function huntInput(M, extra) {
  const hs = M.AR.newHuntSession({ id: SID, huntFromMs: T0, nextSwingAtMs: T0,
    bag: { cooked_shrimp: { loaded: 20, left: 20 }, hunters_feast: { loaded: 2, left: 2 } },
    slots: [M.RS.DEFAULT_PRESET.slots[0],
      { item: 'hunters_feast', on: true, conditions: [{ subject: 'buff_missing:drop_rate' }] }],
    fallsLimit: 6 });
  return Object.assign({
    userId: '00000000-0000-4000-8000-0000000c2eaa', slot: 0, nowMs: T0 + 900000,
    activeKind: 'combat', activeId: 'mill_cellar', activeSinceMs: T0 - 1000, accruedToMs: T0,
    hp: 10, maxHp: 10, gold: 0, skills: { attack: 1200, strength: 1200, defense: 1200, hitpoints: 1200 },
    inventory: {}, equipment: {}, fight: {}, recoveringUntilMs: 0, consecFalls: 0,
    deathsTodayBefore: 0, deathsLifetimeBefore: 0, buffs: [],
    vigour: { budget_min: 720, spent_min: 0, day_key: '2026-10-14' },
    monsters: M.MONSTERS, items: M.ITEMS, huntSession: hs,
    huntWindow: { fromMs: T0, toMs: T0 + 900000 }, huntSecret: SECRET,
  }, extra || {});
}

const ENGINE_ARMS = {
  'TICK-2': async (M) => {
    const problems = [];
    // (a) THE SOURCE.
    const dir = join(M.root, FN);
    /* DELETED OUTRIGHT (closed rebuild, lane C2; ruling §3): the attended
       kill credit, the away receipt, Vigour, Auto-Eat, stances and the Retreat,
       the charm / trophy / Boss-of-the-Day multipliers, companion XP, the party
       fence and tick, and the claim_reward / enchant / dungeon_settle /
       quartermaster_buy verbs. No edge file may name one in CODE again. */
    const gone = new RegExp(['hr_attended_kills', 'hr_credit_kills', 'ATTENDED_MAX_FIDELITY', 'attendedKillCap',
      'away-receipt', 'withAwayReceipt', 'receiptRescue', 'last_away_receipt', 'hr_vigour_of', 'vigourCharge',
      'VIGOUR_', 'autoEatEnabled', 'resolveAutoEat', 'auto_eat_', 'huntStance', 'hunt_stance', 'evaluateStop',
      'consec_falls', 'retreatAtFall', 'killBonusesFor', 'charmIndex', 'killsByClass', 'trophyIndex',
      'readTickBestiary', 'companionXpBacked', 'COMPANION_XP_SERVER_BACKED', 'partyIntentFence', 'tick-party',
      'tick-combat', 'claim-reward', 'dungeon-settle', 'quartermaster-buy', 'runEnchant'].join('|'));
    for (const f of readdirSync(dir).filter((n) => /\.(js|ts)$/.test(n))) {
      const code = stripComments(readFileSync(join(dir, f), 'utf8'));
      const m = code.match(gone);
      if (m) problems.push(`${f} still names \`${m[0]}\` in code (deleted outright with the closed rebuild)`);
    }
    const receipt = /away-receipt|withAwayReceipt|receiptRescue|awayReceiptFor|last_away_receipt/;
    const presence = /\baway\b|presence|last_seen|capMs|cap_ms|hr_accrue_cap_ms|hr_offline_cap_ms|return_anchor|horizon/;
    for (const f of ['hunt-settle.js', 'hunt-seed.js']) {
      const code = stripComments(readFileSync(join(dir, f), 'utf8'));
      const m = code.match(presence) || code.match(receipt);
      if (m) problems.push(`${f} reads \`${m[0]}\` — the hunt settle may not consult presence, a cap, ctx.away or the away receipt (TICK-2)`);
    }
    const acc = stripComments(readFileSync(join(dir, 'accrual.js'), 'utf8'));
    const i = acc.indexOf('function accrueHunt(');
    const j = acc.indexOf('\nfunction ', i + 10);
    const body = i >= 0 ? acc.slice(i, j > i ? j : undefined) : '';
    if (!body) problems.push('accrual.js has no accrueHunt — the hunt body moved; re-point TICK-2');
    for (const re of [/\baway\s*:/, /ctx\.away/, /\.away\b/, /inp\.capMs/, /presence|last_seen|horizon|return_anchor/, receipt]) {
      const m = body.match(re);
      if (m) problems.push(`accrueHunt (the hunt body) contains \`${m[0]}\` — a hunt reads no ctx.away and no presence (TICK-2)`);
    }
    // (b) THE BEHAVIOUR: presence / away-era inputs are inert for a session.
    const base = M.AC.computeAccrual(huntInput(M));
    if (!base.accrued || !base.hunt) problems.push(`the reference hunt window did not settle (${base.reason})`);
    const variants = {
      accruedToMs: T0 - 7200000, activeSinceMs: T0 - 86400000, capMs: 1, combatXpAccruedToMs: T0 + 600000,
      autoEatEnabled: true, autoEatPct: 90, autoEatFood: 'cooked_shrimp', huntStance: 'careful',
      huntStop: { rules: [{ rule: 'hours', value: 1 }] }, consecFalls: 5,
      attended: { ok: true, from: new Date(T0).toISOString(), to: new Date(T0 + 900000).toISOString(), total: 999, kills: { rat: 999 } },
      lastSeenAt: new Date(T0).toISOString(), caller: 'collect',
    };
    for (const [k, v] of Object.entries(variants)) {
      const out = M.AC.computeAccrual(huntInput(M, { [k]: v }));
      const a = canon({ d: base.delta, h: base.hunt, b: base.huntBuffs });
      const b = canon({ d: out.delta, h: out.hunt, b: out.huntBuffs });
      if (a !== b) problems.push(`the hunt window moved when \`${k}\` changed — a session read a presence/away-era input ${firstDiff(a, b)}`);
    }
    return problems;
  },

  SEED: async (M) => {
    const problems = [];
    const f = M.SEED.swingSeederFor(SECRET, SID);
    const ref = (secret, sid, i) => {
      /* architecture contracts S2: the label carries a DOMAIN — `s` for a swing. */
      const d = createHmac('sha256', 'hearthrise:hunt-swing:v1:' + secret).update(`hunt:${sid}:s:${i}`, 'utf8').digest();
      return d.readUInt32BE(0);
    };
    for (const i of [0, 1, 2, 77, 123456]) {
      if (f(i) !== ref(SECRET, SID, i)) problems.push(`swing ${i}: the seeder is not HMAC-SHA256(secret, 'hunt:<instance>:s:<i>')`);
    }
    /* THE DOMAINS ARE SEPARATE STREAMS: the same instance and index in another
       domain (gather `g`, a cast lane `c:<lane>`, a roll `r`) is another seed, and
       a domain outside the vocabulary is refused rather than hashed. */
    const all = M.SEED.seederFor(SECRET, SID);
    if (all('s', 7) !== f(7)) problems.push('the swing seeder is not the `s` domain of the instance seeder');
    const per = new Set(['s', 'g', 'r', 'c:offense', 'c:heal_spell'].map((d) => all(d, 7)));
    if (per.size !== 5) problems.push(`five domains at index 7 gave only ${per.size} distinct seeds`);
    let domainRefused = false; try { all('swing', 1); } catch { domainRefused = true; }
    if (!domainRefused) problems.push("an unknown seed domain ('swing') was hashed instead of refused");
    if (f(5) !== M.SEED.swingSeederFor(SECRET, SID)(5)) problems.push('the seeder is not deterministic');
    const seen = new Set(Array.from({ length: 256 }, (_, i) => f(i)));
    if (seen.size < 250) problems.push(`256 swings produced only ${seen.size} distinct seeds`);
    if (M.SEED.swingSeederFor(SECRET, SID)(9) === M.SEED.swingSeederFor(SECRET, '00000000-0000-4000-8000-0000000c2e02')(9)) {
      problems.push('two sessions share a swing seed');
    }
    /* KEY WIDTH. Two secrets whose TEXT collides under 32-bit FNV-1a (the mix
       this replaced) must still seed differently: a keyed MAC carries all 64
       bits; a 32-bit text hash carries 32, so once collided, every swing of
       both sessions is the same roll. Found by a birthday search over 64-bit
       decimal secrets (deterministic from a fixed start). */
    const fnv = (s) => { let h = 0x811c9dc5; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193); } return h >>> 0; };
    const seenFnv = new Map(); let pair = null;
    for (let n = 1n; !pair && n < 400000n; n++) {
      const s = String(1000000000000000000n + 7919n * n);   // 19 digits: inside hr_seed's signed 64-bit range
      const h = fnv(s);
      if (seenFnv.has(h)) pair = [seenFnv.get(h), s]; else seenFnv.set(h, s);
    }
    if (!pair) problems.push('CONTROL: no FNV-1a text collision found — the key-width arm proves nothing');
    else {
      const a = M.SEED.swingSeederFor(pair[0], SID); const b = M.SEED.swingSeederFor(pair[1], SID);
      let same = 0; for (let i = 0; i < 16; i++) if (a(i) === b(i)) same++;
      if (same > 1) problems.push(`two 64-bit secrets that collide as 32-bit text seed ${same}/16 swings identically — the mix is not keyed by the whole secret`);
    }
    for (const bad of ['', 'abc', '1.5', null]) {
      let threw = false; try { M.SEED.swingSeederFor(bad, SID); } catch { threw = true; }
      if (!threw) problems.push(`a malformed secret ${JSON.stringify(bad)} was accepted`);
    }
    const st = { activeMonster: 'rat', playerHp: 10, playerMaxHp: 10, stats: {}, inventory: {},
      huntSession: M.AR.newHuntSession({ id: SID, huntFromMs: T0, bag: {}, slots: [] }) };
    const { simulateSpan } = await import(pathToFileURL(join(M.root, 'src/core/combat-sim.js')).href);
    let refused = false;
    try { simulateSpan(st, { fromMs: T0, toMs: T0 + 10000, tickMs: 2400, monsters: M.MONSTERS, items: M.ITEMS,
      bonus: () => 0, weakness: () => ({ dropMult: 1 }), playerRolls: () => ({ accuracy: 0.5, maxHit: 2, critChance: 0 }),
      monsterRolls: () => ({ accuracy: 0.5, maxHit: 1 }) }); } catch { refused = true; }
    if (!refused) problems.push('an UNSEEDED hunt swing ran — the engine must refuse a swing with no ctx.swingSeed');
    return problems;
  },

  MAXHP: async (M) => {
    /* Max HP 10 at hitpoints level 5: a level-up inside the window must not
       pull max HP DOWN to the level. The rule is one line of the ONE fx.addXp
       both a hunt and a legacy span run; the hunt reports the max HP it ended
       the window at. */
    const problems = [];
    const lv6 = M.XP.xpForLevel(6) - 1;
    const inp = huntInput(M, { skills: { attack: 50000, strength: 50000, defense: 50000, hitpoints: lv6 }, hp: 10, maxHp: 10 });
    inp.huntWindow = { fromMs: T0, toMs: T0 + 300000 };
    const out = M.AC.computeAccrual(inp);
    const lv = M.XP.levelFromXp(lv6 + Number((out.delta && out.delta.xp && out.delta.xp.hitpoints) || 0));
    if (!(lv > 5)) problems.push(`CONTROL — hitpoints did not level inside the window (level ${lv})`);
    else if (!(out.maxHp >= 10)) problems.push(`a hitpoints level-up to ${lv} lowered max HP 10 to ${out.maxHp} (FX-4)`);
    if (out.delta && out.delta.hp > Math.max(10, lv)) problems.push(`hp ${out.delta.hp} exceeds max HP`);
    return problems;
  },

  /* KNOCKOUT — exploit R1 has no door into a hunt. set_activity no longer
     carries a knockout refusal (a `combat` declaration is hunt_required), and
     hr_hunt_enter does not read `recovering_until`: the ONE combat body does.
     A window that lies wholly inside the knockout earns nothing; half inside
     earns roughly half (the control that the line is read, not that the
     fixture cannot fight). */
  KNOCKOUT: async (M) => {
    const problems = [];
    const val = (o) => ({ kills: Number((o.summary && o.summary.kills) || 0), gold: Number((o.delta && o.delta.gold) || 0),
      xp: Object.values((o.delta && o.delta.xp) || {}).reduce((a, b) => a + Number(b || 0), 0) });
    const up = val(M.AC.computeAccrual(huntInput(M)));
    const half = val(M.AC.computeAccrual(huntInput(M, { recoveringUntilMs: T0 + 450000 })));
    const down = val(M.AC.computeAccrual(huntInput(M, { recoveringUntilMs: T0 + 1800000 })));
    if (!(up.kills > 0)) problems.push('CONTROL: the reference hunt window killed nothing');
    if (down.kills !== 0 || down.gold !== 0 || down.xp !== 0) {
      problems.push(`a window wholly inside a knockout earned ${JSON.stringify(down)} — a knocked-out hunter fights (exploit R1)`);
    }
    if (!(half.kills > 0 && half.kills < up.kills)) {
      problems.push(`half a window inside a knockout earned ${half.kills} kills against ${up.kills} up — the line is not read`);
    }
    return problems;
  },

  /* RESUME-LINE — the first swing after a knockout lands EXACTLY on the line,
     to the tick (the successor of tests/world-tick-resume-alignment.mjs RA-0..2,
     which Security filed because a one-tick-off resume is ~6% of combat time and
     inside any statistical bar). KNOCKOUT above proves the line is READ; this
     proves where it is: a fall at the end of its swing (F) is down until
     F + KNOCKOUT_MS and swings at that instant, not a tick before or after.
       RA-0  a window that OPENS knocked out swings first at the carried line.
       RA-1  a window cut mid-knockout proposes recovering_until = F + KO.
       RA-2  inside one window, every recovered fall costs exactly KO of down
             time. (RA-3, across a cut, is BOTH-PATH and TICK-1 through the
             database: the line rides player_state between settles.) */
  'RESUME-LINE': async (M) => {
    const problems = [];
    const { KNOCKOUT_MS } = await import(pathToFileURL(join(M.root, 'src/data/hunt-sessions.js')).href);
    const weak = (extra) => {
      const inp = huntInput(M, Object.assign({ activeId: 'goblin_warren', hp: 10, maxHp: 10,
        skills: { attack: 0, strength: 0, defense: 0, hitpoints: 1200 } }, extra || {}));
      inp.huntSession = M.AR.newHuntSession({ id: SID, huntFromMs: T0, nextSwingAtMs: T0, bag: {}, slots: [], fallsLimit: 6 });
      return inp;
    };
    const span = M.AC.computeAccrual(weak());
    const dl = ((span.summary && span.summary.deathLog) || []).map((d) => d.atMs);
    if (dl.length < 2) { problems.push(`CONTROL: the weak hunter fell ${dl.length} time(s) in 15 min — the arm needs two`); return problems; }
    const recovered = dl.length - (span.hunt && span.hunt.ended ? 1 : 0);
    if (Number(span.hunt && span.hunt.down_ms) !== recovered * KNOCKOUT_MS) {
      problems.push(`RA-2: ${recovered} recovered fall(s) cost ${span.hunt && span.hunt.down_ms} ms down, not ${recovered} x ${KNOCKOUT_MS} — the resume is off the line`);
    }
    for (let k = 1; k < dl.length; k++) {
      if (!(dl[k] - dl[k - 1] > KNOCKOUT_MS)) problems.push(`RA-2: fall ${k + 1} at +${dl[k] - T0} ms lands inside fall ${k}'s knockout (+${dl[k - 1] - T0})`);
    }
    // RA-1: cut the window halfway through the first knockout.
    const cut = weak({ nowMs: dl[0] + KNOCKOUT_MS / 2 });
    cut.huntWindow = { fromMs: T0, toMs: dl[0] + KNOCKOUT_MS / 2 };
    const mid = M.AC.computeAccrual(cut);
    const want = new Date(dl[0] + KNOCKOUT_MS).toISOString();
    if (!mid.delta || mid.delta.recovering_until !== want) {
      problems.push(`RA-1: a window cut mid-knockout proposes recovering_until ${mid.delta && mid.delta.recovering_until}, not the fall + ${KNOCKOUT_MS} ms (${want})`);
    }
    /* RA-H: A FALL IS NEVER A FREE HEAL (CLAUDE.md §6; b509, the probe bar's
       freeHeal mutant). The fall leaves the hero at the resume line, and the
       first swing after the knockout starts from it — a window cut one
       millisecond past the line holds no more than that. */
    const { resumeHpFor } = await import(pathToFileURL(join(M.root, 'src/core/recovery.js')).href);
    const resumeHp = resumeHpFor(10);
    if (span.summary.deathLog.some((d) => d.resumeHp !== resumeHp)) {
      problems.push(`RA-H: a fall left the hero at ${span.summary.deathLog.map((d) => d.resumeHp)} hp, not the resume line ${resumeHp}`);
    }
    const stood = weak({ nowMs: dl[0] + KNOCKOUT_MS + 1 });
    stood.huntWindow = { fromMs: T0, toMs: dl[0] + KNOCKOUT_MS + 1 };
    const up = M.AC.computeAccrual(stood);
    if (!(up.delta && Number(up.delta.hp) <= resumeHp)) {
      problems.push(`RA-H: one swing after the knockout the hero holds ${up.delta && up.delta.hp} hp, above the resume line ${resumeHp} — the stand-up healed`);
    }
    // RA-0: a window that opens knocked out, its line on a swing boundary.
    const line = T0 + 30000;
    const open = M.AC.computeAccrual(weak({ recoveringUntilMs: line }));
    const openFalls = ((open.summary && open.summary.deathLog) || []).length - (open.hunt && open.hunt.ended ? 1 : 0);
    const carried = Number(open.hunt && open.hunt.down_ms) - openFalls * KNOCKOUT_MS;
    if (carried !== line - T0) {
      problems.push(`RA-0: a window opening knocked out until +${line - T0} ms spent ${carried} ms down before its first swing — the first swing is not on the carried line`);
    }
    return problems;
  },

  /* QUIVER — EVERY SHOT IS AN ARROW OUT OF THE BAG (the successor of
     accrual-engine's ammoGuard, which held the away span to the client's ammo
     spend). A ranged hunter's carried arrows are spent one per loosed shot,
     a 40-arrow bag on mine+end fires exactly 40 and ends ammo_out at the next
     boundary, and nothing is loosed past it. */
  QUIVER: async (M) => {
    const problems = [];
    const ranged = (n) => {
      const inp = huntInput(M, { hp: 99, maxHp: 99,
        skills: { attack: 200000, strength: 200000, defense: 200000, hitpoints: 200000, ranged: 200000 },
        equipment: { weapon: 'shortbow', ammo: 'steel_arrows' } });
      inp.huntSession = M.AR.newHuntSession({ id: SID, huntFromMs: T0, nextSwingAtMs: T0,
        bag: { steel_arrows: { loaded: n, left: n } }, slots: [], fallsLimit: 6 });
      inp.huntSession.supplySource = 'mine'; inp.huntSession.onEmpty = 'end';
      return M.AC.computeAccrual(inp);
    };
    const deep = ranged(2000);
    const shots = Number(deep.summary && deep.summary.ticks);
    const spent = Number(((deep.hunt || {}).uses || {}).steel_arrows || 0);
    if (!(shots > 0)) problems.push('CONTROL: the ranged hunter loosed nothing');
    if (spent !== shots) problems.push(`${shots} shots spent ${spent} arrows from the bag — a shot is not one arrow`);
    const dry = ranged(40);
    const h = dry.hunt || {};
    if (Number((h.uses || {}).steel_arrows) !== 40 || Number(dry.summary && dry.summary.ticks) !== 40) {
      problems.push(`a 40-arrow bag spent ${JSON.stringify(h.uses)} over ${dry.summary && dry.summary.ticks} shots`);
    }
    if (!h.ended || h.ended.reason !== 'ammo_out') problems.push(`an empty quiver ended '${h.ended && h.ended.reason}', not ammo_out`);
    return problems;
  },

  /* HEAL — EVERY HEAL SUPPLY HEALS ITS CATALOGUE VALUE AND COSTS ONE FROM THE
     BAG (the successor of accrual-engine's Auto-Eat arms and DEEPWATERS-S2,
     "each Swordfish Steak heals exactly 32 and is debited once"). The action
     bar's heal line fires at <= 50% on a hero far down, for EVERY heal row in
     src/data/supplies.js: hp rises by ITEMS[id].heals (never more, never
     less), the bag line drops by one, and nothing fires on a body (hp 0). */
  HEAL: async (M) => {
    const problems = [];
    const { SUPPLIES } = await import(pathToFileURL(join(M.root, 'src/data/supplies.js')).href);
    const heals = Object.values(SUPPLIES).filter((s) => s.kind === 'heal');
    if (heals.length < 3) problems.push(`CONTROL: only ${heals.length} heal supplies`);
    for (const s of heals) {
      const want = Number(M.ITEMS[s.id] && M.ITEMS[s.id].heals);
      for (const start of [1, 0]) {
        const hs = M.AR.newHuntSession({ id: SID, huntFromMs: T0, nextSwingAtMs: T0,
          bag: { [s.id]: { loaded: 3, left: 3 } },
          slots: [{ item: s.id, on: true, conditions: [{ subject: 'self_hp_pct', op: '<=', value: 50 }] }] });
        const st = { huntSession: hs, playerHp: start, playerMaxHp: 9999, buffs: [] };
        const ate = M.AR.runActionBar(st, { atMs: T0 });
        const left = hs.bag[s.id] && hs.bag[s.id].left;
        if (start === 0) {
          if (ate || st.playerHp !== 0 || left !== 3) problems.push(`${s.id} fired on a body (hp 0 -> ${st.playerHp}, bag ${left})`);
          continue;
        }
        if (!(want > 0)) { problems.push(`CONTROL: ${s.id} has no catalogue heal`); continue; }
        if (!ate || st.playerHp !== start + want) problems.push(`${s.id} healed ${st.playerHp - start}, not its catalogue ${want}`);
        if (left !== 2) problems.push(`${s.id} left ${left} of 3 in the bag after one meal`);
      }
    }
    return problems;
  },

  /* VIGOUR — the meter ends nothing and scales nothing inside a hunt. */
  'VIGOUR': async (M) => {
    const problems = [];
    if (M.HSD.END_ORDER.includes('vigour')) problems.push("END_ORDER still names 'vigour' — Vigour ends hunts again");
    const full = M.AC.computeAccrual(huntInput(M));
    if (!full.accrued || !full.hunt) { problems.push(`the reference hunt window did not settle (${full.reason})`); return problems; }
    const a = canon({ d: full.delta, h: full.hunt, b: full.huntBuffs });
    for (const spent of [720, 5000]) {
      const out = M.AC.computeAccrual(huntInput(M, { vigour: { budget_min: 720, spent_min: spent, day_key: '2026-10-14' } }));
      if (out.hunt && out.hunt.ended && out.hunt.ended.reason === 'vigour') {
        problems.push(`a hunt with ${spent}/720 Vigour minutes spent ENDED on vigour`);
      }
      const b = canon({ d: out.delta, h: out.hunt, b: out.huntBuffs });
      if (a !== b) problems.push(`a hunt with ${spent}/720 Vigour spent settled differently from a full meter ${firstDiff(a, b)}`);
    }
    return problems;
  },

  /* STAMINA (engine half) — the pool, swing by swing. */
  'STAMINA-RULE': async (M) => {
    const problems = [];
    const st = M.AR.staminaStep; const cap = M.HSD.STAMINA_MAX_MS;
    if (cap !== 12 * 3600000) problems.push(`STAMINA_MAX_MS is ${cap}, not Huntera's 12 h`);
    if (st(5000, 2400, true) !== 2600 || st(1000, 2400, true) !== 0) problems.push('a hunting interval does not drain 1:1 to a floor of 0');
    if (st(5000, 2400, false) !== 7400 || st(cap - 1000, 2400, false) !== cap || st(cap + 500, 2400, false) !== cap + 500) {
      problems.push('a resting interval does not rest 1:1 up to the cap, or rests a refilled pool DOWN to it');
    }
    const order = M.HSD.END_ORDER;
    if (order.indexOf('gold_out') !== order.indexOf('ammo_out') + 1 || order.indexOf('stamina') !== order.indexOf('gold_out') + 1
        || order.includes('vigour')) {
      problems.push(`END_ORDER ${order.join(',')} does not run the bag's ends, then gold_out, then stamina where vigour stood`);
    }
    const strong = { hp: 99, maxHp: 99, skills: { attack: 200000, strength: 200000, defense: 200000, hitpoints: 200000 } };
    const ref = M.AC.computeAccrual(huntInput(M, strong));
    if (!ref.hunt) { problems.push(`the reference window did not settle (${ref.reason})`); return problems; }
    if (ref.hunt.stamina !== null) problems.push('a session read with no pool proposed one (the database must see the gap)');
    const n = ref.hunt.swing_to - ref.hunt.swing_from;
    const tick = (ref.hunt.paid_ms + ref.hunt.down_ms) / n;
    const inp = huntInput(M, strong);
    inp.huntSession.staminaMs = 5 * tick;
    const out = M.AC.computeAccrual(inp);
    const h = out.hunt || {};
    if (!h.ended || h.ended.reason !== 'stamina') problems.push(`a pool of five swings ended '${h.ended && h.ended.reason}', not stamina`);
    if (h.stamina !== 0) problems.push(`the emptied pool reads ${h.stamina}, not 0`);
    if (h.down_ms === 0 && h.paid_ms !== 5 * tick) problems.push(`a pool of five swings hunted ${h.paid_ms / tick} swings`);
    if (h.down_ms !== 0) problems.push('CONTROL: the strong probe was knocked out');
    /* The client reader: the server's value, replaced; garbage is "unknown". */
    const G = { _stamina: { ms: 1 } };
    M.NET.hydrateHunt(G, { stamina: { ms: 1234, at: new Date(T0).toISOString(), max_ms: cap, hunting: true } });
    if (!G._stamina || G._stamina.ms !== 1234 || G._stamina.atMs !== T0 || G._stamina.maxMs !== cap || G._stamina.hunting !== true) {
      problems.push(`hydrateHunt did not take the server's pool: ${JSON.stringify(G._stamina)}`);
    }
    M.NET.hydrateHunt(G, { stamina: { ms: 'x' } });
    if (G._stamina !== null) problems.push('hydrateHunt kept a value the envelope replaced with garbage');
    return problems;
  },

  /* BUY (engine half) — the shop, paid per use, and the end. */
  'BUY-RULE': async (M) => {
    const problems = [];
    const when = [{ subject: 'self_hp_pct', op: '<=', value: 50 }];
    const bar = [{ item: '*heal', on: true, conditions: when }, { item: '*heal_shop', on: true, conditions: when },
      { item: '*mana_shop', on: true, conditions: [] }];
    const basics = {
      salted_shrimp: { kind: 'heal', price: 3, heals: 4, mana: 0, partner: 'cooked_shrimp' },
      thin_turnip_juice: { kind: 'mana', price: 1, heals: 0, mana: 6, partner: 'turnip_juice' },
      plain_steel_arrows: { kind: 'ammo', price: 1000, heals: 0, mana: 0, partner: 'steel_arrows' },
      bad_row: { kind: 'heal', price: 2.5, heals: 4 },
    };
    /* JUNK ONLY (Master Design Reference §8 review): bones and every other
       un-flagged drop are never sell-to-cover stock; only `junk: true` is. */
    for (const id of ['bones', 'bat_wing', 'goblin_ear', 'rat_tail']) {
      if (M.ITEMS[id] && M.HSD.coverSellable(M.ITEMS[id], false)) problems.push(`${id} is sell-to-cover stock — auto-sell is junk only`);
    }
    if (!M.HSD.coverSellable({ junk: true }, false) || M.HSD.coverSellable({ junk: true }, true)) problems.push('a junk row is not coverable (or a junk SUPPLY is)');
    const mk = (bag, purse, slots = bar, extra = {}) => M.AR.newHuntSession(Object.assign({ id: 'b', huntFromMs: 0, bag, slots, basics,
      /* The store mechanics under test need the player to have CHOSEN the store
         (Master Design Reference §4); the choice itself is graded by DRY /
         HEALSTORE in tests/hunt-session-engine.mjs. */
      shop: { heal: 'salted_shrimp', mana: 'thin_turnip_juice' }, purse, goldFloor: 0, supplySource: 'store' }, extra));
    const fire = (hs, atMs) => {
      const st = { playerHp: 2, playerMaxHp: 10, playerMana: 0, playerMaxMana: 10, huntSession: hs, buffs: [] };
      const ate = M.AR.runActionBar(st, { atMs });
      return { ate, hp: st.playerHp };
    };
    const hs = mk({}, 7);
    if ('bad_row' in hs.basics) problems.push('a shop row with a fractional price survived newHuntSession');
    const a = fire(hs, 1000); const b = fire(hs, 5000); const c = fire(hs, 9000);
    if (!a.ate || a.hp !== 6 || !b.ate || hs.tally.bought.salted_shrimp !== 2 || hs.purse !== 1) {
      problems.push(`two shop heals from a purse of 7 at 3: ate ${a.ate}/${b.ate} hp ${a.hp}, bought ${JSON.stringify(hs.tally.bought)}, purse ${hs.purse}`);
    }
    if (c.ate || hs.goldOut !== true) problems.push(`a shop heal the purse cannot cover was eaten (${c.ate}) or did not mark goldOut (${hs.goldOut})`);
    if (M.AR.endReasonAt(hs, 9000) !== 'gold_out') problems.push(`a dry purse ends '${M.AR.endReasonAt(hs, 9000)}', not gold_out`);
    if ((hs.tally.bought.thin_turnip_juice || 0) !== 0) problems.push('a shop drink was bought before the mana engine exists');
    /* …and with nothing to heal, so the ONE consumable lane is free for it. */
    const full = mk({}, 7);
    M.AR.runActionBar({ playerHp: 10, playerMaxHp: 10, playerMana: 0, playerMaxMana: 10, huntSession: full, buffs: [] }, { atMs: 1000 });
    if ((full.tally.bought.thin_turnip_juice || 0) !== 0) problems.push('a shop drink was bought (lane free) before the mana engine exists');
    const crafted = mk({ cooked_trout: { loaded: 1 } }, 7);
    fire(crafted, 1000);
    if (crafted.bag.cooked_trout.left !== 0 || crafted.purse !== 7 || (crafted.tally.bought.salted_shrimp || 0) !== 0) {
      problems.push('the shop was paid while the bag still held a crafted heal');
    }
    if (M.AR.endReasonAt(mk({ cooked_shrimp: { loaded: 1, left: 0 } }, 0), 0) === 'heals_out') {
      problems.push('an empty heal line behind a shop heal slot ended the hunt heals_out');
    }
    if (M.AR.endReasonAt(mk({ cooked_shrimp: { loaded: 1, left: 0 } }, 0, [bar[0]]), 0) !== 'heals_out') {
      problems.push('CONTROL: an empty heal line with no shop slot did not end heals_out');
    }
    /* THE FLOOR AND SELL-TO-COVER (row 3): a purse AT the floor sells the
       cheapest loot first, just enough, then pays; with no loot it ends. */
    const cv = mk({}, 300, bar, { goldFloor: 300, cover: { bones: { unit: 1, avail: 200 }, wolf_pelt: { unit: 5, avail: 10 } } });
    const cvA = fire(cv, 1000);
    if (!cvA.ate || cv.purse !== 300 || (cv.tally.covered.bones || 0) !== 3 || (cv.tally.covered.wolf_pelt || 0) !== 0) {
      problems.push(`at the floor, a heal at 3 sold ${JSON.stringify(cv.tally.covered)} and left a purse of ${cv.purse}, want 3 bones and 300`);
    }
    const dry = mk({}, 300, bar, { goldFloor: 300 });
    fire(dry, 1000);
    if (dry.goldOut !== true || (dry.tally.bought.salted_shrimp || 0) !== 0) problems.push('a purse at the floor with no loot to sell still bought');
    /* KILL COINS ARE IN THE PURSE AT ONCE: a hunter with 0 gold pays a shop
       heal out of what the hunt itself dropped (the database credits the coins
       before it debits the buys, in the same settle). */
    const coin = huntInput(M, { gold: 0 });
    coin.huntSession.bag = {};
    coin.huntSession.basics = { salted_shrimp: basics.salted_shrimp };
    coin.huntSession.shop = { heal: 'salted_shrimp', mana: null };
    coin.huntSession.goldFloor = 0;
    coin.huntSession.supplySource = 'store';
    coin.huntSession.slots = [{ item: '*heal_shop', on: true, conditions: when }];
    const co = M.AC.computeAccrual(coin);
    if (!(((co.hunt || {}).buys || {}).salted_shrimp > 0)) problems.push(`a 0-gold hunter bought ${JSON.stringify((co.hunt || {}).buys)} from its own kill coins (gold ${co.delta && co.delta.gold})`);
    /* Shots, per shot, through the real span: 3 shots' gold, then gold_out. */
    const inp = huntInput(M, { hp: 99, maxHp: 99, gold: 3000,
      skills: { attack: 200000, strength: 200000, defense: 200000, hitpoints: 200000, ranged: 200000 },
      equipment: { weapon: 'shortbow', ammo: 'steel_arrows' } });
    inp.huntSession.bag = {};
    inp.huntSession.basics = { plain_steel_arrows: basics.plain_steel_arrows };
    inp.huntSession.goldFloor = 0;
    inp.huntSession.slots = [{ item: 'plain_steel_arrows', on: true, conditions: [] }];
    /* The store takes a dry line ONLY on the set's choice (Master Design
       Reference §4); on mine+end the same dry quiver ends the hunt ammo_out and buys nothing. */
    const endOut = M.AC.computeAccrual({ ...inp, huntSession: { ...inp.huntSession, supplySource: 'mine', onEmpty: 'end', tally: JSON.parse(JSON.stringify(inp.huntSession.tally)) } });
    const he = endOut.hunt || {};
    if (Object.keys(he.buys || {}).length || (he.ended && he.ended.reason === 'gold_out')) problems.push(`on mine+end a dry quiver bought ${JSON.stringify(he.buys)} (ended '${he.ended && he.ended.reason}')`);
    inp.huntSession.onEmpty = 'switch';
    const out = M.AC.computeAccrual(inp);
    const h = out.hunt || {};
    if (!h.ended || h.ended.reason !== 'gold_out') problems.push(`a dry quiver ended '${h.ended && h.ended.reason}', not gold_out`);
    if (!h.buys || h.buys.plain_steel_arrows !== 3) problems.push(`3000 gold at 1000 a shot bought ${JSON.stringify(h.buys)}`);
    return problems;
  },

  /* ACTIONBAR (engine half) — mana, slot kinds, mode and pull. */
  'ACTIONBAR-RULE': async (M) => {
    const problems = [];
    const RS = M.RS;
    if (RS.ACTION_SET_LIMITS.slots !== 20) problems.push(`the bar holds ${RS.ACTION_SET_LIMITS.slots} slots, not Huntera's 20`);
    /* The verb's door reads the same bar: request.js MAX_BAR_SLOT is the last index. */
    if (M.REQ.MAX_BAR_SLOT !== RS.ACTION_SET_LIMITS.slots - 1 || M.REQ.readBarSlot({ bar_slot: 19 }) !== 19
        || M.REQ.readBarSlot({ bar_slot: 20 }) !== null) {
      problems.push(`hunt_use's bar_slot door admits 0..${M.REQ.MAX_BAR_SLOT}, the bar has ${RS.ACTION_SET_LIMITS.slots} slots`);
    }
    const c = { subject: 'self_mana_pct', op: '<=', value: 30 };
    const v = (mana, maxMana) => ({ hs: {}, hp: 10, maxHp: 10, mana, maxMana, buffs: [], atMs: 0 });
    if (!M.AR.conditionHolds(c, v(2, 10)) || M.AR.conditionHolds(c, v(5, 10)) || M.AR.conditionHolds(c, v(0, 0))) {
      problems.push('self_mana_pct does not read the mana pool (or reads true with none)');
    }
    const hs = M.AR.newHuntSession({ id: 'm', bag: { cooked_shrimp: { loaded: 5 } },
      slots: [{ kind: 'spell', item: 'cooked_shrimp', on: true, conditions: [] }] });
    const d = M.AR.fireRules({ hs, hp: 1, maxHp: 10, buffs: [], atMs: 0 });
    if (d.uses.length) problems.push('a spell slot fired a supply');
    const cl = (o) => { const x = M.AR.newHuntSession(Object.assign({ id: 'c' }, o)); return `${x.targetMode}/${x.pull.size}`; };
    /* The target mode is clamped to the solo vocabulary; the PULL is the
       server's (hr_hunt_pull_of clamps it — Security design review item 2), so
       the engine runs the size it is handed and never clamps one of its own. */
    if (cl({ targetMode: 'follow', pull: { size: 3 } }) !== 'nearest/3' || cl({ targetMode: 'weakest', pull: { size: 0 } }) !== 'weakest/1'
        || cl({}) !== `${RS.DEFAULT_TARGET_MODE}/1`) {
      problems.push(`the session does not clamp target mode / take the server's pull: ${cl({ targetMode: 'follow', pull: { size: 3 } })}, ${cl({ targetMode: 'weakest', pull: { size: 0 } })}`);
    }
    return problems;
  },

  /* DEATHXP (engine half) — the price of a fall, as a rule. */
  'DEATHXP-RULE': async (M) => {
    const problems = [];
    const f = M.AR.deathXpLossFor;
    const L = (lv) => M.XP.xpForLevel(lv);
    const rate = M.HSD.DEATH_XP_LOSS;
    if (f(L(20)) !== 0) problems.push('a character at a level floor pays XP for a fall');
    if (f(L(99) + 5000) !== 0) problems.push('a character at the top level pays XP for a fall');
    const gap = L(31) - L(30);
    const mid = L(30) + Math.floor(gap / 2);
    if (f(mid) !== Math.floor(gap * rate)) problems.push(`a mid-level fall costs ${f(mid)}, not ${Math.floor(gap * rate)} (${rate} of the level's gap)`);
    if (f(L(30) + 1) !== 1 || M.XP.levelFromXp(L(30) + 1 - f(L(30) + 1)) !== 30) problems.push('a fall one XP above the floor does not stop AT the floor');
    for (let x = 0; x < 200000; x += 977) {
      const n = f(x);
      if (n < 0 || M.XP.levelFromXp(x - n) !== M.XP.levelFromXp(x)) { problems.push(`a fall at ${x} xp de-levels (−${n})`); break; }
    }
    const ctl = M.AR.deathXpLoss({ attack: mid, strength: L(30), defense: mid }, { xp: { attack: 0.33, strength: 0.33, defense: 0.34 } });
    if (JSON.stringify(ctl) !== JSON.stringify({ attack: Math.floor(gap * rate), defense: Math.floor(gap * rate) })) {
      problems.push(`a controlled-style fall costs ${JSON.stringify(ctl)} — every trained skill, zeros omitted`);
    }
    if (JSON.stringify(M.AR.deathXpLoss({ attack: mid }, null)) !== JSON.stringify({ attack: Math.floor(gap * rate) })) {
      problems.push('with no style the fall does not cost Attack (killXpRoute\'s default)');
    }
    return problems;
  },

  FENCE: async (M) => {
    const inp = huntInput(M, { huntOpen: true, capMs: 43200000, seed: 3 });
    delete inp.huntSession;
    const out = M.AC.computeAccrual(inp);
    const problems = [];
    if (out.accrued || out.reason !== M.AC.SKIP.HUNT_OPEN) problems.push(`the old path priced a hunter (${out.reason})`);
    if (!M.IN.SAFE_SKIP_REASONS.includes('hunt_open')) problems.push('hunt_open is not classified SAFE (a switch would treat it as a refusal)');
    return problems;
  },
};

// ═══════════════════════════════════════════════════════════════════════
// DATABASE ARMS (the real chain, PGlite, as hr_engine)
// ═══════════════════════════════════════════════════════════════════════
const UID = '00000000-0000-4000-8000-0000000c2d01';
async function q(db, sql, params) { return (await db.query(sql, params)).rows; }
async function one(db, sql, params) { const r = await q(db, sql, params); return r[0] ? Object.values(r[0])[0] : undefined; }
const makeExec = (db) => async (text, params) => {
  await db.exec('set role hr_engine');
  try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
};
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
const idem = () => crypto.randomUUID();

async function admin(db, delta) {
  const v = await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [UID]);
  const exec = makeExec(db);
  const [r] = await exec('select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid, $4::text::jsonb) as r',
    [UID, v, idem(), JSON.stringify({ ...delta, journal: { kind: 'admin', intent: 'c2_probe' } })]);
  if (!r || !r.r || r.r.ok !== true) throw new Error('admin apply refused: ' + JSON.stringify(r && r.r));
}

/* A probe character on a hunt that started `minutesAgo` minutes ago. */
async function hunter(db, M, o) {
  await newUser(db);
  await asUser(db, UID);
  const c = await one(db, 'select public.hr_create_character(0)');
  if (!c || c.created !== true) throw new Error('probe character refused: ' + JSON.stringify(c));
  /* A FRESH hero keeps the real start kit (FRESH); every other fixture names its own. */
  if (!o.keepKit) await db.query('delete from public.player_inventory where user_id = $1 and slot = 0', [UID]);
  for (const [item, qty] of Object.entries(o.inv || {})) {
    await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3)', [UID, item, qty]);
  }
  await db.query(`update public.hr_hunt_config set enabled = true where id`);
  if (o.skillsLevel) {
    const xp = M.XP.xpForLevel(o.skillsLevel);
    await admin(db, { xp: { attack: xp, strength: xp, defense: xp, hitpoints: xp } });
    await asUser(db, UID);
  }
  if (o.skillsXp) { await admin(db, { xp: o.skillsXp }); await asUser(db, UID); }
  if (o.hp) { await admin(db, { hp: o.hp }); await asUser(db, UID); }
  if (o.slots) {
    const r = await one(db, 'select public.hr_action_set_put(0, 0, $1, $2::jsonb, $3::uuid)', ['C2', JSON.stringify(o.slots), idem()]);
    if (!r || r.ok !== true) throw new Error('action set refused: ' + JSON.stringify(r));
  }
  /* HUNT SUPPLIES (Master Design Reference §4): a fixture that buys from the
     store must have CHOSEN it, through the player's own RPC. */
  if (o.supply) {
    const opts = {};
    if (o.supply.source) opts.supply_source = o.supply.source;
    if (o.supply.empty) opts.on_empty = o.supply.empty;
    const r = await one(db, 'select public.hr_action_set_options(0, 0, $1::jsonb, $2::uuid)', [JSON.stringify(opts), idem()]);
    if (!r || r.ok !== true) throw new Error('supplies choice refused: ' + JSON.stringify(r));
  }
  if (o.mode) {
    const r = await one(db, 'select public.hr_action_set_options(0, 0, $1::jsonb, $2::uuid)',
      [JSON.stringify({ target_mode: o.mode.target, pull_count: o.mode.pull, gold_floor: o.mode.floor ?? 300 }), idem()]);
    if (!r || r.ok !== true) throw new Error('action set mode refused: ' + JSON.stringify(r));
  }
  /* Fixture rows on a rolled-back probe: the gold the purse starts with, and
     the activity an automatic end resumes. */
  if (o.gold != null) { await admin(db, { gold: o.gold }); await asUser(db, UID); }
  if (o.lastActivity) {
    await db.query(`update public.player_state set last_activity_kind = $2, last_activity_id = $3 where user_id = $1 and slot = 0`,
      [UID, o.lastActivity.kind, o.lastActivity.id]);
  }
  const e = await one(db, 'select public.hr_hunt_enter(0, $1, $2::jsonb, 0, $3, null, $4::uuid)',
    [o.hunt || 'mill_cellar', JSON.stringify(o.bag || []), o.falls ?? null, idem()]);
  if (!e || e.ok !== true) throw new Error('enter refused: ' + JSON.stringify(e));
  const sid = e.session.id;
  await db.query(`update public.hunt_sessions set entered_at = now() - make_interval(mins => $2 + 1),
                    hunt_from = date_trunc('second', now() - make_interval(mins => $2)),
                    settled_to = date_trunc('second', now() - make_interval(mins => $2)),
                    next_swing_at = date_trunc('second', now() - make_interval(mins => $2)) where id = $1`, [sid, o.minutesAgo]);
  await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  /* A pool of `o.stamina` ms AT the hunt's start (a fixture on a rolled-back
     probe, like PRESS's max HP): the window walks it from there. */
  if (o.stamina != null) {
    await db.query(`update public.player_state set stamina_ms = $2,
                      stamina_at = (select hunt_from from public.hunt_sessions where id = $3)
                     where user_id = $1 and slot = 0`, [UID, o.stamina, sid]);
  }
  const from = Number(await one(db, `select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_sessions where id = $1`, [sid]));
  return { sid, from };
}

/* ONE settle of the open session ending at `toMs` — hunt-settle.js's own
   pieces, in settleOnce's order. */
async function settleTo(db, M, toMs, o = {}) {
  const exec = makeExec(db);
  const [read] = await exec(M.HS.HUNT_READ_SQL, [UID, 0, null]);
  const h = read.hunt; const env = read.state;
  if (!h || h.open !== true) return { skipped: 'closed' };
  const hs = M.HS.huntSessionFromRead(h);
  let press = null;
  if (o.pressAtMs != null) { press = { slot: o.pressSlot ?? 0, at: o.pressAtMs }; hs.presses = [...hs.presses, press]; }
  const perks = await M.TR.readTickPerks(exec, UID, 0);
  const engIn = M.HS.huntEngineInputs({ user: UID, slot: 0, env, hs,
    nowMs: new Date(read.now).getTime(), fromMs: Number(h.settled_to_ms), toMs, perks,
    secret: h.secret, pressAtMs: press ? press.at : null });
  const out = M.AC.computeAccrual(engIn);
  if (!out.accrued) return { skipped: out.reason };
  if (o.tamper) o.tamper(out);
  const res = await M.HS.commitHuntSettle(exec, { user: UID, slot: 0, sessionId: String(h.id), version: env.version,
    intentId: idem(), out, press, project: false });
  if (o.tamper) return { res, out };
  if (!res || res.ok !== true) throw new Error(`settle to ${new Date(toMs).toISOString()} refused: ${JSON.stringify(res).slice(0, 400)}`);
  return { res, out };
}

async function snapshot(db, sid) {
  return one(db, `
    select jsonb_build_object(
      'gold', ps.gold, 'hp', ps.hp, 'max_hp', ps.max_hp, 'buffs', ps.buffs, 'fight', ps.fight,
      'recovering_until', ps.recovering_until, 'active', ps.active_kind || ':' || coalesce(ps.active_id, ''),
      'stamina', ps.stamina_ms, 'stamina_at', ps.stamina_at, 'active_since', ps.active_since,
      'set', (select jsonb_build_array(a.target_mode, a.pull_count) from public.player_action_sets a
               where a.user_id = $1 and a.slot = 0 and a.preset = 0),
      /* The NPC's sales SUMMED: how many supply_buy rows carry them is a
         property of the cut (one per settle that bought anything). */
      'buys', (select jsonb_build_object('gold', sum(l.gold), 'units', sum(l.qty)) from public.player_ledger l
                where l.session_id = $2 and l.kind = 'hunt' and l.intent = 'supply_buy'),
      'resume', (select jsonb_agg(l.meta order by l.id) from public.player_ledger l
                  where l.session_id = $2 and l.kind = 'hunt' and l.intent = 'resume'),
      'skills', (select jsonb_object_agg(skill_id, jsonb_build_array(xp, xp_frac)) from public.player_skills where user_id = $1 and slot = 0),
      'inv', (select jsonb_object_agg(item_id, qty) from public.player_inventory where user_id = $1 and slot = 0),
      'stats', (select jsonb_object_agg(kind || ':' || key || ':' || period_key, value) from public.player_progress
                 where user_id = $1 and slot = 0 and kind <> 'daily'),
      'session', (select jsonb_build_object('swing', swing_index, 'next', next_swing_at, 'settled_to', settled_to,
                    'falls', falls, 'down', down, 'cooldowns', cooldowns, 'ended_at', ended_at, 'end_reason', end_reason,
                    'pull_left', (select i.pull_left from public.hunt_instances i where i.id = h.instance_id),
                    'respawn_at', (select i.respawn_at from public.hunt_instances i where i.id = h.instance_id))
                    from public.hunt_sessions h where h.id = $2),
      'bag', (select jsonb_object_agg(item_id, jsonb_build_array(qty_loaded, qty_left)) from public.hunt_bag where session_id = $2),
      'tally', (select to_jsonb(t) - 'updated_at' - 'ledger_hwm' - 'raw_xp' from public.hunt_session_tally t where session_id = $2),
      'deaths', (select jsonb_agg(jsonb_build_array(meta->>'monster', meta->>'recovery_ms', meta->>'deaths_today',
                   meta->>'deaths_lifetime', meta->>'resume_hp', meta->>'food_in_bag') order by id)
                   from public.player_ledger where session_id = $2 and kind = 'combat' and intent = 'death'),
      /* The timeline in TIME order (a settle inserts a window's events in its
         own order). Rare drops as the SET of items: hr_hunt_settle_session
         journals one rare_drop per item per settle (C1), so how many rows a
         repeated item gets is a property of the cut, not of the hunt; level_up
         and vigour_low are stamped at their settle's end for the same reason. */
      'events', (select jsonb_agg(jsonb_build_array(type, at, data) order by at, type, data::text)
                   from public.hunt_session_events where session_id = $2 and type in ('fall', 'slot_dry', 'ended')),
      'rare_items', (select jsonb_agg(distinct data->>'item') from public.hunt_session_events
                      where session_id = $2 and type = 'rare_drop'),
      /* The falls' XP price, SUMMED per skill: how many death_xp rows carry it
         is a property of the cut (one per settle that cost anything), the
         total is the hunt's. Each fall's own price rides its event above. */
      'death_xp', (select jsonb_object_agg(k, v) from (select x.key k, sum((x.value #>> '{}')::bigint) v
                     from public.player_ledger l, jsonb_each(l.meta->'xp') x
                    where l.session_id = $2 and l.kind = 'hunt' and l.intent = 'death_xp' group by 1) d))
      from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [UID, sid]);
}

async function inTx(db, fn) {
  await db.query('begin');
  try { return await fn(); } finally { await db.query('rollback'); }
}
/* ONE hunter, TWO timelines: run `cutsA` (window ends, ms), snapshot, roll
   back to the savepoint, run `cutsB`, snapshot. Same session, same secret,
   same instants — so any difference is the settle's, never the fixture's. */
async function compareRuns(db, M, fixture, cutsA, cutsB) {
  return inTx(db, async () => {
    const { sid, from } = await hunter(db, M, fixture);
    const run = async (cuts) => {
      for (const t of cuts(from)) {
        const r = await settleTo(db, M, t);
        if (r.skipped === 'closed') break;
      }
      return snapshot(db, sid);
    };
    await db.query('savepoint c2_runs');
    const a = await run(cutsA);
    await db.query('rollback to savepoint c2_runs');
    /* cutsB may read A's snapshot (BOTH-PATH places cuts inside A's recovery windows). */
    const b = await run((f) => cutsB(f, a));
    return { a, b, sid, from };
  });
}

const STRONG = {
  minutesAgo: 45, skillsLevel: 25, hunt: 'goblin_warren', inv: { cooked_shrimp: 30, hunters_feast: 3 },
  bag: [{ item: 'cooked_shrimp', qty: 25 }, { item: 'hunters_feast', qty: 3 }],
  /* Eats at <= 90%: a level-25 hero on a spawn-limited ground is rarely below
     half, and the arm needs heals inside the windows it cuts. */
  slots: [{ item: '*heal', on: true, conditions: [{ subject: 'self_hp_pct', op: '<=', value: 90 }] },
    { item: 'hunters_feast', on: true, conditions: [{ subject: 'buff_missing:drop_rate' }] }],
};
/* WEAK falls — and carries XP INSIDE its levels, so each fall has a price to
   pay (a character at a level floor pays 0 and would make the death_xp half of
   BOTH-PATH vacuous). `magic` sits ONE XP above its level-12 floor and no
   melee style trains it: the DEATHXP arm's below-the-starting-level forgery
   charges it 3 (inside the 2% bound, below the floor). */
/* The bar a shop buyer fights with: the bag's heal, then the shop's — ON
   (a new character's default bar has the shop slot off, master plan row 25). */
/* The bag's heal first, then the shop's: Use My Supplies, Switch on empty. */
const SWITCH = { source: 'mine', empty: 'switch' };
const SHOP_BAR = [{ item: '*heal', on: true, conditions: [{ subject: 'self_hp_pct', op: '<=', value: 50 }] },
  { item: '*heal_shop', on: true, conditions: [{ subject: 'self_hp_pct', op: '<=', value: 50 }] }];
/* The bar WEAK fights with: the bag's heal only. Lane D's default preset also
   carries the SHOP's heal, which a hunter with no gold cannot pay — the hunt
   would end `gold_out` at its first heal; the shop is BUY's subject. */
const BAG_ONLY = [{ item: '*heal', on: true, conditions: [{ subject: 'self_hp_pct', op: '<=', value: 50 }] }];
/* Three falls end every hunt (master plan row 16): no fixture names another. */
const WEAK = { minutesAgo: 30, inv: {}, bag: [], hunt: 'goblin_warren', slots: BAG_ONLY,
  skillsXp: { attack: 1700, strength: 1700, defense: 1700, magic: 1585 } };
const SPAN_MS = 30 * 60000;
const ticksOf = (stepMs, spanMs) => (from) => Array.from({ length: Math.ceil(spanMs / stepMs) }, (_, i) => Math.min(from + (i + 1) * stepMs, from + spanMs));

/* THE BALANCE FLOOR (gather review finding 5): a fresh kit hero falls fewer
   than this many times an hour of hunting in Mill Cellar. */
const FRESH_MAX_FALLS_PER_H = 2;
/* ...and the kit carries the hunt at least this long before any automatic end
   (heals_out ends a hunt BEFORE it can fall, so a fall rate alone would pass a
   kit that lasts ten minutes). */
const FRESH_MIN_MINUTES = 25;
const FRESH_RUNS = 4;

const DB_ARMS = {
  FRESH: async (db, M) => {
    const problems = [];
    const kit = await import(pathToFileURL(join(ROOT, 'src', 'data', 'start-kit.js')).href);
    const shrimp = Number(kit.START_INVENTORY.cooked_shrimp) || 0;
    if (!(shrimp > 0)) return ['CONTROL: the start kit carries no cooked shrimp to pack'];
    const lines = [];
    let worst = 0;
    for (let run = 0; run < FRESH_RUNS; run++) {
      const r = await inTx(db, async () => {
        /* The falls limit at its maximum, so the hour MEASURES the fall rate
           instead of stopping at the third (which would hide a worse one). */
        const { sid, from } = await hunter(db, M, { keepKit: true, minutesAgo: 60, hunt: 'mill_cellar',
          bag: [{ item: 'cooked_shrimp', qty: shrimp }], falls: M.HSD.SESSION_LIMITS.falls.max });
        for (const t of ticksOf(300000, 3600000)(from)) {
          const x = await settleTo(db, M, t);
          if (x.skipped === 'closed') break;
        }
        return one(db, `select jsonb_build_object('falls', (select count(*) from public.player_ledger
                            where session_id = $1 and kind = 'combat' and intent = 'death'),
                          'kills', t.kills, 'paid', t.paid_ms, 'down', t.down_ms, 'ate', t.supplies->'cooked_shrimp',
                          'end', h.end_reason, 'xp', t.xp)
                          from public.hunt_session_tally t join public.hunt_sessions h on h.id = t.session_id
                         where t.session_id = $1`, [sid]);
      });
      const hours = (Number(r.paid) + Number(r.down)) / 3600000;
      const rate = hours > 0 ? Number(r.falls) / hours : Infinity;
      worst = Math.max(worst, rate);
      if (r.end && hours * 60 < FRESH_MIN_MINUTES) {
        problems.push(`run ${run}: the kit hunt ended ${r.end} after ${(hours * 60).toFixed(1)} min (floor ${FRESH_MIN_MINUTES} min)`);
      }
      lines.push(`run ${run}: ${r.falls} falls in ${(hours * 60).toFixed(1)} min (${rate.toFixed(2)}/h), ${r.kills} kills, `
        + `${r.ate || 0} shrimp, end ${r.end || 'none'}, xp ${JSON.stringify(r.xp)}`);
      if (!(Number(r.kills) > 0)) problems.push(`CONTROL: run ${run} killed nothing — a fresh hero must be fighting`);
    }
    console.log('  FRESH forecast (Mill Cellar, real START_KIT, real settle):\n    ' + lines.join('\n    '));
    if (worst >= FRESH_MAX_FALLS_PER_H) problems.push(`a fresh kit hero falls ${worst.toFixed(2)} times an hour in Mill Cellar (floor < ${FRESH_MAX_FALLS_PER_H})`);
    return problems;
  },

  'TICK-1': async (db, M) => {
    const r = await compareRuns(db, M, STRONG, ticksOf(90000, SPAN_MS), (from) => [from + SPAN_MS]);
    const a = canon(r.a); const b = canon(r.b);
    const problems = [];
    if (a !== b) problems.push(`20 x 90 s tick windows differ from one 30 min span ${firstDiff(a, b)}`);
    const t = r.b.tally || {};
    if (!(t.kills > 0)) problems.push(`CONTROL: the strong fixture killed nothing (${JSON.stringify(r.b).slice(0, 600)})`);
    if (!((t.supplies || {}).hunters_feast > 0)) problems.push('CONTROL: the action bar never fired a Feast — the buff queue was not exercised');
    if (!((t.supplies || {}).cooked_shrimp > 0)) problems.push('CONTROL: no heal was eaten');
    return problems;
  },
  'BOTH-PATH': async (db, M) => {
    /* The connected client cuts the timeline wherever it presses — odd
       instants, two within a second, one that lands on a swing boundary —
       AND twice inside every recovery window the tick run fell into, so a
       carried recovery line is read back by a settle whatever instant the
       dice put the falls at (P0 x H merge, 2026-10-17: with the falls moved,
       the fixed list alone cut no window and carrierOneTickLate stayed green). */
    const fallsOf = (snap) => (snap?.events || []).filter((e) => e[0] === 'fall').map((e) => new Date(e[1]).getTime());
    const odd = (from, a) => [...new Set([37123, 131000, 132000, 300000, 348411, 349000, 600000, 777777, 901001, 1200000, 1500000, SPAN_MS]
      .map((d) => from + d)
      .concat(fallsOf(a).flatMap((t) => [t + 17123, t + 41007]).filter((t) => t > from && t < from + SPAN_MS)))]
      .sort((x, y) => x - y);
    const gather = await one(db, `select activity_id from public.hr_activities where kind = 'gather'
                                     and (req_lv is null or req_lv <= 1) order by activity_id limit 1`);
    const r = await compareRuns(db, M, { ...WEAK, mode: { target: 'weakest', pull: 3 }, lastActivity: { kind: 'gather', id: gather } },
      ticksOf(90000, SPAN_MS), odd);
    const a = canon(r.a); const b = canon(r.b);
    const problems = [];
    if (a !== b) problems.push(`a death with a client connected wrote different rows than one with none ${firstDiff(a, b)}`);
    if (canon(r.a.set) !== canon(['weakest', 3])) problems.push(`CONTROL: the action set's mode is ${JSON.stringify(r.a.set)}`);
    if (r.a.active !== `gather:${gather}` || !(r.a.resume || []).some((m) => m.resumed === true)) {
      problems.push(`CONTROL: the automatic end did not resume ${gather} (pointer ${r.a.active}, ${JSON.stringify(r.a.resume)})`);
    }
    if (!((r.a.deaths || []).length > 0)) problems.push('CONTROL: the weak fixture never fell — the arm proves nothing about deaths');
    if (!(fallsOf(r.a).length > 0)) problems.push('CONTROL: no fall event carries an instant — no cut lands inside a recovery window');
    if (!Object.values(r.a.death_xp || {}).some((v) => Number(v) > 0)) {
      problems.push('CONTROL: the weak fixture\'s falls cost no XP — the death-XP half of the arm proves nothing');
    }
    if (!r.a.session || r.a.session.end_reason !== 'falls') problems.push(`CONTROL: the weak hunt ended '${r.a.session && r.a.session.end_reason}', not on its fall`);
    return problems;
  },
  STAMINA: async (db, M) => {
    const problems = [];
    const cap = Number(await one(db, `select public.hr_hunt_limit('stamina_max_min')::bigint * 60000`));
    if (cap !== M.HSD.STAMINA_MAX_MS) problems.push(`the database's cap ${cap} is not STAMINA_MAX_MS ${M.HSD.STAMINA_MAX_MS}`);
    /* (1) BOTH PATHS on a hunt the pool ends: the tick cadence and a client's odd instants. */
    const odd = (from) => [37123, 131000, 132000, 300000, 348411, 349000, 600000, 777777, 901001, 1200000, 1500000, SPAN_MS]
      .map((d) => from + d);
    const r = await compareRuns(db, M, { ...STRONG, stamina: 10 * 60000 }, ticksOf(90000, SPAN_MS), odd);
    const a = canon(r.a); const b = canon(r.b);
    if (a !== b) problems.push(`a stamina-bound hunt settled at a client's instants wrote different rows than on the tick ${firstDiff(a, b)}`);
    if (!r.a.session || r.a.session.end_reason !== 'stamina') problems.push(`CONTROL: the 10-minute pool ended the hunt '${r.a.session && r.a.session.end_reason}'`);
    if (Number(r.a.stamina) !== 0) problems.push(`the emptied pool's row reads ${r.a.stamina}, not 0`);
    const t = r.a.tally || {};
    if (!(Number(t.paid_ms) - Number(t.down_ms) >= 600000 && Number(t.paid_ms) - Number(t.down_ms) < 600000 + 10000)) {
      problems.push(`a 10-minute pool hunted ${t.paid_ms} ms with ${t.down_ms} ms knocked out`);
    }
    /* (2) KNOCKED-OUT TIME RESTS THE POOL: end = start − paid + down. */
    await inTx(db, async () => {
      const { sid, from } = await hunter(db, M, { ...WEAK, stamina: 20 * 60000 });
      await settleTo(db, M, from + SPAN_MS);
      const s = await snapshot(db, sid);
      const tt = s.tally || {};
      if (!(Number(tt.down_ms) > 0)) problems.push(`CONTROL: the weak hunter was never knocked out (${JSON.stringify(tt)})`);
      const want = Math.max(0, 20 * 60000 - Number(tt.paid_ms) + Number(tt.down_ms));
      if (Number(s.stamina) !== want) problems.push(`after ${tt.paid_ms} ms paid and ${tt.down_ms} ms down a 20-minute pool reads ${s.stamina}, want ${want}`);
      /* stamina_low (master plan row 4): a 20-minute pool is under the hour. */
      const low = await one(db, `select count(*)::int from public.hunt_session_events where session_id = $1 and type = 'stamina_low'`, [sid]);
      if (low !== 1) problems.push(`a hunt under an hour of stamina journalled ${low} stamina_low event(s), want 1`);
      /* A KNOCKOUT IS FLAT (row 16): every death row of the hunt names 60 s. */
      const kos = await q(db, `select distinct (meta->>'recovery_ms')::bigint ms from public.player_ledger
                                where session_id = $1 and kind = 'combat' and intent = 'death'`, [sid]);
      if (kos.length !== 1 || Number(kos[0].ms) !== M.HSD.KNOCKOUT_MS) problems.push(`the hunt's knockouts were ${JSON.stringify(kos)}, not a flat ${M.HSD.KNOCKOUT_MS} ms`);
      /* The hunt is over, so the envelope shows the pool RESTED to now from the row. */
      const env = await one(db, 'select public.hr_state_of($1, 0)', [UID]);
      const rested = Number(await one(db, 'select public.hr_stamina_of($1, 0, now())', [UID]));
      if (!env || !env.stamina || Number(env.stamina.ms) !== rested || Number(env.stamina.max_ms) !== cap
          || env.stamina.hunting !== false || !(rested >= Number(s.stamina))) {
        problems.push(`the envelope projected ${JSON.stringify(env && env.stamina)} against a row of ${s.stamina} rested to ${rested}`);
      }
    });
    /* (3) FORGERIES are refused and move nothing. */
    await inTx(db, async () => {
      const { from } = await hunter(db, M, STRONG);
      const before = await one(db, 'select jsonb_build_object($2::text, gold, $3::text, stamina_at) from public.player_state where user_id = $1 and slot = 0',
        [UID, 'gold', 'at']);
      const cases = [
        ['an undrained pool', (o) => { o.hunt.stamina += 60000; }, 'bad_stamina'],
        ['knocked-out time no recovery backs', (o) => { o.hunt.paid_ms -= 12000; o.hunt.down_ms += 12000; o.hunt.stamina += 24000; }, 'bad_stamina'],
        ['a missing pool', (o) => { delete o.hunt.stamina; }, 'bad_stamina'],
        ['a stamina end on a full pool', (o) => { o.hunt.ended = { reason: 'stamina', at: o.hunt.to }; }, 'end_not_proven'],
      ];
      for (const [label, tamper, want] of cases) {
        const x = await settleTo(db, M, from + 120000, { tamper });
        if (!x.res || x.res.error !== want) problems.push(`${label} answered ${JSON.stringify(x.res).slice(0, 200)}, want ${want}`);
        const now = await one(db, 'select jsonb_build_object($2::text, gold, $3::text, stamina_at) from public.player_state where user_id = $1 and slot = 0',
          [UID, 'gold', 'at']);
        if (canon(now) !== canon(before)) problems.push(`${label} moved the character: ${JSON.stringify(now)}`);
      }
    });
    /* (4) AN EMPTY POOL CANNOT ENTER A HUNT; a rested one can. */
    await inTx(db, async () => {
      await newUser(db);
      await asUser(db, UID);
      await one(db, 'select public.hr_create_character(0)');
      await db.query(`update public.hr_hunt_config set enabled = true where id`);
      await db.query(`update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = $1 and slot = 0`, [UID]);
      const e0 = await one(db, `select public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, null, $1::uuid)`, [idem()]);
      if (!e0 || e0.error !== 'no_stamina') problems.push(`an empty pool entered a hunt: ${JSON.stringify(e0)}`);
      await db.query(`update public.player_state set stamina_at = now() - interval '1 hour' where user_id = $1 and slot = 0`, [UID]);
      const e1 = await one(db, `select public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, null, $1::uuid)`, [idem()]);
      if (!e1 || e1.ok !== true) problems.push(`an hour's rest did not reopen the hunt: ${JSON.stringify(e1)}`);
    });
    return problems;
  },
  BUY: async (db, M) => {
    const problems = [];
    const odd = (from) => [37123, 131000, 132000, 300000, 348411, 349000, 600000, 777777, 901001, 1200000, 1500000, SPAN_MS]
      .map((d) => from + d);
    /* (1) BOTH PATHS buy the same heals (lane D's default bar: the bag's heal,
       then the shop's), and the gold moved is exactly coins − Waste. */
    const price = Number(await one(db, `select price from public.hr_hunt_basic_supplies where basic_id = 'salted_shrimp'`));
    const BUYER = { ...WEAK, slots: SHOP_BAR, supply: SWITCH, gold: 25 * price };
    const g0 = await inTx(db, async () => { await hunter(db, M, BUYER); return Number(await one(db, 'select gold from public.player_state where user_id = $1 and slot = 0', [UID])); });
    if (!(price > 0)) problems.push('CONTROL: the shop catalogue has no salted_shrimp');
    const r = await compareRuns(db, M, BUYER, ticksOf(90000, SPAN_MS), odd);
    const a = canon(r.a); const b = canon(r.b);
    if (a !== b) problems.push(`NPC buys settled at a client's instants wrote different rows than on the tick ${firstDiff(a, b)}`);
    const t = r.a.tally || {};
    const bought = Number((t.bought || {}).salted_shrimp || 0);
    if (!(bought > 0)) problems.push(`CONTROL: the buyer bought nothing (${JSON.stringify(t)})`);
    if (Number(t.supply_gold) !== bought * price) problems.push(`the tally's Waste is ${t.supply_gold} for ${bought} heals at ${price}`);
    const journalled = -Number((r.a.buys || {}).gold || 0);
    if (journalled !== Number(t.supply_gold)) problems.push(`the supply_buy rows debit ${journalled}, the tally says ${t.supply_gold}`);
    if (Number(r.a.gold) !== g0 + Number(t.coins) + Number(t.cover_gold) - Number(t.supply_gold)) {
      problems.push(`gold ${r.a.gold} is not start ${g0} + coins ${t.coins} + cover ${t.cover_gold} − Waste ${t.supply_gold}`);
    }
    if (Number(r.a.gold) < 300 && Number(t.supply_gold) > 0) problems.push(`the buyer's gold ${r.a.gold} went under the 300 floor`);
    /* (2) GOLD_OUT IS PROVED FROM THE PURSE: claimed with gold to spare above
       the floor it is refused; claimed with gold under floor + price it lands. */
    await inTx(db, async () => {
      const { sid, from } = await hunter(db, M, { ...WEAK, slots: SHOP_BAR, supply: SWITCH });
      const claim = (o) => { o.hunt.ended = { reason: 'gold_out', at: o.hunt.to }; };
      await db.query('update public.player_state set gold = 100000 where user_id = $1 and slot = 0', [UID]);
      const rich = await settleTo(db, M, from + 120000, { tamper: claim });
      if (!rich.res || rich.res.error !== 'end_not_proven') problems.push(`gold_out with 100000 gold answered ${JSON.stringify(rich.res).slice(0, 200)}`);
      await db.query('update public.player_state set gold = 0 where user_id = $1 and slot = 0', [UID]);
      const poor = await settleTo(db, M, from + 120000, { tamper: claim });
      if (!poor.res || poor.res.ok !== true) problems.push(`gold_out with 0 gold answered ${JSON.stringify(poor.res).slice(0, 200)}`);
      const s = await snapshot(db, sid);
      if (!s.session || s.session.end_reason !== 'gold_out') problems.push(`a proved gold_out left the hunt '${s.session && s.session.end_reason}'`);
    });
    /* (3) FORGERIES: loot never looted, an item that is no cover item, loot sold
       for no purchase, a drink bought before mana, a shop use the bar does not name. */
    await inTx(db, async () => {
      const { from } = await hunter(db, M, { ...WEAK, slots: SHOP_BAR, supply: SWITCH, gold: 25 * price });
      const before = await one(db, 'select gold from public.player_state where user_id = $1 and slot = 0', [UID]);
      /* SELL-TO-COVER IS JUNK ONLY (Master Design Reference §8 review): bones
         are never sold to cover a purchase — no shipped item is junk, so the
         catalogue lists nothing and the settle refuses not_coverable. */
      {
        const x = await settleTo(db, M, from + SPAN_MS, { tamper: (o) => { o.hunt.cover = { bones: 1 }; o.hunt.buys = { salted_shrimp: 1 }; } });
        if (!x.res || x.res.error !== 'not_coverable') problems.push(`bones sold to cover answered ${JSON.stringify(x.res).slice(0, 200)}, want not_coverable`);
        if (Number(await one(db, 'select count(*) from public.hr_hunt_cover_items')) !== 0) problems.push('the shipped cover catalogue lists an item no data row flags junk');
      }
      /* The remaining forgeries need a coverable row: a FIXTURE junk catalogue,
         rolled back with the transaction. */
      await db.query(`insert into public.hr_hunt_cover_items (item_id, unit) values ('bones', 1), ('dragon_gem', 50)
                        on conflict (item_id) do nothing`);
      const cases = [
        ['loot the session never looted', (o) => { o.hunt.cover = { dragon_gem: 1 }; o.hunt.buys = { salted_shrimp: 1 }; }, 'cover_over'],
        ['an item that is no cover item', (o) => { o.hunt.cover = { cooked_shrimp: 1 }; o.hunt.buys = { salted_shrimp: 1 }; }, 'not_coverable'],
        ['loot sold for no purchase', (o) => { o.hunt.cover = { bones: 1 }; o.hunt.buys = {}; }, 'cover_unspent'],
        ['a drink before mana', (o) => { o.hunt.buys = { thin_turnip_juice: 1 }; }, 'kind_not_sold'],
        ['a shop use the bar does not name', (o) => { o.hunt.buys = { plain_steel_arrows: 1 }; }, 'not_on_bar'],
        /* ONE consumable lane: 30 min admits 1800000 / 2000 + 1 = 901 heal + drink buys. */
        ['more buys than the consumable lane admits', (o) => { o.hunt.buys = { salted_shrimp: 902 }; }, 'too_many_buys'],
      ];
      for (const [label, tamper, want] of cases) {
        const x = await settleTo(db, M, from + SPAN_MS, { tamper });
        if (!x.res || x.res.error !== want) problems.push(`${label} answered ${JSON.stringify(x.res).slice(0, 200)}, want ${want}`);
        const now = await one(db, 'select gold from public.player_state where user_id = $1 and slot = 0', [UID]);
        if (Number(now) !== Number(before)) problems.push(`${label} moved gold ${before} -> ${now}`);
      }
      /* THE FLOOR: gold set so that, after the coins this window credits, one shop
         heal would leave 299 — one under the 300 floor. The credited coins are read
         off a first refusal at 0 gold (its detail states the gold it saw); a
         one-swing window, so the purse cannot change what the swings earn. */
      const shrimp = Number(await one(db, `select price from public.hr_hunt_basic_supplies where basic_id = 'salted_shrimp'`));
      await db.query('update public.player_state set gold = 0 where user_id = $1 and slot = 0', [UID]);
      const probe0 = await settleTo(db, M, from + 2500, { tamper: (o) => { o.hunt.buys = { salted_shrimp: 1 }; o.hunt.cover = {}; delete o.hunt.ended; } });
      const credited = Number(((probe0.res || {}).detail || {}).gold);
      if (!(probe0.res && probe0.res.error === 'gold_short' && Number.isFinite(credited))) problems.push(`CONTROL: the 0-gold probe answered ${JSON.stringify(probe0.res).slice(0, 200)}`);
      await db.query('update public.player_state set gold = $2 where user_id = $1 and slot = 0', [UID, 299 + shrimp - credited]);
      const fl = await settleTo(db, M, from + 2500, { tamper: (o) => { o.hunt.buys = { salted_shrimp: 1 }; o.hunt.cover = {}; delete o.hunt.ended; } });
      if (!fl.res || fl.res.error !== 'gold_short') problems.push(`a buy taking gold under the floor answered ${JSON.stringify(fl.res).slice(0, 200)}, want gold_short`);
      await db.query('update public.player_state set gold = $2 where user_id = $1 and slot = 0', [UID, before]);
      /* A SHOT ON A SET THAT CHOSE 'end' (Combat Design Bible v1.4): the bar names
         it, the set did not switch to the store — refused store_off, nothing moved. */
      await db.query(`update public.player_action_sets set slots = slots || '[{"item":"plain_steel_arrows","on":true,"conditions":[]}]'::jsonb,
                             supply_source = 'mine', on_empty = 'end'
                        where user_id = $1 and slot = 0`, [UID]);
      const so = await settleTo(db, M, from + SPAN_MS, { tamper: (o) => { o.hunt.buys = { plain_steel_arrows: 1 }; } });
      if (!so.res || so.res.error !== 'store_off') problems.push(`a shot bought on an "end" set answered ${JSON.stringify(so.res).slice(0, 200)}, want store_off`);
      if (Number(await one(db, 'select gold from public.player_state where user_id = $1 and slot = 0', [UID])) !== Number(before)) problems.push('a store_off refusal moved gold');
      /* The choice is the player's, through hr_action_set_options, refused not clamped
         (an edit to the RUNNING set waits for its settle, so settle it first). */
      await db.query(`update public.player_action_sets set slots = slots - (jsonb_array_length(slots) - 1) where user_id = $1 and slot = 0`, [UID]);
      await settleTo(db, M, from + SPAN_MS + 1000);
      await asUser(db, UID);
      const pick = async (opts) => one(db, 'select public.hr_action_set_options(0, 0, $1::jsonb, gen_random_uuid())', [JSON.stringify(opts)]);
      const badSrc = await pick({ supply_source: 'auto' });
      const badEmp = await pick({ on_empty: 'store' });
      const good = await pick({ supply_source: 'store', on_empty: 'switch' });
      const keep = await pick({ target_mode: 'nearest' });
      if (!badSrc || badSrc.error !== 'bad_supply_source') problems.push(`supply_source 'auto' answered ${JSON.stringify(badSrc)}`);
      if (!badEmp || badEmp.error !== 'bad_on_empty') problems.push(`on_empty 'store' answered ${JSON.stringify(badEmp)}`);
      if (!good || good.supply_source !== 'store' || good.on_empty !== 'switch') problems.push(`store+switch answered ${JSON.stringify(good)}`);
      if (!keep || keep.supply_source !== 'store' || keep.on_empty !== 'switch') problems.push(`a call without the choice changed it: ${JSON.stringify(keep)}`);
    });
    /* A knockout in a hunt is flat (master plan row 16): a longer one is refused. */
    await inTx(db, async () => {
      const { from } = await hunter(db, M, WEAK);
      let fell = false;
      const x = await settleTo(db, M, from + SPAN_MS, { tamper: (o) => {
        if ((o.delta.deaths || []).length) { fell = true; o.delta.deaths[0].recovery_ms = 120000; }
      } });
      if (!fell) problems.push('CONTROL: the weak hunter never fell in the knockout case');
      else if (!x.res || x.res.error !== 'bad_knockout') problems.push(`a two-minute knockout answered ${JSON.stringify(x.res).slice(0, 200)}`);
    });
    return problems;
  },
  RESUME: async (db, M) => {
    const problems = [];
    const gather = await one(db, `select activity_id from public.hr_activities where kind = 'gather'
                                   and (req_lv is null or req_lv <= 1) order by activity_id limit 1`);
    const locked = await one(db, `select activity_id from public.hr_activities where kind = 'gather'
                                   and req_lv >= 50 order by activity_id limit 1`);
    const travel = Number(await one(db, `select travel_s from public.hr_hunt_travel where hunt_id = 'goblin_warren'`));
    await inTx(db, async () => {
      const { sid, from } = await hunter(db, M, { ...WEAK, lastActivity: { kind: 'gather', id: gather } });
      await settleTo(db, M, from + SPAN_MS);
      const s = await snapshot(db, sid);
      const ended = await one(db, `select ended_at from public.hunt_sessions where id = $1`, [sid]);
      if (s.active !== `gather:${gather}`) problems.push(`an automatic end left the pointer at ${s.active}, not gather:${gather}`);
      if (new Date(s.active_since).getTime() !== new Date(ended).getTime() + travel * 1000) {
        problems.push(`the resumed activity starts at ${s.active_since}, not the end + the ${travel} s walk home`);
      }
      const anchor = await one(db, `select real_return_at from public.hr_return_anchor where user_id = $1 and slot = 0`, [UID]);
      /* Raise-only: at least the walk-home instant. */
      if (!anchor || new Date(anchor).getTime() < new Date(s.active_since).getTime()) {
        problems.push(`the automatic end left presence anchor ${anchor}, before the walk-home instant ${s.active_since}`);
      }
    });
    await inTx(db, async () => {
      const { sid, from } = await hunter(db, M, { ...WEAK, lastActivity: { kind: 'gather', id: locked } });
      await settleTo(db, M, from + SPAN_MS);
      const s = await snapshot(db, sid);
      if (s.active !== 'idle:' || !(s.resume || []).some((m) => m.resumed === false)) {
        problems.push(`a level-locked activity was resumed (${s.active}, ${JSON.stringify(s.resume)})`);
      }
    });
    await inTx(db, async () => {
      const { sid, from } = await hunter(db, M, { ...STRONG, lastActivity: { kind: 'gather', id: gather } });
      await asUser(db, UID);
      const lv = await one(db, 'select public.hr_hunt_leave(0, $1::uuid)', [idem()]);
      await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
      if (!lv || lv.ok !== true) { problems.push(`CONTROL: leave refused ${JSON.stringify(lv)}`); return; }
      await settleTo(db, M, from + SPAN_MS);
      const s = await snapshot(db, sid);
      if (s.session && s.session.end_reason === 'left' && s.active !== 'idle:') problems.push(`a manual leave resumed ${s.active}`);
      if ((s.resume || []).length) problems.push('a manual leave journalled a resume');
    });
    return problems;
  },
  ACTIONBAR: async (db, M) => inTx(db, async () => {
    const problems = [];
    await newUser(db);
    await asUser(db, UID);
    await one(db, 'select public.hr_create_character(0)');
    const slot = { item: '*heal', on: true, conditions: [{ subject: 'self_mana_pct', op: '<=', value: 30 }] };
    const put = (slots) => one(db, 'select public.hr_action_set_put(0, 1, $1, $2::jsonb, $3::uuid)', ['bar', JSON.stringify(slots), idem()]);
    const r20 = await put(Array.from({ length: 20 }, () => slot));
    if (!r20 || r20.ok !== true) problems.push(`a 20-slot bar with a mana condition was refused: ${JSON.stringify(r20)}`);
    const r21 = await put(Array.from({ length: 21 }, () => slot));
    if (!r21 || r21.why !== 'too_many_slots') problems.push(`a 21-slot bar answered ${JSON.stringify(r21)}`);
    const shopBar = await put([{ item: '*heal_shop', on: true, conditions: [] }, { item: '*mana_shop', on: true, conditions: [] },
      { item: '*mana', on: true, conditions: [] }, { item: 'salted_shrimp', on: true, conditions: [] }]);
    if (!shopBar || shopBar.ok !== true) problems.push(`a bar of shop targets and a shop heal was refused: ${JSON.stringify(shopBar)}`);
    /* A shop SHOT may sit on the bar: it is how the quiver may buy it (row 1). */
    const shot = await put([{ item: 'plain_steel_arrows', on: true, conditions: [] }]);
    if (!shot || shot.ok !== true) problems.push(`a shop SHOT on the bar answered ${JSON.stringify(shot)}`);
    const sp = await put([{ kind: 'spell', item: 'cooked_shrimp', on: true, conditions: [] }]);
    if (!sp || sp.why !== 'kind_reserved') problems.push(`a spell slot answered ${JSON.stringify(sp)}`);
    const mode = (t, p, f = 300, preset = 1) => one(db, 'select public.hr_action_set_options(0, $1, $2::jsonb, $3::uuid)',
      [preset, JSON.stringify({ target_mode: t, pull_count: p, gold_floor: f }), idem()]);
    /* ONE jsonb of options (architecture contracts S4): an unknown key, a non-object
       and a value of the wrong type are refused by name; nothing is stored. */
    for (const [opts, want] of [[{ bones: 'keep' }, 'bad_option'], [[1, 2], 'bad_options'], [{}, 'bad_options'],
                                [{ pull_count: '3' }, 'bad_pull_count'], [{ pull_count: 2.5 }, 'bad_pull_count'],
                                [{ supply_source: 7 }, 'bad_supply_source']]) {
      const x = await one(db, 'select public.hr_action_set_options(0, 1, $1::jsonb, $2::uuid)', [JSON.stringify(opts), idem()]);
      if (!x || x.error !== want) problems.push(`options ${JSON.stringify(opts)} answered ${JSON.stringify(x)}, want ${want}`);
    }
    for (const [t, p, f, want] of [['follow', 2, 300, 'target_mode_party_only'], ['sideways', 2, 300, 'bad_target_mode'],
                                   ['weakest', 0, 300, 'bad_pull_count'], ['weakest', 9, 300, 'bad_pull_count'],
                                   ['weakest', 2, -1, 'bad_gold_floor'], ['weakest', 2, 100001, 'bad_gold_floor']]) {
      const x = await mode(t, p, f);
      if (!x || x.error !== want) problems.push(`options ${t}/${p}/${f} answered ${JSON.stringify(x)}, want ${want}`);
    }
    const ok = await mode('strongest', 8, 1200);
    const row = await one(db, `select jsonb_build_array(target_mode, pull_count, gold_floor) from public.player_action_sets
                                where user_id = $1 and slot = 0 and preset = 1`, [UID]);
    if (!ok || ok.ok !== true || canon(row) !== canon(['strongest', 8, 1200])) problems.push(`honest options answered ${JSON.stringify(ok)}, stored ${JSON.stringify(row)}`);
    const p0 = await mode('weakest', 2, 300, 0);
    if (!p0 || p0.ok !== true) problems.push(`preset 0 (never saved) refused options: ${JSON.stringify(p0)}`);
    /* A new character's bar: the shop slots are OFF (master plan row 25), and it
       resumes fishing the Shrimp Spot. */
    const dflt = await one(db, `select slots from public.hr_hunt_default_preset where id`);
    const shopOn = (dflt || []).filter((sl) => String(sl.item).endsWith('_shop') && sl.on !== false);
    if (shopOn.length) problems.push(`the default bar has a shop slot ON: ${JSON.stringify(shopOn)}`);
    const resume = await one(db, `select last_activity_kind || ':' || last_activity_id from public.player_state where user_id = $1 and slot = 0`, [UID]);
    if (resume !== `${M.HSD.DEFAULT_RESUME.kind}:${M.HSD.DEFAULT_RESUME.id}`) problems.push(`a new character resumes ${resume}`);
    /* hr_vigour_refill is gone (row 20; deleted outright, lane C2). */
    if (await one(db, `select to_regprocedure('public.hr_vigour_refill(integer,uuid)') is not null`)) {
      problems.push('a client can still buy Vigour (hr_vigour_refill)');
    }
    return problems;
  }),
  TALLY: async (db, M) => inTx(db, async () => {
    const { sid, from } = await hunter(db, M, STRONG);
    for (const t of ticksOf(120000, 20 * 60000)(from)) await settleTo(db, M, t);
    const r = await q(db, `
      select t.coins, t.kills, t.deaths, t.xp, t.loot, t.supplies,
             (select coalesce(sum(gold), 0) from public.player_ledger where session_id = $1 and kind <> 'hunt') as l_coins,
             (select coalesce(sum((meta->>'kills')::bigint), 0) from public.player_ledger where session_id = $1 and kind <> 'hunt' and meta ? 'kills') as l_kills,
             (select count(*) from public.player_ledger where session_id = $1 and kind = 'combat' and intent = 'death') as l_deaths,
             (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (select x.key k, sum(x.value::numeric) v
                from public.player_ledger l, jsonb_each_text(coalesce(l.meta->'delta'->'x', '{}'::jsonb)) x
               where l.session_id = $1 and l.kind <> 'hunt' group by 1) s) as l_xp,
             (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (select x.key k, sum(x.value::numeric) v
                from public.player_ledger l, jsonb_each_text(coalesce(l.meta->'delta'->'i', '{}'::jsonb)) x
               where l.session_id = $1 and l.kind <> 'hunt' group by 1) s) as l_loot,
             (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (select x.key k, sum(x.value::numeric) v
                from public.player_ledger l, jsonb_each_text(coalesce(l.meta->'items', '{}'::jsonb)) x
               where l.session_id = $1 and l.intent = 'hunt_consume' group by 1) s) as l_sup,
             (select count(*) from public.player_ledger where session_id = $1 and kind = 'combat' and intent = 'accrue') as settles,
             (select count(*) from public.hunt_bag b where b.session_id = $1
                and b.qty_loaded <> b.qty_left + coalesce((t.supplies->>b.item_id)::bigint, 0)) as bag_bad
        from public.hunt_session_tally t where t.session_id = $1`, [sid]);
    const x = r[0]; const problems = [];
    const n = (o) => canon(Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, Number(v)])));
    if (Number(x.coins) !== Number(x.l_coins)) problems.push(`tally coins ${x.coins} <> Σ ledger gold ${x.l_coins}`);
    if (Number(x.kills) !== Number(x.l_kills)) problems.push(`tally kills ${x.kills} <> Σ meta.kills ${x.l_kills}`);
    if (Number(x.deaths) !== Number(x.l_deaths)) problems.push(`tally deaths ${x.deaths} <> death rows ${x.l_deaths}`);
    if (n(x.xp) !== n(x.l_xp)) problems.push(`tally xp ${n(x.xp)} <> Σ ledger xp ${n(x.l_xp)}`);
    if (n(x.loot) !== n(x.l_loot)) problems.push(`tally loot ${n(x.loot)} <> Σ ledger items ${n(x.l_loot)}`);
    if (n(x.supplies) !== n(x.l_sup)) problems.push(`tally supplies ${n(x.supplies)} <> Σ consumption rows ${n(x.l_sup)}`);
    if (Number(x.bag_bad) !== 0) problems.push(`${x.bag_bad} bag line(s) break loaded = left + used`);
    if (!(Number(x.settles) >= 5) || !(Number(x.kills) > 0)) problems.push(`CONTROL: ${x.settles} settles, ${x.kills} kills — the fixture did not hunt`);
    return problems;
  }),
  PRESS: async (db, M) => inTx(db, async () => {
    const problems = [];
    const fixture = { minutesAgo: 20, skillsLevel: 25, hp: 20, inv: { cooked_shrimp: 10 }, bag: [{ item: 'cooked_shrimp', qty: 10 }],
      slots: [{ item: '*heal', on: false, conditions: [] }] };
    const { sid, from } = await hunter(db, M, fixture);
    /* A HEAL MUST BE POSSIBLE AT EVERY BOUNDARY, or the arm is a coin flip: a
       heal fires only on a deficit, and whether the fighter is hurt before the
       press depends on the per-database seed secret — a press that "fired
       early" with nothing to heal fires at the same boundary either way, and
       the mutant survived exactly that (2026-10-14). Fixture setup by the
       harness owner, not a path under test. */
    await db.query('update public.player_state set max_hp = 60, hp = 20 where user_id = $1 and slot = 0', [UID]);
    const at = from + 7000;                       // two boundaries already behind it at a 2.4 s swing
    const r1 = await settleTo(db, M, at, { pressAtMs: at, pressSlot: 0 });
    let s = await snapshot(db, sid);
    const used = Number(((s.tally || {}).supplies || {}).cooked_shrimp || 0);
    const queued = await one(db, 'select jsonb_array_length(presses) from public.hunt_sessions where id = $1', [sid]);
    if (used === 0 && queued !== 1) problems.push(`the press neither fired nor stayed queued (queued ${queued})`);
    if (used === 0) await settleTo(db, M, from + 60000);
    s = await snapshot(db, sid);
    const cd = Number((s.session.cooldowns || {}).consumable || 0);
    if (!(Number(((s.tally || {}).supplies || {}).cooked_shrimp || 0) === 1)) problems.push('the press did not fire exactly one heal');
    if (!(cd - 2000 >= at)) problems.push(`the press fired at ${cd - 2000 - from} ms into the window — BEFORE it was pressed at ${at - from} ms`);
    if (!(r1.res && r1.out)) problems.push('CONTROL: the press settle did not run');
    // a press with nothing in the bag that could fire it is refused, nothing written
    await db.query('update public.hunt_bag set qty_left = 0 where session_id = $1', [sid]);
    const exec = makeExec(db);
    const [read] = await exec(M.HS.HUNT_READ_SQL, [UID, 0, null]);
    const [r] = await exec(`select public.hr_hunt_apply($1::uuid, 0, $2::uuid, $3::bigint, $4::uuid, '{}'::text::jsonb, '{}'::text::jsonb, null, $5::text::jsonb) as r`,
      [UID, sid, read.state.version, idem(), JSON.stringify({ slot: 0, at: Date.now() - 1000 })]);
    if (!r || !r.r || r.r.error !== 'bag_empty') problems.push(`a press on an empty bag answered ${JSON.stringify(r && r.r)}`);
    return problems;
  }),
  END: async (db, M) => inTx(db, async () => {
    const problems = [];
    /* The bag's heal only: with lane D's default bar the shop would carry on
       (and a purse of nothing would end it gold_out — BUY's subject). */
    const { sid, from } = await hunter(db, M, { minutesAgo: 10, hp: 2, inv: { cooked_shrimp: 3 }, bag: [{ item: 'cooked_shrimp', qty: 3 }],
      slots: BAG_ONLY });
    /* A long enough window that 3 shrimp run out on any seed stream (S2 re-keyed
       the swing labels; 5 minutes no longer emptied the bag). */
    await settleTo(db, M, from + 9 * 60000);
    const s = await snapshot(db, sid);
    if (s.session.end_reason !== 'heals_out') problems.push(`a dry bag ended the hunt '${s.session.end_reason}', not heals_out`);
    /* heals_out is automatic: the character walks home and resumes its last
       activity — a new one's default, fishing the Shrimp Spot (row 25). */
    const resume = `${M.HSD.DEFAULT_RESUME.kind}:${M.HSD.DEFAULT_RESUME.id}`;
    if (s.active !== resume) problems.push(`the pointer is ${s.active} after an automatic end, not ${resume}`);
    if (!(s.events || []).some((e) => e[0] === 'ended')) problems.push('no `ended` event was journalled');
    const endedMs = new Date(s.session.ended_at).getTime();
    if (!(endedMs > from && endedMs < from + 9 * 60000)) problems.push('ended_at is not inside the settled window');
    return problems;
  }),
  /* DEATHXP — THE PRICE OF A FALL, end to end (Tyler 2026-10-14). The weak
     hunter falls inside real settles: every fall's event states its price, the
     settle journals ONE death_xp row (kind 'hunt') per settle that cost
     anything, player_skills = start + the window's gains − the price, no skill
     ends below the level it started at, every fall's share is within the data
     row's bound, no level_up event names a level the bank does not hold, and
     the database row equals the data file. A proposal that over-charges, or
     that would take a skill below its starting level, is refused and moves
     nothing. */
  DEATHXP: async (db, M) => inTx(db, async () => {
    const problems = [];
    const permille = await one(db, `select public.hr_hunt_limit('death_xp_permille')`);
    if (permille !== Math.round(M.HSD.DEATH_XP_LOSS * 1000)) {
      problems.push(`hr_hunt_limits death_xp_permille is ${permille}, src/data says ${M.HSD.DEATH_XP_LOSS} (drift)`);
    }
    const { sid, from } = await hunter(db, M, WEAK);
    const xp0 = Object.fromEntries((await q(db, `select skill_id, xp from public.player_skills where user_id = $1 and slot = 0`, [UID]))
      .map((r) => [r.skill_id, Number(r.xp)]));
    /* (a) the forged proposals, each in its own savepoint, on the first window */
    for (const [what, tamper, want] of [
      ['ten times the price', (out) => { out.hunt.death_xp = out.hunt.death_xp.map((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v * 10 + 50]))); }, 'death_xp_over'],
      ['a price below the starting level', (out) => { out.hunt.death_xp = out.hunt.death_xp.map((d, i) => (i === 0 ? { ...d, magic: 3 } : d)); }, 'death_xp_over'],
      ['a fall with its price left off', (out) => { out.hunt.death_xp = out.hunt.death_xp.slice(1); }, 'bad_death_xp'],
    ]) {
      await db.query('savepoint dxp');
      let cut = null;
      for (const t of ticksOf(90000, 30 * 60000)(from)) {
        const pre = await settleTo(db, M, t, { tamper: (out) => { if ((out.delta.deaths || []).length) { tamper(out); cut = out; } } });
        if (cut) { if (!pre.res || pre.res.error !== want) problems.push(`${what}: answered ${JSON.stringify(pre.res).slice(0, 200)}, not ${want}`); break; }
        if (pre.res && pre.res.ok !== true) { problems.push(`${what}: an honest window was refused ${JSON.stringify(pre.res).slice(0, 160)}`); break; }
      }
      if (!cut) problems.push(`CONTROL (${what}): no window fell, so the forgery was never sent`);
      else {
        const rows = await one(db, `select count(*)::int from public.player_ledger where session_id = $1 and intent = 'death_xp'`, [sid]);
        const deaths = await one(db, `select count(*)::int from public.player_ledger where session_id = $1 and intent = 'death'`, [sid]);
        if (rows !== 0 || deaths !== 0) problems.push(`${what}: the refused settle left ${rows} death_xp / ${deaths} death row(s)`);
      }
      await db.query('rollback to savepoint dxp');
    }
    /* (b) the honest hunt */
    for (const t of ticksOf(90000, 30 * 60000)(from)) { const r = await settleTo(db, M, t); if (r.skipped === 'closed') break; }
    const fin = Object.fromEntries((await q(db, `select skill_id, xp from public.player_skills where user_id = $1 and slot = 0`, [UID]))
      .map((r) => [r.skill_id, Number(r.xp)]));
    const gained = Object.fromEntries((await q(db, `select x.key k, sum((x.value #>> '{}')::bigint)::bigint v
        from public.player_ledger l, jsonb_each(l.meta->'delta'->'x') x where l.session_id = $1 and l.kind <> 'hunt' group by 1`, [sid]))
      .map((r) => [r.k, Number(r.v)]));
    const lostRows = await q(db, `select meta from public.player_ledger where session_id = $1 and kind = 'hunt' and intent = 'death_xp' order by id`, [sid]);
    const lost = {};
    for (const r of lostRows) for (const [k, v] of Object.entries(r.meta.xp || {})) lost[k] = (lost[k] || 0) + Number(v);
    const falls = await q(db, `select data from public.hunt_session_events where session_id = $1 and type = 'fall' order by at, id`, [sid]);
    const evLost = {};
    for (const e of falls) for (const [k, v] of Object.entries((e.data && e.data.xp_lost) || {})) evLost[k] = (evLost[k] || 0) + Number(v);
    if (!falls.length) problems.push('CONTROL: the weak hunter never fell');
    if (!Object.values(lost).some((v) => v > 0)) problems.push('CONTROL: no fall cost any XP');
    if (falls.some((e) => !e.data || typeof e.data.xp_lost !== 'object' || typeof e.data.xp !== 'number')) {
      problems.push('a fall event does not state its price (xp_lost / xp)');
    }
    if (JSON.stringify(Object.entries(lost).sort()) !== JSON.stringify(Object.entries(evLost).sort())) {
      problems.push(`the journal's price ${JSON.stringify(lost)} is not the fall events' ${JSON.stringify(evLost)}`);
    }
    if (lostRows.some((r) => r.meta.reason !== 'death_xp' || !(r.meta.falls > 0))) problems.push('a death_xp row does not say why or for how many falls');
    for (const k of new Set([...Object.keys(xp0), ...Object.keys(fin)])) {
      const want = (xp0[k] || 0) + (gained[k] || 0) - (lost[k] || 0);
      if ((fin[k] || 0) !== want) problems.push(`${k}: banked ${fin[k]}, want start ${xp0[k] || 0} + gained ${gained[k] || 0} − lost ${lost[k] || 0} = ${want}`);
      if (M.XP.levelFromXp(fin[k] || 0) < M.XP.levelFromXp(xp0[k] || 0)) problems.push(`${k}: a fall cost a level`);
    }
    const ups = await q(db, `select data from public.hunt_session_events where session_id = $1 and type = 'level_up'`, [sid]);
    for (const u of ups) {
      if (Number(u.data.level) > M.XP.levelFromXp(fin[u.data.skill] || 0)) problems.push(`a level_up event names ${u.data.skill} ${u.data.level}, the bank holds ${M.XP.levelFromXp(fin[u.data.skill] || 0)}`);
    }
    return problems;
  }),

  /* TICK-0 — CRON TO EDGE. hr_tick_cron_run's (3c) body, off the pg_net
     queue, handed to `runTick` (the function index.ts's op:'tick' calls) over
     the real driver: the open session is settled once through settleHunt, the
     window lands as ONE accrue row stamped with the session, the clock
     advances, and a selector naming another session settles nothing. */
  'TICK-0': async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, STRONG);
    /* The world tick's own kill switch gates its hunt cohort too (the replay
       ships it off); production runs it on. */
    await db.query('update public.hr_tick_config set enabled = true where id');
    const exec = makeExec(db);
    const fire = async (hunts) => (await M.TK.runTick({ exec,
      body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: 90000, hunts } })).body;
    const stamped = async () => one(db, `select count(*)::int from public.player_ledger
                                          where session_id = $1 and kind = 'combat' and intent = 'accrue'`, [sid]);
    const other = await fire([{ user_id: UID, slot: 0, session_id: '00000000-0000-4000-8000-0000000c2eff' }]);
    if (!other.hunts || other.hunts.settled !== 0 || (other.hunts.reasons || {}).session_changed !== 1 || await stamped() !== 0) {
      problems.push(`a selector naming another session was not skipped by name: ${JSON.stringify(other.hunts)}`);
    }
    /* THE CRON LEG: hr_tick_cron_run (3c) leases the due session through
       hr_hunt_roster and queues its OWN body; that body, read off the pg_net
       queue, is what runTick is handed (plus one malformed selector, which
       parseHunts must drop). Supabase's pgcrypto / vault / pg_net are the
       token guards' pinned shims. */
    await db.exec(SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
    await db.query(`update public.hr_tick_config set flush_seconds = 90, cadence_seconds = 10, batch_limit = 200,
                      lease_ms = 30000, shards = 1,
                      edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue' where id`);
    await db.query('delete from net.http_request_queue');
    await db.query('select public.hr_tick_cron_run()');
    const bodies = (await q(db, `select convert_from(body, 'UTF8') as b from net.http_request_queue order by id`))
      .map((r) => JSON.parse(r.b)).filter((b) => Array.isArray(b.hunts));
    const huntBody = bodies[0];
    if (bodies.length !== 1 || !huntBody || huntBody.hunts.length !== 1 || huntBody.hunts[0].session_id !== sid
        || huntBody.hunts[0].user_id !== UID || huntBody.hunts[0].slot !== 0 || (huntBody.roster || []).length !== 0) {
      problems.push(`the cron did not queue ONE hunts body naming this session: ${JSON.stringify(bodies).slice(0, 300)}`);
      return problems;
    }
    huntBody.hunts.push({ user_id: 'not-a-uuid', slot: 0, session_id: sid });
    const f = (await M.TK.runTick({ exec, body: huntBody })).body;
    const rows = await stamped();
    const to = Number(await one(db, `select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_sessions where id = $1`, [sid]));
    if (!f.hunts || f.hunts.settled !== 1) problems.push(`runTick did not settle the hunt cohort: ${JSON.stringify(f)}`);
    if (rows !== 1) problems.push(`one tick settle wrote ${rows} accrue row(s) stamped with the session, not 1`);
    if (!(to > from + 40 * 60000)) problems.push(`the session clock did not advance to the fire's now (settled_to ${to - from} ms past the start)`);
    if (f.processed !== 0 || f.shadowed !== 0) problems.push(`an empty roster processed rows: ${JSON.stringify(f)}`);
    return problems;
  }),
  /* BESTIARY — NO LADDER PRICES A FIGHT. The charm and trophy combat
     multipliers were deleted with the closed rebuild (demolition safety review
     item 9: trophies stay as claims and display). The same session, the same
     instant (one transaction), settled once with no counters and once with
     20,000 server-counted kills of every monster the hunt spawns: the value it
     pays must be IDENTICAL. */
  /* SEAMS — the extension seams C2 leaves now (architecture contracts S1-S7),
     each proven on the real chain. */
  SEAMS: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, { minutesAgo: 10, slots: BAG_ONLY, hp: 99, skillsXp: { attack: 200000, strength: 200000, defense: 200000, hitpoints: 200000 } });
    /* S1 — the spawn cycle lives on an INSTANCE row (solo: id = the session id),
       never on hunt_sessions; a settle moves the instance, not the session. */
    const inst = await one(db, `select jsonb_build_object('id', i.id, 'kind', i.kind, 'v', i.version) from public.hunt_sessions h
                                 join public.hunt_instances i on i.id = h.instance_id where h.id = $1`, [sid]);
    if (!inst || inst.id !== sid || inst.kind !== 'solo') problems.push(`S1: the session's instance is ${JSON.stringify(inst)} — want a solo instance with the session's id`);
    const cols = await one(db, `select coalesce(jsonb_agg(column_name), '[]'::jsonb) from information_schema.columns
                                 where table_schema = 'public' and table_name = 'hunt_sessions' and column_name in ('pull_left', 'respawn_at')`);
    if ((cols || []).length) problems.push(`S1: hunt_sessions still carries ${JSON.stringify(cols)} — the cycle state belongs to the instance`);
    const ok = await settleTo(db, M, from + 120000);
    if (!ok.res || ok.res.ok !== true) problems.push(`S1: an honest settle answered ${JSON.stringify(ok.res).slice(0, 200)}`);
    const v1 = await one(db, `select i.version from public.hunt_sessions h join public.hunt_instances i on i.id = h.instance_id where h.id = $1`, [sid]);
    if (!(Number(v1) > Number(inst && inst.v))) problems.push(`S1: the settle did not move the instance (version ${inst && inst.v} -> ${v1})`);
    const read = await one(db, `select public.hr_hunt_engine_read($1::uuid, 0)`, [UID]).catch(() => null);
    if (read && read.instance !== undefined && read.instance !== sid) problems.push(`S1: the engine read names instance ${read.instance}`);
    /* THE FENCE SPARES THE HIRED HANDS (design ruling 2026-10-15): while this
       hunter's session is open, a worker accrue row lands and a gather accrue
       row is refused hunt_open — at the trigger itself. */
    const ledger = async (kind) => {
      try {
        await db.query('savepoint fence_probe');
        await db.query(`insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
                        values ($1, 0, $2, 'accrue', 0, '{}'::jsonb)`, [UID, kind]);
        await db.query('release savepoint fence_probe');
        return 'landed';
      } catch (e) { await db.query('rollback to savepoint fence_probe'); return String(e.message || e); }
    };
    const w = await ledger('worker');
    const g = await ledger('gather');
    if (w !== 'landed') problems.push(`FENCE: a worker accrue during the hunt was refused (${w}) — hired hands keep banking`);
    if (!/hunt_open/.test(g)) problems.push(`FENCE: a gather accrue during the hunt answered ${g} — the hero is still fenced`);
    /* S3 — the lanes and the interval are catalogue rows equal to the data. */
    const lanes = await one(db, `select jsonb_object_agg(lane, jsonb_build_object('ms', ms, 'active', active)) from public.hr_hunt_lanes`);
    for (const [l, x] of Object.entries(M.RS.COOLDOWN_LANES)) {
      if (!lanes || !lanes[l] || lanes[l].ms !== x.ms || lanes[l].active !== x.active) problems.push(`S3: hr_hunt_lanes.${l} is ${JSON.stringify(lanes && lanes[l])}, the data says ${JSON.stringify(x)}`);
    }
    const iv = await one(db, `select public.hr_hunt_limit('swing_interval_ms')`);
    if (Number(iv) !== M.C.COMBAT_BALANCE.tickMs) problems.push(`S3: swing_interval_ms is ${iv}, COMBAT_BALANCE.tickMs ${M.C.COMBAT_BALANCE.tickMs}`);
    /* X1 — hunting time is EXACT: a window that claims one swing more than its
       time holds (paid + down still = the window) is refused bad_clock. */
    const clock = await settleTo(db, M, from + 240000, { tamper: (o) => { o.hunt.swing_to += 1; } });
    if (!clock.res || clock.res.error !== 'bad_clock') problems.push(`X1: one swing more than the window holds answered ${JSON.stringify(clock.res).slice(0, 200)}, want bad_clock`);
    /* S3 — a cooldown on a RESERVED lane is not a key the session may store. */
    const lane = await settleTo(db, M, from + 240000, { tamper: (o) => { o.hunt.cooldowns = { ...(o.hunt.cooldowns || {}), offense: from + 1000 }; } });
    if (!lane.res || lane.res.error !== 'bad_cooldowns') problems.push(`S3: a cooldown on the reserved offense lane answered ${JSON.stringify(lane.res).slice(0, 200)}, want bad_cooldowns`);
    /* S6 — the hunting-clock step is reserved in hr_hunt_apply, between stamina and the shop. */
    const src = String(await one(db, `select prosrc from pg_proc where oid = 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)'::regprocedure`));
    const a5 = src.indexOf('(5a) THE STAMINA POOL'); const c5 = src.indexOf('(5c) THE HUNTING CLOCKS'); const b5 = src.indexOf('(5b) ');
    if (!(a5 >= 0 && c5 > a5 && b5 > c5)) problems.push(`S6: the (5c) hunting-clock step is not reserved between (5a) and (5b) (${a5}/${c5}/${b5})`);
    /* S7 — the stamina splice anchors on the server-clock line, which stays. */
    const settleText = readFileSync(join(ROOT, 'supabase', 'migrations', '2026-10-22-hunt-sessions-settle.sql'), 'utf8');
    const splice = settleText.slice(settleText.indexOf("'stamina', public.hr_stamina_view") - 600, settleText.indexOf("'stamina', public.hr_stamina_view"));
    if (/c_old constant text := \$a\$\s+'dungeon_cooldowns'/.test(splice) || !/c_old constant text := \$a\$\s+'now', now\(\),/.test(splice)) {
      problems.push("S7: the stamina splice does not anchor on the `'now', now(),` line");
    }
    const env = await one(db, `select public.hr_state_of($1::uuid, 0)`, [UID]);
    if (!env || !('stamina' in env)) problems.push('S7: the chain-end envelope projects no stamina');
    return problems;
  }),
  /* VALUE — THE VALUE BOUND (Security GO item 3; 2026-10-22-hunt-sessions-
     value-bound.sql). An honest settle lands; a window that claims more gold,
     more XP or more of a drop than K kills of this hunt's spawns can pay — or an
     item none of them drops — is refused value_over and moves nothing. */
  VALUE: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { from } = await hunter(db, M, { minutesAgo: 10, slots: BAG_ONLY, hp: 99,
      skillsXp: { attack: 200000, strength: 200000, defense: 200000, hitpoints: 200000 } });
    const g0 = Number(await one(db, 'select gold from public.player_state where user_id = $1 and slot = 0', [UID]));
    const cases = [
      ['a window paying a fortune in gold', (o) => { o.delta.gold = 1000000; }, 'gold'],
      ['a window teaching a fortune in XP', (o) => { o.delta.xp = { ...(o.delta.xp || {}), attack: 5000000 }; }, 'xp'],
      ['a window dropping a hundred bones per kill', (o) => { o.delta.items = { ...(o.delta.items || {}), bones: 100000 }; }, 'item'],
      ['a window dropping an item no spawn drops', (o) => { o.delta.items = { ...(o.delta.items || {}), dragon_gem: 1 }; }, 'item'],
    ];
    for (const [label, tamper, what] of cases) {
      const x = await settleTo(db, M, from + 120000, { tamper });
      const ok = x.res && x.res.error === 'value_over' && x.res.detail && x.res.detail.what === what;
      if (!ok) problems.push(`VALUE: ${label} answered ${JSON.stringify(x.res).slice(0, 220)}, want value_over/${what}`);
      const g = Number(await one(db, 'select gold from public.player_state where user_id = $1 and slot = 0', [UID]));
      if (g !== g0) problems.push(`VALUE: ${label} moved gold ${g0} -> ${g}`);
    }
    const honest = await settleTo(db, M, from + 120000);
    if (!honest.res || honest.res.ok !== true) problems.push(`VALUE: an honest settle answered ${JSON.stringify(honest.res).slice(0, 200)}`);
    const rows = await one(db, `select count(*) from public.hr_hunt_kill_bounds`);
    if (Number(rows) !== Object.keys(M.MONSTERS).length) problems.push(`VALUE: hr_hunt_kill_bounds has ${rows} rows for ${Object.keys(M.MONSTERS).length} monsters`);
    return problems;
  }),
  /* PARITY — ONE SETTLE, WHOEVER CUTS THE WINDOW (the successor of
     tests/world-tick-combat-parity.mjs C2 and world-tick-bestiary-parity B3:
     "the delta the tick proposes is byte-identical to the delta the player's
     own settle proposes for the same window"). The old tick had its own
     session builder beside the accrue path's and drifted from it four times.
     A hunt has one composition (hunt-settle.js settleOnce); this arm proves the
     tick's door, the player's door and the pieces the other arms compose all
     write the SAME rows for the same window, so a mode-keyed input — a read
     the tick skips, a clock the player's door rounds — goes red. */
  PARITY: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid } = await hunter(db, M, STRONG);
    const exec = makeExec(db);
    const now = Number(await one(db, `select floor(extract(epoch from now()) * 1000)::bigint`));
    await db.query('savepoint parity');
    const runs = {};
    for (const [door, go] of [
      ['tick', () => M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'tick', session: sid })],
      ['settle', () => M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'settle', minWindowMs: 0 })],
      ['pieces', () => settleTo(db, M, now)],
    ]) {
      const r = await go();
      if (door !== 'pieces' && (!r || r.outcome !== 'paid')) problems.push(`CONTROL: the ${door} door did not pay (${r && r.outcome}/${r && r.reason})`);
      runs[door] = canon(await snapshot(db, sid));
      await db.query('rollback to savepoint parity');
    }
    if (runs.tick !== runs.settle) problems.push(`the tick and the player's settle wrote different rows for one window ${firstDiff(runs.tick, runs.settle)}`);
    if (runs.tick !== runs.pieces) problems.push(`the tick and the composed pieces wrote different rows for one window ${firstDiff(runs.tick, runs.pieces)}`);
    if (!JSON.parse(runs.tick).tally || !(JSON.parse(runs.tick).tally.kills > 0)) problems.push('CONTROL: the parity window killed nothing');
    return problems;
  }),

  /* SLOT — EVERY READ AND WRITE OF A SETTLE IS BOUND TO THE SESSION'S OWN SLOT
     (the successor of edge-tick-gate T-X1i2 / M17, "one user on two slots, each
     slot reads its own perks", which left with the party fire). A hunt on slot
     1 is settled through the real settleHunt; every statement it issues that
     names a slot names 1 — the perks read (which prices the hunt's XP and
     bonus), the session read and the apply. */
  SLOT: async (db, M) => inTx(db, async () => {
    const problems = [];
    await newUser(db);
    await asUser(db, UID);
    for (const s of [0, 1]) {
      /* Own slot 1 the way hr_buy_hero_slot records it (tests/conservation-fuzz.mjs): a flag row, no value. */
      if (s > 0) await db.query(`insert into public.player_progress (user_id, slot, kind, key, value, period_key)
                                 values ($1, 0, 'flag', 'character_slot:' || $2, 1, '') on conflict do nothing`, [UID, s]);
      const c = await one(db, 'select public.hr_create_character($1)', [s]);
      if (!c || c.created !== true) { problems.push(`CONTROL: slot ${s} character refused: ${JSON.stringify(c)}`); return problems; }
    }
    await db.query(`update public.hr_hunt_config set enabled = true where id`);
    const e = await one(db, `select public.hr_hunt_enter(1, 'mill_cellar', '[]'::jsonb, 0, null, null, $1::uuid)`, [idem()]);
    if (!e || e.ok !== true) { problems.push(`CONTROL: the slot-1 hunt was refused: ${JSON.stringify(e)}`); return problems; }
    const sid = e.session.id;
    await db.query(`update public.hunt_sessions set entered_at = now() - interval '11 minutes',
                      hunt_from = date_trunc('second', now() - interval '10 minutes'),
                      settled_to = date_trunc('second', now() - interval '10 minutes'),
                      next_swing_at = date_trunc('second', now() - interval '10 minutes') where id = $1`, [sid]);
    await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
    const inner = makeExec(db);
    const seen = [];
    const exec = async (text, params) => { seen.push({ text: String(text), params: params || [] }); return inner(text, params); };
    const r = await M.HS.settleHunt({ exec, user: UID, slot: 1, mode: 'tick', session: sid });
    if (!r || r.outcome !== 'paid') problems.push(`CONTROL: the slot-1 settle did not pay (${r && r.outcome}/${r && r.reason})`);
    const perks = seen.filter((s) => /perks/i.test(s.text));
    if (!perks.length) problems.push('CONTROL: the settle issued no perks read — the arm cannot see its binding');
    for (const s of seen) {
      const i = s.params.findIndex((v) => v === UID);
      if (i < 0) continue;
      const slotArg = s.params[i + 1];
      if (slotArg !== 1 && slotArg !== '1') problems.push(`a slot-1 settle issued ${s.text.trim().slice(0, 70)}… with slot ${JSON.stringify(slotArg)}`);
    }
    const slot0 = await one(db, `select count(*)::int from public.player_ledger where user_id = $1 and slot = 0 and session_id = $2`, [UID, sid]);
    if (slot0) problems.push(`the slot-1 hunt wrote ${slot0} ledger row(s) on slot 0`);
    return problems;
  }),

  /* XPDOOR — THE CLIENT'S COMBAT-XP DOOR PAYS NOTHING (the successor of
     tests/combat-xp-settle-first.mjs, combat-xp-settle-split.mjs and
     accrual-engine's combatXpDayCeilingGuard). Those bounded what
     hr_credit_combat_xp — the client-fight XP door — could add beside a settle
     (never trim a window it did not pay, never pay one twice, never past an
     honest day). A hunt has no client fight: the settle pays every swing. The
     door stays installed until R1 retires the client loop, so it must pay
     NOTHING to anyone: a hunter is answered hunt_open (settle §6b), and a
     character who is not hunting cannot be in combat (hunt_required), so the
     credit's combat window is empty. Both answered here, by execution. */
  XPDOOR: async (db, M) => inTx(db, async () => {
    const problems = [];
    const skills = async () => canon(await one(db, `select jsonb_object_agg(skill_id, jsonb_build_array(xp, xp_frac))
                                                     from public.player_skills where user_id = $1 and slot = 0`, [UID]));
    const credit = async () => {
      await asUser(db, UID);
      const r = await one(db, `select public.hr_credit_combat_xp(0, $1::jsonb, $2)`, [JSON.stringify({ attack: 400, hitpoints: 130 }), idem()]);
      await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
      return r;
    };
    const { sid } = await hunter(db, M, STRONG);
    const before = await skills();
    const onHunt = await credit();
    if (!onHunt || onHunt.ok !== false || onHunt.error !== 'hunt_open') problems.push(`a hunter's combat-XP credit was answered ${JSON.stringify(onHunt)}, not hunt_open`);
    if (await skills() !== before) problems.push('a hunter\'s combat-XP credit moved a skill');
    /* Leave, settle the walk home, and wait out the settle-first window: the
       character is idle, not hunting, and has nothing unsettled. */
    await db.query(`update public.hunt_sessions set leave_at = now() - interval '10 minutes' where id = $1`, [sid]);
    await M.HS.settleHunt({ exec: makeExec(db), user: UID, slot: 0, mode: 'tick', session: sid });
    /* Settled two minutes ago (inside settle-first's 180 s), idle for an hour:
       the credit's window is [2 min ago, now) and the not-in-combat cap ends
       it at the hour-old switch — so it must be empty. */
    await db.query(`update public.player_state set active_kind = 'idle', active_id = null,
                      active_since = now() - interval '1 hour', accrued_to = now() - interval '2 minutes',
                      combat_xp_accrued_to = now() - interval '2 minutes' where user_id = $1 and slot = 0`, [UID]);
    const idleBefore = await skills();
    const idle = await credit();
    if (!idle || idle.ok !== true || Number(idle.credit) !== 0 || idle.reason !== 'not_in_combat') {
      problems.push(`an idle character's combat-XP credit was answered ${JSON.stringify(idle).slice(0, 300)}, not ok/credit 0/not_in_combat`);
    }
    if (await skills() !== idleBefore) problems.push(`an idle (not hunting) character's combat-XP credit moved a skill: ${JSON.stringify(idle).slice(0, 300)}`);
    if (!(await one(db, `select count(*)::int from public.hunt_sessions where id = $1 and ended_at is not null`, [sid]))) {
      problems.push('CONTROL: the probe hunt did not end — the idle half proves nothing');
    }
    return problems;
  }),

  BESTIARY: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid } = await hunter(db, M, STRONG);
    const exec = makeExec(db);
    const spawns = (M.HUNTS.HUNT_INDEX[STRONG.hunt] || {}).spawns || [];
    if (spawns.length < 2) problems.push(`CONTROL: ${STRONG.hunt} spawns fewer than two monsters`);
    const value = async () => canon(await one(db, `select jsonb_build_object(
        'gold', ps.gold, 'hp', ps.hp,
        'skills', (select jsonb_object_agg(skill_id, jsonb_build_array(xp, xp_frac)) from public.player_skills where user_id = $1 and slot = 0),
        'inv', (select jsonb_object_agg(item_id, qty) from public.player_inventory where user_id = $1 and slot = 0),
        'tally', (select jsonb_build_object('coins', t.coins, 'kills', t.kills, 'xp', t.xp, 'loot', t.loot)
                    from public.hunt_session_tally t where t.session_id = $2))
      from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [UID, sid]));
    await db.query('savepoint bestiary');
    const bare = await M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'tick', session: sid });
    const vBare = await value();
    await db.query('rollback to savepoint bestiary');
    for (const s of spawns) {
      await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value)
                      values ($1, 0, 'stat', 'ev:kill_monster:' || $2, '', 20000)`, [UID, s.monster]);
    }
    const reported = await one(db, `select count(*)::int from public.hr_bestiary_of($1::uuid, 0) where kills = 20000`, [UID]);
    if (reported !== spawns.length) problems.push(`CONTROL: hr_bestiary_of reports ${reported} of ${spawns.length} planted counters`);
    const charmed = await M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'tick', session: sid });
    const vCharmed = await value();
    if (bare.outcome !== 'paid' || charmed.outcome !== 'paid') {
      problems.push(`CONTROL: a settle did not pay (${bare.outcome}/${bare.reason}, ${charmed.outcome}/${charmed.reason})`);
    } else if (vBare !== vCharmed) {
      problems.push(`20,000 kills of every spawn priced the hunt differently from none — a bestiary ladder prices a fight again ${firstDiff(vBare, vCharmed)}`);
    }
    return problems;
  }),
};

// ═══════════════════════════════════════════════════════════════════════
async function runArms(root, db, only) {
  const M = await loadEdge(root);
  const out = {};
  if (db) await rewindDice(db);
  for (const [name, arm] of Object.entries(ENGINE_ARMS)) {
    if (only && !only.includes(name)) continue;
    try { out[name] = await arm(M); } catch (e) { out[name] = ['threw: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
  }
  if (db) {
    for (const [name, arm] of Object.entries(DB_ARMS)) {
      if (only && !only.includes(name)) continue;
      try { out[name] = await arm(db, M); } catch (e) { out[name] = ['threw: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
    }
  }
  return out;
}

/* JS mutants: planted in a temp copy of the edge + src/core + src/data. */
const MUTANTS = [
  { arm: 'TICK-2', name: 'the combat ctx is away again', file: join(FN, 'accrual.js'),
    from: "    fromMs: credit.fromMs,\n    toMs: huntToMs,", to: "    away: true,\n    fromMs: credit.fromMs,\n    toMs: huntToMs," },
  { arm: 'TICK-2', name: 'a session window starts at the absence watermark', file: join(FN, 'accrual.js'),
    from: 'const fromMs = Math.floor(nat(w.fromMs, -1));', to: 'const fromMs = Math.floor(nat(inp.accruedToMs, nat(w.fromMs, -1)));' },
  { arm: 'SEED', name: 'the per-swing seed is the 32-bit FNV text mix again', file: join(FN, 'hunt-seed.js'),
    from: "const d = createHmac('sha256', key).update(seedLabel(instanceId, domain, i), 'utf8').digest();",
    to: "const s = secret + ' ' + seedLabel(instanceId, domain, i); let x = 0x811c9dc5; for (let k = 0; k < s.length; k++) { x ^= s.charCodeAt(k); x = Math.imul(x, 0x01000193); } const d = [x >>> 24 & 255, x >>> 16 & 255, x >>> 8 & 255, x & 255];" },
  { arm: 'MAXHP', name: 'a hitpoints level-up sets max HP to the level', file: join(FN, 'accrual.js'),
    from: "ev.skill === 'hitpoints' && ev.to > state.playerMaxHp) state.playerMaxHp = ev.to;", to: "ev.skill === 'hitpoints') state.playerMaxHp = ev.to;" },
  { arm: 'FENCE', name: 'the engine prices a hunter on the old path', file: join(FN, 'accrual.js'),
    from: '  if (inp.huntOpen === true) return { accrued: false, reason: SKIP.HUNT_OPEN };', to: '' },
  { arm: 'PRESS', name: 'a press fires before it was made', file: 'src/core/action-rules.js',
    from: '    if (p.at > v.atMs) { out.keep.push(entry); continue; }', to: '' },
  /* (Measuring at the window START is an equivalent mutant: a session's
     settled_to IS its next swing. The defect worth a guard is the read clock.) */
  { arm: 'TICK-1', name: 'the buff queue is measured at the read clock, not the swing clock', file: join(FN, 'accrual.js'),
    from: 'buffs: buffQueueFromServer(inp.buffs, hs0.nextSwingAtMs),', to: 'buffs: buffQueueFromServer(inp.buffs, Number(inp.nowMs)),' },
  { arm: 'BOTH-PATH', name: 'a knocked-out foe is not carried across a settle', file: join(FN, 'accrual.js'),
    from: "            ? Math.floor(state.monsterHp) : Math.max(1, Math.floor(nat(m.hp, 1))),", to: "            ? Math.floor(state.monsterHp) : 0," },
  { arm: 'END', name: 'a dry heal line does not end the hunt', file: 'src/core/action-rules.js',
    from: '  heals_out: (hs) => essentialOut(hs, \'heal\'),', to: '  heals_out: () => false,' },
  { arm: 'KNOCKOUT', name: 'the combat body ignores the recovery line', file: join(FN, 'accrual.js'),
    from: '  state.recoveringUntilMs = recoverCol ? nat(inp.recoveringUntilMs, 0) : 0;', to: '  state.recoveringUntilMs = 0;' },
  { arm: 'TICK-2', name: 'the hunt settle writes an away receipt', file: join(FN, 'hunt-settle.js'),
    from: "import { computeAccrual } from './accrual.js';",
    to: "import { computeAccrual } from './accrual.js';\nexport const RECEIPT_KEY = { last_away_receipt: null };" },
  { arm: 'TICK-2', name: 'a charm multiplier prices a hunt again', file: join(FN, 'accrual.js'),
    from: "    weakness(m) { return weaknessInfo(m, eq); },",
    to: "    weakness(m) { const charmIndex = () => 1; return weaknessInfo(m, eq, charmIndex()); }," },
  { arm: 'VIGOUR', name: 'a hunt pays the 0.25x tired tail again', file: join(FN, 'accrual.js'),
    from: '  const goldDelta = Math.floor(state.gold || 0);',
    to: '  const goldDelta = Math.floor((state.gold || 0) * (inp.vigour && inp.vigour.spent_min >= 720 ? 0.25 : 1));' },
  { arm: 'STAMINA-RULE', name: 'a swing does not drain the pool', file: 'src/core/combat-sim.js',
    from: '    if (hs.staminaMs !== null && hs.staminaMs !== undefined) hs.staminaMs = staminaStep(hs.staminaMs, tickMs, true);\n', to: '' },
  { arm: 'STAMINA-RULE', name: 'an empty pool ends nothing', file: 'src/core/action-rules.js',
    from: "  stamina: (hs) => hs.staminaMs !== null && hs.staminaMs !== undefined && !(Number(hs.staminaMs) > 0),", to: '  stamina: () => false,' },
  { arm: 'STAMINA', name: 'a knockout does not rest the pool', file: 'src/core/combat-sim.js',
    from: '      if (hs.staminaMs !== null && hs.staminaMs !== undefined) hs.staminaMs = staminaStep(hs.staminaMs, tickMs, false);\n', to: '' },
  { arm: 'STAMINA', name: 'the settle reads no pool', file: join(FN, 'hunt-settle.js'),
    from: '    staminaMs: num(h.stamina_ms),', to: '    staminaMs: null,' },
  { arm: 'BUY-RULE', name: 'sell-to-cover sells any common drop again (bones)', file: 'src/data/hunt-sessions.js',
    from: '  return item.junk === true;', to: "  return item.junk === true || item.rarity === undefined || item.rarity === 'common';" },
  { arm: 'BUY-RULE', name: 'a shop slot never buys', file: 'src/core/action-rules.js',
    from: "      ? { id: shopId, kind: 'heal', buy: true } : { why: 'gold_short', item: shopId, kind: 'heal' };",
    to: "      ? { why: 'bag_empty' } : { why: 'gold_short', item: shopId, kind: 'heal' };" },
  { arm: 'BUY-RULE', name: 'a shop heal heals by its crafted partner', file: 'src/core/action-rules.js',
    from: '      const heals = u.buy ? basicOf(hs, u.id).heals : SUPPLIES[u.id].heals;',
    to: '      const heals = u.buy ? SUPPLIES[basicOf(hs, u.id).partner].heals : SUPPLIES[u.id].heals;' },
  { arm: 'BUY-RULE', name: 'a shop drink is bought before mana exists', file: 'src/core/action-rules.js',
    /* Both refusals go (the no_mana line alone is shadowed by the heal-only line). */
    from: "    if (b.kind === 'mana') return { why: 'no_mana' };          // inert until the mana engine ships\n    if (b.kind !== 'heal') return { why: 'not_fireable' };     // shots are spent by the quiver, not fired\n",
    to: "    if (b.kind === 'ammo') return { why: 'not_fireable' };\n" },
  { arm: 'BUY-RULE', name: 'a dry purse ends nothing', file: 'src/core/action-rules.js',
    from: '  gold_out: (hs) => hs.goldOut === true,', to: '  gold_out: () => false,' },
  { arm: 'BUY-RULE', name: 'a priced arrow is never bought', file: 'src/core/hunt/world-step.js',
    from: '    if (n - fromBag > 0 && shot) buyFromShop(hunt, shot.id, n - fromBag);', to: '' },
  { arm: 'BUY-RULE', name: 'the floor is ignored', file: 'src/core/action-rules.js',
    from: 'export function floorOf(hs) { return Math.max(0, int(hs && hs.goldFloor, GOLD_FLOOR.default)); }',
    to: 'export function floorOf() { return 0; }' },
  { arm: 'BUY-RULE', name: 'sell-to-cover sells the dearest loot first', file: 'src/core/action-rules.js',
    from: '    .sort((a, b) => (hs.cover[a].unit - hs.cover[b].unit) || (a < b ? -1 : 1));',
    to: '    .sort((a, b) => (hs.cover[b].unit - hs.cover[a].unit) || (a < b ? -1 : 1));' },
  { arm: 'STAMINA', name: 'a hunt knockout costs no time (a free stand-up)', file: 'src/core/hunt/world-step.js',
    from: '    recoverMs: KNOCKOUT_MS,\n', to: '    recoverMs: 0,\n' },
  { arm: 'BUY-RULE', name: 'kill coins never reach the purse', file: 'src/core/combat-sim.js',
    from: "      hs.purse = Math.max(0, Math.floor(Number(hs.purse) || 0)) + Math.max(0, Math.floor(Number(gp) || 0));", to: '' },
  { arm: 'ACTIONBAR-RULE', name: 'hunt_use admits only the first ten slots again', file: join(FN, 'request.js'),
    from: 'export const MAX_BAR_SLOT = 19;', to: 'export const MAX_BAR_SLOT = 9;' },
  { arm: 'ACTIONBAR-RULE', name: 'the mana condition reads hit points', file: 'src/core/action-rules.js',
    from: '      return v.maxMana > 0 && Number.isFinite(value) && compare(v.mana * 100, c.op, value * v.maxMana);',
    to: '      return v.maxHp > 0 && Number.isFinite(value) && compare(v.hp * 100, c.op, value * v.maxHp);' },
  { arm: 'ACTIONBAR-RULE', name: 'a spell slot fires as a supply', file: 'src/core/action-rules.js',
    from: "  if (slot && slot.kind !== undefined && slot.kind !== 'supply') return { why: 'not_fireable' };\n", to: '' },
  { arm: 'DEATHXP-RULE', name: 'a fall takes the whole gap, de-levelling', file: 'src/core/action-rules.js',
    from: '  return Math.max(0, Math.min(Math.floor(gap * f), x - floor));', to: '  return Math.max(0, Math.floor(gap * f));' },
  { arm: 'BOTH-PATH', name: 'a fall costs nothing', file: 'src/core/combat-sim.js',
    from: '      const xpLost = deathXpLoss(state.skills, ctx.style);', to: '      const xpLost = {};' },
  { arm: 'TICK-0', name: 'the world tick drops its hunt cohort', file: join(FN, 'tick.js'),
    from: '  if (body.hunts.length) {', to: '  if (false) {' },
  /* ── THE RETIRED GUARDS' MUTANTS, PLANTED AGAINST THE HUNT ENGINE ─────────
     Each name carries the guard the closed rebuild deleted and the fault it
     was filed against; the arm named here is its replacement and must go red.
     world-tick-resume-alignment resumeOneTickLate / stampOneTickEarly /
     carrierOneTickLate, and the probe bar's freeHeal: */
  { arm: 'RESUME-LINE', name: '[resume-alignment] a knocked-out hunter swings one tick late (the gate holds ON the line)', file: 'src/core/combat-sim.js',
    from: '    if (atMs < recoverUntilMs) {', to: '    if (atMs <= recoverUntilMs) {' },
  { arm: 'RESUME-LINE', name: '[resume-alignment] the line is stamped from the START of the dying swing', file: 'src/core/combat-sim.js',
    from: '      const fellAtMs = hs.nextSwingAtMs;', to: '      const fellAtMs = atMs;' },
  { arm: 'RESUME-LINE', name: '[probe-bar freeHeal, b509] the stand-up after a fall heals to full', file: 'src/core/combat-sim.js',
    from: '  state.playerHp = resumeHpFor(state.playerMaxHp);\n}\n', to: '  state.playerHp = state.playerMaxHp;\n}\n' },
  { arm: 'BOTH-PATH', name: '[resume-alignment carrierOneTickLate] the carried recovery line drifts a tick per settle', file: join(FN, 'envelope.js'),
    from: '? (st.recovering_until ? new Date(st.recovering_until).getTime() : 0) : null,',
    to: '? (st.recovering_until ? new Date(st.recovering_until).getTime() + 2000 : 0) : null,' },
  /* world-tick-combat-parity shiftWindow / wallclock / C2 / relabelSeed /
     skipFoodDebit, sec-world-tick-m3-seed-label S-M3-1, world-tick-maxhp-carry H1: */
  /* (The old shiftWindow/wallclock anchors — the window's fromMs — are
     EQUIVALENT here: a hunt swings on the session's own clock (next_swing_at),
     and huntWindow.fromMs only bounds the 6 h fuse. The fault transposes to the
     two clocks a hunt window DOES read: the session clock and the window end.) */
  { arm: 'TICK-1', name: '[combat-parity shiftWindow] the session clock is read one second late', file: join(FN, 'hunt-settle.js'),
    from: '    nextSwingAtMs: num(h.next_swing_at_ms),', to: '    nextSwingAtMs: num(h.next_swing_at_ms) + 1000,' },
  { arm: 'PARITY', name: '[combat-parity wallclock] the tick door ends its window on a wall-clock grid, not the server instant', file: join(FN, 'hunt-settle.js'),
    from: '  let toMs = nowMs;', to: "  let toMs = mode === 'tick' ? nowMs - (nowMs % 90000) : nowMs;" },
  { arm: 'PARITY', name: '[combat-parity C2 / bestiary-parity read-dropped] the tick door builds its session without the action bar', file: join(FN, 'hunt-settle.js'),
    from: '  const hs = huntSessionFromRead(h);', to: "  const hs = huntSessionFromRead(mode === 'tick' ? { ...h, slots: [] } : h);" },
  { arm: 'TICK-1', name: '[combat-parity relabelSeed / seed-label S-M3-1] each window re-labels its swings from zero', file: join(FN, 'accrual.js'),
    from: '    swingSeed: huntSeeder,', to: '    swingSeed: (i) => huntSeeder(i - hs0.swingIndex),' },
  { arm: 'END', name: '[combat-parity skipFoodDebit / attended-loot A5] a supply taken from the bag is not debited', file: 'src/core/action-rules.js',
    from: '  line.left = int(line.left, 0) - take;', to: '  line.left = int(line.left, 0);' },
  { arm: 'TICK-1', name: '[maxhp-carry H1] a hitpoints level-up inside the window never raises max HP', file: join(FN, 'accrual.js'),
    from: "ev.skill === 'hitpoints' && ev.to > state.playerMaxHp) state.playerMaxHp = ev.to;", to: "ev.skill === 'hitpoints' && false) state.playerMaxHp = ev.to;" },
  /* world-tick-parity P5 rewind. (P2/P3 "unaligned" has no hunt analogue: the
     window end never owns a remainder — the session stores next_swing_at, so a
     swing a cut passes over is simply the next window's first. Planted, that
     mutant is EQUIVALENT: BOTH-PATH's odd cuts write identical rows. Measured
     2026-10-15, not assumed.) */
  { arm: 'TICK-1', name: '[world-tick-parity P5 rewind] the settle re-simulates the last swing to be safe', file: join(FN, 'hunt-settle.js'),
    from: '    nextSwingAtMs: num(h.next_swing_at_ms),', to: '    nextSwingAtMs: num(h.next_swing_at_ms) - 2000,' },
  /* world-tick-scale F11 foldDropsCompanionArm (companion XP is deleted; its return is refused by name): */
  { arm: 'TICK-2', name: '[world-tick-scale F11] the tick fold hydrates the companion-XP arm again', file: join(FN, 'tick-shadow.js'),
    from: "import { computeAccrual, CALLER_AUTHORITY } from './accrual.js';",
    to: "import { computeAccrual, CALLER_AUTHORITY } from './accrual.js';\nexport const COMPANION_XP_SERVER_BACKED = true;" },
  /* accrual-engine autoEat* / DEEPWATERS-S2 (a meal heals its catalogue value) and retreatGuard (the falls limit): */
  { arm: 'HEAL', name: '[accrual-engine DEEPWATERS-S2] a bag heal heals one less than its catalogue value', file: 'src/core/action-rules.js',
    from: '      const heals = u.buy ? basicOf(hs, u.id).heals : SUPPLIES[u.id].heals;',
    to: '      const heals = u.buy ? basicOf(hs, u.id).heals : SUPPLIES[u.id].heals - 1;' },
  { arm: 'HEAL', name: '[accrual-engine attendedSettleAutoEat] a heal fires on a body', file: 'src/core/action-rules.js',
    from: '  if (!(Number(state.playerHp) > 0)) return false;\n  if (!Array.isArray(state.buffs)) state.buffs = [];',
    to: '  if (!Array.isArray(state.buffs)) state.buffs = [];' },
  { arm: 'BOTH-PATH', name: '[accrual-engine retreatGuard] the falls limit ends nothing', file: 'src/core/action-rules.js',
    from: '  falls: (hs) => int(hs.falls, 0) >= int(hs.fallsLimit, SESSION_LIMITS.falls.default),',
    to: '  falls: () => false,' },
  /* edge-tick-gate M17 (T-X1i2, one user on two slots — left with the party fire): */
  { arm: 'SLOT', name: '[edge-tick-gate M17] the settle reads slot 0\'s perks for every slot', file: join(FN, 'hunt-settle.js'),
    from: '  const perks = await readTickPerks(exec, user, slot);', to: '  const perks = await readTickPerks(exec, user, 0);' },
  /* world-tick-probe-bar fixedSeed / noAutoEat (Auto-Eat's successor is the action bar): */
  { arm: 'SEED', name: '[probe-bar fixedSeed] every swing of a session rolls the same seed', file: join(FN, 'hunt-seed.js'),
    from: '.update(seedLabel(instanceId, domain, i), \'utf8\')', to: '.update(seedLabel(instanceId, domain, 0), \'utf8\')' },
  { arm: 'TICK-1', name: '[probe-bar noAutoEat] the action bar fires nothing', file: 'src/core/action-rules.js',
    from: 'export function runActionBar(state, ctx) {\n', to: 'export function runActionBar(state, ctx) {\n  if (state) return false;\n' },
  /* combat-xp-settle-first, attended-loot-credit, world-tick-bestiary-parity, accrual-engine ammoGuard: */
  { arm: 'TICK-2', name: '[combat-xp-settle-first] the live combat-XP watermark trims the hunt window', file: join(FN, 'accrual.js'),
    from: 'const fromMs = Math.floor(nat(w.fromMs, -1));', to: 'const fromMs = Math.max(Math.floor(nat(w.fromMs, -1)), Math.floor(nat(inp.combatXpAccruedToMs, 0)));' },
  { arm: 'TICK-2', name: '[attended-loot-credit no_topup] the hunt settle reads the attended kill credit again', file: join(FN, 'hunt-settle.js'),
    from: "import { computeAccrual } from './accrual.js';", to: "import { computeAccrual } from './accrual.js';\nexport const ATTENDED_READ = 'select * from public.hr_attended_kills($1, $2, $3)';" },
  { arm: 'BESTIARY', name: '[bestiary-parity] the settle reads hr_bestiary_of and a ladder prices the hunt again', file: join(FN, 'hunt-settle.js'),
    from: '  const perks = await readTickPerks(exec, user, slot);',
    to: "  const perks = await readTickPerks(exec, user, slot);\n  const [bk] = await exec('select coalesce(sum(kills), 0)::int as n from public.hr_bestiary_of($1::uuid, $2::int)', [user, slot]);\n  const ladder = Number(bk && bk.n) > 0;",
    also: [['      secret: salt, pressAtMs: press ? press.at : null,', '      secret: salt, pressAtMs: press ? press.at : null, ladder,'],
      ['    monsters: MONSTERS,\n    nodes: GATHER_NODES,', "    monsters: o.ladder ? Object.fromEntries(Object.entries(MONSTERS).map(([k, v]) => [k, { ...v, drops: (v.drops || []).map((d) => ({ ...d, ch: Math.min(1, d.ch * 1.5) })) }])) : MONSTERS,\n    nodes: GATHER_NODES,"]] },
  { arm: 'QUIVER', name: '[accrual-engine ammoGuard] a shot is loosed but its arrow is never taken from the bag', file: 'src/core/hunt/world-step.js',
    from: '    const fromBag = spendFromBag(hunt, id, Math.min(n, bagLeft), atMs);', to: '    const fromBag = Math.min(n, bagLeft);' },
];

/* DB mutants: planted in a LIVE function body of the booted chain (create or
   replace), the arm run, the body restored. */
const DB_MUTANTS = [
  { arm: 'VALUE', name: 'the gold bound is gone', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: "       and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then", replace: '       and false then' },
  { arm: 'VALUE', name: 'an undroppable item passes the drop bound', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: '               select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b',
    replace: '               select 1000000 from public.hr_hunt_kill_bounds b' },
  { arm: 'SEAMS', name: 'hunting time is a bound again, not exact (X1)', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: '    if v_tick is null or v_tick <= 0 or v_paid + v_down <> v_nsw * v_tick then', replace: '    if false then' },
  { arm: 'SEAMS', name: 'a reserved lane takes a cooldown key (S3)', fn: 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)',
    find: 'not exists (select 1 from public.hr_hunt_lanes l where l.lane = c.key and l.active)', replace: 'false' },
  { arm: 'SEAMS', name: 'the settle leaves the instance unmoved (S1)', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: '           version = version + 1\n     where id = v_s.instance_id;', replace: '           version = version\n     where id = v_s.instance_id;' },
  { arm: 'BUY', name: 'a store buy lands on a set that chose mine + end (the silent store)', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: "                          and (a.supply_source = 'store' or a.on_empty = 'switch')) then", replace: "                          and (true or a.on_empty = 'switch')) then" },
  { arm: 'BUY', name: 'the buy cap admits two lanes\' worth', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: "+ coalesce((v_ukind->>'heal')::bigint, 0) + coalesce((v_ukind->>'buff')::bigint, 0) > v_win / v_cdh + 1",
    replace: "+ coalesce((v_ukind->>'heal')::bigint, 0) + coalesce((v_ukind->>'buff')::bigint, 0) > 2 * v_win / v_cdh + 1" },
  { arm: 'TALLY', name: 'the fold counts one kill the ledger does not hold', fn: 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)',
    find: 'kills = t.kills + v_kills,', replace: 'kills = t.kills + v_kills + 1,' },
  { arm: 'TALLY', name: 'the fold drops the consumption rows', fn: 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)',
    find: "supplies = public.hr_jsonb_add(t.supplies, v_sup)", replace: "supplies = t.supplies" },
  { arm: 'DEATHXP', name: 'the applier stops bounding a fall\'s price', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: "                    > floor((public.hr_xp_for_level(v_lv + 1) - public.hr_xp_for_level(v_lv)) * v_rate / 1000.0)) then",
    replace: "                    > 1000000000) then" },
  { arm: 'DEATHXP', name: 'the applier lets a fall take a skill below its starting level', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: "        if v_cur - v_n < public.hr_xp_for_level(v_lv0) then", replace: "        if false then" },
  { arm: 'STAMINA', name: 'the applier stops bounding the pool from above', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: "    if v_e < greatest(0, v_s0 - v_paid) or v_e > greatest(0, v_s0 - v_paid + v_down) or v_e > greatest(v_s0, v_cap) then",
    replace: "    if v_e < 0 then" },
  { arm: 'STAMINA', name: 'the applier takes knocked-out time on the engine\'s word', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: "    if v_down > v_dmax then", replace: "    if false then" },
  { arm: 'STAMINA', name: 'a stamina end is proven on any pool', fn: 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)',
    find: "                                     where ps.user_id = p_user and ps.slot = p_slot), 1) <= 0", replace: "                                     where ps.user_id = p_user and ps.slot = p_slot), 1) >= 0" },
  { arm: 'STAMINA', name: 'an empty pool enters a hunt', fn: 'public.hr_hunt_enter(integer,text,jsonb,integer,integer,integer,uuid)',
    find: "  if coalesce(public.hr_stamina_of(v_uid, p_slot, now()), 0) <= 0 then", replace: "  if false then" },
  { arm: 'BUY', name: 'the applier prices a use at one gold', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: "        v_cost := v_cost + v_n * v_price;", replace: "        v_cost := v_cost + v_n;" },
  { arm: 'BUY', name: 'sell-to-cover takes loot the session never looted', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: "        if v_n > coalesce(v_avail, 0) then", replace: "        if false then" },
  { arm: 'BUY', name: 'a hunt knockout of any length is accepted', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: "                   or (d.value->>'recovery_ms')::numeric <> v_ko) then", replace: "                   or false) then" },
  { arm: 'BUY', name: 'the buys may take gold under the floor', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: "      if coalesce(v_gold_now, 0) - v_cost < v_floor then", replace: "      if coalesce(v_gold_now, 0) - v_cost < 0 then" },
  { arm: 'BUY', name: 'a gold_out end is proven on any purse', fn: 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)',
    find: "      when 'gold_out' then coalesce((select ps.gold from public.player_state ps",
    replace: "      when 'gold_out' then true or coalesce((select ps.gold from public.player_state ps" },
  { arm: 'RESUME', name: 'an automatic end resumes nothing', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: "      if v_ok then\n        update public.player_state", replace: "      if false then\n        update public.player_state" },
  { arm: 'RESUME', name: 'a level-locked activity is resumed', fn: 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    find: "                           and coalesce((select public.hr_level_from_xp(sk.xp) from public.player_skills sk",
    replace: "                           and false and coalesce((select public.hr_level_from_xp(sk.xp) from public.player_skills sk" },
  { arm: 'ACTIONBAR', name: 'a spell slot is saved', fn: 'public.hr_hunt_slots_check(jsonb)',
    find: "    if v_s ? 'kind' and not (select sk.active from public.hr_hunt_slot_kinds sk where sk.kind = v_s->>'kind') then",
    replace: "    if false then" },
  { arm: 'ACTIONBAR', name: 'a party-only target mode is stored on a solo set', fn: 'public.hr_action_set_options(integer,integer,jsonb,uuid)',
    find: "      if not (select m.solo from public.hr_hunt_target_modes m where m.mode = v_v #>> '{}') then", replace: "      if false then" },
  { arm: 'FRESH', name: 'Mill Cellar respawns six times sooner', fn: 'public.hr_hunt_pull_of(uuid,integer,uuid)',
    find: "ceil(t.respawn_ms::numeric * z.size / t.pull_size)::bigint", replace: "ceil(t.respawn_ms::numeric * z.size / t.pull_size / 6)::bigint" },
  /* combat-xp-settle-first / -split, accrual-engine combatXpDayCeilingGuard: the client's combat-XP door. */
  { arm: 'XPDOOR', name: '[combat-xp ceiling] the not-in-combat cap is gone (an idle client credits combat XP)', fn: 'public.hr_credit_combat_xp__ungated(integer,jsonb,text)',
    find: "                       then least(now(), coalesce(v_active_since, 'epoch'::timestamptz))", replace: '                       then now()' },
  { arm: 'XPDOOR', name: "[combat-xp-settle-split] a hunter's client credit pays beside the settle again", fn: 'public.hr_credit_combat_xp(integer,jsonb,text)',
    find: '    case when public.hr_hunt_open_of(auth.uid(), coalesce(p_slot, 0)) is not null', replace: '    case when false' },
  { arm: 'TICK-0', name: 'the cron queues its hunts body with no selectors', fn: 'public.hr_tick_cron_run()',
    find: "'hunts', v_hunts)::text);", replace: "'hunts', '[]'::jsonb)::text);" },
];

/* SQL mutants: planted in the migration TEXT; its own §10 must refuse each. */
const SQL_MUTANTS = [
  { name: 'the value half is not stamped with the session (tally loses it)', find: "    perform set_config('hr.hunt_session', p_session::text, true);\n    v_a := public.hr_apply(", replace: '    v_a := public.hr_apply(' },
  { name: 'a refused session half leaves the value half written', find: "  exception when sqlstate 'HR000' then\n    get stacked diagnostics", replace: "  exception when sqlstate 'XX999' then\n    get stacked diagnostics" },
  { name: 'the kill cap does not hold the window to its spawn cycle', find: '       or v_kills <> v_ipl + v_psz * v_pn - v_pl1\n', replace: '' },
  { name: 'the fence guards only combat accrue rows', find: "  for each row when (new.intent = 'accrue' and new.kind <> 'worker')", replace: "  for each row when (new.kind = 'combat' and new.intent = 'accrue')" },
  { name: 'the fence stops the hired hands too (design ruling 2026-10-15)', find: "  for each row when (new.intent = 'accrue' and new.kind <> 'worker')", replace: "  for each row when (new.intent = 'accrue')" },
  { name: 'a player verb between the read and the apply refuses the settle (version CAS)', find: '    v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);', replace: '    v_a := public.hr_apply(p_user, p_slot, p_version, p_intent, p_delta);' },
  /* The 2026-10-15 apply failure: production's clock carries microseconds, the
     engine's milliseconds. Without the clock trigger the self-check's GATE(f)
     (whose session clock is moved off the millisecond) must fail. */
  { name: 'the hunt clock keeps microseconds (the 10-15 apply failure)', find: 'create trigger hr_hunt_clock_ms before insert or update on public.hunt_sessions', replace: 'create trigger hr_hunt_clock_ms before delete on public.hunt_sessions' },
  { name: 'the fence trigger is not installed', find: 'create trigger hr_hunt_accrue_fence before insert on public.player_ledger', replace: 'create trigger hr_hunt_accrue_fence_off before update on public.player_ledger' },
];

/* PIN THE DICE. A hunt's swings are HMAC(hr_seed(user, slot, 'hunt:<session id>'),
   '<instance id>...') and the instance id IS the session id. Both halves were
   random per run (the per-database `prng` secret, and gen_random_uuid() for the
   session), so every run rolled a different fight and a mutant that only shows
   on some fights (DEATHXP, resume alignment) was caught on some runs only.
   The secret is a fixed value and gen_random_uuid() (this throwaway database's
   copy) counts from a sequence that runArms rewinds, so the same fixture rolls
   the same swings on every run and every mutant. The seeder itself (the HMAC
   reference arm) is untouched. */
async function pinDice(db) {
  await db.query(`update public.hr_server_secrets set secret = sha256(convert_to('hunt-sessions-settle:fixed-prng:1', 'utf8')) where name = 'prng'`);
  await db.exec(`create sequence if not exists public.hr_test_uuid_seq;
    create or replace function pg_catalog.gen_random_uuid() returns uuid language sql volatile as
      $f$ select ('00000000-0000-4000-8000-' || lpad(to_hex(nextval('public.hr_test_uuid_seq')), 12, '0'))::uuid $f$;`);
}
const rewindDice = (db) => db.query(`select setval('public.hr_test_uuid_seq', 1000, false)`);

async function main() {
  const { bootReplay, LAST_PATCHED } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay(CLOSED ? { keepClosed: true } : undefined)); } catch (e) {
    console.error(`✗ the chain would not replay: ${String(e.message).slice(0, 600)}`);
    process.exit(1);
  }
  await pinDice(db);
  if (CLOSED && (await db.query(`select enabled from public.hr_flags where key = 'closed_mode'`)).rows[0]?.enabled !== true) {
    console.error('✗ --closed: the replay is not closed — the mode would prove nothing');
    process.exit(1);
  }
  if (MUTATE) {
    let bad = 0;
    /* --mutant=<text> re-runs only the mutants whose name contains it (a re-check, never the record). */
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const picked = (list) => list.filter((m) => !pick || m.name.includes(pick));
    for (const m of picked(MUTANTS)) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-c2-'));
      try {
        cpSync(join(ROOT, 'src', 'core'), join(dir, 'src', 'core'), { recursive: true });
        cpSync(join(ROOT, 'src', 'data'), join(dir, 'src', 'data'), { recursive: true });
        cpSync(join(ROOT, FN), join(dir, FN), { recursive: true });
        const p = join(dir, m.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(m.from).length !== 2) { console.error(`✗ mutant "${m.name}": marker not found exactly once in ${m.file}`); bad++; continue; }
        /* `also`: further edits in the SAME file, each anchored exactly once
           (a defect that needs a read AND a use, e.g. a ladder priced again). */
        let out = src.replace(m.from, () => m.to);
        let bad2 = false;
        for (const [f2, t2] of m.also || []) {
          if (out.split(f2).length !== 2) { console.error(`✗ mutant "${m.name}": also-marker not found exactly once in ${m.file}`); bad2 = true; break; }
          out = out.replace(f2, () => t2);
        }
        if (bad2) { bad++; continue; }
        writeFileSync(p, out);
        const res = await runArms(dir, db, [m.arm]);
        if (res[m.arm] && res[m.arm].length) console.log(`✓ ${m.arm} goes red on: ${m.name}`);
        else { console.error(`✗ ${m.arm} stayed GREEN on: ${m.name}`); bad++; }
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    for (const m of picked(DB_MUTANTS)) {
      const def = String(await one(db, `select pg_get_functiondef($1::regprocedure)`, [m.fn])).split(String.fromCharCode(13)).join('');
      if (def.split(m.find).length !== 2) { console.error(`✗ db mutant "${m.name}": anchor not found exactly once`); bad++; continue; }
      await db.exec(def.replace(m.find, () => m.replace));
      try {
        const res = await runArms(ROOT, db, [m.arm]);
        if (res[m.arm] && res[m.arm].length) console.log(`✓ ${m.arm} goes red on: ${m.name}`);
        else { console.error(`✗ ${m.arm} stayed GREEN on: ${m.name}`); bad++; }
      } finally { await db.exec(def); }
    }
    for (const m of picked(SQL_MUTANTS)) {
      let refused = null;
      try {
        await bootReplay({ patches: new Map([['2026-10-22-hunt-sessions-settle.sql', [[m.find, m.replace]]]]), upTo: LAST_PATCHED });
      } catch (e) { refused = String(e.message); }
      if (refused && !e2harness(refused)) console.log(`✓ §10 refuses: ${m.name}`);
      else { console.error(`✗ §10 applied: ${m.name}${refused ? ' (' + refused.slice(0, 200) + ')' : ''}`); bad++; }
    }
    const total = picked(MUTANTS).length + picked(DB_MUTANTS).length + picked(SQL_MUTANTS).length;
    console.log(bad ? `hunt-sessions-settle --mutate: ${bad} mutant(s) survived` : `hunt-sessions-settle --mutate: all ${total} mutants killed`);
    process.exit(bad ? 1 : 0);
  }
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const res = await runArms(ROOT, db, onlyArg ? onlyArg.slice(7).split(',') : undefined);
  let bad = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems && problems.length) { bad++; for (const p of problems) console.error(`✗ ${name}: ${p}`); }
    else console.log(`✓ ${name}`);
  }
  console.log(bad ? `hunt-sessions-settle: ${bad} arm(s) red` : `hunt-sessions-settle: all ${Object.keys(res).length} arms green`);
  process.exit(bad ? 1 : 0);
}
/* A harness error (an anchor that moved) is never "caught". */
function e2harness(msg) { return /patch anchor matched|produced identical SQL|did not land verbatim/.test(msg); }

main();
