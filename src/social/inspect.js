// ════════════════════════════════════════════════════════════════════════
// src/social/inspect.js — ANOTHER PLAYER'S WORN GEAR, READ FROM THE SERVER.
//
// inspectOf(server, target, slot) asks hr_inspect for one character's equipped
// items. The server answers the WORN items only (player_equipment) with the
// name, level and weapon — never a bag or a bank — and refuses across a block.
// Read-only: nothing here is kept in any record.
//   → { ok: true, view: { id, name, slot, level, role, gear: [{ slot, item }] } } | { ok: false, error }
// ════════════════════════════════════════════════════════════════════════
import { roleForWeapon } from '../data/hunt-roles.js?v=0.2.59';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[a-z0-9_]{1,64}$/;

/** The server's inspect answer as a view, or null. Pure. */
function inspectView(b) {
  if (!b || b.ok !== true || typeof b.id !== 'string' || !UUID.test(b.id) || !Array.isArray(b.gear)) return null;
  const weapon = typeof b.weapon === 'string' && ID.test(b.weapon) ? b.weapon : null;
  return {
    id: b.id,
    name: typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 24) : 'Adventurer',
    slot: Number.isInteger(b.slot) ? b.slot : null,
    level: Number.isInteger(b.level) ? b.level : null,
    role: weapon ? roleForWeapon(weapon, typeof b.role === 'string' ? b.role : null) : null,
    gear: b.gear.slice(0, 24).filter((g) => g && typeof g.slot === 'string' && ID.test(g.slot) && typeof g.item === 'string' && ID.test(g.item))
      .map((g) => ({ slot: g.slot, item: g.item })),
  };
}

export async function inspectOf(server, target, slot) {
  const ans = await server.rpc('hr_inspect', { p_target: String(target || ''), p_slot: Number.isInteger(slot) ? slot : null });
  const view = inspectView(ans.body);
  if (view) return { ok: true, view };
  return { ok: false, error: (ans.body && typeof ans.body.error === 'string' && ans.body.error) || ans.error || 'refused' };
}
