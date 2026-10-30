// ════════════════════════════════════════════════════════════════════════
// src/social/chat-lines.js — ONE CHAT OR WHISPER ROW, READ SAFELY. PURE.
//
// The server's row shape (hr_chat_row / hr_whisper_row; the Realtime INSERT
// payload carries the same keys) becomes one display line:
//   { id, channel, at (ms), time 'HH:MM', fromId, name, level, role, slot, parts, toId, toName }
// `role` is ALWAYS roleForWeapon(from_weapon, from_role) (src/data/hunt-roles.js):
// the server sends the weapon and the pick, never a role of its own choosing.
// `parts` is the body split into text and item links: an `[[item:<id>]]` marker
// the server checked against hr_items. The client renders a link's name and
// rarity from the catalogue; an id the catalogue does not know shows as plain
// words (a newer server than this client), never as a link.
// A line on the System channel is the SERVER's notice (no player can write it:
// 2026-11-24-rare-broadcast.sql): it reads as one sentence, the hero's name
// first ("Mira found Crown Shard in The Millrace Sewer."), and only there does
// a `[[hunt:<id>]]` marker become the hunt's name; in a player's line it is
// left as typed.
// Anything malformed is null: a line the client cannot read is not shown.
// ════════════════════════════════════════════════════════════════════════
import { roleForWeapon } from '../data/hunt-roles.js?v=0.2.71';
import { ITEMS } from '../data/items.js?v=0.2.71';
import { CHAT_LIMITS } from '../data/chat-channels.js?v=0.2.71';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.71';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNEL = /^(global|trade|system|local:[a-z0-9_]{1,64}|party:[0-9a-f-]{36})$/;
const LINK = /\[\[(item|hunt):([a-z0-9_]{1,64})\]\]/g;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const pad = (n) => (n < 10 ? '0' : '') + n;

/** A time as the player's clock reads it, 'HH:MM'. */
export function clockOf(ms, tz) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '--:--';
  return tz === 'utc' ? pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) : pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** A body as parts: [{ text }] and [{ item }] in order. `notice`: a server notice, whose hunt markers name the hunt. */
export function partsOf(body, notice) {
  const out = [];
  let last = 0;
  for (const m of String(body).matchAll(LINK)) {
    if (m[1] === 'hunt' && !notice) continue;
    if (m.index > last) out.push({ text: body.slice(last, m.index) });
    if (m[1] === 'hunt') out.push({ text: (HUNT_INDEX[m[2]] && HUNT_INDEX[m[2]].name) || 'a hunt' });
    else out.push(ITEMS[m[2]] ? { item: m[2] } : { text: m[2].replace(/_/g, ' ') });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

/** The marker the server stores for a linked catalogue item. */
const linkMarker = (id) => '[[item:' + id + ']]';

/** The words an item link shows in the input box: its catalogue name in brackets. */
export const linkLabel = (id) => '[' + ((ITEMS[id] && ITEMS[id].n) || String(id).replace(/_/g, ' ')) + ']';

/**
 * The body to send: the typed text with each linked item's label (still present)
 * turned back into its marker. Only catalogue ids become markers, at most
 * CHAT_LIMITS.linksMax; a label the player deleted is simply not a link.
 */
export function bodyOf(text, links) {
  let out = String(text || '').trim();
  let n = 0;
  for (const id of links || []) {
    if (n >= CHAT_LIMITS.linksMax || !ITEMS[id]) continue;
    const label = linkLabel(id);
    const at = out.indexOf(label);
    if (at < 0) continue;
    out = out.slice(0, at) + linkMarker(id) + out.slice(at + label.length);
    n++;
  }
  return out;
}

/** One server row as a display line, or null. */
export function lineOf(row, o = {}) {
  if (!isObj(row) || typeof row.id !== 'string' || !UUID.test(row.id)) return null;
  const whisper = typeof row.to_id === 'string';
  if (!whisper && !(typeof row.channel === 'string' && CHANNEL.test(row.channel))) return null;
  if (whisper && !UUID.test(row.to_id)) return null;
  const body = typeof row.body === 'string' ? row.body.slice(0, CHAT_LIMITS.bodyMax) : '';
  const at = Date.parse(row.created_at);
  if (!body || !Number.isFinite(at)) return null;
  const weapon = str(row.from_weapon, 32);
  const name = str(row.from_name, 24) || 'Adventurer';
  const fromId = typeof row.from_id === 'string' && UUID.test(row.from_id) ? row.from_id : null;
  /* A System row is the server's notice: one sentence, the hero's name first, no level or role tag. */
  if (!whisper && row.channel === 'system') {
    return { id: row.id, channel: 'system', at, time: clockOf(at, o.tz), fromId, name, level: null, role: null,
      slot: int(row.from_slot, 0, 32), parts: [{ text: name + ' ' }].concat(partsOf(body, true)), toId: null, toName: null, system: true };
  }
  return {
    id: row.id,
    channel: whisper ? null : row.channel,
    at,
    time: clockOf(at, o.tz),
    fromId,
    name,
    level: int(row.from_level, 0, 10000),
    role: weapon ? roleForWeapon(weapon, str(row.from_role, 32)) : null,
    slot: int(row.from_slot, 0, 32),
    parts: partsOf(body),
    toId: whisper ? row.to_id : null,
    toName: whisper ? str(row.to_name, 24) || 'Adventurer' : null,
  };
}

/** A system line (a server notice row, or an alert the client was told of): { id, at, time, parts, system: true }. */
export function systemLine(id, text, at, o = {}) {
  return { id: String(id), channel: 'system', at, time: clockOf(at, o.tz), fromId: null, name: null, level: null,
    role: null, slot: null, parts: [{ text: String(text).slice(0, 300) }], toId: null, toName: null, system: true };
}

/** Which fixed tab a chat line belongs to, given the zone and party channels the server named. */
export function tabOfChannel(channel, zone, party) {
  if (channel === 'global') return 'global';
  if (channel === 'system') return 'system';
  if (zone && channel === zone) return 'local';
  if (party && channel === party) return 'party';
  return null;
}
