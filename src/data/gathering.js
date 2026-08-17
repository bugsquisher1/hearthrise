// Gathering action tables + equipment slot config
//
// ════════════════════════════════════════════════════════════════════════
// b226 — THE PACING RETUNE (docs/design/pacing-overhaul.md §4.1, Appendix A)
//
// READ THIS BEFORE CHANGING AN `xp` NUMBER BELOW.
//
// `xp` here is the rung's BOOK VALUE. It is not what the player receives.
// The live grant is  floor(book × PACE.xp × (1 + allXP…)) × presence,
// applied at the ONE choke-point, addXp() in legacy.js. `PACE.xp` is the
// single global pacing dial; changing the pace is a one-line edit there and
// must never be done by rewriting this table.
//
// What DID change in this table is the CURVE CORRECTION — a permanent
// per-skill balance statement, not a pacing dial:
//   Woodcutting ×0.60 · Mining ×1.15 · Fishing ×1.05
// Trees carried the highest xp-per-second at every rung, which made
// woodcutting ~2× faster to 99 than mining or fishing (pacing-overhaul §1.2).
// After the correction the three gathering 99s land within 5% of each other.
// Book values are the balance; PACE.xp is the speed. Keep them separate.
//
// The renderers show the EFFECTIVE number (window.pacedXp) — a card never
// prints a book value the player will not receive.
// ════════════════════════════════════════════════════════════════════════

export const TREES=[
  {id:'normal_tree',name:'Normal Tree',icon:'🌳',req:1,xp:15,ms:3000,prod:'normal_log',qty:[1,1]},
  {id:'oak_tree',name:'Oak Tree',icon:'🌳',req:15,xp:23,ms:4000,prod:'oak_log',qty:[1,1]},
  {id:'willow_tree',name:'Willow',icon:'🌿',req:30,xp:41,ms:5500,prod:'willow_log',qty:[1,1]},
  {id:'maple_tree',name:'Maple Tree',icon:'🍁',req:45,xp:60,ms:7000,prod:'maple_log',qty:[1,2]},
  {id:'yew_tree',name:'Yew Tree',icon:'🌲',req:60,xp:105,ms:10000,prod:'yew_log',qty:[1,1]},
  /* b215: woodcutting used to end at 60 — these carry it to the cap. */
  {id:'runewood_tree',name:'Runewood',icon:'🌲',req:75,xp:144,ms:11500,prod:'runewood_log',qty:[1,1]},
  {id:'duskwood_tree',name:'Duskwood',icon:'🌲',req:90,xp:198,ms:13000,prod:'duskwood_log',qty:[1,1]},
];

export const ROCKS=[
  {id:'copper_rock',name:'Copper Rock',icon:'🟤',req:1,xp:21,ms:3000,prod:'copper_ore',qty:[1,1]},
  {id:'iron_rock',name:'Iron Rock',icon:'⬜',req:15,xp:40,ms:4500,prod:'iron_ore',qty:[1,1]},
  {id:'coal_rock',name:'Coal Rock',icon:'⬛',req:30,xp:57,ms:5500,prod:'coal',qty:[1,1]},
  {id:'gold_rock',name:'Gold Rock',icon:'🟡',req:45,xp:75,ms:7000,prod:'gold_ore',qty:[1,1]},
  /* b245 (Tyler / pacing audit): the COAL CHOKEPOINT. coal_rock opens at Mining
     30 and yields 1 at a flat rate, while every bar past copper eats 1–5 coal and
     the top bars need 4–5 each — so late smithing was gated on level-30 coal
     throughput. This richer seam (Mining 52) yields 2–3 coal a swing, ~2.5× the
     supply, so a late smith isn't grinding low-tier coal. Its xp/sec sits between
     Gold and Mithril so the "every rung strictly better" rule still holds. */
  {id:'rich_coal_rock',name:'Rich Coal Seam',icon:'⬛',req:52,xp:90,ms:8300,prod:'coal',qty:[2,3]},
  /* b226: ms 9000 → 8000. At 9s Mithril was a SLOWER xp/sec than Gold Rock
     15 levels below it — unlocking the rung was a punishment. Every rung must
     be strictly better than the one under it; the smoke suite now asserts it. */
  {id:'mithril_rock',name:'Mithril Rock',icon:'🔵',req:60,xp:92,ms:8000,prod:'mithril_ore',qty:[1,1]},
  /* b215: mining used to end at 60 — these feed the Emberforged/Dawnsteel tiers. */
  {id:'emberstone_rock',name:'Emberstone Vein',icon:'🔶',req:75,xp:126,ms:10500,prod:'emberstone_ore',qty:[1,1]},
  {id:'dawnstone_rock',name:'Dawnstone Vein',icon:'🌟',req:90,xp:178,ms:12000,prod:'dawnstone_ore',qty:[1,1]},
];

export const FISH_SPOTS=[
  {id:'shrimp_s',name:'Shrimp Spot',icon:'🦐',req:1,xp:11,ms:3500,prod:'shrimp',qty:[1,1]},
  /* b215: herring closes the old 1→20 opening gap */
  {id:'herring_s',name:'Herring Run',icon:'🐟',req:10,xp:21,ms:4200,prod:'herring',qty:[1,1]},
  {id:'trout_s',name:'Trout Spot',icon:'🐟',req:20,xp:32,ms:5000,prod:'trout',qty:[1,1]},
  {id:'lobster_s',name:'Lobster Spot',icon:'🦞',req:40,xp:84,ms:8000,prod:'lobster',qty:[1,1]},
  /* b215: swordfish fills the old 40→76 dead zone; moonfish carries it to 90. */
  {id:'swordfish_s',name:'Swordfish Shoal',icon:'🐠',req:55,xp:116,ms:10000,prod:'swordfish',qty:[1,1]},
  /* b215: frostfin closes the 55→76 gap */
  {id:'frostfin_s',name:'Frostfin Shallows',icon:'❄️',req:66,xp:137,ms:11500,prod:'frostfin',qty:[1,1]},
  {id:'shark_s',name:'Shark Spot',icon:'🦈',req:76,xp:158,ms:13000,prod:'shark',qty:[1,1]},
  {id:'moonfish_s',name:'Moonlit Pool',icon:'🌙',req:90,xp:226,ms:14000,prod:'moonfish',qty:[1,1]},
];

/* b226 — FARMING IS EXEMPT FROM PACE.xp AND ITS CROP XP IS ×14.
   (pacing-overhaul §8.3.) At the castle's 12 plots running Moonbloom the old
   numbers put farming 99 at ~9.5 YEARS of continuous real-time growing — off
   by a factor of ~40 in a game whose pitch is every skill to 99. Growth is
   wall-clock (HearthriseFarm.growthHours), so PACE.actionMs cannot touch it
   and PACE.xp would only deepen the hole; the fix has to be in the crop XP.
   These are the FINAL grant values — addXp() applies no pace multiplier to
   farming. Watering XP is derived (ceil(xp/4)) and scales with them. */
export const CROPS={
  turnip:{name:'Turnip',icon:'🥕',hours:4,prod:'turnip',yield:[2,4],xp:112,req:1,seed:'turnip_seed'},
  carrot:{name:'Carrot',icon:'🥕',hours:6,prod:'carrot',yield:[2,4],xp:168,req:10,seed:'carrot_seed'},
  wheat:{name:'Wheat',icon:'🌾',hours:8,prod:'wheat',yield:[3,5],xp:252,req:20,seed:'wheat_seed'},
  potato:{name:'Potato',icon:'🥔',hours:10,prod:'potato',yield:[2,4],xp:350,req:30,seed:'potato_seed'},
  tomato:{name:'Tomato',icon:'🍅',hours:8,prod:'tomato',yield:[2,3],xp:490,req:40,seed:'tomato_seed',regrows:true},
  pumpkin:{name:'Pumpkin',icon:'🎃',hours:14,prod:'pumpkin',yield:[1,2],xp:840,req:50,seed:'pumpkin_seed'},
  /* b215: farming used to end at 50. Longer grows, bigger XP — the late-game
     crops are a deliberate "set it before bed" cadence. */
  goldenroot:{name:'Goldenroot',icon:'🥕',hours:16,prod:'goldenroot',yield:[1,3],xp:1190,req:62,seed:'goldenroot_seed'},
  emberfruit:{name:'Emberfruit',icon:'🔥',hours:18,prod:'emberfruit',yield:[1,2],xp:1680,req:75,seed:'emberfruit_seed',regrows:true},
  moonbloom:{name:'Moonbloom',icon:'🌸',hours:22,prod:'moonbloom',yield:[1,2],xp:2380,req:88,seed:'moonbloom_seed'},
};

/* b216: 'shield' (offhand) added. Existing saves simply have no value for it —
   migrateEquipmentSlots fills every known slot with null — so it's save-safe. */
export const EQUIP_SLOTS=['helmet','necklace','earrings','cape','weapon','shield','ammo','ring1','body','ring2','gloves','belt','pants','boots','companion'];

/* ── AUTHORED SLOT → PLAYER SLOTS (moved here from tools/gen-catalogues.mjs,
   b366) ──────────────────────────────────────────────────────────────────────
   An item AUTHORS `slot:'ring'`; a player HAS `ring1` and `ring2`. That
   expansion used to live only in the catalogue generator, which was correct
   while the generator was the only consumer. The equip INTENT is the second
   consumer — it has to answer "does this item fit this slot?" one round trip
   before `hr_item_slots` does — and a second copy of an expansion table is the
   `unifyObject` failure this whole program exists to prevent. So it lives HERE,
   beside EQUIP_SLOTS, and both the generator and the Edge Function import it.
   The generated SQL is byte-identical (gen-catalogues --check proves it). */
export const SLOT_EXPANSION={ring:['ring1','ring2']};

/** Every player slot an item authoring `raw` may occupy. Pure; frozen inputs. */
export function expandItemSlot(raw){
  if(!raw||typeof raw!=='string')return[];
  return SLOT_EXPANSION[raw]||[raw];
}

export const EQUIP_SLOT_META={
  helmet:{label:'Helmet',icon:'⛑️'},necklace:{label:'Necklace',icon:'📿'},earrings:{label:'Earrings',icon:'💎'},
  cape:{label:'Cape',icon:'🦸'},weapon:{label:'Weapon',icon:'⚔️'},shield:{label:'Offhand',icon:'🛡️'},ammo:{label:'Ammo',icon:'🏹'},
  ring1:{label:'Ring 1',icon:'💍'},body:{label:'Body',icon:'🦺'},ring2:{label:'Ring 2',icon:'💍'},
  gloves:{label:'Gloves',icon:'🧤'},belt:{label:'Belt',icon:'🟫'},pants:{label:'Pants',icon:'👖'},
  boots:{label:'Boots',icon:'🥾'},companion:{label:'Companion',icon:'🐾'},
};
