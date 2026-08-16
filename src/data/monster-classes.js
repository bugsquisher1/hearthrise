// ════════════════════════════════════════════════════════════════════════
// src/data/monster-classes.js — THE MONSTER TAXONOMY, AS DATA
//
// Ships the 11-class Tibia-derived taxonomy approved by Tyler on 2026-08-16
// (`.claude/coordination/DECISIONS.md`; content authored in
// `docs/design/review-book-content.md` Library 1 §1A).
//
// WHY A CLASS TABLE RATHER THAN 112 ROWS OF WEAKNESS
//   The single most important line in the design: **the CLASS carries the
//   weakness profile, and an individual monster may override AT MOST ONE
//   AXIS.** That is OSRS's bane-weapon model — "demonbane hurts demons", not
//   "this specific hellhound is weak to this specific sword" — and it turns a
//   112-row memorisation problem into eleven learnable sentences.
//
//   Concretely: adding a monster is `cls:'undead'` and nothing else. A
//   class-wide balance change is one row here, not 112 edits. That is the
//   10x-content property this module exists to buy.
//
// TWO AXES, AND ONLY TWO
//   • weapon  — sword | hammer | ranged | magic   (weak / resist)
//   • element — ember | frost | poison            (weak / resist / immune)
//   `neutral` is RETIRED (DEC-NEUT-01). Every class has a real weapon
//   weakness, distributed 3/3/3/2 across sword/hammer/ranged/magic; the
//   distribution is asserted below so a future edit cannot quietly make one
//   weapon style the wrong build everywhere.
//
// THE OVERRIDE RULE IS ENFORCED, NOT DOCUMENTED
//   `overrideAxisOf()` reports which axes a monster diverges from its class
//   on. `auditRoster()` fails on two. "A monster with two overrides is
//   rejected in review" now means: the test run rejects it.
//
// PURE DATA + PURE FUNCTIONS. No DOM, no window, no timers, no Math.random.
// Imported by the browser AND vendored into the hr-accrue Edge Function, so
// it must stay side-effect free.
// ════════════════════════════════════════════════════════════════════════

/** The three elements. `blight` was renamed POISON everywhere (DEC-ELEM-04). */
export const ELEMENTS = Object.freeze(['ember', 'frost', 'poison']);

/** The weapon triangle axis. NOTE: 'neutral' is deliberately absent. */
export const WEAPON_AXES = Object.freeze(['sword', 'hammer', 'ranged', 'magic']);

/* ── The eleven classes ───────────────────────────────────────────────────
   `elementPerMonster: true` means the class does NOT print an element
   weakness — each member declares its own (a Dragon is opposed to its own
   breath; an Elemental is ruined by its opposite). Declaring one there is
   REQUIRED and is therefore NOT counted as an override.

   `hiddenElement: true` (Extra Dimensional only) means the element weakness
   exists in data but must not be shown until the bestiary threshold is met —
   PROG-01's proof of value. The data carries `elementWeak` so the combat
   engine can resolve it; the RENDERER is what hides it. */
export const MONSTER_CLASSES = Object.freeze({
  mammal: {
    id: 'mammal', name: 'Mammal', order: 1,
    line: 'Mundane animals, fast and unarmoured. The tutorial class.',
    weaponWeak: 'ranged', weaponResist: ['magic'],
    elementWeak: 'ember', elementResist: [], elementImmune: [],
  },
  vermin: {
    id: 'vermin', name: 'Vermin', order: 2,
    line: 'Small, many, and it does not care how sharp your sword is.',
    weaponWeak: 'hammer', weaponResist: ['ranged'],
    elementWeak: 'frost', elementResist: [], elementImmune: ['poison'],
  },
  plant: {
    id: 'plant', name: 'Plant', order: 3,
    line: 'Rooted, patient, and it burns. Poison is something plants make.',
    weaponWeak: 'sword', weaponResist: ['ranged'],
    elementWeak: 'ember', elementResist: ['poison'], elementImmune: [],
  },
  humanoid: {
    id: 'humanoid', name: 'Humanoid', order: 4,
    line: 'Goblins, trolls, ogres, giants. Armoured, drops gear, hits hard.',
    weaponWeak: 'sword', weaponResist: [],
    elementWeak: 'poison', elementResist: [], elementImmune: [],
  },
  human: {
    id: 'human', name: 'Human', order: 5,
    line: 'People — bandits and casters both. Glass, and they hit like a cart.',
    weaponWeak: 'ranged', weaponResist: ['magic'],
    elementWeak: 'poison', elementResist: [], elementImmune: [],
  },
  undead: {
    id: 'undead', name: 'Undead', order: 6,
    line: 'Bones and grief. Crush them; poison does nothing to the dead.',
    weaponWeak: 'hammer', weaponResist: [],
    elementWeak: 'ember', elementResist: ['frost'], elementImmune: ['poison'],
  },
  demon: {
    id: 'demon', name: 'Demon', order: 7,
    line: 'Things that came up. Magic-shy, and fire is their native language.',
    weaponWeak: 'magic', weaponResist: [],
    elementWeak: 'frost', elementResist: [], elementImmune: ['ember'],
  },
  dragon: {
    id: 'dragon', name: 'Dragon', order: 8,
    line: 'Wyrms, drakes, wyverns. Scaled against blades, open to a good shot.',
    weaponWeak: 'ranged', weaponResist: ['sword'],
    elementPerMonster: true,
    elementWeak: null, elementResist: [], elementImmune: [],
  },
  elemental: {
    id: 'elemental', name: 'Elemental', order: 9,
    line: 'It is the element. Immune to its own, ruined by its opposite.',
    weaponWeak: 'magic', weaponResist: ['sword'],
    elementPerMonster: true,
    elementWeak: null, elementResist: [], elementImmune: [],
  },
  construct: {
    id: 'construct', name: 'Construct', order: 10,
    line: 'Stone, clay, clockwork. No blood to spill, no lungs to poison.',
    weaponWeak: 'hammer', weaponResist: ['ranged'],
    elementWeak: 'frost', elementResist: ['ember'], elementImmune: ['poison'],
  },
  extradimensional: {
    id: 'extradimensional', name: 'Extra Dimensional', order: 11,
    line: 'Endgame only. Its element weakness is not printed until you have killed enough of it.',
    weaponWeak: 'sword', weaponResist: [],
    elementPerMonster: true, hiddenElement: true,
    elementWeak: null, elementResist: [], elementImmune: [],
  },
});

/** Stable render order — never sort by object key order. */
export const MONSTER_CLASS_ORDER = Object.freeze(
  Object.values(MONSTER_CLASSES).sort((a, b) => a.order - b.order).map((c) => c.id),
);

/* ── The progression curve, as a TABLE ────────────────────────────────────
   MEASURED from the 31 monsters that shipped before the 2026-08-16 roster
   wave — the min and max of every stat, per tier. To reproduce: import the
   MONSTERS module in Node (src/data is DOM-free by design), bucket every row
   by `tier`, and print min/max of hp/atk/def/xp/gp[0]/gp[1] per bucket. The
   pre-wave rows are the ones marked with a `dropBonus` or listed in
   `LEGACY_ART_IDS` in ./monster-art.js.
   (Written as prose, not as a runnable one-liner: `bump-version.sh` scans
   this directory for relative import specifiers missing a `?v=` and a code
   sample in a comment reads as an unversioned import to it. The guard is
   right to be blunt — better to reword than to carve out an exception.)

   These are the bands every new monster must land inside. This is not
   decoration: `auditRoster()` is asserted by the smoke suite, so a future
   content drop cannot silently invent a tier-4 monster with tier-6 numbers
   and flatten the pacing curve. If a band genuinely needs to move, move it
   HERE, once, with the reason. */
export const TIER_BANDS = Object.freeze({
  1: { hp: [8, 16],    atk: [2, 5],    def: [0, 2],   xp: [5, 14],     gpLo: [1, 3],     gpHi: [3, 9] },
  2: { hp: [24, 35],   atk: [7, 12],   def: [1, 4],   xp: [24, 55],    gpLo: [4, 10],    gpHi: [12, 25] },
  3: { hp: [52, 78],   atk: [14, 24],  def: [5, 12],  xp: [82, 135],   gpLo: [14, 24],   gpHi: [34, 60] },
  4: { hp: [100, 165], atk: [26, 40],  def: [13, 22], xp: [210, 340],  gpLo: [38, 60],   gpHi: [82, 140] },
  5: { hp: [190, 260], atk: [48, 72],  def: [22, 40], xp: [475, 680],  gpLo: [90, 145],  gpHi: [190, 310] },
  6: { hp: [340, 520], atk: [55, 105], def: [30, 62], xp: [800, 1250], gpLo: [200, 320], gpHi: [420, 700] },
});

export const TIERS = Object.freeze([1, 2, 3, 4, 5, 6]);

/** Design floor: every tier must offer targets from at least this many classes. */
export const MIN_CLASSES_PER_TIER = 8;

// ── Resolution ───────────────────────────────────────────────────────────

const arr = (v) => (Array.isArray(v) ? v.slice() : []);
/* PRESENCE, not truthiness. `elementWeak: null` is an explicit statement —
   "this monster has NO element weakness" (the Dryad, the Slime, the Ooze) —
   and must NOT fall through to the class default. Writing this as
   `m[k] != null` silently inherited Ember onto the Dryad and then flagged it
   as self-contradictory in the audit, which is how the bug was found. */
const has = (m, k) => Object.prototype.hasOwnProperty.call(m, k) && m[k] !== undefined;

/**
 * The effective combat profile of a monster: its class default, with the
 * monster's own single override folded in.
 *
 * This is THE reader. Nothing outside this module should reach for
 * `MONSTER_CLASSES[m.cls].weaponWeak` by hand — that is exactly how a class
 * table and the live behaviour drift apart.
 *
 * @param {object} mon a MONSTERS row
 */
export function resolveMonsterProfile(mon) {
  const m = mon || {};
  const c = MONSTER_CLASSES[m.cls] || null;
  if (!c) {
    // Fails OPEN rather than throwing: an unknown class must never break a
    // fight. It resolves to the monster's own literal fields, which is what
    // the pre-taxonomy engine did.
    return {
      cls: m.cls || null, className: m.family || 'Monster',
      weaponWeak: m.weaponWeak || null, weaponResist: arr(m.weaponResist),
      elementWeak: m.elementWeak || null, elementResist: arr(m.elementResist),
      elementImmune: arr(m.elementImmune), hiddenElement: false,
    };
  }
  return {
    cls: c.id,
    className: c.name,
    weaponWeak: has(m, 'weaponWeak') ? m.weaponWeak : c.weaponWeak,
    weaponResist: has(m, 'weaponResist') ? arr(m.weaponResist) : arr(c.weaponResist),
    elementWeak: has(m, 'elementWeak') ? m.elementWeak : c.elementWeak,
    elementResist: has(m, 'elementResist') ? arr(m.elementResist) : arr(c.elementResist),
    elementImmune: has(m, 'elementImmune') ? arr(m.elementImmune) : arr(c.elementImmune),
    hiddenElement: !!c.hiddenElement,
  };
}

const sameSet = (a, b) => {
  const A = arr(a).sort(); const B = arr(b).sort();
  return A.length === B.length && A.every((v, i) => v === B[i]);
};

/**
 * Which axes this monster diverges from its class on: [] | ['weapon'] |
 * ['element'] | ['weapon','element'] (the last is a design error).
 *
 * For a class with `elementPerMonster`, declaring an element is REQUIRED and
 * is never counted as an override — the class has no default to override.
 */
export function overrideAxisOf(mon) {
  const m = mon || {};
  /* A SEALED row (see applyClassProfiles) has already had its class defaults
     written onto it, so the authored/inherited distinction is no longer
     visible in the fields — it is recorded here instead. */
  if (Array.isArray(m.overrideAxes)) return m.overrideAxes.slice();
  const c = MONSTER_CLASSES[m.cls];
  if (!c) return [];
  const out = [];
  if ((has(m, 'weaponWeak') && m.weaponWeak !== c.weaponWeak)
    || (has(m, 'weaponResist') && !sameSet(m.weaponResist, c.weaponResist))) out.push('weapon');
  if (!c.elementPerMonster) {
    if ((has(m, 'elementWeak') && m.elementWeak !== c.elementWeak)
      || (has(m, 'elementResist') && !sameSet(m.elementResist, c.elementResist))
      || (has(m, 'elementImmune') && !sameSet(m.elementImmune, c.elementImmune))) out.push('element');
  }
  return out;
}

/**
 * SEAL a roster: write each row's resolved profile onto the row itself, and
 * record which axes it overrode.
 *
 * WHY MATERIALISE RATHER THAN RESOLVE AT READ TIME
 *   Twelve live consumers read `monster.weaponWeak` as a plain field —
 *   `core/combat.js weaknessInfo`, `core/bounty.js`, `combat-render.js`,
 *   `boss-of-the-day.js`, the legacy monster panels — and two of them are
 *   shared with the hr-accrue Edge Function. Making inheritance visible only
 *   through a resolver would mean touching every one of them and would leave
 *   a permanent trap: any NEW reader that forgets the resolver silently sees
 *   `undefined` and quietly disables the weakness. Sealing means the class
 *   table stays the single authoring point while the row stays a plain,
 *   fully-specified object. Adding a monster is still `cls:'undead'` and
 *   nothing else.
 *
 * IDEMPOTENT and PURE (no clock, no rng, no DOM), so the client and the
 * vendored server copy seal to byte-identical rows.
 */
export function applyClassProfiles(MONSTERS) {
  Object.keys(MONSTERS || {}).forEach((id) => {
    const m = MONSTERS[id];
    if (!m || typeof m !== 'object' || !MONSTER_CLASSES[m.cls]) return;
    const axes = Array.isArray(m.overrideAxes) ? m.overrideAxes : overrideAxisOf(m);
    const p = resolveMonsterProfile(m);
    m.overrideAxes = axes;
    m.className = p.className;
    m.weaponWeak = p.weaponWeak;
    m.weaponResist = p.weaponResist;
    m.elementWeak = p.elementWeak;
    m.elementResist = p.elementResist;
    m.elementImmune = p.elementImmune;
    m.hiddenElement = p.hiddenElement;
  });
  return MONSTERS;
}

/** True when `n` is inside the tier band for `stat`. */
export function inBand(tier, stat, n) {
  const b = TIER_BANDS[tier];
  if (!b || !b[stat]) return false;
  return Number(n) >= b[stat][0] && Number(n) <= b[stat][1];
}

/**
 * Validate a whole roster against the taxonomy. Returns human-readable
 * problems; empty means healthy. Asserted by the smoke suite in the browser
 * AND by `tests/run-smoke.mjs` in Node, so a bad data drop cannot reach a
 * browser at all.
 */
export function auditRoster(MONSTERS) {
  const problems = [];
  const ids = Object.keys(MONSTERS || {});
  ids.forEach((id) => {
    const m = MONSTERS[id];
    if (!m || typeof m !== 'object') { problems.push(id + ': not an object'); return; }
    if (!m.cls) { problems.push(id + ': no `cls`'); return; }
    if (!MONSTER_CLASSES[m.cls]) { problems.push(id + ': unknown class "' + m.cls + '"'); return; }

    const p = resolveMonsterProfile(m);
    if (WEAPON_AXES.indexOf(p.weaponWeak) < 0) {
      problems.push(id + ': weaponWeak "' + p.weaponWeak + '" is not a weapon axis (neutral is retired)');
    }
    if (p.elementWeak != null && ELEMENTS.indexOf(p.elementWeak) < 0) {
      problems.push(id + ': elementWeak "' + p.elementWeak + '" is not an element');
    }
    if (MONSTER_CLASSES[m.cls].elementPerMonster
      && p.elementWeak == null && !p.elementImmune.length && !p.elementResist.length) {
      problems.push(id + ': class ' + m.cls + ' requires a per-monster element profile');
    }
    // A weakness that is also an immunity/resistance is unfightable nonsense.
    if (p.elementWeak
      && (p.elementImmune.indexOf(p.elementWeak) >= 0 || p.elementResist.indexOf(p.elementWeak) >= 0)) {
      problems.push(id + ': elementWeak "' + p.elementWeak + '" is also resisted/immune');
    }
    if (p.weaponResist.indexOf(p.weaponWeak) >= 0) {
      problems.push(id + ': weaponWeak "' + p.weaponWeak + '" is also resisted');
    }
    const ov = overrideAxisOf(m);
    if (ov.length > 1) problems.push(id + ': TWO overrides (' + ov.join(' + ') + ') — the rule is at most one');

    // Tier band — the pacing curve.
    if (!TIER_BANDS[m.tier]) { problems.push(id + ': tier ' + m.tier + ' has no band'); return; }
    ['hp', 'atk', 'def', 'xp'].forEach((k) => {
      if (!inBand(m.tier, k, m[k])) {
        problems.push(id + ': T' + m.tier + ' ' + k + '=' + m[k] + ' outside band ['
          + TIER_BANDS[m.tier][k].join(',') + ']');
      }
    });
    if (!Array.isArray(m.gp) || m.gp.length !== 2 || m.gp[0] > m.gp[1]) {
      problems.push(id + ': gp must be [lo,hi] with lo<=hi');
    } else {
      if (!inBand(m.tier, 'gpLo', m.gp[0])) problems.push(id + ': T' + m.tier + ' gp lo=' + m.gp[0] + ' outside band');
      if (!inBand(m.tier, 'gpHi', m.gp[1])) problems.push(id + ': T' + m.tier + ' gp hi=' + m.gp[1] + ' outside band');
    }
  });

  MONSTER_CLASS_ORDER.forEach((cid) => {
    if (!ids.some((id) => MONSTERS[id].cls === cid)) problems.push('class ' + cid + ' has no monsters');
  });
  TIERS.forEach((t) => {
    const classes = new Set(ids.filter((id) => MONSTERS[id].tier === t).map((id) => MONSTERS[id].cls));
    if (classes.size < MIN_CLASSES_PER_TIER) {
      problems.push('tier ' + t + ' draws from only ' + classes.size + ' classes (floor is ' + MIN_CLASSES_PER_TIER + ')');
    }
  });

  // No style is ever "the wrong build": every weapon axis is some class's answer.
  const dist = {};
  MONSTER_CLASS_ORDER.forEach((cid) => {
    const w = MONSTER_CLASSES[cid].weaponWeak; dist[w] = (dist[w] || 0) + 1;
  });
  WEAPON_AXES.forEach((w) => { if (!dist[w]) problems.push('no class is weak to ' + w); });

  return problems;
}
