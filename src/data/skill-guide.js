// SKILL_GUIDE — what each skill is for, one flavour line and one "Good for"
// phrase per SKILLS_DEF id, in SKILLS_DEF order, plus the Hero class title
// that skill earns when it leads (heroClass, src/render/skill-guide.js).
//
// CLIENT-ONLY display text. No edge file imports it (tests/skill-guide-coverage.mjs
// SKG-12), so a wording change never moves the hr-accrue payload hash. The
// guard also pins the shape: one entry per skill, 60-150 / 12-70 characters,
// no digits, no emoji, no markup characters, no trailing full stop.

const g = (line, use, title) => Object.freeze({ line, use, title });

export const SKILL_GUIDE = Object.freeze({
  attack: g('Attack decides how often a melee blow lands, and it is the level every sword and hammer asks before it lets you hold it', 'better swords and hammers', 'Warrior'),
  strength: g('Strength decides how hard a melee blow lands once it does, and a heavy hitter needs fewer swings for every kill', 'faster kills with every melee weapon', 'Berserker'),
  defense: g('Defense is the level armour asks before you may wear it, and every point of it makes a monster\'s swing a little less sure', 'heavier armour', 'Guardian'),
  hitpoints: g('Hitpoints is your health, one point for every level, and it trains itself beside whichever style you fight with', 'longer fights and longer nights away', 'Brawler'),
  prayer: g('Prayer is trained by laying bones and relics to rest, and it counts toward your combat level at half the weight of Defense', 'your combat level, and a use for every bone', 'Devotee'),
  magic: g('Magic is the caster\'s road, a staff in one hand and a pouch of runes in the other, and it opens every stronger staff', 'staves, and a use for every rune you bind', 'Mage'),
  ranged: g('Ranged is the patient road, a bow and a full quiver from a safe distance, and it opens every longer bow as it climbs', 'bows, and a use for every arrow you craft', 'Ranger'),
  woodcutting: g('Every homestead in the valley started as a tree somebody felled, and most of the second storey did too', 'Crafting planks and bows, and your homestead\'s timber', 'Lumberjack'),
  mining: g('Ore comes out of the hill one swing at a time, and the forge is never more than a day from running empty', 'Smithing bars, and the ore your rooms are built with', 'Miner'),
  fishing: g('A patient line feeds a hungry camp, and only a well-fed camp ever wins a fight worth telling about', 'Cooking, and so every fight you plan to walk away from', 'Angler'),
  farming: g('Crops grow in real time whether you watch or not, which makes a planted plot the most honest promise in the valley', 'Cooking stews, pies, bread and roasts', 'Farmhand'),
  cooking: g('Raw food heals a little and cooked food heals a great deal, which is the whole argument for building a kitchen', 'every meal Auto-Eat reaches for, watched or away', 'Chef'),
  crafting: g('Logs become planks, hides and cloth become armour, and a steady hand turns out bows, arrows and rings at the one bench', 'planks, bows, arrows, light armour and jewellery', 'Artificer'),
  smithing: g('Ore becomes bars and bars become blades, plate and the iron fittings no manor can be raised without', 'weapons, armour, tools and your homestead\'s fittings', 'Smith'),
  runecrafting: g('Blank stones take a rune the way wax takes a seal, and a mage without runes is only a person holding a stick', 'runes for every staff, and elemental enchants for your weapon', 'Runebinder'),
  stonemason: g('Stonemason is the builder\'s skill, and the stone you cut here becomes the walls of your manor, its rooms and your clan\'s castle', 'the builder\'s stone for your manor, rooms and castle, and whetstones', 'Mason'),
  bountyHunter: g('Bounty Hunter is earned at the board rather than in the field, one finished contract at a time', 'your standing with the hunt masters', 'Bounty Hunter'),
});
