// ════════════════════════════════════════════════════════════════════════
// src/session/character-sections.js — THE CHARACTER WINDOW'S SECTIONS, READ SAFELY.
//
// PURE. Like item-sections.js: reads the record a CharacterSession holds and
// answers each section in the shape the Character window draws, or null when
// the server did not send it. Null means "show nothing", never a default, and
// a number the server did not send is never invented (CLAUDE.md §6).
//
// What 2026-10-27-core-bodies.sql projects (hr_state_sections rows):
//   character_sheet { level, max_hp, max_mana, bestiary: { slain, total }, fresh,
//                     combat: <the engine's sheet while fresh, else null>, computed_at }
//     combat        { role, weapon_type, level, max_hp, max_mana, regen_pct, move_speed,
//                     damage: { min, max }, accuracy_pct, crit_pct, defence, set,
//                     dodge_pct, absorb_pct, ward (the armour's mitigation, ruling K7),
//                     xp: { perks, buffs, combat } }
//   outfit          { worn: id | null, base: { head, body, legs, feet } dye indices | {}, owned: [id] }
//   death_log       [{ id, at, hunt, session, monster, xp, xp_lost, saved }] newest first;
//                   saved = what a Blessing kept, null when none was used
//                   (2026-11-07-death-popup-blessing.sql)
//   titles          { worn, rows: [{ id, words, price, kills, have, held, worn }] } (2027-02-28-titles.sql)
//   level           { xp, level, into, need } (hr_state_of's `level` key, hr_level_block): the
//                   character's Level XP (kills only, CORE_MODEL.md §1), the Level the SERVER's
//                   curve makes of it (hr_char_level), the XP into that Level and the XP across
//                   it. The browser reads all four and works out none: its own copy of the curve
//                   (src/core/xp.js, which the live prediction runs) can be a release behind the
//                   server's, and on 2026-11-10 it said Level 20 for a hero the server fought as 19.
// ════════════════════════════════════════════════════════════════════════
import { huntOf, liveHpOf } from './hunt-sections.js?v=0.2.122';
import { TITLE_WORDS } from '../data/titles.js?v=0.2.122';
import { dyeKeyOf } from '../data/outfits.js?v=0.2.122';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z0-9_]{1,64}$/;
const int = (v) => (Number.isSafeInteger(v) ? v : null);
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const id = (v) => (typeof v === 'string' && ID.test(v) ? v : null);

function read(cs, key) {
  return cs && typeof cs.read === 'function' ? cs.read(key) : undefined;
}

/* The engine's sheet: every field null unless the server sent a number for it. */
function combatOf(c) {
  if (!isObj(c)) return null;
  const d = isObj(c.damage) ? c.damage : {};
  const x = isObj(c.xp) ? c.xp : {};
  return {
    role: id(c.role), weaponType: id(c.weapon_type), moveSpeed: nat(c.move_speed),
    damage: nat(d.min) !== null && nat(d.max) !== null ? { min: d.min, max: d.max } : null,
    accuracyPct: num(c.accuracy_pct), critPct: num(c.crit_pct), defence: int(c.defence), regenPct: num(c.regen_pct),
    dodgePct: num(c.dodge_pct), absorbPct: num(c.absorb_pct), ward: nat(c.ward), steadyPct: num(c.steady_pct),
    xp: { perks: num(x.perks), buffs: num(x.buffs), combat: num(x.combat) },
  };
}

/** `character_sheet`, or null. `combat` is null until the engine's sheet is fresh. Its Level and max HP
    are NOT read: those come from heroVitalsOf, the one reader the HUD shares (r09). */
export function characterSheetOf(cs) {
  const s = read(cs, 'character_sheet');
  if (!isObj(s)) return null;
  const b = isObj(s.bestiary) ? s.bestiary : null;
  return {
    bestiary: b && nat(b.slain) !== null && nat(b.total) ? { slain: b.slain, total: b.total } : null,
    fresh: s.fresh === true,
    combat: s.fresh === true ? combatOf(s.combat) : null,
  };
}

/** The server says this account is the Game Master (2027-03-13-gm-tools.sql's `gm` section). Fails safe to false. */
export function gmOf(cs) { return read(cs, 'gm') === true; }
/** `titles` (2027-02-28-titles.sql): every title with the server's price, the kills it takes and this hero's own count, or null. A row with words the client refuses is not drawn. */
export function titlesOf(cs) {
  const t = read(cs, 'titles');
  if (!isObj(t) || !Array.isArray(t.rows)) return null;
  const rows = [];
  for (const r of t.rows.slice(0, 500)) {
    if (!isObj(r) || !id(r.id) || typeof r.words !== 'string' || !TITLE_WORDS.test(r.words) || nat(r.price) === null || nat(r.kills) === null || nat(r.have) === null) continue;
    rows.push({ id: r.id, words: r.words, price: r.price, kills: r.kills, have: r.have, held: r.held === true, worn: r.worn === true });
  }
  return { rows };
}

/** The words of the title this hero wears ("the Wolfer"), or null. */
export function wornTitleOf(cs) {
  const t = titlesOf(cs);
  const r = t && t.rows.find((x) => x.worn);
  return r ? r.words : null;
}

/**
 * The Level as the SERVER says it: the envelope's `level` block, { xp, level, into, need } (into = XP into this
 * Level, need = XP across it), or null when the server did not send a whole one. Never worked out here from
 * `state.level_xp`: a Level the browser derives is this build's curve, not the server's (see the header), and
 * every gate, price and plate that reads a Level reads this one. tests/session-core.mjs LVL-0 .. LVL-4 hold it.
 */
export function levelOf(cs) {
  const b = read(cs, 'level');
  if (!isObj(b)) return null;
  const xp = nat(b.xp), level = nat(b.level), into = nat(b.into), need = nat(b.need);
  if (xp === null || !level || into === null || !need) return null;
  return { xp, level, into, need };
}

/**
 * THE HERO'S NUMBERS (r09: the Character tab said Level 4 while the HUD said 11). The ONE reader of
 * Level, its progress, HP, max HP, mana and max mana: the HUD's vitals hub, the Character tab, the
 * character strip, the command centre and the party panel's own seat all draw these from here, so
 * two places can never show two numbers. Each comes from ONE server field, never a second derivation:
 *   level, into, need, xpPct   the envelope's `level` block (levelOf): the server's Level and its
 *                              own two XP marks. Every envelope carries it, a pushed frame too (a
 *                              frame is the whole character, envelope.js E2).
 *   hp, hpMax, mana, manaMax   IN A HUNT the hunt hero's (HP as the live timeline plays it: the bar
 *                              over its head; the engine raises max HP at a Level-up mid-hunt);
 *                              OUT OF ONE `state.hp` / `state.max_hp`, then max mana from `vitals`
 *                              with mana FULL (mana lives only inside a hunt instance).
 * A number the server did not send is null, never a default. Pure.
 */
export function heroVitalsOf(cs) {
  const lv = levelOf(cs);
  const out = { hunting: false, level: lv ? lv.level : null, into: lv ? lv.into : null, need: lv ? lv.need : null,
    xpPct: lv && lv.need > 0 ? Math.max(0, Math.min(1, lv.into / lv.need)) : null,
    hp: null, hpMax: null, mana: null, manaMax: null };
  const h = huntOf(cs);
  const hero = h && !h.ended ? h.hero : null;
  if (hero) {
    const live = liveHpOf(cs, hero.unit, hero.hpMax);
    /* Until the first settle builds the instance's world the server sends the hero's max mana (hr_vitals_of) but
       no `mana`: a new instance's hero starts FULL (src/core/hunt-spawn.js), so the pool reads full, never "–"
       for the hunt's first ~10 s (Fingerguns + Pellow 10-25). The next envelope with the world replaces it. */
    return Object.assign(out, { hunting: true, hp: live ? live.hp : hero.hp, hpMax: live ? live.maxHp : hero.hpMax,
      mana: hero.mana !== null ? hero.mana : hero.manaMax, manaMax: hero.manaMax });
  }
  const st = read(cs, 'state');
  const v = read(cs, 'vitals');
  const hpMax = isObj(st) && nat(st.max_hp) !== null ? st.max_hp : isObj(v) ? nat(v.max_hp) : null;
  const hp = isObj(st) ? nat(st.hp) : null;
  const manaMax = isObj(v) ? nat(v.max_mana) : null;
  return Object.assign(out, { hp, hpMax, mana: manaMax, manaMax });
}

/* The section as read, per section the server sent: a hero's look asks every frame, and a new envelope is a new object. */
const OUTFIT_READ = new WeakMap();
/** `outfit`: { worn, base (the hero's four colors, dye indices, or null), owned: Set }, or null. */
export function outfitOf(cs) {
  const o = read(cs, 'outfit');
  if (!isObj(o)) return null;
  let r = OUTFIT_READ.get(o);
  if (!r) {
    const base = dyeKeyOf(o.base) ? { head: o.base.head, body: o.base.body, legs: o.base.legs, feet: o.base.feet } : null;
    r = { worn: id(o.worn), base, owned: new Set(Array.isArray(o.owned) ? o.owned.map(id).filter(Boolean) : []) };
    OUTFIT_READ.set(o, r);
  }
  return r;
}

const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/* An XP map { level|skill: xp }: positive whole numbers only. */
const xpMap = (o) => {
  const out = {};
  if (isObj(o)) for (const [k, v] of Object.entries(o)) if (/^[a-z_]{1,32}$/.test(k) && nat(v)) out[k] = v;
  return out;
};

/** `death_log`: [{ id, atMs, hunt, session, monster, xp, xpLost, saved, blessings, levelFrom, levelTo }] newest first, or null.
 *  saved: the XP a Blessing kept ({} = it kept nothing), null when no Blessing was used, undefined when the
 *  server did not say (a row from before 2026-11-07-death-popup-blessing.sql). blessings: how many the death used up, or null.
 *  levelFrom / levelTo: the hero's Level before and after the death's debit (a death can take a Level since
 *  2027-03-25-death-share.sql), both null on an older row. All the server's. */
export function deathLogOf(cs) {
  const d = read(cs, 'death_log');
  if (!Array.isArray(d)) return null;
  const out = [];
  for (const r of d.slice(0, 50)) {
    if (!isObj(r) || nat(r.id) === null) continue;
    const at = typeof r.at === 'string' ? Date.parse(r.at) : NaN;
    if (!Number.isFinite(at)) continue;
    const from = nat(r.level_from), to = nat(r.level_to);
    const pair = from !== null && to !== null && from >= 1 && to >= 1 && to <= from;
    out.push({ id: r.id, atMs: at, hunt: id(r.hunt), session: typeof r.session === 'string' && SESSION.test(r.session) ? r.session : null,
      monster: id(r.monster), xp: nat(r.xp), xpLost: xpMap(r.xp_lost),
      saved: !('saved' in r) ? undefined : isObj(r.saved) ? xpMap(r.saved) : null,
      blessings: nat(r.blessings) !== null && r.blessings > 0 ? r.blessings : null,
      levelFrom: pair ? from : null, levelTo: pair ? to : null });
  }
  return out;
}
