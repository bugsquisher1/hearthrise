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
  /* While Havora's Works still raises the Weighhouse: the window's one-line state (and a closed press's reason), and its Browse page's
     empty state, which says what the place is for and where it is built (UI audit 2026-11-18: one long sentence, and nothing under it). */
  market_fund: 'Being built: {total} / {goal} gp',
  market_unbuilt_head: 'Not open yet',
  market_unbuilt_body: 'Once it\'s built, players list items here and buy each other\'s for gold. Everyone in town builds it together at Havora > Works.',
  market_fund_given: '{total} / {goal} gp given',
  market_to_works: 'Go to Works',
  market_closed_head: 'Closed for now',
  market_closed_body: 'Trading is paused. Your listings are safe, and you can take them back from My listings.',
  /* Open, with nothing for sale: what goes here and how to put something up. */
  market_empty_head: 'The scales are empty',
  market_empty_body: 'Nothing is for sale yet. Players list items here and buy each other\'s for gold. List something from your bag or Storage to start.',
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
  /* The same for a worn piece's resistance (src/shell/upgrade-plan.js, lane/a-next-steps): a plain piece that adds a number would lose it where a monster in range
     deals that damage. {gain} is the piece's first gain ("+4 Defense"), {cuts} what the worn one keeps off ("fire damage by 10%"). */
  upgrade_tie_resist: '{plain} adds {gain}, {worn} cuts {cuts}',
  upgrade_resist_cut: '{element} damage by {pct}%',
  /* A resistance a pick adds, in the preview: "-10% Fire damage taken" ({element} is the monster page's own word, monster.el_*). */
  upgrade_resist_gain: '-{pct}% {element} damage taken',
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
