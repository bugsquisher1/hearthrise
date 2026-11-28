// src/data/gathering.js — THE FARM'S CROPS and the equipment slot config.
//
// THE GATHERING NODES ARE CUT (lane/bench-cut-data, 2026-11-28; docs/design/redesign/09-crafting.md 4.17). Trees, rocks and fishing
// spots were town work a hero stood at for a skill. Every raw good is a job now (src/data/trades.js KIT_RECIPES: Mine, Chop, Catch,
// Pull), and the trade's Level is its company's. What stays here is the farm, the one town door that runs on no clock: a plot grows
// on its own beside the Farming job (09 4.13 row 2: the plots cost seeds and no work hours, the job costs work hours and no seeds).

/* THE CROPS. A crop's `req` is the Farming Level its plot opens at, on the job ladder's rungs (09 4.17: the plots gate on the company's
   Farming, 4.5's curve): a crop with a Farming job (`grain_b<band>`, its `band`) opens with that job, at trade Level 1 + 10 x band
   (src/core/trades.js rungLevel(bandRung), TRADE_LEVERS.rungs span 10). Wheat and potato have no job (the job's crop order skips them,
   09 4.14), so each sits on the rung of the job crop before it in the order, carrot's. tests/kit-recipes.mjs KR-CROPS holds both.
   `xp` is the plot's own harvest XP (hr_crops.xp), the farm writer's until it credits the company's `crop_xp` (the server lane). */
export const CROPS={
  turnip:{name:'Turnip',icon:'🥕',hours:4,prod:'turnip',yield:[2,4],xp:336,band:0,req:1,seed:'turnip_seed'},
  carrot:{name:'Carrot',icon:'🥕',hours:6,prod:'carrot',yield:[2,4],xp:504,band:1,req:11,seed:'carrot_seed'},
  wheat:{name:'Wheat',icon:'🌾',hours:8,prod:'wheat',yield:[3,5],xp:756,band:1,req:11,seed:'wheat_seed'},
  potato:{name:'Potato',icon:'🥔',hours:10,prod:'potato',yield:[2,4],xp:1050,band:1,req:11,seed:'potato_seed'},
  tomato:{name:'Tomato',icon:'🍅',hours:8,prod:'tomato',yield:[2,3],xp:1470,band:2,req:21,seed:'tomato_seed',regrows:true},
  pumpkin:{name:'Pumpkin',icon:'🎃',hours:14,prod:'pumpkin',yield:[1,2],xp:2520,band:3,req:31,seed:'pumpkin_seed'},
  goldenroot:{name:'Goldenroot',icon:'🥕',hours:16,prod:'goldenroot',yield:[1,3],xp:3570,band:4,req:41,seed:'goldenroot_seed'},
  emberfruit:{name:'Emberfruit',icon:'🔥',hours:18,prod:'emberfruit',yield:[1,2],xp:5040,band:5,req:51,seed:'emberfruit_seed',regrows:true},
  /* band 6's crop (09 4.16 call 8): its Farming job lands with its drink */
  moonbloom:{name:'Moonbloom',icon:'🌸',hours:22,prod:'moonbloom',yield:[1,2],xp:7140,band:6,req:61,seed:'moonbloom_seed'},
};

/* The worn slots. 'companion' was cut with its one item, the Fox Companion (Tyler, 2026-10-22). */
export const EQUIP_SLOTS=['helmet','necklace','earrings','cape','weapon','shield','ammo','ring1','body','ring2','gloves','belt','pants','boots'];

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
  boots:{label:'Boots',icon:'🥾'},
};
