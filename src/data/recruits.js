// ════════════════════════════════════════════════════════════════════════
// src/data/recruits.js — THE RECRUITS: ONE HERO FIRST, THEN THREE MORE IN ONE PRESS
//   (Tyler RD-Q6 a, 2026-11-22: "One hero, then three recruits in one press at Level 5, near the first hero's Level";
//   docs/design/redesign/02-architecture.md package 8; the server contract is the header of supabase/migrations/1053-recruits.sql).
//
// A new account makes ONE hero. When that hero reaches `atLevel`, the company is offered its recruits: ONE press makes
// `count` heroes in the account's empty slots, at the first hero's Level (`levelsUnder` under it, never above `maxLevel`),
// each with the hero kit once a slot and the practice set of its job worn. It is a GRANT: the server decides the Level,
// the kit and the jobs (supabase/migrations/1053-recruits.sql hr_recruit_company), journals it, and makes it once an
// account. The client sends one intent with a key and, if the player typed any, the names.
//
//   atLevel      the first hero's Level that opens the press (the Mill Cellar ends at Level 5: the Path's first_level_5)
//   levelsUnder  how many Levels under the first hero the recruits arrive (0: the same Level, so the four enter the Sewer,
//                whose floor is Level 5, together)
//   maxLevel     the highest Level a recruit arrives at, however late the press: the press is the first hour's, so a lone
//                hero that waits is never handed three heroes at its own high Level
//   count        recruits in the one press: every slot but the first hero's (shops.js HERO_SLOTS)
//   jobs         STARTER_SETS ids in the order the company needs them. The recruits take the first `count` whose role the
//                first hero's weapon does not already play, then the rest in this order (the server reads the role from the
//                weapon the first hero wears, hr_hunt_weapon_roles). A Club first hero gets a shield, a healer and a bow;
//                a shield first hero gets a healer, a bow and a club
//   live         the Path's flag (src/data/the-path.js first_level_5)
//
// NAMES. A recruit the player did not name is named by the server: the first name of RECRUIT_GIVEN, or a given name and a
// family name of RECRUIT_FAMILY, that no hero and no other account holds, in an order the account's id fixes. A player may
// type any name instead (the same rules as any hero's name). These are the town's folk: short, plain, never a mood word.
//
// Generated into SQL by tools/gen-catalogues.mjs (1052-recruits-catalogue.generated.sql: hr_recruit_rules, hr_recruit_jobs,
// hr_recruit_names); `--check` fails on any drift. PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const RECRUITS = Object.freeze({
  live: true,
  atLevel: 5,
  levelsUnder: 0,
  maxLevel: 10,
  count: 3,
  jobs: Object.freeze(['tank', 'healer', 'ranger', 'club']),
});

export const RECRUIT_GIVEN = Object.freeze([
  'Bren', 'Hale', 'Tess', 'Odo', 'Wren', 'Corra', 'Ivo', 'Mab', 'Pell', 'Rook',
  'Sabe', 'Ulla', 'Edda', 'Fenn', 'Gil', 'Hob', 'Isa', 'Jory', 'Kett', 'Lark',
  'Mott', 'Nell', 'Orla', 'Piet', 'Rhea', 'Sol', 'Tibb', 'Una', 'Wyn', 'Yeva',
  'Bram', 'Cade', 'Dov', 'Fay', 'Gwen', 'Hew', 'Ida', 'Joss', 'Kip', 'Liss',
]);

export const RECRUIT_FAMILY = Object.freeze([
  'Ashby', 'Barrow', 'Cobb', 'Dunn', 'Ellery', 'Fallow', 'Gage', 'Hollis',
  'Ings', 'Keel', 'Lowe', 'Marsh', 'Nye', 'Oakes', 'Pike', 'Reeve',
  'Stroud', 'Thorne', 'Vell', 'Ward', 'Brack', 'Croft', 'Dace', 'Fitch',
  'Hart', 'Mill', 'Tull', 'Webb', 'Wick', 'Cray', 'Rudd', 'Sallow',
]);

const NAME = /^[A-Z][a-z]{1,8}$/;

/**
 * Every problem with the rows, as strings. Empty = valid. `sets`: the STARTER_SETS ids (src/data/start-kit.js); `slots`: the hero slots
 * an account holds (src/data/shops.js HERO_SLOTS.count). Pure.
 */
export function validateRecruits(r = RECRUITS, sets = [], slots = 4, given = RECRUIT_GIVEN, family = RECRUIT_FAMILY) {
  const out = [];
  const whole = (v) => Number.isInteger(v) && v >= 0;
  if (!whole(r.atLevel) || r.atLevel < 2) out.push('atLevel must be a whole Level of 2 or more');
  if (!whole(r.levelsUnder)) out.push('levelsUnder must be a whole number of Levels');
  if (!whole(r.maxLevel) || r.maxLevel < r.atLevel - r.levelsUnder) out.push('maxLevel must be at least the Level a recruit arrives at when the press opens');
  if (!Number.isInteger(r.count) || r.count < 1 || r.count > slots - 1) out.push('count must be 1 to every slot but the first hero\'s (' + (slots - 1) + ')');
  if (!Array.isArray(r.jobs) || r.jobs.length < r.count) out.push('jobs must name at least count sets');
  else {
    if (new Set(r.jobs).size !== r.jobs.length) out.push('a job is listed twice');
    for (const j of r.jobs) if (!sets.includes(j)) out.push('job ' + j + ' is no STARTER_SETS row');
  }
  if (typeof r.live !== 'boolean') out.push('live must be true or false');
  for (const [label, list] of [['RECRUIT_GIVEN', given], ['RECRUIT_FAMILY', family]]) {
    if (!Array.isArray(list) || list.length < 1) { out.push(label + ' is empty'); continue; }
    if (new Set(list.map((x) => String(x).toLowerCase())).size !== list.length) out.push(label + ' holds a name twice');
    for (const x of list) if (typeof x !== 'string' || !NAME.test(x)) out.push(label + ': "' + x + '" is not one plain capitalised word of 2 to 9 letters');
  }
  if (Array.isArray(given) && Array.isArray(family) && given.some((g) => family.some((f) => String(g).toLowerCase() === String(f).toLowerCase()))) {
    out.push('a name is both a given name and a family name');
  }
  return out;
}
