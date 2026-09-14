// ============================================================================
// src/render/house-themes.js — THE HOUSE THEME CARDS.
//
// Extracted from src/legacy.js renderHouse() on 2026-09-14, with the ownership
// change that made these cards read the realm instead of a residue bag (§7:
// render helpers leave the monolith first).
//
// ── WHAT THE THREE STATES MEAN, because they are not interchangeable ────────
//   ACTIVE   owned AND equipped — `activeHouseTheme()`, which paints `default`
//            when the equipped pointer names something the realm does not carry.
//            So this state can never be reached by editing `G.houseTheme`.
//   APPLY    owned, not equipped. Drawn ONLY for something in the server's
//            projected set (`ownsGemUnlock`) — never for a client-held bag,
//            which is how a forged theme used to become a free one.
//   BUY      everything else, INCLUDING "the realm has not answered yet". That
//            is deliberate and it is safe in this direction only: pressing Buy
//            on something the account already owns is refused `already_owned`,
//            comes back carrying the whole owned set and heals the card without
//            charging a gem. Granting on silence cannot be undone by a click.
//
// The BUY state must read as a live offer, not as a locked card (art direction,
// 2026-09-14) — it is `btn-gem`, the same affordance the Shop's premium rows use.
//
// Pure: takes the theme list and the two ownership reads, returns HTML. No DOM,
// no globals at module scope, so the suite can drive it directly.
// ============================================================================

/**
 * @param {Array} themes  HOUSE_THEMES (id, name, glyph, price, currency)
 * @param {object} deps   { owns(kind,id), activeId(), glyph(name,size,token),
 *                          gem(n), gp(n) }
 */
export function houseThemeGridHtml(themes, deps) {
  const list = Array.isArray(themes) ? themes : [];
  const d = deps || {};
  const owns = typeof d.owns === 'function' ? d.owns : () => false;
  const activeId = typeof d.activeId === 'function' ? d.activeId() : null;
  const glyph = typeof d.glyph === 'function' ? d.glyph : () => '';
  const gem = typeof d.gem === 'function' ? d.gem : (n) => String(n);
  const gp = typeof d.gp === 'function' ? d.gp : (n) => String(n);

  const cards = list.map((t) => {
    const owned = owns('theme', t.id);
    const active = activeId === t.id;
    const price = t.price ? (t.currency === 'gem' ? gem(t.price) : gp(t.price)) : 'Default';
    const button = owned
      ? (active
        ? '<button class="btn btn-block" disabled>Active</button>'
        : `<button class="btn btn-block btn-primary" onclick="setTheme('${t.id}')">Apply</button>`)
      : `<button class="btn btn-block btn-gem" onclick="buyTheme('${t.id}')">Buy</button>`;
    return `<div class="iap-card ${active ? 'gold' : ''}"><div class="iap-icon">${glyph(t.glyph || 'uiHome', 30, '--gold-2')}</div>`
      + `<h3>${t.name}</h3><div class="desc">${price}</div>${button}</div>`;
  }).join('');

  return `<div class="iap-grid">${cards}</div>`;
}

if (typeof window !== 'undefined') {
  window.HearthriseHouseThemes = { houseThemeGridHtml };
}
