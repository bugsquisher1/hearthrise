// Companion definitions
//
// ── b228 · THE BONUS REBASE (docs/design/bonus-rebase.md §3.1, §5.4) ────────
// Two changes landed here together, deliberately, because either one alone
// would have been dishonest:
//
// 1. MAGNITUDES. Every companion percentage comes to a base of .01. A pet is
//    scaled by `1 + 0.05×(lv−1)` over thirty levels (×2.45), so .01 is +2.45%
//    at level 30 — the budget's designed share for "a 1-in-2,500 pet at max
//    level is worth about one room rung" (§2.2). The old .05–.10 bases made a
//    level-30 Forge Imp worth +24.5% smithing: larger than the entire castle
//    Smeltery ladder and half the homestead Forge, from a pet nobody budgeted.
//
// 2. THE FIVE MISSPELLED KEYS. `xpB`, `goldBonus` and `prayerXp` are not
//    getBonus keys — the real names are `allXP`, `goldFind` and `prayerSpeed`.
//    Fox, Lichling, Raccoon, Owl and Grave Wisp have therefore paid EXACTLY
//    NOTHING since they shipped. Correcting the names is a power INCREASE, so
//    it lands in the same commit as the magnitudes that pay for it — never
//    after, which is how an unbudgeted buff sneaks into a governed economy.
//    (`xpB` survives as an EQUIPMENT stat elsewhere; it is only wrong here.)
//
// Not percentages, and deliberately untouched: `strB`/`atkB`/`defB`/`hpRegen`
// are gear-class stat points (§2.4), and the proc `chance` values were already
// inside the grammar. `rareDrop` keeps its magnitude — it is a ghost with no
// reader (§1.7) and is left in grammar for the day a drop-roll seam wires it.
// `farmYield` is a flat count of crops, so its base is +1 crop, not a percent.

export const COMPANIONS = {
  fox:       {n:'Fox',          icon:'🦊', role:'utility', bonus:{allXP:.01, strB:1}, source:'starter',
              proc:{trigger:'combatHit', chance:.05, effect:'gold', amount:1, label:'+1 gold'}},
  wolf_pup:  {n:'Wolf Pup',     icon:'🐺', role:'combat',  bonus:{strB:3, atkB:1},  source:'drop:small_wolf',
              proc:{trigger:'kill',      chance:.03, effect:'doubleDrop',          label:'Double drop!'}},
  sparrow:   {n:'Sparrow',      icon:'🐦', role:'gather',  bonus:{gatherSpeed:.01},  source:'shop:5000',
              proc:{trigger:'gather',    chance:.02, effect:'instant',              label:'Instant!'}},
  bunny:     {n:'Bunny',        icon:'🐰', role:'gather',  bonus:{farmYield:1},      source:'quest:harvest100',
              proc:{trigger:'harvest',   chance:.10, effect:'doubleYield',          label:'Double crop!'}},
  honeybee:  {n:'Honeybee',     icon:'🐝', role:'artisan', bonus:{cookSpeed:.01},    source:'shop:8000:cooking25',
              proc:{trigger:'cook',      chance:.05, effect:'refundIngredients',    label:'Free meal!'}},
  badger:    {n:'Badger',       icon:'🦡', role:'combat',  bonus:{strB:5, defB:2},   source:'drop:bear',
              proc:null},
  hawk:      {n:'Hawk',         icon:'🦅', role:'gather',  bonus:{rareDrop:.10},     source:'drop:panther',
              proc:{trigger:'kill',      chance:.01, effect:'guaranteedRare',       label:'Rare drop!'}},
  whelp:     {n:'Whelp',        icon:'🐉', role:'combat',  bonus:{strB:8, crit:.03}, source:'hatch:dragon_egg',
              proc:{trigger:'combatHit', chance:.02, effect:'fireDot',              label:'Fire breath!'}},
  scorpion:  {n:'Scorpion',     icon:'🦂', role:'combat',  bonus:{atkB:5, crit:.05}, source:'drop:shadow_creeper',
              proc:null},
  raccoon:   {n:'Raccoon',      icon:'🦝', role:'utility', bonus:{goldFind:.01},     source:'shop:25000',
              proc:{trigger:'kill',      chance:.20, effect:'extraGold', amount:5, label:'+5 gold'}},
  owl:       {n:'Owl',          icon:'🦉', role:'artisan', bonus:{prayerSpeed:.01},  source:'shop:8000:prayer50',
              proc:null},
  tortoise:  {n:'Tortoise',     icon:'🐢', role:'combat',  bonus:{defB:10, hpRegen:2}, source:'drop:ancient_bear',
              proc:null},

  /* ── Skilling + boss pets (b202, SYS-4) — OSRS-style: every skill has a
     rare pet earned by DOING the skill (1-in-N actions, N large — these are
     meant to be HARD), plus boss pets from boss kills. Rolled by
     src/features/pets.js (source kinds 'skill:' and 'boss:' — the legacy
     'drop:'/'shop:'/'quest:' kinds stay handled by companions.js). */
  beaver:       {n:'Beaver',        icon:'🦫', role:'gather',  bonus:{gatherSpeed:.01}, source:'skill:woodcutting:2500', proc:{trigger:'gather', chance:.03, effect:'instant', label:'Timber!'}},
  rock_golem:   {n:'Rock Golem',    icon:'🗿', role:'gather',  bonus:{gatherSpeed:.01}, source:'skill:mining:2500',      proc:{trigger:'gather', chance:.03, effect:'instant', label:'Shattered!'}},
  heron:        {n:'Heron',         icon:'🪿', role:'gather',  bonus:{gatherSpeed:.01}, source:'skill:fishing:2500',     proc:{trigger:'gather', chance:.03, effect:'instant', label:'Snap catch!'}},
  squirrel:     {n:'Squirrel',      icon:'🐿️', role:'gather',  bonus:{farmYield:1},     source:'skill:farming:1200',     proc:{trigger:'harvest', chance:.08, effect:'doubleYield', label:'Buried extra!'}},
  phoenix_chick:{n:'Phoenix Chick', icon:'🐤', role:'artisan', bonus:{cookSpeed:.01},   source:'skill:cooking:2000',     proc:{trigger:'cook', chance:.04, effect:'refundIngredients', label:'Rekindled!'}},
  forge_imp:    {n:'Forge Imp',     icon:'👺', role:'artisan', bonus:{smithSpeed:.01},  source:'skill:smithing:2000',    proc:null},
  silkling:     {n:'Silkling',      icon:'🕷️', role:'artisan', bonus:{craftSpeed:.01},  source:'skill:crafting:2000',    proc:null},
  grave_wisp:   {n:'Grave Wisp',    icon:'🕯️', role:'artisan', bonus:{prayerSpeed:.01}, source:'skill:prayer:1200',      proc:null},
  lichling:     {n:'Lichling',      icon:'💀', role:'utility', bonus:{allXP:.01},       source:'boss:lich:200',          proc:{trigger:'kill', chance:.02, effect:'extraGold', amount:25, label:'Soul tithe!'}},
  dragonling:   {n:'Dragonling',    icon:'🐲', role:'combat',  bonus:{rareDrop:.15, strB:5}, source:'boss:dragon:200',   proc:{trigger:'combatHit', chance:.02, effect:'fireDot', label:'Dragonfire!'}},
};
