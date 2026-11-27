// ════════════════════════════════════════════════════════════════════════
// src/data/text/away.js — WHAT A HERO DID AFTER ITS HUNT ENDED, AND WHAT WOULD HAVE FILLED THE TIME
// (src/shell/after-hunt.js: the away card and the hunt summary's reason line).
//
// One row per sentence, read by t('away.<key>'). Every fact behind a row is the server's: the hunt's end
// reason and time, and the hero's activity pointer (player_state.active_kind / active_id / active_since).
// An automatic end sends the hero back to its last gathering job (src/data/hunt-sessions.js RESUME_AFTER_END), so the
// gathering line is true after every one of them. A bench that was running goes back too, but only for the count it
// had left when the hunt started (2027-04-24-bench-resume.sql), so it is gathering that fills a night.
// ════════════════════════════════════════════════════════════════════════

export const AWAY_TEXT = Object.freeze({
  /* {name} when the server has not sent the hero's name yet. */
  your_hero: 'Hero',
  /* Out of stamina (after-hunt.js NEXT.stamina): what uses none while it comes back. {loops} the free_* words this hero has open
     (after-hunt.js staminaFreeOf: "train at the yard, gather, craft or farm"). */
  next_stamina: 'While stamina refills: {loops}',
  free_yard: 'train at the yard',
  free_gather: 'gather',
  free_craft: 'craft',
  free_farm: 'farm',
  /* THE RETURN WITH STAMINA SHORT (audit 2026-11-19 L4: 1 h 9 min of 12 h and one press, Hunt again): the away card's line and its presses,
     each opening that loop's window. */
  rest_head: 'No stamina needed',
  free_go_yard: 'Training Yard',
  free_go_work: 'Gathering and crafting',
  free_go_farm: 'Farm',
  /* A training session that reached its longest run (after-hunt.js TRAIN_NEXT). */
  next_train_again: 'Tip: start training again',
  /* A span over two days (after-hunt.js spanWords): whole days, rounded down. */
  span_days: { one: '{count} day', other: '{count} days' },
  /* THE AWAY CARD (away-recap.js, away-work.js), one sentence a fact (QA audit 2026-11-18 N6: "Away 176 h 2 min: Wren hunted ...: Level 5 to 10"
     ran three clauses together on colons). {time} "2 h 5 min" or "7 days"; {who} what the hero did ("Wren hunted Mill Cellar"); {facts} the
     server's differences, "Level 5 to 10, +1,200 Level XP, 40 kills". */
  card_head: 'Away {time} · {who}',
  card_facts: '{facts}',
  card_hunted: '{name} hunted {ground}',
  /* ...when the yard took over from a hunt whose ground neither the stamp nor a death row names (a stamp from an older build) */
  card_hunted_off: '{name} went hunting',
  /* how long ago the hunt ended ({time}), or that it has with no time said */
  card_ended_ago: 'Hunt ended {time} ago',
  card_ended: 'Hunt ended',
  /* A town job's line on the card, after the card's own head ({who} "Tess mined the Copper Rock", {facts} what it made and where it stands). */
  card_work: '{who} · {facts}',
  /* A TOWN JOB STILL RUNNING SAYS HOW IT ENDS (retention dive 2026-11-20: "Still mining", 6,001 Copper Ore for a 20-ore errand, and no way back).
     A gathering job has no count (the server's job runs until stopped), a bench run may ({n}: the server's count left). Its press opens the window. */
  work_how_gather: 'Runs until stopped (Gathering and crafting)',
  work_how_left: '{n} left · Stop in Gathering and crafting',
  work_how_bench: 'Runs until out of materials',
  work_change: 'Stop or change it',
  /* What a job still running is doing, by its skill, before how it ends (src/shell/away-work.js); a bench with no word of its own says work_still. */
  work_still_woodcutting: 'Still chopping',
  work_still_mining: 'Still mining',
  work_still_fishing: 'Still fishing',
  work_still_cooking: 'Still cooking',
  work_still: 'Still crafting',
  /* What a gathering hero did, before the node's name: "Wren chopped the Oak Tree" ({node}: the node's own name). */
  work_did_woodcutting: 'chopped the {node}',
  work_did_mining: 'mined the {node}',
  work_did_fishing: 'fished at the {node}',
  /* A JOB'S COUNT AND ITS "THEN" (1026-job-counts.sql, plan L08): the server's count ({done} of {count}) and what the hero does at the end. */
  work_how_count: '{done} of {count} done · {after}',
  work_then_wait: 'Then: wait in town',
  work_then_hunt: 'Then: back to hunting',
  /* ...and a job the server ended while you were away: its count, and what came of its "then" ({why}: the hunt's own refusal, said plainly). */
  work_end_count: 'Done: {done} of {count}',
  work_end_stopped: 'Stopped at {done} of {count}',
  work_end_waited: 'Waiting in town',
  work_end_hunting: 'Back to hunting',
  work_end_going: 'Heading back to hunting',
  work_end_no_hunt: 'Can\'t hunt ({why}) · Waiting in town',
  /* THE WHILE YOU WERE AWAY CARD (src/shell/windows/away.js, UI audit 2026-11-18 #2): its head, each hero's labels and the line under the figures. */
  card_gone: 'Away {time}',
  card_best: 'Best find',
  card_still: 'Still hunting',
  card_still_stamina: 'Still hunting, {time} of stamina left',
  card_ended_when: 'Ended {time} ago',
  card_stamina: 'Stamina {time}',
  card_summary: 'Hunt summary',
  card_ok: 'OK',
  /* THE INNER FLAME ON THE RETURN (21 section 1.5, lane/f1-inner-flame): {n} the Remains the hunt burned on the company's fire, {pct} the
     Rare chance it rolled at, the server's own (flame-sections.js flameHuntOf). One of the three, by what the server says happened. */
  card_flame: 'Flame: burned {n} Remains · Rare chance +{pct}%',
  card_flame_burned: 'Flame: burned {n} Remains',
  card_flame_luck: 'Flame: Rare chance +{pct}%',
  /* Under the Gold figure, which is what the purse kept (QA audit 2026-11-18 A6): {looted} the coins, {paid} the store's supplies. */
  card_gold_both: '{looted} in coins, {paid} on supplies',
  card_gold_looted: '{looted} in coins',
  /* ...and when the yard took over from the hunt (post-140 audit C3: the card said +29,219 while the purse moved +25,925), {yard} what the yard billed. */
  card_gold_yard_both: '{looted} in coins, {paid} on supplies, {yard} at the yard',
  card_gold_yard: '{looted} in coins, {yard} at the yard',
  /* A hero still training: its door is the Training window (a training session is no hunt, Tyler 2026-11-16). */
  card_training: 'Open Training',
  /* {doing} is the server's job in words ("mining the Copper Rock", party-sections.js townActivityWords). */
  after_went: 'Then: back to {doing}',
  /* {time} is "5 h 45 min", from the hunt's end (plus the walk home) to the server's now. */
  after_waited: 'Waited in town: {time}',
  /* The one next thing that would have filled the time, by what ended the hunt (after-hunt.js NEXT). */
  /* Any other automatic end: what comes next is the hunt page's own control (Tyler 2026-11-15, the itinerary). */
  next_gather: 'Tip: set When the hunt ends',
  /* A party end the hero's own box chose (party_member_left / party_member_died; Tyler 2026-10-22, on by default): it names the box by
     the party panel's own label, src/data/party.js PARTY_COPY.leaveTogether, word for word (shell-core R3p). */
  next_party: 'Tip: uncheck Leave if anyone leaves the hunt or dies',
  next_longer: 'Tip: longer hunt (up to stamina left)',
  next_food: 'Tip: pack more food',
  next_ammo: 'Tip: pack more ammo',
  next_runes: 'Tip: pack more runes',
  next_gold: 'Tip: lower the gold reserve or pack supplies',
  /* outgrown (src/data/hunt-grounds.js endsAtLevel: the Mill Cellar's hunt ends at Level 5): the hunt summary names the ground, Hunts tags it */
  next_outgrown: 'Tip: Hunts → pick a Recommended ground',
  /* gold_out with food or drink in the bag that no slot of the bar uses (after-hunt.js spareSupplyOf): {item} its name. */
  next_bar: 'Tip: put {item} on the bar',

  /* WHEN THE HUNT ENDS (Tyler 2026-11-15, the itinerary; src/shell/hunt-after.js). The hunt page's one control: its heading,
     its choices ({doing} the server's job in words, {skill} a skill's name) and the line under the picked one. */
  when_ends: 'When the hunt ends',
  opt_wait: 'Wait in town',
  opt_job: 'Go back to {doing}',
  opt_train: 'Train {skill} at the yard',
  note_wait: 'Waits in town',
  note_job: 'Works until stopped',
  /* {n} what the bench still had to make, the server's count. */
  note_job_left: 'Makes the last {n}',
  note_no_job: 'Waits in town (no job to resume)',
  /* {fee} the yard's fee for an hour at this hero's skill, {hours} its longest stay; both the server's. Each hour is billed whole at its
     start (src/data/training.js; Tyler 2026-11-08, 11-15): the Training window's own label (post-140 audit C13). */
  train_cost: '{fee} gp/h, paid hourly in advance · up to {hours} h · Out of gold: waits in town',
  train_level: 'Yard from Level {level}',
  train_party: 'Training is solo',
  after_hunting: 'Change this after the hunt',
  saving: 'Saving…',
  /* The running session's own plan, on the analyzer: a label (Tyler 2026-11-14), the same for a hunt and a training session. */
  then_wait: 'Then: wait in town',
  then_job: 'Then: back to {doing}',
  then_job_left: 'Then: back to {doing} ({n} left)',
  then_train: 'Then: train {skill} at the yard',
  /* What came of the ended hunt's choice, on the summary and the away card. */
  done_pending: '{name}: heading to the yard ({skill})',
  done_started: '{name}: training {skill} at the yard',
  done_chose_wait: '{name} waited in town',
  done_gold: '{name} waited in town · Yard: {fee} gp/h',
  done_gold_purse: '{name} waited in town · Yard: {fee} gp/h · Gold: {purse}',
  done_level: '{name} waited in town · Yard requires Level {level}',
  done_party: '{name} waited in town · Training is solo',
  done_no_train: '{name} waited in town · Can\'t train {skill}',

  /* CARRY ON (Tyler RULED 27-1, 2026-11-20; src/shell/carry-on.js, 1024-carry-on.sql): the return card's one press for the whole account, and
     what it will do for each hero, every fact the server's plan. {name} the hero, {ground} its ground, {tier} the tier's name, {items}
     "40 Cooked Swordfish, 20 Mana Potion", {gold} a gold figure. One hero a line, short sentences, no semicolons. */
  carry_press: 'Carry on',
  carry_head: 'Back to last hunt',
  carry_go: '{name}: {ground} ({tier})',
  carry_party: 'With party',
  carry_storage: 'From Storage: {items}',
  carry_short: 'Short: {items} (store refills in the hunt)',
  carry_bless: 'Bless again: {gold}',
  carry_loot: 'Loot plan first',
  carry_job_gather: 'Stops gathering',
  carry_job_artisan: 'Stops crafting',
  carry_job_training: 'Stops training',
  carry_no: '{name}: stays in town ({why})',
  carry_leader: '{name}: waiting for {leader} (party leader)',
  carry_parked: '{name}: unchanged',
  carry_went: { one: '{count} hero sent out', other: '{count} heroes sent out' },
  carry_went_none: 'No heroes sent out',
  /* The end card's press for a party of the player's own heroes (21-combat change 9): {count} the party's own heroes. */
  again_both: 'Hunt again, both',
  again_all_three: 'Hunt again, all three',
  again_all_four: 'Hunt again, all four',
  again_bless: 'Bless again: {gold} · Press again to go',

  /* THE COMPANY'S PLAN LINES on the return card (1051-company-start.sql, designer D-2): set once for every hero. */
  line_wear: 'Wear upgrades',
  line_wear_tip: 'Equips better gear from the bag before each hunt',
  line_on: 'On',
  line_off: 'Off',
  line_falls: 'If one falls',
  line_hunt_on: 'The rest hunt on',
  line_all_home: 'All come home',
  line_mixed: 'Set hero by hero',
  line_reading: 'Reading your plan…',
  carry_wore: 'Equipped {items}',
  carry_wear_refused: 'Gear unchanged',
  carry_task: 'Took Tamsin\'s task',
  carry_joins: '{name}: joins {partner} after this hunt',
  carry_seated: 'Joined {partner}\'s party',

  /* "NEEDS YOU" (designer D-2 section 2.3): one row a kind, three shown, the rest counted. src/shell/needs-you.js. */
  needs_head: 'Needs you',
  needs_more: { one: '{count} more', other: '{count} more' },
  needs_outgrown: '{name}: {ground} outgrown',
  needs_outgrown_go: 'Go to {ground}',
  /* the top of a Danger-scale ground (src/shell/needs-you/outgrown.js, lane/r10): a label, the next open ground on the scale, a Go button */
  needs_top_next: 'Ready for: {ground}',
  needs_top_max: 'Max depth reached',
  needs_top_go: 'Go',
  needs_bag_full: '{name}: bag full',
  needs_ran_out: '{name}: out of {thing}',
  needs_thing_gold_out: 'gold',
  needs_thing_heals_out: 'food',
  needs_thing_runes_out: 'runes',
  needs_thing_ammo_out: 'ammo',
  needs_change_plan: 'Change the plan',
  needs_death: '{name} died · Death cost {xp} Level XP · No Blessing active',
  needs_death_some: '{name} died · No Blessing active',
  needs_bless: 'Bless',
  needs_gear: { one: 'Better gear waiting: {count} hero', other: 'Better gear waiting: {count} heroes' },
  needs_gear_choose: 'Choose',
  needs_gear_hunting: { one: 'Better gear unworn: {count} hero hunting', other: 'Better gear unworn: {count} heroes hunting' },
  needs_regear: 'Equip upgrades and go back in',
  /* the recruit press (src/shell/needs-you/recruits.js, 1053-recruits.sql): {count} the recruits, {name} the first hero, {level} their Level */
  needs_recruits: { one: '{count} recruit ready · Joins {name} at Level {level}', other: '{count} recruits ready · Join {name} at Level {level}' },
  needs_recruits_go: 'Recruit',
});
