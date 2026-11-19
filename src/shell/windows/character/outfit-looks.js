// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/character/outfit-looks.js — WHICH CARDS THE WARDROBE LISTS, AND AN OUTFIT'S ADD-ON PICKER (the designer 2026-11-18).
//
// ONE CARD AN OUTFIT: a faction add-on's look (src/data/outfits.js, the Flamebearer with the Hearth Shield) never gets a card of its
// own; it is picked on its outfit's card ("Add-on: None, Shield, Light") and worn through the one free verb, hr_outfit_set, which
// names the look. A FIND OR AN EARNING (a bundle, faction pieces) is listed once the server says the hero owns it. While the server
// sends the `factions` section (the switch on), a faction outfit the hero does not own shows LOCKED, both sides', with its requirement
// read from the section's own number ("Requires First Flame standing: 25 h"); with no section nothing locked shows (the Key Warden
// always waits to be owned). An add-on not owned shows greyed with its requirement, and only with the server's number to say.
// PURE: reads the `outfit` reading (character-sections.js outfitOf) and the `factions` reading (faction-sections.js factionOf).
// ════════════════════════════════════════════════════════════════════════
import { OUTFIT_ROWS, OUTFIT_IDS, earnedOnly, outfitOfLook, addonLooks } from '../../../data/outfits.js?v=0.2.141';
import { t, hasText } from '../../../render/player-text.js?v=0.2.141';
import { sideName, spanWords } from '../../faction-words.js?v=0.2.141';

const owns = (o, id) => !!o && o.owned.has(id);
/* the section's piece ({ id, side, needMs }), or null with no section or a piece it does not list */
const pieceIn = (f, id) => (f && Array.isArray(f.pieces) ? f.pieces.find((p) => p.id === id) || null : null);

/** "Requires First Flame standing: 25 h", the server's own number; '' when the section is off or does not list the piece. */
export function requiresWords(f, piece) {
  const p = pieceIn(f, piece);
  return p ? t('factions.look_requires', { side: sideName(p.side), time: spanWords(p.needMs) }) : '';
}

/** The cards the wardrobe lists, in row order (before its search and Owned only). `o` the outfit reading, `f` the faction one or null. */
export function wardrobeIds(o, f) {
  return OUTFIT_IDS.filter((id) => {
    if (outfitOfLook(id) !== id) return false;
    const r = OUTFIT_ROWS[id];
    if (!earnedOnly(r) || owns(o, id)) return true;
    return !!r.pieces && requiresWords(f, r.pieces[0]) !== '';
  });
}

/** A card's caption when the hero does not own a faction outfit and the section says what it takes; else ''. */
export function teaserWords(id, o, f) {
  const r = OUTFIT_ROWS[id];
  return r && r.pieces && !owns(o, id) ? requiresWords(f, r.pieces[0]) : '';
}

/* An add-on's short name ("Shield") by its piece id; an id this client has no words for reads as an add-on, never as a code. */
const addonName = (piece) => (hasText('factions.addon_' + piece) ? t('factions.addon_' + piece) : t('factions.addon_unknown'));

/**
 * The add-on picker of the outfit `base`: [{ look, label, owned, need }], None (the outfit alone) first, then each add-on's look.
 * An add-on the hero does not own is listed only with the server's requirement to show (greyed by the caller). [] for an outfit with no
 * add-on. Pure.
 */
export function addonChoices(base, o, f) {
  const adds = addonLooks(base);
  if (!adds.length) return [];
  const pieces = OUTFIT_ROWS[base].pieces;
  const out = [{ look: base, label: t('factions.addon_none'), owned: owns(o, base), need: owns(o, base) ? '' : requiresWords(f, pieces[0]) }];
  for (const { look, piece } of adds) {
    const own = owns(o, look);
    const need = own ? '' : requiresWords(f, piece);
    if (own || need) out.push({ look, label: addonName(piece), owned: own, need });
  }
  return out;
}

/** The look a card's press tries on: the worn look when it is this outfit's, else the outfit itself. */
export const lookForCard = (id, o) => (o && o.worn && outfitOfLook(o.worn) === id ? o.worn : id);
