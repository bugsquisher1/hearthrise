// tests/hunt-core/damage.mjs — src/core/hunt/damage.js, the one hurt() (spec §2 damage; parity RO-19, DM-13).
// Run by run-all.mjs.
import { suite, H, E, inst2, sc2, world, groundRow } from './fixtures/h2.js';

const D = 'src/core/hunt/damage.js';
const fight = (M, units) => inst2(M, world(M, units, { phase: 'fight', leader: 1 }));
const src = (M, o) => H(M, 90, 1, 1, 'ranger', o);
/* A hero of `role` (a Ranger unless named) next to one sturdy def-0 monster, a session with `bag` (the store's
   Plain Barbed Arrows behind Barbed Arrows, 1,000 gold) and a member whose rolls depend only on the ammo they are
   priced with and its share (shotRolls: Barbed 40, Bronze 20, none 5, x the store share; the loaded ammo's
   snapshot max hit is 20). Every blow lands at its max hit (the dice). */
function shotFixture(M, bag, ammo, stored, o) {
  const x = o || {};
  const id = Object.keys(M.MONSTERS).find((k) => M.C.defenceReduction(M.MONSTERS[k]) === 0 && Object.values(M.MONSTERS[k].elements).every((p) => p < 0));
  const inst = fight(M, [H(M, 1, 12, 3, x.role || 'ranger', Object.assign({ target: 2, maxHit: 20 }, x.unit || {})), E(M, 2, 0, 13, 3, 1, { kind: id, hp: 100000, maxHp: 100000 })]);
  const hs = M.AR.newHuntSession({ id: 'dm', huntFromMs: 0, bag, purse: x.purse ?? 1000, goldFloor: 0,
    basics: { plain_barbed_arrows: { kind: 'ammo', price: 2, heals: 0, mana: 0, partner: 'barbed_arrows' },
      plain_fire_rune: { kind: 'ammo', price: 2, heals: 0, mana: 0, partner: 'chalked_fire_rune' } } });
  const rolls = (a, share) => ({ accuracy: 1, critChance: 0, weak: { damageMult: 1 },
    maxHit: Math.floor(((({ barbed_arrows: 40, bronze_arrows: 20 })[a] || 5) * (Number.isInteger(share) ? share : 1000)) / 1000) });
  inst.heroes = { 1: { hs, slots: M.conditions.heroSlots(stored, null), actionSet: 'hunt', range: 7, ammo, items: M.ITEMS,
    rollsVs: () => rolls(ammo), shotRolls: (row, a, share) => rolls(a, share) } };
  const sc = sc2(M, 1);
  sc.rng = M.rng.rngFrom(() => 0.9999999);
  return { inst, sc, hs };
}

const cases = {
  /* TYLER 2026-11-04: "They are just simply harder ... it's inherent in the game, not a penalty driven system." A monster's blow reads its own stats against the hero's own stats:
     at the same stats and on the same dice, every swing of a hero at any Level is the same swing. Both paths: this hook is the one both a watched hunt and a closed browser step through. */
  'same-blow-at-any-level': (M) => {
    const base = blowsAtLevel(M, 32);
    if (base.length < 20 || !base.some((b) => b.startsWith('dmg:')) || !base.some((b) => b.startsWith('miss:'))) return 'the fixture swung ' + base.length + ' times: ' + base.slice(0, 4).join();
    for (const lv of [1, 5, 16, 31, 33, 60, undefined]) {
      const got = blowsAtLevel(M, lv);
      if (got.join() !== base.join()) return 'Level ' + lv + ' is struck differently from Level 32: ' + got.slice(0, 6).join() + ' against ' + base.slice(0, 6).join();
    }
    return null;
  },
  /* ARMOR READS WHO STRUCK (2026-11-04): the same plate takes less off a strong monster's blow and more off a weak one's, by the monster's own level, whatever the hero's. Dodge the same. */
  'armour-reads-the-attacker': (M) => {
    const inst = fight(M, []);
    const through = (kind, armour) => { const t = H(M, 2, 12, 3, 'tank', { hp: 100000, maxHp: 100000 }); t.armour = armour; return M.damage.hurt(inst, t, 1000, E(M, 9, 0, 13, 3, 1, { kind }), null, null).dmg; };
    const plate = { heavy: 18, medium: 0, light: 0 };
    const weak = through('gray_whelp', plate), strong = through('hobgoblin_foreman', plate);
    if (!(strong > weak * 1.3)) return 'through bronze plate a level 46 foreman lands ' + strong + ', a level 5 whelp ' + weak + ' of 1000: armor is not reading the attacker';
    const want = M.mitigation.mitigate(1000, 1000, M.mitigation.mitigationOf(plate, M.MONSTERS.hobgoblin_foreman.level));
    if (strong !== want) return 'the foreman lands ' + strong + ', the curve at its level says ' + want;
    const leather = { heavy: 0, medium: 18, light: 0 };
    if (!(M.mitigation.mitigationOf(leather, 46).dodgePm < M.mitigation.mitigationOf(leather, 5).dodgePm)) return 'dodge does not fall against a stronger attacker';
    /* a status tick whose dealer has left the world has a level to read all the same */
    const t = H(M, 2, 12, 3, 'tank', { hp: 1000, maxHp: 1000 }); t.armour = plate;
    return M.damage.hurt(inst, t, 100, null, null, { id: 'bleed', dot: true }).dmg > 0 ? null : 'a status tick with no dealer dealt nothing';
  },
  /* A TIER IS THE MONSTER'S OWN STATS (hunt-tiers.js, Tyler 2026-11-04): on a harder tier the same monster's blow reads a higher atk, armor reads its higher Level and its kill pays more Level XP. No hero Level anywhere; Normal is the row to the digit. Both paths: this hook is the one a watched hunt and a closed browser both step through. */
  'a-tier-is-the-monsters-stats': (M) => {
    const T = { id: 'deadly', pull: [8, 8, 8, 8], dmgPm: 1500, hpPm: 1000, xpPm: 1200 };
    const row = M.MONSTERS.hobgoblin_foreman;
    const plate = { heavy: 18, medium: 0, light: 0 };
    const through = (tier) => { const inst = fight(M, []); inst.tier = tier; const t = H(M, 2, 12, 3, 'tank', { hp: 100000, maxHp: 100000 }); t.armour = plate; return M.damage.hurt(inst, t, 1000, E(M, 9, 0, 13, 3, 1, { kind: 'hobgoblin_foreman' }), null, null).dmg; };
    const want = M.mitigation.mitigate(1000, 1000, M.mitigation.mitigationOf(plate, Math.round((row.level * T.dmgPm) / 1000)));
    if (through(T) !== want || !(want > through(null))) return 'through plate a Deadly foreman lands ' + through(T) + ' of 1000, the curve at its raised level says ' + want + ', Normal ' + through(null);
    /* the blow: the same dice, a higher atk: it lands at least as often and past Normal's biggest blow, and never past the tier's */
    const swings = (tier, lv) => blowsAtLevel(M, lv === undefined ? 32 : lv, tier);
    const top = (bs) => Math.max(0, ...bs.filter((b) => b.startsWith('dmg:')).map((b) => Number(b.split(/[:@]/)[1])));
    const hits = (bs) => bs.filter((b) => b.startsWith('dmg:')).length;
    const plain = swings(null), hard = swings(T);
    if (swings({ id: 'normal', dmgPm: 1000, hpPm: 1000, xpPm: 1000 }).join() !== plain.join()) return 'Normal is not the row: ' + swings({ id: 'normal', dmgPm: 1000, hpPm: 1000, xpPm: 1000 }).slice(0, 4).join();
    if (!(top(hard) > top(plain)) || hits(hard) < hits(plain)) return 'on Deadly the foreman tops out at ' + top(hard) + ' and lands ' + hits(hard) + '; on Normal ' + top(plain) + ' and ' + hits(plain);
    /* in no armor, past anything his row can land */
    const bare = blowsAtLevel(M, 32, T, true);
    if (!(top(bare) > M.C.monsterMaxHit(row)) || top(bare) > M.C.monsterMaxHit({ ...row, atk: row.atk * 1.5 })) return 'on Deadly, in no armor, the foreman tops out at ' + top(bare) + '; his row\'s biggest blow is ' + M.C.monsterMaxHit(row);
    for (const lv of [1, 16, 60]) if (swings(T, lv).join() !== hard.join()) return 'a Level ' + lv + ' hero is struck differently on Deadly: a tier reads no hero';
    /* the kill: the row's XP on the tier, before the party factor (a lone hero's small boost, Tyler 2026-11-08: party-class-xp.js, the xp event's `raw`);
       its coin and drops aren't this file's (hunt-tiers.mjs harder-tier-costs) */
    const killXp = (tier) => {
      const k = H(M, 1, 12, 3, 'tank', { hp: 1000, maxHp: 1000, target: 2 });
      const m = E(M, 2, 0, 13, 3, 1, { kind: 'goblin_scavenger', hp: 5, maxHp: 5 });
      const inst = inst2(M, world(M, [k, m], { phase: 'fight', leader: 1 }), groundRow({ hunt: 'coppercap_warrens' }));
      inst.tier = tier;
      const sc = sc2(M, 7);
      M.damage.landHit(inst, sc, k, m, 1000, null, null, false);
      return sc.events.filter((e) => e.type === 'xp').reduce((s, e) => s + e.raw, 0);
    };
    const xp = M.MONSTERS.goblin_scavenger.xp;
    if (killXp(null) !== xp) return 'a Normal kill pays ' + killXp(null) + ', the row says ' + xp;
    return killXp(T) === Math.round((xp * T.xpPm) / 1000) ? null : 'a Deadly kill pays ' + killXp(T) + ', the tier says ' + Math.round((xp * T.xpPm) / 1000);
  },
  /* contract §1.5 (the element profile, a percentage each: Tyler 2026-11-06): a weakness pays its share more, a resist
     its share less, a blow with no element is untouched, and nothing is immune (the slime takes half of an ember blow). */
  'weak-resist-half': (M) => {
    const weakId = Object.keys(M.MONSTERS).find((id) => M.C.defenceReduction(M.MONSTERS[id]) === 0
      && Object.values(M.MONSTERS[id].elements).some((p) => p < 0));
    if (!weakId) return 'fixture: no monster with an element weakness';
    const [el, pct] = Object.entries(M.MONSTERS[weakId].elements).find(([, p]) => p < 0);
    const t = () => E(M, 2, 0, 12, 3, 1, { kind: weakId, hp: 1000, maxHp: 1000 });
    const inst = fight(M, []);
    const weak = M.damage.hurt(inst, t(), 100, src(M), el, null).dmg;
    const want = 100 - pct;
    if (weak !== want) return weakId + ' weak to ' + el + ': 100 dealt ' + weak + ', expected ' + want;
    if (M.damage.hurt(inst, t(), 100, src(M), null, null).dmg !== 100) return 'a blow with no element was changed';
    if (M.MONSTERS.slime.elements.ember !== 50 || M.C.defenceReduction(M.MONSTERS.slime)) return 'fixture: the slime is ' + JSON.stringify(M.MONSTERS.slime.elements);
    const slime = E(M, 3, 0, 12, 3, 1, { kind: 'slime', hp: 800, maxHp: 800 });
    const r = M.damage.hurt(inst, slime, 100, src(M), 'ember', null);
    return r.dmg === 50 && slime.hp === 750 && !('immune' in r) ? null : 'the slime took ' + JSON.stringify(r) + ' of a 100 ember blow, want 50';
  },
  /* The monster's defence takes combat.js defenceReduction off every blow (one source with playerCombatRolls). */
  'def-reduction': (M) => {
    const id = Object.keys(M.MONSTERS).sort((a, b) => M.C.defenceReduction(M.MONSTERS[b]) - M.C.defenceReduction(M.MONSTERS[a]))[0];
    const red = M.C.defenceReduction(M.MONSTERS[id]);
    if (red < 1) return 'fixture: no monster whose defence reduces a blow';
    const m = E(M, 2, 0, 12, 3, 1, { kind: id, hp: 1000, maxHp: 1000 });
    const got = M.damage.hurt(fight(M, []), m, 20, src(M), null, null).dmg;
    return got === 20 - red ? null : id + ' (reduction ' + red + '): 20 dealt ' + got;
  },
  /* spec §3.7 stances: Offensive +10% dealt (and taken), Defensive -15% taken; dealt then taken, floored. */
  'stance-dealt-and-taken': (M) => {
    const inst = fight(M, []);
    const hit = (s, t) => M.damage.hurt(inst, H(M, 2, 12, 3, 'tank', { hp: 1000, maxHp: 1000, stance: t }), 100, src(M, { stance: s }), null, null).dmg;
    const S = M.RS.HUNT_STANCES;
    const want = (s, t) => Math.floor((Math.floor((100 * S[s].dealt) / 1000) * S[t].taken) / 1000);
    for (const [s, t] of [['offensive', 'balanced'], ['balanced', 'defensive'], ['offensive', 'defensive'], ['defensive', 'offensive']]) {
      if (hit(s, t) !== want(s, t)) return s + ' into ' + t + ': ' + hit(s, t) + ', expected ' + want(s, t);
    }
    return hit('offensive', 'balanced') === 110 && hit('balanced', 'defensive') === 85 ? null : 'the stance numbers moved';
  },
  /* A shield takes the blow first; only the rest reaches HP. */
  'shield-absorbs-first': (M) => {
    const t = H(M, 2, 12, 3, 'tank', { hp: 50, maxHp: 50 });
    t.shield = 5;
    const r = M.damage.hurt(fight(M, []), t, 8, src(M), null, null);
    return r.absorbed === 5 && t.shield === 0 && t.hp === 47 ? null : 'shield ' + t.shield + ', hp ' + t.hp + ', absorbed ' + r.absorbed;
  },
  /* Every landed blow that the element does not void deals at least 1. */
  'min-1': (M) => {
    const id = Object.keys(M.MONSTERS).find((k) => M.C.defenceReduction(M.MONSTERS[k]) >= 1);
    const m = E(M, 2, 0, 12, 3, 1, { kind: id, hp: 1000, maxHp: 1000 });
    const inst = fight(M, []);
    if (M.damage.hurt(inst, m, 1, src(M, { stance: 'defensive' }), null, null).dmg !== 1) return 'a 1-point blow into defence dealt nothing';
    return M.damage.hurt(inst, m, 0, src(M), null, null).dmg === 1 ? null : 'a landed blow of 0 must still deal 1';
  },
  /* The kill hand-off: a monster becomes a corpse, a hero is DEAD (no knockout: Tyler 2026-10-19); the client hears `kill`. */
  'kill-hand-off': (M) => {
    const k = H(M, 1, 12, 3, 'tank'); const r = H(M, 2, 16, 3, 'ranger', { hp: 5, maxHp: 50 });
    const m = E(M, 3, 0, 13, 3, 1, { hp: 4 });
    const inst = fight(M, [k, r, m]);
    const sc = sc2(M, 1);
    M.damage.landHit(inst, sc, k, m, 9, null, null);
    if (m.alive || m.hp !== 0 || m.deadMs !== 0) return 'the monster did not fall';
    if (!sc.events.some((e) => e.type === 'kill' && e.u === 1 && e.t === 3)) return 'no kill event';
    const d = sc.events.find((e) => e.type === 'dmg' && e.u === 1);
    if (!d || d.ability !== 'basic' || d.element !== null) return 'the dmg event does not name its ability and element: ' + JSON.stringify(d);
    M.damage.landHit(inst, sc, k, E(M, 9, 0, 14, 3, 1, { hp: 50, maxHp: 50 }), 5, 'frost', { id: 'frost_lance' });
    if (!sc.events.some((e) => e.type === 'dmg' && e.t === 9 && e.ability === 'frost_lance' && e.element === 'frost')) return 'an ability hit lost its ability or element';
    M.damage.landHit(inst, sc, m, r, 9, null, null);
    return !r.alive && r.hp === 0 && !('downMs' in r) ? null : 'the killed hero is not simply dead: ' + JSON.stringify({ alive: r.alive, hp: r.hp, downMs: r.downMs });
  },
  /* RULING K7 (Tyler 2026-10-18): a blow at a hero meets its armour in a FIXED order: absorb (heavy), then
     resistances, then ward (light), then the shield and HP. 100 into absorb 500 + ward 3: 100 -> 50 -> 47
     (ward before absorb would give 48). Every landed blow deals at least 1; an unarmoured hero takes it whole. */
  'armour-order': (M) => {
    const inst = fight(M, []);
    const mon = E(M, 9, 0, 13, 3, 1, { kind: 'rat' });
    const hit = (armour, n) => { const t = H(M, 2, 12, 3, 'tank', { hp: 1000, maxHp: 1000 }); t.armour = armour; return M.damage.hurt(inst, t, n, mon, null, null).dmg; };
    const got = M.mitigation.mitigate(100, 1000, { dodgePm: 0, absorbPm: 500, ward: 3, keepPm: 0 });
    if (got !== 47) return 'absorb 500 + ward 3 on a 100 blow dealt ' + got + ', want 47 (absorb, then ward)';
    if (M.mitigation.mitigate(10, 1000, { dodgePm: 0, absorbPm: 0, ward: 50, keepPm: 0 }) !== 1) return 'a blow the ward swallows still deals 1';
    /* the blow reaches that chain: plate on the hero takes its share off through hurt */
    const worn = { heavy: 18, medium: 0, light: 0 };
    if (hit(worn, 100) !== M.mitigation.mitigate(100, 1000, M.mitigation.mitigationOf(worn, M.MONSTERS.rat.level))) return 'plate through hurt dealt ' + hit(worn, 100);
    return hit(null, 100) === 100 ? null : 'an unarmoured hero took ' + hit(null, 100) + ' of 100';
  },
  /* THE TOTAL CAP (ruling K7, core-model.js ARMOUR_MITIGATION.capPm): dodge, absorb and ward together never take
     more than capPm of the damage coming at a hero. The profile holds absorb under it beside a dodge, and a landed
     blow keeps keepPm of itself whatever the ward; a profile built from armour no hero could wear still obeys it. */
  'armour-cap': (M) => {
    const cap = M.coreModel.ARMOUR_MITIGATION.capPm;
    const inst = fight(M, []);
    const mon = E(M, 9, 0, 13, 3, 1, { kind: 'rat' });
    const huge = M.mitigation.mitigationOf({ heavy: 100000, medium: 100000, light: 100000 }, 1);
    if (huge.dodgePm > cap) return 'dodge ' + huge.dodgePm + ' passes the cap ' + cap;
    /* the profile the sheet shows honours it too: dodge and absorb together leave at least 1000 - cap */
    if ((1000 - huge.dodgePm) * (1000 - huge.absorbPm) < (1000 - cap) * 1000 - 1000) return 'the profile shows dodge ' + huge.dodgePm + ' + absorb ' + huge.absorbPm + ', past the cap ' + cap;
    for (const n of [10, 100, 1000]) {
      const t = H(M, 2, 12, 3, 'tank', { hp: 100000, maxHp: 100000 }); t.armour = { heavy: 100000, medium: 100000, light: 100000 };
      const landed = M.damage.hurt(inst, t, n, mon, null, null).dmg;
      /* the average blow that reaches HP, over dodged and landed blows alike */
      const expected = ((1000 - huge.dodgePm) * landed) / 1000;
      if (expected < (n * (1000 - cap)) / 1000 - 1) return 'a ' + n + ' blow: ' + landed + ' lands past dodge ' + huge.dodgePm + ', under the cap of ' + (n * (1000 - cap)) / 1000;
    }
    return null;
  },
  /* MIXED PIECES BLEND BY SLOT (ruling K7): each worn piece's armour value feeds its own weight's line and no
     other (plate absorbs, leather dodges, cloth wards), and a mixed set is exactly the sum of its parts. */
  'armour-blend': (M) => {
    const I = M.ITEMS, mit = M.mitigation;
    const pick = (cls, slot) => Object.keys(I).find((k) => I[k].armourClass === cls && I[k].slot === slot && I[k].tier === 1 && I[k].defB > 0);
    const plate = pick('plate', 'body'), leather = pick('leather', 'pants'), cloth = pick('cloth', 'helmet');
    if (!plate || !leather || !cloth) return 'fixture: no tier-1 plate body / leather pants / cloth helmet';
    const v = mit.armourValues({ body: plate, pants: leather, helmet: cloth, weapon: 'practice_sword', shield: 'practice_shield' }, I);
    if (v.heavy !== I[plate].defB || v.medium !== I[leather].defB || v.light !== I[cloth].defB) return 'armour values ' + JSON.stringify(v);
    const p = mit.mitigationOf(v, 8);
    const only = (w) => mit.mitigationOf(Object.assign({ heavy: 0, medium: 0, light: 0 }, { [w]: v[w] }), 8);
    if (!(p.absorbPm > 0 && p.dodgePm > 0 && p.ward > 0)) return 'a mixed set lost a line: ' + JSON.stringify(p);
    if (p.absorbPm !== only('heavy').absorbPm || p.dodgePm !== only('medium').dodgePm || p.ward !== only('light').ward) {
      return 'a mixed set is not the sum of its pieces: ' + JSON.stringify([p, only('heavy'), only('medium'), only('light')]);
    }
    if (only('heavy').dodgePm || only('heavy').ward || only('medium').absorbPm || only('light').absorbPm) return 'a weight fed another line';
    return mit.mitigationOf(v, 60).absorbPm < p.absorbPm ? null : 'the same plate absorbs no less from a level 60 monster than from a level 8';
  },
  /* DODGE, the chain's first step (ruling K7): a blow at a hero with dodge misses outright (a `miss` event marked
     dodge, no damage) on its permille chance; a status tick is never dodged. */
  'armour-dodge': (M) => {
    const inst = fight(M, []);
    const mon = E(M, 9, 0, 13, 3, 1, { kind: 'rat' });
    const t = H(M, 2, 12, 3, 'tank', { hp: 100, maxHp: 100 });
    t.armour = { heavy: 0, medium: 100000, light: 0 };
    const sc = sc2(M, 3);
    sc.rng = M.rng.rngFrom(() => 0);
    const r = M.damage.landHit(inst, sc, mon, t, 9, null, null);
    if (t.hp !== 100 || !sc.events.some((e) => e.type === 'miss' && e.t === 2 && e.dodge === true)) return 'a certain dodge landed: hp ' + t.hp + ' ' + JSON.stringify(sc.events);
    if (!r || r.dmg !== 0) return 'a dodge answered ' + JSON.stringify(r);
    M.damage.landHit(inst, sc, null, t, 4, null, { id: 'bleed', dot: true });
    if (t.hp !== 96) return 'a status tick was dodged: hp ' + t.hp;
    /* the chance is permille: leather worth 34.2% against a rat turns aside about a third */
    const s2 = sc2(M, 7);
    const u = H(M, 3, 12, 4, 'tank', { hp: 1e9, maxHp: 1e9 });
    u.armour = { heavy: 0, medium: 1, light: 0 };
    const pm = M.mitigation.mitigationOf(u.armour, M.MONSTERS.rat.level).dodgePm;
    for (let i = 0; i < 400; i++) M.damage.landHit(inst, s2, mon, u, 1, null, null);
    const n = s2.events.filter((e) => e.type === 'miss' && e.dodge === true).length;
    return pm > 200 && Math.abs(n - (pm * 400) / 1000) <= 50 ? null : 'dodge ' + pm + ' turned aside ' + n + ' of 400 blows';
  },
  /* RO-19: ranged heroes shoot while moving; Melee only standing on a tile. */
  'ranged-fires-on-move': (M) => {
    const mk = (role, x) => {
      const h = H(M, 1, x, 3, role, { fx: x - 1, prog: 300, target: 2 });
      const inst = fight(M, [h, E(M, 2, 0, x + 1, 3, 1, { hp: 1000, maxHp: 1000 })]);
      const sc = sc2(M, 1);
      M.movement.occupancy(inst);
      M.damage.resolveAttacks(inst, sc);
      return sc.events.filter((e) => e.u === 1 && (e.type === 'dmg' || e.type === 'miss')).length;
    };
    if (mk('ranger', 12) !== 1) return 'a moving ranger did not shoot';
    return mk('melee_dps', 12) === 0 ? null : 'a moving Melee hero swung';
  },
  /* THE ITEM A SHOT SPENDS PRICES ITS BLOW (lane a-rune-spend). A slot naming one ammo while another is loaded
     spent the named one and hit at the loaded one's strength: the blow read the loaded ammo's rolls. Every blow
     lands at its max hit here, so the dmg is the max hit the blow was priced with (the member's shotRolls stub:
     40 Barbed, 20 Bronze, 5 bare). */
  'blow-priced-by-the-item-spent': (M) => {
    const one = (slots, ammo) => {
      const r = shotFixture(M, { barbed_arrows: { loaded: 3 }, bronze_arrows: { loaded: 1 } }, ammo, slots);
      M.movement.occupancy(r.inst);
      M.damage.resolveAttacks(r.inst, r.sc);
      return { dmg: r.sc.events.filter((e) => e.type === 'dmg' && e.u === 1).map((e) => e.amount), barbed: r.hs.bag.barbed_arrows.left };
    };
    /* (a slot with a condition is a rule: it fires ahead of the worn ammo, conditions.js attackOrder) */
    const named = one([{ action: { type: 'attack_with_item', id: 'barbed_arrows' }, conditions: [{ metric: 'self_hp_pct', op: 'lte', value: 100 }], join: 'and' }], 'bronze_arrows');
    const loaded = one([], 'barbed_arrows'), bronze = one([], 'bronze_arrows');
    if (JSON.stringify(bronze.dmg) !== '[20]' || JSON.stringify(loaded.dmg) !== '[20]') return 'CONTROL: a loaded-ammo basic did not hit at the snapshot (20): ' + JSON.stringify([bronze, loaded]);
    if (named.barbed !== 2) return 'the Barbed slot did not spend a Barbed Arrow: ' + named.barbed + ' left of 3';
    return JSON.stringify(named.dmg) === '[40]' ? null : 'a Barbed Arrow shot with Bronze loaded hit for ' + JSON.stringify(named.dmg) + ', want Barbed\'s 40';
  },
  /* A STORE SHOT IS ITS PARTNER'S BASIC VERSION (supply-basics.js BASIC_EFFECT_SHARE; Tyler 10-23: arrows are
     bought from the store like anything else). With its own Barbed Arrows gone the Ranger buys Plain Barbed
     Arrows per shot and the blow is priced at the store's share of Barbed's (the stub: 40 x 750 = 30). */
  'store-shot-is-the-basic-version': (M) => {
    const r = shotFixture(M, { barbed_arrows: { loaded: 0 } }, 'barbed_arrows', []);
    M.movement.occupancy(r.inst);
    M.damage.resolveAttacks(r.inst, r.sc);
    const dmg = r.sc.events.filter((e) => e.type === 'dmg' && e.u === 1).map((e) => e.amount);
    if (r.hs.tally.bought.plain_barbed_arrows !== 1 || r.hs.purse !== 998) return 'the empty quiver did not buy one Plain Barbed Arrow: ' + JSON.stringify([r.hs.tally.bought, r.hs.purse]);
    const want = Math.floor((40 * Math.round(M.SB.BASIC_EFFECT_SHARE * 1000)) / 1000);
    return JSON.stringify(dmg) === '[' + want + ']' ? null : 'a store arrow hit for ' + JSON.stringify(dmg) + ', want the basic version\'s ' + want;
  },
  /* THE CASTER'S BASIC COSTS MANA AND TRAINS MAGIC (Tyler 10-15 K3, 10-23: runes fuel spells only), on the REAL
     path: resolveAttacks spends the role's data mana (hunt-roles.js `basic`) and says it on a `shot` event the
     rewards pay Magic XP from; no mana, no swing (AB-12, the lane waits `mana`); a rune in the bag or the ammo
     slot is never spent, never bought and adds nothing to the blow (member.js combatWorn). */
  'caster-basic-costs-mana': (M) => {
    const basic = M.huntRoles.HUNT_ROLES.mage.basic;
    if (!basic || !(basic.mana > 0) || !(basic.magicXpMult > 0)) return 'the Mage row carries no basic mana cost: ' + JSON.stringify(basic);
    const r = shotFixture(M, { chalked_fire_rune: { loaded: 5 } }, 'chalked_fire_rune', [], { role: 'mage', unit: { mana: basic.mana, maxMana: 100 } });
    M.movement.occupancy(r.inst);
    M.damage.resolveAttacks(r.inst, r.sc);
    const me = r.inst.world.units.find((u) => u.id === 1);
    const shot = r.sc.events.find((e) => e.type === 'shot' && e.u === 1);
    if (me.mana !== 0 || !shot || shot.mana !== basic.mana || shot.magicXpMult !== basic.magicXpMult) return 'the Mage\'s basic did not spend its ' + basic.mana + ' mana: ' + JSON.stringify([me.mana, shot]);
    if (r.hs.bag.chalked_fire_rune.left !== 5 || Object.keys(r.hs.tally.bought).length) return 'the Mage\'s basic spent or bought a rune: ' + JSON.stringify([r.hs.bag.chalked_fire_rune, r.hs.tally.bought]);
    /* the Magic XP is the shot's mana at its multiplier, through the one rewards path */
    const xp = {};
    const members = new Map([[1, { fx: { addXp: (k, n) => { xp[k] = (xp[k] || 0) + n; } }, state: {} }]]);
    M.rewards.rewardSwing(members, r.sc.events, r.inst.world, { rng: null });
    if (xp.magic !== M.xpshare.magicXpFor(basic.mana, basic.magicXpMult / 1000) || !(xp.magic > 0)) return 'the basic\'s mana paid ' + xp.magic + ' Magic XP';
    /* the next interval with an empty pool: no swing, the wait is said */
    r.sc.events.length = 0;
    r.sc.atMs = M.C.COMBAT_BALANCE.tickMs;
    me.swingLeftMs = 0;
    M.damage.resolveAttacks(r.inst, r.sc);
    if (r.sc.events.some((e) => (e.type === 'dmg' || e.type === 'miss' || e.type === 'shot') && e.u === 1)) return 'the Mage swung with no mana';
    if (!r.sc.events.some((e) => e.type === 'rule_wait' && e.why === 'mana')) return 'the empty-pool wait was not said';
    /* a loaded rune adds nothing to the real member's blow (the sheet and the snapshot read the same set) */
    const mi = (ammo) => ({ key: 'a', equipment: { weapon: 'oak_staff', ...(ammo ? { ammo } : {}) }, skills: { magic: M.XP.skillXpForLevel('magic', 40) }, levelXp: 0, hp: 100, hero: { role: 'healer' } });
    const snap = (ammo) => { const s = M.member.memberSide(mi(ammo), { items: M.ITEMS }); return [s.member.snapshot(s.state).maxHit, s.member.hero.ammo]; };
    return JSON.stringify(snap('graven_rupture_rune')) === JSON.stringify(snap(null)) ? null : 'a loaded Graven Rupture Rune changed the staff\'s blow: ' + JSON.stringify([snap('graven_rupture_rune'), snap(null)]);
  },
  /* A SHOT IS AMMO THE WORN WEAPON CAN LOOSE (Andy 2026-10-23, Fremulon): a bow loosed one Copper Whetstone a shot
     (1,012 in 43 min) from an attack slot ahead of his arrows. A slot naming an item the weapon cannot shoot is
     passed over and the arrows behind it fire; a whetstone worn in a bow's ammo slot is no shot; a staff never
     shoots an arrow slot (its basic spends mana, never the arrow or a rune: Tyler 2026-10-23). */
  'no-shot-the-weapon-cannot-loose': (M) => {
    const id = Object.keys(M.MONSTERS).find((k) => M.C.defenceReduction(M.MONSTERS[k]) === 0 && Object.values(M.MONSTERS[k].elements).every((p) => p < 0));
    const atk = (item) => ({ action: { type: 'attack_with_item', id: item }, conditions: [], join: 'and' });
    const one = (role, slots, ammo, bag, unit) => {
      const inst = fight(M, [H(M, 1, 12, 3, role, Object.assign({ target: 2, maxHit: 20 }, unit || {})), E(M, 2, 0, 15, 3, 1, { kind: id, hp: 100000, maxHp: 100000 })]);
      const hs = M.AR.newHuntSession({ id: 'dm', huntFromMs: 0, bag, purse: 1000, goldFloor: 0, basics: {} });
      inst.heroes = { 1: { hs, slots: M.conditions.heroSlots(slots, null), actionSet: 'hunt', range: 7, ammo, items: M.ITEMS } };
      const sc = sc2(M, 1);
      M.movement.occupancy(inst);
      M.damage.resolveAttacks(inst, sc);
      return { shots: sc.events.filter((e) => e.type === 'shot').map((e) => e.item), swings: sc.events.filter((e) => e.u === 1 && (e.type === 'dmg' || e.type === 'miss')).length,
        left: Object.fromEntries(Object.entries(hs.bag).map(([k, l]) => [k, l.left])) };
    };
    const bow = one('ranger', [atk('copper_whetstone'), atk('iron_arrows')], null, { copper_whetstone: { loaded: 5 }, iron_arrows: { loaded: 5 } });
    if (JSON.stringify(bow) !== JSON.stringify({ shots: ['iron_arrows'], swings: 1, left: { copper_whetstone: 5, iron_arrows: 4 } })) return 'a bow with a whetstone slot ahead of its arrows: ' + JSON.stringify(bow);
    const worn = one('ranger', [], 'copper_whetstone', { copper_whetstone: { loaded: 5 } });
    if (worn.swings !== 0 || worn.left.copper_whetstone !== 5) return 'a bow wearing a whetstone shot it: ' + JSON.stringify(worn);
    const staff = one('mage', [atk('iron_arrows')], 'chalked_fire_rune', { iron_arrows: { loaded: 5 }, chalked_fire_rune: { loaded: 5 } }, { mana: 50, maxMana: 100 });
    return staff.swings === 1 && staff.left.iron_arrows === 5 && staff.left.chalked_fire_rune === 5 ? null : 'a staff with an arrow slot: ' + JSON.stringify(staff);
  },
  /* WHICH ARROWS A BOW LOOSES (Andy #63, build 0.2.38, Fremulon: "Bronze arrow in ammo slot ... yet game is still using
     'default' barbed arrows"; reordering his bar changed nothing). His empty Barbed slot bought a Plain Barbed Arrow every
     shot ahead of the Bronze he wore. Carried stock first: the worn ammo, then the bar's ammo in bar order; the store
     only once everything carried is gone, in that same order (the worn ammo's partner first). */
  'worn-ammo-before-the-store': (M) => {
    const id = Object.keys(M.MONSTERS).find((k) => M.C.defenceReduction(M.MONSTERS[k]) === 0 && Object.values(M.MONSTERS[k].elements).every((p) => p < 0));
    const atk = (item) => ({ action: { type: 'attack_with_item', id: item }, conditions: [], join: 'and' });
    const store = (sid, partner) => ({ [sid]: { kind: 'ammo', price: 1, heals: 0, mana: 0, partner } });
    /* n swings; after each, what the bag holds and the store sold (the default swing emits no shot event: stock is the record) */
    const play = (worn, bar, bag, n) => {
      const inst = fight(M, [H(M, 1, 12, 3, 'ranger', { target: 2, maxHit: 20 }), E(M, 2, 0, 15, 3, 1, { kind: id, hp: 1e6, maxHp: 1e6 })]);
      const hs = M.AR.newHuntSession({ id: 'dm', huntFromMs: 0, bag, purse: 1000, goldFloor: 0,
        basics: { ...store('plain_barbed_arrows', 'barbed_arrows'), ...store('plain_iron_arrows', 'iron_arrows') } });
      inst.heroes = { 1: { hs, slots: M.conditions.heroSlots(bar, null), actionSet: 'hunt', range: 7, ammo: worn, items: M.ITEMS } };
      const sc = sc2(M, 1);
      M.movement.occupancy(inst);
      const steps = [];
      let swings = 0;
      for (let i = 0; i < n; i++) {
        sc.events.length = 0;
        M.damage.resolveAttacks(inst, sc);
        swings += sc.events.filter((e) => e.u === 1 && (e.type === 'dmg' || e.type === 'miss')).length;
        steps.push(Object.entries(hs.bag).map(([k, l]) => k + ':' + l.left).concat(Object.entries(hs.tally.bought).map(([k, q]) => k + ' bought ' + q)).join(','));
        inst.world.units.find((u) => u.id === 1).swingLeftMs = 0;
        sc.atMs += M.C.COMBAT_BALANCE.tickMs;
      }
      return { swings, steps };
    };
    /* his case: Bronze worn (the free rung, carried), Barbed on the bar with none carried: Bronze every shot, nothing bought */
    const andy = play('bronze_arrows', [atk('barbed_arrows')], { bronze_arrows: { loaded: 5 } }, 3);
    if (andy.swings !== 3 || andy.steps.some((x) => /bought/.test(x))) return 'Bronze worn, Barbed on the bar (none carried): ' + JSON.stringify(andy);
    /* the order: the worn Iron until it runs out, then the bar's carried Barbed, then the store's Plain Iron (the worn ammo's partner) */
    const order = play('iron_arrows', [atk('barbed_arrows')], { iron_arrows: { loaded: 2 }, barbed_arrows: { loaded: 1 } }, 5);
    const want = ['iron_arrows:1,barbed_arrows:1', 'iron_arrows:0,barbed_arrows:1', 'iron_arrows:0,barbed_arrows:0',
      'iron_arrows:0,barbed_arrows:0,plain_iron_arrows bought 1', 'iron_arrows:0,barbed_arrows:0,plain_iron_arrows bought 2'];
    return order.swings === 5 && JSON.stringify(order.steps) === JSON.stringify(want) ? null
      : 'Iron worn (2), Barbed on the bar (1), 5 swings: ' + JSON.stringify(order) + ', want ' + JSON.stringify(want);
  },
  /* DM-13: one swing per COMBAT_BALANCE.tickMs (the one basic-attack interval), the first as soon as the target is in reach. */
  'swing-every-interval': (M) => {
    const k = H(M, 1, 12, 3, 'tank', { hp: 100000, maxHp: 100000, target: 2 });
    const m = E(M, 2, 0, 13, 3, 1, { hp: 100000, maxHp: 100000 });
    const inst = fight(M, [k, m]);
    const sc = sc2(M, 1);
    const n = M.C.COMBAT_BALANCE.tickMs / 100;
    for (let i = 0; i <= n; i++) { M.movement.occupancy(inst); M.damage.resolveAttacks(inst, sc); sc.atMs += 100; }
    const swings = (u) => sc.events.filter((e) => e.u === u && (e.type === 'dmg' || e.type === 'miss')).length;
    return swings(1) === 2 && swings(2) === 2 ? null : 'in one interval + 1 sub-step: hero ' + swings(1) + ', monster ' + swings(2) + ' swings (want 2 each)';
  },
};

/* NO HERO LEVEL IN A MONSTER'S BLOW: one foreman, one hero's stats in all three armor weights, one ground, one dice stream, swung for a minute at each hero Level. */
/* def 40: the foreman's to-hit off both its caps (formula row, baseAcc 0.86: 0.85 at def 20 and under, 0.52 at 40, 0.05 from 80), so a
   level term on the to-hit roll moves the blows this reads (lane/b-tier-dials: at def 20 that mutant escaped once the formula wrote the row). */
const blowsAtLevel = (M, heroLv, tier, bare) => {
  const k = H(M, 1, 12, 3, 'tank', { hp: 1000000, maxHp: 1000000, target: 2, def: 40 });
  k.heroLv = heroLv;
  k.armour = bare ? null : { heavy: 21, medium: 11, light: 7 };
  const m = E(M, 2, 0, 13, 3, 1, { kind: 'hobgoblin_foreman', hp: 1000000, maxHp: 1000000 });
  const inst = inst2(M, world(M, [k, m], { phase: 'fight', leader: 1 }), groundRow({ hunt: 'coppercap_warrens' }));
  if (tier) inst.tier = tier;
  const sc = sc2(M, 7);
  for (let i = 0; i < 600; i++) { M.movement.occupancy(inst); M.damage.resolveAttacks(inst, sc); sc.atMs += 100; }
  return sc.events.filter((e) => e.u === 2 && (e.type === 'dmg' || e.type === 'miss')).map((e) => e.type + ':' + (e.amount || 0) + '@' + e.atMs);
};

const mutants = [
  { name: 'a tier does not raise the blow', case: 'a-tier-is-the-monsters-stats', edits: [[D, 'const row = atTier(rowOf(inst, u.kind), inst.tier);', 'const row = MONSTERS[u.kind];']] },
  { name: 'armor ignores the tier', case: 'a-tier-is-the-monsters-stats', edits: [[D, 'levelAtTier(monsterLevelOf(rowOf(inst, source.kind)), inst.tier)', 'monsterLevelOf(MONSTERS[source.kind])']] },
  { name: 'a kill pays no tier XP', case: 'a-tier-is-the-monsters-stats', edits: [[D, 'atTier(rowOf(inst, target.kind), inst.tier).xp', 'MONSTERS[target.kind].xp']] },
  { name: 'a tier reads the hero: Deadly is gentler on a low Level', case: 'a-tier-is-the-monsters-stats', edits: [[D, 'const row = atTier(rowOf(inst, u.kind), inst.tier);', 'const row = atTier(MONSTERS[u.kind], (t.heroLv || 32) < 16 ? null : inst.tier);']] },
  { name: 'armor reads the hero\'s Level again', case: 'same-blow-at-any-level',
    edits: [[D, "mitigationOf(target.armour, source && source.side === 'mon' ? levelAtTier(monsterLevelOf(rowOf(inst, source.kind)), inst.tier) : 1)", 'mitigationOf(target.armour, target.heroLv || 1)']] },
  { name: 'armor ignores who struck: every blow reads level 1', case: 'armour-reads-the-attacker',
    edits: [[D, "mitigationOf(target.armour, source && source.side === 'mon' ? levelAtTier(monsterLevelOf(rowOf(inst, source.kind)), inst.tier) : 1)", 'mitigationOf(target.armour, 1)']] },
  { name: 'a level term on the blow: a hero under the floor is hit twice as hard', case: 'same-blow-at-any-level',
    edits: [[D, 'swing(inst, sc, u, t, monsterAccuracy(blowRow, t.def), monsterMaxHit(blowRow));', 'swing(inst, sc, u, t, monsterAccuracy(blowRow, t.def), monsterMaxHit(blowRow) * (t.heroLv < 32 ? 2 : 1));']] },
  { name: 'a level term on the to-hit roll: a hero under the floor is hit more often', case: 'same-blow-at-any-level',
    edits: [[D, 'swing(inst, sc, u, t, monsterAccuracy(blowRow, t.def), monsterMaxHit(blowRow));', 'swing(inst, sc, u, t, monsterAccuracy(blowRow, t.def - (t.heroLv < 32 ? 30 : 0)), monsterMaxHit(blowRow));']] },
  { name: 'the 11-02 term comes back: atk x 1.05 per Level under the floor', case: 'same-blow-at-any-level',
    edits: [[D, 'swing(inst, sc, u, t, monsterAccuracy(blowRow, t.def), monsterMaxHit(blowRow));', 'const foe = Object.assign({}, blowRow, { atk: blowRow.atk * (1 + 0.05 * Math.max(0, 32 - (t.heroLv || 32))) }); swing(inst, sc, u, t, monsterAccuracy(foe, t.def), monsterMaxHit(foe));']] },
  { name: 'the element is ignored', case: 'weak-resist-half', edits: [[D, '  const el = elementOn(target, element);', '  const el = 1000;']] },
  { name: 'a slime is immune to ember again', case: 'weak-resist-half', edits: [[D, '  const el = elementOn(target, element);', "  const el = element === 'ember' && target.kind === 'slime' ? 0 : elementOn(target, element);\n  if (el === 0) return { dmg: 0, absorbed: 0, killed: false, immune: true };"]] },
  { name: 'defence is ignored', case: 'def-reduction', edits: [[D, " - defenceReduction(rowOf(inst, target.kind));", ';']] },
  { name: 'the dealer\'s stance is ignored', case: 'stance-dealt-and-taken', edits: [[D, '  n = Math.floor((n * stanceOf(source).dealt) / 1000);\n', '']] },
  { name: 'the target\'s stance is ignored', case: 'stance-dealt-and-taken', edits: [[D, '  n = Math.floor((n * stanceOf(target).taken) / 1000);\n', '']] },
  { name: 'the shield is ignored', case: 'shield-absorbs-first', edits: [[D, '  if (absorbed) target.shield -= absorbed;', '  if (false) target.shield -= absorbed;']] },
  { name: 'no minimum', case: 'min-1', edits: [[D, ': Math.max(1, n);', ': Math.max(0, n);']] },
  { name: 'ward before absorb', case: 'armour-order', edits: [['src/core/mitigation.js',
    '  let x = raw - Math.floor((raw * (m.absorbPm || 0)) / 1000);\n  x = Math.floor((x * el) / 1000);\n  x -= Math.max(0, m.ward || 0);',
    '  let x = raw - Math.max(0, m.ward || 0);\n  x -= Math.floor((x * (m.absorbPm || 0)) / 1000);\n  x = Math.floor((x * el) / 1000);']] },
  { name: 'a hero\'s armour is skipped', case: 'armour-order', edits: [[D, "n = target.side === 'hero' ? mitigate(n, el, armourVs(inst, target, source), target.armorPm, rng) : Math.max(1, n);", 'n = Math.max(1, n);']] },
  { name: 'a ward-swallowed blow deals 0', case: 'armour-order', edits: [['src/core/mitigation.js', '  return Math.max(1, floor, x);', '  return Math.max(0, floor, x);']] },
  { name: 'no keep floor', case: 'armour-cap', edits: [['src/core/mitigation.js', '  return Math.max(1, floor, x);', '  return Math.max(1, x);']] },
  { name: 'absorb ignores the dodge beside it', case: 'armour-cap', edits: [['src/core/mitigation.js', 'Math.min(1000 - keepPm, curve(M.absorb, nat(v.heavy), L))', 'curve(M.absorb, nat(v.heavy), L)']] },
  { name: 'dodge passes the cap', case: 'armour-cap', edits: [['src/core/mitigation.js', 'const dodgePm = Math.min(cap, curve(M.dodge, nat(v.medium), L));', 'const dodgePm = curve(M.dodge, nat(v.medium), L);']] },
  { name: 'leather feeds absorb', case: 'armour-blend', edits: [['src/data/core-model.js', "leather: 'medium'", "leather: 'heavy'"]] },
  { name: 'armour ignores the Level', case: 'armour-blend', edits: [['src/core/mitigation.js', '(p + row.k * Math.max(1, level))', '(p + row.k)']] },
  { name: 'a piece counts by slot, not its armour', case: 'armour-blend', edits: [['src/core/mitigation.js', 'if (w) out[w] += nat(it.defB);', 'if (w) out[w] += 1;']] },
  { name: 'no dodge roll', case: 'armour-dodge', edits: [[D, '  if (dodgePm > 0 && sc.rng.chance(dodgePm / 1000)) {', '  if (false) {']] },
  { name: 'a status tick is dodged', case: 'armour-dodge', edits: [[D, ' && !(ability && ability.dot) ?', ' ?']] },
  { name: 'dodge read as percent', case: 'armour-dodge', edits: [[D, '  if (dodgePm > 0 && sc.rng.chance(dodgePm / 1000)) {', '  if (dodgePm > 0 && sc.rng.chance(dodgePm / 100)) {']] },
  { name: 'dmg forgets its ability', case: 'kill-hand-off', edits: [[D, "    ability: (ability && ability.id) || 'basic', element: element || null, ...(crit ? { crit: true } : {}),", '    element: element || null, ...(crit ? { crit: true } : {}),']] },
  { name: 'a killed hero gets back up', case: 'kill-hand-off', edits: [['src/core/hunt/pull-cycle.js', "  if (u.side === 'mon') { u.deadMs = 0; return; }\n  u.spot = null;", "  if (u.side === 'mon') { u.deadMs = 0; return; }\n  u.alive = true; u.hp = 1; u.spot = null;"]] },
  { name: 'Melee swings on the move', case: 'ranged-fires-on-move', edits: [[D, '    if (!row || (row.melee && !atRest(u)) || !inRange(inst, u, t)) continue;', '    if (!row || !inRange(inst, u, t)) continue;']] },
  { name: 'a shot is priced by the loaded ammo, not the item it spent', case: 'blow-priced-by-the-item-spent',
    edits: [[D, "  if (h && t.side === 'mon' && price !== undefined && (price !== h.ammo || basic) && typeof h.shotRolls === 'function') {", '  if (false) {']] },
  { name: 'a store arrow hits as hard as a crafted one', case: 'store-shot-is-the-basic-version',
    edits: [[D, "    const sharePm = paid !== true && paid.source === 'store' ? BASIC_SHOT_PM : undefined;", '    const sharePm = undefined;']] },
  { name: 'a caster basic swings free', case: 'caster-basic-costs-mana', edits: [[D, '      if (row.basic) {', '      if (false) {']] },
  { name: 'a caster swings on an empty pool', case: 'caster-basic-costs-mana',
    edits: [[D, '        return (Number(u.mana) || 0) >= row.basic.mana ?', '        return true ?'], ['src/core/hunt/abilities.js', '    if (int(hero.mana) < c.mana) return false;\n', '']] },
  { name: 'the basic\'s mana trains nothing', case: 'caster-basic-costs-mana',
    edits: [['src/core/hunt-rewards.js', "      case 'shot': {", "      case 'shot_': {"]] },
  { name: 'a loaded rune still prices the caster\'s blow', case: 'caster-basic-costs-mana',
    edits: [['src/core/member.js', '  if (!e.ammo || !isRune(items && items[e.ammo])) return e;', '  return e;']] },
  /* Two doors keep a whetstone slot from a bow (Andy a41): the bar refuses to hold one (conditions.js attackItem, the
     server's hr_hunt_action_ids) and the swing passes over what this hero cannot shoot. The live bug was both open. */
  { name: 'a bow shoots the whetstone an attack slot names (Andy 10-23)', case: 'no-shot-the-weapon-cannot-loose',
    edits: [[D, '    if (!shootsItem(u.role, itemRow(h, id))) return null;\n', ''], ['src/core/hunt/conditions.js', 'SHOOTERS.some((r) => shootsItem(r, ITEMS[id]))', "!!ITEMS[id] && ITEMS[id].reqSkill !== 'magic'"]] },
  { name: 'a bow shoots the whetstone it wears', case: 'no-shot-the-weapon-cannot-loose',
    edits: [[D, '      const fits = !!h && !!h.ammo && shootsItem(u.role, itemRow(h, h.ammo));', '      const fits = !!h && !!h.ammo;']] },
  { name: 'the store sells before carried stock is gone (Andy #63)', case: 'worn-ammo-before-the-store',
    edits: [['src/core/hunt/conditions.js', "  return pickSlot(inst, u, h, rows, act(true), null, 'attack') || pickSlot(inst, u, h, rows, act(false), sc, 'attack');", "  return pickSlot(inst, u, h, rows, act(false), sc, 'attack');"]] },
  { name: 'the worn ammo waits behind the bar (Andy #63)', case: 'worn-ammo-before-the-store',
    edits: [['src/core/hunt/conditions.js', '  return ruled.concat(worn ? [worn] : [], plain);', '  return ruled.concat(plain, worn ? [worn] : []);']] },
  { name: 'no swing interval', case: 'swing-every-interval', edits: [[D, 'function restart(u) { u.swingLeftMs = COMBAT_BALANCE.tickMs; }', 'function restart(u) { u.swingLeftMs = 0; }']] },
];

await suite('hunt-core/damage', cases, mutants);
