// SKILLS_DEF — extracted from hearthrise-phaseA.html

export const SKILLS_DEF={
  attack:{name:'Attack',icon:'⚔️',cat:'combat'},strength:{name:'Strength',icon:'💪',cat:'combat'},
  defense:{name:'Defense',icon:'🛡️',cat:'combat'},hitpoints:{name:'Hitpoints',icon:'❤️',cat:'combat'},
  prayer:{name:'Prayer',icon:'🙏',cat:'combat'},magic:{name:'Magic',icon:'🔮',cat:'combat'},
  ranged:{name:'Ranged',icon:'🏹',cat:'combat'},
  woodcutting:{name:'Woodcutting',icon:'🪓',cat:'gather'},mining:{name:'Mining',icon:'⛏️',cat:'gather'},
  fishing:{name:'Fishing',icon:'🎣',cat:'gather'},farming:{name:'Farming',icon:'🌾',cat:'gather'},
  cooking:{name:'Cooking',icon:'🍳',cat:'artisan'},crafting:{name:'Crafting',icon:'🔨',cat:'artisan'},
  smithing:{name:'Smithing',icon:'🔩',cat:'artisan'},
  /* docs/design/consumable-economy.md R6 — the consumable economy's two new
     benches. ARTISAN, not gathering: the artisan engine is generic over
     ARTISAN_RECIPES[skill], so a fourth and fifth lane are data rows; the
     gathering engine is hard-branched on three skill ids in ~14 sites of the
     monolith. (Fletching is the third and is sequenced separately.)
     Adding the row here is what gives each skill its Activities tile, its
     detail grid, its hr_skills catalogue row and its 0-XP start on every new
     character — see src/data/start-kit.js's header. */
  runecrafting:{name:'Runecrafting',icon:'🔮',cat:'artisan'},
  stonemason:{name:'Stonemason',icon:'🧱',cat:'artisan'},
  bountyHunter:{name:'Bounty Hunter',icon:'🎯',cat:'combat'},
};
