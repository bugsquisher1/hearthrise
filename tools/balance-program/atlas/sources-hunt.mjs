// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/atlas/sources-hunt.mjs — EVERY WAY A HUNTED HOUR TURNS INTO AN ITEM, read from the rows (50-standards 10.1).
//
//   huntSources(D) -> { sources: [row...], modifiers: [row...] }
//
// A SOURCE ROW (shared with sources-town.mjs; the atlas prices it in atlas/cost.mjs):
//   sid      a stable id: <kind>:<where>:<item>
//   kind     one of standards.mjs SOURCE_KINDS
//   system   its tools/balance-program/systems.mjs id (the verdict's unit)
//   item, qty   what one success gives
//   state    OPEN (a player can walk through it today), STAGED (built and hidden), PLANNED (ruled or designed, no rows to price)
//   opens    the Level it opens at; label: READ FROM DATA | MEASURED (a rate under it) | CITED | PROJECTED
//   hunt     { ground, perKill { monster: chance }, luck (a Rare or Trophy row: Luck reaches it) }  -> a drop's hours from atlas/rates.mjs
//   fight    { ground, of, hours (stamina a fight), perFight (chance), wins (wins on the ground before a call) }      a Call out
//   hall     { ground, key, slice, firstShare, perDay }                                                          a keyed hall's daily prize
//   chest    { family, key, keyFrom, pPm, share, opensPerWeek, climbHoursAWeek }                                  the Hearth Chest
//   task     { ground, monster, count, perDay }                                                                     Tamsin's tallies
//
// Modifiers are not sources: they move the rate of every Rare row (the Bestiary's stages, the Luck bar) or an hour's XP (events).
// PURE. Every number is a data row's; CITED numbers name their file.
// ════════════════════════════════════════════════════════════════════════

/* The Tower's climb: "half an hour a hero a week" for the six opens (CITED docs/design/balance-program/22-endgame.md section 2, MEASURED
   there: 9 to 17 keys a hero a climb). Keys never bind past the first week: the six opens do. */
export const CLIMB_HOURS_A_WEEK = 0.5;
const CLIMB_LABEL = 'CITED 22-endgame.md 2: a climb a week mints 9 to 17 keys a hero';
/* The Luck bar (Tyler 2026-11-20, Luck v3.1: "+16% at 500 h, +39% at 5,000 h", far stop +100%). RULED, NOT BUILT: PROJECTED. */
export const LUCK_RULED = Object.freeze({ points: [[500, 0.16], [5000, 0.39]], cap: 1.0, label: 'PROJECTED: Luck v3.1 ruled 2026-11-20, not built' });
export function luckAt(hours) {
  if (!(hours > 0)) return 0;
  const [[h0, l0], [h1, l1]] = LUCK_RULED.points;
  return Math.max(0, Math.min(LUCK_RULED.cap, l0 + (l1 - l0) * Math.log10(hours / h0) / Math.log10(h1 / h0)));
}

const placed = (g) => [...new Set((g.pockets || []).flatMap((p) => [...(p.pack || []), ...(p.spawns || []), ...(p.adds || [])].map((s) => s.monster)))];

function systemOfRow(D, d, ground) {
  if (d.band === 'key') return 'bosses-halls';
  if (d.band === 'trophy') return 'trophies';
  if (d.lucky) return 'lucky-finds';
  if (d.salvage) return 'salvage';
  const it = D.ITEMS[d.id] || {};
  if ((Number(it.tier) || 0) >= 8 || it.unique === true) return 'uniques';
  return ground && !D.OPEN_GROUNDS[ground] ? 'grounds-staged' : 'loot';
}

export function huntSources(D) {
  const out = [];
  const mods = [];
  /* MONSTER DROPS, a row a (ground, item): every monster of the ground that carries the item */
  for (const [gid, g] of Object.entries(D.HUNT_GROUNDS)) {
    const h = D.HUNT_INDEX[gid];
    if (!h || !Array.isArray(h.band)) continue;
    const open = !!D.OPEN_GROUNDS[gid];
    const by = new Map();
    for (const m of placed(g)) for (const d of (D.MONSTERS[m] && D.MONSTERS[m].drops) || []) {
      if (!d || !d.id || !(d.ch > 0)) continue;
      const k = by.get(d.id) || { perKill: {}, luck: false, bands: new Set(), sys: new Set() };
      k.perKill[m] = (k.perKill[m] || 0) + Math.min(1, d.ch);
      if (D.REVEAL_BANDS.includes(d.band)) k.luck = true;
      k.bands.add(d.band || 'unbanded'); k.sys.add(systemOfRow(D, d, gid));
      by.set(d.id, k);
    }
    for (const [item, k] of by) {
      const sys = [...k.sys];
      out.push({ sid: 'drop:' + gid + ':' + item, kind: 'drop', system: sys.length === 1 ? sys[0] : sys.find((s) => s !== 'loot') || 'loot', item, qty: 1,
        state: open ? 'OPEN' : 'STAGED', opens: Math.max(1, h.band[0]), band: h.band, label: 'MEASURED rate x READ FROM DATA chance', where: gid,
        chance: true, hunt: { ground: gid, perKill: k.perKill, luck: k.luck }, bands: [...k.bands] });
    }
    /* A SCALED HOUR on the same ground past its top (src/data/scaled-hunts.js): its rows at the scaled loot rate, for gold an hour */
    if (D.SCALABLE_GROUNDS[gid] && open) {
      for (const [item, k] of by) {
        out.push({ sid: 'scaled:' + gid + ':' + item, kind: 'drop', system: 'scaled-hunts', item, qty: 1, state: 'OPEN',
          opens: D.SCALABLE_GROUNDS[gid].top + 1, band: h.band, where: gid + ' (scaled)', chance: true,
          label: 'ASSUMED kills an hour of the band top; loot and price READ FROM DATA (lootPmFor, pricePerHour)',
          hunt: { ground: gid, perKill: k.perKill, luck: k.luck, scaled: true } });
      }
    }
  }
  /* CALL OUT (src/data/boss-calls.js): a fight costs stamina only; a win rolls the called row's table, his call-only piece on it */
  for (const c of Object.values(D.BOSS_CALLS)) {
    const row = D.MONSTERS[c.monster];
    if (!row) continue;
    const open = !!D.OPEN_GROUNDS[c.from];
    const h = D.HUNT_INDEX[c.from] || { band: [1, 1] };
    for (const d of row.drops || []) {
      if (!d || !d.id || !(d.ch > 0)) continue;
      out.push({ sid: 'call:' + c.id + ':' + d.id, kind: 'boss', system: 'boss-calls', item: d.id, qty: 1, state: open ? 'OPEN' : 'STAGED',
        opens: Math.max(1, h.band[0]), where: c.hunt, chance: d.ch < 1, label: 'READ FROM DATA; a win is ASSUMED (no fight is played)',
        fight: { ground: c.from, of: c.of, hours: (c.fight.staminaMs || 0) / 3600000, perFight: Math.min(1, d.ch), wins: D.BOSS_CALL_RULES.winsToCall || 0,
          luck: D.REVEAL_BANDS.includes(d.band) } });
    }
  }
  /* A KEYED HALL'S DAILY PRIZE (src/data/boss-halls.js, hunt-rewards.js payPrize): one roll a hero a day, the first ever a sure one */
  for (const hall of Object.values(D.BOSS_HALLS)) {
    const g = D.HALL_GROUNDS[hall.hunt];
    const boss = g && g.pockets && g.pockets[0] && g.pockets[0].spawns && g.pockets[0].spawns[0] && g.pockets[0].spawns[0].monster;
    const row = boss && D.MONSTERS[boss];
    if (!row) continue;
    const open = !!D.OPEN_BOSS_HALLS[hall.id];
    const firstSum = (row.drops || []).filter((d) => d.first === true).reduce((s, d) => s + d.ch, 0);
    const h = D.HUNT_INDEX[hall.hunt] || D.HUNT_INDEX[hall.id] || { band: [1, 1] };
    for (const d of row.drops || []) {
      if (!d || !d.id || !(d.ch > 0)) continue;
      out.push({ sid: 'hall:' + hall.id + ':' + d.id, kind: 'boss', system: 'bosses-halls', item: d.id, qty: 1, state: open ? 'OPEN' : 'STAGED',
        opens: Math.max(1, h.band[0]), where: hall.hunt, chance: true, limit: { per: 'day', n: 1, scope: 'hero' },
        label: 'READ FROM DATA; a win is ASSUMED, the key from its drop row',
        hall: { ground: hall.id, key: hall.key, slice: d.ch, firstShare: d.first === true && firstSum > 0 ? d.ch / firstSum : 0, minutes: D.BOSS_HALL_RULES.limitMs / 60000 } });
    }
  }
  /* THE HEARTH CHEST (src/data/chests.js): a key a open, six opens a family a hero a week; a Tower key finds a weapon of the opener's own
     family half the time (ownPm), a Catacomb key an armor piece of the leaned slot in the opener's weight half the time */
  const ownShare = (D.CHEST_LUCK.ownPm || 500) / 1000;
  const keyRows = [...D.CHEST_KEYS, ...D.CATACOMB_KEYS];
  for (const k of keyRows) {
    const fam = D.KEY_FAMILIES[k.family] || { opensPerWeek: 6 };
    const staged = k.family !== 'tower';
    const base = { family: k.family, key: k.id, keyItem: k.item, keyFrom: k.from, pPm: k.weaponPm, opensPerWeek: fam.opensPerWeek, climbHoursAWeek: CLIMB_HOURS_A_WEEK };
    const opens = Math.max(D.TOWER_RULES.minLevel || 10, k.from);
    if (k.gear === 'weapon') {
      for (const [family, item] of Object.entries(k.weapons || {})) {
        out.push({ sid: 'chest:' + k.id + ':' + item, kind: 'chest', system: 'hearth-chest', item, qty: 1, state: 'OPEN', opens, where: k.name + ' (' + family + ')',
          chance: true, limit: { per: 'week', n: fam.opensPerWeek, scope: 'hero' }, label: 'READ FROM DATA odds and warmth; ' + CLIMB_LABEL,
          chest: { ...base, share: ownShare } });
      }
    } else {
      for (const [slotWeight, item] of Object.entries(k.armor || {})) {
        const slot = slotWeight.split(':')[0];
        const lean = slot === 'helmet' ? (k.helmetPm || 500) / 1000 : 1 - (k.helmetPm || 500) / 1000;
        out.push({ sid: 'chest:' + k.id + ':' + item, kind: 'chest', system: 'catacombs', item, qty: 1, state: staged ? 'STAGED' : 'OPEN', opens, where: k.name + ' (' + slotWeight + ')',
          chance: true, limit: { per: 'week', n: fam.opensPerWeek, scope: 'hero' }, label: 'READ FROM DATA odds; the wing\'s climb ASSUMED as the Tower\'s',
          chest: { ...base, share: lean * ownShare } });
      }
    }
    /* THE KEY ITSELF: a landing (a Catacomb wing's vault door) mints its key for each hero in the run; one climb a week reaches every landing
       at or under the Level, three of a metal (landings every TOWER_RULES.landingEvery floors) */
    const perMetal = Math.max(1, Math.round(30 / (D.TOWER_RULES.landingEvery || 10)));
    out.push({ sid: 'key:' + k.id, kind: 'chest', system: staged ? 'catacombs' : 'tower', item: k.item, qty: perMetal, state: staged ? 'STAGED' : 'OPEN', opens, where: (staged ? 'a vault door of ' : 'a landing of ') + (k.ground || 'the Tower'),
      chance: false, byproduct: false, label: 'READ FROM DATA landings; ' + CLIMB_LABEL, limit: { per: 'week', n: 1, scope: 'hero' }, chest: { ...base, pPm: 1000, share: 1, sure: true, opensPerWeek: 1 } });
    /* what a key always holds: the Cinders, its salts, its food (keyHaul) */
    for (const [item, qty] of Object.entries(D.keyHaul(k))) {
      out.push({ sid: 'haul:' + k.id + ':' + item, byproduct: true, kind: 'chest', system: staged ? 'catacombs' : 'tower', item, qty, state: staged ? 'STAGED' : 'OPEN', opens, where: k.name + ' (always holds)',
        chance: false, limit: { per: 'week', n: fam.opensPerWeek, scope: 'hero' }, label: 'READ FROM DATA; ' + CLIMB_LABEL, chest: { ...base, pPm: 1000, share: 1, sure: true } });
    }
    for (const o of D.CHEST_OUTFITS) if (o.pm && o.pm[k.id]) {
      out.push({ sid: 'outfit:' + k.id + ':' + o.item, kind: 'chest', system: 'outfits', item: o.item, qty: 1, state: staged ? 'STAGED' : 'OPEN', opens, where: k.name + ' (outfit roll)',
        chance: true, limit: { per: 'week', n: fam.opensPerWeek, scope: 'hero' }, label: 'READ FROM DATA', cosmetic: true,
        chest: { ...base, pPm: o.pm[k.id], share: 1, flat: true } });
    }
  }
  /* TAMSIN'S TALLIES (src/data/tally-tasks.js): a count of one monster on its ground, paid in gold and materials, three a day */
  for (const t of D.TALLY_TASKS) {
    const h = D.HUNT_INDEX[t.hunt] || { band: [1, 1] };
    for (const m of t.materials || []) {
      out.push({ sid: 'task:' + t.id + ':' + m.item, byproduct: true, kind: 'task', system: 'tally', item: m.item, qty: m.qty, state: D.OPEN_GROUNDS[t.hunt] ? 'OPEN' : 'STAGED',
        opens: Math.max(1, h.band[0]), where: 'Tamsin: ' + t.label, chance: false, limit: { per: 'day', n: D.TALLY_RULES.paidPerDay, scope: 'hero' },
        label: 'READ FROM DATA', task: { ground: t.hunt, monster: t.monster, count: t.count, gold: t.gold } });
    }
  }
  /* THE HEARTHFINDS (src/data/hearthfind.js): a row's `hours` of hunting its monster (or working its node) a find */
  for (const r of D.HEARTHFIND_TABLE) {
    if (r.kind === 'monster') {
      for (const [gid, g] of Object.entries(D.HUNT_GROUNDS)) if (placed(g).includes(r.id) && D.HUNT_INDEX[gid]) {
        out.push({ sid: 'hearthfind:' + gid + ':' + r.item, kind: 'drop', system: 'rare-moments', item: r.item, qty: 1, state: D.OPEN_GROUNDS[gid] ? 'OPEN' : 'STAGED',
          opens: Math.max(1, D.HUNT_INDEX[gid].band[0]), where: gid, chance: true, label: 'READ FROM DATA (hours of its monster a find)',
          hunt: { ground: gid, perKill: { [r.id]: 1 / (r.hours * r.killsPerHour) }, luck: false } });
      }
    } else {
      out.push({ sid: 'hearthfind:' + r.id + ':' + r.item, kind: 'gather', system: 'rare-moments', item: r.item, qty: 1, state: 'OPEN', opens: 1, where: 'node ' + r.id,
        chance: true, label: 'READ FROM DATA (rested hours at its node a find)', node: { id: r.id, hoursAFind: r.hours } });
    }
  }
  /* MODIFIERS: the Bestiary's stages (a per-monster drop multiplier by kills), the Luck bar (PROJECTED), the live events */
  const st = D.TROPHY_STAGES.map((s) => ({ at: s.at, drop: s.drop }));
  mods.push({ sid: 'bestiary:stages', kind: 'bestiary-luck', system: 'bestiary', label: 'READ FROM DATA', state: 'OPEN',
    effect: 'a monster\'s drop rows x' + st.map((s) => s.drop + ' at ' + s.at + ' kills').join(', ') + '; at most x' + D.MAX_MEMORY_DROP_MULT + ' with its memory', stages: st, max: D.MAX_MEMORY_DROP_MULT });
  mods.push({ sid: 'luck:bar', kind: 'bestiary-luck', system: 'luck', label: LUCK_RULED.label, state: 'PLANNED',
    effect: 'every Rare and Trophy row x(1 + Luck): +16% at 500 hunted hours, +39% at 5,000', points: LUCK_RULED.points });
  for (const [id, e] of Object.entries(D.LIVE_EVENTS)) {
    const share = (e.hours || 0) / ((e.everyDays || 1) * 24);
    mods.push({ sid: 'event:' + id, kind: 'event', system: 'live-events', label: 'READ FROM DATA', state: 'OPEN', type: e.type,
      effect: e.type === 'xp_bonus' ? '+' + ((e.pm - 1000) / 10) + '% Level XP for ' + e.hours + ' h every ' + e.everyDays + ' days: +' + (share * (e.pm - 1000) / 10).toFixed(1) + '% on a 12 h day averaged'
        : 'Call out fee x' + e.pm / 1000 + ' for ' + e.hours + ' h every ' + e.everyDays + ' days (the fee is already 0)', avgXpShare: e.type === 'xp_bonus' ? share * (e.pm - 1000) / 1000 : 0 });
  }
  return { sources: out, modifiers: mods };
}
