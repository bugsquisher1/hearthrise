// ════════════════════════════════════════════════════════════════════════
// src/data/this-week.js — the Home "Your week" card and the hearth band's
// realm cells. Plain data: each row names a goal of hr_goal_rewards, whose
// ISO-week / UTC-day count the server projects through hr_goal_state. The
// lead is the week's character when that counter leads (tests/this-week.mjs).
// Fishing has no weekly counter, so it has no row.
// ════════════════════════════════════════════════════════════════════════

export const THIS_WEEK = Object.freeze([
  { goal: 'wk_kills', label: 'Monsters slain', lead: 'A hunter’s week so far: the paths out of the valley are quieter than they were on Monday, and the lodge has noticed who did it' },
  { goal: 'wk_logs', label: 'Logs cut', lead: 'A woodcutter’s week so far: the woodpile has climbed past the window, and the stove will not go hungry for a long while yet' },
  { goal: 'wk_gather', label: 'Ore mined', lead: 'A miner’s week so far: the ore heap by the forge stands taller than the smith, and the hill is a little lighter than it was' },
  { goal: 'wk_cook', label: 'Dishes cooked', lead: 'A cook’s week so far: the kitchen fire has not gone cold since Monday, and nobody in camp can remember their last plain supper' },
  { goal: 'wk_smith', label: 'Smithing jobs done', lead: 'A smith’s week so far: the anvil has rung from Monday on, and half the camp can tell the hour by the sound of your hammer' },
  { goal: 'wk_craft', label: 'Crafts finished', lead: 'A crafter’s week so far: shavings on the floor, thread on the sleeve, and a bench that has barely had a moment to cool' },
  { goal: 'wk_harvest', label: 'Crops harvested', lead: 'A farmer’s week so far: the baskets keep coming in from the plots, and the root cellar has started to run short of shelf' },
  { goal: 'wk_rare', label: 'Rare drops', lead: 'A lucky week so far: the rarer things keep turning up at the bottom of your pack, and the old hunters have begun to ask where you go' },
  { goal: 'wk_gold', label: 'Gold earned', lead: 'A merchant’s week so far: coin has been coming in faster than you can stack it, and the purse strings are wearing thin' },
  { goal: 'wk_levels', label: 'Levels gained', lead: 'A scholar’s week so far: something new has clicked into place every few days, and you can feel the difference in your hands' },
].map(Object.freeze));

export const THIS_WEEK_QUIET = 'The week is still young; everything you fight, cut, mine, cook and make before Monday comes round again is counted here';

/* The hearth band's realm cells: UTC-day counters. 'Gold earned' is gross
   ledger inflow (payouts, sales, refunds), so its title says spending is not
   taken off. */
export const THIS_WEEK_TODAY = Object.freeze([
  { goal: 'kill_any', label: 'Kills today', title: 'Since midnight UTC, as the realm counts it' },
  { goal: 'gold_500', label: 'Gold earned', title: 'Earned since midnight UTC, as the realm counts it; spending is not taken off' },
].map(Object.freeze));
