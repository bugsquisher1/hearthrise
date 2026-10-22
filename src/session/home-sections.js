// ════════════════════════════════════════════════════════════════════════
// src/session/home-sections.js — THE ACCOUNT'S HOUSE, READ SAFELY.
//
// PURE. Like item-sections.js: it only READS the record a CharacterSession
// holds and answers in the shape the House window draws, or null when the
// server did not send the section (the window then shows nothing it could act
// on). One home per account (Tyler 2026-10-15), so every character reads the
// same two sections:
//   home   (2026-11-21-house-home.sql, hr_home_view)
//     { tier, tiers: [{ offer, name, tier, gold, items, need, owned }],
//       rooms: [{ room, name, level, rungs, opens, rung_name,
//                 next: { offer, name, rung, gold, items, need, item } | null }] }
//   depot  (2026-11-10-storage-chests.sql, hr_depot_view)
//     { used, cap, tier, chests: [{ chest, name, stacks, tier, gold, items, built }],
//       next: { chest, ..., can_build, why } | null }
// Every price, level and gate here is the server's; nothing is filled in.
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z0-9_]{1,64}$/;
const OFFER = /^[a-z0-9_]{1,40}(?:\.[a-z0-9_]{1,40}){1,3}$/;
const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const str = (v, max = 64) => (typeof v === 'string' && v.trim().length && v.length <= max ? v.trim() : null);

function read(cs, key) {
  return cs && typeof cs.read === 'function' ? cs.read(key) : undefined;
}

/* A cost's materials { item: qty }, the bad lines dropped; null when the shape is not a map. */
function itemsOf(v) {
  if (!isObj(v)) return null;
  const out = [];
  for (const [id, n] of Object.entries(v).slice(0, 16)) if (ID.test(id) && count(n) && n > 0) out.push({ id, qty: n });
  return out;
}

/* One priced step (a tier, a rung, a chest): its gold and materials, or null when either is unreadable. */
function priced(o) {
  const items = itemsOf(o.items);
  return count(o.gold) && items ? { gold: o.gold, items } : null;
}

/** `home`: the account's house, or null (the window then offers nothing). */
export function homeOf(cs) {
  const h = read(cs, 'home');
  if (!isObj(h) || count(h.tier) === null || !Array.isArray(h.tiers) || !Array.isArray(h.rooms)) return null;
  const tiers = [];
  for (const t of h.tiers.slice(0, 16)) {
    const p = isObj(t) && OFFER.test(String(t.offer)) && str(t.name, 60) && count(t.tier) && count(t.need) !== null ? priced(t) : null;
    if (p) tiers.push({ offer: t.offer, name: t.name.trim(), tier: t.tier, need: t.need, owned: t.owned === true, ...p });
  }
  tiers.sort((a, b) => a.tier - b.tier);
  const rooms = [];
  for (const r of h.rooms.slice(0, 32)) {
    if (!isObj(r) || !ID.test(String(r.room)) || !str(r.name, 40) || count(r.level) === null || !count(r.rungs) || count(r.opens) === null) continue;
    const n = r.next;
    const next = isObj(n) && OFFER.test(String(n.offer)) && count(n.rung) && count(n.need) !== null && priced(n)
      ? { offer: n.offer, name: str(n.name, 60), rung: n.rung, need: n.need, item: ID.test(String(n.item)) ? n.item : null, ...priced(n) } : null;
    rooms.push({ room: r.room, name: r.name.trim(), level: r.level, rungs: r.rungs, opens: r.opens, rungName: str(r.rung_name, 60), next });
  }
  return { tier: h.tier, tiers, rooms };
}

/** `depot`'s chest ladder: { used, cap, chests: [{ chest, name, stacks, tier, built, gold, items }], next }, or null. */
export function chestsOf(cs) {
  const d = read(cs, 'depot');
  if (!isObj(d) || count(d.used) === null || !count(d.cap) || !Array.isArray(d.chests)) return null;
  const chests = [];
  for (const c of d.chests.slice(0, 16)) {
    const p = isObj(c) && ID.test(String(c.chest)) && str(c.name, 40) && count(c.stacks) && count(c.tier) !== null ? priced(c) : null;
    if (p) chests.push({ chest: c.chest, name: c.name.trim(), stacks: c.stacks, tier: c.tier, built: c.built === true, ...p });
  }
  const n = isObj(d.next) && ID.test(String(d.next.chest)) ? chests.find((c) => c.chest === d.next.chest) || null : null;
  return { used: d.used, cap: d.cap, chests, next: n ? { ...n, canBuild: d.next.can_build === true } : null };
}
