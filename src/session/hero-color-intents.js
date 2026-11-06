// ════════════════════════════════════════════════════════════════════════
// src/session/hero-color-intents.js — SAVING A HERO'S FOUR COLORS (2027-03-05-hero-colors.sql).
//
// ONE intent naming only this character's slot, four dye INDICES and the QUOTE this window read (never a color, never a price of
// its own). The server checks the indices against hr_outfit_dyes, re-quotes under its lock and refuses quote_changed if the price moved. On ok, and
// whenever the screen must have been behind the server (quote_changed, colors_same), the character is RE-READ: a saved color shows only from the envelope.
//   readColorsPrice(account, cs)                ONE hr_hero_colors_view while the Outfit tab is open, never in the envelope: an idle hero costs no read, and a settle never prices anything
//   saveHeroColors(account, cs, colors, price)  hr_hero_colors_set
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.101';
import { refusalOf } from './refusal.js?v=0.2.101';
import { dyeKeyOf } from '../data/outfits.js?v=0.2.101';

const RE_READS = Object.freeze(['quote_changed', 'colors_same']);

/** What a save costs this hero right now, as the server says: { ok: true, price } or { ok: false, error }. */
export function readColorsPrice(account, cs) {
  if (!account || !account.server || !cs) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, 'hero_colors_read', async () => {
    const ans = await account.server.rpc('hr_hero_colors_view', { p_slot: cs.slot });
    const b = ans && ans.body && typeof ans.body === 'object' ? ans.body : {};
    if (ans && ans.ok && b.ok === true && Number.isSafeInteger(b.price) && b.price > 0) return { ok: true, price: b.price };
    return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused' };
  });
}

async function settled(cs, ans) {
  const b = ans && ans.body && typeof ans.body === 'object' ? ans.body : {};
  if (ans && ans.ok && b.ok === true) { if (cs.status !== 'closed') await cs.load(); return { ok: true }; }
  const r = refusalOf(ans);
  if (RE_READS.includes(r.error) && cs.status !== 'closed') await cs.load();
  return r;
}

/** Save this hero's colors at the price the server quoted. */
export function saveHeroColors(account, cs, colors, price) {
  if (!account || !account.server || !cs || !dyeKeyOf(colors) || !Number.isSafeInteger(price) || price < 1) return Promise.resolve({ ok: false, error: 'bad_intent' });
  const p_colors = { head: colors.head, body: colors.body, legs: colors.legs, feet: colors.feet };
  return askVia(cs, 'hero_colors_set', async () => settled(cs, await account.server.rpc('hr_hero_colors_set',
    { p_slot: cs.slot, p_colors, p_price: price, p_idem: globalThis.crypto.randomUUID() })));
}
