// ════════════════════════════════════════════════════════════════════════
// tests/boss-hall-fixture.mjs — THE FIXTURE HALL tests/boss-hall.mjs and tests/boss-hall-db.mjs play (src/data/boss-halls.js holds no hall
// yet: a ground pack's `hall` folds in later). The Rat King's hall on the Millrace map, opened from the Millrace Sewer with a Goblin Totem: a
// boss with his two lines and a hasted flare (Slag Rain stands in for the Hall Fire), a named add with his own spell and enrage line, and two
// plain adds, every row a PAYING one. Data only.
// ════════════════════════════════════════════════════════════════════════
export const BOSS = 'hall_boss_fixture', NAMED = 'hall_captain_fixture', ADD = 'hall_guard_fixture';
export const ROOM = 'millrace_sewer_hall', FROM = 'millrace_sewer', KEY = 'goblin_totem';
export const FLARE = 'slag_rain', CONE = 'slag_toss', NAMED_SPELL = 'tail_lash';

export const ROWS = Object.freeze({
  [BOSS]: { name: 'Hall Boss', icon: '👑', tier: 3, level: 52, cls: 'humanoid', family: 'Humanoid', formation: true, boss: true,
    spells: [CONE, FLARE], hp: 3500, atk: 40, baseAcc: -1.3, def: 28, xp: 6603, gp: [122, 366], speed: 2800,
    drops: [{ id: 'big_bones', ch: 1, band: 'common' }],
    phases: { addsPm: 500, enragePm: 250, enrageAtkPm: 1400, guardPm: 800, hasten: { spell: FLARE, cdPm: 500 } } },
  [NAMED]: { name: 'Hall Captain', icon: '⚔️', tier: 3, level: 48, cls: 'humanoid', family: 'Humanoid', formation: true, boss: true, add: true,
    spells: [NAMED_SPELL], hp: 600, atk: 40, baseAcc: 0.2, def: 20, xp: 900, gp: [20, 60], speed: 3000,
    drops: [{ id: 'bones', ch: 1, band: 'common' }], phases: { enragePm: 400, enrageAtkPm: 1300 } },
  [ADD]: { name: 'Hall Guard', icon: '🛡️', tier: 3, level: 44, cls: 'humanoid', family: 'Humanoid', formation: true, add: true,
    hp: 300, atk: 30, baseAcc: 0.2, def: 20, xp: 300, gp: [5, 15], speed: 2600, drops: [{ id: 'bones', ch: 1, band: 'common' }] },
});

/** The room's ground row, built with the packs' own pocket helper (src/data/grounds/shape.js `pocket`). */
export const hallGround = (pocket) => ({ id: ROOM, hunt: ROOM, map: 'millrace_sewer', hall: FROM,
  start: [[51, 23], [51, 22], [51, 24], [50, 23]],
  pockets: [{ ...pocket([51, 17, 57, 29], [BOSS, 55, 23]), adds: [{ monster: NAMED, x: 56, y: 18 }, { monster: ADD, x: 56, y: 28 }, { monster: ADD, x: 53, y: 18 }] }],
  route: [0], respawnMs: 600000, pullDist: 1.5, groupFit: 'party' });

export const HALL_HUNT = Object.freeze({ id: ROOM, name: 'The Fixture Hall', theme: 'A fixture.', hall: true, band: [8, 25],
  spawns: [{ monster: BOSS, w: 1 }, { monster: NAMED, w: 1 }, { monster: ADD, w: 1 }], family: 'Humanoid', art: 'rat_king_called', travelS: 0, pull: 1, respawnMs: 600000 });

export const HALL_ROW = Object.freeze({ id: FROM, hunt: ROOM, key: KEY, boss: 'the Hall Boss', Boss: 'The Hall Boss' });

/** A generator source naming the fixture hall over the real tables (tools/gen-hunt-sessions.mjs catalogueRows). */
export const hallSource = (monsters, ground, o = {}) => ({ monsters: { ...monsters, ...JSON.parse(JSON.stringify(ROWS)), ...(o.monsters || {}) },
  hallHunts: o.hallHunts || [HALL_HUNT], hallGrounds: o.hallGrounds || { [ROOM]: ground }, halls: o.halls || { [FROM]: HALL_ROW }, ...(o.extra || {}) });
