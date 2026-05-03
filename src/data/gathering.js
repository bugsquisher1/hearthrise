// Gathering action tables + equipment slot config

export const TREES=[
  {id:'normal_tree',name:'Normal Tree',icon:'🌳',req:1,xp:25,ms:3000,prod:'normal_log',qty:[1,2]},
  {id:'oak_tree',name:'Oak Tree',icon:'🌳',req:15,xp:38,ms:4000,prod:'oak_log',qty:[1,2]},
  {id:'willow_tree',name:'Willow',icon:'🌿',req:30,xp:68,ms:5500,prod:'willow_log',qty:[1,2]},
  {id:'maple_tree',name:'Maple Tree',icon:'🍁',req:45,xp:100,ms:7000,prod:'maple_log',qty:[1,2]},
  {id:'yew_tree',name:'Yew Tree',icon:'🌲',req:60,xp:175,ms:10000,prod:'yew_log',qty:[1,1]},
];

export const ROCKS=[
  {id:'copper_rock',name:'Copper Rock',icon:'🟤',req:1,xp:18,ms:3000,prod:'copper_ore',qty:[1,2]},
  {id:'iron_rock',name:'Iron Rock',icon:'⬜',req:15,xp:35,ms:4500,prod:'iron_ore',qty:[1,2]},
  {id:'coal_rock',name:'Coal Rock',icon:'⬛',req:30,xp:50,ms:5500,prod:'coal',qty:[1,2]},
  {id:'gold_rock',name:'Gold Rock',icon:'🟡',req:45,xp:65,ms:7000,prod:'gold_ore',qty:[1,1]},
  {id:'mithril_rock',name:'Mithril Rock',icon:'🔵',req:60,xp:80,ms:9000,prod:'mithril_ore',qty:[1,1]},
];

export const FISH_SPOTS=[
  {id:'shrimp_s',name:'Shrimp Spot',icon:'🦐',req:1,xp:10,ms:3500,prod:'shrimp',qty:[1,3]},
  {id:'trout_s',name:'Trout Spot',icon:'🐟',req:20,xp:30,ms:5000,prod:'trout',qty:[1,2]},
  {id:'lobster_s',name:'Lobster Spot',icon:'🦞',req:40,xp:80,ms:8000,prod:'lobster',qty:[1,1]},
  {id:'shark_s',name:'Shark Spot',icon:'🦈',req:76,xp:150,ms:13000,prod:'shark',qty:[1,1]},
];

export const CROPS={
  turnip:{name:'Turnip',icon:'🥕',hours:4,prod:'turnip',yield:[2,4],xp:8,req:1,seed:'turnip_seed'},
  carrot:{name:'Carrot',icon:'🥕',hours:6,prod:'carrot',yield:[2,4],xp:12,req:10,seed:'carrot_seed'},
  wheat:{name:'Wheat',icon:'🌾',hours:8,prod:'wheat',yield:[3,5],xp:18,req:20,seed:'wheat_seed'},
  potato:{name:'Potato',icon:'🥔',hours:10,prod:'potato',yield:[2,4],xp:25,req:30,seed:'potato_seed'},
  tomato:{name:'Tomato',icon:'🍅',hours:8,prod:'tomato',yield:[2,3],xp:35,req:40,seed:'tomato_seed',regrows:true},
  pumpkin:{name:'Pumpkin',icon:'🎃',hours:14,prod:'pumpkin',yield:[1,2],xp:60,req:50,seed:'pumpkin_seed'},
};

export const EQUIP_SLOTS=['helmet','necklace','earrings','cape','weapon','ammo','ring1','body','ring2','gloves','belt','pants','boots','companion'];

export const EQUIP_SLOT_META={
  helmet:{label:'Helmet',icon:'⛑️'},necklace:{label:'Necklace',icon:'📿'},earrings:{label:'Earrings',icon:'💎'},
  cape:{label:'Cape',icon:'🦸'},weapon:{label:'Weapon',icon:'⚔️'},ammo:{label:'Ammo',icon:'🏹'},
  ring1:{label:'Ring 1',icon:'💍'},body:{label:'Body',icon:'🦺'},ring2:{label:'Ring 2',icon:'💍'},
  gloves:{label:'Gloves',icon:'🧤'},belt:{label:'Belt',icon:'🟫'},pants:{label:'Pants',icon:'👖'},
  boots:{label:'Boots',icon:'🥾'},companion:{label:'Companion',icon:'🐾'},
};
