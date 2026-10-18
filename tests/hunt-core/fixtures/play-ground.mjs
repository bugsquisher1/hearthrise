// tests/hunt-core/fixtures/play-ground.mjs — ONE PLAY of each new ground on the real engine (forest-cave.mjs --play).
// The settle the world tick runs (supabase/functions/hr-accrue/accrual.js accrueHunt) over thirty sim-minutes, cut
// into ten-minute windows the way the tick's clock would, carrying the world and each session between windows
// (the hunt-sessions-settle.mjs runCut shape). Prints what a player would read: kills, falls, gold in, supplies out.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const T0 = Date.UTC(2026, 9, 18, 12, 0, 0);
const IID = '00000000-0000-4000-8000-0000000c5f01';
const SECRET = '-4611686018427387904';

export async function play(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const AC = await import(u('supabase/functions/hr-accrue/accrual.js'));
  const SPAWN = await import(u('src/core/hunt-spawn.js'));
  const GRID = await import(u('src/core/hunt/grid.js'));
  const XP = await import(u('src/core/xp.js'));
  const SB = await import(u('src/data/supply-basics.js'));
  const KIT = await import(u('src/data/start-kit.js'));
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
  const lv = (n) => XP.xpForLevel(n);
  const member = (huntId, key, seat, o) => {
    const maxHp = XP.levelFromXp(o.skills.hitpoints);
    return {
      key, user: key, slot: 0, seat, unitId: null, sessionId: 's-' + key, version: 1, huntId,
      huntSession: { id: 's-' + key, instanceId: IID, huntFromMs: T0, nextSwingAtMs: T0, swingIndex: 0, bag: o.bag,
        staminaMs: 12 * 3600000, staminaMaxMs: 12 * 3600000, basics, shop, goldFloor: 0, supplySource: 'mine', onEmpty: 'switch', cover: {}, fallsLimit: 3 },
      skills: o.skills, xpFrac: null, hp: maxHp, maxHp, gold: o.gold, equipment: o.equipment, combatStyle: null,
      inventory: {}, recoveringUntilMs: 0, deathsTodayBefore: 0, deathsLifetimeBefore: 0, hearthfindReady: false, perks: null,
      hero: SPAWN.heroSetup({ weaponType: ITEMS[o.equipment.weapon].weaponType, options: o.role === 'healer' ? { role: 'healer' } : {}, bar: [], partyRoles: o.partyRoles }),
    };
  };
  const run = (huntId, members, spanMs) => {
    const ground = G.HUNT_GROUNDS[huntId], grid = gridOf(ground.map);
    let world = null, next = T0;
    const tot = Object.fromEntries(members.map((m) => [m.key, { kills: 0, falls: 0, coin: 0, loot: 0, supply: 0, ended: null, items: {} }]));
    for (let t = T0; t < T0 + spanMs; t += 600000) {
      const out = AC.accrueHunt({ instance: { id: IID, nextSwingAtMs: next, world }, window: { fromMs: t, toMs: Math.min(T0 + spanMs, t + 600000) },
        secret: SECRET, ground, grid, items: ITEMS, monsters: MONSTERS, members });
      if (!out.accrued) continue;
      world = out.world; next = out.settledTo;
      for (const p of out.members) {
        const m = members.find((x) => x.key === p.key), h = p.hunt, T = tot[p.key];
        T.kills += p.delta.journal.meta.kills;
        T.falls += (p.summary.deathLog || []).length;
        for (const d of p.summary.deathLog || []) (T.by = T.by || []).push(d.monster + ' @' + Math.round((d.atMs - T0) / 60000) + 'm');
        T.coin += p.delta.gold || 0;
        for (const [id, n] of Object.entries(p.delta.items || {})) { T.items[id] = (T.items[id] || 0) + n; T.loot += n * ((ITEMS[id] && ITEMS[id].v) || 0); }
        for (const [id, n] of Object.entries(h.buys || {})) T.supply += n * ((SB.BASIC_INDEX[id] || {}).price || 0);
        for (const [id, n] of Object.entries(h.uses || {})) if (!SB.BASIC_INDEX[id]) T.supply += n * ((ITEMS[id] && ITEMS[id].v) || 0);
        if (h.ended && !T.ended) T.ended = h.ended.reason + ' after ' + T.kills + ' kills';
        m.huntSession = Object.assign({}, m.huntSession, { swingIndex: h.swing_to, nextSwingAtMs: Date.parse(h.next_swing_at), falls: h.falls, staminaMs: h.stamina, down: h.down,
          bag: Object.fromEntries(Object.entries(m.huntSession.bag).map(([id, l]) => [id, { ...l, left: (l.left ?? l.loaded) - (h.uses[id] || 0) }])) });
        m.unitId = h.unit_id; m.hp = p.delta.hp; m.gold += p.delta.gold || 0;
        for (const [k, v] of Object.entries(p.delta.xp || {})) m.skills = { ...m.skills, [k]: (m.skills[k] || 0) + v };
        if (h.ended) m.ended = h.ended;
      }
      if (members.every((m) => m.ended)) break;
    }
    return { tot };
  };
  const show = (title, r) => {
    console.log('  ' + title);
    for (const [k, T] of Object.entries(r.tot)) {
      console.log('    ' + k.padEnd(8) + ' kills ' + T.kills + ' | falls ' + T.falls + (T.by ? ' (' + T.by.join(', ') + ')' : '') + ' | coin ' + T.coin + ' g, loot ' + T.loot + ' g (book) | supplies ' + T.supply + ' g'
        + (T.ended ? ' | ended ' + T.ended : ' | still hunting') + ' | ' + Object.entries(T.items).map(([id, n]) => id + ' ' + n).join(', '));
    }
  };
  /* THE FOREST: a fresh character from the real start kit, alone, on its own coin. */
  const fresh = { skills: Object.assign({}, KIT.START_SKILL_XP), equipment: Object.assign({}, KIT.START_EQUIPMENT), gold: KIT.START_GOLD || 0,
    bag: { cooked_shrimp: { loaded: KIT.START_INVENTORY.cooked_shrimp || 20 } }, role: 'tank', partyRoles: ['tank'] };
  show('Meadowbrook Thicket, a fresh solo hero (start kit, below the floor), 30 sim-minutes, today\'s packs',
    run('meadowbrook_thicket', [member('meadowbrook_thicket', 'fresh', 0, fresh)], 1800000));
  /* ...and the hero the floor is for: combat 5 out of the cellar, the same kit and purse. */
  const floor = Object.assign({}, fresh, { skills: { attack: lv(6), strength: lv(6), defense: lv(5), hitpoints: lv(12) } });
  show('Meadowbrook Thicket, a solo hero at the floor (Attack/Strength 6, Defence 5, Hitpoints 12), 30 sim-minutes, today\'s packs',
    run('meadowbrook_thicket', [member('meadowbrook_thicket', 'floor', 0, floor)], 1800000));
  /* THE CAVE: four heroes at combat 40 in steel and willow/maple, a bag of trout each. */
  const roles = ['tank', 'ranger', 'mage', 'healer'];
  const party = roles.map((role, i) => member('coppercap_warrens', role, i, {
    skills: { attack: lv(40), strength: lv(40), defense: lv(40), hitpoints: lv(40), ranged: lv(40), magic: lv(40) },
    equipment: { weapon: { tank: 'steel_sword', ranger: 'maple_bow', mage: 'willow_staff', healer: 'willow_staff' }[role], body: 'steel_platebody', helmet: 'steel_helm',
      ...(role === 'ranger' ? { ammo: 'bronze_arrows' } : {}) },
    gold: 5000, bag: { cooked_trout: { loaded: 60 } }, role, partyRoles: roles }));
  show('Coppercap Warrens, a four-hero party at combat 40, 30 sim-minutes, today\'s packs', run('coppercap_warrens', party, 1800000));
}
