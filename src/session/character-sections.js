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
//                     xp: { perks, buffs, combat } }
//   outfit          { worn: id | null, colors: { region: dye index }, owned: [id] }
//   death_log       [{ id, at, hunt, session, monster, xp, xp_lost, saved }] newest first;
//                   saved = what a Blessing kept, null when none was used
//                   (2026-11-07-death-popup-blessing.sql)
//   state.level_xp  the character's Level XP (kills only, CORE_MODEL.md §1): the Level and
//                   its progress are read off it on the shared curve (src/core/xp.js, the
//                   curve hr_char_level uses), never counted in the browser.
// ════════════════════════════════════════════════════════════════════════
import { charLevelFromXp, charXpForLevel } from '../core/xp.js?v=0.2.24';

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
    role: id(c.role), weaponType: id(c.weapon_type),
    maxMana: nat(c.max_mana), moveSpeed: nat(c.move_speed),
    damage: nat(d.min) !== null && nat(d.max) !== null ? { min: d.min, max: d.max } : null,
    accuracyPct: num(c.accuracy_pct), critPct: num(c.crit_pct), defence: int(c.defence), regenPct: num(c.regen_pct),
    xp: { perks: num(x.perks), buffs: num(x.buffs), combat: num(x.combat) },
  };
}

/** `character_sheet`, or null. `combat` is null until the engine's sheet is fresh. */
export function characterSheetOf(cs) {
  const s = read(cs, 'character_sheet');
  if (!isObj(s)) return null;
  const b = isObj(s.bestiary) ? s.bestiary : null;
  return {
    level: nat(s.level), maxHp: nat(s.max_hp), maxMana: nat(s.max_mana),
    bestiary: b && nat(b.slain) !== null && nat(b.total) ? { slain: b.slain, total: b.total } : null,
    fresh: s.fresh === true,
    combat: s.fresh === true ? combatOf(s.combat) : null,
  };
}

/** The Level, from the server's `state.level_xp`: { xp, level, into, need } (need = XP across this Level), or null. */
export function levelOf(cs) {
  const st = read(cs, 'state');
  const xp = isObj(st) ? nat(st.level_xp) : null;
  if (xp === null) return null;
  const level = charLevelFromXp(xp);
  const lo = charXpForLevel(level);
  return { xp, level, into: xp - lo, need: charXpForLevel(level + 1) - lo };
}

/**
 * The vitals strip OUT OF A HUNT (in town, or after a hunt ended): HP from `state.hp`, max HP and
 * max mana from the server's `vitals`, and mana FULL (mana lives only inside a hunt instance; out of
 * one there is nothing spending it). { hp, hpMax, mana, manaMax, level, xpPct }, or null.
 */
export function townVitalsOf(cs) {
  const st = read(cs, 'state');
  const v = read(cs, 'vitals');
  if (!isObj(st) || !isObj(v) || nat(v.max_hp) === null) return null;
  const lv = levelOf(cs);
  return { hp: nat(st.hp), hpMax: v.max_hp, mana: nat(v.max_mana), manaMax: nat(v.max_mana), level: nat(v.level),
    xpPct: lv && lv.need > 0 ? Math.max(0, Math.min(1, lv.into / lv.need)) : null };
}

/** `outfit`: { worn, colors, owned: Set }, or null. */
export function outfitOf(cs) {
  const o = read(cs, 'outfit');
  if (!isObj(o)) return null;
  const colors = {};
  if (isObj(o.colors)) for (const [k, v] of Object.entries(o.colors)) if (/^[a-z]{1,16}$/.test(k) && nat(v) !== null) colors[k] = v;
  return { worn: id(o.worn), colors, owned: new Set(Array.isArray(o.owned) ? o.owned.map(id).filter(Boolean) : []) };
}

const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/* An XP map { level|skill: xp }: positive whole numbers only. */
const xpMap = (o) => {
  const out = {};
  if (isObj(o)) for (const [k, v] of Object.entries(o)) if (/^[a-z_]{1,32}$/.test(k) && nat(v)) out[k] = v;
  return out;
};

/** `death_log`: [{ id, atMs, hunt, session, monster, xp, xpLost, saved }] newest first, or null.
 *  saved: the XP a Blessing kept ({} = it kept nothing), null when no Blessing was used. All the server's. */
export function deathLogOf(cs) {
  const d = read(cs, 'death_log');
  if (!Array.isArray(d)) return null;
  const out = [];
  for (const r of d.slice(0, 50)) {
    if (!isObj(r) || nat(r.id) === null) continue;
    const at = typeof r.at === 'string' ? Date.parse(r.at) : NaN;
    if (!Number.isFinite(at)) continue;
    out.push({ id: r.id, atMs: at, hunt: id(r.hunt), session: typeof r.session === 'string' && SESSION.test(r.session) ? r.session : null,
      monster: id(r.monster), xp: nat(r.xp), xpLost: xpMap(r.xp_lost), saved: isObj(r.saved) ? xpMap(r.saved) : null });
  }
  return out;
}
