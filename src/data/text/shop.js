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
  sell_junk_for: 'Sell all junk for {total}',
  junk_keeps_it: 'Sell all junk keeps it',
  /* The Equip upgrades line (src/shell/upgrade-plan.js upgradeWords), in the Shop and the bag, when every slot it could fill is a tie. An armor weight
     picked at Tamsin's settles a tie between weights, so only that tie says so (a Keen ring against a Surge ring is not one). */
  /* A perk a piece adds that its name does not say (a jewelry row's name says its own). */
  upgrade_adds_perk: 'adds {perk}',
  upgrade_tie: 'No clear upgrade. {ties}. Pick on the doll.',
  upgrade_tie_weights: 'No clear upgrade. {ties}. Pick on the doll or at Tamsin\'s.',
  /* One tie's words when a plain stronger weapon in the bag would lose the worn one's bane (designer 2026-11-11): `more` is item.bane_more's line, the tooltip's. */
  upgrade_tie_bane: '{plain} hits harder, {bane} does {more}',
  /* The same for a worn piece's resistance (src/shell/upgrade-plan.js, lane/a-next-steps): a plain piece that adds a number would lose it where a monster in range
     deals that damage. {gain} is the piece's first gain ("+4 Defense"), {cuts} what the worn one keeps off ("fire damage by 10%"). */
  upgrade_tie_resist: '{plain} adds {gain}, and {worn} cuts {cuts}',
  upgrade_resist_cut: '{element} damage by {pct}%',
  /* A resistance a pick adds, in the preview: "-10% Fire damage taken" ({element} is the monster page's own word, monster.el_*). */
  upgrade_resist_gain: '-{pct}% {element} damage taken',
  /* Why Dispatch loot is off in town (src/shell/loot-dispatch.js dispatchBlock): no plan yet, or a plan with nothing left in the bag to move. */
  dispatch_none_set: 'No loot plan yet (pick Deposit or Sell in an item’s menu)',
  dispatch_all_moved: 'Nothing left to move (new loot follows the plan)',
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
