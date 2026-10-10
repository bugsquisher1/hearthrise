#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/codex-claims.mjs — THE HEARTH CODEX MAY NOT SAY WHAT THE GAME DOES NOT
//
//   node tests/codex-claims.mjs             # the guard
//   node tests/codex-claims.mjs --selftest  # every mutation must be CAUGHT
//
// Ships with: src/data/codex.js · src/features/codex.js
//
// ── WHY ─────────────────────────────────────────────────────────────────
// A glossary is copy, and copy is where "the browser says one thing and the
// server says another" (CLAUDE.md §6) hides best: nobody re-reads it when the
// engine moves. The first draft of this Codex said bigger homes raise the away
// limit (hr_offline_cap_ms counts only clan perks), that Farmer's Deeds drop
// from monsters (only dungeon chests hold them) and that charm rank 1 pays
// more loot (it reveals; it pays 1.00). Each was a sentence with no predicate,
// or a predicate that checked half the sentence.
//
// So: every SENTENCE of every entry names at least one bind, every bind is a
// predicate over the engine (src/core, src/data imported) or the SQL authority
// (supabase/migrations read as TEXT at the chain end of
// tests/schema-apply-order.json), and the guard is RED the day either moves.
//
// ── THE RULES ───────────────────────────────────────────────────────────
//   CODEX-1   ids are unique slugs
//   CODEX-2   every group is known and non-empty
//   CODEX-3   every text is 80-320 characters and ends with a full stop
//   CODEX-4   no digits, emoji, < > &; no number words from two upward, no
//             "half"/"twice"/"double" except "half" in combat-level (bound)
//   CODEX-5   every door is a data-tab in index.html or an assigned window opener
//   CODEX-6   every sentence carries a claim; every bind exists and holds
//   CODEX-7   every term is unique
//   CODEX-8   the hr-accrue pack carries no codex file
//   CODEX-9   data/codex.js is reached only through a dynamic import
//   CODEX-10  src/features/codex.js reads no G, storage or envelope
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

// ── THE WORLD: every source a bind reads, loaded once, mutable for --selftest ─
function srcFiles(dir) {
  const out = [];
  for (const n of readdirSync(join(ROOT, dir))) {
    const rel = dir + '/' + n;
    if (statSync(join(ROOT, rel)).isDirectory()) { if (n !== 'smoke') out.push(...srcFiles(rel)); }
    else if (n.endsWith('.js')) out.push(rel);
  }
  return out;
}

/** The body of the LAST `create or replace function public.<fn>(` in the
    apply order (line-anchored, so a probe inside an `execute` string is not a
    redefinition). */
function chainEndBody(order, fn) {
  let body = null;
  for (const f of order) {
    let text;
    try { text = read('supabase/migrations/' + f); } catch (e) { continue; }
    const re = new RegExp('^create or replace function public\\.' + fn + '\\s*\\(', 'gim');
    let m;
    while ((m = re.exec(text))) {
      const tag = /as\s+(\$[a-z_]*\$)/i.exec(text.slice(m.index));
      if (!tag) continue;
      const start = m.index + tag.index + tag[0].length;
      const end = text.indexOf(tag[1], start);
      if (end > start) body = { file: f, text: text.slice(start, end) };
    }
  }
  return body;
}
const stripSqlComments = (s) => s.replace(/--[^\n]*/g, '');
const sqlCode = (s) => stripSqlComments(s).replace(/\s+/g, ' ');
const stripJs = (s) => String(s || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const jsLiterals = (s) => stripJs(s).match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];

export async function loadWorld() {
  const order = JSON.parse(read('tests/schema-apply-order.json')).order;
  const { pack } = await imp('tools/pack-edge.mjs');
  const packed = await pack('hr-accrue');
  const src = {};
  for (const f of srcFiles('src')) src[f] = read(f);
  const codex = await imp('src/data/codex.js');
  return {
    away: { ...(await imp('src/core/away.js')) },
    hunt: { ...(await imp('src/core/hunt.js')) },
    botd: { ...(await imp('src/core/botd.js')) },
    xp: { ...(await imp('src/core/xp.js')) },
    combat: { ...(await imp('src/core/combat.js')) },
    bounty: { ...(await imp('src/core/bounty.js')) },
    workers: { ...(await imp('src/core/workers.js')) },
    farm: { ...(await imp('src/core/farm.js')) },
    autoEat: { ...(await imp('src/core/auto-eat.js')) },
    compXp: { ...(await imp('src/core/companion-xp.js')) },
    compPerk: { ...(await imp('src/core/companion-perk.js')) },
    rewards: { ...(await imp('src/data/rewards.js')) },
    ranks: { ...(await imp('src/data/renown-ranks.js')) },
    charms: { ...(await imp('src/data/bestiary-charms.js')) },
    bestiary: { ...(await imp('src/data/bestiary.js')) },
    monsters: (await imp('src/data/monsters.js')).MONSTERS,
    dungeons: { ...(await imp('src/data/dungeons.js')) },
    shops: (await imp('src/data/shops.js')).SHOP_OFFERS,
    milestones: (await imp('src/data/collection-milestones.js')).COLLECTION_MILESTONES,
    companions: (await imp('src/data/companions.js')).COMPANIONS,
    ladders: { ...(await imp('src/data/gold-ladders.js')) },
    items: (await imp('src/data/items.js')).ITEMS,
    order,
    fnBody: (fn) => chainEndBody(order, fn),
    mig: (f) => read('supabase/migrations/' + f),
    packNames: packed.files.map((x) => x.name),
    accrualJs: read('supabase/functions/hr-accrue/accrual.js'),
    combatSimJs: read('src/core/combat-sim.js'),
    clientStateJs: read('src/net/client-state.js'),
    indexHtml: read('index.html'),
    src,
    groups: codex.CODEX_GROUPS.map((g) => ({ ...g })),
    entries: codex.CODEX_ENTRIES.map((e) => ({ ...e, claims: e.claims.map((c) => ({ ...c })) })),
  };
}

// ── THE BINDS. Each returns true, or a string saying what no longer holds. ───
const need = (cond, why) => (cond ? true : why);
const all = (...checks) => checks.find((c) => c !== true) ?? true;
const lvXp = (w, lv) => { let x = 0; while (w.xp.levelFromXp(x) < lv) x += 50; return x; };

export const BINDS = {
  awayPaysLiveRate: (w) => need(w.away.AWAY_RATE_MULT === 1, 'AWAY_RATE_MULT is ' + w.away.AWAY_RATE_MULT + ', not 1 — away is not "the same pace"'),
  awayScope: (w) => all(
    need(w.away.AWAY_SCOPE.blessing === false, 'AWAY_SCOPE.blessing is no longer false — blessings no longer pause'),
    need(Object.entries(w.away.AWAY_SCOPE).every(([k, v]) => k === 'blessing' || v === true),
      'an AWAY_SCOPE channel other than blessing stopped paying — "keeps doing the last thing" is now partial')),
  awayCapped: (w) => {
    const r = w.away.creditWindow({ watermarkMs: 0, nowMs: 100, capMs: 40 });
    return need(r.paidMs === 40 && r.capped === true, 'creditWindow no longer caps paidMs at capMs');
  },
  awayCapNoRaiser: (w, e) => {
    const b = w.fnBody('hr_offline_cap_ms');
    if (!b) return 'hr_offline_cap_ms has no definition in the apply order';
    const code = stripSqlComments(b.text).toLowerCase();
    return all(
      need(!/renown|property|homestead|castle/.test(code),
        'the chain-end hr_offline_cap_ms (' + b.file + ') now reads renown or property — rewrite "Away time"'),
      need(!/\b(home|homes|house|property|renown|rank|castle|clan|raise|raises|longer|extend)\b/i.test(e.text),
        'the Away time text names something that raises the away limit — the server honours none of them'));
  },
  residueNoProgression: (w) => {
    const m = /RESIDUE_FIELDS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\);/.exec(w.clientStateJs);
    if (!m) return 'RESIDUE_FIELDS literal not found in src/net/client-state.js';
    const names = [...m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      .matchAll(/'([^']+)'/g)].map((x) => x[1]);
    const bad = names.filter((n) => ['gold', 'gems', 'inventory', 'skills', 'equipment', 'marks', 'bank'].includes(n));
    return need(names.length > 0 && !bad.length, 'the browser residue now carries progression: ' + bad.join(', '));
  },
  totalLevelSum: (w) => {
    const s = { attack: lvXp(w, 10), fishing: lvXp(w, 5) };
    return need(w.xp.totalLevel(s) === 15, 'totalLevel is no longer the plain sum of skill levels');
  },
  totalLevel: (w) => {
    const b = w.fnBody('hr_renown_of');
    return need(b && /sum\(lv\)/.test(stripSqlComments(b.text)), 'the chain-end hr_renown_of no longer counts sum(lv)');
  },
  daily: (w) => {
    const R = w.rewards;
    const golds = R.DAILY_LOGIN_CYCLE.map((d) => d.gold);
    return all(
      need(R.DAILY_LOGIN_CYCLE_DAYS === 7, 'the daily cycle is no longer a week'),
      need(golds.every((g, i) => i === 0 || g > golds[i - 1]), 'the daily gold no longer climbs through the week'),
      need(R.priceDailyLogin(8).gold > R.priceDailyLogin(1).gold, 'a finished week no longer makes the next one richer'),
      need(R.priceDailyLogin(7).items.bone_key === 1, 'day 7 no longer pays a Bone Key'),
      need(R.priceDailyLogin(7 * 100).mult === 3 && R.DAILY_LOGIN_MAX_WEEK_MULT === 3, 'a finished week no longer stops at three times the first'),
      need(R.deriveLoginStreak({ last: { value: 5, gap: 2, state: 'claimed' } }) === 5, 'a missed day no longer steps back exactly one day'));
  },
  renownTerms: (w) => {
    const b = w.fnBody('hr_renown_of');
    if (!b) return 'hr_renown_of has no definition in the apply order';
    const c = stripSqlComments(b.text);
    const miss = ['sum(lv)', "'ev:kill_any'", 'is_boss', "'ev:loot:%'", 'streak_days', 'gold']
      .filter((t) => !c.includes(t));
    return all(
      need(!miss.length, 'hr_renown_of (' + b.file + ') no longer scores: ' + miss.join(', ')),
      need(!/quest/i.test(c), 'hr_renown_of now scores quests — the Renown entry leaves them out'));
  },
  rankRewards: (w) => {
    const R = w.ranks.RENOWN_RANK_REWARDS;
    return all(
      need(!('peasant' in R), 'Peasant now pays a reward'),
      need(Object.values(R).every((r) => r.gold > 0), 'a rank above Peasant pays no gold'));
  },
  rankRatchet: (w) => {
    const writes = w.order.flatMap((f) => {
      let t; try { t = stripSqlComments(w.mig(f)); } catch (e) { return []; }
      return [...t.matchAll(/(?<![\w'])set\s+renown_high\s*=\s*([^\n]*)[\s\S]{0,400}/gi)]
        .filter((m) => !/\bgold\s*=\s*0\b|version\s*=\s*1/.test(m[0]))   // self-check fixtures reset a probe row
        .map((m) => ({ f, s: m[0] }));
    });
    const lowering = writes.filter((x) => !/greatest\s*\(/i.test(x.s) && !/renown_high[^<\n]*<\s*r\.v/i.test(x.s));
    return all(
      need(writes.length > 0, 'no renown_high writer found in the apply order'),
      need(!lowering.length, 'a renown_high writer is not raise-only: ' + lowering.map((x) => x.f).join(', ')));
  },
  prayerHalf: (w) => need(
    w.xp.combatLevel({ prayer: lvXp(w, 81) }) === w.xp.combatLevel({ defense: lvXp(w, 41) }),
    'Prayer no longer counts half toward combat level'),
  bestStyleOnly: (w) => need(
    w.xp.combatLevel({ ranged: lvXp(w, 99), magic: lvXp(w, 99) }) === w.xp.combatLevel({ ranged: lvXp(w, 99) }),
    'combat level now sums fighting styles instead of taking the strongest'),
  weakness: (w) => {
    const M = Object.values(w.monsters);
    return all(
      need(M.every((m) => m.weaponWeak), 'a monster has no weapon weakness'),
      need(M.filter((m) => m.elementWeak).length * 2 > M.length, 'fewer than half the monsters have an element weakness'),
      need(w.combat.WEAKNESS_BONUS.damage > 1 && w.combat.WEAKNESS_BONUS.accuracy > 1, 'the feared weapon no longer lands more often and harder'),
      need(M.some((m) => m.hiddenElement), 'no monster hides its element any more'),
      need(w.charms.CHARM_RANKS[0].reveal === true, 'charm rank 1 no longer reveals the hidden element'));
  },
  falls: (w) => {
    const A = w.away;
    const rf = (t, l) => A.recoveryFor({ deathsTodayBefore: t, deathsLifetimeBefore: l });
    return all(
      need(rf(0, 100) === 0, 'the first fall of the day now costs time'),
      need(rf(3, 100) > rf(1, 100), 'later falls no longer keep you down longer'),
      need(A.RESUME_HP_FRACTION > 0 && A.RESUME_HP_FRACTION < 1, 'a fall no longer resumes on part of your health'),
      need(A.retreatAtFall({ consecFalls: A.RETREAT_ANY_FALLS, foodless: false }) === true, 'a hero who keeps falling no longer pulls back'),
      need(/export function resolveKill[\s\S]{0,4000}?state\.consecFalls\s*=\s*0/.test(w.combatSimJs), 'a win no longer resets the fall counter'));
  },
  autoEat: (w) => {
    const f = '2026-09-04-auto-eat-at-creation.sql';
    let grant = ''; try { grant = w.mig(f); } catch (e) { /* absent → red below */ }
    const T = w.autoEat.AUTO_EAT_TIERS;
    return all(
      need(grant.includes("'trait:auto_eat'") && w.order.includes(f), 'the creation grant of Auto-Eat is gone from the apply order'),
      need(w.mig('2026-09-08-hero-slot-buy.sql').includes("'''trait:auto_eat'''"), 'hero-slot-buy no longer requires the Auto-Eat creation grant'),
      need(w.away.AWAY_SCOPE.heal === true, 'Auto-Eat no longer eats on a night away'),
      need(T[2].maxPct > T[1].maxPct, 'Auto-Eat II no longer lets you choose a higher threshold'),
      need(/\('auto_eat_2',\s*'Auto-Eat II',\s*'marks'/.test(w.mig('2026-08-23-trait-buy.sql')), 'Auto-Eat II is no longer bought with Marks'));
  },
  bounty: (w) => {
    const B = w.bounty;
    const bad = [];
    for (const t of Object.keys(B.BOUNTY_BASE_REWARDS)) for (const ty of Object.keys(B.BOUNTY_TYPE_MULT))
      for (const d of Object.keys(B.BOUNTY_DIFFICULTY_MULT)) {
        const r = B.bountyRewards(Number(t), ty, d);
        if (!(r.gold > 0 && r.marks >= 1 && r.xp > 0)) bad.push(t + '/' + ty + '/' + d);
      }
    const marks = (id) => w.shops.some((o) => o.id === id && o.cost.some((c) => c.id === 'marks' && c.amount > 0));
    return all(
      need(!bad.length, 'a finished bounty no longer pays gold, Marks and experience: ' + bad.slice(0, 3).join(', ')),
      need(w.order.includes('2026-09-11-bounty-hunter-xp.sql'), 'the Bounty Hunter experience credit left the apply order'),
      need(marks('bounty.auto_bounty_1') && marks('bounty.cosmetic_cape') && marks('bounty.reroll_token'),
        'Auto-Accept, the Hunter Cloak or a reroll is no longer sold for Marks'));
  },
  property: (w) => {
    const t = w.mig('2026-08-16-unlock-offers.generated.sql');
    const rows = [...t.matchAll(/\('property\.[a-z]+', 'property', '([^']+)', 'property:[a-z]+', (\d+), (\d+), '(\{[^']*\})'/g)]
      .map((m) => ({ name: m[1], tier: +m[2], gold: +m[3], items: JSON.parse(m[4]) }));
    const top = rows.reduce((a, r) => (!a || r.tier > a.tier ? r : a), null);
    const gated = (L) => L[L.length - 1].req_property_tier > L[0].req_property_tier;
    return all(
      need(rows.length >= 2 && top && top.name === 'Hearthrise Castle', 'the top property tier is no longer Hearthrise Castle'),
      need(rows.every((r) => r.gold > 0 && Object.keys(r.items).length > 0), 'a property tier is no longer paid in gold and materials'),
      need(/\('room\.[a-z]+\.\d+', 'room',[^\n]*, [1-9], null, null,/.test(t), 'no room is gated by property tier'),
      need(gated(w.ladders.WORKER_LADDER) && gated(w.ladders.FARM_LAND_LADDER), 'a bigger home no longer allows more hands or plots'));
  },
  workers: (w) => {
    const W = w.workers;
    return all(
      need(W.workerEff(1e12) < 1, 'a fully practised hand now matches or beats you'),
      need(W.workerEff(1e12) > W.workerEff(0), 'hands no longer grow better with practice'),
      need(w.packNames.includes('vendor/core/workers.js') && /accrueWorkers/.test(w.accrualJs), 'the server settle no longer pays hands while you are away'),
      need(w.ladders.WORKER_LADDER.every((r) => r.gold > 0), 'a hand is no longer hired with gold'));
  },
  deeds: (w) => {
    const D = w.dungeons.DUNGEONS;
    const deedIn = Object.values(D).some((d) => JSON.stringify(d.loot || '').includes('farm_deed'));
    const P = w.farm.PLOT_TIER_PRICES;
    return all(
      need(deedIn, 'no dungeon chest holds a Farmer\'s Deed'),
      need(w.mig('2026-09-10-dungeon-catalogue.generated.sql').includes('farm_deed'), 'the server dungeon catalogue lost the Farmer\'s Deed'),
      need(!/deed/i.test(w.accrualJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')), 'the accrual engine now rolls deeds — the entry says dungeon chests only'),
      need(Object.values(P).every((p) => p.deeds > 0 && p.gold > 0), 'a plot upgrade is no longer payable in deeds instead of gold'),
      need(w.items.farm_deed && !w.items.farm_deed.bop, 'the Farmer\'s Deed can no longer be sold on the Market'));
  },
  companions: (w) => {
    const C = Object.values(w.companions);
    const kinds = new Set(C.map((c) => String(c.source || '').split(':')[0]));
    const X = w.compXp, P = w.compPerk;
    const lo = P.companionKeyBonus('allXP', { id: 'fox', xp: 0 });
    const hi = P.companionKeyBonus('allXP', { id: 'fox', xp: P.companionXpToReach(P.COMPANION_MAX_LEVEL) });
    return all(
      need(C.every((c) => typeof c.source === 'string' && c.source), 'a companion has no source'),
      need(['drop', 'shop', 'skill', 'boss'].every((k) => kinds.has(k)), 'a named companion source kind is gone'),
      need(X.companionActionXp('combat', 'combat-kill') > 0 && X.companionActionXp('combat', 'gather') === 0, 'companion experience no longer follows the work that suits it'),
      need(w.packNames.includes('vendor/core/companion-xp.js') && X.COMPANION_XP_SERVER_BACKED === true, 'the server no longer credits companion experience'),
      need(hi > lo && lo > 0, 'a higher companion level no longer makes its help stronger'));
  },
  gems: (w) => {
    const ok = /^(character_slot|theme|cosmetic):/;
    const bad = w.shops.filter((o) => o.cost.some((c) => c.id === 'gems'))
      .filter((o) => !o.grant.every((g) => (g.kind === 'unlock' && ok.test(g.id)) || (g.kind === 'capacity' && g.id === 'bank_slots')));
    return all(
      need(w.rewards.DAILY_LOGIN_CYCLE.some((d) => d.gems > 0), 'the daily reward pays no gems'),
      need(Object.values(w.ranks.RENOWN_RANK_REWARDS).some((r) => r.gems > 0), 'no renown rank pays gems'),
      need(Object.values(w.milestones).some((m) => m.gems > 0), 'no collection milestone pays gems'),
      need(!bad.length, 'gems now buy something other than slots, themes and looks: ' + bad.map((o) => o.id).join(', ')));
  },
  scrip: (w) => {
    const { DUNGEONS, QM_STOCK, dungeonScripBase } = w.dungeons;
    const qm = new Map(QM_STOCK.map((r) => [r.id, r.scrip]));
    const keys = Object.values(DUNGEONS).map((d) => d.cost && d.cost.key);
    return all(
      need(Object.values(DUNGEONS).every((d) => dungeonScripBase(d.reqLv) > 0), 'a dungeon clear no longer pays scrip'),
      need(/dungeon_scrip/.test(w.mig('2026-09-10-dungeon-settle.sql')), 'the server dungeon settle no longer credits scrip'),
      need(keys.every((k) => k && qm.get(k) > 0), 'the quartermaster no longer sells every dungeon key for scrip'),
      need(QM_STOCK.some((r) => /_blueprint_/.test(r.id) && r.scrip > 0), 'the quartermaster no longer sells room blueprints'),
      need(Object.values(DUNGEONS).every((d) => !('scrip' in d.cost) && !('gold' in d.cost)), 'a dungeon door now charges scrip or gold'));
  },
  collection: (w) => {
    const M = Object.values(w.milestones);
    const t = w.mig('2026-08-22-collection-claim.sql');
    return all(
      need(M.every((m) => (m.domain === 'items' || m.domain === 'monsters') && m.gold > 0), 'a milestone counts something other than items and monsters, or pays no gold'),
      need(M.some((m) => m.gems > 0) && M.some((m) => !m.gems), 'the "some of them pay gems" split no longer holds'),
      need(w.order.includes('2026-08-22-collection-claim.sql') && /hr_collection_of/.test(t) && /hr_bestiary_of/.test(t), 'the milestone claim is no longer server-verified'));
  },
  charms: (w) => {
    const R = w.charms.CHARM_RANKS;
    return all(
      need(R[0].drop === 1 && R[0].reveal === true, 'charm rank 1 now pays loot or no longer reveals'),
      need(R.slice(1).every((r, i) => r.drop > 1 && r.drop > R[i].drop), 'later charm ranks no longer raise loot step by step'),
      need(w.packNames.includes('vendor/core/charms.js'), 'charms left the server engine'));
  },
  trophies: (w) => {
    const S = w.bestiary.TROPHY_STAGES;
    return all(
      need(S.length > 1 && S[0].at > 0 && S[0].trophy === true, 'the first trophy stage no longer awards a trophy'),
      need(S[0].drop === 1 && S.slice(1).every((r, i) => r.drop > 1 && r.drop > S[i].drop), 'later trophy stages no longer raise loot step by step'),
      need(w.packNames.includes('vendor/core/trophies.js'), 'trophies left the server engine — no longer "watching or away"'));
  },
  vigourBudget: (w) => {
    const v = w.fnBody('hr_vigour_of'), k = w.fnBody('hr_utc_day_key');
    if (!v || !k) return 'hr_vigour_of or hr_utc_day_key has no definition in the apply order';
    const c = sqlCode(v.text);
    return all(
      need(w.hunt.VIGOUR_FLOOR_MIN > 0, 'VIGOUR_FLOOR_MIN is no longer positive — there is no daily allowance'),
      need(c.includes('v_day text := public.hr_utc_day_key(now())') && c.includes('period_key = v_day'),
        'hr_vigour_of (' + v.file + ') no longer keys the day on hr_utc_day_key(now())'),
      need(sqlCode(k.text).toLowerCase().includes("at time zone 'utc'"), 'hr_utc_day_key no longer turns at midnight UTC'));
  },
  vigourDryAway: (w) => {
    const H = w.hunt, a = stripJs(w.accrualJs);
    const sp = H.vigourSplit({ spentMin: 60, budgetMin: 60, windowMs: 3600000 });
    return all(
      need(H.VIGOUR_DRY_MULT > 0 && H.VIGOUR_DRY_MULT < 1, 'VIGOUR_DRY_MULT is ' + H.VIGOUR_DRY_MULT + ' — not "a small share"'),
      need(sp.dryMs === 3600000 && sp.fullMs === 0, 'past the budget a window is no longer all dry'),
      /* Experience and gold are scaled through hunt.js vigourScale (the
         dithered floor that conserves under subdivision, 2026-10-05) — the
         claim is that vigMult still reaches both, not how they round. Since
         2026-10-06 only the part earned past the Vigour line is scaled
         (`vigMultAt`, tests/world-tick-vigour-line.mjs), so the gold call
         scales the dry remainder rather than the whole of `state.gold`. */
      need(a.includes('dropMult: (w.dropMult || 1) * vigMult') && a.includes('vigourScale(raw, vigMult, vigRng)')
        && a.includes('vigourScale(goldAll - goldFull, vigMult, vigRng)')
        && a.includes('const vigMult = VIGOUR_DRY_MULT;'),
        'the away settle no longer folds vigMult into drop chance, experience and gold'));
  },
  vigourScope: (w) => {
    const a = stripJs(w.accrualJs);
    const at = a.indexOf('const accruer = KIND_ACCRUERS[inp.activeKind];');
    const uses = [...a.matchAll(/vigMult|vigourMult\(|vigourCharge\(/g)].map((m) => m.index);
    const body = (name) => { const i = a.indexOf('function ' + name + '('); const j = a.indexOf('\nfunction ', i + 1); return i < 0 ? null : a.slice(i, j < 0 ? undefined : j); };
    const g = body('accrueGather'), r = body('accrueArtisan');
    const refill = w.fnBody('hr_vigour_refill__ungated');
    return all(
      need(at > 0 && uses.length > 0 && uses.every((i) => i > at), 'Vigour is read outside the combat branch of the settle'),
      need(g && r && !/vig/i.test(g) && !/vig/i.test(r), 'gathering or artisan accrual now reads Vigour'),
      need(refill && sqlCode(refill.text).includes('insufficient_gold'), 'the refill is no longer paid in gold'),
      need(/getElementById\('fs-manage'\)/.test(w.src['src/features/vigour-mount.js'] || ''), 'the refill is no longer mounted on the Fight screen'));
  },
  dungeonKeys: (w) => {
    const D = Object.values(w.dungeons.DUNGEONS);
    const cat = w.mig('2026-09-10-dungeon-catalogue.generated.sql');
    const rows = [...cat.matchAll(/\('([a-z_]+)', '(?:dungeon|raid|worldboss)', \d+, \d+, '([a-z_]*)', \d+\)/g)];
    const settle = w.fnBody('hr_dungeon_settle');
    const c = settle ? sqlCode(settle.text) : '';
    const js = stripJs(w.src['src/dungeons.js'] || '');
    const i = js.indexOf('function startManualRun'), g = js.indexOf('if(!_dsArmed()){', i);
    return all(
      need(D.every((d) => d.cost && d.cost.key && w.items[d.cost.key]), 'a dungeon door no longer names a real key item'),
      need(rows.length === D.length && rows.every((m) => m[2]), 'a server catalogue row has no cost_key'),
      need(c.includes('v_key := v_dun.cost_key') && c.includes('set qty = v_have - 1'), 'the server settle no longer spends the key from the bag'),
      need(i > 0 && g > i && !js.slice(i, g).includes('removeItem(d.cost.key') && js.slice(g, g + 1200).includes('removeItem(d.cost.key, 1)'),
        'startManualRun spends the key outside the dormant branch — armed, the key would be spent twice'));
  },
  dungeonChest: (w) => {
    const b = w.fnBody('hr_dungeon_settle');
    if (!b) return 'hr_dungeon_settle has no definition in the apply order';
    const c = sqlCode(b.text);
    const cat = w.mig('2026-09-10-dungeon-catalogue.generated.sql');
    const loot = [...cat.matchAll(/\('[a-z_]+', \d+, '([a-z0-9_]+)', \d+, \d+, ([\d.]+), (?:true|false)\)/g)].map((m) => ({ id: m[1], ch: +m[2] }));
    const lies = ['src/dungeons.js', 'src/dungeon-scavenger.js'].flatMap((f) => jsLiterals(w.src[f]).filter((l) => /Reward multiplier|scales with boss HP|base rewards/i.test(l)));
    return all(
      need((c.match(/p_quality/g) || []).length === 1 && c.includes('v_q := least(greatest(coalesce(p_quality, 1), 0), 1)'),
        'the client quality reaches hr_dungeon_settle beyond the one clamped scrip line'),
      need(c.includes('from public.hr_dungeon_loot') && c.includes('hr_seed('), 'the chest is no longer rolled from the server loot table with the server seed'),
      need(cat.includes('_blueprint_') && cat.includes('farm_deed') && loot.some((r) => r.ch <= 0.1 && w.items[r.id] && w.items[r.id].slot),
        'a dungeon chest no longer holds room blueprints, rare boss gear and Farmer\'s Deeds'),
      need(!lies.length, 'a dungeon screen promises a reward scaling the server does not pay: ' + lies.join(', ')));
  },
  dungeonRest: (w) => {
    const cat = w.mig('2026-09-10-dungeon-catalogue.generated.sql');
    const cd = [...cat.matchAll(/\('[a-z_]+', '(?:dungeon|raid|worldboss)', \d+, (\d+), '[a-z_]*', \d+\)/g)].map((m) => +m[1]);
    const modes = w.fnBody('hr_dungeon_cooldown_modes');
    const div = (k) => { const m = modes && new RegExp("'" + k + "', (\\d+)").exec(sqlCode(modes.text)); return m ? +m[1] : 0; };
    return all(
      need(cd.length > 0 && cd.every((s) => s > 0), 'a dungeon no longer rests after a run'),
      need(w.order.includes('2026-09-12-dungeon-cooldown.sql'), 'the dungeon cooldown left the apply order'),
      need(['auto', 'manual', 'scavenger'].every((k) => div(k) > 0), 'a run mode no longer rests the dungeon'));
  },
  botdPools: (w) => {
    const B = w.botd, M = w.monsters;
    const t0 = Date.UTC(2026, 8, 27);
    const days = Array.from({ length: 14 }, (_, i) => B.botdFor(t0 + i * 86400000, M));
    return all(
      need(B.DAILY_POOL.every((id) => id in M) && B.WEEKLY_POOL.every((id) => id in M), 'a Boss of the Day pool names a monster that does not exist'),
      need(w.packNames.includes('vendor/core/botd.js'), 'the Boss of the Day left the server engine'),
      need(days.every((f) => f.dailyId && f.weeklyId), 'a day in the next fortnight has no daily or no weekly boss'));
  },
  botdBonus: (w) => {
    const { DAILY_BONUS: D, WEEKLY_BONUS: W } = w.botd;
    return all(
      need(D.dropMult > 1 && D.xpMult > 1 && W.dropMult > D.dropMult && W.xpMult > D.xpMult, 'the featured bonuses no longer lift drops and kill XP, weekly most'),
      need(w.away.AWAY_SCOPE.botd === true, 'the featured bonus no longer pays away'),
      need(w.combatSimJs.includes('killXpRoute(ctx.style, m.xp, feat.xpMult)') && w.combatSimJs.includes('hitXpRoute(ctx.style, xpDmg)'),
        'the featured XP bonus no longer scales kill XP alone — "for each kill" is wrong'),
      need(w.accrualJs.includes('lootCtx.botd = {'), 'the attended top-up no longer applies the featured bonus'),
      need(/import\s*\{[^}]*\bWEEKLY_BONUS\b[^}]*\}\s*from\s*'\.\/botd\.js/.test(w.src['src/core/combat-xp-cap.js'] || ''), 'the live XP credit no longer allows the weekly bonus'));
  },
  luckyRows: (w) => {
    const rows = [];
    for (const m of Object.values(w.monsters)) JSON.stringify(m, (k, v) => { if (v && v.lucky === true) rows.push(v); return v; });
    return all(
      need(rows.length > 0 && rows.every((r) => r.ch < 0.005), 'a lucky row is no longer a once-in-a-long-while chance'),
      need(rows.every((r) => w.items[r.id] && w.items[r.id].slot), 'a lucky find is no longer a piece of gear'),
      need(w.packNames.includes('vendor/data/monsters.js'), 'the monster table left the server engine'));
  },
  luckySilence: (w) => {
    const c = stripJs(w.src['src/features/lucky-finds.js'] || '');
    return need(/HearthriseCombatSim/.test(c) && /fx\.addItem\s*=\s*function\s*\(id\)\s*\{\s*if\s*\(isRevealed\(id\)\)\s*return;/.test(c) && c.includes("'rare_drop'"),
      'lucky-finds.js no longer silences the client\'s own dice on COMBAT_FX, or no longer reveals from the server\'s rare_drop');
  },
  hearthfind: (w) => {
    const t = w.mig('2026-09-13-world-finds-projection.sql');
    const hf = w.src['src/features/hearthfind.js'] || '';
    return all(
      need(w.order.includes('2026-09-13-world-finds-projection.sql') && /when coalesce\(q\.presence_quiet, false\) then null/.test(t), 'a quiet finder is named again'),
      need(/data-hf="copy"/.test(hf) && /function chatLine/.test(hf), 'the Hearthfind chat line or its copy control is gone'));
  },
  commonShowsActivity: (w) => {
    const t = w.fnBody('hr_town_of__ungated'), c = t ? sqlCode(t.text) : '';
    const tp = w.src['src/render/town-panel.js'] || '';
    return all(
      need(c.includes("interval '90 seconds'") && c.includes("interval '15 minutes'"), 'hr_town_of no longer keeps a stepped-away hero for a while'),
      need(tp.includes('activityName(') && tp.includes('is-away'), 'the Common no longer names what a peer is doing, or no longer dims the away'),
      need(/townPanelHtml\(G\._town/.test(w.src['src/features/home-dashboard.js'] || ''), 'Home no longer draws the Common'));
  },
  commonQuietHidesYou: (w) => {
    const r = w.fnBody('hr_town_refresh'), q = w.fnBody('hr_set_presence_quiet__ungated');
    const rc = r ? sqlCode(r.text) : '', qc = q ? sqlCode(q.text) : '';
    return all(
      need(rc.includes('not coalesce(ps.presence_quiet, false)') && rc.includes('q.presence_quiet'), 'hr_town_refresh no longer leaves a quiet hero off the Common'),
      need(qc.includes('v_pruned := found'), 'going quiet no longer prunes you from the Common'),
      need((w.src['src/render/town-panel.js'] || '').includes('data-town-quiet'), 'the Go quiet control is gone'));
  },
  partyInviteByName: (w) => {
    const b = w.fnBody('hr_party_invite');
    return all(
      need(b && /\bp_name\b/.test(stripSqlComments(b.text)), 'hr_party_invite no longer invites by name'),
      need(/p_name:\s*String\(name/.test(w.src['src/net/party.js'] || ''), 'the client no longer sends the invitee by name'));
  },
  /* The party hunt (stage 2): the leader starts it with the solo pickers'
     monster and stance, and every member reads the same per-hunt kills and
     earnings from the one member-only view. */
  partyHuntLeaderStarts: (w) => {
    const st = w.fnBody('hr_party_hunt_start'), v = w.fnBody('hr_party_hunt_view');
    const sc = st ? sqlCode(st.text) : '', vc = v ? sqlCode(v.text) : '';
    const net = stripJs(w.src['src/net/party.js'] || ''), pp = stripJs(w.src['src/render/party-panel.js'] || '');
    return all(
      need(sc.includes("'not_party_leader'") && /\bp_active_id\b/.test(sc) && /\bp_stance\b/.test(sc), 'hr_party_hunt_start no longer takes a leader\'s monster and stance'),
      need(vc.includes("'kills'") && vc.includes("'xp'") && vc.includes("'gold'") && vc.includes("'members'"), 'hr_party_hunt_view no longer gives every member the kills and each one\'s earnings'),
      need(net.includes("'hr_party_hunt_start'") && net.includes("'hr_party_hunt_view'"), 'the client no longer starts or views a party hunt'),
      need(pp.includes('huntStanceButtonsHtml') && pp.includes('HearthriseMonsterPick') && pp.includes('hunt-start'), 'the Party screen no longer offers the leader a monster and a stance to start a hunt'));
  },
  /* Camping and the rejoin: the view judges camping/rejoining on the settle's
     own rows, and the client has NO rejoin control or verb (ruling B3). */
  partyCampRejoinsOnReturn: (w) => {
    const v = w.fnBody('hr_party_hunt_view'), vc = v ? sqlCode(v.text) : '';
    const hit = Object.keys(w.src).filter((f) => /hr_party_hunt_rejoin|hunt-rejoin|Rejoin hunt/.test(stripJs(w.src[f])));
    return all(
      need(vc.includes("'camping'") && vc.includes("'rejoining'") && vc.includes('real_return_at'), 'hr_party_hunt_view no longer judges camping and the rejoin on return'),
      need(!hit.length, 'a rejoin control or verb exists in ' + hit.join(', ') + ' — the return itself rejoins'));
  },
  partyHuntGated: (w) => {
    const st = w.fnBody('hr_party_hunt_start'), sc = st ? sqlCode(st.text) : '';
    const pp = w.src['src/render/party-panel.js'] || '';
    return all(
      need(sc.includes("'hunt_channel_disarmed'"), 'hr_party_hunt_start is no longer gated on the channel being switched on'),
      need(pp.includes("Party hunting isn\\'t open yet") && pp.includes('channel_open'), 'the Party screen no longer says party hunting is not open yet when the view reports it closed'));
  },
};

// ── THE CHECK ─────────────────────────────────────────────────────────────
const NUMBER_WORDS = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
  'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'hundreds', 'thousand',
  'thousands', 'million', 'dozen', 'dozens', 'twice', 'double', 'triple', 'half'];
export const sentences = (text) => text.split(/(?<=\.)\s+/).filter(Boolean);

export function check(w) {
  const out = [];
  const bad = (id, msg) => out.push({ id, msg });
  const E = w.entries;
  const groupIds = new Set(w.groups.map((g) => g.id));

  const ids = new Set();
  for (const e of E) {
    if (!/^[a-z][a-z-]*[a-z]$/.test(e.id) || ids.has(e.id)) bad('CODEX-1', e.id + ': not a unique slug');
    ids.add(e.id);
  }
  for (const e of E) if (!groupIds.has(e.group)) bad('CODEX-2', e.id + ': unknown group ' + e.group);
  for (const g of w.groups) if (!E.some((e) => e.group === g.id)) bad('CODEX-2', 'group ' + g.id + ' is empty');

  for (const e of E) {
    const t = e.text;
    if (t.length < 80 || t.length > 320 || !t.endsWith('.')) bad('CODEX-3', e.id + ': ' + t.length + ' chars / no closing full stop');
    if (/\d|[<>&]|\p{Extended_Pictographic}/u.test(t + e.term)) bad('CODEX-4', e.id + ': a digit, emoji or markup character');
    for (const word of (t.toLowerCase().match(/[a-z]+/g) || [])) {
      if (NUMBER_WORDS.includes(word) && !(word === 'half' && e.id === 'combat-level')) bad('CODEX-4', e.id + ': number word "' + word + '"');
    }
  }

  // A door is a rail entry (index.html), a pane of one (the menu's HUBS rows) or a
  // Journal tab (the showTab record routes): every one of them is a showTab name.
  const tabs = new Set([
    ...[...w.indexHtml.matchAll(/data-tab="([a-z_-]+)"/g)].map((m) => m[1]),
    ...[...(w.src['src/nav-consolidation.js'] || '').matchAll(/\btab: '([a-z_-]+)'/g)].map((m) => m[1]),
    ...[...(w.src['src/features/journal.js'] || '').matchAll(/\bid: '([a-z_-]+)'/g)].map((m) => m[1]),
  ]);
  const allSrc = Object.entries(w.src);
  for (const e of E) {
    const d = e.door;
    if (!d) continue;
    if (d.tab) { if (!tabs.has(d.tab)) bad('CODEX-5', e.id + ': no data-tab="' + d.tab + '" in index.html'); continue; }
    const [head, tail] = String(d.opener || '').split('.');
    const home = allSrc.find(([, s]) => new RegExp('window\\.' + head + '\\s*=').test(s));
    const ok = home && (!tail || new RegExp('\\b' + tail + '\\s*:|\\.' + tail + '\\s*=').test(home[1]));
    if (!ok) bad('CODEX-5', e.id + ': opener ' + d.opener + ' is assigned nowhere in src');
  }

  for (const e of E) {
    const n = sentences(e.text).length;
    for (let i = 0; i < n; i++) if (!e.claims.some((c) => c.s === i)) bad('CODEX-6', e.id + ': sentence ' + i + ' carries no claim');
    for (const c of e.claims) {
      if (!(c.s >= 0 && c.s < n)) { bad('CODEX-6', e.id + ': claim on sentence ' + c.s + ' which does not exist'); continue; }
      const fn = BINDS[c.bind];
      if (typeof fn !== 'function') { bad('CODEX-6', e.id + ': bind ' + c.bind + ' has no predicate'); continue; }
      let r; try { r = fn(w, e); } catch (x) { r = 'threw ' + (x && x.message); }
      if (r !== true) bad('CODEX-6', e.id + ' [' + c.bind + ']: ' + r);
    }
  }

  const terms = new Set();
  for (const e of E) { if (terms.has(e.term)) bad('CODEX-7', 'duplicate term ' + e.term); terms.add(e.term); }

  if (w.packNames.some((n) => /codex/i.test(n))) bad('CODEX-8', 'the hr-accrue pack carries a codex file');

  const feat = w.src['src/features/codex.js'] || '';
  for (const [f, s] of allSrc) {
    if (f === 'src/data/codex.js') continue;
    if (/(^|\n)\s*import\s[^;]*?['"][^'"]*data\/codex\.js/.test(s) || /(^|\n)\s*export\s[^;]*?from\s*['"][^'"]*data\/codex\.js/.test(s)) {
      bad('CODEX-9', f + ' imports data/codex.js statically');
    }
  }
  if (!/import\(\s*['"]\.\.\/data\/codex\.js\?v=\d+['"]\s*\)/.test(feat)) bad('CODEX-9', 'src/features/codex.js does not reach data/codex.js by dynamic import');

  const code = feat.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  if (!feat) bad('CODEX-10', 'src/features/codex.js is missing');
  else if (/\bG\s*[.[]|window\.G\b|localStorage|sessionStorage|envelope/.test(code)) bad('CODEX-10', 'src/features/codex.js reads G, storage or the envelope');
  return out;
}

// ── RUN / SELFTEST ────────────────────────────────────────────────────────
async function run() {
  const w = await loadWorld();
  const p = check(w);
  const binds = new Set(w.entries.flatMap((e) => e.claims.map((c) => c.bind)));
  if (p.length) {
    for (const x of p) console.log(`  FAIL  ${x.id}  ${x.msg}`);
    console.log(`codex-claims: RED — ${p.length} problem(s)`);
    return 1;
  }
  console.log(`codex-claims: green — ${w.entries.length} entries, ${w.entries.reduce((n, e) => n + sentences(e.text).length, 0)} sentences, ${binds.size} binds, all holding`);
  return 0;
}

async function selftest() {
  const base = await loadWorld();
  const clone = () => ({ ...base, away: { ...base.away }, hunt: { ...base.hunt }, botd: { ...base.botd }, src: { ...base.src },
    entries: base.entries.map((e) => ({ ...e, claims: e.claims.map((c) => ({ ...c })) })) });
  const byId = (w, id) => w.entries.find((e) => e.id === id);
  let bad = 0;
  const clean = check(clone());
  console.log('codex-claims --selftest\n  ── the clean arm ──');
  if (clean.length) { bad++; console.log('  WRONG    clean run is red: ' + clean.map((x) => x.id + ' ' + x.msg).join('; ')); }
  else console.log('  ok       the unmutated world reports 0 problems');

  console.log('\n  ── the mutations ──');
  const arms = [
    ['M1 AWAY_RATE_MULT = 0.5', 'CODEX-6', (w) => { w.away.AWAY_RATE_MULT = 0.5; }, 'awayPaysLiveRate'],
    ['M2 plant "bigger homes raise that limit"', 'CODEX-6', (w) => { const e = byId(w, 'away-time'); e.text = e.text.replace('away limit.', 'away limit, and bigger homes raise that limit.'); }, 'awayCapNoRaiser'],
    ['M3 a digit', 'CODEX-4', (w) => { const e = byId(w, 'gems'); e.text = e.text.replace('extra hero slots', '4 extra hero slots'); }],
    ['M4 "twelve"', 'CODEX-4', (w) => { const e = byId(w, 'away-time'); e.text = e.text.replace('up to your away limit', 'for up to twelve hours'); }],
    ['M5 a sentence with no claim', 'CODEX-6', (w) => { const e = byId(w, 'your-hero'); e.text += ' It is kept safe at all times.'; }],
    ['M6 a static import of data/codex.js', 'CODEX-9', (w) => { w.src['src/main.js'] = "import { CODEX_ENTRIES } from './data/codex.js" + '?' + "v=555';\n" + w.src['src/main.js']; }],
    ['M7 a fake opener', 'CODEX-5', (w) => { byId(w, 'charms').door = { opener: 'HearthriseNoSuchThing.open' }; }],
    ['M8 a luckyRowsExist bind (no predicate ships)', 'CODEX-6', (w) => { byId(w, 'renown').claims.push({ s: 0, bind: 'luckyRowsExist' }); }],
    ['M9 "double" outside combat-level', 'CODEX-4', (w) => { const e = byId(w, 'charms'); e.text = e.text.replace('a little more often', 'double as often'); }],
    ['M10 codex feature reads G', 'CODEX-10', (w) => { w.src['src/features/codex.js'] += '\nconst x = G.gold;'; }],
    ['M11 VIGOUR_DRY_MULT = 1', 'CODEX-6', (w) => { w.hunt.VIGOUR_DRY_MULT = 1; }, 'vigourDryAway'],
    ['M12 plant a "Reward multiplier" label', 'CODEX-6', (w) => { w.src['src/dungeons.js'] = "var _m = 'Reward multiplier: ';\n" + w.src['src/dungeons.js']; }, 'dungeonChest'],
    ['M13 hit XP scaled by the featured bonus', 'CODEX-6', (w) => { w.combatSimJs = w.combatSimJs.replace('hitXpRoute(ctx.style, xpDmg)', 'hitXpRoute(ctx.style, xpDmg * feat.xpMult)'); }, 'botdBonus'],
    ['M14 hr_town_refresh lists quiet heroes', 'CODEX-6', (w) => { const fb = w.fnBody; w.fnBody = (fn) => { const b = fb(fn); return fn === 'hr_town_refresh' && b ? { ...b, text: b.text.replace('not coalesce(ps.presence_quiet, false)', 'true') } : b; }; }, 'commonQuietHidesYou'],
    ['M15 the Party screen grows a Rejoin hunt button', 'CODEX-6', (w) => { w.src['src/render/party-panel.js'] += "\nvar x = '<button data-party-act=\"hunt-rejoin\">Rejoin hunt</button>';"; }, 'partyCampRejoinsOnReturn'],
    ['M16 the Party screen loses the solo stance picker', 'CODEX-6', (w) => { w.src['src/render/party-panel.js'] = w.src['src/render/party-panel.js'].split('huntStanceButtonsHtml').join('ownStanceButtons'); }, 'partyHuntLeaderStarts'],
  ];
  for (const [label, want, mutate, bindName] of arms) {
    const w = clone();
    mutate(w);
    const p = check(w).filter((x) => x.id === want && (!bindName || x.msg.includes('[' + bindName + ']')));
    if (p.length) console.log(`  CAUGHT   ${label} — ${want}: ${p[0].msg.slice(0, 110)}`);
    else { bad++; console.log(`  MISSED   ${label} — ${want} never fired`); }
  }
  console.log(`\n  ${bad ? bad + ' arm(s) FAILED' : 'clean arm green, all ' + arms.length + ' mutations caught by their named CODEX id'}`);
  return bad ? 1 : 0;
}

const invoked = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/codex-claims.mjs');
if (invoked) {
  (process.argv.includes('--selftest') ? selftest() : run())
    .then((c) => process.exit(c))
    .catch((e) => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(2); });
}
