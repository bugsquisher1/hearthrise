// ════════════════════════════════════════════════════════════════════════
// src/session/tower-intents.js — THE BURNING TOWER'S THREE PRESSES (supabase/migrations/2027-04-24-tower-climb.sql hr_tower_start,
// 2027-04-27-tower-chest.sql hr_chest_open and hr_chest_stoke_default).
//
// Each is ONE intent naming only this character's slot, a floor or a catalogue id (a chest, a key), a count or a stoke count, and a
// fresh key. Never a chance, a warmth, a Cinder count, a weapon or a price: the server reads the hero's own starts, keys, Cinders,
// warmth and worn weapon under its lock and rolls on its own dice. On ok the character is RE-READ, so the window changes only from
// the envelope; a refusal that means the screen was behind is re-read too.
//   startClimb(account, cs, floor)                 hr_tower_start         refuses bad_floor { starts }, in_party, feature_off, the hunt's own
//   openChest(account, cs, chest, key, count)      hr_chest_open          the stokes are the hero's saved default (p_stokes null): the window
//                                                                         shows the server's chance at that default, so the press can't send
//                                                                         a different one. Refuses no_key, day_limit, chest_not_ready, in_hunt,
//                                                                         bag_full, feature_off; ok answers { opens, haul, cinders_spent }
//   saveStokes(account, cs, key, stokes)           hr_chest_stoke_default the hero's default stokes for one kind of key (moves no value)
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.133';
import { settleTownActivity } from './party-intents.js?v=0.2.133';

const WORD = /^[a-z0-9_]{1,64}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const usable = (account, cs) => !!account && !!account.server && typeof account.server.rpc === 'function'
  && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot);
const bodyOf = (ans) => (ans && isObj(ans.body) ? ans.body : {});
const newIdem = () => globalThis.crypto.randomUUID();
/* Refusals that mean the screen was behind the server: the character is re-read so the window shows what the server holds. */
const RE_READS = Object.freeze(['bad_floor', 'in_party', 'feature_off', 'hunt_open', 'activity_running', 'no_key', 'day_limit', 'chest_not_ready',
  'in_hunt', 'bag_full', 'settle_first', 'party_hunt_running', 'bad_key', 'bad_stokes', 'bad_count']);

/* A refused answer, with the figures the server sent (src/shell/tower-words.js says them). */
function refused(ans, verb) {
  const b = bodyOf(ans);
  const starts = Array.isArray(b.starts) ? b.starts.slice(0, 64).filter((f) => Number.isSafeInteger(f) && f > 0) : null;
  return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', verb,
    starts, have: nat(b.have), need: nat(b.need), today: nat(b.today), max: nat(b.max), stacks: nat(b.stacks), cap: nat(b.cap) };
}

/* The open's answer, read field by field: one row a key (its stokes, the chance it rolled at, the weapon or none), the haul. */
function openedOf(b) {
  const opens = (Array.isArray(b.opens) ? b.opens : []).slice(0, 64).filter(isObj).map((o) => Object.freeze({
    stokes: nat(o.stokes) ?? 0, chancePpm: nat(o.chance_ppm), weapon: typeof o.weapon === 'string' && WORD.test(o.weapon) ? o.weapon : null }));
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

/** Start a solo climb from a floor the server listed for this hero this week. */
export function startClimb(account, cs, floor) {
  if (!usable(account, cs) || !(Number.isSafeInteger(floor) && floor > 0)) return bad('tower_start');
  /* a town job is settled first (the boss hall's door does the same): the climb takes the hero out of town */
  return send(cs, 'tower_start', async () => { await settleTownActivity(cs); return account.server.rpc('hr_tower_start', { p_slot: cs.slot, p_floor: floor, p_idem: newIdem() }); });
}

/** Use `count` keys of one kind at a chest, each stoked with the hero's saved default. Resolves to { ok, opens, haul } or the refusal. */
export function openChest(account, cs, chest, key, count) {
  if (!usable(account, cs) || !WORD.test(String(chest)) || !WORD.test(String(key)) || !(Number.isSafeInteger(count) && count > 0)) return bad('chest_open');
  return send(cs, 'chest_open', () => account.server.rpc('hr_chest_open',
    { p_slot: cs.slot, p_chest: chest, p_key: key, p_count: count, p_stokes: null, p_idem: newIdem() }), openedOf);
}

/** Save the hero's default stokes for one kind of key (0 = none). */
export function saveStokes(account, cs, key, stokes) {
  if (!usable(account, cs) || !WORD.test(String(key)) || !(Number.isSafeInteger(stokes) && stokes >= 0 && stokes <= 9)) return bad('chest_stoke_default');
  return send(cs, 'chest_stoke_default', () => account.server.rpc('hr_chest_stoke_default', { p_slot: cs.slot, p_key: key, p_stokes: stokes, p_idem: newIdem() }));
}
