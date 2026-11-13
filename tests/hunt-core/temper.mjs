// tests/hunt-core/temper.mjs — TEMPERING'S RULES, src/core/temper.js and its hooks in the one hurt() and the snapshot
// (Tyler 2026-11-04: "some sort of upgrade system that slightly increases gear power"). Run by run-all.mjs.
// The real settle's half (rung 0 byte-identical, both paths, the next tier wins) is temper-play.mjs; the browser's half is
// tests/hunt-live.mjs LV-TEMPER; the sale is tests/temper-buy.mjs.
//
// mutant-anchors: src/core/temper.js src/core/mitigation.js src/core/hunt/damage.js src/core/hunt/abilities.js src/core/member.js
import { suite, H, E, inst2, sc2, world, rngOf } from './fixtures/h2.js';

const T = 'src/core/temper.js';
const D = 'src/core/hunt/damage.js';
const MI = 'src/core/mitigation.js';
const MB = 'src/core/member.js';
const fight = (M, units) => inst2(M, world(M, units, { phase: 'fight', leader: 1 }));
const IRON = Object.freeze({ weapon: 'iron_sword', helmet: 'iron_helm', body: 'iron_platebody', pants: 'iron_platelegs', boots: 'iron_boots' });
/* What `n` swings of a blow land, on the hunt's own rng, in all. */
const landed = (n, one) => { let all = 0; for (let i = 0; i < n; i++) all += one(); return all; };

const cases = {
  /* A blow of any size at any rung, up or down: two whole answers at most, one draw at most, and a mean that is exact to the point. */
  'the-mean-is-exact': (M) => {
    const { temperedAmount: move } = M.temper;
    for (const pm of [10, 20, 30, 40, 50, -10, -20, -30, -40, -50]) {
      for (let n = 1; n <= 2500; n++) {
        const seen = [];
        const lo = move(n, pm, { chance: (p) => { seen.push(p); return false; } }), hi = move(n, pm, { chance: (p) => { seen.push(p); return true; } });
        const p = seen.length ? seen[0] : 0;
        if (seen.length > 2 || !Number.isInteger(lo) || !Number.isInteger(hi) || hi - lo > 1) return n + ' at ' + pm + ' pm: ' + lo + ' or ' + hi + ' on ' + seen.length + ' draws';
        const mean = lo + p * (hi - lo), want = (n * (1000 + pm)) / 1000;
        if (Math.abs(mean - want) > 1e-9) return n + ' at ' + pm + ' pm averages ' + mean + ', the rung says ' + want;
      }
    }
    /* the case the rounding exists for: under 100, a floored +1% is nothing. */
    let asked = null;
    if (move(20, 10, { chance: (p) => { asked = p; return true; } }) !== 21 || Math.abs(asked - 0.2) > 1e-9) return 'a blow of 20 at rung 1 did not land 21 one time in five: ' + asked;
    return null;
  },
  'no-rung-draws-nothing': (M) => {
    const { temperedAmount: move, blowsPmOf, armorPmOf, temperRung } = M.temper;
    const broke = { chance: () => { throw new Error('drew'); } };
    for (const pm of [0, undefined, null]) if (move(37, pm, broke) !== 37) return 'no rung moved a blow, pm ' + pm;
    if (move(0, 50, broke) !== 0) return 'a blow of nothing was moved';
    for (const t of [null, undefined, {}, { 'temper:blows:2': 0, 'temper:armor:2': 0 }, { 'temper:blows:2': -3 }, { 'temper:blows:2': 'x' }]) {
      if (blowsPmOf(IRON, M.ITEMS, t) !== 0 || armorPmOf(IRON, M.ITEMS, t) !== 0 || temperRung(t, 'blows', 2) !== 0) return 'rungs of ' + JSON.stringify(t) + ' read as a rung';
    }
    /* mitigate at no rung never touches the rng it may be handed: the chain's answer is the old one */
    const plate = M.mitigation.mitigationOf({ heavy: 29, medium: 0, light: 0 }, 20);
    if (M.mitigation.mitigate(100, 1000, plate, 0, broke) !== M.mitigation.mitigate(100, 1000, plate)) return 'a rung-0 blow at a hero changed';
    return null;
  },
  /* A forged rung can name a ladder, never a number (the perks' rule, perks.js normalisePerkState). */
  'a-rung-is-clamped': (M) => {
    const { temperRung, blowsPmOf } = M.temper;
    if (temperRung({ 'temper:blows:2': 99 }, 'blows', 2) !== 5 || blowsPmOf(IRON, M.ITEMS, { 'temper:blows:2': 99 }) !== 50) return 'rung 99 is ' + temperRung({ 'temper:blows:2': 99 }, 'blows', 2);
    if (temperRung({ 'temper:blows:1': 5 }, 'blows', 1) !== 0) return 'tier 1 has a ladder';
    if (temperRung({ 'temper:blows:9': 5 }, 'blows', 9) !== 0) return 'a tier with no row has a ladder';
    return null;
  },
  /* One ladder per tier: Steel starts at rung 0, Iron's rungs still count on Iron, and the Blows rung is the weapon's alone. */
  'each-tier-its-own-ladder': (M) => {
    const { blowsPmOf, armorPmOf } = M.temper;
    const iron = { 'temper:blows:2': 3, 'temper:armor:2': 4 };
    if (blowsPmOf(IRON, M.ITEMS, iron) !== 30 || armorPmOf(IRON, M.ITEMS, iron) !== 40) return 'a full Iron set reads ' + blowsPmOf(IRON, M.ITEMS, iron) + ' and ' + armorPmOf(IRON, M.ITEMS, iron);
    const steel = { weapon: 'steel_sword', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' };
    if (blowsPmOf(steel, M.ITEMS, iron) !== 0 || armorPmOf(steel, M.ITEMS, iron) !== 0) return 'Iron\'s rungs pay on Steel';
    const bronze = { weapon: 'bronze_sword', body: 'bronze_platebody' };
    if (blowsPmOf(bronze, M.ITEMS, { 'temper:blows:2': 5, 'temper:armor:2': 5 }) !== 0 || armorPmOf(bronze, M.ITEMS, { 'temper:armor:2': 5 }) !== 0) return 'Iron\'s rungs pay on Bronze';
    if (M.ITEMS.iron_sword.tier !== 2 || M.ITEMS.steel_sword.tier !== 3 || M.ITEMS.iron_platebody.tier !== 2) return 'the gear\'s tiers moved: this test names the wrong pieces';
    return null;
  },
  /* A mixed set reads piece by piece, by the armor the piece wears: moving one piece up costs that piece's share, never the ladder. */
  'a-mixed-set-reads-each-piece': (M) => {
    const { armorPmOf } = M.temper;
    const I = M.ITEMS;
    const mixed = { body: 'steel_platebody', helmet: 'iron_helm', pants: 'iron_platelegs', boots: 'iron_boots' };
    const body = I.steel_platebody.defB, rest = I.iron_helm.defB + I.iron_platelegs.defB + I.iron_boots.defB;
    const want = Math.floor((rest * 5 * 10) / (rest + body));
    if (armorPmOf(mixed, I, { 'temper:armor:2': 5 }) !== want) return 'Iron rung 5 under a Steel body reads ' + armorPmOf(mixed, I, { 'temper:armor:2': 5 }) + ' pm, its share is ' + want;
    if (!(want > 0 && want < 50)) return 'the fixture has no share: ' + want;
    /* a shield and a weapon are not armor: an Iron shield over Bronze plate carries no Armor rung. */
    const shield = { weapon: 'bronze_sword', shield: 'ironbound_shield', body: 'bronze_platebody' };
    if (I.ironbound_shield.tier === 2 && armorPmOf(shield, I, { 'temper:armor:2': 5 }) !== 0) return 'a shield carried the Armor rung';
    if (armorPmOf({ weapon: 'iron_sword' }, I, { 'temper:armor:2': 5 }) !== 0) return 'a hero in no armor has an Armor rung';
    return null;
  },
  /* THE HOOK, on the one hurt(): +1% of what LANDS, whatever the monster's defence, so a tough monster doesn't double it. */
  'blows-raise-what-lands': (M) => {
    const def = Object.keys(M.MONSTERS).sort((a, b) => M.C.defenceReduction(M.MONSTERS[b]) - M.C.defenceReduction(M.MONSTERS[a]))[0];
    if (!(M.C.defenceReduction(M.MONSTERS[def]) >= 2)) return 'fixture: the toughest monster takes ' + M.C.defenceReduction(M.MONSTERS[def]) + ' off a blow';
    const inst = fight(M, []);
    for (const swing of [12, 40, 120]) {
      const one = (pm, rng) => {
        const hero = H(M, 1, 12, 3, 'tank'), mon = E(M, 2, 0, 13, 3, 1, { kind: def, hp: 1e6, maxHp: 1e6 });
        if (pm) hero.blowsPm = pm;
        return M.damage.hurt(inst, mon, swing, hero, null, null, rng).dmg;
      };
      const rng = rngOf(M, 7);
      const base = one(0, null), n = 40000, got = landed(n, () => one(50, rng)) / n;
      if (Math.abs(got / (base * 1.05) - 1) > 0.004) return 'a blow of ' + swing + ' lands ' + base + ' on ' + def + ' at rung 0 and averages ' + got + ' at rung 5, want ' + base * 1.05;
    }
    /* a monster's blow at a hero is not raised by the hero's own Blows rung, and a monster has no rung. */
    const hero = H(M, 1, 12, 3, 'tank', { hp: 1e6, maxHp: 1e6 }), mon = E(M, 2, 0, 13, 3, 1, { kind: def });
    hero.blowsPm = 50;
    const broke = { chance: () => { throw new Error('drew'); } };
    if (M.damage.hurt(inst, hero, 50, mon, null, null, broke).dmg !== 50) return 'a monster\'s blow at a hero with Blows moved';
    return null;
  },
  /* THE ARMOR HOOK: what reaches the hero, after the chain, in every weight; this is why it isn't armor points. */
  'armor-lowers-what-reaches-the-hero': (M) => {
    const inst = fight(M, []);
    const mon = () => E(M, 9, 0, 13, 3, 1, { kind: 'carrion_crow' });
    for (const armour of [{ heavy: 29, medium: 0, light: 0 }, { heavy: 0, medium: 16, light: 0 }, { heavy: 0, medium: 0, light: 9 }, null]) {
      for (const swing of [30, 200]) {
        const rng = rngOf(M, 11);
        const one = (pm, r) => {
          const t = H(M, 2, 12, 3, 'tank', { hp: 1e6, maxHp: 1e6 });
          t.armour = armour;
          if (pm) t.armorPm = pm;
          return M.damage.hurt(inst, t, swing, mon(), null, null, r).dmg;
        };
        const base = one(0, null), n = 40000, got = landed(n, () => one(50, rng)) / n;
        if (Math.abs(got / (base * 0.95) - 1) > 0.004) return JSON.stringify(armour) + ': a blow of ' + swing + ' reaches the hero as ' + base + ' at rung 0 and averages ' + got + ' at rung 5, want ' + base * 0.95;
      }
    }
    return null;
  },
  /* Tyler 2026-10-18, the total mitigation cap: the rung is the chain's last step, so it can't take a blow under the keep floor. */
  'armor-never-passes-the-cap': (M) => {
    const { mitigationOf, mitigate } = M.mitigation;
    const maxed = mitigationOf({ heavy: 5000, medium: 0, light: 0 }, 1);
    if (!(maxed.keepPm > 0)) return 'fixture: the plate does not reach the cap';
    const rng = rngOf(M, 3);
    for (const blow of [100, 1000, 12345]) {
      const floor = Math.floor((blow * maxed.keepPm) / 1000);
      for (let i = 0; i < 200; i++) if (mitigate(blow, 1000, maxed, 50, rng) < floor) return 'a blow of ' + blow + ' went under the cap\'s ' + floor;
    }
    return null;
  },
  /* THE CAPE (2026-11-05): one to-hit guard point was worth 12-16% of the damage at the Warrens, an armor piece 3-5%, so guard is a shield's alone. A cape's `steadyPm` is a linear cut on this same hook:
     last in the chain, summed with the Armor rung, never past the total cap, armored or not. The jewelry spec's Steady needs nothing more. */
  'the-cape-shares-the-hook-and-the-cap': (M) => {
    const { mitigationOf, mitigate, NO_MITIGATION } = M.mitigation;
    const snapOf = (worn, temper) => { const { eq, setBonus, profile } = M.member.loadoutOf(worn, M.ITEMS);
      return M.member.heroSnapshot({ skills: { melee: 0, defense: 0 }, levelXp: 0 }, { eq, equipment: worn, items: M.ITEMS, bonus: () => 0, setBonus, profile, temper }); };
    const CAPED = { ...IRON, cape: 'houndskin_cloak' };
    if (snapOf(CAPED).armorPm !== 70) return 'a Houndskin Cloak snaps to ' + snapOf(CAPED).armorPm;
    if (snapOf(CAPED, { 'temper:armor:2': 5 }).armorPm !== 120) return 'a Houndskin Cloak and five Armor rungs snap to ' + snapOf(CAPED, { 'temper:armor:2': 5 }).armorPm;
    if (snapOf(CAPED).def !== snapOf(IRON).def) return 'a cape moved the to-hit roll: ' + snapOf(CAPED).def + ' against ' + snapOf(IRON).def;
    if (snapOf({ ...IRON, shield: 'ironbound_shield' }).def !== snapOf(IRON).def + 5) return 'the Ironbound Shield no longer guards';
    if ('armorPm' in snapOf(IRON)) return 'a hero with no cape and no rung carries a cut';
    const rng = rngOf(M, 5);
    const mean = landed(4000, () => mitigate(1000, 1000, NO_MITIGATION, 70, rng)) / 4000;
    if (Math.abs(mean - 930) > 1) return 'a 1000 blow through 7% lands ' + mean;
    /* The cap, armored or not: the hook is the chain's last step and the keep floor is under it. */
    const maxed = mitigationOf({ heavy: 5000, medium: 0, light: 0 }, 1);
    for (const blow of [100, 1000, 12345]) for (let i = 0; i < 200; i++) {
      if (mitigate(blow, 1000, maxed, 335, rng) < Math.floor((blow * maxed.keepPm) / 1000)) return 'armor, cape and rung took a blow of ' + blow + ' past the cap';
      if (mitigate(blow, 1000, NO_MITIGATION, 900, rng) < Math.floor((blow * 400) / 1000)) return 'a cut alone took a blow of ' + blow + ' past the cap';
    }
    return null;
  },
  /* A food's buff is the same cut, sized like a cape's step, and never the to-hit roll: a +4 food was -40% at the Warrens. What the row pays, the words say. */
  'a-food-cuts-and-never-guards': (M) => {
    const { eq, setBonus, profile } = M.member.loadoutOf(IRON, M.ITEMS);
    const snap = (bonus) => M.member.heroSnapshot({ skills: { melee: 0, defense: 0 }, levelXp: 0 }, { eq, equipment: IRON, items: M.ITEMS, bonus, setBonus, profile });
    const pays = M.buffs.buffBonuses([{ type: 'defense', magnitude: 5, remainingMs: 60000 }], {});
    if (pays.steady !== 0.05 || pays.defense) return 'a Defense-type food pays ' + JSON.stringify(pays);
    const fed = snap((k) => pays[k] || 0), bare = snap(() => 0);
    if (fed.armorPm !== 50) return 'a 5% food snaps to ' + fed.armorPm;
    if (fed.def !== bare.def) return 'a food moved the to-hit roll: ' + fed.def + ' against ' + bare.def;
    const rows = Object.entries(M.ITEMS).filter(([, it]) => it.buff && it.buff.type === 'defense');
    if (rows.length < 2) return 'the cut foods are gone';
    for (const [id, it] of rows) {
      if (it.buff.magnitude < 3 || it.buff.magnitude > 7) return id + ' cuts ' + it.buff.magnitude + '%, outside a cape step';
      const words = M.descriptions[id] || '';
      if (!words.includes('less damage from every hit') || /guard/i.test(words)) return id + ' says: ' + words;
    }
    return null;
  },
  'guard-is-a-shields-alone': (M) => {
    const bad = Object.keys(M.ITEMS).filter((id) => { const it = M.ITEMS[id]; if (!it.slot || it.slot === 'shield' || !(Number(it.defB) > 0)) return false;
      const v = M.mitigation.armourValues({ x: id }, M.ITEMS); return !(v.heavy || v.medium || v.light); });
    return bad.length ? 'to-hit guard outside a shield: ' + bad.join(', ') : null;
  },
  /* A cape steps as an armor piece steps (balance ruling §9, 3-5% less actual damage): each tier's best keeps 95-97% of what the tier below lets through. */
  'a-cape-steps-like-armor': (M) => {
    const capes = Object.values(M.ITEMS).filter((it) => it.slot === 'cape');
    const none = capes.filter((it) => !(it.steadyPm > 0)).map((it) => it.n);
    if (none.length) return 'no reason to wear: ' + none.join(', ');
    const best = {};
    for (const it of capes) if (it.tier) best[it.tier] = Math.max(best[it.tier] || 0, it.steadyPm);
    const tiers = Object.keys(best).map(Number).sort((a, b) => a - b);
    if (tiers.length < 8) return 'the ladder has ' + tiers.length + ' tiers';
    for (let i = 1; i < tiers.length; i++) {
      const keeps = (1000 - best[tiers[i]]) / (1000 - best[tiers[i - 1]]);
      if (keeps < 0.95 || keeps > 0.97) return 'tier ' + tiers[i] + ' keeps ' + (keeps * 100).toFixed(1) + '% of tier ' + tiers[i - 1] + '\'s damage, outside 95-97%';
    }
    return null;
  },
  'a-heal-is-raised-too': (M) => {
    const heal = (pm, seed) => {
      const h = H(M, 1, 12, 3, 'healer', { hp: 1000, maxHp: 1e6, mana: 1e6, maxMana: 1e6 });
      if (pm) h.blowsPm = pm;
      const inst = fight(M, [h]);
      inst.heroes = { 1: { hs: M.AR.newHuntSession({ id: 'tp', huntFromMs: 0, bag: {}, purse: 0, goldFloor: 0, basics: {} }), slots: [], actionSet: 'hunt', range: 7, ammo: null, items: M.ITEMS } };
      const sc = sc2(M, seed);
      M.abilities.fire(inst, h, { row: Object.assign({}, M.abilityData.ABILITIES.mend, { heal: [200, 200] }), target: h, lines: [], pm: 1000 }, sc);
      return (sc.events.find((e) => e.type === 'heal') || { amount: 0 }).amount;
    };
    const base = heal(0, 1);
    if (base !== 200) return 'fixture: a rung-0 heal of 200 healed ' + base;
    if (heal(50, 1) !== 210) return 'a heal of 200 at rung 5 healed ' + heal(50, 1) + ', want 210';
    return null;
  },
  /* A rung-0 hero's snapshot is its old shape, key for key; a hero with rungs carries the two permille, both ways the settle reads it. */
  'the-snapshot-carries-only-a-rung': (M) => {
    const { eq, setBonus, profile } = M.member.loadoutOf(IRON, M.ITEMS);
    const ctx = (temper) => ({ eq, equipment: IRON, items: M.ITEMS, bonus: () => 0, setBonus, profile, temper });
    const state = { skills: { melee: 0, defense: 0 }, levelXp: 0 };
    const shape = (s) => Object.keys(s).sort().join();
    for (const t of [undefined, null, {}, { 'temper:blows:3': 5, 'temper:armor:3': 5 }]) {
      const snap = M.member.heroSnapshot(state, ctx(t));
      if (shape(snap) !== 'acc,armour,def,level,maxHit') return JSON.stringify(t) + ' changed the snapshot: ' + shape(snap);
    }
    const snap = M.member.heroSnapshot(state, ctx({ 'temper:blows:2': 2, 'temper:armor:2': 5 }));
    if (snap.blowsPm !== 20 || snap.armorPm !== 50) return 'rungs 2 and 5 snap to ' + snap.blowsPm + ' and ' + snap.armorPm;
    return null;
  },
  /* THE COACH (What next, and the gold card): named at twice the price, so it never eats the food money, and only for a ladder never begun. */
  'the-coach-names-the-smith': (M) => {
    const { nextGoal, cardFor } = M.tutorial;
    const said = (gold, temper) => JSON.stringify(nextGoal({ charLevel: 20, gold, temper, inParty: false, visited: new Set() }));
    const rung = { piece: 'Iron Sword', gold: 2000, needs: '10 Tempering Salts' };
    if (!said(4000, rung).includes('temper your Iron Sword for 2,000 gp and 10 Tempering Salts')) return 'twice the price in hand says ' + said(4000, rung);
    if (said(3999, rung).includes('temper your')) return 'under twice the price the coach still names the smith';
    if (said(99999, null).includes('temper your')) return 'with no first rung to buy the coach still names the smith';
    const facts = { gold: 30000, slotCost: 25000, slotsOwned: 2, temper: rung, home: { owned: true }, chest: null };
    const card = M.tutorial.HUNT_TUTORIAL.find((c) => c.id === 'purse_goal');
    const with_ = cardFor(card, facts), without = cardFor(card, { ...facts, temper: null });
    if (!with_.text.includes('The smith can temper your Iron Sword to its first rung for 2,000 gp and 10 Tempering Salts')) return 'the gold card reads ' + with_.text;
    if (without.text.includes('smith')) return 'with no first rung the gold card names the smith: ' + without.text;
    return null;
  },
  /* The two offers the design sells: five rungs, doubling, on the two tiers with a ladder, and the rows say exactly that. */
  'the-table-is-the-sale': (M) => {
    const { TEMPER_TIERS, TEMPER_OFFERS, TEMPER_UNLOCKS, TEMPER_TRACKS, TEMPER_RUNGS } = M.temperData;
    if (TEMPER_UNLOCKS.length !== TEMPER_TRACKS.length * Object.keys(TEMPER_TIERS).length) return 'unlock rows: ' + TEMPER_UNLOCKS.length;
    if (TEMPER_OFFERS.length !== TEMPER_UNLOCKS.length * TEMPER_RUNGS) return 'offer rows: ' + TEMPER_OFFERS.length;
    for (const tier of Object.keys(TEMPER_TIERS)) {
      const prices = TEMPER_TIERS[tier];
      if (prices.length !== TEMPER_RUNGS) return 'tier ' + tier + ' has ' + prices.length + ' rungs';
      for (let i = 1; i < prices.length; i++) if (!(prices[i] > prices[i - 1])) return 'tier ' + tier + ' rung ' + (i + 1) + ' is no dearer';
    }
    if (TEMPER_TIERS[1]) return 'tier 1 has a ladder: the first hours are not to be touched';
    /* Every rung takes its tier's crafted material, climbing with its gold (Tyler 2026-11-05; the data's rules are tests/temper-buy.mjs TB-MATERIAL). Tier 1 has no ladder, so none. */
    const { TEMPER_MATERIALS } = M.temperData;
    for (const o of TEMPER_OFFERS) {
      const tier = Number(o.unlock_id.split(':')[2]), m = TEMPER_MATERIALS[tier];
      if (!m || Object.keys(o.items).join() !== m.item || o.items[m.item] !== m.qty[o.value - 1]) return o.offer_id + ' takes ' + JSON.stringify(o.items);
    }
    if (M.temperData.TEMPER_RUNG_PM * TEMPER_RUNGS > 50) return 'a full ladder is past the ruling\'s 5%: ' + M.temperData.TEMPER_RUNG_PM * TEMPER_RUNGS + ' pm';
    return null;
  },
};

const mutants = [
  { name: 'a flat floor: +1% pays nothing under 100', case: 'the-mean-is-exact', edits: [[T, '(part > 0 && rng.chance(part / 1000) ? 1 : 0)', '0']] },
  { name: 'a draw even when the blow has no part', case: 'the-mean-is-exact', edits: [[T, '(part > 0 && rng.chance(part / 1000) ? 1 : 0)', '(rng.chance(0.5) ? 1 : 0)']] },
  { name: 'no rung still draws', case: 'no-rung-draws-nothing', edits: [[T, '  if (!pm || !(amount > 0)) return amount;\n', '  rng.chance(0);\n  if (!(amount > 0)) return amount;\n']] },
  { name: 'no clamp: a forged rung is a number', case: 'a-rung-is-clamped', edits: [[T, 'Math.min(n, TEMPER_RUNGS)', 'n']] },
  { name: 'tier 1 has a ladder', case: 'the-table-is-the-sale', edits: [['src/data/temper.js', '  2: Object.freeze([2000,', '  1: Object.freeze([1, 2, 3, 4, 5]),\n  2: Object.freeze([2000,']] },
  { name: 'Blows reads the first ladder whatever the weapon', case: 'each-tier-its-own-ladder', edits: [[T, "temperRung(temper, 'blows', it.tier) * TEMPER_RUNG_PM", "temperRung(temper, 'blows', 2) * TEMPER_RUNG_PM"]] },
  { name: 'Armor reads the first ladder whatever the piece', case: 'each-tier-its-own-ladder', edits: [[T, "temperRung(temper, 'armor', it.tier)", "temperRung(temper, 'armor', 2)"]] },
  { name: 'every piece counts the same, whatever it wears', case: 'a-mixed-set-reads-each-piece', edits: [[T, 'if (def > 0) { worn += def; rungs += def * temperRung(', 'if (def > 0) { worn += 1; rungs += temperRung(']] },
  { name: 'a shield carries the Armor rung', case: 'a-mixed-set-reads-each-piece', edits: [[T, 'it && it.slot && ARMOUR_WEIGHT[it.armourClass] ? Math.floor', 'it && it.slot ? 1 + Math.floor']] },
  { name: 'Blows is lost in hurt()', case: 'blows-raise-what-lands', edits: [[D, "if (source && source.blowsPm > 0 && target.side === 'mon') n = temperedAmount(n, source.blowsPm, rng);", '']] },
  { name: 'Blows raises the swing before the monster\'s defence, so a tough monster doubles it', case: 'blows-raise-what-lands',
    edits: [[D, "if (source && source.blowsPm > 0 && target.side === 'mon') n = temperedAmount(n, source.blowsPm, rng);", ''],
      [D, '  let n = Math.max(0, Math.floor(amount));\n', "  let n = Math.max(0, Math.floor(amount));\n  if (source && source.blowsPm > 0 && target.side === 'mon') n = temperedAmount(n, source.blowsPm, rng);\n"]] },
  { name: 'a hero\'s Blows raises the blows at the hero', case: 'blows-raise-what-lands', edits: [[D, "if (source && source.blowsPm > 0 && target.side === 'mon') n = temperedAmount(n, source.blowsPm, rng);", 'if (target.blowsPm > 0) n = temperedAmount(n, target.blowsPm, rng);\n  if (source && source.blowsPm > 0) n = temperedAmount(n, source.blowsPm, rng);']] },
  { name: 'hurt() never hands the rng to the chain, so Armor is lost', case: 'armor-lowers-what-reaches-the-hero', edits: [[D, 'mitigate(n, el, armourVs(inst, target, source), target.armorPm, rng)', 'mitigate(n, el, armourVs(inst, target, source))']] },
  { name: 'Armor before the chain: ward makes it worth nothing or double', case: 'armor-lowers-what-reaches-the-hero',
    edits: [[MI, '  if (armorPm) x = temperedAmount(x, -armorPm, rng);\n', ''], [MI, '  let x = raw - Math.floor((raw * (m.absorbPm || 0)) / 1000);\n', '  let x = temperedAmount(raw, -(armorPm || 0), rng);\n  x = x - Math.floor((x * (m.absorbPm || 0)) / 1000);\n']] },
  { name: 'Armor after the cap', case: 'armor-never-passes-the-cap',
    edits: [[MI, '  if (armorPm) x = temperedAmount(x, -armorPm, rng);\n', ''], [MI, '  return Math.max(1, floor, x);\n', '  return Math.max(1, armorPm ? temperedAmount(Math.max(floor, x), -armorPm, rng) : Math.max(floor, x));\n']] },
  { name: 'a cape reads nothing on the hook', case: 'the-cape-shares-the-hook-and-the-cap', edits: [[MB, ' + steadyPmOf(c.eq, c.bonus)', '']] },
  { name: 'a food pays the to-hit roll again', case: 'a-food-cuts-and-never-guards', edits: [[MB, " + (Number(c.eq.guardB) || 0));", " + (Number(c.eq.guardB) || 0) + (Number(c.bonus('steady')) || 0) * 80);"]] },
  { name: 'a food reads nothing on the hook', case: 'a-food-cuts-and-never-guards', edits: [[MI, " + Math.round((Number(bonus && bonus('steady')) || 0) * 1000);", ";"]] },
  { name: 'the buff back on its old flat key', case: 'a-food-cuts-and-never-guards', edits: [['src/core/buffs.js', "defense: { label: 'Damage cut', bonusKey: 'steady', isPercent: true, glyph: 'uiShield' },", "defense: { label: 'Defense', bonusKey: 'defense', isPercent: false, isFlat: true, glyph: 'uiShield' },"]] },
  { name: 'a Frostfin Supper past a cape step', case: 'a-food-cuts-and-never-guards', edits: [['src/data/items.js', "buff:{type:'defense', magnitude:5,", "buff:{type:'defense', magnitude:12,"]] },
  { name: 'the words still promise guard', case: 'a-food-cuts-and-never-guards', edits: [['src/data/item-descriptions.js', "'A thick chowder of silverfin, potato and carrot. For five minutes, you take a little less damage from every hit'", "'A thick chowder of silverfin, potato and carrot, a hearty pot that stiffens your guard'"]] },
  { name: 'a cut alone has no cap', case: 'the-cape-shares-the-hook-and-the-cap', edits: [[MI, 'const keep = m.keepPm || (armorPm ? 1000 - ARMOUR_MITIGATION.capPm : 0);', 'const keep = m.keepPm;']] },
  { name: 'a cape guards again', case: 'guard-is-a-shields-alone', edits: [['src/data/slot-ladders.js', 'reqLv: 22, steadyPm: 70,', 'reqLv: 22, defB: 4,']] },
  { name: 'a stud guards again', case: 'guard-is-a-shields-alone', edits: [['src/data/slot-ladders.js', "copper_studs:        { n: 'Copper Studs',", "copper_studs:        { defB: 1, n: 'Copper Studs',"]] },
  { name: 'a Houndskin Cloak past the step', case: 'a-cape-steps-like-armor', edits: [['src/data/slot-ladders.js', 'reqLv: 22, steadyPm: 70,', 'reqLv: 22, steadyPm: 120,']] },
  { name: 'a cape with nothing on it', case: 'a-cape-steps-like-armor', edits: [['src/data/slot-ladders.js', 'reqLv: 22, steadyPm: 70,', 'reqLv: 22,']] },
  { name: 'a heal ignores Blows', case: 'a-heal-is-raised-too', edits: [['src/core/hunt/abilities.js', '  n = temperedAmount(n, u.blowsPm, sc.rng);\n', '']] },
  { name: 'a rung-0 hero carries a zero, so its snapshot changed', case: 'the-snapshot-carries-only-a-rung', edits: [[MB, '...(blowsPm ? { blowsPm } : {})', 'blowsPm']] },
  { name: 'the coach spends the food money', case: 'the-coach-names-the-smith', edits: [['src/data/hunt-tutorial.js', 'f.gold < r.gold * 2) return null;', 'f.gold < r.gold) return null;']] },
  { name: 'the gold card never names the smith', case: 'the-coach-names-the-smith', edits: [['src/data/hunt-tutorial.js', "listed(house) + '.' : '') + smith };", "listed(house) + '.' : '') };"]] },
  { name: 'a rung takes no material', case: 'the-table-is-the-sale', edits: [['src/data/temper.js', 'gold, items: itemsOf(tier, i), req_property_tier: 0,', 'gold, items: Object.freeze({}), req_property_tier: 0,']] },
  { name: 'a full ladder is 10%, past the ruling', case: 'the-table-is-the-sale', edits: [['src/data/temper.js', 'export const TEMPER_RUNG_PM = 10;', 'export const TEMPER_RUNG_PM = 20;']] },
];

await suite('hunt-core/temper', cases, mutants);
