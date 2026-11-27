// ════════════════════════════════════════════════════════════════════════
// src/data/text/coach.js — THE COACH'S WORDS (src/data/hunt-tutorial.js).
//
// One row per card line, read by t('coach.<key>') (src/render/player-text.js).
// A coach card is a short title and ONE line that names the press (Tyler
// 2026-11-16, the Huntera model: "Sell junk" / "Shop → Sell all junk"):
// a *_title row is at most 4 words, every other row one line of at most 10
// words that opens on a verb, a path or a label (tests/copy-lint.mjs
// coach-card). {label} is Tamsin's task monster as her board counts it,
// {count} its kills, {ground} and {next} are hunting grounds, {level} the
// Level that opens {next}, {slot} a bar slot ("slot 4"); goal_* rows are the
// What next line's goals.
// ════════════════════════════════════════════════════════════════════════

export const COACH_TEXT = Object.freeze({
  /* every card's two presses (Tyler 2026-11-11: no tip is mandatory): Got it closes this one, Don't show tips hides them all */
  got_it: 'Got it',
  /* the card's own presses, and what a screen reader hears for them (src/shell/launcher-coach.js coachHtml) */
  close: 'Close',
  close_card: 'Close {title}',
  minimize: 'Minimize',
  minimize_card: 'Minimize {title}',
  show: '{title}: show',
  show_new: '{title} (new): show',
  more: 'More',
  less: 'Less',
  no_tips: 'Don\'t show tips',
  /* Tamsin's rats, the first ten minutes (designer 2026-11-10) */
  tamsins_rats_title: 'Tamsin\'s rats',
  tamsins_rats: 'Town → Tamsin\'s tally → Take {label}',
  tamsins_rats_in: 'Press Take on {label}',
  rats_count_title: 'Tamsin\'s count',
  rats_count: 'Kill {count} {label} (Tamsin\'s task)',
  /* THE BURNING TOWER, once at its Level while the server offers it (hunt-tutorial.js burning_tower) */
  tower_title: 'The Burning Tower',
  tower: 'Town → Burning Tower → Enter',
  tamsin_owes_title: 'Rats done',
  tamsin_owes: 'Leave the hunt · Collect from Tamsin',
  /* THE FARM, from town (audit 2026-11-18 A4): the way there first, since the Farm lives in the Town menu */
  plant_land: 'Town → Farm (J) → Plant Turnip Seeds',
  plant_land_in: 'Press Plant on each empty plot',
  back_down_title: 'Back for Level {level}',
  back_down: 'Hunts → {ground} → Enter',
  back_down_in: 'Press the {ground}, then Enter',
  /* THE FIRST DANGEROUS RUN (board 2026-11-15 F5: Normal costs no food to Level 15, Dangerous does and gives more XP); {ground} a ground in the
     hero's range with a Dangerous tier */
  keep_hunting: 'Safe to close the game · Hunts on to Level {level}',
  brook: 'Hunt here to Level {level} for {next}',
  /* Tamsin's wolves */
  tamsins_task: 'Town → Tamsin\'s tally → Take {count} {label}',
  /* a hero in a party: the party's task on the party's ground (tally-tasks.js sewer_rat_king), never the lone wolves */
  tamsins_task_party: 'Town → Tamsin\'s tally → Take {label}',
  tamsins_task_party_in: 'Press Take on {label}',
  tamsins_task_in: 'Pick {weight} armor, then Take {label}',
  tamsins_task_in_any: 'Pick an armor weight, then Take {label}',
  tamsin_pays: 'Kill {count} {label}, then collect {gold} gp from Tamsin',
  /* her task's count is done, the server's row says so (audit 2026-11-15 F3): while hunting, then back in town */
  count_done: 'Leave the hunt · Collect {gold} gp from Tamsin',
  count_done_town: 'Town → Tamsin\'s tally → collect {gold} gp',
  /* THE REDESIGN'S FIRST HOUR (lane/first-hour-rewrite, 2026-11-23; docs/design/redesign/20-v030-the-roads.md section 3). Each card reads
     the server's own section and is passed by while it sends none, so the chain reads right with the Roads switch on or off, and before
     or after a ground joins the Danger scale. */
  /* a Talent point to spend (the `talents` section, 1064-roads-sample.sql): the Character window's Talents tab, then its one press */
  talent_point_title: 'Talent point',
  talent_point: 'Character → Talents → Spend as suggested',
  talent_point_in: 'Press Talents, then Spend as suggested',
  /* hunting a ground on the Danger scale (the `danger` section): the depth the party holds, said as the HUD says it */
  depth_title: 'Depth {depth} of {of}',
  depth: 'Depth climbs by itself · Deeper pays more',
  /* the newest hunt's report holds a fall back (1057-danger-falls.sql falls, a hero left standing) */
  fell_back_title: 'Fell back',
  fell_back: 'Backed off a depth to stay alive · Risk sets when',
  /* the Risk pick, met at the first party ground on the scale ({ground}): Steady is the default, Bold the only stance that can die */
  risk_pick_title: 'Pick a Risk',
  risk_pick: 'Hunts → {ground} → Risk',
  risk_pick_in: 'Steady is set · Bold pays more and can die',
  /* a Blessing matters only where a hero can die: Bold, or after a death */
  bless_title: 'Bless before Bold',
  /* stamina low: the redesign's top-up is a hunting block (src/data/time-blocks.js) */
  stamina_low: 'Press + beside stamina to buy a hunting block',
  /* the cards a builder states from the facts (hunt-tutorial.js SAY) */
  styles: 'Switch style: Equip another weapon in town',
  styles_in: 'Press a weapon, then Equip',
  load_shot: 'Bag → {shot} → Put on the bar',
  load_shot_in: 'Press {shot}, then Put on the bar',
  bar_intro: 'Press a slot to change what it does',
  why_waits: 'Press {slot} to change when it fires',
  spell_runes: 'Press {slot}, pick {rune}, then Save',
  food_when: 'Press {slot} and set its HP with − or +',
  food_when_to: 'Press {slot} and set it to {pct}% HP',
  food_when_both: 'Press {slot} and {other}, set both to {pct}% HP',
  food_order_lower: 'Press {slot} and lower it to {pct}% HP',
  food_order_later: 'Press {slot}, then Later until after {own}',
  food_order_both: 'Press {slot}, lower it to {pct}%, then Later',
  first_spell: 'Press {slot} → {tab} → {spell} → {rune}',
  leave_cellar: 'Leave the hunt · Back to town',
  more_heroes: { one: 'All characters → Recruit 1 hero', other: 'All characters → Recruit {count} heroes' },
  leave_party: 'Tell your party, then leave the hunt',
  bless: 'Shop → Services → Bless',
  first_eat: 'Cook more {item} before it runs out',
  first_drink_store: 'Plant turnips for juice',
  first_drink_own: 'Brew more {item} before it runs out',
  party_own: 'Right-click {name}\'s tab → Invite to party',
  fuel_hearth: 'Bag → {fuel} → Burn all',
  fuel_hearth_in: 'Press {fuel}, then Burn all',
  harvest_ready: 'Farm → Harvest, then cook Turnip Juice',
  harvest_cook: 'Gathering and crafting → Cooking → {recipe}',
  juice_slot: 'Put {item} in an empty slot',
  juice_slot_before: 'Put {item} in a slot before {slot}',
  club_make: 'Gathering and crafting → Smithing → {recipe}',
  club_equip: 'Bag → {club} → Equip',
  home_gather: 'Gather {item}: {have} of {qty}',
  /* ...once stamina has run out (plan L08): the job is set for the count still short, and the hero waits in town when it is done. */
  home_job: '{verb} {n} {item} while stamina refills',
  home_buy: 'House → Buy the {deed}',
  purse_goal: 'Buy a House deed',
  /* WHAT NEXT: one goal a line (hunt-tutorial.js nextGoal) */
  goal_armor: 'Shop → Buy gloves or a belt to train Defense',
  goal_recruits: { one: 'Open All characters and recruit 1 hero', other: 'Open All characters and recruit {count} heroes' },
  goal_slot: 'Buy a {nth} hero slot for {gold}',
  goal_top_up: 'Press + beside stamina: {hours} h for {gold}',
  goal_step_up: 'Next step up: {ground}, Level {level}',
  goal_harvest: 'Harvest {crops} on the Farm (J)',
  goal_tally: 'Take a task on Tamsin\'s tally (Q)',
  goal_deed: 'Buy the {deed} in the House',
  goal_saving: 'Next goal: a {nth} hero slot, {gold}',
  goal_party: 'Find a party for {ground}',
  goal_party_how: 'Invite a friend or create a second hero',
  goal_party_how_own: 'Right-click your other hero\'s tab → Invite to party',
  goal_gear: 'Next gear at Level {level}: {gear}',
  goal_gear_made: 'Next gear at Level {level}: {gear}, made in {skill}',
  goal_gear_made_at: 'Next gear at Level {level}: {gear}, made at {skill} {req}',
  goal_ground: 'Next ground: {ground}, Level {level}+',
  goal_ground_party: 'Next ground: {ground}, Level {level}+ with a party',
  goal_plant: 'Plant a seed on the Farm (J)',
  goal_skill: 'Next at {skill} {level}: {unlock}',
  /* THE BLOCK RULE'S ONE OFFER (src/shell/time-offer-card.js, 12-targets 9.3): the purse first holds 3 days of pay. {n} a choice the
     server offers, {hours} a hunting block, {price} the next one's price (the server's) */
  offer_title: 'Extra hunting time',
  offer: 'Your purse is filling up. Gold can buy extra hunting time every day.',
  offer_block: 'Hunting block · +{hours} each · Bought only while hunting',
  offer_block_price: 'Hunting block · +{hours} for {price} · Bought only while hunting',
  offer_later: 'Change it later in Shop → Services',
  offer_up_to: 'Up to {n} a day',
  offer_not_now: 'Not now',
  offer_saving: 'Saving…',
});
