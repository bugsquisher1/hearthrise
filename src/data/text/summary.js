// ════════════════════════════════════════════════════════════════════════
// src/data/text/summary.js — THE HUNT SUMMARY'S "BACK IN TOWN" WORDS (src/shell/back-in-town.js,
// src/shell/windows/hunt-summary.js).
//
// One row per sentence or label, read by t('summary.<key>'). The trip home is a list of
// presses on the summary (UX flow audit 2026-11-11, flow C): each row names its count and
// its value as the server holds them, and the control words are the glossary's (Equip, Sell,
// Deposit, Bless, Hunt again).
// ════════════════════════════════════════════════════════════════════════

export const SUMMARY_TEXT = Object.freeze({
  /* THE RESULT, FIRST (UI audit 2026-11-18 #1 and #2; src/shell/result-block.js): the Level line, then three figures, each a genre label
     over the server's number and one small line under it. {name} is "Level" or a skill's name. */
  lv_name: 'Level',
  lv_at: '{name} {level}',
  lv_arrow: '→',
  skill_up: '{skill} {from} → {to}',
  fig_xp: 'Level XP',
  /* Gold is what the purse kept, the coins less the store's supplies (src/shell/result-block.js goldFig); a record that sent no spend says
     its coins under Coins, never as Gold (post-patch audit 2026-11-18). */
  fig_gold: 'Gold',
  fig_coins: 'Coins',
  fig_kills: 'Kills',
  fig_time: 'Time',
  fig_per_hour: '{amount} per hour',
  fig_in: 'in {time}',
  /* The hunt on now (src/hunt-view/summary-recorder.js liveSummaryOf): its card's time line, and its row under Earlier hunts. */
  live_when: 'In progress, started {time}',
  live_row: 'In progress',
  town_head: 'Back in town',
  done: 'Done',
  /* The one press of each row: the glossary's words (src/data/text/controls.js: Equip, Sell, Deposit); Bless is the Services tab's own word. */
  bless: 'Bless',
  /* Equip: what Equip upgrades would put on (src/shell/upgrade-plan.js), its words under the count. */
  equip_n: { one: 'Equip 1 better piece', other: 'Equip {count} better pieces' },
  /* Sell: every stack the loot plan marks Sell, and the junk no plan holds (balance program L03), at the shop's bids. All junk, it says so. */
  sell_n: { one: 'Sell 1 stack for {total}', other: 'Sell {count} stacks for {total}' },
  sell_junk: 'Sell junk for {total}',
  sell_words: 'Marked Sell: {names}',
  /* Always sell these (L03): after that sale, the junk it sold with no plan, its plan set to Sell in one press. {names} the items */
  always: 'Always sell these',
  always_words: 'Set Sell on {names}',
  always_verb: 'Always sell',
  always_busy: 'Saving the plan…',
  always_done: { one: '1 item marked Sell', other: '{count} items marked Sell' },
  /* Deposit: every stack the loot plan marks Deposit, with its worth when the shop bids on any of it. */
  deposit_n: { one: 'Deposit 1 stack', other: 'Deposit {count} stacks' },
  deposit_worth: { one: 'Deposit 1 stack worth {worth}', other: 'Deposit {count} stacks worth {worth}' },
  deposit_words: { one: 'Marked Deposit: {names}, frees 1 bag space', other: 'Marked Deposit: {names}, frees {count} bag spaces' },
  /* Bless: the Blessings not on, each at the price the server quotes now. */
  bless_n: 'Bless {names}',
  /* what a Blessing does (L03, retention R6): {pct} the cut with every tier on, the server's top tier */
  bless_does: 'A death costs {pct} less XP and uses them up',
  bless_free: 'Free until Level {level}',
  bless_cost: 'Cost: {total}',
  /* THE NEXT BUY (src/shell/next-buy.js; audit 2026-11-15 F12/F20: a million gold by Level 50 and the card said nothing): the one most
     useful thing the purse covers, its press opening where it is bought. {gains}: what the piece adds ("+1 Defense"); {pct}: the next rung's total. */
  buy_gear: 'Next buy: {item} ({price})',
  buy_gear_better: '{gains} vs {worn}',
  buy_gear_empty: '{gains}, empty {slot} slot',
  /* WHERE THE HERO'S WEIGHT COMES FROM (src/shell/next-buy.js findPiece): no Shop piece of the hero's armor weight fills a bare or off-weight
     slot, so the line names the piece and the words say where it comes from. {what} its weight and slot (find_kind), {level} the Level it needs */
  find_gear: 'Next upgrade: {item} ({what})',
  find_gear_at: 'Next upgrade: {item} ({what}, Level {level})',
  find_kind: '{weight} {slot}',
  weight_heavy: 'heavy',
  weight_medium: 'medium',
  weight_light: 'light',
  buy_temper: 'Next buy: Temper {piece} ({price})',
  buy_temper_blows: 'Damage and heals +{pct}',
  buy_temper_armor: 'Damage taken −{pct}',
  buy_dummy: 'Next buy: House dummy skill ({price})',
  buy_dummy_words: 'Train at home, no hourly fee',
  buy_room: 'Next buy: {room} upgrade ({price})',
  buy_room_words: 'Next: {rung}',
  /* THE WHOLE SHELF (balance program L03): every other gold buy, each a label. {name} the server's name for the deed or the chest */
  buy_named: 'Next buy: {name} ({price})',
  buy_deed_words: 'Opens {rooms}',
  buy_chest_words: { one: '+1 Storage space', other: '+{count} Storage spaces' },
  buy_bag: 'Next buy: Bag space ({price})',
  buy_bag_words: { one: '+1 bag space', other: '+{count} bag spaces' },
  buy_refill: 'Next buy: Stamina refill ({price})',
  buy_refill_words: '+{time} of stamina',
  /* ...and a buy the purse does not cover yet: the nearest, with what it still needs ({short}: the server's price less the server's purse) */
  buy_need: 'Need {short} more',
  /* THE NEXT GROUND (src/shell/hunt-list.js nextGroundFrom; audit 2026-11-18 A12: Hunt again kept a hero in the Mill Cellar all night after Level 5):
     the Hunts list's Recommended ground when it is a step up from the one just hunted. {band} its Levels, {levels} the hero's (or the party's) */
  ground_up: 'Next ground: {ground}',
  ground_up_words: '{band}, recommended for {levels}',
  /* ...and after a ground outgrown, the card's gold press (audit 2026-11-19 L2), on the summary's foot and the away card: it opens that ground in Hunts */
  go_ground: 'Go to {ground}',
  /* A GROUND OUTGROWN WITH HEROES STILL TO MAKE (designer D-1, the Path's first_level_5): the line, its press, and the next ground as the second press.
     {name} the hero, {ground} the ground outgrown, {n} the heroes still to make in words */
  party_line: { one: '{name} has outgrown the {ground}. You have {n} more hero to make, and the Sewer wants a full party.',
    other: '{name} has outgrown the {ground}. You have {n} more heroes to make, and the Sewer wants a full party.' },
  party_go: 'Build your party',
  alone_to: 'Go on alone to {ground}',
  /* The answers. */
  selling: 'Selling…',
  depositing: 'Depositing…',
  sold: 'Sold for {gold}',
  sold_plain: 'Sold',
  deposited: { one: 'Deposited 1 stack', other: 'Deposited {count} stacks' },

  /* WHY THE HUNT ENDED (src/hunt-view/summary-model.js END_WORDS, one per END_ORDER name): labels on the end card. */
  end_died: 'Died',
  /* a death in a mode that takes nothing for one (the Burning Tower spits you out: session-modes.js deathLossPm 0) */
  end_spat: 'Spat out, no XP lost',
  died_in: '{name} died in {ground}',
  end_boss_felled: 'Boss defeated, new title earned',
  end_party_member_died: 'Party member died',
  end_party_member_left: 'Party member left',
  /* the ground's hunt ends at a Level (src/data/hunt-grounds.js endsAtLevel: the Mill Cellar's 5); {level} that Level, the _plain form when the
     card cannot name the ground's row. The card's Next ground row names where to go. */
  end_outgrown: 'Ground outgrown at Level {level}',
  end_outgrown_plain: 'Ground outgrown',
  end_heals_out: 'Out of healing supplies',
  end_ammo_out: 'Out of ammunition',
  end_runes_out: 'Out of runes',
  end_no_fight: 'No hits landed',
  end_gold_out: 'Gold reserve reached',
  /* ...said with the numbers that ended it (post-patch audit 2026-11-18 B3: "Gold reserve reached" beside Gold +2,679 gp, nothing said why).
     {spent} the store's supplies, {coins} the coins, both the hunt's own tally; {floor} the Gold reserve, the server's setting. Loot is not
     gold until it is sold, so it is not in the sum. The _floor form is for a card that has no tally to say it with.
     NO CAUSE IS CLAIMED (post-140 audit C9: "the coins brought in 14,325 gp, so your gold fell to your 20,000 gp reserve" while the coins beat
     the supplies and the purse sat under a reserve raised mid-hunt). What the server did is the rule: it sells no store supply that would
     leave the purse under the reserve. It keeps no purse at the stop, so none is said. */
  end_gold_out_why: 'Gold reserve reached ({floor}) · Supplies {spent} · Coins {coins}',
  end_gold_out_floor: 'Gold reserve reached ({floor}) · No more store supplies',
  end_rule: 'Stop rule met',
  end_stamina: 'Out of stamina · Stamina refills 1 h per hour',
  end_hours: 'Time limit reached',
  end_boss_time: 'Time ran out',
  end_floor_time: 'Floor time ran out',
  end_left: 'Left the hunt',
  end_changed: 'Moved to another hunt',
  end_server: 'Ended by the server',
  end_plain: 'Hunt ended',
  /* the server forfeited the hunt's last window (six refused in a row) */
  forfeit_server: 'Stopped by the server. The last minutes did not count',
  forfeit_left: 'Left the hunt. The last minutes did not count',
  stamina_now: '{why}. Stamina now: {left}',
  /* Hunt again, off for a party member */
  again_elsewhere: 'Party hunting elsewhere',
  again_leader: 'Party leader picks the hunt',
  /* ...and off on a ground this hero has outgrown (the server refuses it: 2027-05-28-cellar-outgrown.sql) */
  again_outgrown: 'Ground outgrown',
});
