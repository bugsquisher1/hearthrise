// tests/hunt-core/fixtures/play-ground.mjs — ONE PLAY per hunt on the real engine (forest-cave.mjs --play).
// The settle the world tick runs (supabase/functions/hr-accrue/accrual.js accrueHunt) over thirty sim-minutes,
// cut into ten-minute windows the way the tick's clock would, carrying the world and each session between
// windows (the hunt-sessions-settle.mjs runCut shape). Each hunt is played once by a party IN its range and once
// by a party BELOW it (the "waste hunt", Tyler 10-18), every hero with an EMPTY bag, so each heal and drink is
// bought from the store per use: store gold out is the whole supply bill. Prints per hour and per hero: Level
// XP (kills only), combat skill XP, coin, commons (drops at 5% or more, at the vendor's bid), rares, store gold and the net.
// Today's engine spawns each pocket's `spawns` (the default pull); a deeper density is not playable yet.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const T0 = Date.UTC(2026, 9, 18, 12, 0, 0);
const IID = '00000000-0000-4000-8000-0000000c5f01';
const SECRET = '-4611686018427387904';
const SPAN = 1800000;
const COMBAT = ['melee', 'ranged', 'magic', 'defense'];

/** THE RUNNER, reusable (tests/hunt-core/drop-tables.mjs): `run(huntId, L, roles, opts)` plays one ground
    on the real settle and answers the totals, per hour and per hero, plus `items` (id -> count, the whole
    party's credit), `heroItems` and `heroXp` (per hero key: item / skill -> amount), `heroRares` (per hero key: the
    settle's rare-drop hints, item ids in order), `rareRolls` (the party's rare-roll events, item ids) and `killsBy`.
    opts: { spanMs (default thirty minutes), secret (the hunt seed), monsters (a drop-table fixture), fullSet,
    equipment (one worn set every hero wears, e.g. the start kit's; or a function (role, seat, L) -> set, one per hero),
    bag ((role, seat, L) -> the hunt bag { item: { loaded } }; default: one free Bronze Arrow for a Ranger, else empty),
    session (fields over every hero's hunt session, e.g. { goldFloor, onEmpty }),
    options ((role, seat, L) -> the hero's stored bar options, player_action_sets.options: chase, stance, distance, target_mode) }. */
/** The trees loadPlay reads beyond src/core and src/data: a planted copy (h1.js plant) needs them too. */
export const PLAY_TREES = Object.freeze(['supabase/functions/hr-accrue', 'src/world/core', 'assets/world']);

export async function loadPlay(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const AC = await import(u('supabase/functions/hr-accrue/accrual.js'));
  const CAT = await import(u('supabase/functions/hr-accrue/catalogue.js'));
  const SPAWN = await import(u('src/core/hunt-spawn.js'));
  const { wornRoleKey } = await import(u('src/data/hunt-roles.js'));
  const GRID = await import(u('src/core/hunt/grid.js'));
  const XP = await import(u('src/core/xp.js'));
  const SB = await import(u('src/data/supply-basics.js'));
  const G = await import(u('src/data/hunt-grounds.js'));
  const MAPS = await import(u('src/data/world/maps/index.js'));
  const TER = await import(u('src/data/world/terrain.js'));
  const MC = await import(u('src/world/core/map-compile.js'));
  const SETS = await import(u('src/data/world/atlas-sets.js'));
  const { MONSTERS } = await import(u('src/data/monsters.js'));
  const { ITEMS } = await import(u('src/data/items.js'));
  const sprites = {};
  for (const s of SETS.ATLAS_SETS) Object.assign(sprites, JSON.parse(readFileSync(join(root, 'assets/world/atlas-' + s + '.json'), 'utf8')).sprites);
  const gridOf = (mapId) => {
    const row = MAPS.mapRowOf(mapId);   // a staged map plays too (hunts.js `staged`: fitted before its art lands)
    const map = MC.compileMap(row, { materials: TER.MATERIALS, sprites, openClasses: TER.OPEN_CLASSES, lights: {} });
    const solid = (x, y) => { const m = TER.MATERIALS[map.ground[y * map.w + x]]; return !!(m && m.solid && !m.flat); };
    return GRID.makeGrid(map.w, map.h, (x, y) => map.mask[y * map.w + x] === 0, solid);
  };
  const basics = {};
  for (const b of SB.BASIC_SUPPLIES) basics[b.id] = { kind: b.kind, price: b.price, heals: b.heals || 0, mana: b.mana || 0, partner: b.partner };
  /* THE STORE: every catalogue row; the bar's slots pick the row a use buys (Tyler 2026-10-21: a slot names ONE
     item, the game never picks).
     THE REFERENCE BAR (designer 2026-10-22, store-by-slot): an empty stored bar runs the start kit's (START_BAR:
     own Cooked Shrimp, then store Salted Shrimp under 60% HP, Thin Turnip Juice under 30% mana) at every ground,
     so a Level-32 Warrens hero ate tier-1 shrimp and every Warrens bill read near zero. A measured hero is a
     player who stocked for the ground: the start bar's three slots, the same thresholds, naming the ground's
     guide food and drink (supplies.js BAG_GUIDE_BY_HUNT: its cooked food, the store row partnered to it, its
     drink's store row). Tier-1 grounds are exactly START_BAR. opts.bar (role, seat, L) -> stored bar overrides. */
  const { BAG_GUIDE_BY_HUNT } = await import(u('src/data/supplies.js'));
  const { START_BAR } = await import(u('src/data/start-kit.js'));
  const storeOf = (kind, cooked) => (SB.BASIC_SUPPLIES.find((b) => b.kind === kind && b.partner === cooked) || {}).id;
  const refBar = (huntId) => {
    const g = BAG_GUIDE_BY_HUNT[huntId];
    if (!g) return START_BAR.map((x) => JSON.parse(JSON.stringify(x)));
    const food = g.melee.heal.id, drink = g.magic.mana.id;
    const item = { d_food: food, d_food_store: storeOf('heal', food), d_drink: storeOf('mana', drink) };
    return START_BAR.map((x) => { const y = JSON.parse(JSON.stringify(x)); if (item[y.id]) y.action.id = item[y.id]; return y; });
  };
  /* gear by level, the smiths' ladder a player at that level wears */
  const kit = (L, role) => {
    const t = L < 15 ? 0 : L < 30 ? 1 : L < 45 ? 2 : 3;
    const weapon = { tank: ['bronze_sword', 'iron_sword', 'steel_sword', 'mithril_sword'], melee_dps: ['stone_maul', 'iron_warhammer', 'steel_warhammer', 'mithril_warhammer'],
      ranger: ['shortbow', 'willow_longbow', 'maple_bow', 'maple_bow'],
      mage: ['apprentice_wand', 'oak_wand', 'willow_wand', 'maple_wand'], healer: ['apprentice_staff', 'oak_staff', 'willow_staff', 'maple_staff'] }[role][t];
    /* A Mage is wand + spellbook (since 10-19; a staff is the Healer's: hunt-roles.js roleWeaponOf). The harness's
       "mage" held a staff until 2026-10-21, so it measured a second Healer (designer pass 2026-10-21). */
    const book = role === 'mage' ? { shield: ['apprentice_primer', 'oak_spellbook', 'willow_spellbook', 'maple_spellbook'][t] } : {};
    /* THE TANK CARRIES A SHIELD (Tyler 2026-10-23: the SHIELD makes the tank; a sword alone is Melee damage): the
       Shop's Bronze-Rimmed, then the smiths' Ironbound and Coppercap (src/data/shields.js) at the Defense they need. */
    const guard = role === 'tank' ? { shield: ['bronze_rimmed_shield', 'ironbound_shield', 'coppercap_shield', 'coppercap_shield'][t] } : {};
    return { weapon, ...book, ...guard, body: ['bronze_platebody', 'iron_platebody', 'steel_platebody', 'mithril_platebody'][t], helmet: ['bronze_helm', 'iron_helm', 'steel_helm', 'steel_helm'][t],
      ...(role === 'ranger' ? { ammo: 'bronze_arrows' } : {}) };
  };
  /* THE FULL SET (opts.fullSet): the weapon above plus helmet, body, legs and boots of the hero's own armour line
     (gear-tiers.js: plate for the tank, leather for the ranger, cloth for the casters) at the tier its Level wears,
     the set the hunts' equipment drops build (tests/hunt-core/drop-tables.mjs). */
  const fullKit = (L, role) => {
    const t = L < 15 ? 0 : L < 30 ? 1 : L < 45 ? 2 : 3;
    const base = kit(L, role);
    if (role === 'tank') {
      const m = ['bronze', 'iron', 'steel', 'mithril'][t];
      return { ...base, helmet: m + '_helm', body: m + '_platebody', pants: m + '_platelegs', boots: m + '_boots' };
    }
    const line = role === 'ranger' ? ['leather', 'studded', 'boarhide', 'snakeskin'] : ['apprentice', 'adept', 'scholar', 'warlock'];
    return { ...base, helmet: line[t] + '_helmet', body: line[t] + '_body', pants: line[t] + '_pants', boots: line[t] + '_boots' };
  };
  const hero = (huntId, role, i, L, roles, fullSet, worn, bar, bag, session, options) => {
    /* A hero at Level L with every combat skill at L (the designer's fit: skill ~ Level through L25). */
    const skills = Object.fromEntries(COMBAT.map((k) => [k, XP.skillXpForLevel(k, L)]));
    /* opts.equipment: a worn set given whole (the start kit, start-kit.js START_EQUIPMENT), for every hero. */
    const equipment = typeof worn === 'function' ? worn(role, i, L) : worn ? { ...worn } : fullSet ? fullKit(L, role) : kit(L, role);
    return {
      key: role + i, user: role + i, slot: 0, seat: i, unitId: null, sessionId: 's-' + role + i, version: 1, huntId,
      huntSession: { id: 's-' + role + i, instanceId: IID, huntFromMs: T0, nextSwingAtMs: T0, swingIndex: 0,
        bag: typeof bag === 'function' ? bag(role, i, L) : role === 'ranger' ? { bronze_arrows: { loaded: 1 } } : {},
        staminaMs: 12 * 3600000, staminaMaxMs: 12 * 3600000, basics, goldFloor: 0, supplySource: 'mine', onEmpty: 'switch', cover: {}, ...(session || {}) },
      skills, levelXp: XP.charXpForLevel(L), xpFrac: null, hp: 1e9, gold: 50000, equipment,
      inventory: {}, deathsTodayBefore: 0, deathsLifetimeBefore: 0, hearthfindReady: false, perks: null,
      hero: SPAWN.heroSetup({ weaponType: wornRoleKey(equipment, ITEMS), options: { ...(role === 'healer' ? { role: 'healer' } : {}), ...(options ? options(role, i, L) : {}) },
        bar: typeof bar === 'function' ? bar(role, i, L) : refBar(huntId), partyRoles: roles }),
    };
  };
  const run = (huntId, L, roles, opts = {}) => {
    const span = opts.spanMs || SPAN, secret = opts.secret || SECRET, monsters = opts.monsters || MONSTERS;
    const ground = G.HUNT_GROUNDS[huntId], grid = gridOf(ground.map);
    /* L: one Level for every hero, or one per hero in seat order (a mixed party: [9, 19]) */
    const members = roles.map((r, i) => hero(huntId, r, i, Array.isArray(L) ? L[i] : L, roles, opts.fullSet === true, opts.equipment || null, opts.bar || null, opts.bag || null, opts.session || null, typeof opts.options === 'function' ? opts.options : null));
    /* opts.density: the party's monster density pick (the settle clamps it to the ground) */
    if (Number.isInteger(opts.density)) for (const m of members) m.hero = Object.assign({}, m.hero, { density: opts.density });
    /* common vs rare by the hunt's own drop rows: a loot-band row (src/data/loot-bands.js) is a common in the common and
       uncommon bands; an old-model drop at 5% or more anywhere here is a common, unless it is a trophy worth 100 g or more
       (a boss's chase item: the Crown Shard, the Alpha Fang), which is upside */
    const commonRow = (d) => (d.band ? d.band === 'common' || d.band === 'uncommon' : d.ch >= 0.05 && CAT.vendorPriceOf(ITEMS, d.id) < 100);
    const common = new Set();
    for (const p of ground.pockets) for (const s of p.spawns) for (const d of monsters[s.monster].drops) if (commonRow(d)) common.add(d.id);
    let world = null, next = T0, played = 0;
    const T = { xp: 0, levelXp: 0, coin: 0, commons: 0, rares: 0, store: 0, falls: 0, kills: 0, ended: [], buys: {} };
    const items = {}, heroItems = {}, killsBy = {}, heroXp = {}, heroRares = {}, rareRolls = [];
    for (let t = T0; t < T0 + span; t += 600000) {
      const out = AC.accrueHunt({ instance: { id: IID, nextSwingAtMs: next, world }, window: { fromMs: t, toMs: Math.min(T0 + span, t + 600000) },
        secret, ground, grid, items: ITEMS, monsters, members });
      if (!out.accrued) continue;
      /* opts.onWindow(out, members): an observer of each settled window's events and members (party-defense.mjs) */
      if (typeof opts.onWindow === 'function') opts.onWindow(out, members);
      world = out.world; next = out.settledTo; played = next - T0;
      /* a party's rare roll (hunt-rewards.js payKill: each revealed unit, two or more heroes) */
      for (const e of out.events || []) if (e && e.type === 'rare_roll') rareRolls.push(e.item);
      for (const p of out.members) {
        const m = members.find((x) => x.key === p.key), h = p.hunt;
        if (p.key === members[0].key) {
          T.kills += p.delta.journal.meta.kills;
          for (const [k, n] of Object.entries(p.delta.journal.meta.km || {})) killsBy[k] = (killsBy[k] || 0) + n;
        }
        T.falls += (p.summary.deathLog || []).length;
        T.coin += p.delta.gold || 0;
        for (const [k, v] of Object.entries(p.delta.xp || {})) {
          if (COMBAT.includes(k)) T.xp += v;
          const hx = heroXp[p.key] = heroXp[p.key] || {};
          hx[k] = (hx[k] || 0) + v;
        }
        T.levelXp += p.delta.level_xp || 0;
        for (const [id, n] of Object.entries(p.delta.items || {})) {
          T[common.has(id) ? 'commons' : 'rares'] += n * CAT.vendorPriceOf(ITEMS, id);
          items[id] = (items[id] || 0) + n;
          const hi = heroItems[p.key] = heroItems[p.key] || {};
          hi[id] = (hi[id] || 0) + n;
        }
        for (const [id, n] of Object.entries(h.buys || {})) {
          T.store += n * ((SB.BASIC_INDEX[id] || {}).price || 0);
          const bk = T.buys[p.key] = T.buys[p.key] || {};
          bk[id] = (bk[id] || 0) + n;
        }
        /* the settle's rare-drop hints (accrual.js huntProposal): the reveals the database journals as rare_drop events */
        for (const rd of (h.hints && h.hints.rare_drop) || []) (heroRares[p.key] = heroRares[p.key] || []).push(rd.item);
        if (h.ended && !m.ended) T.ended.push(p.key + ' ' + h.ended.reason);
        m.huntSession = Object.assign({}, m.huntSession, { swingIndex: h.swing_to, nextSwingAtMs: Date.parse(h.next_swing_at), staminaMs: h.stamina,
          bag: Object.fromEntries(Object.entries(m.huntSession.bag).map(([id, l]) => [id, { ...l, left: (l.left ?? l.loaded) - (h.uses[id] || 0) }])) });
        m.unitId = h.unit_id; m.hp = p.delta.hp; m.gold += p.delta.gold || 0;
        for (const [k, v] of Object.entries(p.delta.xp || {})) m.skills = { ...m.skills, [k]: (m.skills[k] || 0) + v };
        m.levelXp += p.delta.level_xp || 0;
        if (h.ended) m.ended = h.ended;
      }
      if (members.every((m) => m.ended)) break;
    }
    /* per hero per hour (coin and loot are split between the party; the store bill is each hero's own) */
    const per = 3600000 / span / roles.length;
    const r = (n) => Math.round(n * per);
    const income = r(T.coin + T.commons), store = r(T.store);
    return { spanMs: span, playedMs: played, totals: T, items, heroItems, heroXp, heroRares, rareRolls, killsBy, heroes: members.map((m) => m.key),
      kills: Math.round(T.kills * 3600000 / span), falls: T.falls, xp: r(T.xp), levelXp: r(T.levelXp), coin: r(T.coin), commons: r(T.commons), rares: r(T.rares), store, income,
      margin: store ? Math.round((income / store - 1) * 100) + '%' : 'no store spend', net: income + r(T.rares) - store, ended: T.ended };
  };
  /* kitFor(L, role, full): the worn set a measured hero at Level L wears (the ladder kit, or the full own-tier set), so a
     test can wear one hero differently and the rest as measured (drop-tables.mjs ranger-floor: the crossbow and shield). */
  const kitFor = (L, role, full) => (full ? fullKit(L, role) : kit(L, role));
  return { run, kitFor, MONSTERS, ITEMS, vendorPriceOf: CAT.vendorPriceOf, basics: SB.BASIC_INDEX };
}

export async function play(root, only) {
  const { run } = await loadPlay(root);
  const PLAN = [
    ['mill_cellar', [['in range, combat ~6', 6, ['tank']], ['fresh kit level (combat 3)', 1, ['tank']]]],
    ['meadowbrook_thicket', [['in range, combat ~10', 10, ['tank']], ['below range (combat ~3)', 2, ['tank']]]],
    ['millrace_sewer', [['in range, a party of four at ~20', 20, ['tank', 'ranger', 'mage', 'healer']], ['the floor, a party of four at ~5', 5, ['tank', 'ranger', 'mage', 'healer']]]],
    ['coppercap_warrens', [['in range, a party of four at ~40', 40, ['tank', 'ranger', 'mage', 'healer']], ['below range, a party of four at ~27', 27, ['tank', 'ranger', 'mage', 'healer']]]],
  ];
  console.log('  per hero per hour | kills/h (party) | deaths (30 min) | Level XP | skill XP | coin + commons (vendor bid) vs store gold = margin | rares | net');
  for (const [huntId, runs] of PLAN) {
    if (only && !only.includes(huntId)) continue;
    for (const [what, L, roles] of runs) {
      const x = run(huntId, L, roles);
      console.log('  ' + huntId.padEnd(20) + what.padEnd(38) + ' kills/h ' + String(x.kills).padStart(4) + ' | deaths ' + x.falls + ' | Level XP ' + x.levelXp + ' | skill XP ' + x.xp
        + ' | in ' + x.income + ' (coin ' + x.coin + ' + commons ' + x.commons + ') vs store ' + x.store + ' = ' + x.margin + ' | rares ' + x.rares + ' | net ' + x.net
        + (x.ended.length ? ' | ended: ' + x.ended.join(', ') : ''));
    }
  }
}
