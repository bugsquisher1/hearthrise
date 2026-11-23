// ════════════════════════════════════════════════════════════════════════
// tests/_tier-path.mjs — A FIXTURE THAT PLAYS THE TIER PATH ON A GROUND NOW ON THE DANGER SCALE (lane/scale-early-grounds, 2026-11-23).
//
// The Mill Cellar and the Thicket joined the Danger scale (src/data/danger.js DANGER_GROUNDS; the server's hr_danger_grounds and
// hr_store_grounds, 1061), so a hunt opened on either freezes the default stance and plays the scale. A test whose subject is a tier-path
// rule (a density pick, a tier freeze, the party class table, a tier's pull bound) and which used the real Cellar or Thicket as its fresh
// hero's ground withdraws that ground's scale rows in ITS OWN replayed database, so the server freezes no stance and the arm reads what it
// was written for. Production keeps the rows; nothing here touches a file. The tier path retires with stage 6's last ground, and these
// arms with it.
//
//   import { withdrawScale } from './_tier-path.mjs';
//   await withdrawScale(db, ['mill_cellar']);      // db: a PGlite or postgres.js-shaped handle with .query(sql, params)
// ════════════════════════════════════════════════════════════════════════

const rows = (r) => (r && Array.isArray(r.rows) ? r.rows : Array.isArray(r) ? r : []);

/** Delete `hunts`' Danger scale rows (the store's depth first: hr_store_grounds names the scale's grounds). A chain without the tables is a
    no-op. Returns the hunts it withdrew. */
export async function withdrawScale(db, hunts) {
  const list = [...hunts];
  const has = async (t) => {
    const r = rows(await db.query("select to_regclass($1) is not null as ok", ['public.' + t]));
    return !!(r[0] && r[0].ok);
  };
  if (await has('hr_store_grounds')) await db.query('delete from public.hr_store_grounds where hunt_id = any($1::text[])', [list]);
  if (await has('hr_danger_grounds')) await db.query('delete from public.hr_danger_grounds where hunt_id = any($1::text[])', [list]);
  return list;
}
