// ════════════════════════════════════════════════════════════════════════
// src/data/this-week.js — the Home "Your week" card and the hearth band's
// realm cells. Plain data: each row names a server period counter that
// hr_tally_state projects (a `daily` ev:<type> row summed over the ISO week,
// or 'gold' for gross gold earned). `par` is a typical week of that work; the
// card leads with the row furthest past a quarter of its par
// (tests/this-week.mjs). It sets no goal and pays nothing.
// ════════════════════════════════════════════════════════════════════════

export const THIS_WEEK = Object.freeze([
  { counter: 'ev:kill_any', par: 100, label: 'Monsters slain', lead: 'A hunter’s week so far: the paths out of the valley are quieter than they were on Monday, and the lodge has noticed who did it' },
  { counter: 'ev:chopped', par: 250, label: 'Logs cut', lead: 'A woodcutter’s week so far: the woodpile has climbed past the window, and the stove will not go hungry for a long while yet' },
  { counter: 'ev:mined', par: 250, label: 'Ore mined', lead: 'A miner’s week so far: the ore heap by the forge stands taller than the smith, and the hill is a little lighter than it was' },
  { counter: 'ev:fished', par: 250, label: 'Fish caught', lead: 'A fisher’s week so far: the creel has come home heavy most evenings, and every cat in the camp now follows you down to the water' },
  { counter: 'ev:cooked', par: 50, label: 'Dishes cooked', lead: 'A cook’s week so far: the kitchen fire has not gone cold since Monday, and nobody in camp can remember their last plain supper' },
  { counter: 'ev:smithed', par: 60, label: 'Smithing jobs done', lead: 'A smith’s week so far: the anvil has rung from Monday on, and half the camp can tell the hour by the sound of your hammer' },
  { counter: 'ev:crafted', par: 60, label: 'Crafts finished', lead: 'A crafter’s week so far: shavings on the floor, thread on the sleeve, and a bench that has barely had a moment to cool' },
  { counter: 'ev:harvest', par: 120, label: 'Crops harvested', lead: 'A farmer’s week so far: the baskets keep coming in from the plots, and the root cellar has started to run short of shelf' },
  { counter: 'ev:rare_drops', par: 5, label: 'Rare drops', lead: 'A lucky week so far: the rarer things keep turning up at the bottom of your pack, and the old hunters have begun to ask where you go' },
  { counter: 'gold', par: 50000, label: 'Gold earned', lead: 'A merchant’s week so far: coin has been coming in faster than you can stack it, and the purse strings are wearing thin' },
  { counter: 'ev:levelups', par: 5, label: 'Levels gained', lead: 'A scholar’s week so far: something new has clicked into place every few days, and you can feel the difference in your hands' },
].map(Object.freeze));

export const THIS_WEEK_QUIET = 'The week is still young; everything you fight, cut, mine, cook and make before Monday comes round again is counted here';

/* The hearth band's realm cells: today's counters. 'Gold earned' is gross
   ledger inflow (payouts, sales, refunds), so its title says spending is not
   taken off. */
export const THIS_WEEK_TODAY = Object.freeze([
  { counter: 'ev:kill_any', label: 'Kills today', title: 'Since midnight UTC, as the realm counts it' },
  { counter: 'gold', label: 'Gold earned', title: 'Earned since midnight UTC, as the realm counts it; spending is not taken off' },
].map(Object.freeze));
