// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/summary-model.js — THE END-OF-HUNT SUMMARY, FROM SERVER FACTS (QoL 8).
//
// PURE (no DOM, no clock). When a hunt's session ends (any END_ORDER reason)
// the player gets one card: how long, kills, XP, gold, balance per hour (raw XP
// per hour for premium), top loot, supplies used
// from the bag vs the store, why it ended in plain words, and the settings to
// go again. Every number is read off the server's own sections:
//   `hunt`           the session (id, hunt, preset, limits, bag, tally, end_reason)
//   `hunt_analyzer`  the session's stats (premium only)
// The card never computes a tally; where a field is missing the card omits it.
//
// The last HISTORY_MAX summaries per character live in the display-only
// residue field `huntSummaries` (src/session/residue.js). Nothing here gates
// or spends anything: "Hunt again" sends the session's own settings back as
// ONE hr_hunt_enter intent, and the server re-checks every one of them.
//
// Reading `hunt`: the server's session record sits under `hunt.session` (the
// section view) and, in the client fixture, flat on `hunt`. Both are read.
// ════════════════════════════════════════════════════════════════════════
import { sanitizeSummary, sanitizeSummaries } from '../session/hunt-summaries.js?v=0.2.140';
import { END_REASON_COPY } from '../data/hunt-sessions.js?v=0.2.140';
import { cameHomeWords } from '../data/party-words.js?v=0.2.140';
import { BOSS_HALL_WORDS, roomOfHunt } from '../data/boss-halls.js?v=0.2.140';
import { lossLine, seriesLine } from './boss-loss.js?v=0.2.140';
import { BOSS_CALL_WORDS } from '../data/boss-calls.js?v=0.2.140';
import { callOf, sessionModeOfHunt } from '../session/hunt-sections.js?v=0.2.140';
import { trainingOf as trainedBy } from '../data/training.js?v=0.2.140';
import { endedWords as trainingEndWords } from '../shell/training-words.js?v=0.2.140';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.140';
import { DEFAULT_TIER, TIER_NAME } from '../data/hunt-tiers.js?v=0.2.140';
import { ITEMS } from '../data/items.js?v=0.2.140';
import { isRareItem } from '../shell/hunt-ground-facts.js?v=0.2.140';
import { t } from '../render/player-text.js?v=0.2.140';
import { gold as gp } from '../render/format.js?v=0.2.140';

export { sanitizeSummaries };


/** Why a hunt ended, as a label (one per END_ORDER name; a guard in tests/hunt-summary.mjs keeps them equal; src/data/text/summary.js). */
export const END_WORDS = Object.freeze({
  died: t('summary.end_died'),
  boss_felled: t('summary.end_boss_felled'),
  party_member_died: t('summary.end_party_member_died'),
  party_member_left: t('summary.end_party_member_left'),
  heals_out: t('summary.end_heals_out'),
  ammo_out: t('summary.end_ammo_out'),
  runes_out: t('summary.end_runes_out'),
  gold_out: t('summary.end_gold_out'),
  rule: t('summary.end_rule'),
  stamina: t('summary.end_stamina'),
  hours: t('summary.end_hours'),
  boss_time: t('summary.end_boss_time'),
  floor_time: t('summary.end_floor_time'),
  left: t('summary.end_left'),
  changed: t('summary.end_changed'),
  no_fight: t('summary.end_no_fight'),
  server: t('summary.end_server'),
});

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v) => (Number.isSafeInteger(v) ? v : null);
const ID = /^[a-z0-9_]{1,64}$/;
const id = (v) => (typeof v === 'string' && ID.test(v) ? v : null);
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const ms = (v) => { if (typeof v === 'number' && Number.isFinite(v)) return v; const at = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(at) ? at : null; };

/* A hunt ended by the refused-window rule (the session's server-stated `forfeit`: six refused windows in a
   row, hr_hunt_forfeit): what was lost and why, never "by the server" (2026-11-17-hunt-density-home.sql). */
export const FORFEIT_WORDS = Object.freeze({ server: t('summary.forfeit_server'), left: t('summary.forfeit_left') });

/** The plain-words end reason (`forfeit`: the server forfeited the hunt's last window); an unknown name still reads as a sentence.
    LEAVE TOGETHER: a hero sent home by another member's end names that member (`by`, the server's end_by), what ended it
    (`why`, end_by_why) and itself (`hero`), "Mira ran out of stamina, so Oren came home too." (party-words.js cameHomeWords). */
export function endWords(reason, forfeit, by, hero, why, hunt) {
  if (typeof by === 'string' && by && (reason === 'party_member_left' || reason === 'party_member_died')) return cameHomeWords(reason, by, why, hero);
  /* A TRAINING SESSION (src/data/training.js) is no hunt: the Training window's own label ("Defense training ended: max session
     reached"), never "The hunt reached its time limit." or "You left the hunt." */
  const train = hunt ? trainedBy(hunt) : null;
  if (train && reason && !forfeit) return trainingEndWords({ reason, skill: train.skill });
  /* A KEYED HALL'S KILL (src/data/boss-halls.js) names him and no title: END_WORDS.boss_felled is a called room's. */
  const room = reason === 'boss_felled' && hunt ? roomOfHunt(hunt) : null;
  if (room && room.kind === 'hall') return BOSS_HALL_WORDS.felled.replace('{Boss}', room.Boss);
  /* A CALL OUT SERIES that ended short of its count: the hero could not pay another fight (src/data/boss-calls.js series.ended). */
  const short = BOSS_CALL_WORDS.series.ended;
  if (forfeit !== true && hunt && Object.hasOwn(short, reason) && (roomOfHunt(hunt) || {}).kind === 'call') return short[reason];
  /* A MODE THAT TAKES NOTHING FOR A DEATH (session-modes.js deathLossPm 0: the Burning Tower spits you out) never reads "Died" (audit 2026-11-18
     A5: the hunt history listed a climb as Died, though the Tower says it can't kill you) */
  /* ...and in the Unmarked Catacombs Keeper Dunn carries the hero up (session-modes.js `catacomb`) */
  if (reason === 'died' && hunt && sessionModeOfHunt(hunt).deathLossPm === 0) return sessionModeOfHunt(hunt).id === 'catacomb' ? t('catacomb.end_carried') : t('summary.end_spat');
  return (forfeit === true && FORFEIT_WORDS[reason]) || END_WORDS[reason] || t('summary.end_plain');
}

/**
 * A HUNT THAT RAN OUT OF GOLD SAYS WHY, IN ITS OWN NUMBERS (post-patch audit 2026-11-18 B3: a solo Level 5 in the Sewer read "Gold reserve
 * reached" beside Gold +2,679 gp and Balance +871 gp; played on the local world, 680 gp of coins against 1,160 gp of store food took the purse
 * from 787 gp to the 300 gp reserve in 19 min, a real stop). What the store's supplies cost is the server's tally (its balance is coins plus
 * loot value less those supplies, so they are coins + loot value - balance), the coins are its tally too, and `floor` is the reserve the
 * server keeps (hunt-sections.js goldFloorOf). Loot is not gold until it is sold, so it is no part of the sum. Short of either number it
 * says the reserve alone, and short of that the plain label.
 */
export function goldOutWords(s, floor) {
  const reserve = Number.isSafeInteger(floor) && floor >= 0 ? gp(floor) : null;
  const kept = goldKeptOf(s);
  if (reserve && kept && kept.spent > 0) return t('summary.end_gold_out_why', { spent: gp(kept.spent), coins: gp(kept.coins), floor: reserve });
  return reserve ? t('summary.end_gold_out_floor', { floor: reserve }) : END_WORDS.gold_out;
}

/**
 * WHAT THE PURSE KEPT FROM A HUNT, from its server tally (`s`: a stored summary's, or the analyzer's hero view in that shape: gold = the coins,
 * lootValue, balance): the coins, what the store's supplies cost (the balance is coins + loot value - those supplies, so they are
 * coins + loot value - balance) and the difference, `net`. Loot is not gold until it is sold, so it is no part of it. Null when the tally
 * lacks any of the three (an older record): the cards then say Coins (../shell/result-block.js goldFig). The away card's reading too.
 */
export function goldKeptOf(s) {
  const coins = int(s && s.gold), loot = int(s && s.lootValue), balance = int(s && s.balance);
  if (coins === null || loot === null || balance === null) return null;
  const spent = Math.max(0, coins + loot - balance);
  return { coins, spent, net: coins - spent };
}

/** The end card's reason line. `msLeft`: the stamina the server says the hero has now, given only for the newest hunt with none running:
    out of stamina, the card says what it has rested back, so Hunt again is a decision and not a guess (panel 2026-11-01). */
export function reasonWords(s, hero, msLeft, floor) {
  const why = s.reason === 'gold_out' && s.forfeit !== true ? goldOutWords(s, floor)
    : s.reason ? endWords(s.reason, s.forfeit, s.by, hero, s.why, s.hunt) : t('summary.end_plain');
  if (s.reason !== 'stamina' || !Number.isFinite(msLeft)) return why;
  const m = Math.floor(msLeft / 60000);
  return t('summary.stamina_now', { why, left: (m >= 60 ? Math.floor(m / 60) + ' h ' : '') + (m % 60) + ' min' });
}

/* A tally's loot / supplies, whichever shape the server sent: {item: n}, [{item, count}] or {item: {own, store}}. */
function countPairs(v) {
  const out = [];
  if (Array.isArray(v)) for (const l of v) { if (isObj(l) && id(l.item) && num(l.count) !== null) out.push([l.item, l.count]); }
  else if (isObj(v)) for (const [k, n] of Object.entries(v)) if (id(k) && num(n) !== null) out.push([k, n]);
  return out;
}

/* Gear a hero can wear (ammo is a supply), or a Rare row somewhere (the Hunts page's own test): the finds worth a line of their own. */
const standout = (id) => { const it = ITEMS[id]; return !!(it && it.slot && it.slot !== 'ammo') || isRareItem(id); };
const each = (r) => (Number.isFinite(r.value) && r.count > 0 ? r.value / r.count : -1);

/**
 * TOP LOOT, BEST FIRST (designer re-read 2026-11-11: Bones, Rat Tail and Wheat led by count, and the Iron Platebody and the Alpha
 * Fangs never got a line): gear and Rares first, then the most each one is worth at the shop's bid (the server's, hunt-sections.js's
 * row value; a row the shop has no bid for comes after), then the most of it. Display order only.
 * @param {{item:string, count:number, value?:number|null}[]} rows
 * @returns {{item:string, count:number, value?:number|null}[]}
 */
export function rankLoot(rows) {
  return (rows || []).slice().sort((a, b) => (standout(b.item) - standout(a.item)) || (each(b) - each(a)) || (b.count - a.count) || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
}

/** The best find in these rows when one stands out (gear or a Rare), else null: the away card's line. */
export function bestFind(rows) {
  const top = rankLoot(rows)[0];
  return top && standout(top.item) ? top.item : null;
}

/**
 * The hunt section's session, read tolerantly. Null when there is no session
 * or it is still open (`ended` false).
 */
export function endedSessionOf(cs) {
  const h = cs && typeof cs.read === 'function' ? cs.read('hunt') : null;
  if (!isObj(h)) return null;
  const s = isObj(h.session) ? h.session : h;
  const sid = typeof s.id === 'string' ? s.id : typeof s.session_id === 'string' ? s.session_id : typeof h.session_id === 'string' ? h.session_id : null;
  if (!sid) return null;
  const ended = h.ended === true || s.ended === true || s.phase === 'ended' || s.ended_at != null;
  const bag = [];
  if (Array.isArray(s.bag)) {
    for (const b of s.bag.slice(0, 64)) if (isObj(b) && id(b.item) && int(b.loaded) !== null && b.loaded > 0) bag.push([b.item, b.loaded, b.essential === true ? 1 : 0]);
  }
  return {
    id: sid.slice(0, 64), ended,
    hunt: id(s.hunt) || id(s.hunt_id) || id(h.hunt_id), reason: typeof s.end_reason === 'string' ? s.end_reason : typeof h.end_reason === 'string' ? h.end_reason : null,
    /* The server says the hunt's last window was forfeited (hr_hunt_view `forfeit`). */
    forfeit: s.forfeit === true,
    /* LEAVE TOGETHER: the member whose end sent this hero home (hr_hunt_view `end_by`), or null. */
    by: typeof s.end_by === 'string' && s.end_by.trim() ? s.end_by.trim().slice(0, 40) : null,
    /* What ended that member (hr_hunt_view `end_by_why`), or null. */
    why: typeof s.end_by_why === 'string' ? s.end_by_why : null,
    preset: int(s.preset), hoursLimit: int(s.hours_limit),
    enteredMs: ms(s.entered_at), endedMs: ms(s.ended_at), bag,
    tally: isObj(s.tally) ? s.tally : null,
    died: int(isObj(s.tally) ? s.tally.deaths : null),
    /* The tier it ran at, the server's (hr_hunt_view `tier`, stamped as it ended), or null. */
    tier: typeof s.tier === 'string' ? s.tier : null,
    /* A called fight's record, the server's (hunt_session_tally.fight): the losing line reads it. */
    fight: isObj(s.tally) && isObj(s.tally.fight) ? s.tally.fight : null,
    /* A Call out series, the server's count and bill (hr_hunt_view `call`), or null. */
    call: callOf(s.call),
  };
}

/**
 * A TRAINING SESSION'S CARD (designer's coherence pass 2026-11-15, walk row 5: an hour at the yard read "Monsters 0, Level XP 0, Gold 0"
 * and left out the Defense it gave and the 176 g it cost). For a session on a training ground: the skill, its XP (the server's last
 * stop for this session, else the session's own tally), and from that last stop the gold its fee rows took and the skill's level before
 * and after. Null for a hunt. `stop`: training-sections.js lastStop, or null. Pure.
 * @returns {{skill: string, xp: number|null, fee: number|null, from: number|null, to: number|null}|null}
 */
export function trainingCard(s, stop) {
  const tr = s && s.hunt ? trainedBy(s.hunt) : null;
  if (!tr) return null;
  const xp = s.tally && isObj(s.tally.xp) ? num(s.tally.xp[tr.skill]) : null;
  const mine = stop && stop.session === s.id && stop.skill === tr.skill ? stop : null;
  return { skill: tr.skill, xp: mine && mine.xp !== null ? mine.xp : xp === null ? null : Math.floor(xp),
    fee: mine ? mine.paid : null, from: mine ? mine.from : null, to: mine ? mine.level : null };
}

/**
 * A stored training card the server's last stop has caught up with (the `training` section can land after the `hunt` one that
 * ended it): the card with the stop's fee and levels, or null when there is nothing to fill. Pure.
 */
export function withTrainingStop(summary, stop) {
  const tr = summary && summary.train;
  if (!tr || tr.fee !== null || !stop || stop.session !== summary.id || stop.skill !== tr.skill || stop.paid === null) return null;
  return Object.assign({}, summary, { train: { skill: tr.skill, xp: stop.xp !== null ? stop.xp : tr.xp, fee: stop.paid, from: stop.from, to: stop.level } });
}

/**
 * IS THE HUNT STILL AT ITS START? The server's tally of this session has paid no kill and no Level XP yet (none at all before its first
 * settle), so the Level and skill levels the server states now are the ones the hunt began at. Pure.
 */
export function atStart(s) {
  const paid = s && isObj(s.tally) ? s.tally : {};
  const xp = isObj(paid.xp) ? num(paid.xp.level) : num(paid.xp);
  return !!s && !s.ended && !(int(paid.kills) > 0) && !(xp > 0);
}

/**
 * THE LEVEL LINE (UI audit 2026-11-18 #1: a 6 h hunt never said "Level 5 to 8"), from TWO SERVER ANSWERS, never this build's curve
 * (item-sections.js skillLevelsOf: the class lane/c-level-from-server closed): `start` the stamp of the server's Level and skill
 * levels taken while the session was at its start (atStart; residue `huntStart`), `lv` the server's Level block now (character-sections.js
 * levelOf), `levels` the server's skill levels now (skillLevelsOf). `trained`: the skills the session's tally paid XP to, the only
 * skills the line names (a bench after the hunt is not the hunt's). A stamp of another session gives no `from`. Pure.
 * @returns {{lvFrom: number|null, lvTo: number|null, ups: [string, number, number][]}}
 */
export function levelLine(sessionId, start, lv, levels, trained) {
  const mine = isObj(start) && start.s === sessionId ? start : null;
  const lvTo = lv && Number.isSafeInteger(lv.level) && lv.level >= 1 ? lv.level : null;
  const lvFrom = mine && lvTo !== null && Number.isSafeInteger(mine.lv) && mine.lv >= 1 ? mine.lv : null;
  /** @type {[string, number, number][]} */
  const ups = [];
  for (const sk of Array.isArray(trained) ? trained : []) {
    const was = mine && isObj(mine.sk) ? int(mine.sk[sk]) : null, now = isObj(levels) && isObj(levels[sk]) ? int(levels[sk].level) : null;
    if (was !== null && now !== null && now > was) ups.push([sk, was, now]);
  }
  return { lvFrom, lvTo, ups: ups.sort((a, b) => (b[2] - b[1]) - (a[2] - a[1]) || (a[0] < b[0] ? -1 : 1)) };
}

/** The skills a session's tally paid XP to (its `xp` keys but the Level's), or the analyzer's training rows. Pure. */
export function trainedIn(s, an) {
  const xp = s && isObj(s.tally) && isObj(s.tally.xp) ? s.tally.xp : null;
  if (xp) return Object.keys(xp).filter((k) => k !== 'level' && ID.test(k) && num(xp[k]) > 0);
  return an && an.hero && Array.isArray(an.hero.training) ? an.hero.training.map((r) => r.skill).filter((k) => typeof k === 'string' && ID.test(k)) : [];
}

/**
 * The summary record for an ended session.
 * @param {object} s         endedSessionOf(cs)
 * @param {object|null} an   analyzerOf(cs) (hunt-sections.js) or null
 * @param {string[]} deaths  the death explanations' headlines (death-explain.js)
 * @param {string|null} [role]  this hero's role, for a called fight's losing line
 * @param {object|null} [stop]  the `training` section's last stop (training-sections.js), for a training session's card
 * @param {{lvFrom: number|null, lvTo: number|null, ups: [string, number, number][]}|null} [line]  levelLine's, for a hunt's card
 */
export function buildSummary(s, an, deaths, role, stop, line) {
  const train = trainingCard(s, stop || null);
  /* a training session pays no kill, Level XP, coin or loot and spends no supply: its card is the skill, never a row of zeros */
  if (train) {
    const dur = an && an.sessionMs !== null && an.sessionMs !== undefined ? an.sessionMs
      : s.enteredMs !== null && s.endedMs !== null ? Math.max(0, s.endedMs - s.enteredMs) : null;
    return sanitizeSummary({ id: s.id, hunt: s.hunt, at: s.endedMs, reason: s.reason, forfeit: s.forfeit === true, ms: dur,
      preset: s.preset, hoursLimit: s.hoursLimit, bag: [], loot: [], supplies: [], deaths: [], train });
  }
  const hero = an && an.hero;
  const ph = hero && hero.perHour ? hero.perHour : null;
  const tl = s.tally || {};
  const dur = an && an.sessionMs !== null && an.sessionMs !== undefined ? an.sessionMs
    : s.enteredMs !== null && s.endedMs !== null ? Math.max(0, s.endedMs - s.enteredMs) : null;
  const loot = rankLoot(hero ? hero.loot.filter((l) => id(l.item) && num(l.count) !== null) : countPairs(tl.loot).map(([item, count]) => ({ item, count })))
    .map((l) => [l.item, l.count]);
  const supplies = hero ? hero.supplies.filter((x) => id(x.item) && num(x.count) !== null).map((x) => [x.item, x.source, x.count])
    : countPairs(tl.supplies).map(([item, n]) => [item, 'own', n]);
  return sanitizeSummary({
    id: s.id, hunt: s.hunt, tier: s.tier || null, at: s.endedMs, reason: s.reason, forfeit: s.forfeit === true, by: s.by || null, why: s.why || null, ms: dur,
    /* `xp` is LEVEL XP only (the tally's `level` key), never Level plus training (Tyler 2026-10-22). */
    kills: hero ? hero.kills : int(tl.kills), xp: hero ? hero.levelXp : isObj(tl.xp) ? num(tl.xp.level) : num(tl.xp), gold: hero ? hero.gold : num(tl.coins),
    /* `gold` is coin received (the server's coins); the loot's shop price is its own line (Brannoc 10-22). */
    lootValue: hero ? hero.lootValue : null,
    /* The hunt's BALANCE, the server's own (coins + loot value - store supplies): it is there from the first kill,
       where the per-hour figure waits for 10 minutes (core-loop play 2026-10-30: a first 4-minute hunt read "–"). */
    balance: hero ? hero.balance : null,
    /* Per hour, the server's (hr_hunt_stats_of per_hour): balance for every character; Level XP with no party or solo bonus
       only when the server sent it (premium: the basic analyzer carries no raw_xp). Never divided here. */
    balanceH: ph ? ph.balance : null, rawXpH: ph ? ph.rawLevelXp : null,
    /* Level XP an hour, the server's (per_hour.xp, sent once the hunt is rated): the end card's figure under the Level XP. */
    xpH: ph ? ph.levelXp : null,
    /* THE LEVEL LINE (levelLine): the Level the hunt began at and ended at, and the skills it raised, each the server's. */
    lvFrom: line ? line.lvFrom : null, lvTo: line ? line.lvTo : null, ups: line ? line.ups : [],
    died: s.died, loot, supplies,
    preset: s.preset, hoursLimit: s.hoursLimit, bag: s.bag, deaths,
    loss: lossLine({ hunt: s.hunt, reason: s.reason, fight: s.fight || null, role: role || null }),
    series: seriesLine(s.call || null),
  });
}

/** The card's and the history's name for a hunt: its ground, and the tier it ran at when that was harder than Normal ("Wickstead · Dangerous"). */
export function groundTitle(s) {
  const name = s && s.hunt && HUNT_INDEX[s.hunt] ? HUNT_INDEX[s.hunt].name : 'Hunt';
  return s && s.tier !== DEFAULT_TIER && Object.prototype.hasOwnProperty.call(TIER_NAME, s.tier) ? name + ' (' + TIER_NAME[s.tier] + ')' : name;
}

/** The list with `summary` first (replacing the same session id), bounded. */
export function withSummary(list, summary) {
  const rest = (Array.isArray(list) ? list : []).filter((x) => x.id !== summary.id);
  return sanitizeSummaries([summary, ...rest]);
}

/**
 * The ONE hr_hunt_enter argument set that puts the same hunt back on: the same
 * ground, preset, limits and bag. The party is the server's (the character's
 * current party); the server checks stock, stamina and the ground again.
 * @returns {{hunt: string, bag: {item: string, qty: number, essential?: boolean}[], preset: number, hours: number|null}|null}
 */
export function huntAgainOf(summary) {
  /* A boss room has one door, its press on the ground's page (a call's fee or a hall's key: src/data/boss-halls.js): no free way back. */
  if (!summary || !summary.hunt || summary.preset === null || roomOfHunt(summary.hunt)) return null;
  /* ...and training has its own, the Training window's Start (hr_training_start): never an hr_hunt_enter */
  if (trainedBy(summary.hunt)) return null;
  return {
    hunt: summary.hunt, preset: summary.preset, hours: summary.hoursLimit,
    bag: summary.bag.map(([item, qty, ess]) => (ess ? { item, qty, essential: true } : { item, qty })),
  };
}

/**
 * WHAT HUNT AGAIN MAY DO IN A PARTY (the LEADER chooses the hunt, Tyler 2026-10-20; friends' panel 2026-11-01: a member's Hunt again set out
 * with no leader action, where Enter said "Your party leader picks the hunt and starts it"). `party`: partyMembershipOf, null for a lone hero.
 *   { how: 'enter' }  this hero alone: no party, or back into the hunt its party is on now (the ground the leader chose)
 *   { how: 'party' }  the leader, nobody out: the party's Start, everyone walks in
 *   { how: null, why } off, and why. Display only: the server checks every intent (a member's own hr_hunt_enter is not refused yet).
 */
export function againRoute(party, hunt) {
  if (!party) return { how: 'enter', why: '' };
  if (party.seats.some((s) => s.seat !== party.me && s.hunting)) {
    return party.hunt === hunt ? { how: 'enter', why: '' } : { how: null, why: t('summary.again_elsewhere') };
  }
  return party.isLeader ? { how: 'party', why: '' } : { how: null, why: t('summary.again_leader') };
}

/**
 * Hunt again with what the bag holds NOW (`pack`: hunt-list.js packFor, Enter's own), never the old hunt's loaded counts:
 * the supplies it ate are gone, so the old counts were refused as "You no longer have that many." while Enter went in
 * at once (blind playtest 2026-10-31). What stays the old hunt's: the ground, the set, the limits, its essential marks.
 */
export function againWithBag(args, pack) {
  const essential = new Set(args.bag.filter((l) => l.essential === true).map((l) => l.item));
  return Object.assign({}, args, { bag: pack.map((l) => (essential.has(l.item) ? { item: l.item, qty: l.qty, essential: true } : { item: l.item, qty: l.qty })) });
}

/**
 * A hero's last-seen vitals and the event buffer for one character's current
 * hunt. `names.name(u)` / `names.isHero(u)` resolve at arrival (the pose
 * forgets a unit once it is gone). An event id counts once; the buffer is the
 * newest `max` events only.
 * @param {{max?: number, names: {name: (u: number) => string, isHero: (u: number) => boolean}}} o
 */
export function createRecorder(o) {
  const max = o.max || 600;
  const seen = new Set();
  let events = [];
  return {
    /** @returns {boolean} true when the event was new */
    add(ev, vitalsOf) {
      if (!ev || typeof ev.type !== 'string') return false;
      const key = ev.key !== undefined ? 'k:' + ev.key : ev.id !== undefined ? 'i:' + ev.id : null;
      if (key === null || seen.has(key)) return false;
      seen.add(key);
      const row = Object.assign({}, ev, { an: Number.isInteger(ev.u) ? o.names.name(ev.u) : undefined, tn: Number.isInteger(ev.t) ? o.names.name(ev.t) : undefined });
      if (ev.type === 'death' && typeof vitalsOf === 'function') row.vitals = vitalsOf(ev.u);
      events.push(row);
      if (events.length > max) {
        const cut = events.splice(0, events.length - max);
        for (const c of cut) seen.delete(c.key !== undefined ? 'k:' + c.key : 'i:' + c.id);
      }
      return true;
    },
    events: () => events,
    reset() { events = []; seen.clear(); },
  };
}
