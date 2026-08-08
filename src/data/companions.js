// Companion definitions

export const COMPANIONS = {
  fox:       {n:'Fox',          icon:'🦊', role:'utility', bonus:{xpB:.02, strB:1}, source:'starter',
              proc:{trigger:'combatHit', chance:.05, effect:'gold', amount:1, label:'+1 gold'}},
  wolf_pup:  {n:'Wolf Pup',     icon:'🐺', role:'combat',  bonus:{strB:3, atkB:1},  source:'drop:small_wolf',
              proc:{trigger:'kill',      chance:.03, effect:'doubleDrop',          label:'Double drop!'}},
  sparrow:   {n:'Sparrow',      icon:'🐦', role:'gather',  bonus:{gatherSpeed:.05},  source:'shop:5000',
              proc:{trigger:'gather',    chance:.02, effect:'instant',              label:'Instant!'}},
  bunny:     {n:'Bunny',        icon:'🐰', role:'gather',  bonus:{farmYield:.10},    source:'quest:harvest100',
              proc:{trigger:'harvest',   chance:.10, effect:'doubleYield',          label:'Double crop!'}},
  honeybee:  {n:'Honeybee',     icon:'🐝', role:'artisan', bonus:{cookSpeed:.08},    source:'shop:8000:cooking25',
              proc:{trigger:'cook',      chance:.05, effect:'refundIngredients',    label:'Free meal!'}},
  badger:    {n:'Badger',       icon:'🦡', role:'combat',  bonus:{strB:5, defB:2},   source:'drop:bear',
              proc:null},
  hawk:      {n:'Hawk',         icon:'🦅', role:'gather',  bonus:{rareDrop:.10},     source:'drop:panther',
              proc:{trigger:'kill',      chance:.01, effect:'guaranteedRare',       label:'Rare drop!'}},
  whelp:     {n:'Whelp',        icon:'🐉', role:'combat',  bonus:{strB:8, crit:.03}, source:'hatch:dragon_egg',
              proc:{trigger:'combatHit', chance:.02, effect:'fireDot',              label:'Fire breath!'}},
  scorpion:  {n:'Scorpion',     icon:'🦂', role:'combat',  bonus:{atkB:5, crit:.05}, source:'drop:shadow_creeper',
              proc:null},
  raccoon:   {n:'Raccoon',      icon:'🦝', role:'utility', bonus:{goldBonus:.05},    source:'shop:25000',
              proc:{trigger:'kill',      chance:.20, effect:'extraGold', amount:5, label:'+5 gold'}},
  owl:       {n:'Owl',          icon:'🦉', role:'artisan', bonus:{prayerXp:.10},     source:'shop:50:prayer50',
              proc:null},
  tortoise:  {n:'Tortoise',     icon:'🐢', role:'combat',  bonus:{defB:10, hpRegen:2}, source:'drop:ancient_bear',
              proc:null},

  /* ── Skilling + boss pets (b202, SYS-4) — OSRS-style: every skill has a
     rare pet earned by DOING the skill (1-in-N actions, N large — these are
     meant to be HARD), plus boss pets from boss kills. Rolled by
     src/features/pets.js (source kinds 'skill:' and 'boss:' — the legacy
     'drop:'/'shop:'/'quest:' kinds stay handled by companions.js). */
  beaver:       {n:'Beaver',        icon:'🦫', role:'gather',  bonus:{gatherSpeed:.06}, source:'skill:woodcutting:2500', proc:{trigger:'gather', chance:.03, effect:'instant', label:'Timber!'}},
  rock_golem:   {n:'Rock Golem',    icon:'🗿', role:'gather',  bonus:{gatherSpeed:.06}, source:'skill:mining:2500',      proc:{trigger:'gather', chance:.03, effect:'instant', label:'Shattered!'}},
  heron:        {n:'Heron',         icon:'🪿', role:'gather',  bonus:{gatherSpeed:.06}, source:'skill:fishing:2500',     proc:{trigger:'gather', chance:.03, effect:'instant', label:'Snap catch!'}},
  squirrel:     {n:'Squirrel',      icon:'🐿️', role:'gather',  bonus:{farmYield:.15},   source:'skill:farming:1200',     proc:{trigger:'harvest', chance:.08, effect:'doubleYield', label:'Buried extra!'}},
  phoenix_chick:{n:'Phoenix Chick', icon:'🐤', role:'artisan', bonus:{cookSpeed:.10},   source:'skill:cooking:2000',     proc:{trigger:'cook', chance:.04, effect:'refundIngredients', label:'Rekindled!'}},
  forge_imp:    {n:'Forge Imp',     icon:'👺', role:'artisan', bonus:{smithSpeed:.10},  source:'skill:smithing:2000',    proc:null},
  silkling:     {n:'Silkling',      icon:'🕷️', role:'artisan', bonus:{craftSpeed:.10},  source:'skill:crafting:2000',    proc:null},
  grave_wisp:   {n:'Grave Wisp',    icon:'🕯️', role:'artisan', bonus:{prayerXp:.10},    source:'skill:prayer:1200',      proc:null},
  lichling:     {n:'Lichling',      icon:'💀', role:'utility', bonus:{xpB:.05},         source:'boss:lich:200',          proc:{trigger:'kill', chance:.02, effect:'extraGold', amount:25, label:'Soul tithe!'}},
  dragonling:   {n:'Dragonling',    icon:'🐲', role:'combat',  bonus:{rareDrop:.15, strB:5}, source:'boss:dragon:200',   proc:{trigger:'combatHit', chance:.02, effect:'fireDot', label:'Dragonfire!'}},
};