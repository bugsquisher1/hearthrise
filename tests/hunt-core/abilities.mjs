// tests/hunt-core/abilities.mjs — src/core/hunt/abilities.js + src/data/abilities.js
// (spec §2 abilities; parity AB-01..AB-17). Run by run-all.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suiteH4, oneHero, steps, supplySession, rngOf } from './fixtures/h4.js';
import { hero } from './fixtures/h1.js';

const casts = (sc) => sc.events.filter((e) => e.type === 'cast').map((e) => e.ability);
const cast = (M) => (inst, sc) => M.abilities.castAbilities(inst, sc);
/* One hero next to one rat that targets it — a STURDY one (500 HP): since lane S1 every
   ability hit lands through damage.landHit, which hands off the kill, so a 10 HP rat
   would die to the first cast and end the fight the clocks below are measured in. */
const melee = (M, bar, over, ctx) => {
  const x = oneHero(M, over, Object.assign({ bar }, ctx || {}), [{ x: 13, y: 3, hp: 500, maxHp: 500 }]);
  x.sc.rng = rngOf(M, 1);
  return x;
};

const cases = {
  'rows-validate': (M) => {
    const bad = M.AD.validate();
    if (bad.length) return bad.join('; ');
    const inactive = Object.values(M.AD.ABILITIES).filter((r) => !r.active).map((r) => r.id).sort();
    return JSON.stringify(inactive) === '["frost_lance","rend"]' ? null : 'held rows changed: ' + JSON.stringify(inactive);
  },
  /* AB-10: the first usable ability in bar order fires, one per lane. */
  'first-usable-in-order': (M) => {
    const a = melee(M, ['power_strike', 'cleave']);
    M.abilities.castAbilities(a.inst, a.sc);
    const b = melee(M, ['cleave', 'power_strike']);
    M.abilities.castAbilities(b.inst, b.sc);
    return JSON.stringify([casts(a.sc), casts(b.sc)]) === '[["power_strike"],["cleave"]]' ? null : 'fired ' + JSON.stringify([casts(a.sc), casts(b.sc)]);
  },
  /* AB-01 / AB-02 / AB-07: a fired ability locks its lane and its own cooldown. */
  'lane-blocks-second-cast': (M) => {
    const { inst, sc } = melee(M, ['power_strike', 'cleave']);
    const lane = M.AD.ABILITY_LANES.offense;
    steps(inst, sc, cast(M), lane / 100, 0);
    if (JSON.stringify(casts(sc)) !== '["power_strike"]') return 'inside one ' + lane + ' ms lane: ' + JSON.stringify(casts(sc));
    sc.atMs = lane;
    M.abilities.castAbilities(inst, sc);
    return JSON.stringify(casts(sc)) === '["power_strike","cleave"]' ? null : 'at ' + lane + ' ms the lane did not reopen: ' + JSON.stringify(casts(sc));
  },
  'cd-set': (M) => {
    const { h, inst, sc } = melee(M, ['power_strike']);
    steps(inst, sc, cast(M), 60, 0);
    if (casts(sc).length !== 1) return 'power_strike fired ' + casts(sc).length + ' times inside its 6 s cooldown';
    if (h.cds.power_strike !== M.AD.ABILITIES.power_strike.cdMs) return 'cooldown stamped ' + h.cds.power_strike;
    sc.atMs = 6000;
    M.abilities.castAbilities(inst, sc);
    return casts(sc).length === 2 ? null : 'power_strike did not fire again at 6 s';
  },
  /* AB-12: no mana, no cast; a cast spends exactly its mana. */
  'no-mana-no-cast': (M) => {
    const need = M.AD.ABILITIES.power_strike.mana;
    const a = melee(M, ['power_strike'], { mana: need - 1, maxMana: 0 });
    M.abilities.castAbilities(a.inst, a.sc);
    if (casts(a.sc).length) return 'cast with ' + (need - 1) + ' of ' + need + ' mana';
    const b = melee(M, ['power_strike'], { mana: need, maxMana: 0 });
    M.abilities.castAbilities(b.inst, b.sc);
    return casts(b.sc).length === 1 && b.h.mana === 0 ? null : 'a cast with exactly its mana left ' + b.h.mana;
  },
  /* AB-05: a rune comes from the carried line first, then the store shot behind it. */
  'rune-own-then-store': (M) => {
    const hs = supplySession(M, { bag: { fire_rune: { loaded: 1 } }, shot: 'plain_fire_rune', ammo: 'fire_rune', purse: 50 });
    const { inst, sc } = melee(M, ['flame_strike'], {}, { hs });
    M.abilities.castAbilities(inst, sc);
    if (hs.tally.supplies.fire_rune !== 1 || hs.purse !== 50) return 'the first cast did not spend the carried rune, free';
    sc.atMs = M.AD.ABILITIES.flame_strike.cdMs;
    M.abilities.castAbilities(inst, sc);
    if (casts(sc).length !== 2 || hs.tally.bought.plain_fire_rune !== 1 || hs.purse !== 48
      || JSON.stringify(sc.events.filter((e) => e.type === 'cast').map((e) => [e.source, e.gold])) !== '[["own",0],["store",2]]') return 'the empty rune line did not fall to the store: ' + JSON.stringify(hs.tally);
    const dry = supplySession(M, { bag: { fire_rune: { loaded: 0 } }, onEmpty: 'end' });
    const d = melee(M, ['flame_strike'], {}, { hs: dry });
    M.abilities.castAbilities(d.inst, d.sc);
    return casts(d.sc).length === 0 ? null : 'a rune ability fired with no rune and the store off';
  },
  /* AB-11: an action set skips abilities (Mana train: runes; Boss: area). */
  /* Hunter's Mark keeps its row's promise: the marked monster takes bonusPct more from every blow for durMs. */
  'mark-adds-damage': (M) => {
    const row = M.AD.ABILITIES.hunters_mark;
    const x = oneHero(M, {}, { range: 7 }, [{ x: 14, y: 3, hp: 5000, maxHp: 5000 }, { x: 15, y: 3, hp: 5000, maxHp: 5000 }]);
    const [marked, plain] = x.w.units.filter((u) => u.side === 'mon');
    M.abilities.fire(x.inst, x.h, { row, target: marked, lines: [] }, x.sc);
    const hit = (t, at) => { x.sc.atMs = at; return M.damage.landHit(x.inst, x.sc, x.h, t, 100, null, null).dmg; };
    const un = hit(plain, 0), mk = hit(marked, 0);
    const want = Math.floor((un * (1000 + row.bonusPct * 10)) / 1000);
    if (mk !== want) return 'a marked monster took ' + mk + ' of a blow the unmarked one took ' + un + ' of, want ' + want;
    return hit(marked, row.durMs) === un ? null : 'the mark outlived its ' + row.durMs + ' ms';
  },
  /* Bleed scales with the caster's level in its status row's scalesWith skill (Tyler 10-16), fixed as it lands. */
  'bleed-scales-with-caster-skill': (M) => {
    const rend = M.AD.ABILITIES.rend, bleed = M.status.statusRow(rend.status);
    const lv = 40;
    const x = oneHero(M, {}, { skills: { [bleed.scalesWith]: M.XP.skillXpForLevel(bleed.scalesWith, lv) } }, [{ x: 13, y: 3, hp: 5000, maxHp: 5000 }]);
    x.sc.rng = rngOf(M, 5);
    const t = x.w.units.find((u) => u.side === 'mon');
    M.abilities.fire(x.inst, x.h, { row: rend, target: t, lines: [] }, x.sc);
    const want = M.status.stackScale(bleed, { skillLv: lv, runeTier: 1 });
    const got = (t.statuses || []).map((st) => st.scale);
    return got.length && want > 1000 && got.every((s) => s === want) ? null : 'a level-' + lv + ' caster\'s bleed landed at ' + JSON.stringify(got) + ', want ' + want;
  },
  'action-set-skips': (M) => {
    const hs = () => supplySession(M, { bag: { fire_rune: { loaded: 5 } } });
    const a = melee(M, ['flame_strike', 'power_strike'], {}, { hs: hs(), actionSet: 'mana_train' });
    M.abilities.castAbilities(a.inst, a.sc);
    const b = oneHero(M, {}, { hs: hs(), bar: ['fireball', 'arcane_barrier'], actionSet: 'boss', range: 7 },
      [{ x: 14, y: 3 }, { x: 15, y: 3 }]);
    b.sc.rng = rngOf(M, 2); b.h.hp = 50;
    M.abilities.castAbilities(b.inst, b.sc);
    return JSON.stringify([casts(a.sc), casts(b.sc)]) === '[["power_strike"],["arcane_barrier"]]' ? null : 'fired ' + JSON.stringify([casts(a.sc), casts(b.sc)]);
  },
  /* AB-12: a wand/staff basic costs mana (no mana, no shot); a bow basic one shot, own line then the store. */
  'basic-costs': (M) => {
    const a = oneHero(M, { mana: 2 });
    if (!M.abilities.payBasic(a.inst, a.h, { mana: 2 }, a.sc) || a.h.mana !== 0) return 'a 2-mana basic did not spend its mana';
    if (M.abilities.payBasic(a.inst, a.h, { mana: 2 }, a.sc)) return 'a basic swung with no mana';
    const hs = supplySession(M, { bag: { barbed_arrows: { loaded: 1 } }, shot: 'plain_barbed_arrows', ammo: 'barbed_arrows', purse: 3 });
    const b = oneHero(M, {}, { hs, ammo: 'barbed_arrows' });
    const shots = [0, 1, 2].map(() => M.abilities.payBasic(b.inst, b.h, { ammo: 1 }, b.sc));
    if (JSON.stringify(shots) !== '[true,true,false]') return 'own, store, then a dry purse shot ' + JSON.stringify(shots);
    return hs.tally.supplies.barbed_arrows === 1 && hs.tally.bought.plain_barbed_arrows === 1 && hs.goldOut === true
      ? null : 'the shots were not split own/store, or the dry purse ended nothing: ' + JSON.stringify(hs.tally);
  },
  /* AB-06: a shot ability spends its shots of the loaded ammo, per cast. */
  'ammo-per-shot': (M) => {
    const hs = supplySession(M, { bag: { iron_arrows: { loaded: 2 } } });
    const { inst, sc } = oneHero(M, {}, { hs, bar: ['precision_shot'], range: 7, ammo: 'iron_arrows' }, [{ x: 15, y: 3 }]);
    sc.rng = rngOf(M, 3);
    M.abilities.castAbilities(inst, sc);
    if (hs.bag.iron_arrows.left !== 1) return 'a one-shot ability left ' + hs.bag.iron_arrows.left + ' of 2 arrows';
    const v = supplySession(M, { bag: { iron_arrows: { loaded: 2 }, fire_rune: { loaded: 2 } }, onEmpty: 'end' });
    const x = oneHero(M, {}, { hs: v, bar: ['flame_volley'], range: 7, ammo: 'iron_arrows' }, [{ x: 15, y: 3 }, { x: 15, y: 4 }]);
    x.sc.rng = rngOf(M, 4);
    M.abilities.castAbilities(x.inst, x.sc);
    return casts(x.sc).length === 0 && v.bag.fire_rune.left === 2 ? null : 'a three-shot volley fired on two arrows';
  },
  /* AB-09: a heal is capped at the missing HP (food no longer waits on it: consumables.js ALWAYS FIRES). */
  'heal-capped': (M) => {
    const { h, inst, sc } = oneHero(M, { hp: 65 }, { bar: ['greater_mend'], range: 7 }, [{ x: 15, y: 3 }]);
    sc.rng = rngOf(M, 5);
    M.abilities.castAbilities(inst, sc);
    const ev = sc.events.find((e) => e.type === 'heal');
    return !ev || ev.amount !== 35 || h.hp !== 100 ? 'a 40-60 heal on 35 missing healed ' + (ev && ev.amount) + ' to ' + h.hp : null;
  },
  /* AB-03 / AB-08: Challenge pulls every engaged monster that is not on the tank. */
  'taunt-pulls-back': (M) => {
    const { w, inst, sc } = melee(M, ['challenge']);
    w.units.push(hero(M, 2, 11, 3, { hp: 50, maxHp: 50 }));
    w.units.sort((a, b) => a.id - b.id);
    w.units.find((u) => u.id === 10).target = 2;
    M.abilities.castAbilities(inst, sc);
    if (w.units.find((u) => u.id === 10).target !== 1) return 'Challenge left the monster on the healer';
    sc.atMs = 8000;
    M.abilities.castAbilities(inst, sc);
    return casts(sc).length === 1 ? null : 'Challenge fired with every monster already on the tank';
  },
  /* AB-13: mana regenerates 25% of max a minute, exactly, in whole sub-steps. */
  'mana-regen': (M) => {
    const { h, inst, sc } = oneHero(M, { mana: 0, maxMana: 600 }, { bar: [] });
    steps(inst, sc, cast(M), 600, 0);
    return h.mana === 150 ? null : 'a minute regenerated ' + h.mana + ' of 600 max, want 150';
  },
  /* Persisted: cooldowns, lanes and fractional mana survive a settle cut. */
  'clocks-survive-a-cut': (M) => {
    const run = (cut) => {
      const x = melee(M, ['power_strike', 'cleave'], { mana: 30, maxMana: 77 });
      let w = x.w;
      for (let t = 0; t < 14000; t += 100) {
        if (cut && t % 900 === 0) { w = M.worldstate.decode(JSON.parse(JSON.stringify(M.worldstate.encode(w)))); x.inst.world = w; }
        x.sc.atMs = t;
        M.abilities.castAbilities(x.inst, x.sc);
      }
      return JSON.stringify([M.worldstate.encode(w), x.sc.events]);
    };
    return run(false) === run(true) ? null : 'a cut changed the casts: a clock is not persisted';
  },
  /* AB-17: hunts are idle — the bar has no press path. */
  'no-press-path': (M) => {
    const src = readFileSync(join(M.root, 'src/core/hunt/abilities.js'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    return /press/i.test(src) ? 'abilities.js reads a press' : null;
  },
};

const mutants = [
  { name: 'the mark is drawn but adds nothing', case: 'mark-adds-damage',
    edits: [['src/core/hunt/damage.js', '    markPm ? Object.assign({}, ability, { mult: Math.floor((base * (1000 + markPm)) / 1000) }) : ability);', '    ability);']] },
  { name: 'the mark never wears off', case: 'mark-adds-damage',
    edits: [['src/core/hunt/damage.js', ' && target.markUntil > sc.atMs ?', ' ?']] },
  { name: 'bleed lands at level 0 whatever the caster', case: 'bleed-scales-with-caster-skill',
    edits: [['src/core/hunt/abilities.js', 'skillLv: h && h.skills ? levelOf(h.skills, srow.scalesWith) : 0,', 'skillLv: 0,']] },
  { name: 'an active ability names a rune no bag can hold', case: 'rows-validate',
    edits: [['src/data/abilities.js', "    dmg: [2, 4], hits: 2, status: 'bleed', active: false }),", "    dmg: [2, 4], hits: 2, status: 'bleed' }),"]] },
  { name: 'the bar fires its last usable ability', case: 'first-usable-in-order',
    edits: [['src/core/hunt/abilities.js', "  const rows = slotsFor(h, 'ability').filter(", "  const rows = slotsFor(h, 'ability').reverse().filter("]] },
  { name: 'a cast does not lock its lane', case: 'lane-blocks-second-cast',
    edits: [['src/core/hunt/abilities.js', "  if (readyAt(hero.lanes, row.lane) > atMs) return 'lane';", '']] },
  { name: 'a cast does not set its cooldown', case: 'cd-set',
    edits: [['src/core/hunt/abilities.js', "  if (readyAt(hero.cds, row.id) > atMs) return 'cooldown';", '']] },
  { name: 'mana is not checked', case: 'no-mana-no-cast',
    edits: [['src/core/hunt/abilities.js', "  if (int(hero.mana) < row.mana) return 'mana';", '']] },
  { name: 'a rune is never taken from the bag', case: 'rune-own-then-store',
    edits: [['src/core/hunt/abilities.js', '  for (const l of pick.lines) if (!takeLine(h.hs, l, sc.atMs)) { h.hs.goldOut = true; return false; }', '']] },
  { name: 'the action set skips nothing', case: 'action-set-skips',
    edits: [['src/core/hunt/abilities.js', "  if ((skip.rune && row.rune) || (skip.area && row.target === 'area')) return 'action_set';", '']] },
  { name: 'a mana basic swings on an empty pool', case: 'basic-costs',
    edits: [['src/core/hunt/abilities.js', '    if (int(hero.mana) < c.mana) return false;', '']] },
  { name: 'a multi-shot ability may fire short', case: 'ammo-per-shot',
    edits: [['src/core/hunt/abilities.js', "      if (!shot) return { why: 'no_ammo' };", '      if (!shot) return { lines };']] },
  { name: 'a heal is not capped at the missing HP', case: 'heal-capped',
    edits: [['src/core/hunt/abilities.js', '  const got = Math.max(0, Math.min(n, int(t.maxHp) - int(t.hp)));', '  const got = Math.max(0, n);']] },
  { name: 'Challenge pulls nothing', case: 'taunt-pulls-back',
    edits: [['src/core/hunt/abilities.js', '      for (const m of engaged(inst)) if (m.target !== u.id) m.target = u.id;', '']] },
  { name: 'fractional mana is dropped every sub-step', case: 'mana-regen',
    edits: [['src/core/hunt/abilities.js', '  u.manaMilli -= whole * 1000;', '  u.manaMilli = 0;']] },
  { name: 'the lanes are not persisted', case: 'clocks-survive-a-cut',
    edits: [['src/core/hunt/abilities.js', "['regenPm', 'int'], ['lanes', 'json'], ['cds', 'json'],", "['regenPm', 'int'], ['cds', 'json'],"]] },
];

await suiteH4('hunt-core/abilities', cases, mutants);
