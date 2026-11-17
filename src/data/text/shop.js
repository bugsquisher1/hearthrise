// ════════════════════════════════════════════════════════════════════════
// src/data/text/shop.js — THE SHOP WINDOW'S WORDS (src/shell/windows/shop.js).
//
// One row per sentence or label, read by t('shop.<key>'). The rest of the
// window's words still sit in its code (tests/text-home.mjs ratchets them down);
// what is here moved first: a seed's planting needs, said on its Buy row before
// the purchase (v0.2.109, coverage bot 2026-11-07).
// ════════════════════════════════════════════════════════════════════════

export const SHOP_TEXT = Object.freeze({
  /* The Market window (src/shell/windows/market/index.js) while trading is off AND Havora's Works is still raising the building the
     Market is named for: the Works' own story, with its numbers from the server, and where to give (audit 2026-11-15 F19: the Market
     read "isn't trading right now", an outage, while the Works said it was being built). Two facts side by side, no promise of when. Labels (Tyler 2026-11-14). */
  market_being_built: '{building} being built: {total} of {goal} gp (give in Havora > Works)',
  market_listings_safe: 'Your listings are safe (you can take them back)',
  /* What a seed still needs before it can be planted: the hero's Farming and the account's plot tier, from the server. */
  seed_needs_farming: 'Needs Farming {level} to plant',
  seed_needs_tier: 'Needs plot tier {tier} to plant',
  seed_needs_both: 'Needs Farming {level} and plot tier {tier} to plant',
  /* The Sell tab's one bulk sale: the Junk only, never a Material (Tyler 2026-11-08). */
  sell_junk: 'Sell all junk',
  sell_junk_for: 'Sell all junk for {total}',
  junk_keeps_it: 'Kept by Sell all junk',
  /* The Equip upgrades line (src/shell/upgrade-plan.js upgradeWords), in the Shop and the bag, when every slot it could fill is a tie. An armor weight
     picked at Tamsin's settles a tie between weights, so only that tie says so (a Keen ring against a Surge ring is not one). */
  /* A perk a piece adds that its name does not say (a jewelry row's name says its own). */
  upgrade_adds_perk: 'adds {perk}',
  upgrade_tie: 'No clear upgrade: {ties}',
  upgrade_tie_weights: 'No clear upgrade: {ties}',
  /* One tie's words when a plain stronger weapon in the bag would lose the worn one's bane (designer 2026-11-11): `more` is item.bane_more's line, the tooltip's. */
  upgrade_tie_bane: '{plain} hits harder, {bane} does {more}',
  /* Why Dispatch loot is off in town (src/shell/loot-dispatch.js dispatchBlock): no plan yet, or a plan with nothing left in the bag to move. */
  dispatch_none_set: 'No loot plans set',
  dispatch_all_moved: 'Nothing left to move',
  /* Blessings in the Services tab (src/shell/windows/services.js): all of them in one press, one server purchase each. */
  bless_all: 'Bless all',
  bless_all_busy: 'Blessing…',
  bless_all_done: 'All {of} Blessings on',
  /* Why Bless all is off, said under it. */
  bless_all_on: 'All Blessings on',
  bless_all_short: 'Not enough gold for the next Blessing',
  junk_keeps: { one: 'Keeps {count} Material stack ({worth}), sell it by hand.',
    other: 'Keeps {count} Material stacks ({worth}), sell them by hand.' },
});
