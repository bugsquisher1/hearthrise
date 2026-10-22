// ════════════════════════════════════════════════════════════════════════
// THE CHARACTER'S PRIVATE PUSH CHANNEL, its two pure rules: the topic the
// server spells for (uid, slot) (hr_frame_topic) and the reconnect backoff.
// CharacterSession (character-session.js connect / _onChannel) joins and drops
// the channel; src/app/boot.js subscribes it under FRAME_EVENT.
// ════════════════════════════════════════════════════════════════════════
import { SESSION_CONFIG } from './config.js?v=0.2.32';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The private push topic hr_frame_topic spells for (uid, slot), or null. Pure. */
export function frameTopic(uid, slot, maxSlot = SESSION_CONFIG.maxSlot) {
  if (typeof uid !== 'string' || !UUID.test(uid)) return null;
  if (!Number.isInteger(slot) || slot < 0 || slot > maxSlot) return null;
  return 'hr:' + uid.toLowerCase() + ':' + slot;
}

/** Exponential reconnect delay, capped, with ±20% jitter (`rand` for tests). Pure. */
export function reconnectDelay(attempt, rand, cfg = SESSION_CONFIG) {
  const n = Math.max(1, Math.floor(Number(attempt) || 1));
  const base = Math.min(cfg.reconnectMaxMs, cfg.reconnectMinMs * Math.pow(2, Math.min(n, 20) - 1));
  const r = typeof rand === 'number' && rand >= 0 && rand <= 1 ? rand : Math.random();
  return Math.round(base * (0.8 + 0.4 * r));
}
