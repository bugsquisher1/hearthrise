// ════════════════════════════════════════════════════════════════════════
// tests/_off-scale.mjs — A FIXTURE THAT PLAYS AN OPEN GROUND OFF THE DANGER SCALE, ITS ROWS AS WRITTEN (lane/retire-tier-chain, 2026-11-26;
// it replaces tests/_tier-path.mjs, which played "the tier path" until the tiers retired).
//
// Every open ground is on the Danger scale (src/data/danger.js DANGER_GROUNDS; the server's hr_danger_grounds and hr_store_grounds), so a
// hunt opened on one freezes the default stance and plays its step. A few DB arms read a subject the scale does not own (a live event's XP
// bound, the watched settle's frames and cost, a pelt's drop rate, the area spells on a ground's own packs) and were pinned on the rows as
// written: they take their ground off the scale in THEIR OWN replayed database, the path a room, the Tower and a staged ground play. Production
// keeps the rows; nothing here touches a file. NAMED DEBT (CONFLICTS 2026-11-26): each arm's re-aim onto the scale's own numbers.
//
//   import { offScale } from './_off-scale.mjs';
//   await offScale(db, ['mill_cellar']);      // db: a PGlite or postgres.js-shaped handle with .query(sql, params)
// ════════════════════════════════════════════════════════════════════════

const rows = (r) => (r && Array.isArray(r.rows) ? r.rows : Array.isArray(r) ? r : []);

/** Delete `hunts`' Danger scale rows (the store's depth first: hr_store_grounds names the scale's grounds). A chain without the tables is a
    no-op. Returns the hunts it took off. */
export async function offScale(db, hunts) {
  const list = [...hunts];
  const has = async (t) => {
    const r = rows(await db.query('select to_regclass($1) is not null as ok', ['public.' + t]));
    return !!(r[0] && r[0].ok);
  };
  if (await has('hr_store_grounds')) await db.query('delete from public.hr_store_grounds where hunt_id = any($1::text[])', [list]);
  if (await has('hr_danger_grounds')) await db.query('delete from public.hr_danger_grounds where hunt_id = any($1::text[])', [list]);
  return list;
}
