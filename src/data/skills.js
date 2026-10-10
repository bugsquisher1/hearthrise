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

/* ── PRAYER WARDS — W0 coherence audit, Top-10 #8 (2026-10-09) ──────────────
   Prayer used to do nothing in a fight: it only padded combat level. Now every
   Prayer tier carries a PASSIVE WARD — a share of incoming blows that glance
   off. Rows are { lv, pct }: at Prayer >= lv the ward is pct percent. Read by
   ONE function (src/core/combat.js `prayerWardPct`) inside
   `monsterCombatRolls`, which is the single expression the attended tick, the
   away accrual and the world tick all price a monster's swing through — so the
   ward is identical on every path (AWAY-1) with no caller wiring.

   HOW IT BITES: the monster's chance to land is multiplied by (1 - pct/100)
   AFTER its own clamp. Expected damage taken therefore falls by exactly pct%,
   at every monster size — a max-hit cut would round to nothing against the
   small hitters a low-Prayer player actually fights. It spends no RNG draw, so
   seeded replays are unchanged in shape.

   GAME DESIGNER RULING (W0, 2026-10-10): front-loaded so early levels are felt,
   3% at 10 then +2% per decade, 20% at 99. Below a defence tier's worth: a real
   but secondary survival stat — a Prayer-99 hero eats about a fifth less food,
   never fights for free. Retune a row, never a branch. Ascending by `lv`; a
   guard asserts the order and the cap. */
export const PRAYER_WARDS = Object.freeze([
  Object.freeze({ lv: 10, pct: 3 }),
  Object.freeze({ lv: 20, pct: 5 }),
  Object.freeze({ lv: 30, pct: 7 }),
  Object.freeze({ lv: 40, pct: 9 }),
  Object.freeze({ lv: 50, pct: 11 }),
  Object.freeze({ lv: 60, pct: 13 }),
  Object.freeze({ lv: 70, pct: 15 }),
  Object.freeze({ lv: 80, pct: 17 }),
  Object.freeze({ lv: 90, pct: 19 }),
  Object.freeze({ lv: 99, pct: 20 }),
]);
/* The ceiling no row may exceed. A ward is a share of blows turned aside; at
   anything near 100 Prayer becomes invulnerability. */
export const PRAYER_WARD_MAX_PCT = 25;
