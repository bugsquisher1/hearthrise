// Gathering action tables + equipment slot config

export const TREES=[
  {id:'normal_tree',name:'Normal Tree',icon:'🌳',req:1,xp:25,ms:3000,prod:'normal_log',qty:[1,2]},
  {id:'oak_tree',name:'Oak Tree',icon:'🌳',req:15,xp:38,ms:4000,prod:'oak_log',qty:[1,2]},
  {id:'willow_tree',name:'Willow',icon:'🌿',req:30,xp:68,ms:5500,prod:'willow_log',qty:[1,2]},
  {id:'maple_tree',name:'Maple Tree',icon:'🍁',req:45,xp:100,ms:7000,prod:'maple_log',qty:[1,2]},
  {id:'yew_tree',name:'Yew Tree',icon:'🌲',req:60,xp:175,ms:10000,prod:'yew_log',qty:[1,1]},
  /* b215: woodcutting used to end at 60 — these carry it to the cap. */
  {id:'runewood_tree',name:'Runewood',icon:'🌲',req:75,xp:240,ms:11500,prod:'runewood_log',qty:[1,1]},
  {id:'duskwood_tree',name:'Duskwood',icon:'🌲',req:90,xp:330,ms:13000,prod:'duskwood_log',qty:[1,1]},
];

export const ROCKS=[
  {id:'copper_rock',name:'Copper Rock',icon:'🟤',req:1,xp:18,ms:3000,prod:'copper_ore',qty:[1,2]},
  {id:'iron_rock',name:'Iron Rock',icon:'⬜',req:15,xp:35,ms:4500,prod:'iron_ore',qty:[1,2]},
  {id:'coal_rock',name:'Coal Rock',icon:'⬛',req:30,xp:50,ms:5500,prod:'coal',qty:[1,2]},
  {id:'gold_rock',name:'Gold Rock',icon:'🟡',req:45,xp:65,ms:7000,prod:'gold_ore',qty:[1,1]},
  {id:'mithril_rock',name:'Mithril Rock',icon:'🔵',req:60,xp:80,ms:9000,prod:'mithril_ore',qty:[1,1]},
  /* b215: mining used to end at 60 — these feed the Emberforged/Dawnsteel tiers. */
  {id:'emberstone_rock',name:'Emberstone Vein',icon:'🔶',req:75,xp:110,ms:10500,prod:'emberstone_ore',qty:[1,1]},
  {id:'dawnstone_rock',name:'Dawnstone Vein',icon:'🌟',req:90,xp:155,ms:12000,prod:'dawnstone_ore',qty:[1,1]},
];

export const FISH_SPOTS=[
  {id:'shrimp_s',name:'Shrimp Spot',icon:'🦐',req:1,xp:10,ms:3500,prod:'shrimp',qty:[1,3]},
  /* b215: herring closes the old 1→20 opening gap */
  {id:'herring_s',name:'Herring Run',icon:'🐟',req:10,xp:20,ms:4200,prod:'herring',qty:[1,2]},
  {id:'trout_s',name:'Trout Spot',icon:'🐟',req:20,xp:30,ms:5000,prod:'trout',qty:[1,2]},
  {id:'lobster_s',name:'Lobster Spot',icon:'🦞',req:40,xp:80,ms:8000,prod:'lobster',qty:[1,1]},
  /* b215: swordfish fills the old 40→76 dead zone; moonfish carries it to 90. */
  {id:'swordfish_s',name:'Swordfish Shoal',icon:'🐠',req:55,xp:110,ms:10000,prod:'swordfish',qty:[1,1]},
  /* b215: frostfin closes the 55→76 gap */
  {id:'frostfin_s',name:'Frostfin Shallows',icon:'❄️',req:66,xp:130,ms:11500,prod:'frostfin',qty:[1,1]},
  {id:'shark_s',name:'Shark Spot',icon:'🦈',req:76,xp:150,ms:13000,prod:'shark',qty:[1,1]},
  {id:'moonfish_s',name:'Moonlit Pool',icon:'🌙',req:90,xp:215,ms:14000,prod:'moonfish',qty:[1,1]},
];

export const CROPS={
  turnip:{name:'Turnip',icon:'🥕',hours:4,prod:'turnip',yield:[2,4],xp:8,req:1,seed:'turnip_seed'},
  carrot:{name:'Carrot',icon:'🥕',hours:6,prod:'carrot',yield:[2,4],xp:12,req:10,seed:'carrot_seed'},
  wheat:{name:'Wheat',icon:'🌾',hours:8,prod:'wheat',yield:[3,5],xp:18,req:20,seed:'wheat_seed'},
  potato:{name:'Potato',icon:'🥔',hours:10,prod:'potato',yield:[2,4],xp:25,req:30,seed:'potato_seed'},
  tomato:{name:'Tomato',icon:'🍅',hours:8,prod:'tomato',yield:[2,3],xp:35,req:40,seed:'tomato_seed',regrows:true},
  pumpkin:{name:'Pumpkin',icon:'🎃',hours:14,prod:'pumpkin',yield:[1,2],xp:60,req:50,seed:'pumpkin_seed'},
  /* b215: farming used to end at 50. Longer grows, bigger XP — the late-game
     crops are a deliberate "set it before bed" cadence. */
  goldenroot:{name:'Goldenroot',icon:'🥕',hours:16,prod:'goldenroot',yield:[1,3],xp:85,req:62,seed:'goldenroot_seed'},
  emberfruit:{name:'Emberfruit',icon:'🔥',hours:18,prod:'emberfruit',yield:[1,2],xp:120,req:75,seed:'emberfruit_seed',regrows:true},
  moonbloom:{name:'Moonbloom',icon:'🌸',hours:22,prod:'moonbloom',yield:[1,2],xp:170,req:88,seed:'moonbloom_seed'},
};

export const EQUIP_SLOTS=['helmet','necklace','earrings','cape','weapon','ammo','ring1','body','ring2','gloves','belt','pants','boots','companion'];

export const EQUIP_SLOT_META={
  helmet:{label:'Helmet',icon:'⛑️'},necklace:{label:'Necklace',icon:'📿'},earrings:{label:'Earrings',icon:'💎'},
  cape:{label:'Cape',icon:'🦸'},weapon:{label:'Weapon',icon:'⚔️'},ammo:{label:'Ammo',icon:'🏹'},
  ring1:{label:'Ring 1',icon:'💍'},body:{label:'Body',icon:'🦺'},ring2:{label:'Ring 2',icon:'💍'},
  gloves:{label:'Gloves',icon:'🧤'},belt:{label:'Belt',icon:'🟫'},pants:{label:'Pants',icon:'👖'},
  boots:{label:'Boots',icon:'🥾'},companion:{label:'Companion',icon:'🐾'},
};
