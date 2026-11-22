// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/slot-contracts.mjs — THE RULE SLOTS' CONTRACTS AS PROPERTIES (Balance Lab phase 3; docs/design/redesign/
// 07-balance-lab.md section 3.2: "a rule slot is a module with a narrow, written contract: its exports, its inputs, the quantities it
// reads and writes, and its properties (finite, whole numbers where the ledger needs them, monotonic where the design says so, no table
// indexed by Level, same result for the same input)").
//
// The WRITTEN contract is tools/balance-program/rule-slots.json (each slot's `contract`: an id and what it says). THIS file holds the code
// that checks each id, so a family is judged by what the slot promises and never by what the shipped module happens to do. The shipped
// module is held to the same properties: a contract the game itself breaks is a wrong contract, and tests/rule-slots.mjs says so.
//
//   GENERIC                       the lines every slot carries (surface, inherited, imports, static), checked from the source and the module
//   PROPERTIES[slot][id]          (fam) -> null | the first counterexample, as words. `fam` = { M (the family's module, loaded in a copy),
//                                 S (the shipped module in the same copy), imp(path) (any module of that copy) }
//   staticProblems(src, shipped)  the static lines on a family's source: no clock or Math.random, no table indexed by Level, relative
//                                 imports with no ?v= stamp, and a module both import named by the same specifier
//   callersOf(S, rule)            the shipped exports whose code calls a rule export by name (each must be a rule export or `offPath`)
//
// PURE: it reads modules handed to it and writes nothing. Its proofs are tests/rule-slots.mjs --selftest (a planted family that breaks
// each property is caught).
// mutant-anchors: none — a library; tests/rule-slots.mjs --selftest plants the families that break it, on scratch copies
// ════════════════════════════════════════════════════════════════════════

/* ── THE GENERIC LINES ───────────────────────────────────────────────────────────────────────────────────────────────────────── */
export const GENERIC = Object.freeze([
  ['surface', 'the family exports the names the shipped module exports, each of the same kind'],
  ['inherited', 'every export outside the slot\'s `rule` is the shipped module\'s own (inherited, never a copy that can drift)'],
  ['static', 'no clock and no Math.random, no table indexed by Level, relative imports with no ?v= stamp, a module the shipped one also imports named the same way'],
]);

/** Code with its comments blanked (a header may name what the code must not do). */
export const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\b[^'"`;]*?from\s*['"]([^'"]+)['"]/g;
export const importsOf = (src) => [...codeOf(src).matchAll(IMPORT_RE)].map((m) => m[1]);
const bareOf = (spec) => spec.split('?')[0];

/** The static lines on a family's source `src`, beside the shipped module's source: a list of problems (empty = clean). */
export function staticProblems(src, shipped) {
  const out = [];
  const code = codeOf(src);
  if (/\bMath\.random\b|\bDate\.now\b|\bnew Date\b|\bperformance\.now\b/.test(code)) out.push('reads a clock or Math.random (a slot answers the same for the same input)');
  const table = code.match(/\b[A-Za-z_$][\w$]*\s*\[\s*(?:L|lv|lvl|level|Level|heroLevel)\s*(?:[-+]\s*\d+\s*)?\]/);
  if (table) out.push('indexes a table by Level (' + table[0] + '): Levels are endless, a rank or a Level is a formula, never a row');
  const theirs = new Map(importsOf(shipped).filter((s) => s.startsWith('.')).map((s) => [bareOf(s), s]));
  for (const spec of importsOf(src)) {
    if (!spec.startsWith('.')) { out.push('imports ' + spec + ': a slot imports the tree only'); continue; }
    if (/\?v=/.test(spec) && !theirs.has(bareOf(spec))) out.push('imports ' + spec + ' with a ?v= stamp the shipped module does not use');
    if (theirs.has(bareOf(spec)) && theirs.get(bareOf(spec)) !== spec) out.push('imports ' + spec + ' where the shipped module says ' + theirs.get(bareOf(spec)) + ' (two specifiers are two module instances)');
  }
  return out;
}

/**
 * The shipped exports whose code reaches a rule export by name, directly or through another export that does: [[export, the name it
 * calls on the way]]. A module's private helpers are not followed (their text is not an export's); a rule a slot keeps private is cut wrong.
 */
export function callersOf(S, rule) {
  const out = [], reach = new Set(rule);
  const fns = Object.entries(S).filter(([name, v]) => typeof v === 'function' && !rule.includes(name)).map(([name, v]) => [name, codeOf(v.toString())]);
  const calls = (body, r) => new RegExp('\\b' + r.replace(/[$]/g, '\\$') + '\\s*\\(').test(body);
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, body] of fns) {
      if (reach.has(name)) continue;
      const r = [...reach].find((x) => calls(body, x));
      if (r) { out.push([name, r]); reach.add(name); grew = true; }
    }
  }
  return out;
}

/** The generic lines on one family: [{ id, problem }] (problem null = holds). `rule` the slot's rule exports. */
export function genericProblems(M, S, rule, src, shippedSrc) {
  const kind = (v) => (typeof v === 'function' ? 'function' : v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  const a = Object.keys(M).sort(), b = Object.keys(S).sort();
  const missing = b.filter((k) => !a.includes(k)), extra = a.filter((k) => !b.includes(k)), wrong = b.filter((k) => a.includes(k) && kind(M[k]) !== kind(S[k]));
  const surface = missing.length || extra.length || wrong.length
    ? [missing.length ? 'missing ' + missing.join(', ') : '', extra.length ? 'adds ' + extra.join(', ') : '', wrong.length ? 'another kind for ' + wrong.join(', ') : ''].filter(Boolean).join('; ') : null;
  const drift = b.filter((k) => !rule.includes(k) && a.includes(k) && M[k] !== S[k]);
  const missingRule = rule.filter((k) => !b.includes(k));
  return [
    { id: 'surface', problem: surface || (missingRule.length ? 'the slot\'s rule names ' + missingRule.join(', ') + ', which the shipped module does not export' : null) },
    { id: 'inherited', problem: drift.length ? drift.join(', ') + ' outside the rule but not the shipped module\'s own (export * from the shipped module, or name it in the rule)' : null },
    { id: 'static', problem: src === null ? null : (staticProblems(src, shippedSrc)[0] || null) },
  ];
}

/* ── THE GRIDS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const LEVELS = [1, 2, 5, 10, 30, 60, 110, 185, 400, 1000, 5000, 100000];
const ARMOR = [0, 1, 3, 8, 20, 50, 120, 300, 800, 2500, 10000, 1000000];
const BLOWS = [0, 1, 2, 3, 5, 9, 14, 25, 40, 75, 130, 260, 500, 1200, 5000, 100000];
const ELEMENTS = [250, 700, 1000, 1300, 2000];
const whole = (v) => Number.isSafeInteger(v);
const pm = (v) => whole(v) && v >= 0 && v <= 1000;
/* an rng that fails the property when anything draws on it */
const NO_DRAW = Object.freeze({ chance: () => { throw new Error('drew'); }, int: () => { throw new Error('drew'); }, next: () => { throw new Error('drew'); } });
const show = (o) => JSON.stringify(o);
/* the first counterexample of `bad` over a list, as words, or null */
const first = (list, bad) => { for (const x of list) { const w = bad(x); if (w) return w; } return null; };
const prof = (h, m, l) => ({ heavy: h, medium: m, light: l });
const PROFILES = [];
for (const h of [0, 3, 50, 800, 1000000]) for (const m of [0, 3, 50, 800, 1000000]) for (const l of [0, 3, 50, 800]) PROFILES.push(prof(h, m, l));
/* the expected landed damage of a blow, permille of a point: what dodge lets through times what lands */
const expected = (M, v, L, n, el) => { const mit = M.mitigationOf(v, L); return (1000 - mit.dodgePm) * M.mitigate(n, el, mit, 0, NO_DRAW); };
/* whole-permille floors and the cap's ceiling move an expectation by up to one point and a permille of the blow (MEASURED on the shipped
   chain: 1.96 points on a blow of 5,000 where one point of medium armor first opens dodge under the cap) */
const rounding = (n) => 1000 + n;

/* ── THE SLOTS' PROPERTIES ───────────────────────────────────────────────────────────────────────────────────────────────────── */
export const PROPERTIES = Object.freeze({
  armor: Object.freeze({
    profileShape: ({ M }) => first(PROFILES, (v) => first(LEVELS, (L) => {
      const p = M.mitigationOf(v, L);
      return pm(p.dodgePm) && pm(p.absorbPm) && pm(p.keepPm) && whole(p.ward) && p.ward >= 0 ? null : 'mitigationOf(' + show(v) + ', ' + L + ') = ' + show(p);
    })) || (['dodgePm', 'absorbPm', 'ward', 'keepPm'].every((k) => M.NO_MITIGATION[k] === 0) ? null : 'NO_MITIGATION is ' + show(M.NO_MITIGATION)),
    noArmorIsNone: ({ M }) => first(LEVELS, (L) => first(BLOWS, (n) => first(ELEMENTS, (el) => {
      const got = M.mitigate(n, el, M.mitigationOf(prof(0, 0, 0), L), 0, NO_DRAW), want = Math.max(1, Math.floor((n * el) / 1000));
      return got === want ? null : 'no armor, Level ' + L + ', blow ' + n + ', element ' + el + ': ' + got + ', not ' + want;
    }))),
    neverAdds: ({ M }) => first(PROFILES, (v) => first([1, 30, 400, 100000], (L) => first(BLOWS, (n) => first(ELEMENTS, (el) => {
      const got = M.mitigate(n, el, M.mitigationOf(v, L), 0, NO_DRAW), top = Math.max(1, Math.floor((n * el) / 1000));
      return whole(got) && got >= 1 && got <= top ? null : show(v) + ' Level ' + L + ' blow ' + n + ' element ' + el + ' lands ' + got + ' (1..' + top + ')';
    })))),
    moreArmorNoMore: ({ M }) => first([1, 30, 400, 5000], (L) => first(BLOWS.filter((n) => n > 0), (n) => {
      for (const w of ['heavy', 'light']) for (let i = 1; i < ARMOR.length; i++) {
        const a = { heavy: 0, medium: 0, light: 0, [w]: ARMOR[i - 1] }, b = { ...a, [w]: ARMOR[i] };
        const x = M.mitigate(n, 1000, M.mitigationOf(a, L), 0, NO_DRAW), y = M.mitigate(n, 1000, M.mitigationOf(b, L), 0, NO_DRAW);
        if (y > x) return 'more ' + w + ' (' + ARMOR[i - 1] + ' -> ' + ARMOR[i] + ') lands more on a blow of ' + n + ' at Level ' + L + ': ' + x + ' -> ' + y;
      }
      for (const base of [prof(0, 0, 0), prof(120, 0, 20)]) for (let i = 1; i < ARMOR.length; i++) {
        const x = expected(M, { ...base, medium: ARMOR[i - 1] }, L, n, 1000), y = expected(M, { ...base, medium: ARMOR[i] }, L, n, 1000);
        if (y > x + rounding(n)) return 'more medium (' + ARMOR[i - 1] + ' -> ' + ARMOR[i] + ') lands more in expectation on a blow of ' + n + ' at Level ' + L + ': ' + x / 1000 + ' -> ' + y / 1000;
      }
      return null;
    })),
    biggerBlowNoLess: ({ M }) => first(PROFILES, (v) => first([1, 60, 1000], (L) => {
      const mit = M.mitigationOf(v, L);
      for (let i = 1; i < BLOWS.length; i++) if (M.mitigate(BLOWS[i], 1000, mit, 0, NO_DRAW) < M.mitigate(BLOWS[i - 1], 1000, mit, 0, NO_DRAW)) return show(v) + ' Level ' + L + ': a blow of ' + BLOWS[i] + ' lands less than one of ' + BLOWS[i - 1];
      return null;
    })),
    harderAttackerNoLess: ({ M }) => first(PROFILES, (v) => first([5, 40, 300], (n) => {
      for (let i = 1; i < LEVELS.length; i++) {
        const x = expected(M, v, LEVELS[i - 1], n, 1000), y = expected(M, v, LEVELS[i], n, 1000);
        if (y + rounding(n) < x) return show(v) + ' blow ' + n + ': an attacker of Level ' + LEVELS[i] + ' lands less in expectation than one of Level ' + LEVELS[i - 1] + ' (' + x / 1000 + ' -> ' + y / 1000 + ')';
      }
      return null;
    })),
    noDrawWithoutTemper: ({ M }) => {
      try { for (const v of PROFILES) for (const L of [1, 60, 5000]) for (const n of BLOWS) M.mitigate(n, 1000, M.mitigationOf(v, L), 0, NO_DRAW); return null; }
      catch (e) { return 'the chain drew from the dice with no Tempering (' + e.message + ')'; }
    },
    deterministic: ({ M }) => first(PROFILES, (v) => first([1, 60, 5000], (L) => {
      const a = M.mitigationOf(v, L), b = M.mitigationOf({ ...v }, L);
      if (show(a) !== show(b)) return 'mitigationOf(' + show(v) + ', ' + L + ') answered twice differently';
      return first([1, 40, 1200], (n) => (M.mitigate(n, 1000, a, 0, NO_DRAW) === M.mitigate(n, 1000, b, 0, NO_DRAW) ? null : 'mitigate answered twice differently'));
    })),
  }),

  'party-xp': Object.freeze({
    payShape: ({ M }) => first(roleSets(), (roles) => {
      const r = M.partyClassXp(roles);
      return r && whole(r.permille) && r.permille > 0 && Array.isArray(r.classes) ? null : 'partyClassXp(' + show(roles) + ') = ' + show(r);
    }),
    classesShared: ({ M, S }) => first(roleSets(), (roles) => (show(M.partyClassXp(roles).classes) === show(S.partyClassXp(roles).classes) ? null
      : 'classes for ' + show(roles) + ' are ' + show(M.partyClassXp(roles).classes) + ', the shipped reading says ' + show(S.partyClassXp(roles).classes))),
    orderFree: ({ M }) => first(roleSets(), (roles) => {
      const a = M.partyClassXp(roles).permille, b = M.partyClassXp([...roles].reverse()).permille, c = M.partyClassXp([...roles.slice(1), ...roles.slice(0, 1)]).permille;
      return a === b && a === c ? null : 'the order of ' + show(roles) + ' changes the pay (' + [a, b, c].join(', ') + ')';
    }),
    moreClassesNoLess: ({ M }) => first([2, 3, 4, 6], (n) => {
      const ladder = [['tank'], ['tank', 'ranger'], ['tank', 'ranger', 'mage'], ['tank', 'ranger', 'mage', 'healer']].map((held) => Array.from({ length: n }, (_, i) => held[i % held.length]))
        .filter((roles) => new Set(roles).size <= n);
      for (let i = 1; i < ladder.length; i++) if (M.partyClassXp(ladder[i]).permille < M.partyClassXp(ladder[i - 1]).permille) return 'a party of ' + n + ' with more classes (' + show(ladder[i]) + ') pays less than ' + show(ladder[i - 1]);
      return null;
    }),
    deterministic: ({ M }) => first(roleSets(), (roles) => (show(M.partyClassXp(roles)) === show(M.partyClassXp([...roles])) ? null : 'partyClassXp(' + show(roles) + ') answered twice differently')),
  }),

  'death-cost': Object.freeze({
    lossShape: async ({ M, imp }) => {
      const { COMBAT_SKILLS } = await imp('src/data/skills.js');
      return first(await deathStates(imp), (st) => {
        const out = M.deathXpLoss(st);
        const bad = Object.entries(out).find(([k, v]) => !(k === 'level' || COMBAT_SKILLS.includes(k)) || !whole(v) || v <= 0);
        return bad ? 'deathXpLoss(' + show(st) + ') answers ' + show(bad) : null;
      });
    },
    neverUnderLevel1: async ({ M, imp }) => first(await deathStates(imp), (st) => {
      const lv = M.deathXpLoss(st).level || 0, one = M.levelDeathLoss(st.levelXp);
      return lv <= st.levelXp && one <= st.levelXp && one >= 0 ? null : 'a death takes ' + lv + ' of ' + st.levelXp + ' Level XP';
    }),
    skillKeepsLevel: async ({ M, imp }) => {
      const XP = await imp('src/core/xp.js');
      return first(await deathStates(imp), (st) => first(Object.entries(M.deathXpLoss(st)).filter(([k]) => k !== 'level'), ([k, n]) => {
        const x = st.skills[k], into = x - XP.skillXpForLevel(k, XP.skillLevelFromXp(k, x));
        return n <= into ? null : k + ' loses ' + n + ' with only ' + into + ' into its level';
      }));
    },
    freeModeFree: async ({ M, imp }) => first(await deathStates(imp), (st) => (Object.keys(M.deathXpLoss(st, 0)).length === 0 ? null : 'a share of 0 takes ' + show(M.deathXpLoss(st, 0)))),
    shareMonotone: async ({ M, imp }) => first(await deathStates(imp), (st) => {
      const shares = [0, 0.015, 0.03, 0.045, 0.06, 0.09];
      for (let i = 1; i < shares.length; i++) {
        const a = M.deathXpLoss(st, shares[i - 1]), b = M.deathXpLoss(st, shares[i]);
        const k = Object.keys(a).find((x) => (b[x] || 0) < a[x]);
        if (k) return 'a share of ' + shares[i] + ' takes less ' + k + ' than ' + shares[i - 1];
      }
      return null;
    }),
    levelMonotone: async ({ M, imp }) => {
      const XP = await imp('src/core/xp.js');
      const xs = [0, 1, 50, 1000, ...LEVELS.flatMap((L) => [XP.charXpForLevel(L), XP.charXpForLevel(L) + Math.floor((XP.charXpForLevel(L + 1) - XP.charXpForLevel(L)) / 2)])].sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) if (M.levelDeathLoss(xs[i]) < M.levelDeathLoss(xs[i - 1])) return 'more Level XP (' + xs[i - 1] + ' -> ' + xs[i] + ') loses less: ' + M.levelDeathLoss(xs[i - 1]) + ' -> ' + M.levelDeathLoss(xs[i]);
      return null;
    },
    oneReader: async ({ M, imp }) => first(await deathStates(imp), (st) => first([0.06, 0.03], (f) => ((M.deathXpLoss(st, f).level || 0) === M.levelDeathLoss(st.levelXp, f) ? null
      : 'deathXpLoss takes ' + (M.deathXpLoss(st, f).level || 0) + ' Level XP where levelDeathLoss says ' + M.levelDeathLoss(st.levelXp, f)))),
    deterministic: async ({ M, imp }) => first(await deathStates(imp), (st) => (show(M.deathXpLoss(st)) === show(M.deathXpLoss(JSON.parse(show(st)))) ? null : 'deathXpLoss answered twice differently')),
  }),
  'hero-power': Object.freeze({
    pmShape: async ({ M, imp }) => { const K = await gearKits(imp); return first(K.kits, (k) => first(K.tempers, (t) => {
      const b = M.blowsPmOf(k, K.items, t), a = M.armorPmOf(k, K.items, t);
      return whole(b) && b >= 0 && whole(a) && a >= 0 && a <= 999 ? null : show(k) + ' temper ' + show(t) + ' answers blowsPm ' + b + ', armorPm ' + a;
    })); },
    bareIsNone: async ({ M, imp }) => { const K = await gearKits(imp); return first([{}, null], (k) => first(K.tempers, (t) => (M.blowsPmOf(k, K.items, t) === 0 && M.armorPmOf(k, K.items, t) === 0 ? null : 'a bare hero with temper ' + show(t) + ' answers ' + M.blowsPmOf(k, K.items, t) + ' / ' + M.armorPmOf(k, K.items, t)))); },
    higherGearNoLess: async ({ M, imp }) => {
      const K = await gearKits(imp);
      for (let i = 1; i < K.weapons.length; i++) if (M.blowsPmOf({ weapon: K.weapons[i] }, K.items) < M.blowsPmOf({ weapon: K.weapons[i - 1] }, K.items)) return K.weapons[i] + ' gains less than ' + K.weapons[i - 1];
      for (let i = 1; i < K.sets.length; i++) if (M.armorPmOf(K.sets[i], K.items) < M.armorPmOf(K.sets[i - 1], K.items)) return show(K.sets[i]) + ' loses less than ' + show(K.sets[i - 1]);
      return null;
    },
    deterministic: async ({ M, imp }) => { const K = await gearKits(imp); return first(K.kits, (k) => first(K.tempers, (t) => (M.blowsPmOf(k, K.items, t) === M.blowsPmOf(JSON.parse(show(k)), K.items, t) && M.armorPmOf(k, K.items, t) === M.armorPmOf(JSON.parse(show(k)), K.items, t) ? null : show(k) + ' answered twice differently'))); },
  }),
});

/* the catalogue's tiered weapons and armor sets by item Level (one family of each, so "higher" is one line), every kit of them, and a few
   Temperings (none, every rung, a planted huge rung the ladder clamps) */
async function gearKits(imp) {
  const { ITEMS } = await imp('src/data/items.js');
  const { ARMOUR_SLOTS } = await imp('src/data/core-model.js');
  const rows = Object.entries(ITEMS).filter(([, it]) => Number.isInteger(it.tier) && Number.isInteger(it.reqLv));
  const weapons = rows.filter(([, it]) => it.slot === 'weapon' && it.weaponType === 'sword').sort((a, b) => a[1].reqLv - b[1].reqLv).map(([id]) => id);
  const tiers = [...new Set(rows.map(([, it]) => it.tier))].sort((a, b) => a - b);
  const sets = tiers.map((t) => Object.fromEntries(ARMOUR_SLOTS.map((s) => [s, (rows.find(([, it]) => it.slot === s && it.tier === t && it.armourClass === 'plate' && Number(it.defB) > 0) || [])[0]]).filter(([, id]) => id)))
    .filter((s) => Object.keys(s).length).sort((a, b) => ITEMS[Object.values(a)[0]].reqLv - ITEMS[Object.values(b)[0]].reqLv);
  const kits = weapons.flatMap((w, i) => [{ weapon: w }, { weapon: w, ...(sets[i % Math.max(1, sets.length)] || {}) }]).concat(sets);
  const all = Object.fromEntries(rows.map(([id, it]) => ['temper:' + (it.slot === 'weapon' ? 'blows' : 'armor') + ':' + it.tier, 3]));
  const huge = Object.fromEntries(Object.keys(all).map((k) => [k, 1e6]));
  return { items: ITEMS, weapons, sets, kits, tempers: [undefined, {}, all, huge] };
}

/* every party of 0 to 6 heroes over the five roles, sampled, plus a large one and an unknown role */
function roleSets() {
  const R = ['tank', 'melee_dps', 'ranger', 'mage', 'healer'];
  const out = [[], ['tank'], ['healer'], Array.from({ length: 100 }, (_, i) => R[i % 5]), ['tank', 'not_a_role']];
  for (let n = 2; n <= 6; n++) for (let s = 0; s < 12; s++) out.push(Array.from({ length: n }, (_, i) => R[(s * 7 + i * (s % 3 + 1)) % 5]));
  return out;
}
/* heroes at Levels 1 to 100,000, at a Level's start and half way, with combat skills at a few heights */
async function deathStates(imp) {
  const XP = await imp('src/core/xp.js');
  const { COMBAT_SKILLS } = await imp('src/data/skills.js');
  const out = [{ levelXp: 0, skills: {} }];
  for (const L of LEVELS) {
    const at = XP.charXpForLevel(L), half = at + Math.floor((XP.charXpForLevel(L + 1) - at) / 2);
    const skills = Object.fromEntries(COMBAT_SKILLS.map((k, i) => [k, XP.skillXpForLevel(k, Math.max(1, Math.min(400, Math.round(L / (i + 1))))) + 7 * (i + 1)]));
    out.push({ levelXp: at, skills: {} }, { levelXp: half, skills });
  }
  return out;
}

/** Every property of `slot` (the ids rule-slots.json's contract names) on one family: [{ id, problem }]. */
export async function propertyProblems(slot, fam, ids) {
  const props = PROPERTIES[slot] || {};
  const out = [];
  for (const id of ids) {
    if (!props[id]) { out.push({ id, problem: 'the contract names ' + id + ', which slot-contracts.mjs does not check' }); continue; }
    let problem;
    try { problem = await props[id](fam); } catch (e) { problem = 'threw: ' + String(e && e.message || e).split('\n')[0]; }
    out.push({ id, problem: problem || null });
  }
  return out;
}
