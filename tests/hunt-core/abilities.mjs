// tests/hunt-core/abilities.mjs — src/core/hunt/abilities.js + src/data/abilities.js
// (spec §2 abilities; parity AB-01..AB-17). Run by run-all.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { suiteH4, oneHero, steps, supplySession, rngOf } from './fixtures/h4.js';
import { hero, ROOT } from './fixtures/h1.js';

/* THE CLIENT'S SUPPLY ROWS, read from the repo (a planted copy holds only src/core and src/data): the Configure
   action table and the bar's store line must price what the engine buys, never more (CLAUDE.md §6). */
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const shellOf = (p) => import(pathToFileURL(join(ROOT, p)).href + V);
const SHELL = { table: await shellOf('src/shell/action-table.js'), draft: await shellOf('src/shell/bar-draft.js') };

const casts = (sc) => sc.events.filter((e) => e.type === 'cast').map((e) => e.ability);
const cast = (M) => (inst, sc) => M.abilities.castAbilities(inst, sc);
/* One hero next to one rat that targets it — a STURDY one (500 HP): since lane S1 every
   ability hit lands through damage.landHit, which hands off the kill, so a 10 HP rat
   would die to the first cast and end the fight the clocks below are measured in. */
/* A bar slot for ability `id` that names its store rune (Configure action's choice). */
const storeSlot = (id) => ({ action: { type: 'ability', id, store: 'plain_fire_rune' }, conditions: [], join: 'and' });
const melee = (M, bar, over, ctx) => {
  const x = oneHero(M, over, Object.assign({ bar }, ctx || {}), [{ x: 13, y: 3, hp: 500, maxHp: 500 }]);
  x.sc.rng = rngOf(M, 1);
  return x;
};

const cases = {
  'rows-validate': (M) => {
    const bad = M.AD.validate().concat(M.runes.validate(M.ITEMS));
    if (bad.length) return bad.join('; ');
    /* every crafted family carries its five tiers under the derived id and name; every other rune row is its
       family's lone old-ladder row (one a family, until the family's batch lands) */
    const runes = Object.keys(M.ITEMS).filter((id) => M.runes.isRune(M.ITEMS[id]));
    for (const f of M.SC.CRAFTED_RUNE_FAMILIES) {
      for (const t of M.runes.RUNE_TIERS) {
        const it = M.ITEMS[M.runes.runeId(f, t.tier)];
        if (!it || it.family !== f || it.runeTier !== t.tier || it.n !== M.runes.runeName(f, t.tier) || it.reqLv !== t.level) return 'the ' + f + ' family has no proper ' + t.name + ' rune: ' + JSON.stringify(it);
      }
    }
    const loose = runes.filter((id) => !M.SC.CRAFTED_RUNE_FAMILIES.includes(M.ITEMS[id].family));
    if (new Set(loose.map((id) => M.ITEMS[id].family)).size !== loose.length || !loose.every((id) => M.runes.runeTierOf(M.ITEMS[id]) === 1)) return 'an uncrafted family has more than its one old rune: ' + loose;
    const inactive = Object.values(M.AD.ABILITIES).filter((r) => !r.active).map((r) => r.id).sort();
    return JSON.stringify(inactive) === '[]' ? null : 'held rows changed: ' + JSON.stringify(inactive);
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
  /* AB-05: a rune comes from the carried line first, then the store rune the SLOT names (Tyler 2026-10-19:
     the player picks the store item); a slot that names none spends carried runes only (designer 2026-10-21:
     a default bar never buys one unseen). */
  'rune-own-then-store': (M) => {
    const hs = supplySession(M, { bag: { chalked_fire_rune: { loaded: 1 } }, shot: 'plain_fire_rune', ammo: 'chalked_fire_rune', purse: 50 });
    const { inst, sc } = melee(M, [storeSlot('flame_strike')], {}, { hs });
    M.abilities.castAbilities(inst, sc);
    if (hs.tally.supplies.chalked_fire_rune !== 1 || hs.purse !== 50) return 'the first cast did not spend the carried rune, free';
    sc.atMs = M.AD.ABILITIES.flame_strike.cdMs;
    M.abilities.castAbilities(inst, sc);
    if (casts(sc).length !== 2 || hs.tally.bought.plain_fire_rune !== 1 || hs.purse !== 48
      || JSON.stringify(sc.events.filter((e) => e.type === 'cast').map((e) => [e.source, e.gold])) !== '[["own",0],["store",2]]') return 'the empty rune line did not fall to the store: ' + JSON.stringify(hs.tally);
    const dry = supplySession(M, { bag: { chalked_fire_rune: { loaded: 0 } }, onEmpty: 'end' });
    const d = melee(M, [storeSlot('flame_strike')], {}, { hs: dry });
    M.abilities.castAbilities(d.inst, d.sc);
    if (casts(d.sc).length) return 'a rune ability fired with no rune and the store off';
    const bare = supplySession(M, { bag: { chalked_fire_rune: { loaded: 0 } }, shot: 'plain_fire_rune', ammo: 'chalked_fire_rune', purse: 50 });
    const n = melee(M, ['flame_strike'], {}, { hs: bare });
    M.abilities.castAbilities(n.inst, n.sc);
    return casts(n.sc).length === 0 && bare.purse === 50 ? null : 'a Flame Strike slot naming no store rune bought one';
  },
  /* LIVE 10-21 (Andy: "Flame Strike isn't usable, not using runes from store"): the store had no rune row,
     and the store was shut while ANY carried ammo line had a use left — the starter kit's free Bronze Arrows
     and Coarse Whetstones never run out. Both rune abilities cast on the store's Plain Fire Rune (the real
     catalogue row and price) with the starter kit's ammo still in the bag. */
  'store-rune-beside-the-starter-kit': (M) => {
    const row = M.SB.BASIC_INDEX.plain_fire_rune;
    if (!row || row.partner !== 'chalked_fire_rune' || row.kind !== 'ammo') return 'the store has no Plain Fire Rune behind the Fire Rune';
    const kit = () => {
      const hs = supplySession(M, { bag: { bronze_arrows: { loaded: 50 }, air_rune: { loaded: 50 }, coarse_whetstone: { loaded: 10 }, iron_arrows: { loaded: 30 } }, purse: 1000 });
      hs.basics.plain_fire_rune = { kind: 'ammo', price: row.price, heals: 0, mana: 0, partner: 'chalked_fire_rune' };
      return hs;
    };
    const hs = kit();
    const { inst, sc } = melee(M, [storeSlot('flame_strike')], {}, { hs });
    M.abilities.castAbilities(inst, sc);
    if (JSON.stringify(casts(sc)) !== '["flame_strike"]' || hs.tally.bought.plain_fire_rune !== 1 || hs.purse !== 1000 - row.price) {
      return 'Flame Strike did not cast on a store rune beside the starter kit: ' + JSON.stringify([casts(sc), hs.tally, hs.purse]);
    }
    const v = kit();
    const x = oneHero(M, {}, { hs: v, bar: [storeSlot('flame_volley')], range: 7, ammo: 'iron_arrows' }, [{ x: 15, y: 3 }, { x: 15, y: 4 }]);
    x.sc.rng = rngOf(M, 6);
    M.abilities.castAbilities(x.inst, x.sc);
    return JSON.stringify(casts(x.sc)) === '["flame_volley"]' && v.tally.bought.plain_fire_rune === 1 && v.bag.iron_arrows.left === 27
      ? null : 'Flame Volley did not cast on a store rune and three own arrows: ' + JSON.stringify([casts(x.sc), v.tally, v.bag.iron_arrows]);
  },
  /* RUNES ARE SPELL REAGENTS (Tyler 2026-10-23, src/data/runes.js): a spell casts the VERSION of the rune it
     SPENDS (a tier-N rune, version N), once the hero's level in the spell's skill (Flame Strike: Melee, the
     weapon's own, designer d3-weaponskill) reaches versionLevel(N); a carried rune whose version is locked is
     not spent and the slot waits `level`; the store's rune (only when the slot names it) is the BASIC version:
     version I at the store's share, so the same roll lands BASIC_EFFECT_SHARE as hard. */
  'spell-casts-the-spent-runes-version': (M) => {
    const skill = M.AD.abilitySkill(M.AD.ABILITIES.flame_strike), need = M.runes.versionLevel(3);
    if (skill !== 'melee' || need !== 30) return 'Flame Strike levels on ' + skill + ' and version III needs ' + need + ', want melee 30';
    const at = (lv, store) => {
      const hs = supplySession(M, { bag: { etched_fire_rune: { loaded: 2 } }, shot: 'plain_fire_rune', ammo: 'chalked_fire_rune', purse: 50 });
      const x = melee(M, [store ? storeSlot('flame_strike') : 'flame_strike'], {}, { hs, skills: { melee: M.XP.skillXpForLevel('melee', lv) } });
      M.abilities.castAbilities(x.inst, x.sc);
      return { x, hs, cast: x.sc.events.find((e) => e.type === 'cast') || null };
    };
    const open = at(need);
    if (!open.cast || open.cast.version !== 3 || open.cast.supply !== 'etched_fire_rune' || open.cast.source !== 'own' || open.hs.bag.etched_fire_rune.left !== 1) {
      return 'a Melee-30 tank spending an Etched (tier-3) Fire Rune did not cast version III from its own rune: ' + JSON.stringify(open.cast);
    }
    const shut = at(need - 1);
    if (shut.cast || shut.hs.bag.etched_fire_rune.left !== 2) return 'a Melee-29 tank cast version III or spent the rune it cannot use: ' + JSON.stringify(shut.cast);
    if (!shut.x.sc.events.some((e) => e.type === 'rule_wait' && e.why === 'level')) return 'the locked version was not said (rule_wait level)';
    const basic = at(need - 1, true);
    if (!basic.cast || basic.cast.version !== 1 || basic.cast.source !== 'store' || basic.cast.supply !== 'plain_fire_rune'
      || basic.cast.power !== Math.floor((M.AD.outputPm(M.AD.ABILITIES.flame_strike, 1, need - 1) * Math.round(M.SB.BASIC_EFFECT_SHARE * 1000)) / 1000)
      || basic.hs.bag.etched_fire_rune.left !== 2) {
      return 'a locked rune with the store named did not cast the store rune at basic power: ' + JSON.stringify(basic.cast);
    }
    /* the same roll at the store's share: the basic version lands BASIC_EFFECT_SHARE of the crafted hit */
    const hit = (lv, store) => {
      const hs = supplySession(M, { bag: { chalked_fire_rune: { loaded: store ? 0 : 1 } }, shot: 'plain_fire_rune', ammo: 'chalked_fire_rune', purse: 50 });
      const x = melee(M, [storeSlot('flame_strike')], {}, { hs, skills: { melee: M.XP.skillXpForLevel('melee', lv) } });
      M.abilities.castAbilities(x.inst, x.sc);
      return (x.sc.events.find((e) => e.type === 'dmg') || {}).amount;
    };
    const own = hit(1, false), store = hit(1, true);
    const want = Math.max(1, Math.floor((own * Math.round(M.SB.BASIC_EFFECT_SHARE * 1000)) / 1000));
    return own > 1 && store === want ? null : 'a store rune hit for ' + store + ' where the crafted one hit ' + own + ' (want ' + want + ')';
  },
  /* A SPELL SPENDS ITS FAMILY'S BEST UNLOCKED TIER (lane b-spell-content; Tyler 2026-10-23): of the Fire runes a
     tank carries, Flame Strike spends the highest tier its Melee level has unlocked and casts that version at its
     mana; one level short of Graven it spends the Chalked rune instead (never the locked one); a rune of another
     family is never spent. */
  'family-spends-the-best-unlocked-tier': (M) => {
    const fs = M.AD.ABILITIES.flame_strike;
    const run = (lv, bag) => {
      const hs = supplySession(M, { bag });
      const x = melee(M, ['flame_strike'], { mana: 100, maxMana: 100 }, { hs, skills: { melee: M.XP.skillXpForLevel('melee', lv) } });
      M.abilities.castAbilities(x.inst, x.sc);
      return { hs, cast: x.sc.events.find((e) => e.type === 'cast') || null };
    };
    const both = () => ({ chalked_fire_rune: { loaded: 3 }, graven_fire_rune: { loaded: 3 } });
    const top = run(60, both());
    if (!top.cast || top.cast.supply !== 'graven_fire_rune' || top.cast.version !== 5 || top.cast.mana !== fs.versions[4].mana
      || top.cast.power !== M.AD.outputPm(fs, 5, 60) || top.hs.bag.graven_fire_rune.left !== 2) return 'a Melee-60 tank with Chalked and Graven did not cast version V on a Graven rune: ' + JSON.stringify(top.cast);
    const low = run(59, both());
    if (!low.cast || low.cast.supply !== 'chalked_fire_rune' || low.cast.version !== 1 || low.cast.mana !== fs.mana
      || low.cast.power !== M.AD.outputPm(fs, 1, 59) || low.hs.bag.graven_fire_rune.left !== 3) return 'a Melee-59 tank did not fall to its Chalked rune (version I): ' + JSON.stringify(low.cast);
    const other = Object.keys(M.ITEMS).find((id) => M.runes.isRune(M.ITEMS[id]) && M.ITEMS[id].family !== 'fire');
    const wrong = run(60, { [other]: { loaded: 3 } });
    return wrong.cast ? 'Flame Strike spent ' + other + ', a rune of another family' : null;
  },
  /* OUTPUT GROWS WITH LEVEL, MANA NEVER DOES (Tyler 2026-10-23, d-scaling): version I of Flame Strike costs its
     row's mana at Melee 1 and at Melee 60, and lands its row's numbers plus lvPm a level (1000 -> 3360 permille);
     every version at its unlock level lands at least the one below it there. */
  'output-grows-with-level-not-mana': (M) => {
    const fs = M.AD.ABILITIES.flame_strike;
    if (M.AD.outputPm(fs, 1, 1) !== 1000 || M.AD.outputPm(fs, 1, 60) !== 1000 + fs.lvPm * 59 || !(fs.lvPm > 0)) return 'version I lands ' + M.AD.outputPm(fs, 1, 60) + ' permille at 60';
    for (let n = 2; n <= 5; n++) {
      const lv = M.runes.versionLevel(n);
      if (M.AD.outputPm(fs, n, lv) < M.AD.outputPm(fs, n - 1, lv)) return 'version ' + n + ' lands under version ' + (n - 1) + ' at level ' + lv;
    }
    const at = (lv) => {
      const hs = supplySession(M, { bag: { chalked_fire_rune: { loaded: 1 } } });
      const x = melee(M, ['flame_strike'], { mana: 100, maxMana: 100 }, { hs, skills: { melee: M.XP.skillXpForLevel('melee', lv) } });
      M.abilities.castAbilities(x.inst, x.sc);
      return { cast: x.sc.events.find((e) => e.type === 'cast') || {}, dmg: (x.sc.events.find((e) => e.type === 'dmg') || {}).amount || 0 };
    };
    const lo = at(1), hi = at(60);
    if (lo.cast.mana !== fs.mana || hi.cast.mana !== fs.mana) return 'version I cost ' + lo.cast.mana + ' mana at 1 and ' + hi.cast.mana + ' at 60 (want ' + fs.mana + ' both)';
    if (lo.cast.power !== 1000 || hi.cast.power !== M.AD.outputPm(fs, 1, 60)) return 'the casts landed ' + lo.cast.power + ' / ' + hi.cast.power + ' permille';
    /* the same roll lands about power/1000 as hard (the stances' floors take a point at most) */
    return lo.dmg > 0 && hi.dmg > lo.dmg && hi.dmg * 1000 >= lo.dmg * (hi.cast.power - 100) ? null
      : 'the same roll hit for ' + lo.dmg + ' at Melee 1 and ' + hi.dmg + ' at Melee 60 (power ' + hi.cast.power + ')';
  },
  /* A VERSION RAISES NUMBERS ONLY (src/data/abilities.js versions, outPm): a cast at 1500 permille heals and
     shields half again its row's numbers, a row with no `versions` casts every version at its own. */
  'version-output-scales-numbers': (M) => {
    const plain = M.AD.versionOf({ mana: 10 }, 4);
    if (plain.mana !== 10 || plain.outPm !== 1000) return 'a row with no versions cast version IV at ' + JSON.stringify(plain);
    const sized = M.AD.versionOf({ mana: 10, versions: [{ mana: 10, outPm: 1000 }, { mana: 12, outPm: 1400 }] }, 2);
    if (sized.mana !== 12 || sized.outPm !== 1400) return 'version II of a sized row read ' + JSON.stringify(sized);
    const mend = M.AD.ABILITIES.greater_mend;
    const healAt = (pm) => {
      const x = oneHero(M, { hp: 1, maxHp: 1000 }, { bar: [], range: 7 });
      x.sc.rng = rngOf(M, 9);
      M.abilities.fire(x.inst, x.h, { row: mend, target: x.h, lines: [], pm }, x.sc);
      return (x.sc.events.find((e) => e.type === 'heal') || {}).amount;
    };
    const base = healAt(1000), more = healAt(1500);
    if (!(base > 0) || more !== Math.floor((base * 1500) / 1000)) return 'a 1500-permille Greater Mend healed ' + more + ' where the row healed ' + base;
    const bar = M.AD.ABILITIES.arcane_barrier;
    const y = oneHero(M, { hp: 50 }, { bar: [], range: 7 });
    M.abilities.fire(y.inst, y.h, { row: bar, target: y.h, lines: [], pm: 1500 }, y.sc);
    return y.h.shield === Math.floor((bar.shield * 1500) / 1000) ? null : 'a 1500-permille Arcane Barrier shielded ' + y.h.shield + ' of a ' + bar.shield + ' row';
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
    const hs = () => supplySession(M, { bag: { chalked_fire_rune: { loaded: 5 } } });
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
    if (JSON.stringify(shots.map(Boolean)) !== '[true,true,false]' || shots[0].source !== 'own' || shots[1].source !== 'store') return 'own, store, then a dry purse shot ' + JSON.stringify(shots);
    return hs.tally.supplies.barbed_arrows === 1 && hs.tally.bought.plain_barbed_arrows === 1 && hs.goldOut === true
      ? null : 'the shots were not split own/store, or the dry purse ended nothing: ' + JSON.stringify(hs.tally);
  },
  /* A BASIC SHOT NEVER BUYS A RUNE (lane a-rune-spend; designer 2026-10-21, Bible §18: a store rune is bought
     only when a slot names it, and only a spell slot can). Live: a staff with Fire Runes loaded bought the
     store's Plain Fire Rune for every basic once they were spent, 8 g a shot (about 14,400 g an hour). An arrow
     still falls to its plain partner (basic-costs). */
  'basic-shot-never-buys-a-rune': (M) => {
    const hs = supplySession(M, { bag: { chalked_fire_rune: { loaded: 1 } }, shot: 'plain_fire_rune', ammo: 'chalked_fire_rune', purse: 50 });
    const b = oneHero(M, { role: 'healer' }, { hs, ammo: 'chalked_fire_rune', range: 7 });
    const shots = [0, 1, 2].map(() => M.abilities.payBasic(b.inst, b.h, { ammo: true }, b.sc));
    /* a rune is never a shot (Tyler 2026-10-23: runes fuel spells only): not the carried one, not the store's */
    if (JSON.stringify(shots.map(Boolean)) !== '[false,false,false]' || hs.bag.chalked_fire_rune.left !== 1) return 'a basic shot spent a rune: ' + JSON.stringify(shots);
    if (hs.purse !== 50 || Object.keys(hs.tally.bought).length || hs.goldOut) return 'a basic shot bought a store rune: ' + JSON.stringify([hs.tally.bought, hs.purse, hs.goldOut]);
    const line = M.abilities.shotLine(b.inst.heroes[1], 'chalked_fire_rune');
    if (line.id) return 'a Fire Rune line answers a basic shot ' + JSON.stringify(line);
    /* the spell slot that NAMES the store rune still buys it (rune-own-then-store), the arrow its partner */
    const arrows = supplySession(M, { bag: { barbed_arrows: { loaded: 0 } }, shot: 'plain_barbed_arrows', ammo: 'barbed_arrows' });
    const a = M.abilities.shotLine({ hs: arrows }, 'barbed_arrows');
    return a.id === 'plain_barbed_arrows' && a.source === 'store' ? null : 'a spent arrow line no longer falls to its plain partner: ' + JSON.stringify(a);
  },
  /* THE CLIENT SAYS WHAT THE ENGINE DOES (lane a-rune-spend; CLAUDE.md §6; Tyler 2026-10-23: runes fuel spells
     only): the Configure action's Ammo run offers no rune at all (no attack slot may name one) and the bar's store
     line names no store behind a rune attack slot; an arrow keeps its plain partner's price, and a spell slot that
     names the store rune keeps it. The engine refuses a rune attack slot too (conditions.js slotProblem). */
  'client-prices-no-rune-a-shot': (M) => {
    const store = M.SB.BASIC_SUPPLIES.map((b) => ({ id: b.id, kind: b.kind, partner: b.partner, amount: 0, price: b.price }));
    const run = SHELL.table.tableOf('items', { store, bag: [] }).runs.find((r) => r.kind === 'ammo');
    const row = (id) => (run && run.rows.find((r) => r.action.id === id)) || null;
    const runes = run ? run.rows.filter((r) => M.runes.isRune(M.ITEMS[r.action.id])).map((r) => r.action.id) : [];
    if (runes.length) return 'the Ammo run offers runes as basic ammo: ' + runes;
    const refused = M.conditions.slotProblem({ action: { type: 'attack_with_item', id: 'chalked_fire_rune' }, conditions: [], join: 'and' });
    if (!refused || refused.error !== 'bad_action') return 'the engine accepts a Fire Rune attack slot: ' + JSON.stringify(refused);
    if (!row('barbed_arrows') || row('barbed_arrows').price !== M.SB.BASIC_INDEX.plain_barbed_arrows.price) return 'the Ammo run lost the Barbed Arrows\' store price: ' + JSON.stringify(row('barbed_arrows'));
    const slot = SHELL.draft.storeOf({ type: 'attack_with_item', id: 'chalked_fire_rune' }, store);
    if (slot !== null) return 'the bar says a Fire Rune attack slot buys ' + JSON.stringify(slot);
    const spell = SHELL.draft.storeOf({ type: 'ability', id: 'flame_strike', store: 'plain_fire_rune' }, store);
    return spell && spell.id === 'plain_fire_rune' ? null : 'a spell slot naming the store rune lost it: ' + JSON.stringify(spell);
  },
  /* RUNNING OUT NEVER ENDS A DEFAULT HUNT (Tyler 10-16; lane a-rune-spend): a spent essential rune line with no
     store row behind it ended the hunt `ammo_out` under the default `switch`. Only the hero's explicit `end` does. */
  'spent-runes-never-end-a-default-hunt': (M) => {
    for (const rune of ['earth_rune', 'chalked_fire_rune']) {
      const sw = supplySession(M, { bag: { [rune]: { loaded: 0, essential: true } }, shot: 'plain_fire_rune', ammo: 'chalked_fire_rune' });
      if (M.AR.endReasonAt(sw, 2000) !== null) return 'a spent ' + rune + ' line ended a default hunt ' + M.AR.endReasonAt(sw, 2000);
      const end = supplySession(M, { bag: { [rune]: { loaded: 0, essential: true } }, onEmpty: 'end' });
      if (M.AR.endReasonAt(end, 2000) !== 'ammo_out') return 'the hero\'s own end-on-empty no longer ends a spent ' + rune + ' line: ' + M.AR.endReasonAt(end, 2000);
    }
    return null;
  },
  /* AN UNAFFORDABLE SLOT WAITS, IT NEVER ENDS THE HUNT (lane a-rune-spend; Tyler 10-14: out of gold ends a hunt
     for the action actually taken). Live: an unaffordable Flame Strike slot (store rune) marked the session
     goldOut while the bar was still being walked, so the hunt ended gold_out though Power Strike, the next
     slot, cast. The wait is still said (rule_wait gold_short). */
  'unaffordable-slot-waits': (M) => {
    const broke = () => supplySession(M, { bag: { chalked_fire_rune: { loaded: 0 } }, shot: 'plain_fire_rune', ammo: 'chalked_fire_rune', purse: 0 });
    const hs = broke();
    const x = melee(M, [storeSlot('flame_strike'), 'power_strike'], {}, { hs });
    M.abilities.castAbilities(x.inst, x.sc);
    if (JSON.stringify(casts(x.sc)) !== '["power_strike"]') return 'the slot after an unaffordable one did not cast: ' + JSON.stringify(casts(x.sc));
    if (hs.goldOut || M.AR.endReasonAt(hs, 2000) !== null) return 'an unaffordable slot ended the hunt though the next slot cast (' + M.AR.endReasonAt(hs, 2000) + ')';
    const alone = broke();
    const y = melee(M, [storeSlot('flame_strike')], {}, { hs: alone });
    M.abilities.castAbilities(y.inst, y.sc);
    if (casts(y.sc).length || alone.goldOut) return 'an unaffordable spell alone ended the hunt (it goes without; the basic still swings)';
    return y.sc.events.some((e) => e.type === 'rule_wait' && e.why === 'gold_short' && e.rule_label === 'flame_strike') ? null : 'the gold wait was not said';
  },
  /* AB-06: a shot ability spends its shots of the loaded ammo, per cast. */
  'ammo-per-shot': (M) => {
    const hs = supplySession(M, { bag: { iron_arrows: { loaded: 2 } } });
    const { inst, sc } = oneHero(M, {}, { hs, bar: ['precision_shot'], range: 7, ammo: 'iron_arrows' }, [{ x: 15, y: 3 }]);
    sc.rng = rngOf(M, 3);
    M.abilities.castAbilities(inst, sc);
    if (hs.bag.iron_arrows.left !== 1) return 'a one-shot ability left ' + hs.bag.iron_arrows.left + ' of 2 arrows';
    const v = supplySession(M, { bag: { iron_arrows: { loaded: 2 }, chalked_fire_rune: { loaded: 2 } }, onEmpty: 'end' });
    const x = oneHero(M, {}, { hs: v, bar: ['flame_volley'], range: 7, ammo: 'iron_arrows' }, [{ x: 15, y: 3 }, { x: 15, y: 4 }]);
    x.sc.rng = rngOf(M, 4);
    M.abilities.castAbilities(x.inst, x.sc);
    return casts(x.sc).length === 0 && v.bag.chalked_fire_rune.left === 2 ? null : 'a three-shot volley fired on two arrows';
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
    /* The Challenge is a tank's (targeting.js challengeable): the bar slot and the auto-cast share one reach. */
    const { w, inst, sc } = melee(M, ['challenge'], { role: 'tank' });
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
  { name: 'a spell casts version I whatever rune it spends', case: 'spell-casts-the-spent-runes-version',
    edits: [['src/core/hunt/abilities.js', '    if (!best || tier > best.version) best = { line: l, version: tier, pm: 1000 };', '    if (!best || tier > best.version) best = { line: l, version: 1, pm: 1000 };']] },
  { name: 'a carried rune casts a version its hero has not unlocked', case: 'spell-casts-the-spent-runes-version',
    edits: [['src/core/hunt/abilities.js', '    if (lv < versionLevel(tier)) { locked = true; continue; }\n', '']] },
  { name: '[spell-content] a cast spends the lowest tier its hero carries', case: 'family-spends-the-best-unlocked-tier',
    edits: [['src/core/hunt/abilities.js', '    if (!best || tier > best.version) best = { line: l, version: tier, pm: 1000 };', '    if (!best || tier < best.version) best = { line: l, version: tier, pm: 1000 };']] },
  { name: '[spell-content] a spell spends a rune of another family', case: 'family-spends-the-best-unlocked-tier',
    edits: [['src/core/hunt/abilities.js', '    if (!tier || it.family !== fam) continue;', '    if (!tier) continue;']] },
  { name: '[spell-content] a version costs version I\'s mana', case: 'family-spends-the-best-unlocked-tier',
    edits: [['src/core/hunt/abilities.js', '    const v = versionOf(row, s.version);', '    const v = versionOf(row, 1);']] },
  { name: '[spell-content] output ignores the level', case: 'output-grows-with-level-not-mana',
    edits: [['src/data/abilities.js', '  return versionOf(row, n).outPm + (row && Number.isInteger(row.lvPm) ? row.lvPm * (lv - 1) : 0);', '  return versionOf(row, n).outPm;']] },
  { name: '[spell-content] a cast lands at level 1 whatever its hero', case: 'output-grows-with-level-not-mana',
    edits: [['src/core/hunt/abilities.js', 'pm: Math.floor((outputPm(row, s.version, skillLevel(h, row)) * s.pm) / 1000) };', 'pm: Math.floor((outputPm(row, s.version, 1) * s.pm) / 1000) };']] },
  { name: 'a store rune fires at full power (r07)', case: 'spell-casts-the-spent-runes-version',
    edits: [['src/core/hunt/abilities.js', '  return { line: s, version: 1, pm: BASIC_PM };', '  return { line: s, version: 1, pm: 1000 };']] },
  { name: 'a hit ignores its power', case: 'spell-casts-the-spent-runes-version',
    edits: [['src/core/hunt/abilities.js', '  const hitTag = pm === 1000 ? { id: row.id } : { id: row.id, mult: pm };', '  const hitTag = { id: row.id };']] },
  { name: 'a heal and a shield ignore their version', case: 'version-output-scales-numbers',
    edits: [['src/core/hunt/abilities.js', '  const scaled = (n) => (pm === 1000 ? n : Math.floor((n * pm) / 1000));', '  const scaled = (n) => n;']] },
  { name: 'a sized version is read as the row', case: 'version-output-scales-numbers',
    edits: [['src/data/abilities.js', '  return v ? { mana: v.mana, outPm: v.outPm } : { mana: row ? row.mana : 0, outPm: 1000 };', '  return { mana: row ? row.mana : 0, outPm: 1000 };']] },
  { name: 'the store is shut while another ammo line has uses (the starter-kit lock)', case: 'store-rune-beside-the-starter-kit',
    edits: [['src/core/action-rules.js', "  return !!hs && (hs.supplySource === 'store' || hs.onEmpty === 'switch');",
      "  return !!hs && (hs.supplySource === 'store' || (hs.onEmpty === 'switch' && !Object.keys(hs.bag || {}).some((id) => kindOf(id) === 'ammo' && leftOf(hs, id) > 0)));"]] },
  { name: 'a basic shot spends or buys a rune (8 g a shot)', case: 'basic-shot-never-buys-a-rune',
    edits: [['src/core/hunt/abilities.js', "  return isRune(itemRow(h, id)) ? { why: 'none' } : resolveLine(h && h.hs, id, undefined);", '  return resolveLine(h && h.hs, id);']] },
  { name: 'a spent rune line with no store row ends a default hunt ammo_out', case: 'spent-runes-never-end-a-default-hunt',
    edits: [['src/core/action-rules.js', "  if (kind === 'ammo' && storeAllowed(hs)) return false;\n", '']] },
  { name: 'an unaffordable slot marks the hunt gold_out while the bar is still walked', case: 'unaffordable-slot-waits',
    edits: [['src/core/hunt/abilities.js', "    if (s.why) return { why: s.short ? 'gold_short' : s.why === 'level' ? 'level' : 'no_stock' };",
      "    if (s.why) { if (s.short) h.hs.goldOut = true; return { why: s.short ? 'gold_short' : s.why === 'level' ? 'level' : 'no_stock' }; }"]] },
  { name: 'a rune slot buys the store rune without naming it', case: 'rune-own-then-store',
    edits: [['src/core/hunt/abilities.js', "  const s = typeof store === 'string' ? storeLine(h.hs, row.rune, store) : { why: 'none' };", "  const s = storeLine(h.hs, row.rune, typeof store === 'string' ? store : undefined);"]] },
  { name: 'the mark is drawn but adds nothing', case: 'mark-adds-damage',
    edits: [['src/core/hunt/damage.js', '    markPm ? Object.assign({}, ability, { mult: Math.floor((base * (1000 + markPm)) / 1000) }) : ability);', '    ability);']] },
  { name: 'the mark never wears off', case: 'mark-adds-damage',
    edits: [['src/core/hunt/damage.js', ' && target.markUntil > sc.atMs ?', ' ?']] },
  { name: 'bleed lands at level 0 whatever the caster', case: 'bleed-scales-with-caster-skill',
    edits: [['src/core/hunt/abilities.js', 'skillLv: h && h.skills && srow.scalesWith ? levelOf(h.skills, srow.scalesWith) : 0,', 'skillLv: 0,']] },
  { name: 'a rune names a family that is not one of the seven', case: 'rows-validate',
    edits: [['src/data/stonecraft.js', 'ammoPerShot: 1, family, runeTier: t.tier });', "ammoPerShot: 1, family: family === 'rupture' ? 'blood' : family, runeTier: t.tier });"]] },
  { name: 'a rune casts a sixth tier', case: 'rows-validate',
    edits: [['src/data/stonecraft.js', "family: 'earth', runeTier: 1 }", "family: 'earth', runeTier: 6 }"]] },
  { name: 'an active ability names a rune no bag can hold', case: 'rows-validate',
    edits: [['src/data/abilities.js', "rune: 'chalked_rupture_rune', target: 'enemy',", "rune: 'life_rune', target: 'enemy',"]] },
  { name: 'the bar fires its last usable ability', case: 'first-usable-in-order',
    edits: [['src/core/hunt/abilities.js', "  const rows = slotsFor(h, 'ability').filter(", "  const rows = slotsFor(h, 'ability').reverse().filter("]] },
  { name: 'a cast does not lock its lane', case: 'lane-blocks-second-cast',
    edits: [['src/core/hunt/abilities.js', "  if (readyAt(hero.lanes, row.lane) > atMs) return 'lane';", '']] },
  { name: 'a cast does not set its cooldown', case: 'cd-set',
    edits: [['src/core/hunt/abilities.js', "  if (readyAt(hero.cds, row.id) > atMs) return 'cooldown';", '']] },
  { name: 'mana is not checked', case: 'no-mana-no-cast',
    edits: [['src/core/hunt/abilities.js', "  if (int(hero.mana) < row.mana) return 'mana';", ''], ['src/core/hunt/abilities.js', "    if (int(hero.mana) < v.mana) return { why: 'mana' };", '']] },
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
    edits: [['src/core/hunt/abilities.js', "    case 'taunt': challengeFrom(inst, sc, u); break;", "    case 'taunt': break;"]] },
  { name: 'fractional mana is dropped every sub-step', case: 'mana-regen',
    edits: [['src/core/hunt/abilities.js', '  u.manaMilli -= whole * 1000;', '  u.manaMilli = 0;']] },
  { name: 'the lanes are not persisted', case: 'clocks-survive-a-cut',
    edits: [['src/core/hunt/abilities.js', "['regenPm', 'int'], ['lanes', 'json'], ['cds', 'json'],", "['regenPm', 'int'], ['cds', 'json'],"]] },
];

await suiteH4('hunt-core/abilities', cases, mutants);
