// ════════════════════════════════════════════════════════════════════════
// src/data/text/shop.js — THE SHOP WINDOW'S WORDS (src/shell/windows/shop.js).
//
// One row per sentence or label, read by t('shop.<key>'). The rest of the
// window's words still sit in its code (tests/text-home.mjs ratchets them down);
// what is here moved first: a seed's planting needs, said on its Buy row before
// the purchase (v0.2.109, coverage bot 2026-11-07).
// ════════════════════════════════════════════════════════════════════════

export const SHOP_TEXT = Object.freeze({
  /* What a seed still needs before it can be planted: the hero's Farming and the account's plot tier, from the server. */
  seed_needs_farming: 'Needs Farming {level} to plant',
  seed_needs_tier: 'Needs plot tier {tier} to plant',
  seed_needs_both: 'Needs Farming {level} and plot tier {tier} to plant',
  /* The Sell tab's one bulk sale: the Junk only, never a Material (Tyler 2026-11-08). */
  sell_junk: 'Sell all junk',
  sell_junk_for: 'Sell all junk · {total}',
  junk_keeps_it: 'Sell all junk keeps it',
  junk_keeps: { one: 'Sell all junk keeps {count} stack worth {worth}. It is a Material. Sell it by hand if you want the gold.',
    other: 'Sell all junk keeps {count} stacks worth {worth}. They are Materials. Sell those by hand if you want the gold.' },
});
