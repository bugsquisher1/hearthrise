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

export async function play(root, only) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const AC = await import(u('supabase/functions/hr-accrue/accrual.js'));
  const CAT = await import(u('supabase/functions/hr-accrue/catalogue.js'));
  const SPAWN = await import(u('src/core/hunt-spawn.js'));
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
    const row = MAPS.WORLD_MAPS.find((m) => m.id === mapId);
    const map = MC.compileMap(row, { materials: TER.MATERIALS, sprites, openClasses: TER.OPEN_CLASSES, lights: {} });
    const solid = (x, y) => { const m = TER.MATERIALS[map.ground[y * map.w + x]]; return !!(m && m.solid && !m.flat); };
    return GRID.makeGrid(map.w, map.h, (x, y) => map.mask[y * map.w + x] === 0, solid);
  };
  const basics = {};
  for (const b of SB.BASIC_SUPPLIES) basics[b.id] = { kind: b.kind, price: b.price, heals: b.heals || 0, mana: b.mana || 0, partner: b.partner };
  const shop = { heal: SB.basicFor('heal', 1).id, mana: SB.basicFor('mana', 1).id };
  /* gear by level, the smiths' ladder a player at that level wears */
  const kit = (L, role) => {
    const t = L < 15 ? 0 : L < 30 ? 1 : L < 45 ? 2 : 3;
    const weapon = { tank: ['bronze_sword', 'iron_sword', 'steel_sword', 'mithril_sword'], ranger: ['shortbow', 'willow_longbow', 'maple_bow', 'maple_bow'],
      mage: ['apprentice_staff', 'oak_staff', 'willow_staff', 'maple_staff'], healer: ['apprentice_staff', 'oak_staff', 'willow_staff', 'maple_staff'] }[role][t];
    return { weapon, body: ['bronze_platebody', 'iron_platebody', 'steel_platebody', 'mithril_platebody'][t], helmet: ['bronze_helm', 'iron_helm', 'steel_helm', 'steel_helm'][t],
      ...(role === 'ranger' ? { ammo: 'bronze_arrows' } : {}) };
  };
  const hero = (huntId, role, i, L, roles) => {
    /* A hero at Level L with every combat skill at L (the designer's fit: skill ~ Level through L25). */
    const skills = Object.fromEntries(COMBAT.map((k) => [k, XP.skillXpForLevel(k, L)]));
    const equipment = kit(L, role);
    return {
      key: role + i, user: role + i, slot: 0, seat: i, unitId: null, sessionId: 's-' + role + i, version: 1, huntId,
      huntSession: { id: 's-' + role + i, instanceId: IID, huntFromMs: T0, nextSwingAtMs: T0, swingIndex: 0, bag: role === 'ranger' ? { bronze_arrows: { loaded: 1 } } : {},
        staminaMs: 12 * 3600000, staminaMaxMs: 12 * 3600000, basics, shop, goldFloor: 0, supplySource: 'mine', onEmpty: 'switch', cover: {} },
      skills, levelXp: XP.charXpForLevel(L), xpFrac: null, hp: 1e9, gold: 50000, equipment,
      inventory: {}, deathsTodayBefore: 0, deathsLifetimeBefore: 0, hearthfindReady: false, perks: null,
      hero: SPAWN.heroSetup({ weaponType: ITEMS[equipment.weapon].weaponType, options: role === 'healer' ? { role: 'healer' } : {}, bar: [], partyRoles: roles }),
    };
  };
  const run = (huntId, L, roles) => {
    const ground = G.HUNT_GROUNDS[huntId], grid = gridOf(ground.map);
    const members = roles.map((r, i) => hero(huntId, r, i, L, roles));
    /* common vs rare by the hunt's own drop rows: a drop at 5% or more anywhere here is a common, unless it is a
       trophy worth 100 g or more (a boss's chase item: the Crown Shard, the Alpha Fang), which is upside */
    const common = new Set();
    for (const p of ground.pockets) for (const s of p.spawns) for (const d of MONSTERS[s.monster].drops) if (d.ch >= 0.05 && CAT.vendorPriceOf(ITEMS, d.id) < 100) common.add(d.id);
    let world = null, next = T0, played = 0;
    const T = { xp: 0, levelXp: 0, coin: 0, commons: 0, rares: 0, store: 0, falls: 0, kills: 0, ended: [] };
    for (let t = T0; t < T0 + SPAN; t += 600000) {
      const out = AC.accrueHunt({ instance: { id: IID, nextSwingAtMs: next, world }, window: { fromMs: t, toMs: Math.min(T0 + SPAN, t + 600000) },
        secret: SECRET, ground, grid, items: ITEMS, monsters: MONSTERS, members });
      if (!out.accrued) continue;
      world = out.world; next = out.settledTo; played = next - T0;
      for (const p of out.members) {
        const m = members.find((x) => x.key === p.key), h = p.hunt;
        if (p.key === members[0].key) T.kills += p.delta.journal.meta.kills;
        T.falls += (p.summary.deathLog || []).length;
        T.coin += p.delta.gold || 0;
        for (const [k, v] of Object.entries(p.delta.xp || {})) if (COMBAT.includes(k)) T.xp += v;
        T.levelXp += p.delta.level_xp || 0;
        for (const [id, n] of Object.entries(p.delta.items || {})) T[common.has(id) ? 'commons' : 'rares'] += n * CAT.vendorPriceOf(ITEMS, id);
        for (const [id, n] of Object.entries(h.buys || {})) T.store += n * ((SB.BASIC_INDEX[id] || {}).price || 0);
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
    const per = 3600000 / SPAN / roles.length;
    const r = (n) => Math.round(n * per);
    const income = r(T.coin + T.commons), store = r(T.store);
    return { kills: Math.round(T.kills * 3600000 / SPAN), falls: T.falls, xp: r(T.xp), levelXp: r(T.levelXp), coin: r(T.coin), commons: r(T.commons), rares: r(T.rares), store, income,
      margin: store ? Math.round((income / store - 1) * 100) + '%' : 'no store spend', net: income + r(T.rares) - store, ended: T.ended };
  };
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
