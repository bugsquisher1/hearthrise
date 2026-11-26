// ============================================================================
// supabase/functions/hr-accrue/accrue-hunt.js — ONE SETTLE OF ONE HUNT INSTANCE.
//
// A piece of the accrual engine (accrual.js: the door, the module map).
// A fight is a hunt instance, settled only through accrueHunt (hunt-settle.js).
// ============================================================================

import { COMBAT_BALANCE } from '../../../src/core/combat.js';
/* THE ONE COMBAT LOOP (src/core/combat-sim.js simulateHuntInstance): a fight is a
   hunt instance, solo or party, priced only by accrueHunt below. */
import { simulateHuntInstance, fightItems } from '../../../src/core/combat-sim.js';
/* A LIVE EVENT'S XP DIAL at each kill's own time, from the windows the server read for each member (2027-03-22-live-events.sql). */
import { xpMultFor } from '../../../src/core/live-events.js';
/* HUNT SESSIONS (ruling HR-2026-10-14, lane C2). The session model is
   action-rules.js's (newHuntSession builds the engine shape the span walks);
   the bag's kinds are supplies.js's; the per-swing seed is the edge's keyed
   mix (./hunt-seed.js) — one seeder, injected into the one engine. */
import { SUPPLIES } from '../../../src/data/supplies.js';
import { seederFor } from './hunt-seed.js';
/* THE MEMBER ASSEMBLY, the bonus chain and the weapon profile (src/core/member.js): shared with the
   browser's live view of a hunt (option B, 2026-10-19). */
import { memberSide, sharePurses } from '../../../src/core/member.js';
/* THE INSTANCE WORLD a settle resumes and leaves (src/core/hunt/world-state.js),
   and the analyzer's tally of what each hero dealt, took and healed. */
import { encode as encodeWorldRow, decodeStored as decodeWorldRow } from '../../../src/core/hunt/world-state.js';
import { tallyEvents } from '../../../src/core/hunt/tally.js';
import { reportProposal, barPlayedOf, gearWornOf } from '../../../src/core/hunt/report.js';
import { dangerOn } from '../../../src/core/hunt/danger.js';
import { BOSS_CALLS } from '../../../src/data/boss-calls.js';
import { roomOf } from '../../../src/core/hunt/boss-room.js';
/* THE WORLD BOUND (hunt_instances.world <= worldMaxBytes UTF-8 bytes): the engine
   refuses a world past it before anything is proposed (accrueHunt). */
import { HUNT_TUNING } from '../../../src/data/hunt-tuning.js';
import { xpFracChanges } from '../../../src/core/progression.js';
import { skillLevelFromXp, charLevelFromXp } from '../../../src/core/xp.js';
/* THE DAILY/QUEST COUNTER CONTRACT (Designer Ruling 3.1). The key shapes, the
   day key, the clamp and the vocabulary live in ONE module that both this
   engine and the guard read; see its header for why `kind='daily'`/`kind='stat'`
   and why the daily period is the day the player RETURNS. */
import {
  goalProgressOps,
  /* Slice 1 (bestiary, per-monster kills) + Slice 2 (collection, per-item
     loot): siblings of the goal counter, fed from the SAME kill/loot seams the
     goal model reads. See their headers in src/core/goals.js. */
  bestiaryProgressOps,
  collectionProgressOps,
  /* THE UTC DAY KEY. One definition — the Recovery ladder's `deaths` daily row
     must land under exactly the period key every other daily row lands under,
     or the free fall is anchored to a day nothing else agrees about. */
  utcDayKey,
} from '../../../src/core/goals.js';
import { catalogueHas } from './intents.js';
import { nat, SKIP } from './accrual-contract.js';

/* ── THE HUNT INSTANCE'S WINDOW (lane S1, HUNT_SCREEN_SPEC §1.1 / §1.3) ─────
   The longest window one settle may carry. A FUSE on engine time per request
   (6 h is 10,800 swings of 2 s, each 20 sub-steps), never a gameplay cap: an
   instance further behind than this catches up over successive settles, the
   remainder owed on its unmoved settled_to. hr_hunt_apply_member's own fuse is
   24 h. */
export const HUNT_MAX_WINDOW_MS = 6 * 3600000;

/* THE WORLD ON THE WIRE (spec §1.1 engine contract #4). hunt_instances.world
   is the COMPACT JSON TEXT of world-state.encode(world) — the form its 16 KB
   bound is measured on (octet_length of that text; jsonb::text would pad every
   separator). It arrives here as that text and leaves as that text. A world
   written under another field list (a deploy moved FIELDS) reads as null: the
   instance restarts its world from its stored swing (world-state decodeStored)
   rather than refusing every settle and freezing the hunt. */
function decodeWorld(stored) {
  const enc = typeof stored === 'string' ? JSON.parse(stored) : stored;
  return decodeWorldRow(enc);
}
export function encodeWorld(world) { return JSON.stringify(encodeWorldRow(world)); }

/* The world bound is measured in UTF-8 bytes of the compact text (SKIP.WORLD_TOO_LARGE). */
const utf8Bytes = (text) => new TextEncoder().encode(text).length;

/* THE ANALYZER TALLY of one member's hero (src/core/hunt/tally.js): what it
   dealt, took and healed, by ability / element / monster. Display stats the
   database stores with the session; every VALUE number of the analyzer comes
   from the ledger rows the settle journals, never from here.
   THE HUNT REPORT (GR-66, FB-7; src/core/hunt/report.js): the window's lowest
   health with its monster and blow, close calls, each bar rule's uses and
   waits, the bar as played and the gear worn. The database folds it into
   hunt_session_tally.report in the tally's one write (1053-hunt-report.sql).
   THE LEDGER (19-power-ledger L7; report.js ledgerWalk), on the Danger scale: `ledger` { step the window ended at, the span it played,
   each hero's seat }, the same for a hunt viewed and one with the browser closed (both settle here). */
function analyzerOf(sim, unitIds, unitId, side, ledger) {
  if (!Number.isInteger(unitId)) return null;
  const t = tallyEvents(sim.events, { heroes: unitIds, kinds: sim.kinds, ...(ledger ? { scale: ledger } : {}) }).heroes[unitId];
  if (!t) return null;
  const hero = side && side.member && side.member.hero;
  return { dealt: t.dealt, taken: t.taken, healed: t.healed,
    report: reportProposal(t.report, barPlayedOf(hero ? hero.slots : null), gearWornOf(side && side.mi ? side.mi.equipment : null, side ? side.catalogue : null)) };
}

/* THE RECORD OF A ROOM'S FIGHT, called or a keyed hall (Tyler 2026-11-05: a losing line naming the phase; hunt_session_tally.fight), display only: where the boss stood when this
   window closed, in permille of his HP (a room never heals him: leash.js resetPack), and what this hero's bar fired in it, by ability, plus `eat` and `drink`. */
function fightOf(sim, unitId, call) {
  const boss = sim.world ? sim.world.units.find((u) => u.kind === call.monster) : null;
  const fired = {};
  for (const e of sim.events) {
    if (e.u !== unitId) continue;
    const k = e.type === 'cast' ? e.ability : e.type === 'eat' || e.type === 'drink' ? e.type : null;
    if (k) fired[k] = (fired[k] || 0) + 1;
  }
  return { boss_pm: boss ? Math.floor((boss.hp * 1000) / boss.maxHp) : 0, fired };
}

/**
 * ONE SETTLE OF ONE HUNT INSTANCE (spec §1.3). A solo hunt is a party of one.
 *
 * @param inp.instance { id, nextSwingAtMs, world (the encoded world or null) }
 * @param inp.window   { fromMs (the instance's settled_to), toMs (the server's now) }
 * @param inp.secret   hr_seed(null, 0, 'hunt:' || instance) as decimal text
 * @param inp.ground / inp.grid  the hunt ground row and its walkable grid
 * @param inp.items / inp.monsters  the catalogues
 * @param inp.worldMaxBytes  TEST SEAM: a TIGHTER world bound, never a looser one
 *        (production passes none; the bound is HUNT_TUNING.worldMaxBytes)
 * @param inp.members  [{ key, user, slot, seat, unitId, session (engine shape
 *        input), hero { role, settings, bar, actionSet, range, element },
 *        + the envelope inputs (skills, levelXp,
 *        xpFrac, hp, gold, equipment, inventory, deathsLifetimeBefore, perks,
 *        hearthfindReady) }]
 * @param inp.scale    { level } when the server scales this window (hr_scaled_hunt_of through the instance read), else absent
 * @param inp.sessionMode  the instance's frozen session mode id (hunt_instances.session_mode through the instance read; src/data/session-modes.js)
 * @param inp.towerFloor  the Burning Tower's floor whose room stands, or stands next (hr_hunt_instance_read `tower_floor`: the run's start, or
 *        the highest floor its heroes cleared + 1); required on the Tower's ground (src/core/hunt/tower.js), never read elsewhere
 * @param inp.traitDrops  the Trait roll (hunt-settle.js traitDropsOf: { luckPm, pity, found }), only when the server's read says it is on;
 *        the engine pushes what it finds onto `found` and counts `pity` in place (src/core/trait-roll.js)
 * @returns { accrued, reason?, world, worldSwingFrom, worldSwingTo, settledTo,
 *            track, events, members: [{ key, delta, hunt }], scaleLevel }
 */
export function accrueHunt(inp) {
  const w = inp.window || {};
  const fromMs = Math.floor(nat(w.fromMs, -1));
  const toMs = Math.min(Math.floor(nat(w.toMs, -1)), fromMs + HUNT_MAX_WINDOW_MS);
  if (!(fromMs > 0) || !(toMs > fromMs)) return { accrued: false, reason: SKIP.TOO_SOON };
  if (!inp.ground || !inp.grid) return { accrued: false, reason: SKIP.NO_TARGET };
  const tickMs = COMBAT_BALANCE.tickMs;
  /* A FIGHT ON THE DANGER SCALE sizes every worn piece at the ground's base item Level (combat-sim.js fightItems, gear-stats.js scaleItems):
     its item Level is the power step, never its stats. Any other fight, a tier hunt on a scale ground included: the catalogue as written. */
  const ctx = { items: fightItems(inp.items || {}, inp.ground, inp.members, inp.scale), monsters: inp.monsters || {} };
  const sides = (inp.members || []).slice().sort((a, b) => (a.key < b.key ? -1 : 1)).map((mi) => memberSide(mi, ctx));
  /* ONE PURSE PER ACCOUNT (2026-12-15-account-gold.sql): an account's heroes in this instance spend the same gold. */
  sharePurses(sides);
  if (!sides.length) return { accrued: false, reason: SKIP.NOTHING };
  const world0 = inp.instance && inp.instance.world ? decodeWorld(inp.instance.world) : null;
  /* No world (a new or restarted instance): the instance's stored counter, which the commit's CAS holds. */
  const worldSwing0 = Math.max(0, Math.floor(nat(inp.instance && inp.instance.worldSwing, 0)));
  const worldSwingFrom = world0 ? world0.swing : worldSwing0;
  const swingFrom = new Map(sides.map((s) => [s.mi.key, s.hs.swingIndex]));
  /* THE INSTANCE'S KEYED SEEDER: built once per settle; throws on a missing or
     malformed secret — an unseeded hunt swing is a predictable one. */
  const seed = seederFor(String(inp.secret ?? ''), String(inp.instance.id));
  /* A SCALED HUNT (combat-sim.js huntPlayOf): the server's scale of this window, { level } or none; the engine answers what it played. */
  const scale = inp.scale && Number.isInteger(inp.scale.level) ? { level: inp.scale.level } : null;
  /* A LIVE EVENT (hr_live_xp_windows through the instance read): each member's own windows; none live, no hook, the hunt as it always ran. */
  const xpMultOf = xpMultFor(sides, (sd) => sd.mi.liveXp);
  /* THE SESSION MODE (src/data/session-modes.js): the instance's, frozen by the server at its start (hunt-settle.js reads it back). A
     death is priced at its share, so in a mode that costs nothing the proposal's death_xp is empty; the database bounds it again. */
  const sim = simulateHuntInstance(
    { world: world0, worldSwing: worldSwing0, nextSwingAtMs: Math.floor(nat(inp.instance.nextSwingAtMs, fromMs)), members: sides.map((s) => s.member) },
    { toMs, tickMs, seed, ground: inp.ground, grid: inp.grid, monsters: ctx.monsters, items: ctx.items, ...(scale ? { scale } : {}),
      ...(xpMultOf ? { xpMultOf } : {}), sessionMode: inp.sessionMode, ...(Number.isInteger(inp.towerFloor) ? { towerFloor: inp.towerFloor } : {}),
      /* THE TRAIT ROLL (hunt-settle.js traitDropsOf, only when the server's read says it is on; 1071-trait-pieces.sql): its found list and
         pity are the objects the caller reads back */
      ...(inp.traitDrops ? { traitDrops: inp.traitDrops } : {}) });
  const unitIds = [...new Set(Object.values(sim.members).map((m) => m.unitIdEver).filter(Number.isInteger))];
  /* THE LEDGER'S WINDOW (analyzerOf): on the scale, the swings this settle played and the seat of each hero (the server's hunt_sessions.seat) */
  const ledger = sim.world && dangerOn(sim.world) ? { step: sim.world.danger, fromMs: Math.floor(nat(inp.instance.nextSwingAtMs, fromMs)), toMs: sim.nextSwingAtMs,
    seats: Object.fromEntries(sides.filter((s) => Number.isInteger(sim.members[s.mi.key] && sim.members[s.mi.key].unitIdEver) && Number.isSafeInteger(s.mi.seat))
      .map((s) => [sim.members[s.mi.key].unitIdEver, s.mi.seat])) } : null;

  const out = [];
  for (const s of sides) {
    const summary = sim.members[s.mi.key];
    const hs = s.hs;
    if (hs.swingIndex === swingFrom.get(s.mi.key) && !hs.endedReason) continue;   // walked nothing: nothing to settle
    out.push({ key: s.mi.key, user: s.mi.user, slot: s.mi.slot, ...memberDelta(s, summary, fromMs, toMs, tickMs),
      analyzer: analyzerOf(sim, unitIds, summary.unitIdEver, s, ledger) });
    if (inp.ground.call && Number.isInteger(summary.unitIdEver)) {
      const row = out[out.length - 1];
      row.analyzer = { ...(row.analyzer || {}), fight: fightOf(sim, summary.unitIdEver, BOSS_CALLS[inp.ground.call]) };
    } else if (inp.ground.hall && Number.isInteger(summary.unitIdEver)) {
      /* A KEYED HALL keeps the same record (src/core/hunt/boss-room.js: its boss is the room's one spawn), read by the same losing line. */
      const room = roomOf(inp.ground);
      const row = out[out.length - 1];
      if (room) row.analyzer = { ...(row.analyzer || {}), fight: fightOf(sim, summary.unitIdEver, room) };
    }
  }
  if (!out.length) return { accrued: false, reason: SKIP.NOTHING };
  const world = sim.world && sim.members && sides.some((s) => !s.hs.endedReason) ? encodeWorld(sim.world) : null;
  const maxBytes = inp.worldMaxBytes == null ? HUNT_TUNING.worldMaxBytes
    : Math.min(HUNT_TUNING.worldMaxBytes, nat(inp.worldMaxBytes, HUNT_TUNING.worldMaxBytes));
  if (world !== null && utf8Bytes(world) > maxBytes) {
    return { accrued: false, refused: true, reason: SKIP.WORLD_TOO_LARGE, worldBytes: utf8Bytes(world), worldMaxBytes: maxBytes };
  }
  return {
    accrued: true,
    world,
    worldSwingFrom, worldSwingTo: sim.world ? sim.world.swing : worldSwingFrom,
    settledTo: sim.nextSwingAtMs,
    tickMs,
    track: sim.track, events: sim.events, units: sim.units,
    members: out,
    /* the Level the window played at (null: the ground's own), the commit's claim the server re-proves (hr_hunt_apply_instance) */
    scaleLevel: Number.isInteger(sim.scale) ? sim.scale : null,
  };
}

/* ONE MEMBER'S PROPOSAL: the hr_apply delta and the session half. */
function memberDelta(s, summary, fromMs, toMs, tickMs) {
  const { mi, hs, state } = s;
  const events = s.events;
  const levelUps = [];
  const xpDelta = {};
  for (const k in s.xpGained) {
    const g = Math.floor(s.xpGained[k] || 0);
    if (g > 0) xpDelta[k] = g;
  }
  /* THE LEVEL-UPS ARE THE BANKED ONES: the persisted xp plus the proposal,
     less what this window's death took back (the database debits it). */
  const xpLostOf = summary.xpLost || {};
  for (const k in xpDelta) {
    const before = nat(s.skills0[k], 0);
    const from = skillLevelFromXp(k, before);
    const to = skillLevelFromXp(k, before + xpDelta[k] - (Number(xpLostOf[k]) || 0));
    for (let lv = from; lv < to; lv++) levelUps.push({ skill: k, from: lv, to: lv + 1 });
  }
  const levelGain = Math.floor(s.levelGained());
  {
    const from = charLevelFromXp(s.levelXp0);
    const to = charLevelFromXp(s.levelXp0 + levelGain - (Number(xpLostOf.level) || 0));
    for (let lv = from; lv < to; lv++) levelUps.push({ skill: 'level', from: lv, to: lv + 1 });
  }
  const goldDelta = Math.floor(state.gold || 0);
  /* THE ITEM DELTA is the loot (store uses and own bag uses are the session
     half's). Unknown ids are dropped and reported. Every drop is an item: a
     pattern is learned per hero through hr_recipe_learn, never on a drop
     (tests/catalogue-coherence.mjs C16). */
  const items = s.catalogue || {};
  const items_ = {};
  let itemKinds = 0;
  for (const id in s.itemDelta) {
    if (!catalogueHas(items, id)) { events.push({ type: 'unknown_item_skipped', item: id }); continue; }
    const n = Math.floor(s.itemDelta[id]);
    if (n <= 0) continue;
    items_[id] = n;
    itemKinds++;
  }
  const stats = state.stats || {};
  const progress = [];
  const stat = (key, n) => { if (n > 0) progress.push({ kind: 'stat', key, period: '', add: Math.floor(n), state: 'active' }); };
  stat('kills', stats.kills);
  stat('crits', stats.crits);
  stat('deaths', stats.deaths);
  /* THE SECOND DEATHS ROW — each death under the UTC day of ITS OWN instant, never the window's end: a death at 23:59:50
     that a window closes after midnight is the old day's on every path, so the tick's windows and a player's instants
     write the same row. combat-sim die() is the one writer of stats.deaths and of deathLog, one of each per death at a
     swing's instant, so the two rows move together (BOTH-PATH-MIDNIGHT). */
  const deathDays = new Map();
  for (const d of (summary && summary.deathLog) || []) {
    const day = utcDayKey(d.atMs);
    if (day) deathDays.set(day, (deathDays.get(day) || 0) + 1);
  }
  for (const [day, n] of deathDays) progress.push({ kind: 'stat', key: 'deaths', period: day, add: n, state: 'active' });
  stat('rare_drops', stats.rareDrops);
  for (const op of goalProgressOps(s.goals, toMs, events)) progress.push(op);
  for (const op of bestiaryProgressOps(s.bestiary, events)) progress.push(op);
  for (const op of collectionProgressOps(s.collection, events)) progress.push(op);

  /* THE SESSION IS SETTLED THROUGH THE INTERVAL OF ITS LAST SWING: settled_to
     IS the next swing boundary, or one millisecond past the boundary the hunt
     ended on — the one instant every cut agrees on. */
  const settledTo = hs.endedReason ? hs.endedAtMs + 1 : Math.max(hs.nextSwingAtMs, fromMs + 1);
  const winFrom = Math.max(fromMs, Math.floor(nat(mi.huntSession && mi.huntSession.nextSwingAtMs, fromMs)));
  const delta = {
    accrued_to: new Date(settledTo).toISOString(),
    hp: Math.max(0, Math.min(state.playerMaxHp, Math.floor(state.playerHp))),
    journal: {
      kind: 'combat',
      intent: 'accrue',
      /* AGGREGATE, never per-tick and never per-kill (game_events reached 1.6M
         rows / 229 MB from six players in four days by journalling every kill).
         One row per settle: the window, its swings, its kills (the database
         holds them to the ground's spawn bound), the hunt and its kills by
         monster (`km`, summing to `kills`). */
      meta: { ms: settledTo - winFrom, ticks: summary.ticks, kills: summary.kills,
              mon: String(mi.huntId || '').slice(0, 64),
              /* (none in a session mode that counts no Bestiary, the Burning Tower's: its kills are journalled, never by monster, so no tally
                 task reads them; hr_mode_pays refuses a `km` there) */
              ...(summary.kills > 0 && Object.keys(s.bestiary.counts()).length ? { km: s.bestiary.counts() } : {}),
              /* A TRAINING WINDOW'S ITEM TIME (src/core/hunt/training.js trainingTick): the ms it played at the item's rate, the
                 claim hr_training_window re-proves against the hero's bank and spends (2027-04-23-training-gear.sql). */
              ...(hs.tally.boostMs > 0 ? { boost_ms: hs.tally.boostMs } : {}),
              /* A KEYED HALL'S DAILY PRIZE (src/data/boss-halls.js; hunt-rewards.js payPrize): this hero's roll for today was made in this
                 window, piece or no piece. Said only then, beside the boss's kill in `km`: hr_hunt_apply_member stamps the day on it
                 (2027-04-25-boss-daily.sql hr_boss_prize_take) and lets the piece through only on that stamp. A database before that
                 file never hears it: this engine rolls only on that file's `prize_left`. */
              ...(hs.prizeRolled === true ? { prize: true } : {}),
              from: new Date(winFrom).toISOString(),
              to: new Date(settledTo).toISOString() },
    },
  };
  if (goldDelta > 0) delta.gold = goldDelta;
  /* AT MOST ONE find per apply (hr_apply accepts one); a discarded second is
     COUNTED (`dropped`) and journalled by hr_apply, never silent. */
  if (mi.hearthfindReady && s.finds.length) {
    delta.hearthfind = s.finds.length > 1 ? { ...s.finds[0], dropped: Math.min(s.finds.length - 1, 99) } : s.finds[0];
  }
  if (itemKinds > 0) delta.items = items_;
  if (Object.keys(xpDelta).length) delta.xp = xpDelta;
  /* THE LEVEL XP the window's kills paid (hr_apply clamps it by the journalled kills). */
  if (levelGain > 0) delta.level_xp = levelGain;
  if (s.xpFrac0) {
    const fr = xpFracChanges(s.xpFrac0, state.xpFrac);
    if (Object.keys(fr).length) delta.xp_frac = fr;
  }
  if (progress.length) delta.progress = progress;
  /* THE DEATH ROW (a hero dies once a hunt: the hunt ends `died`), stating the lifetime count and whether food was
     left in the bag. Not the day's count: a settle after midnight reads the new day's, one before it the death's. */
  if (Array.isArray(summary.deathLog) && summary.deathLog.length) {
    const hadFood = Object.keys(hs.bag).some((id) => SUPPLIES[id] && SUPPLIES[id].kind === 'heal' && hs.bag[id].left > 0);
    delta.deaths = summary.deathLog.slice(0, 1).map((d) => ({
      monster: String(d.monster || ''),
      deaths_lifetime: nat(mi.deathsLifetimeBefore, 0) + 1,
      food_in_bag: hadFood,
    }));
  }
  return {
    delta,
    hunt: huntProposal(hs, s.mi.huntSession ? Math.max(0, Math.floor(Number(s.mi.huntSession.swingIndex) || 0)) : 0,
      settledTo, summary, tickMs),
    maxHp: state.playerMaxHp,
    maxMana: state.playerMaxMana,
    levelUps,
    events,
    summary: { ...summary, gold: goldDelta, xp: xpDelta, levelXp: levelGain, items: items_, levelUps },
  };
}

/* ── THE SESSION'S HALF OF A SETTLE (lane S1) ────────────────────────────────
   What hr_hunt_apply_member hands hr_hunt_settle_session in the SAME
   transaction as the hr_apply delta. Every value is the span's own statement
   about THIS window; the database re-proves each one from server state (swing
   CAS, window bounds, bag sufficiency, per-lane use caps, a `died` end = the
   death row hr_apply just wrote, every end re-derived, the store re-priced).
   `uses` / `buys` ARE THE SUPPLY LEDGER (spec §3.8): own units leave the bag
   and are journalled `supply_own` (no gold); store units are priced from the
   catalogue and journalled `supply_buy` (gold). The hints are TIMES ONLY; a
   rare-drop hint names an item the settle accepts only if its own ledger rows
   looted it. */
function huntIso(ms) { return new Date(Math.floor(ms)).toISOString(); }
export function huntProposal(hs, swingFrom, settledToMs, summary, tickMs) {
  const t = hs.tally || {};
  const pos = (o) => Object.fromEntries(Object.entries(o || {})
    .map(([id, n]) => [id, Math.floor(Number(n) || 0)]).filter(([, n]) => n > 0));
  const hints = { slot_dry: {}, death: [], rare_drop: [] };
  for (const e of (summary && Array.isArray(summary.huntEvents) ? summary.huntEvents : [])) {
    if (!e) continue;
    if (e.type === 'slot_dry' && e.item && !(e.item in hints.slot_dry)) hints.slot_dry[e.item] = Math.floor(e.atMs);
    else if (e.type === 'death') hints.death.push(Math.floor(e.atMs));
    else if (e.type === 'rare_drop' && e.item) hints.rare_drop.push({ item: String(e.item), at: Math.floor(e.atMs) });
  }
  const rawXp = {};
  for (const k of Object.keys(t.xp || {})) {
    const v = Number(t.xp[k]);
    if (Number.isFinite(v) && v > 0) rawXp[k] = Math.round(v * 1000) / 1000;
  }
  /* "Level XP before bonuses" is the even share, not what was paid (blind panel 2026-11-01: the analyzer's two lines always matched). */
  if (Number.isInteger(t.rawLevelXp) && t.rawLevelXp > 0) rawXp.level = t.rawLevelXp;
  /* A LIVE EVENT'S PART of this window's Level XP (member.js xpEvent), sent only when there is one: the server bounds it and keeps it apart
     (hunt_session_tally.xp_event), so a personal best leaves it out (2027-03-22-live-events.sql). */
  const xpEvent = Number.isInteger(t.xpEvent) && t.xpEvent > 0 ? t.xpEvent : 0;
  const next = Math.max(Math.floor(hs.nextSwingAtMs), Math.floor(settledToMs));
  return {
    swing_from: swingFrom,
    swing_to: hs.swingIndex,
    to: huntIso(settledToMs),
    next_swing_at: huntIso(next),
    uses: pos(t.supplies),
    paid_ms: Math.max(0, Math.floor(Number(t.paidMs) || 0)),
    raw_xp: rawXp,
    hints,
    /* `ability`: the spell whose slot left the hunt out of its ticked runes (runes_out), which the server's re-proof reads. */
    ended: hs.endedReason ? { reason: hs.endedReason, at: huntIso(hs.endedAtMs),
      ...(hs.endedReason === 'runes_out' && typeof hs.runesOut === 'string' ? { ability: hs.runesOut } : {}) } : null,
    buys: pos(t.bought),
    cover: pos(t.covered),
    /* THE STAMINA POOL AT `to`, walked swing by swing from the database's own
       start value (hr_stamina_of); re-bounded there against this window's
       paid time. */
    stamina: hs.staminaMs === null || hs.staminaMs === undefined ? null : Math.max(0, Math.floor(Number(hs.staminaMs))),
    /* THE PRICE OF THE DEATH, `{ level?, <skill>?: xp }` for the death row (at most one). */
    death_xp: ((summary && Array.isArray(summary.deathLog)) ? summary.deathLog : [])
      .slice(0, 1).map((d) => Object.assign({}, (d && d.xpLost) || {})),
    /* THE HERO'S UNIT in the instance world (null once it has left). */
    unit_id: summary && Number.isInteger(summary.unitId) ? summary.unitId : null,
    tick_ms: tickMs,
    ...(xpEvent > 0 ? { xp_event: xpEvent } : {}),
    /* THE BURNING TOWER (src/core/hunt/tower.js): the floors this hero cleared standing in this window, in order; the database re-proves
       them against its own run (one after another from its record, no faster than the stair, each a room of kills) and writes the climb. */
    ...(summary && summary.tower ? { tower: { floors: summary.tower.floors.slice() } } : {}),
  };
}
