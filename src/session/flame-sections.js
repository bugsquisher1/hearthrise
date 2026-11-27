// ════════════════════════════════════════════════════════════════════════
// src/session/flame-sections.js — THE ACCOUNT'S INNER FLAME, AS THE SERVER SENDS IT (the `flame` section, 1063-flame-temper.sql
//   hr_flame_view, restated by 1074-inner-flame-luck.sql with `hunts`; 21-flame-temper-imbue-loot.md section 1.5).
//
//   flameOf(cs)             { level, height, room, luckPm, hunts } or null (no section: the inner_flame switch is off, so nothing shows)
//   flameHuntOf(cs, sid)    { luckPm, units } for hunt session `sid`: the luck that hunt rolled its Rares at (frozen when it began) and the
//                           Remains its settles burned (the return card's line), or null
// A read of the envelope only, REPLACED by each envelope (CLAUDE.md §6). Nothing here computes a number.
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const whole = (n) => Number.isSafeInteger(n) && n >= 0;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The section, or null (no section yet, or the switch is off). */
export function flameOf(cs) {
  const raw = cs && typeof cs.read === 'function' ? cs.read('flame') : undefined;
  if (!isObj(raw) || !whole(raw.level) || !whole(raw.height)) return null;
  const hunts = Array.isArray(raw.hunts) ? raw.hunts.filter((h) => isObj(h) && typeof h.session === 'string' && ID.test(h.session) && whole(h.luck_pm) && whole(h.units))
    .map((h) => Object.freeze({ session: h.session, slot: Number.isInteger(h.slot) ? h.slot : null, luckPm: h.luck_pm, units: h.units })) : [];
  return Object.freeze({ level: raw.level, height: raw.height, room: whole(raw.room) ? raw.room : null, luckPm: whole(raw.luck_pm) ? raw.luck_pm : 0,
    hunts: Object.freeze(hunts) });
}

/** What hunt session `sid` rolled at and burned, as the server holds it, or null (the switch is off, or the section does not list it). */
export function flameHuntOf(cs, sid) {
  const f = flameOf(cs);
  if (!f || typeof sid !== 'string') return null;
  const h = f.hunts.find((x) => x.session === sid);
  return h ? Object.freeze({ luckPm: h.luckPm, units: h.units }) : null;
}
