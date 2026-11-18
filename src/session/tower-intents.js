// ════════════════════════════════════════════════════════════════════════
// src/session/tower-intents.js — THE BURNING TOWER'S AND THE CATACOMBS' PRESSES (supabase/migrations/2027-04-24-tower-climb.sql hr_tower_start,
// 2027-05-08-catacombs.sql hr_catacomb_start, 2027-04-27-tower-chest.sql hr_chest_open and hr_chest_stoke_default).
//
// Each is ONE intent naming only this character's slot, a checkpoint or a catalogue id (a chest, a key), a count or a stoke count, and a
// fresh key. Never a chance, a warmth, a Cinder count, a weapon or a price: the server reads the hero's own record, keys, Cinders,
// warmth and worn weapon under its lock and rolls on its own dice. On ok the character is RE-READ, so the window changes only from
// the envelope; a refusal that means the screen was behind is re-read too.
//   startClimb(account, cs, landing)               hr_tower_start         from the floor after a checkpoint the server listed (0: floor 1);
//                                                                         in a party the leader's press starts every seat. Refuses
//                                                                         tower_level { need, have }, tower_party_level { who, need, have }
//                                                                         (the door's Level, 2027-05-05-entry-gates.sql),
//                                                                         bad_landing { checkpoints }, party_hunting, feature_off, the hunt's
//                                                                         and the party start's own (not_leader, not_ready { seats })
//   startDescent(account, cs, wing, landing)       hr_catacomb_start      the Unmarked Catacombs (2027-05-08-catacombs.sql): a wing id the
//                                                                         server lists and a vault door from ITS checkpoints (0: room 1);
//                                                                         the same door rules as a climb, refusing catacomb_level,
//                                                                         catacomb_party_level { who, need, have }, bad_wing, bad_landing
//   openChest(account, cs, chest, key, count)      hr_chest_open         the stokes are the hero's saved default (p_stokes null): the window
//                                                                         shows the server's chance at that default, so the press can't send
//                                                                         a different one. Refuses no_key, week_limit { family, used, limit },
//                                                                         chest_not_ready, in_hunt,
//                                                                         bag_full, feature_off; ok answers { opens, haul, cinders_spent }
//   saveStokes(account, cs, key, stokes)           hr_chest_stoke_default the hero's default stokes for one kind of key (moves no value)
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.140';
import { settleTownActivity } from './party-intents.js?v=0.2.140';

const WORD = /^[a-z0-9_]{1,64}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const usable = (account, cs) => !!account && !!account.server && typeof account.server.rpc === 'function'
  && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot);
const bodyOf = (ans) => (ans && isObj(ans.body) ? ans.body : {});
const newIdem = () => globalThis.crypto.randomUUID();
/* Refusals that mean the screen was behind the server: the character is re-read so the window shows what the server holds. */
const RE_READS = Object.freeze(['bad_landing', 'party_hunting', 'feature_off', 'hunt_open', 'activity_running', 'no_key', 'week_limit', 'chest_not_ready',
  'in_hunt', 'bag_full', 'settle_first', 'party_hunt_running', 'bad_key', 'bad_stokes', 'bad_count', 'tower_level', 'tower_party_level',
  'catacomb_level', 'catacomb_party_level', 'bad_wing']);

/* A refused answer, with the figures the server sent (src/shell/tower-words.js says them). */
function refused(ans, verb) {
  const b = bodyOf(ans);
  const checkpoints = Array.isArray(b.checkpoints) ? b.checkpoints.slice(0, 512).filter((f) => Number.isSafeInteger(f) && f >= 0) : null;
  return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', verb,
    checkpoints, family: typeof b.family === 'string' && WORD.test(b.family) ? b.family : null, used: nat(b.used), limit: nat(b.limit),
    have: nat(b.have), need: nat(b.need),
    /* the seat the door's Level stopped (tower_party_level): its name, the server's own */
    who: typeof b.who === 'string' && b.who.trim() ? b.who.trim().slice(0, 40) : null,
    stacks: nat(b.stacks), cap: nat(b.cap), seats: Array.isArray(b.seats) ? b.seats : null };
}

/* The open's answer, read field by field: one row a key (its stokes, the chance it rolled at, the weapon or none and its family, the armor
   piece or none and its slot and weight, the super-rare outfit or none and the bundle it came out as), the haul. */
function openedOf(b) {
  const id = (v) => (typeof v === 'string' && WORD.test(v) ? v : null);
  const opens = (Array.isArray(b.opens) ? b.opens : []).slice(0, 64).filter(isObj).map((o) => Object.freeze({
    stokes: nat(o.stokes) ?? 0, chancePpm: nat(o.chance_ppm), weapon: id(o.weapon), family: id(o.family),
    /* a Catacomb key's armor piece, its slot and weight (2027-05-08-catacombs.sql), or none */
    armor: id(o.armor), slot: id(o.armor) ? id(o.slot) : null, weight: id(o.armor) ? id(o.weight) : null,
    outfit: id(o.outfit), bundle: id(o.outfit) ? id(o.bundle) : null }));
  const haul = {};
  if (isObj(b.haul)) for (const [id, q] of Object.entries(b.haul)) if (WORD.test(id) && Number.isSafeInteger(q) && q > 0) haul[id] = q;
  return { opens: Object.freeze(opens), haul: Object.freeze(haul), cindersSpent: nat(b.cinders_spent) ?? 0 };
}

/* One verb: the ask (its RPC named where it is called), then the re-read. */
function send(cs, verb, ask, onOk) {
  return askVia(cs, verb, async () => {
    const ans = await ask();
    if (!(ans && ans.ok && bodyOf(ans).ok === true)) {
      const r = refused(ans, verb);
      if (RE_READS.includes(r.error) && cs.status !== 'closed' && typeof cs.load === 'function') await cs.load();
      return r;
    }
    const out = Object.assign({ ok: true }, onOk ? onOk(bodyOf(ans)) : {});
    if (typeof cs.load === 'function') await cs.load();
    return out;
  });
}

const bad = (verb) => Promise.resolve({ ok: false, error: 'bad_intent', verb });

/** Start a climb from the floor after a checkpoint the server listed for this hero (0: floor 1); in a party, the leader's press. */
export function startClimb(account, cs, landing) {
  if (!usable(account, cs) || !(Number.isSafeInteger(landing) && landing >= 0)) return bad('tower_start');
  /* a town job is settled first (the boss hall's door does the same): the climb takes the hero out of town */
  return send(cs, 'tower_start', async () => { await settleTownActivity(cs); return account.server.rpc('hr_tower_start', { p_slot: cs.slot, p_landing: landing, p_idem: newIdem() }); });
}

/** Start a descent on wing `wing` from the room after a vault door the server listed for that wing (0: room 1); in a party, the leader's
    press for every seat. */
export function startDescent(account, cs, wing, landing) {
  if (!usable(account, cs) || !WORD.test(String(wing)) || !(Number.isSafeInteger(landing) && landing >= 0)) return bad('catacomb_start');
  return send(cs, 'catacomb_start', async () => { await settleTownActivity(cs);
    return account.server.rpc('hr_catacomb_start', { p_slot: cs.slot, p_wing: wing, p_landing: landing, p_idem: newIdem() }); });
}

/** Use `count` keys of one kind at a chest, each stoked with the hero's saved default. Resolves to { ok, opens, haul } or the refusal. */
export function openChest(account, cs, chest, key, count) {
  if (!usable(account, cs) || !WORD.test(String(chest)) || !WORD.test(String(key)) || !(Number.isSafeInteger(count) && count > 0)) return bad('chest_open');
  return send(cs, 'chest_open', () => account.server.rpc('hr_chest_open',
    { p_slot: cs.slot, p_chest: chest, p_key: key, p_count: count, p_stokes: null, p_idem: newIdem() }), (b) => {
    /* the press may have turned the Hearth green (2027-05-05-hearth-moods.sql): the town is read at the active pace to see it */
    const town = typeof account.townOf === 'function' ? account.townOf(cs.slot) : null;
    if (town && typeof town.wake === 'function') town.wake();
    return openedOf(b);
  });
}

/** Save the hero's default stokes for one kind of key (0 = none). */
export function saveStokes(account, cs, key, stokes) {
  if (!usable(account, cs) || !WORD.test(String(key)) || !(Number.isSafeInteger(stokes) && stokes >= 0 && stokes <= 9)) return bad('chest_stoke_default');
  return send(cs, 'chest_stoke_default', () => account.server.rpc('hr_chest_stoke_default', { p_slot: cs.slot, p_key: key, p_stokes: stokes, p_idem: newIdem() }));
}
