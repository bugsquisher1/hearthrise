// tests/hunt-core/abilities.mjs — src/core/hunt/abilities.js + src/data/abilities.js
// (spec §2 abilities; parity AB-01..AB-17). Run by run-all.mjs.
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { suiteH4, oneHero, steps, supplySession, rngOf, loadData } from './fixtures/h4.js';
import { hero, mon, world, instOf, subStep, ROOT, loadCore } from './fixtures/h1.js';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';

/* THE CLIENT'S SUPPLY ROWS, read from the repo (a planted copy holds only src/core and src/data): the Configure
   action table and the bar's store line must price what the engine buys, never more (CLAUDE.md §6). */
const V = sourceQuery(ROOT);
const shellOf = (p) => import(pathToFileURL(join(ROOT, p)).href + V);
const SHELL = { table: await shellOf('src/shell/action-table.js'), draft: await shellOf('src/shell/bar-draft.js'), facts: await shellOf('src/shell/action-facts.js') };

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
    if (JSON.stringify(inactive) !== '[]') return 'held rows changed: ' + JSON.stringify(inactive);
    /* THE TANK RUNES' RULES (board 2026-11-19 section 6): a party row heals or shields, a shape lands numbers or a status, a row is
       alone or party only. Each defect planted beside the real table must be refused, and each sound twin taken. */
    const base = { n: 'Test', disciplines: ['shield'], lane: 'support', cdMs: 6000, mana: 6, ammo: 0, magicXpMult: 0, active: true, rune: null };
    const plant = (r) => M.AD.validate({ ...M.AD.ABILITIES, [r.id]: { ...base, ...r } }).filter((m) => m.startsWith(r.id + ':'));
    for (const [r, want] of [
      [{ id: 'zz_hollow_party', target: 'party', radius: 8 }, 'neither heal nor shield'],
      [{ id: 'zz_both_party', target: 'party', radius: 8, healPm: 500, shieldPm: 1000 }, 'one number'],
      [{ id: 'zz_blind_party', target: 'party', shieldPm: 1000 }, 'radius'],
      [{ id: 'zz_empty_ring', target: 'ring', maxHits: 8 }, 'no hitPm and no status'],
      [{ id: 'zz_frost_ring', target: 'ring', maxHits: 8, status: 'chill', element: 'frost' }, 'lands no blow'],
      [{ id: 'zz_status_hit', target: 'enemy', status: 'chill' }, 'a damaging target with no hitPm'],
      [{ id: 'zz_both_rules', target: 'enemy', hitPm: 500, alone: true, party: true }, 'alone or party only'],
      /* THE SPELL RULE: a fixed number is refused, and a floor sits only beside a share */
      [{ id: 'zz_fixed_hit', target: 'enemy', dmg: [7, 13] }, 'retired by the spell rule'],
      [{ id: 'zz_lone_floor', target: 'enemy', hitPm: 500, base: 9 }, 'base is a hit'],
      [{ id: 'zz_party_false', target: 'ring', maxHits: 8, status: 'chill', party: false }, 'party is true']]) {
      const got = plant(r);
      if (!got.some((m) => m.includes(want))) return r.id + ' was not refused for "' + want + '": ' + JSON.stringify(got);
    }
    for (const r of [{ id: 'zz_slam', target: 'ring', maxHits: 8, status: 'chill', party: true }, { id: 'zz_shell', target: 'party', radius: 8, shieldPm: 1000, base: 30, party: true }]) {
      if (plant(r).length) return 'a sound ' + r.id + ' was refused: ' + plant(r);
    }
    /* a row's own starting rule (`trigger`) is a slot the server's check (mirrored) takes, in the registry's words */
    for (const r of Object.values(M.AD.ABILITIES).filter((x) => x.trigger)) {
      const p = M.conditions.slotProblem({ action: { type: 'ability', id: r.id }, conditions: r.trigger, join: 'and' });
      if (p) return r.id + "'s trigger is refused as a slot: " + JSON.stringify(p);
    }
    return null;
  },
  /* AB-10: the first usable ability in bar order fires, one per lane. */
  'first-usable-in-order': (M) => {
    const a = melee(M, ['power_strike', 'turning_cut']);
    M.abilities.castAbilities(a.inst, a.sc);
    const b = melee(M, ['turning_cut', 'power_strike']);
    M.abilities.castAbilities(b.inst, b.sc);
    return JSON.stringify([casts(a.sc), casts(b.sc)]) === '[["power_strike"],["turning_cut"]]' ? null : 'fired ' + JSON.stringify([casts(a.sc), casts(b.sc)]);
  },
  /* AB-01 / AB-02 / AB-07: a fired ability locks its lane and its own cooldown. */
  'lane-blocks-second-cast': (M) => {
    const { inst, sc } = melee(M, ['power_strike', 'turning_cut']);
    const lane = M.AD.ABILITY_LANES.offense;
    steps(inst, sc, cast(M), lane / 100, 0);
    if (JSON.stringify(casts(sc)) !== '["power_strike"]') return 'inside one ' + lane + ' ms lane: ' + JSON.stringify(casts(sc));
    sc.atMs = lane;
    M.abilities.castAbilities(inst, sc);
    return JSON.stringify(casts(sc)) === '["power_strike","turning_cut"]' ? null : 'at ' + lane + ' ms the lane did not reopen: ' + JSON.stringify(casts(sc));
  },
  /* Tyler 2026-11-05: "if a mage and healer are using the same mana ... they are gaining the same exp ratios". A caster's own spells and both basics pay one rate. */
  'a-mage-and-a-healer-train-alike': (M) => {
    const physical = ['shield', 'sword', 'dual_axe', 'club', 'ranged'];
    const own = (d) => Object.values(M.AD.ABILITIES).filter((r) => r.disciplines.includes(d) && !r.disciplines.some((x) => physical.includes(x)));
    const mage = own('destruction'), healer = own('restoration');
    if (!mage.length || !healer.length) return 'no caster spells read: mage ' + mage.length + ', healer ' + healer.length;
    const rates = new Set([...mage, ...healer].map((r) => r.magicXpMult));
    rates.add(M.HR.HUNT_ROLES.mage.basic.magicXpMult);
    rates.add(M.HR.HUNT_ROLES.healer.basic.magicXpMult);
    return rates.size === 1 ? null : 'Magic XP rates differ: ' + [...mage, ...healer].map((r) => r.id + ' ' + r.magicXpMult).join(', ')
      + ', mage basic ' + M.HR.HUNT_ROLES.mage.basic.magicXpMult + ', healer basic ' + M.HR.HUNT_ROLES.healer.basic.magicXpMult;
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
    /* RUNE SUPPLY PER SLOT (Tyler 2026-11-08, "Yes make the default to buy from the shop"): a slot naming no shop rune buys its family's tier-1 one */
    return casts(n.sc).length === 1 && bare.purse === 48 && bare.tally.bought.plain_fire_rune === 1 && !bare.runesOut ? null
      : 'a Flame Strike slot naming no shop rune did not buy the Plain Fire Rune: ' + JSON.stringify([casts(n.sc), bare.purse, bare.tally.bought, bare.runesOut]);
  },
  /* RUNE SUPPLY PER SLOT (Tyler 2026-11-08: "If the player has 'use carried runes' checked, it opens a section of carried runes
     that fit that spell type, and they check the box. Then condition - 'when rune supply runs out' 'Pay rune shop' or 'leave
     hunt'"). Only the runes the slot TICKED are spent, the best ticked tier the hero's level has unlocked first, never an
     unticked one and never a locked one. When none is left, `store` buys exactly the store rune the slot names, and `leave`
     casts nothing, buys nothing and ends the hunt `runes_out` naming the spell. A ticked rune held but still locked is not
     "run out": a leave slot waits on it. A slot that says nothing ticks every rune of its family (runeSupplyOf). */
  'only-ticked-runes-then-on-empty': (M) => {
    const fs = M.AD.ABILITIES.flame_strike;
    const run = (lv, bag, action, purse) => {
      const hs = supplySession(M, { bag, shot: 'plain_fire_rune', ammo: 'chalked_fire_rune', purse: purse ?? 100 });
      const x = melee(M, [{ action: Object.assign({ type: 'ability', id: 'flame_strike' }, action), conditions: [], join: 'and' }], { mana: 500, maxMana: 500 },
        { hs, skills: { melee: M.XP.skillXpForLevel('melee', lv) } });
      M.abilities.castAbilities(x.inst, x.sc);
      return { hs, x, cast: x.sc.events.find((e) => e.type === 'cast') || null };
    };
    const both = () => ({ chalked_fire_rune: { loaded: 3 }, scored_fire_rune: { loaded: 3 } });
    const one = run(60, both(), { own: ['chalked_fire_rune'], store: 'plain_fire_rune', onEmpty: 'store' });
    if (!one.cast || one.cast.supply !== 'chalked_fire_rune' || one.cast.version !== 1 || one.hs.bag.scored_fire_rune.left !== 3) return 'a slot ticking only Chalked spent ' + JSON.stringify(one.cast) + ', Scored left ' + one.hs.bag.scored_fire_rune.left;
    const best = run(60, both(), { own: ['chalked_fire_rune', 'scored_fire_rune'], store: 'plain_fire_rune', onEmpty: 'store' });
    if (!best.cast || best.cast.supply !== 'scored_fire_rune' || best.cast.version !== 2) return 'a slot ticking both did not spend the best ticked tier first: ' + JSON.stringify(best.cast);
    const all = run(60, both(), {});
    if (!all.cast || all.cast.supply !== 'scored_fire_rune') return 'a slot that says nothing did not tick every rune of its family: ' + JSON.stringify(all.cast);
    const shut = run(M.runes.versionLevel(2) - 1, both(), { own: ['scored_fire_rune'], store: 'plain_fire_rune', onEmpty: 'store' });
    if (!shut.cast || shut.cast.source !== 'store' || shut.cast.supply !== 'plain_fire_rune' || shut.hs.bag.scored_fire_rune.left !== 3 || shut.hs.bag.chalked_fire_rune.left !== 3) return 'a locked ticked rune, its slot buying, spent ' + JSON.stringify(shut.cast) + ' (want the store rune, the bag untouched)';
    /* when the ticked runes are gone: buy the one the slot names, or leave */
    const buy = run(60, { scored_fire_rune: { loaded: 3 } }, { own: ['chalked_fire_rune'], store: 'plain_fire_rune', onEmpty: 'store' });
    if (!buy.cast || buy.cast.source !== 'store' || buy.cast.supply !== 'plain_fire_rune' || buy.hs.purse !== 98 || buy.hs.bag.scored_fire_rune.left !== 3 || buy.hs.runesOut) return 'out of ticked runes, a buying slot did ' + JSON.stringify([buy.cast, buy.hs.purse, buy.hs.runesOut]);
    const leave = run(60, { scored_fire_rune: { loaded: 3 } }, { own: ['chalked_fire_rune'], onEmpty: 'leave' });
    if (leave.cast || leave.hs.purse !== 100 || leave.hs.bag.scored_fire_rune.left !== 3) return 'out of ticked runes, a leaving slot cast or bought: ' + JSON.stringify([leave.cast, leave.hs.purse]);
    if (leave.hs.runesOut !== 'flame_strike' || M.AR.endReasonAt(leave.hs, 0) !== 'runes_out') return 'out of ticked runes, a leaving slot did not end the hunt runes_out: ' + JSON.stringify([leave.hs.runesOut, M.AR.endReasonAt(leave.hs, 0)]);
    const wait = run(M.runes.versionLevel(2) - 1, { scored_fire_rune: { loaded: 3 } }, { own: ['scored_fire_rune'], onEmpty: 'leave' });
    if (wait.cast || wait.hs.runesOut || !wait.x.sc.events.some((e) => e.type === 'rule_wait' && e.why === 'level')) return 'a leaving slot holding a ticked rune its level cannot cast ended or cast: ' + JSON.stringify([wait.cast, wait.hs.runesOut]);
    /* the bar's door: a rune of another family, a bad onEmpty, "buy" with no store rune, "leave" with one, and "leave" with nothing ticked */
    const bad = (action) => (M.conditions.slotProblem({ action: Object.assign({ type: 'ability', id: 'flame_strike' }, action), conditions: [], join: 'and' }) || {}).error;
    const refusals = [[{ own: ['chalked_ice_rune'], store: 'plain_fire_rune' }, 'bad_own'], [{ own: ['chalked_fire_rune', 'chalked_fire_rune'], store: 'plain_fire_rune' }, 'bad_own'],
      [{ own: 'chalked_fire_rune', store: 'plain_fire_rune' }, 'bad_own'], [{ onEmpty: 'end', store: 'plain_fire_rune' }, 'bad_on_empty'],
      [{ onEmpty: 'leave', store: 'plain_fire_rune' }, 'bad_store'], [{ own: [], onEmpty: 'leave' }, 'bad_on_empty']];
    for (const [a, want] of refusals) if (bad(a) !== want) return 'the bar answered ' + bad(a) + ' to ' + JSON.stringify(a) + ', want ' + want;
    if ((M.conditions.slotProblem({ action: { type: 'ability', id: 'power_strike', onEmpty: 'leave' }, conditions: [], join: 'and' }) || {}).error !== 'bad_on_empty') return 'a spell with no rune took onEmpty';
    if (M.conditions.runeSupplyOf({ type: 'ability', id: 'flame_strike' }).store !== 'plain_fire_rune') return 'a slot that says nothing does not buy the tier-1 Fire rune';
    /* the server's same rule (2027-03-24-rune-supply.sql hr_hunt_rune_supply): its on-empty words are RUNE_ON_EMPTY */
    const sql = readFileSync(join(ROOT, 'supabase/migrations/2027-03-24-rune-supply.sql'), 'utf8');
    const words = /⟦rune-on-empty⟧[\s\S]*?array\[([^\]]*)\][\s\S]*?⟦\/rune-on-empty⟧/.exec(sql);
    if (!words || JSON.stringify(words[1].split(',').map((w) => w.trim().replace(/'/g, ''))) !== JSON.stringify(M.runes.RUNE_ON_EMPTY)) return 'the server\'s on-empty words are not RUNE_ON_EMPTY: ' + (words && words[1]);
    for (const a of [{ onEmpty: 'store' }, { own: [], store: 'plain_fire_rune', onEmpty: 'store' }, { own: ['scored_fire_rune'], onEmpty: 'leave' }, { own: ['chalked_fire_rune', 'graven_fire_rune'], store: 'plain_etched_fire_rune', onEmpty: 'store' }]) {
      if (bad(a)) return 'the bar refused ' + JSON.stringify(a) + ': ' + bad(a);
    }
    return fs.rune === 'chalked_fire_rune' ? null : 'fixture: Flame Strike spends ' + fs.rune;
  },
  /* LIVE 10-21 (Andy: "Flame Strike isn't usable, not using runes from store"): the store had no rune row,
     and the store was shut while ANY carried ammo line had a use left — the starter kit's free Bronze Arrows
     and Coarse Whetstones never run out. Both rune abilities cast on the store's Plain Fire Rune (the real
     catalogue row and price) with the starter kit's ammo still in the bag. */
  'store-rune-beside-the-starter-kit': (M) => {
    const row = M.SB.BASIC_INDEX.plain_fire_rune;
    if (!row || row.partner !== 'chalked_fire_rune' || row.kind !== 'ammo') return 'the store has no Plain Fire Rune behind the Fire Rune';
    const kit = () => {
      const hs = supplySession(M, { bag: { bronze_arrows: { loaded: 50 }, coarse_whetstone: { loaded: 10 }, iron_arrows: { loaded: 30 } }, purse: 1000 });
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
    const x = oneHero(M, { role: 'ranger' }, { hs: v, bar: [storeSlot('flame_volley')], range: 7, ammo: 'iron_arrows' }, [{ x: 15, y: 3 }, { x: 15, y: 4 }]);
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
      /* (no store: a slot set to leave, since a slot that says nothing buys from the shop, Tyler 2026-11-08) */
      const x = melee(M, [store ? storeSlot('flame_strike') : { action: { type: 'ability', id: 'flame_strike', onEmpty: 'leave' }, conditions: [], join: 'and' }], {}, { hs, skills: { melee: M.XP.skillXpForLevel('melee', lv) } });
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
      || basic.cast.power !== Math.floor((M.AD.versionOf(M.AD.ABILITIES.flame_strike, 1).outPm * Math.round(M.SB.BASIC_EFFECT_SHARE * 1000)) / 1000)
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
  /* THE RUNE LADDER (Tyler 2026-11-05; rulings THE PLAYER PICKS EVERY SUPPLY, STORE FALLBACK FOR EVERY SUPPLY). A slot naming a store rune
     of any tier, with no carried rune, buys EXACTLY that rune at its listed price, one a cast, and casts that tier's version at the store's
     share. Under the tier's level it casts nothing and buys nothing: it never falls back to a cheaper rune, because the game never chooses
     a player's tier. A row of another family is no store. Carried runes still go first. The Configure action row shows the same price. */
  'store-rune-is-the-one-the-slot-names': (M) => {
    const fs = M.AD.ABILITIES.flame_strike, share = Math.round(M.SB.BASIC_EFFECT_SHARE * 1000);
    const skills = (lv) => ({ melee: M.XP.skillXpForLevel('melee', lv) });
    const shelf = () => Object.fromEntries(M.SB.BASIC_SUPPLIES.filter((b) => /_rune$/.test(b.id)).map((b) => [b.id, { kind: 'ammo', price: b.price, heals: 0, mana: 0, partner: b.partner }]));
    const at = (lv, store, bag) => {
      const hs = supplySession(M, { bag: bag || {}, purse: 1000 });
      Object.assign(hs.basics, shelf());
      const x = melee(M, [{ action: { type: 'ability', id: 'flame_strike', ...(store ? { store } : {}) }, conditions: [], join: 'and' }], { mana: 500, maxMana: 500 }, { hs, skills: skills(lv) });
      M.abilities.castAbilities(x.inst, x.sc);
      return { x, hs, cast: x.sc.events.find((e) => e.type === 'cast') || null };
    };
    for (const t of M.runes.RUNE_TIERS) {
      const id = t.tier === 1 ? 'plain_fire_rune' : 'plain_' + M.runes.runeId('fire', t.tier);
      const row = M.SB.BASIC_INDEX[id];
      if (!row || row.price !== M.SB.STORE_RUNE_PRICE[t.tier - 1]) return id + ' is not on the shelf at the ladder\'s price: ' + JSON.stringify(row);
      const open = at(t.level, id);
      const power = Math.floor((M.AD.versionOf(fs, t.tier).outPm * share) / 1000);
      if (!open.cast || open.cast.version !== t.tier || open.cast.source !== 'store' || open.cast.supply !== id || open.cast.power !== power) return 'Melee ' + t.level + ' naming ' + id + ' did not cast version ' + t.tier + ' at the store\'s share: ' + JSON.stringify(open.cast);
      if (open.hs.purse !== 1000 - row.price || JSON.stringify(open.hs.tally.bought) !== JSON.stringify({ [id]: 1 })) return id + ' charged ' + (1000 - open.hs.purse) + ' g and bought ' + JSON.stringify(open.hs.tally.bought) + ', its price is ' + row.price;
      if (open.x.w.units.find((u) => u.side === 'hero').mana !== 500 - M.AD.versionOf(fs, t.tier).mana) return id + ' did not cost its version\'s mana';
      const said = SHELL.draft.storeChoices({ type: 'ability', id: 'flame_strike' }, M.SB.BASIC_SUPPLIES, { melee: { level: t.level } }).find((c) => c.id === id);
      if (!said || said.price !== row.price || said.short) return 'Configure action prices ' + id + ' at ' + JSON.stringify(said) + ', the engine charged ' + row.price;
      if (t.tier === 1) continue;
      const shut = at(t.level - 1, id);
      if (shut.cast || shut.hs.purse !== 1000 || Object.keys(shut.hs.tally.bought).length) return 'Melee ' + (t.level - 1) + ' naming ' + id + ' cast or bought: ' + JSON.stringify([shut.cast, shut.hs.tally.bought]);
      if (!shut.x.sc.events.some((e) => e.type === 'rule_wait' && e.why === 'level')) return 'the locked store rune was not said (rule_wait level)';
      const short = SHELL.draft.storeChoices({ type: 'ability', id: 'flame_strike' }, M.SB.BASIC_SUPPLIES, { melee: { level: t.level - 1 } }).find((c) => c.id === id);
      if (!short || !short.short || !/needs Melee /.test(SHELL.draft.storeChoiceWords(short))) return 'Configure action does not say ' + id + ' waits at Melee ' + (t.level - 1) + ': ' + JSON.stringify(short);
    }
    /* (past the bar's door, which refuses the slot below: the engine's own family rule holds a stored row a later catalogue no longer fits) */
    const foreignHs = supplySession(M, { purse: 1000 });
    Object.assign(foreignHs.basics, shelf());
    const past = M.conditions.heroSlots([{ action: { type: 'ability', id: 'flame_strike', store: 'plain_scored_fire_rune' }, conditions: [], join: 'and' }], null)
      .map((r) => ({ ...r, slot: { ...r.slot, action: { ...r.slot.action, store: 'plain_scored_ice_rune' } } }));
    /* the cost line states what the slot would pay, every tier (the Runes tab is merged into Spells, Tyler 2026-11-08: the price is the cost line's) */
    for (const t of M.runes.RUNE_TIERS) {
      const id = t.tier === 1 ? 'plain_fire_rune' : 'plain_' + M.runes.runeId('fire', t.tier);
      const cost = SHELL.facts.factsOf({ type: 'ability', id: 'flame_strike', store: id }, { store: M.SB.BASIC_SUPPLIES, bag: [], skills: { melee: { level: t.level } } }).cost;
      if (cost !== 'Cost: ' + M.AD.versionOf(fs, t.tier).mana + ' mana, 1 ' + M.SB.BASIC_INDEX[id].n + ' (' + M.SB.BASIC_INDEX[id].price + ' g)') return 'the cost line does not name ' + id + ' at its price and its version\'s mana: ' + cost;
    }
    const foreign = melee(M, [], { mana: 500, maxMana: 500 }, { hs: foreignHs, skills: skills(60), slots: past });
    M.abilities.castAbilities(foreign.inst, foreign.sc);
    if (casts(foreign.sc).length || foreignHs.purse !== 1000) return 'a Fire spell cast on an Ice store rune: ' + JSON.stringify([casts(foreign.sc), foreignHs.purse]);
    const unnamed = at(60, null);
    if (!unnamed.cast || unnamed.cast.supply !== 'plain_fire_rune' || unnamed.hs.purse !== 1000 - M.SB.BASIC_INDEX.plain_fire_rune.price) return 'a slot naming no shop rune did not buy the tier-1 one: ' + JSON.stringify(unnamed.cast);
    const own = at(60, 'plain_graven_fire_rune', { chalked_fire_rune: { loaded: 1 } });
    if (!own.cast || own.cast.source !== 'own' || own.cast.version !== 1 || own.hs.purse !== 1000) return 'a carried rune was not spent first: ' + JSON.stringify(own.cast);
    for (const t of M.runes.RUNE_TIERS) {
      const id = t.tier === 1 ? 'plain_fire_rune' : 'plain_' + M.runes.runeId('fire', t.tier);
      const p = M.conditions.slotProblem({ action: { type: 'ability', id: 'flame_strike', store: id }, conditions: [], join: 'and' });
      if (p) return 'the bar refuses ' + id + ' on a Fire spell: ' + JSON.stringify(p);
    }
    const bad = M.conditions.slotProblem({ action: { type: 'ability', id: 'flame_strike', store: 'plain_scored_ice_rune' }, conditions: [], join: 'and' });
    return bad && bad.error === 'bad_store' ? null : 'the bar lets a Fire spell name an Ice store rune: ' + JSON.stringify(bad);
  },
  /* THE BAR STATES THE CAST THE ENGINE MAKES (Tyler 2026-11-08, a Fireball slot set to the store's Scored Fire Rune: "it should be
     showing me different damage numbers. right?"). The hover read the row's version I (25 mana, 7–12) while the engine cast version
     II (30 mana) at the hero's Magic level and the store's share. For the same slot, bag, store rows and level, the hover's lines are
     EXACTLY its cost line (the version's mana, the store rune by its tier's own name, at its price), its damage at the power the engine
     cast, its cooldown and its When line in plain words, and the mana a short hero waits for is that version's too (Tyler: "all of this
     should be decided in the configure actions, and simplified when hovering the skill on the bar"). */
  'the-bar-states-the-cast-the-engine-makes': (M) => {
    if (!M.shell) return 'no shell to read';
    const fb = M.AD.ABILITIES.fireball, id = 'plain_scored_fire_rune', row = M.SB.BASIC_INDEX[id], lv = 20;
    const cond = [{ metric: 'enemies_in_aoe', op: 'gte', value: 2 }];
    const slot = { action: { type: 'ability', id: 'fireball', store: id }, conditions: cond, join: 'and' };
    const hs = supplySession(M, { purse: 1000, runes: true });
    /* (a wand whose largest blow is 40: a cast is a share of it, THE SPELL RULE) */
    const x = oneHero(M, { mana: 500, maxMana: 500, role: 'mage', maxHit: 40 }, { hs, bar: [slot], range: 7, skills: { magic: M.XP.skillXpForLevel('magic', lv) } },
      [{ x: 15, y: 3, hp: 900, maxHp: 900 }, { x: 15, y: 4, hp: 900, maxHp: 900 }]);
    x.sc.rng = rngOf(M, 4);
    M.abilities.castAbilities(x.inst, x.sc);
    const cast = x.sc.events.find((e) => e.type === 'cast');
    if (!cast || cast.version !== 2 || cast.supply !== id || cast.source !== 'store' || cast.mana !== M.AD.versionOf(fb, 2).mana) return 'the engine did not cast version II on the store\'s Scored rune: ' + JSON.stringify(cast);
    const hits = x.sc.events.filter((e) => e.type === 'dmg').map((e) => e.amount);
    /* the client: the server's store rows, bag and skills, as the bar holds them */
    const store = M.SB.BASIC_SUPPLIES.map((b) => ({ id: b.id, kind: b.kind, partner: b.partner, amount: b.heals || b.mana || 0, price: b.price }));
    const ctx = { bag: [], store, skills: { magic: { xp: M.XP.skillXpForLevel('magic', lv), level: lv } }, set: { supplySource: 'mine', onEmpty: 'switch' } };
    /* THE SPELL RULE, typed: the engine's hit rolls max(ceil(top / 2), base lo)..max(top, base hi) of a blow of 40, at the cast's power; the
       bar says the share in % of Max Hit at that power, and the floor at that power */
    const top = Math.floor((40 * fb.hitPm) / 1000), lo = Math.floor((Math.max(Math.ceil(top / 2), fb.base[0]) * cast.power) / 1000), hi = Math.floor((Math.max(top, fb.base[1]) * cast.power) / 1000);
    const hiPct = Math.round((fb.hitPm * cast.power) / 10000), loPct = Math.round(hiPct / 2);
    if (row.n !== 'Scored Fire Rune') return 'the store\'s tier-2 Fire rune is named ' + JSON.stringify(row.n) + ', not by its tier ("Scored Fire Rune")';
    const want = ['Cost: ' + cast.mana + ' mana, 1 Scored Fire Rune (' + row.price + ' g)', 'Each monster hit: ' + loPct + '% to ' + hiPct + '% of Max Hit as ember',
      'Never less than ' + Math.floor((fb.base[0] * cast.power) / 1000) + '–' + Math.floor((fb.base[1] * cast.power) / 1000) + ' a hit',
      (fb.cdMs / 1000) + ' s cooldown', 'When it would hit at least 2 monsters'];
    const said = M.shell.facts.hoverLines(slot, ctx, null, null).map((l) => l.text);
    if (JSON.stringify(said) !== JSON.stringify(want)) return 'the hover reads ' + JSON.stringify(said) + ', the engine cast ' + JSON.stringify(want);
    if (hits.length !== 2 || hits.some((n) => n < lo || n > hi)) return 'the engine landed ' + JSON.stringify(hits) + ' where the bar says ' + lo + '–' + hi;
    /* Configure action's facts carry the same lines (the hover is their subset), and the cast's mana is what a short hero waits for */
    const f = M.shell.facts.factsOf(slot.action, ctx);
    if (f.cost !== want[0] || f.effect[0] !== want[1] || f.effect[1] !== want[2] || f.cooldown !== want[3]) return 'Configure action reads other facts: ' + JSON.stringify(f);
    const short = M.shell.facts.reasonOf({ action: slot.action, conditions: cond }, { discipline: 'destruction', store, supplySource: 'mine', onEmpty: 'switch' }, [], { mana: cast.mana - 1 }, null, ctx.skills, null);
    return short && short.code === 'mana' && short.text === 'Needs ' + cast.mana + ' mana, have ' + (cast.mana - 1) ? null : 'a hero 1 mana short of the cast reads ' + JSON.stringify(short);
  },
  /* NEVER AUTO-PICKED: a freshly picked rune spell starts on Plain, the choices run cheapest tier first, and a default bar names Plain or nothing. */
  'a-deeper-rune-is-opt-in': (M) => {
    for (const a of Object.values(M.AD.ABILITIES).filter((x) => x.active && x.rune)) {
      const fam = M.ITEMS[a.rune].family;
      const list = SHELL.draft.storeChoices({ type: 'ability', id: a.id }, M.SB.BASIC_SUPPLIES, null);
      if (list.length !== M.runes.RUNE_TIERS.length) return a.id + ': the shop choices are ' + JSON.stringify(list.map((c) => c.id));
      if (list.some((c, i) => c.tier !== i + 1 || M.ITEMS[M.SB.BASIC_INDEX[c.id].partner].family !== fam)) return a.id + ': the choices are not its family, cheapest first: ' + JSON.stringify(list.map((c) => c.id));
      const first = SHELL.draft.storeDefault({ type: 'ability', id: a.id }, M.SB.BASIC_SUPPLIES);
      if (first !== 'plain_' + fam + '_rune') return a.id + ' starts on ' + first + ', never a deeper rune';
    }
    for (const [role, rules] of Object.entries(M.RS.ROLE_RULES)) for (const s of rules) {
      const st = s.action.store;
      if (st && !/^plain_[a-z]+_rune$/.test(st)) return 'the ' + role + ' default bar names ' + st;
    }
    return null;
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
    if (!top.cast || top.cast.supply !== 'graven_fire_rune' || top.cast.version !== 5 || top.cast.mana !== fs.versions[4]
      || top.cast.power !== M.AD.versionOf(fs, 5).outPm || top.hs.bag.graven_fire_rune.left !== 2) return 'a Melee-60 tank with Chalked and Graven did not cast version V on a Graven rune: ' + JSON.stringify(top.cast);
    const low = run(59, both());
    if (!low.cast || low.cast.supply !== 'chalked_fire_rune' || low.cast.version !== 1 || low.cast.mana !== fs.mana
      || low.cast.power !== M.AD.versionOf(fs, 1).outPm || low.hs.bag.graven_fire_rune.left !== 3) return 'a Melee-59 tank did not fall to its Chalked rune (version I): ' + JSON.stringify(low.cast);
    const other = Object.keys(M.ITEMS).find((id) => M.runes.isRune(M.ITEMS[id]) && M.ITEMS[id].family !== 'fire');
    const wrong = run(60, { [other]: { loaded: 3 } });
    return wrong.cast ? 'Flame Strike spent ' + other + ', a rune of another family' : null;
  },
  /* OUTPUT GROWS WITH THE CASTER'S BLOW, MANA NEVER DOES (THE SPELL RULE, Tyler 2026-11-21, 21-5: every cast is a share of its caster's
     own blow, so its skill and its weapon grow it through its max hit and nothing else; the d-scaling lvPm of 2026-10-23 is retired):
     version I of Flame Strike costs its row's mana at Melee 1 and at Melee 60, casts at the step 1000 at both, and the same cast from a
     hero whose blow is four times bigger lands about four times as hard; every version lands at least the one below it. */
  'output-grows-with-the-blow-not-mana': (M) => {
    const fs = M.AD.ABILITIES.flame_strike;
    for (let n = 2; n <= 5; n++) if (M.AD.versionOf(fs, n).outPm <= M.AD.versionOf(fs, n - 1).outPm) return 'version ' + n + ' lands no more than version ' + (n - 1);
    const at = (lv, maxHit) => {
      const hs = supplySession(M, { bag: { chalked_fire_rune: { loaded: 1 } } });
      const x = melee(M, ['flame_strike'], { mana: 100, maxMana: 100, maxHit }, { hs, skills: { melee: M.XP.skillXpForLevel('melee', lv) } });
      x.sc.rng = rngOf(M, 3);
      M.abilities.castAbilities(x.inst, x.sc);
      return { cast: x.sc.events.find((e) => e.type === 'cast') || {}, dmg: (x.sc.events.find((e) => e.type === 'dmg') || {}).amount || 0 };
    };
    const lo = at(1, 10), hi = at(60, 10), big = at(60, 40);
    if (lo.cast.mana !== fs.mana || hi.cast.mana !== fs.mana) return 'version I cost ' + lo.cast.mana + ' mana at 1 and ' + hi.cast.mana + ' at 60 (want ' + fs.mana + ' both)';
    if (lo.cast.power !== 1000 || hi.cast.power !== 1000) return 'version I landed ' + lo.cast.power + ' / ' + hi.cast.power + ' permille at Melee 1 / 60 (the level grows the blow, never the step)';
    if (lo.dmg !== hi.dmg) return 'one blow and one roll hit for ' + lo.dmg + ' at Melee 1 and ' + hi.dmg + ' at Melee 60: the level grew the cast beside the blow';
    /* the same roll from a blow four times bigger lands about four times as hard (its top floors, its roll is one draw) */
    return big.dmg >= 3 * hi.dmg && big.dmg <= 5 * hi.dmg ? null : 'a blow four times bigger hit for ' + big.dmg + ' against ' + hi.dmg;
  },
  /* A VERSION RAISES NUMBERS ONLY (src/data/abilities.js versions, the rune tier's step): a cast at 1500 permille heals and shields
     half again its row's share, a row with no `versions` casts every version at its own. */
  'version-output-scales-numbers': (M) => {
    const plain = M.AD.versionOf({ mana: 10 }, 4);
    if (plain.mana !== 10 || plain.outPm !== 1000) return 'a row with no versions cast version IV at ' + JSON.stringify(plain);
    const sized = M.AD.versionOf({ mana: 10, versions: [10, 12] }, 2);
    if (sized.mana !== 12 || sized.outPm !== M.runes.versionStep(2) || !(sized.outPm > 1000)) return 'version II of a sized row read ' + JSON.stringify(sized);
    const mend = M.AD.ABILITIES.greater_mend;
    const healAt = (pm) => {
      const x = oneHero(M, { hp: 1, maxHp: 1000, maxHit: 30 }, { bar: [], range: 7 });
      x.sc.rng = rngOf(M, 9);
      M.abilities.fire(x.inst, x.h, { row: mend, target: x.h, lines: [], pm }, x.sc);
      return (x.sc.events.find((e) => e.type === 'heal') || {}).amount;
    };
    const base = healAt(1000), more = healAt(1500);
    if (!(base > 0) || more !== Math.floor((base * 1500) / 1000)) return 'a 1500-permille Greater Mend healed ' + more + ' where the row healed ' + base;
    const bar = M.AD.ABILITIES.arcane_barrier, whole = Math.floor((30 * bar.shieldPm) / 1000);
    const y = oneHero(M, { hp: 50, maxHit: 30 }, { bar: [], range: 7 });
    M.abilities.fire(y.inst, y.h, { row: bar, target: y.h, lines: [], pm: 1500 }, y.sc);
    return y.h.shield === Math.floor((whole * 1500) / 1000) ? null : 'a 1500-permille Arcane Barrier shielded ' + y.h.shield + ' of a ' + whole + ' share';
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
  /* THE BOW'S TWO TARGETS (lane/moves-pass-1, 23-spell-audit.md section 4). Precision Shot takes a monster whose role reaches past the
     front (`prefers`: a Shooter, Caster or Stalker) in reach before the bow's own target, on the Danger scale where monsters play roles;
     off it, the bow's own target. Hunter's Mark lands on the bow's own target while it is unmarked, else the healthiest unmarked in reach. */
  'bow-picks-its-marks': async (M) => {
    const { MONSTERS } = await import(pathToFileURL(join(M.root, 'src/data/monsters.js')).href + sourceQuery(M.root));
    const { openDanger } = await import(pathToFileURL(join(M.root, 'src/core/hunt/danger.js')).href + sourceQuery(M.root));
    const roles = Object.assign({}, MONSTERS, { rat: Object.assign({}, MONSTERS.rat, { role: 'brute' }), slime: Object.assign({}, MONSTERS.slime, { role: 'stalker' }) });
    const shot = (onScale) => {
      const hs = supplySession(M, { bag: { iron_arrows: { loaded: 50 } } });
      const x = oneHero(M, { role: 'ranger', target: 10 }, { hs, bar: ['precision_shot'], range: 7, ammo: 'iron_arrows' },
        [{ x: 13, y: 3, hp: 5000, maxHp: 5000 }, { x: 16, y: 3, hp: 5000, maxHp: 5000, kind: 'slime' }]);
      x.inst.monsters = roles;
      if (onScale) openDanger(x.w, 'steady', 0);
      x.sc.rng = rngOf(M, 3);
      M.abilities.castAbilities(x.inst, x.sc);
      const c = x.sc.events.find((e) => e.type === 'cast' && e.ability === 'precision_shot');
      return c ? c.t : null;
    };
    if (shot(true) !== 11) return 'on the scale Precision Shot took monster ' + shot(true) + ', not the Stalker (11) behind the bow\'s own target';
    if (shot(false) !== 10) return 'off the scale Precision Shot took monster ' + shot(false) + ', not the bow\'s own target (10)';
    const mark = (ownHp, markOwn) => {
      const x = oneHero(M, { role: 'ranger', target: 10 }, { bar: ['hunters_mark'], range: 7 },
        [{ x: 14, y: 3, hp: ownHp, maxHp: 5000 }, { x: 15, y: 3, hp: 5000, maxHp: 5000 }, { x: 15, y: 4, hp: 4000, maxHp: 5000 }]);
      if (markOwn) { x.w.units.find((u) => u.id === 10).markUntil = 99999; }
      M.abilities.castAbilities(x.inst, x.sc);
      const c = x.sc.events.find((e) => e.type === 'cast' && e.ability === 'hunters_mark');
      return c ? c.t : null;
    };
    if (mark(1000, false) !== 10) return 'the Mark took monster ' + mark(1000, false) + ', not the bow\'s own target (10)';
    if (mark(1000, true) !== 11) return 'with its own target marked the Mark took monster ' + mark(1000, true) + ', not the healthiest unmarked (11)';
    return null;
  },
  /* MEND, THE UNIVERSAL SELF-HEAL (roadmap p21; Bible §17): every discipline's bar keeps it (it counts against none of
     the three), it heals its own caster on the heal lane with mana and no rune, it needs missing HP (at full health it
     never casts, so it never pays Magic XP for nothing), and it pays Magic at the physical builds' quarter. */
  'mend-heals-only-the-hurt': (M) => {
    const mend = M.AD.ABILITIES.mend;
    for (const w of ['sword', 'axe', 'ranged', 'wand', 'staff']) {
      const setup = M.spawn.heroSetup({ weaponType: w, options: {}, bar: [{ action: { type: 'ability', id: 'mend' }, conditions: [], join: 'and' }], partyRoles: [] });
      if (!setup.slots.some((r) => r.slot.action.id === 'mend')) return 'a ' + w + ' hero cannot keep Mend on its bar';
    }
    const run = (hp) => {
      const x = oneHero(M, { hp, maxHp: 100, mana: 100, maxMana: 100 }, { bar: ['mend'] }, [{ x: 13, y: 3, hp: 500, maxHp: 500 }]);
      x.sc.rng = rngOf(M, 4);
      M.abilities.castAbilities(x.inst, x.sc);
      return { x, cast: x.sc.events.find((e) => e.type === 'cast' && e.ability === 'mend') || null, heal: x.sc.events.find((e) => e.type === 'heal') || null };
    };
    const full = run(100);
    if (full.cast) return 'Mend cast at full health: ' + JSON.stringify(full.cast);
    const hurt = run(40);
    if (!hurt.cast || hurt.cast.mana !== mend.mana || hurt.cast.magicXpMult !== mend.magicXpMult || hurt.cast.supply) return 'a hurt hero did not cast Mend at its mana and no rune: ' + JSON.stringify(hurt.cast);
    /* 11% of its own max HP (Tyler 2026-11-21, 32-4): 11 of 100 */
    if (!hurt.heal || hurt.heal.u !== 1 || hurt.heal.t !== 1 || hurt.heal.amount !== Math.floor((100 * mend.healHpPm) / 1000) || hurt.x.h.hp !== 40 + hurt.heal.amount) return 'Mend did not heal its caster 11% of its max HP: ' + JSON.stringify(hurt.heal);
    if (hurt.x.h.shield) return 'Mend left a shield (' + hurt.x.h.shield + ') instead of healing';
    return mend.lane === 'heal' && mend.universal === true ? null : 'Mend is not a universal heal-lane row';
  },
  /* GREEN SICKNESS'S MARK (roadmap p22; Bible §17: a fixed, non-stacking ~10% vulnerability): every monster its area hits
     takes `takenPm` more from every blow while the mark lasts; a second cast refreshes the one stack; it wears off. */
  'sickness-marks-what-it-hits': (M) => {
    const gs = M.AD.ABILITIES.green_sickness, row = M.status.statusRow(gs.status);
    const x = oneHero(M, {}, { range: 7, hs: supplySession(M, { bag: { chalked_poison_rune: { loaded: 5 } } }) },
      [{ x: 15, y: 3, hp: 5000, maxHp: 5000 }, { x: 15, y: 4, hp: 5000, maxHp: 5000 }, { x: 20, y: 8, hp: 5000, maxHp: 5000 }]);
    x.sc.rng = rngOf(M, 7);
    const [a, b, far] = x.w.units.filter((u) => u.side === 'mon');
    M.abilities.fire(x.inst, x.h, { row: gs, target: a, lines: [] }, x.sc);
    const sick = (u) => (u.statuses || []).filter((st) => st.s === row.id).length;
    if (sick(a) !== 1 || sick(b) !== 1 || sick(far) !== 0) return 'Green Sickness marked ' + [sick(a), sick(b), sick(far)] + ' (want 1, 1, 0)';
    M.abilities.fire(x.inst, x.h, { row: gs, target: a, lines: [] }, x.sc);
    if (sick(a) !== 1) return 'a second Green Sickness stacked its mark: ' + sick(a);
    const hit = (t) => M.damage.landHit(x.inst, x.sc, x.h, t, 100, null, null).dmg;
    const clean = hit(far), marked = hit(a);
    const want = Math.floor((clean * (1000 + row.takenPm)) / 1000);
    if (marked !== want) return 'a sickened monster took ' + marked + ' of a blow the clean one took ' + clean + ' of, want ' + want;
    for (let t = 0; t <= row.durationMs; t += 100) { x.sc.atMs = t; M.status.tickStatuses(x.inst, x.sc); }
    if (sick(a)) return 'the mark outlived its ' + row.durationMs + ' ms';
    return hit(a) === clean ? null : 'a monster whose mark wore off still took more';
  },
  /* Bleed grows with the caster's own blow (THE SPELL RULE: statuses.js blowPm, Tyler 2026-11-21), fixed as it lands: a stack from a
     max hit of 60 ticks 60 x blowPm / 1000 at Chalked, never a number that grows with a skill level beside the blow. */
  'bleed-scales-with-the-casters-blow': (M) => {
    const rend = M.AD.ABILITIES.rend, bleed = M.status.statusRow(rend.status);
    const x = oneHero(M, { maxHit: 60 }, {}, [{ x: 13, y: 3, hp: 5000, maxHp: 5000 }]);
    x.sc.rng = rngOf(M, 5);
    const t = x.w.units.find((u) => u.side === 'mon');
    M.abilities.fire(x.inst, x.h, { row: rend, target: t, lines: [] }, x.sc);
    const want = Math.max(1000, Math.floor((60 * bleed.blowPm * bleed.tierPermille[0]) / 1000));
    const got = (t.statuses || []).map((st) => st.scale);
    return got.length && want > 1000 && got.every((v) => v === want) ? null : 'a max-hit-60 caster\'s bleed landed at ' + JSON.stringify(got) + ', want ' + want;
  },
  'action-set-skips': (M) => {
    const hs = () => supplySession(M, { bag: { chalked_fire_rune: { loaded: 5 }, chalked_earth_rune: { loaded: 5 } } });
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
    const run = SHELL.table.tableOf('ammo', { store, bag: [] }).runs.find((r) => r.kind === 'ammo');
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
    for (const rune of ['chalked_earth_rune', 'chalked_fire_rune']) {
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
    const { inst, sc } = oneHero(M, { role: 'ranger' }, { hs, bar: ['precision_shot'], range: 7, ammo: 'iron_arrows' }, [{ x: 15, y: 3 }]);
    sc.rng = rngOf(M, 3);
    M.abilities.castAbilities(inst, sc);
    if (hs.bag.iron_arrows.left !== 1) return 'a one-shot ability left ' + hs.bag.iron_arrows.left + ' of 2 arrows';
    const v = supplySession(M, { bag: { iron_arrows: { loaded: 2 }, chalked_fire_rune: { loaded: 2 } }, onEmpty: 'end' });
    const x = oneHero(M, { role: 'ranger' }, { hs: v, bar: ['flame_volley'], range: 7, ammo: 'iron_arrows' }, [{ x: 15, y: 3 }, { x: 15, y: 4 }]);
    x.sc.rng = rngOf(M, 4);
    M.abilities.castAbilities(x.inst, x.sc);
    return casts(x.sc).length === 0 && v.bag.chalked_fire_rune.left === 2 ? null : 'a three-shot volley fired on two arrows';
  },
  /* A SHOT ABILITY LOOSES THE BAR'S ARROWS (Andy 2026-10-23, Fremulon): a Ranger with NO ammo worn, his arrows
     picked on the bar behind a Copper Whetstone slot, never cast Precision Shot (it read only the worn ammo). The
     cast spends one of the arrows his basic would loose (the first attack slot that can shoot), never a whetstone;
     with arrows in no slot it waits. */
  'shot-ability-looses-the-bar-arrows': (M) => {
    const atk = (id) => ({ action: { type: 'attack_with_item', id }, conditions: [], join: 'and' });
    const play = (bar) => {
      const hs = supplySession(M, { bag: { iron_arrows: { loaded: 2 }, copper_whetstone: { loaded: 5 } } });
      const x = oneHero(M, { role: 'ranger' }, { hs, bar, range: 7, ammo: null }, [{ x: 15, y: 3, hp: 500, maxHp: 500 }]);
      x.sc.rng = rngOf(M, 3);
      M.abilities.castAbilities(x.inst, x.sc);
      return { casts: casts(x.sc), arrows: hs.bag.iron_arrows.left, stones: hs.bag.copper_whetstone.left };
    };
    const got = play(['precision_shot', atk('copper_whetstone'), atk('iron_arrows')]);
    if (JSON.stringify(got) !== JSON.stringify({ casts: ['precision_shot'], arrows: 1, stones: 5 })) return 'with arrows on the bar and none worn: ' + JSON.stringify(got) + ', want one Precision Shot on one Iron Arrow, no whetstone';
    const none = play(['precision_shot', atk('copper_whetstone')]);
    return none.casts.length === 0 && none.stones === 5 ? null : 'with only a whetstone on the bar Precision Shot cast on ' + JSON.stringify(none);
  },
  /* AB-09: a heal is capped at the missing HP (food no longer waits on it: consumables.js ALWAYS FIRES). */
  'heal-capped': (M) => {
    const { h, inst, sc } = oneHero(M, { hp: 65 }, { bar: ['greater_mend'], range: 7, hs: supplySession(M, { bag: { chalked_water_rune: { loaded: 5 } } }) }, [{ x: 15, y: 3 }]);
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
  /* THE LANES (roadmap p12; Tyler 2026-10-23: offense 2 s, support 2 s, healing 1 s): every row that strikes nothing
     and heals nothing (the Challenge, the Hunter's Mark) and every SHIELD rides the support lane; a heal the heal lane;
     the rest offense. A support cast leaves the offense lane free: Hunter's Mark, then Precision Shot the next sub-step. */
  'support-lane': (M) => {
    const L = M.AD.ABILITY_LANES;
    if (L.offense !== 2000 || L.support !== 2000 || L.heal !== 1000 || Object.keys(L).length !== 3) return 'the lanes are ' + JSON.stringify(L);
    for (const r of Object.values(M.AD.ABILITIES)) {
      const want = r.target === 'taunt' || r.target === 'mark' || M.AD.shells(r) || (M.AD.AREA_TARGETS.includes(r.target) && !M.AD.landsBlow(r)) ? 'support' : M.AD.heals(r) ? 'heal' : 'offense';
      if (r.lane !== want) return r.id + ' rides ' + r.lane + ', want ' + want;
    }
    const hs = supplySession(M, { bag: { iron_arrows: { loaded: 50 } } });
    const x = oneHero(M, { role: 'ranger' }, { hs, bar: ['hunters_mark', 'precision_shot'], range: 7, ammo: 'iron_arrows' }, [{ x: 15, y: 3, hp: 5000, maxHp: 5000 }]);
    x.sc.rng = rngOf(M, 11);
    M.abilities.castAbilities(x.inst, x.sc);
    x.sc.atMs = 100;
    M.abilities.castAbilities(x.inst, x.sc);
    return JSON.stringify(casts(x.sc)) === '["hunters_mark","precision_shot"]' ? null : 'a Mark, then the next sub-step, cast ' + JSON.stringify(casts(x.sc));
  },
  /* HEALS AND SHIELDS BETWEEN PULLS (roadmap p16, audit c30; Tyler 2026-10-23): with no monster engaged a hurt hero's heal
     slot fires on its own conditions and lane, and so does its shield; a full-health hero casts nothing (no Magic XP for
     nothing); no strike slot is walked, so none reports a wait. */
  'mends-between-pulls': (M) => {
    const run = (hp, bar, mana) => {
      const hs = supplySession(M, { bag: { chalked_earth_rune: { loaded: 3 } } });
      const x = oneHero(M, { hp, maxHp: 100, mana: mana === undefined ? 100 : mana, maxMana: 100 }, { hs, bar, range: 7 });
      x.sc.rng = rngOf(M, 12);
      M.abilities.castAbilities(x.inst, x.sc);
      return x;
    };
    const hurt = run(40, ['power_strike', 'mend']);
    if (JSON.stringify(casts(hurt.sc)) !== '["mend"]' || !(hurt.h.hp > 40)) return 'a hurt hero between pulls cast ' + JSON.stringify(casts(hurt.sc)) + ' (HP ' + hurt.h.hp + ')';
    const full = run(100, ['mend', 'arcane_barrier']);
    if (casts(full.sc).length) return 'a full-health hero cast ' + JSON.stringify(casts(full.sc)) + ' between pulls';
    const shell = run(70, ['arcane_barrier']);
    if (JSON.stringify(casts(shell.sc)) !== '["arcane_barrier"]' || shell.h.shield !== M.AD.ABILITIES.arcane_barrier.base) return 'a hurt hero between pulls raised no shell: ' + JSON.stringify(casts(shell.sc));
    const idle = run(100, ['power_strike'], 0);
    return idle.sc.events.some((e) => e.type === 'rule_wait') ? 'between pulls a strike slot reported a wait: ' + JSON.stringify(idle.sc.events) : null;
  },
  /* ARCANE BARRIER'S REFUND (Tyler 2026-10-23, from Andy's reports): self-only; a full shell is never recast (it would
     add nothing); a chipped one is, and what is left of it comes back as mana at the cast's price per point. The cast
     event carries the NET mana (Magic XP is paid on it) and the refund. A stronger version over a full shell refunds it
     at its own price, never more than the cast costs. */
  'barrier-recast-refunds': (M) => {
    /* (the fixture hero carries no blow, so its shell is the row's beginner's floor, abilities.js base: THE SPELL RULE's first hours) */
    const row = M.AD.ABILITIES.arcane_barrier;
    if (row.target !== 'self') return 'Arcane Barrier is no longer self-only';
    const hs = supplySession(M, { bag: { chalked_earth_rune: { loaded: 5 } } });
    const x = oneHero(M, { hp: 50, maxHp: 100, mana: 100, maxMana: 0 }, { hs, bar: ['arcane_barrier'], range: 7 }, [{ x: 15, y: 3, hp: 5000, maxHp: 5000 }]);
    x.sc.rng = rngOf(M, 13);
    M.abilities.castAbilities(x.inst, x.sc);
    if (x.h.shield !== row.base || x.h.mana !== 100 - row.mana) return 'the first Barrier left shield ' + x.h.shield + ', mana ' + x.h.mana;
    x.sc.atMs = row.cdMs;
    M.abilities.castAbilities(x.inst, x.sc);
    if (casts(x.sc).length !== 1) return 'a full shell was recast';
    x.h.shield = 10;
    x.sc.atMs = row.cdMs + 100;
    M.abilities.castAbilities(x.inst, x.sc);
    const ev = x.sc.events.filter((e) => e.type === 'cast')[1];
    const refund = Math.floor((10 * row.mana) / row.base);
    if (!ev || ev.refund !== refund || ev.mana !== row.mana - refund) return 'a recast over a 10-point shell: ' + JSON.stringify(ev) + ', want refund ' + refund;
    if (x.h.shield !== row.base || x.h.mana !== 100 - row.mana - (row.mana - refund)) return 'after the recast: shield ' + x.h.shield + ', mana ' + x.h.mana;
    const R = M.abilities.shieldRefund, two = Math.floor((row.base * 1880) / 1000);
    const mine = (shield) => ({ id: 1, shieldBy: 1, shield });
    if (R(mine(40), row, 36, 1880) !== Math.floor((40 * 36) / two)) return 'a stronger version over a full shell refunds ' + R(mine(40), row, 36, 1880);
    if (R({ id: 1, shieldBy: 2, shield: 40 }, row, 36, 1880) !== 0 || R({ id: 1, shield: 40 }, row, 36, 1880) !== 0) return 'a shell another hero cast refunds as mana (the tank\'s Shelter, a Healer\'s Ward)';
    return R(mine(500), row, 36, 1000) === 36 && R(mine(0), row, 30, 1000) === 0 && R(mine(9), M.AD.ABILITIES.mend, 15, 1000) === 0
      ? null : 'shieldRefund is not capped at the cast, or refunds a heal';
  },
  /* THE TANK'S RUNE SPELLS (Tyler 2026-11-19: "tanks should have rune spells that are tank spells", "Tank spells should be party only I
     think"; the board's "2026-11-19 Tank rune spells" section 6). PIECE 1, A PARTY SHIELD (Shelter): every living hero within its radius,
     the tank too, gets max(standing, its shell), with a shield event only where it rose and the caster named on it (shieldBy); a hero out
     of reach gets none; a party whose wounded in reach all hold a shell is no target (nothing is cast for nothing). A Mage's Arcane
     Barrier recast over that shell refunds nothing (the tank's rune never turns into the Mage's mana); over its own shell it still does. */
  'party-shield-shells-the-party': (M) => {
    const row = M.AD.ABILITIES.shelter;
    if (!row || row.target !== 'party' || !M.AD.shells(row) || M.AD.heals(row) || row.party !== true || row.radius !== 8) return 'Shelter is no party-only party shield of radius 8: ' + JSON.stringify(row);
    const run = (kShield, aShield) => {
      const k = hero(M, 1, 12, 3, { role: 'tank', hp: 60, maxHp: 100, mana: 100, maxMana: 100, shield: kShield, shieldBy: kShield ? 1 : null });
      const a = hero(M, 2, 12, 5, { hp: 50, maxHp: 100, shield: aShield, shieldBy: aShield ? 2 : null });
      const b = hero(M, 3, 13, 4, { hp: 50, maxHp: 100, shield: 500, shieldBy: 3 });
      const far = hero(M, 4, 2, 1, { hp: 50, maxHp: 100 });
      const inst = instOf(M, world(M, [k, a, b, far, mon(M, 10, 0, 11, 3, { target: 1, hp: 5000, maxHp: 5000 })]));
      inst.heroes = { 1: { hs: supplySession(M, { bag: { chalked_earth_rune: { loaded: 5 } } }), actionSet: 'hunt', range: 1,
        slots: M.conditions.heroSlots([{ action: { type: 'ability', id: 'shelter' }, conditions: [], join: 'and' }], null) } };
      const sc = subStep(0); sc.rng = rngOf(M, 21);
      M.abilities.castAbilities(inst, sc);
      return { k, a, b, far, ev: sc.events };
    };
    const x = run(0, 0);
    const shells = x.ev.filter((e) => e.type === 'shield').map((e) => [e.u, e.t, e.amount]);
    if (JSON.stringify(casts({ events: x.ev })) !== '["shelter"]') return 'Shelter did not cast once for a wounded party: ' + JSON.stringify(casts({ events: x.ev }));
    if (JSON.stringify(shells) !== JSON.stringify([[1, 1, row.base], [1, 2, row.base]])) return 'the shell events were ' + JSON.stringify(shells) + ', want the tank and the ally in reach at ' + row.base;
    if (x.k.shield !== row.base || x.a.shield !== row.base || x.k.shieldBy !== 1 || x.a.shieldBy !== 1) return 'the shells stand ' + JSON.stringify([x.k.shield, x.k.shieldBy, x.a.shield, x.a.shieldBy]);
    if (x.b.shield !== 500 || x.b.shieldBy !== 3) return 'a bigger shell was lowered or renamed: ' + JSON.stringify([x.b.shield, x.b.shieldBy]);
    if (x.far.shield) return 'a hero 10 tiles off was shelled';
    if (run(10, 10).ev.some((e) => e.type === 'cast')) return 'Shelter cast with every wounded hero in reach already shelled';
    const lift = run(10, 0).ev.filter((e) => e.type === 'shield').map((e) => e.t);
    if (JSON.stringify(lift) !== '[1,2]') return 'a chipped shell under Shelter\'s was not lifted beside the bare ally: ' + JSON.stringify(lift);
    /* the refund reads who cast the shell */
    const barrier = M.AD.ABILITIES.arcane_barrier;
    const recast = (by) => {
      const hs = supplySession(M, { bag: { chalked_earth_rune: { loaded: 3 } } });
      const m = oneHero(M, { hp: 50, maxHp: 100, mana: 100, maxMana: 0, shield: row.base, shieldBy: by }, { hs, bar: ['arcane_barrier'], range: 7 }, [{ x: 15, y: 3, hp: 5000, maxHp: 5000 }]);
      m.sc.rng = rngOf(M, 22);
      M.abilities.castAbilities(m.inst, m.sc);
      return m.sc.events.find((e) => e.type === 'cast') || null;
    };
    const over = recast(7), own = recast(1);
    if (!over || over.refund !== undefined || over.mana !== barrier.mana) return 'a Barrier over the tank\'s shell refunded: ' + JSON.stringify(over);
    return own && own.refund === Math.floor((row.base * barrier.mana) / barrier.base) ? null : 'a Barrier over its own shell refunds ' + JSON.stringify(own);
  },
  /* PIECE 2, A SHAPE THAT LANDS ONLY ITS STATUS (Frost Slam): every monster beside the tank is Chilled, none struck (no dmg event, no
     kill, no HP lost), a monster further off untouched. PIECE 3, CHILL BY RUNE TIER: the version is the rune tier, so a Scored Ice
     Rune at Melee 15 chills 35% (slowAt, the stack's scale fixed as it lands), and a landing on a monster already chilled weaker lifts
     it (never lowers). The store rune chills at its version's full strength: a status is never cut by the store's share. */
  'frost-slam-chills-without-a-blow': (M) => {
    const row = M.AD.ABILITIES.frost_slam, chill = M.AD.ABILITIES.hoarfrost && M.status.statusRow('chill');
    if (!row || row.target !== 'ring' || M.AD.landsBlow(row) || row.status !== 'chill' || row.party !== true) return 'Frost Slam is no party-only ring of chill: ' + JSON.stringify(row);
    const want = [300, 350, 400, 450, 500];
    for (let tier = 1; tier <= 5; tier++) {
      const got = M.ST.slowAt(chill, M.status.stackScale(chill, { runeTier: tier }));
      if (got !== want[tier - 1]) return 'Chill on a tier-' + tier + ' rune slows ' + got + ', want ' + want[tier - 1];
    }
    const run = (bag, melee, store, pre) => {
      const k = hero(M, 1, 12, 3, { role: 'tank', hp: 100, maxHp: 100, mana: 100, maxMana: 100 });
      const ally = hero(M, 2, 14, 5, { hp: 100, maxHp: 100 });
      const ms = [[11, 3], [13, 3], [12, 2], [16, 3]].map(([x, y], i) => mon(M, 10 + i, 0, x, y, { target: 1, hp: 500, maxHp: 500, statuses: pre && i === 0 ? pre : [] }));
      const inst = instOf(M, world(M, [k, ally, ...ms]));
      const action = Object.assign({ type: 'ability', id: 'frost_slam' }, store ? { store } : {});
      inst.heroes = { 1: { hs: supplySession(M, { bag, runes: !!store }), actionSet: 'hunt', range: 1, skills: { melee: M.XP.skillXpForLevel('melee', melee) },
        slots: M.conditions.heroSlots([{ action, conditions: [], join: 'and' }], null) } };
      const sc = subStep(0); sc.rng = rngOf(M, 23);
      M.abilities.castAbilities(inst, sc);
      const slow = (m) => (m.statuses || []).filter((st) => st.s === 'chill').map((st) => M.ST.slowAt(chill, st.scale));
      return { ms, ev: sc.events, slows: ms.map(slow), cast: sc.events.find((e) => e.type === 'cast') || null };
    };
    const a = run({ chalked_ice_rune: { loaded: 3 } }, row.unlock);
    if (!a.cast || a.cast.ability !== 'frost_slam' || a.cast.version !== 1) return 'Frost Slam did not cast version I in a party: ' + JSON.stringify(a.cast);
    if (a.ev.some((e) => e.type === 'dmg' || e.type === 'kill' || e.type === 'death') || a.ms.some((m) => m.hp !== 500)) return 'Frost Slam struck a blow: ' + JSON.stringify(a.ev.filter((e) => e.type !== 'cast'));
    if (JSON.stringify(a.slows) !== '[[300],[300],[300],[]]') return 'the chill landed ' + JSON.stringify(a.slows) + ', want 30% on the three beside the tank and none on the one 4 tiles off';
    if (M.damage.slowed(a.ms[0], 2000) !== 2600) return 'a chilled 2 s swing waits ' + M.damage.slowed(a.ms[0], 2000);
    const b = run({ scored_ice_rune: { loaded: 3 } }, 15);
    if (!b.cast || b.cast.version !== 2 || JSON.stringify(b.slows.slice(0, 3)) !== '[[350],[350],[350]]') return 'a Scored Ice Rune at Melee 15 chilled ' + JSON.stringify(b.slows) + ' (cast ' + JSON.stringify(b.cast) + ')';
    if (M.damage.slowed(b.ms[0], 2000) !== 2700) return 'a 35%-chilled 2 s swing waits ' + M.damage.slowed(b.ms[0], 2000);
    const st = run({}, 15, 'plain_scored_ice_rune');
    if (!st.cast || st.cast.source !== 'store' || st.cast.version !== 2 || JSON.stringify(st.slows[0]) !== '[350]') return 'the store\'s Scored rune chilled ' + JSON.stringify(st.slows) + ' (cast ' + JSON.stringify(st.cast) + ')';
    const lifted = run({ scored_ice_rune: { loaded: 3 } }, 15, null, [{ s: 'chill', src: 9, left: 3000, next: 0, scale: 1000 }]);
    return JSON.stringify(lifted.slows[0]) === '[350]' && lifted.ms[0].statuses.length === 1 ? null : 'a stronger chill on a chilled monster left ' + JSON.stringify(lifted.ms[0].statuses);
  },
  /* PIECE 4, PARTY ONLY (Tyler 2026-11-19): the mirror of an alone row. A tank alone in the world never casts either spell, the slot
     waiting as if absent (the next slot fires); beside a living ally it casts; beside only a fallen one it is alone again. */
  'party-only-waits-alone': (M) => {
    const run = (ally) => {
      const k = hero(M, 1, 12, 3, { role: 'tank', hp: 60, maxHp: 100, mana: 100, maxMana: 100 });
      const others = ally ? [hero(M, 2, 14, 5, { hp: 50, maxHp: 100, alive: ally === 'living' })] : [];
      const ms = [[11, 3], [13, 3]].map(([x, y], i) => mon(M, 10 + i, 0, x, y, { target: 1, hp: 500, maxHp: 500 }));
      const inst = instOf(M, world(M, [k, ...others, ...ms]));
      inst.heroes = { 1: { hs: supplySession(M, { bag: { chalked_ice_rune: { loaded: 3 }, chalked_earth_rune: { loaded: 3 } } }), actionSet: 'hunt', range: 1,
        slots: M.conditions.heroSlots(['frost_slam', 'shelter', 'power_strike'].map((id) => ({ action: { type: 'ability', id }, conditions: [], join: 'and' })), null) } };
      const sc = subStep(0); sc.rng = rngOf(M, 24);
      M.abilities.castAbilities(inst, sc);
      sc.atMs = 2000;
      M.abilities.castAbilities(inst, sc);
      return JSON.stringify(casts(sc));
    };
    const alone = run(null), party = run('living'), fallen = run('fallen');
    if (alone !== '["power_strike"]') return 'a tank alone cast ' + alone + ' (want only Power Strike: both tank spells are party only)';
    if (party !== '["frost_slam","shelter"]') return 'a tank beside a living ally cast ' + party + ' (want Frost Slam, then Shelter on the next support lane)';
    return fallen === '["power_strike"]' ? null : 'a tank beside a fallen ally cast ' + fallen;
  },
  /* THE TANK RUNES' WORDS (board section 2 and 6): the card and the hover say Party only, what each does, and the chill at the version
     the slot casts; a party spell's slot greys while its hero hunts alone, and Configure action says it does nothing alone. */
  'tank-rune-words': (M) => {
    if (!M.shell) return null;
    const { factsOf, aloneReason, aloneNote } = M.shell.facts;
    const slam = factsOf({ type: 'ability', id: 'frost_slam' }), shell = factsOf({ type: 'ability', id: 'shelter' });
    const say = (f) => [f.type, f.alone, ...f.effect, f.unlock].join(' | ');
    if (say(slam) !== 'Chills monsters next to you | Party only | Causes chill for 4 s, 30% slower attacks and casts | Unlocks at Melee 12') return 'Frost Slam reads ' + say(slam);
    /* (THE SPELL RULE: its shell is a share of the tank's blow, version I with no rune read, never under its beginner's floor) */
    if (say(shell) !== 'Shields every hero near you | Party only | Blocks damage up to 289% of Max Hit | Never less than 30 | Unlocks at Melee 20') return 'Shelter reads ' + say(shell);
    const deep = factsOf({ type: 'ability', id: 'frost_slam', store: 'plain_graven_ice_rune' }, { bag: [], skills: { melee: { level: 60 } }, store: M.SB.BASIC_SUPPLIES.filter((b) => b.id === 'plain_graven_ice_rune') });
    if (!deep.effect.includes('Causes chill for 4 s, 50% slower attacks and casts')) return 'a Graven slam reads ' + JSON.stringify(deep.effect);
    const sl = { action: { type: 'ability', id: 'frost_slam' }, conditions: [], join: 'and' };
    const greyed = aloneReason(sl, true);
    if (!greyed || greyed.code !== 'party_only' || greyed.text !== 'Party only' || !greyed.strike) return 'a party spell alone reads ' + JSON.stringify(greyed);
    if (aloneReason(sl, false) || aloneReason(sl, null)) return 'a party spell in a party (or unknown) is greyed';
    if (aloneReason({ action: { type: 'ability', id: 'undertow' }, conditions: [], join: 'and' }, true)) return 'an alone spell alone is greyed';
    return aloneNote(sl.action, 1) === 'Party only (no effect solo)' && aloneNote(sl.action, 2) === '' ? null : 'Configure action says ' + JSON.stringify([aloneNote(sl.action, 1), aloneNote(sl.action, 2)]);
  },
  /* AN IGNORE LIST BINDS ONLY WHERE IT AIMS (spell content, Coordinator 2026-10-23): a food, drink, heal or shield slot never
     reads one, so the Configure window saves none on it (bar-draft slotForSave), and the "can never fire" check never
     counts one there (action-facts conflictsOf): the same food below a food slot with a stray list is still blocked. */
  'ignore-only-where-it-aims': (M) => {
    if (!M.shell) return null;
    const { slotForSave } = M.shell.draft, { conflictsOf } = M.shell.facts;
    const s = (type, id, ignore) => ({ action: { type, id }, conditions: [], join: 'and', ...(ignore ? { ignore } : {}) });
    for (const [a, keeps] of [[s('consume', 'cooked_shrimp', ['giant_rat']), false], [s('ability', 'mend', ['giant_rat']), false], [s('ability', 'arcane_barrier', ['giant_rat']), false],
      [s('ability', 'fireball', ['giant_rat']), true], [s('attack_with_item', 'loaded', ['giant_rat']), true]]) {
      if (Array.isArray(slotForSave(a).ignore) !== keeps) return a.action.id + (keeps ? ' lost' : ' kept') + ' its ignore list on save';
    }
    const c = conflictsOf([s('consume', 'cooked_shrimp', ['giant_rat']), s('consume', 'cooked_shrimp')]);
    return c.has(1) ? null : 'a food slot\'s ignore list (never read) hid that the same food below it can never fire';
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
      const x = melee(M, ['power_strike', 'turning_cut'], { mana: 30, maxMana: 77 });
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
  /* THE AREA ABILITIES' WORDS (lane/b-area-client; the board's "2026-11-08 Area spells" §2, §2b): Configure action's detail, the
     bar's tooltip and the in-game wiki read one row's lines (action-facts.js factsOf). A line and a ring say what they strike, a
     hitPm row its share of the hero's own blow (abilities.js blowShare), an `unlock` row its level, and a slot under that level
     waits in the same words (reasonOf), never refused; every ability has a target line; the five area conditions pick plainly. */
  'configure-words': (M) => {
    if (!M.shell) return null;
    const { factsOf, reasonOf } = M.shell.facts;
    const { conditionFor, conditionWords } = M.shell.draft;
    const f = (id) => factsOf({ type: 'ability', id });
    const has = (x, type, effect, unlock) => x.type === type && effect.every((e) => x.effect.includes(e)) && x.unlock === unlock;
    /* (the words are the text home's, src/data/text/bar.js: the shipped target lines, a line's and a ring's own beside them) */
    const rows = [
      ['raking_shot', 'Hits every monster on a 4-tile line', ['On the line: 40% to 80% of Max Hit'], 'Unlocks at Ranged 10'],
      ['turning_cut', 'Hits up to 8 adjacent monsters', ['Each monster reached: 30% to 60% of Max Hit'], 'Unlocks at Melee 10'],
      /* THE SPELL RULE: a share of the hero's blow, in % of Max Hit, and the row's beginner's floor (abilities.js base) */
      ['hoarfrost', 'Hits monsters around the target', ['Each monster hit: 27% to 53% of Max Hit as frost', 'Never less than 5–9 a hit', 'Causes chill for 4 s, 30% slower attacks and casts'], 'Unlocks at Magic 14'],
      ['spring_tide', 'Hero and nearby allies', ['Heals 951% of Max Hit', 'Never less than 150'], 'Unlocks at Magic 20'],
    ];
    for (const [id, type, effect, unlock] of rows) if (!has(f(id), type, effect, unlock)) return id + ' reads ' + JSON.stringify(f(id));
    if (f('power_strike').unlock !== null) return 'a row with no unlock reads one: ' + f('power_strike').unlock;
    /* a status with no slow and no mark still says how long it lasts, and Sickness what it does */
    if (!f('rend').effect.includes('Causes bleed for 6 s') || !f('green_sickness').effect.includes('Causes sickness for 6 s, 10% more damage taken')) return 'the old statuses read ' + JSON.stringify([f('rend').effect, f('green_sickness').effect]);
    /* a shot spell's cost line says what each cast shoots (Raking Shot looses two of the bar's ammo), a plain one only mana */
    const src = ['raking_shot', 'power_strike'].map((id) => f(id).cost);
    if (src.join('|') !== 'Cost: 10 mana, 2 ammo|Cost: 6 mana') return 'the cost lines read ' + JSON.stringify(src);
    const blind = Object.keys(M.AD.ABILITIES).filter((id) => !f(id).type);
    if (blind.length) return 'abilities with no target line: ' + blind;
    /* the slot under its unlock waits, in the same words, from the server's skills; at the level it does not */
    const set = { discipline: 'ranged', role: 'ranger', slots: [], store: [], supplySource: 'store', onEmpty: 'switch' };
    const sl = { action: { type: 'ability', id: 'raking_shot' }, conditions: [], join: 'and', usable: true };
    const bag = [{ id: 'bronze_arrows', qty: 50 }];
    const under = reasonOf(sl, set, bag, null, 'bronze_arrows', { ranged: { level: 7, xp: 0 } }, null);
    if (!under || under.code !== 'unlock' || under.text !== 'Requires Ranged 10, now 7') return 'a slot under its unlock reads ' + JSON.stringify(under);
    const at = reasonOf(sl, set, bag, null, 'bronze_arrows', { ranged: { level: 10, xp: 0 } }, null);
    if (at && at.code === 'unlock') return 'a slot at its unlock still waits: ' + JSON.stringify(at);
    if (reasonOf(sl, set, bag, null, 'bronze_arrows', null, null)) return 'with no skills read the slot claims a wait: ' + JSON.stringify(reasonOf(sl, set, bag, null, 'bronze_arrows', null, null));
    /* a new pick takes its own starting rule when the slot still holds the last pick's untouched (Turning Cut, then a food), never
       the player's own edits */
    const { conditionsAfterPick, startConditions } = M.shell.draft;
    const cutA = { type: 'ability', id: 'turning_cut' }, fish = { type: 'consume', id: 'cooked_shrimp' };
    const after = conditionsAfterPick(startConditions(cutA), cutA, fish), mine = [{ metric: 'enemies_in_aoe', op: 'gte', value: 4 }];
    if (JSON.stringify(after) !== JSON.stringify(startConditions(fish)) || startConditions(fish)[0].metric !== 'self_hp_pct') return 'a food picked after Turning Cut keeps ' + JSON.stringify(after);
    if (conditionsAfterPick(mine, cutA, fish) !== mine) return 'a pick threw away the player’s own conditions';
    /* the area conditions, picked: each starts on a test that can hold, in plain words */
    const said = ['party_hp_pct', 'enemy_casting', 'in_fight', 'target_weak', 'target_resists'].map((id) => conditionWords(conditionFor(id)));
    const want = ['the party’s HP is below 50%', 'the pack has at least 1 monster casting at me', 'the fight is on', 'my target is weak to it', 'my target is resistant to it'];
    if (JSON.stringify(said) !== JSON.stringify(want)) return 'the area conditions read ' + JSON.stringify(said);
    /* THE ROADS' FOUR (lane/bar-metrics): the sentence the picker reads and the short label the slot's title reads (conditionTip) */
    const { conditionTip } = M.shell.draft;
    const roads = [{ metric: 'target_hp_pct', op: 'lt', value: 30 }, { metric: 'target_marked', op: 'eq', value: true }, { metric: 'target_stacks', op: 'gte', value: 3, subject: 'bleed' },
      { metric: 'last_move', op: 'eq', value: 'rend' }, { metric: 'last_move', op: 'ne', value: 'quarry_blow' }];
    const words = roads.map((c) => [conditionWords(c), conditionTip(c)]);
    const wantWords = [['my target’s HP is below 30%', 'Target health below 30%'], ['my target is Marked', 'Target is Marked'],
      ['my target has at least 3 Bleed stacks', 'Target Bleed stacks 3+'], ['my last move is Rend', 'Last move: Rend'], ['my last move is not Quarry Blow', 'Last move: not Quarry Blow']];
    return JSON.stringify(words) === JSON.stringify(wantWords) ? null : 'the Roads\' tests read ' + JSON.stringify(words);
  },
  /* TURNING CUT ON EVERY MELEE WEAPON WITHOUT A SHIELD (Tyler 2026-11-16, from Andy: "Give it to all melee that doesn't have a shield on"):
     every worn set that plays Melee damage keeps the slot (a sword alone, two axes, a club or hammer, bare hands) and every other one drops it
     (hunt-spawn heroSetup, the key's discipline list), the tank's sword and shield first. A club at Melee 10, its unlock, casts it on its
     starting rule and strikes all three monsters beside it, each for its share of the club's own blow; at Melee 9 it waits; the tank's set
     never casts it. The card and a struck slot name every weapon that casts a move (not its first discipline's alone). */
  'turning-cut-every-shieldless-melee': (M) => {
    const tc = M.AD.ABILITIES.turning_cut;
    const slot = { action: { type: 'ability', id: 'turning_cut' }, conditions: M.AD.suggestedTrigger(tc), join: 'and' };
    const setupOf = (key) => M.spawn.heroSetup({ weaponType: key, options: {}, bar: [slot], partyRoles: [] });
    for (const [key, row] of Object.entries(M.HR.ROLE_KEYS)) {
      const keeps = setupOf(key).slots.some((r) => r.slot.action.id === 'turning_cut');
      if (keeps !== row.roles.includes('melee_dps')) return 'a ' + key + ' hero ' + (keeps ? 'keeps' : 'drops') + ' Turning Cut';
    }
    const fight = (key, lv) => {
      const x = oneHero(M, { role: M.HR.ROLE_KEYS[key].roles[0], acc: 1000, maxHit: 20, target: 10 }, { slots: setupOf(key).slots, skills: { melee: M.XP.skillXpForLevel('melee', lv) } },
        [{ x: 13, y: 3, hp: 900, maxHp: 900 }, { x: 11, y: 3, hp: 900, maxHp: 900 }, { x: 12, y: 4, hp: 900, maxHp: 900 }]);
      x.sc.rng = rngOf(M, 12);
      M.abilities.castAbilities(x.inst, x.sc);
      return x.sc;
    };
    const club = fight('hammer', tc.unlock);
    const hits = club.events.filter((e) => e.type === 'dmg' && e.ability === 'turning_cut');
    const [lo, top] = M.AD.blowShare(20, tc);
    if (JSON.stringify(casts(club)) !== '["turning_cut"]' || JSON.stringify(hits.map((e) => e.t).sort()) !== '[10,11,12]') return 'a club at Melee ' + tc.unlock + ' cast ' + JSON.stringify(casts(club)) + ', struck ' + JSON.stringify(hits.map((e) => e.t));
    if (hits.some((e) => e.amount < lo || e.amount > top)) return 'a club\'s Turning Cut hit off its share [' + lo + ', ' + top + '] of the blow: ' + hits.map((e) => e.amount);
    const under = fight('hammer', tc.unlock - 1);
    if (casts(under).length || !under.events.some((e) => e.type === 'rule_wait' && e.why === 'level')) return 'a club under its unlock cast or did not wait: ' + JSON.stringify(casts(under));
    if (casts(fight('shield', 40)).includes('turning_cut')) return 'a sword and shield cast Turning Cut';
    if (!M.shell) return null;
    const { factsOf, reasonOf } = M.shell.facts;
    const req = (id) => factsOf({ type: 'ability', id }).requires;
    if (!req('turning_cut').includes('Melee weapon (no shield)') || /sword/i.test(req('turning_cut'))) return 'Turning Cut reads ' + JSON.stringify(req('turning_cut'));
    /* (Power Strike is every melee weapon's but the two axes', Tyler 32-3: the card names the weapons that cast it) */
    if (/axe/i.test(req('power_strike')) || !/sword/i.test(req('power_strike')) || !/hammer/i.test(req('power_strike'))) return 'Power Strike, every melee weapon\'s but the axes\', reads ' + JSON.stringify(req('power_strike'));
    if (!/shield/i.test(req('flame_strike')) || !/sword/i.test(req('flame_strike'))) return 'Flame Strike, a shield\'s and a sword\'s, reads ' + JSON.stringify(req('flame_strike'));
    const struck = reasonOf({ action: { type: 'ability', id: 'turning_cut' }, conditions: [], join: 'and', usable: false }, { discipline: 'shield', role: 'tank', slots: [], store: [], supplySource: 'store', onEmpty: 'switch' }, [], null, null, null, null);
    return struck && struck.code === 'weapon' && struck.text.includes('Melee weapon (no shield)') ? null : 'a sword and shield\'s Turning Cut slot reads ' + JSON.stringify(struck);
  },
  /* HERO AREA ABILITIES BY SHAPE (lane/b-area-engine; Tyler 2026-11-08 "our heros some more aoe spells"): a LINE from the hero
     through its best aim, a RING round the hero up to maxHits, a hitPm row hitting for a share of the hero's own largest blow,
     `unlock` waiting on the row's skill, a row's own `trigger`, and the boss set skipping both shapes. The designer's rows are
     lane 2's: two test rows are planted into a copy of the tree under test (a mutant's copy under a mutant). */
  'hero-area-shapes': async (M) => {
    const P = await withRows(M.root, AREA_ROWS);
    try {
      const X = P.M;
      const bad = X.AD.validate();
      if (bad.length) return 'the planted rows: ' + bad.join('; ');
      const line = X.AD.ABILITIES.zz_line, ring = X.AD.ABILITIES.zz_ring;
      /* the row's own trigger is what a new slot starts with, and the server's slot check (mirrored) takes it */
      if (JSON.stringify(X.AD.suggestedTrigger(ring)) !== JSON.stringify(ring.trigger)) return 'a row\'s trigger is not its new slot\'s conditions';
      if (X.conditions.slotProblem({ action: { type: 'ability', id: 'zz_ring' }, conditions: X.AD.suggestedTrigger(ring), join: 'and' })) return 'the row\'s trigger is refused as a slot';
      if (JSON.stringify(X.AD.suggestedTrigger(line)) !== JSON.stringify([{ metric: 'enemies_in_aoe', op: 'gte', value: X.AD.ABILITY_RULES.areaMin }])) return 'a line starts with no area minimum';
      /* the boss set skips both shapes, as it skips the 3x3 */
      if (X.abilities.gateOf({ cds: {}, lanes: {}, mana: 99 }, { actionSet: 'boss' }, line, 0) !== 'action_set' || X.abilities.gateOf({ cds: {}, lanes: {}, mana: 99 }, { actionSet: 'boss' }, ring, 0) !== 'action_set') return 'the boss set casts a line or a ring';
      if (X.conditions.areaTopOf({ action: { type: 'ability', id: 'zz_line' } }, null) !== 4 || X.conditions.areaTopOf({ action: { type: 'ability', id: 'zz_ring' } }, null) !== 2) return 'the slot\'s top count is not the line\'s length or the ring\'s maxHits';
      /* THE LINE: a Ranged 9 hero waits (`level`), a Ranged 10 one casts through the three rats in a row and not the fourth */
      const lineFight = (lv) => {
        const slot = { action: { type: 'ability', id: 'zz_line' }, conditions: [{ metric: 'enemies_in_aoe', op: 'gte', value: 3 }], join: 'and' };
        const x = oneHero(X, { role: 'ranger', acc: 1000, maxHit: 10, target: 10 }, { bar: [slot], range: 7, skills: { ranged: X.XP.skillXpForLevel('ranged', lv) } },
          [{ x: 13, y: 3, hp: 900, maxHp: 900 }, { x: 14, y: 3, hp: 900, maxHp: 900 }, { x: 15, y: 3, hp: 900, maxHp: 900 }, { x: 13, y: 5, hp: 900, maxHp: 900 }]);
        x.sc.rng = rngOf(X, 9);
        X.abilities.castAbilities(x.inst, x.sc);
        return x.sc;
      };
      const early = lineFight(9);
      const wait = early.events.find((e) => e.type === 'rule_wait');
      if (casts(early).length || !wait || wait.why !== 'level') return 'a Ranged 9 hero cast a Ranged 10 line: ' + JSON.stringify({ casts: casts(early), wait });
      const at = lineFight(10);
      const hit = at.events.filter((e) => e.type === 'dmg' && e.ability === 'zz_line');
      const [lo, top] = X.AD.blowShare(10, line);
      /* the wiki formula, stated here on its own: top = floor(M x hitPm / 1000), low = ceil(top x hitLowPm / 1000) */
      const wantTop = Math.floor((10 * line.hitPm) / 1000);
      if (top !== wantTop || lo !== Math.ceil((wantTop * X.AD.ABILITY_RULES.hitLowPm) / 1000)) return 'blowShare(10) of an 800 hitPm row is [' + lo + ', ' + top + ']';
      if (JSON.stringify(casts(at)) !== '["zz_line"]' || JSON.stringify(hit.map((e) => e.t)) !== '[10,11,12]') return 'the line hit ' + JSON.stringify(hit.map((e) => e.t)) + ', want the three in a row';
      if (hit.some((e) => e.amount < lo || e.amount > top)) return 'a line hit off its share [' + lo + ', ' + top + '] of the blow: ' + hit.map((e) => e.amount);
      /* THE RING: three beside a sword hero, maxHits 2: the two lowest ids */
      const r = oneHero(X, { role: 'melee_dps', acc: 1000, maxHit: 20, target: 10 }, { bar: [] },
        [{ x: 13, y: 3, hp: 900, maxHp: 900 }, { x: 11, y: 3, hp: 900, maxHp: 900 }, { x: 12, y: 4, hp: 900, maxHp: 900 }, { x: 15, y: 3, hp: 900, maxHp: 900 }]);
      r.sc.rng = rngOf(X, 10);
      X.abilities.fire(r.inst, r.h, { row: ring, target: r.inst.world.units.find((u) => u.id === 10), lines: [] }, r.sc);
      const rh = r.sc.events.filter((e) => e.type === 'dmg' && e.ability === 'zz_ring');
      const [rlo, rtop] = X.AD.blowShare(20, ring);
      if (JSON.stringify(rh.map((e) => e.t)) !== '[10,11]') return 'the ring of maxHits 2 hit ' + JSON.stringify(rh.map((e) => e.t)) + ', want the two lowest beside';
      if (!rh.every((e) => e.amount >= rlo && e.amount <= rtop)) return 'a ring hit off its share of the blow: ' + rh.map((e) => e.amount);
      /* THE LONG PARTY HEAL (Spring Tide's shape: radius 8, a 60 s cooldown, 160 mana, its own "the fight is on" rule) */
      const tide = X.AD.ABILITIES.zz_tide;
      const tideFight = (fight) => {
        const x = oneHero(X, { role: 'healer', mana: 400, maxMana: 400, hp: 50, maxHp: 100 }, { bar: [{ action: { type: 'ability', id: 'zz_tide' }, conditions: X.AD.suggestedTrigger(tide), join: 'and' }], range: 7 },
          fight ? [{ x: 13, y: 3, hp: 900, maxHp: 900 }] : []);
        const near = hero(X, 2, 14, 5, { hp: 40, maxHp: 100 }), far = hero(X, 3, 3, 3, { hp: 40, maxHp: 100 });
        x.inst.world.units.splice(1, 0, near, far);
        x.inst.world.phase = fight ? 'fight' : 'travel';
        x.sc.rng = rngOf(X, 11);
        steps(x.inst, x.sc, cast(X), 20, 0);
        return { x, near, far };
      };
      const calm = tideFight(false);
      if (casts(calm.x.sc).length) return 'the long party heal fired between pulls: ' + casts(calm.x.sc);
      const hot = tideFight(true);
      const heals = hot.x.sc.events.filter((e) => e.type === 'heal').map((e) => e.t).sort();
      if (JSON.stringify(casts(hot.x.sc)) !== '["zz_tide"]' || JSON.stringify(heals) !== '[1,2]') return 'the long party heal: casts ' + casts(hot.x.sc) + ', healed ' + heals + ' (want once, the caster and the ally within 8 tiles, not the one 9 away)';
      /* (19 sub-steps of regen after the cast: 25% of 400 a minute is 3 mana) */
      if (hot.x.h.mana < 400 - tide.mana || hot.x.h.mana > 400 - tide.mana + 4 || hot.x.h.cds.zz_tide !== tide.cdMs) return 'the long heal\'s mana or cooldown: ' + hot.x.h.mana + ' / ' + JSON.stringify(hot.x.h.cds);
      return null;
    } finally { P.done(); }
  },
};

/* THE TEST AREA ROWS (hero-area-shapes): planted beside Circle of Renewal in a copy of the tree under test, never shipped. */
const AREA_ROWS = [['src/data/abilities.js', "    healPm: 1600, base: 25, whenBelowPct: 80, minHurt: 2, radius: 8, magicXpMult: 1600, versions: [50, 60, 72, 86, 104] }),\n",
  "    healPm: 1600, base: 25, whenBelowPct: 80, minHurt: 2, radius: 8, magicXpMult: 1600, versions: [50, 60, 72, 86, 104] }),\n"
  + "  ab({ id: 'zz_line', n: 'Test Line', disciplines: ['ranged'], lane: 'offense', cdMs: 8000, mana: 10, unlock: 10, target: 'line', len: 4, hitPm: 800 }),\n"
  + "  ab({ id: 'zz_ring', n: 'Test Ring', disciplines: ['sword'], lane: 'offense', cdMs: 8000, mana: 8, target: 'ring', maxHits: 2, hitPm: 600,\n"
  + "    trigger: [{ metric: 'enemies_in_aoe', op: 'gte', value: 2 }, { metric: 'in_fight', op: 'eq', value: true }] }),\n"
  + "  ab({ id: 'zz_tide', n: 'Test Tide', disciplines: ['restoration'], lane: 'heal', cdMs: 60000, mana: 160, target: 'party', healPm: 1000, base: 150, radius: 8,\n"
  + "    trigger: [{ metric: 'allies_below', op: 'gte', value: 2, subject: 'under_60' }, { metric: 'in_fight', op: 'eq', value: true }] }),\n"]];
/** A copy of `root`'s src/core + src/data with `edits` applied, loaded as the suite loads a tree: { M, done() }. */
async function withRows(root, edits) {
  const dir = mkdtempSync(join(tmpdir(), 'hunt-rows-'));
  for (const d of ['src/core', 'src/data']) cpSync(join(root, d), join(dir, d), { recursive: true, filter: (f) => !/\.(png|webp)$/i.test(f) });
  cpSync(join(root, 'src/build-info.js'), join(dir, 'src/build-info.js'));
  for (const [file, from, to] of edits) {
    const p = join(dir, file);
    const src = readFileSync(p, 'utf8');
    if (src.split(from).length !== 2) { rmSync(dir, { recursive: true, force: true }); throw new Error('withRows: ' + file + ' anchor not found once'); }
    writeFileSync(p, src.replace(from, () => to));
  }
  const M = await loadCore(dir);
  return { M: Object.assign(M, await loadData(M)), done: () => rmSync(dir, { recursive: true, force: true }) };
}

const mutants = [
  /* lane/moves-pass-1: the bow's two targets */
  { name: 'Precision Shot shoots the bow\'s own target again', case: 'bow-picks-its-marks',
    edits: [['src/data/abilities.js', "target: 'enemy', prefers: ['shooter', 'caster', 'stalker'], hitPm: 750,", "target: 'enemy', hitPm: 750,"]] },
  { name: 'a preferred role is read off the scale too', case: 'bow-picks-its-marks',
    edits: [['src/core/hunt/abilities.js', 'const r = monsterRoleOf(inst, m);', 'const r = MONSTER_ROLES[((inst.monsters || {})[m.kind] || {}).role];']] },
  { name: 'the Mark takes the healthiest again', case: 'bow-picks-its-marks',
    edits: [['src/core/hunt/abilities.js', '      if (own && !(own.markUntil > sc.atMs)) return own;\n', '']] },
  { name: 'a healer spell trains Magic at another rate', case: 'a-mage-and-a-healer-train-alike',
    edits: [['src/data/abilities.js', 'healPm: 3170, base: 50, whenBelowPct: 70, magicXpMult: 1600,', 'healPm: 3170, base: 50, whenBelowPct: 70, magicXpMult: 1200,']] },
  { name: "a healer's basic trains Magic at another rate", case: 'a-mage-and-a-healer-train-alike',
    edits: [['src/data/hunt-roles.js', "peel: 180,\n    basic: Object.freeze({ mana: 1, magicXpMult: 1600 }) }),", "peel: 180,\n    basic: Object.freeze({ mana: 1, magicXpMult: 1200 }) }),"]] },
  { name: 'the Mark rides the offense lane (audit c16)', case: 'support-lane',
    edits: [['src/data/abilities.js', "disciplines: ['ranged'], lane: 'support',", "disciplines: ['ranged'], lane: 'offense',"]] },
  { name: 'Arcane Barrier back on the heal lane', case: 'support-lane',
    edits: [['src/data/abilities.js', "lane: 'support', cdMs: 20000, mana: 30, rune: 'chalked_earth_rune', target: 'self',", "lane: 'heal', cdMs: 20000, mana: 30, rune: 'chalked_earth_rune', target: 'self',"]] },
  { name: 'abilities fire only while monsters are engaged again (audit c30)', case: 'mends-between-pulls',
    edits: [['src/core/hunt/abilities.js', '    const pick = firstUsable(inst, u, sc, engaged(inst, u).length ? null : mends);\n', '    if (!engaged(inst, u).length) continue;\n    const pick = firstUsable(inst, u, sc);\n']] },
  { name: 'every slot is walked between pulls', case: 'mends-between-pulls',
    edits: [['src/core/hunt/abilities.js', 'const mends = (row) => !!row && MEND_TARGETS.includes(row.target);', 'const mends = (row) => !!row;']] },
  { name: 'a recast refunds nothing (Andy)', case: 'barrier-recast-refunds',
    edits: [['src/core/hunt/abilities.js', '  const refund = shieldRefund(u, row, paid, pm, inst);', '  const refund = 0;']] },
  { name: 'a recast refunds the whole cast whatever was used', case: 'barrier-recast-refunds',
    edits: [['src/core/hunt/abilities.js', '  return Math.min(mana, Math.floor((standing * mana) / lands));', '  return mana;']] },
  { name: 'a full shell is recast', case: 'barrier-recast-refunds',
    edits: [['src/core/hunt/abilities.js', "    if (row.target === 'self' && shells(row) && int(hero.shield) >= landsShield(hero, row, pm, inst)) return { why: 'no_target' };\n", '']] },
  { name: 'Magic XP is paid on refunded mana', case: 'barrier-recast-refunds',
    edits: [['src/core/hunt/abilities.js', "{ u: u.id, ability: row.id, t: pick.target.id, mana, magicXpMult:", "{ u: u.id, ability: row.id, t: pick.target.id, mana: paid, magicXpMult:"]] },
  { name: '[bar] the hover casts version I whatever store rune the slot names', case: 'the-bar-states-the-cast-the-engine-makes', also: ['src'],
    edits: [['src/shell/cast-facts.js', '    else if (tier) { version = tier; share = STORE_PM;', '    else if (tier) { version = 1; share = STORE_PM;']] },
  { name: '[bar] the hover lands a store rune at full power', case: 'the-bar-states-the-cast-the-engine-makes', also: ['src'],
    edits: [['src/shell/cast-facts.js', '    else if (tier) { version = tier; share = STORE_PM;', '    else if (tier) { version = tier; share = 1000;']] },
  { name: '[bar] the hover reads version I\'s step whatever rune the slot names', case: 'the-bar-states-the-cast-the-engine-makes', also: ['src'],
    edits: [['src/shell/cast-facts.js', 'pm: Math.floor((versionOf(row, version).outPm * share) / 1000)', 'pm: Math.floor((versionOf(row, 1).outPm * share) / 1000)']] },
  { name: '[bar] the damage line reads the row\'s share, not the cast (Tyler 2026-11-08)', case: 'the-bar-states-the-cast-the-engine-makes', also: ['src'],
    edits: [['src/shell/action-facts.js', '    if (landsBlow(r)) numbers.push(blowShareLine(r, k.pm));', '    if (landsBlow(r)) numbers.push(blowShareLine(r, 1000));']] },
  { name: '[bar] a short hero waits for version I\'s mana', case: 'the-bar-states-the-cast-the-engine-makes', also: ['src'],
    edits: [['src/shell/action-facts.js', '    const need = /** @type {{ mana: number }} */ (castOf(a, { bag, store: set && set.store, skills, set })).mana;', '    const need = r.mana;']] },
  { name: '[bar] the hover keeps the explanatory type line', case: 'the-bar-states-the-cast-the-engine-makes', also: ['src'],
    edits: [['src/shell/action-facts.js', "    .concat(f.numbers.map((n) => line(n)), [line(f.cooldown),", "    .concat(f.effect.map((n) => line(n)), [line(f.type), line(f.cooldown),"]] },
  { name: '[names] the store\'s Scored rune is "Plain Scored Fire Rune" again', case: 'the-bar-states-the-cast-the-engine-makes', also: ['src'],
    edits: [['src/data/supply-basics.js', "  t.tier === 1 ? 'Plain ' + RUNE_FAMILIES[family].label + ' Rune' : runeName(family, t.tier),", "  t.tier === 1 ? 'Plain ' + RUNE_FAMILIES[family].label + ' Rune' : 'Plain ' + runeName(family, t.tier),"]] },
  { name: '[conditions] the When line reads a count with no noun ("at or above 2 what?")', case: 'the-bar-states-the-cast-the-engine-makes', also: ['src'],
    edits: [['src/shell/bar-draft.js', " + c.value + unitWords(m, c.value) + (m.subjectAfter ? subject : '');", " + c.value + (m.subjectAfter ? subject : '');"]] },
  { name: '[conditions] a count reads the old "is at or above"', case: 'the-bar-states-the-cast-the-engine-makes', also: ['src'],
    edits: [['src/data/condition-metrics.js', "  gte: Object.freeze({ pct: 'is at least', count: 'at least' }),", "  gte: Object.freeze({ pct: 'is at least', count: 'is at or above' }),"]] },
  { name: 'a food slot saves its ignore list', case: 'ignore-only-where-it-aims', also: ['src'],
    edits: [['src/shell/bar-draft.js', '  if (!d || !Array.isArray(d.ignore) || aimsAtMonsters(d)) return d;', '  return d;']] },
  { name: 'the blocked-slot check reads a food slot\'s ignore list', case: 'ignore-only-where-it-aims', also: ['src'],
    edits: [['src/shell/action-facts.js', 'const ignoresOf = (s) => (aimsAtMonsters(s) && Array.isArray(s.ignore) ? s.ignore : []);', 'const ignoresOf = (s) => (Array.isArray(s.ignore) ? s.ignore : []);']] },
  { name: 'a spell casts version I whatever rune it spends', case: 'spell-casts-the-spent-runes-version',
    edits: [['src/core/hunt/abilities.js', '    if (!best || tier > best.version) best = { line: l, version: tier, pm: 1000 };', '    if (!best || tier > best.version) best = { line: l, version: 1, pm: 1000 };']] },
  { name: 'a carried rune casts a version its hero has not unlocked', case: 'spell-casts-the-spent-runes-version',
    edits: [['src/core/hunt/abilities.js', '    if (lv < versionLevel(tier)) { locked = true; continue; }\n', '']] },
  { name: '[spell-content] a cast spends the lowest tier its hero carries', case: 'family-spends-the-best-unlocked-tier',
    edits: [['src/core/hunt/abilities.js', '    if (!best || tier > best.version) best = { line: l, version: tier, pm: 1000 };', '    if (!best || tier < best.version) best = { line: l, version: tier, pm: 1000 };']] },
  { name: '[spell-content] a spell spends a rune of another family', case: 'family-spends-the-best-unlocked-tier',
    edits: [['src/core/hunt/conditions.js', '(id) => isRune(ITEMS[id]) && ITEMS[id].family === family && runeTierOf(ITEMS[id]))', '(id) => isRune(ITEMS[id]) && runeTierOf(ITEMS[id]))']] },
  { name: '[spell-content] a version costs version I\'s mana', case: 'family-spends-the-best-unlocked-tier',
    edits: [['src/core/hunt/abilities.js', '    const v = versionOf(row, s.version);', '    const v = versionOf(row, 1);']] },
  { name: '[spell rule] a cast reads a fixed blow, not its hero\'s', case: 'output-grows-with-the-blow-not-mana',
    edits: [['src/core/hunt/abilities.js', '  const dmg = () => { const r = hitRange(blow, row); return piped ? (r[0] + r[1]) / 2 : roll(sc, r); };', '  const dmg = () => { const r = hitRange(10, row); return piped ? (r[0] + r[1]) / 2 : roll(sc, r); };']] },
  { name: '[spell rule] a cast grows with its skill level too (the retired lvPm, twice over the blow)', case: 'output-grows-with-the-blow-not-mana',
    edits: [['src/core/hunt/abilities.js', '    const pm = Math.floor((v.outPm * s.pm) / 1000);', '    const pm = Math.floor((v.outPm * s.pm * (1000 + 10 * (skillLevel(h, row) - 1))) / 1000000);']] },
  { name: 'a store rune fires at full power (r07)', case: 'spell-casts-the-spent-runes-version',
    edits: [['src/core/hunt/abilities.js', '  return { line: s, version, pm: BASIC_PM };', '  return { line: s, version, pm: 1000 };']] },
  { name: '[rune ladder] a deeper store rune casts version I', case: 'store-rune-is-the-one-the-slot-names',
    edits: [['src/core/hunt/abilities.js', '  return { line: s, version, pm: BASIC_PM };', '  return { line: s, version: 1, pm: BASIC_PM };']] },
  { name: '[rune ladder] a store rune above the level casts anyway', case: 'store-rune-is-the-one-the-slot-names',
    edits: [['src/core/hunt/abilities.js', "  if (version && lv < versionLevel(version)) return { why: 'level', short: false };\n", '']] },
  { name: '[rune ladder] a store rune above the level falls back to Plain (the game picks a tier)', case: 'store-rune-is-the-one-the-slot-names',
    edits: [['src/core/hunt/abilities.js', "  if (version && lv < versionLevel(version)) return { why: 'level', short: false };\n", "  if (version && lv < versionLevel(version)) { const p = storeLine(h.hs, row.rune); return p.id && !p.why ? { line: p, version: 1, pm: BASIC_PM } : { why: 'level', short: false }; }\n"]] },
  { name: '[rune ladder] a Fire spell casts on any family\'s store rune', case: 'store-rune-is-the-one-the-slot-names',
    edits: [['src/core/hunt/abilities.js', '  const version = named && named.family === fam ? runeTierOf(named) : 0;', '  const version = named ? runeTierOf(named) : 0;']] },
  { name: '[rune ladder] a named deeper rune is charged at Plain\'s price', case: 'store-rune-is-the-one-the-slot-names',
    edits: [['src/core/hunt/abilities.js', '  const s = version ? storeLine(h.hs, b.partner, store) : { why: \'none\' };', '  const s = version ? { ...storeLine(h.hs, b.partner, store), price: 1, id: \'plain_\' + fam + \'_rune\' } : { why: \'none\' };']] },
  { name: '[rune ladder] the bar refuses a deeper store rune (the old partner rule)', case: 'store-rune-is-the-one-the-slot-names',
    edits: [['src/core/hunt/conditions.js', '  return !!family && !!ITEMS[b.partner] && ITEMS[b.partner].family === family;', '  return !!family && b.partner === ABILITIES[id].rune;']] },
  { name: '[rune ladder] the bar lets a spell name another family\'s store rune', case: 'store-rune-is-the-one-the-slot-names',
    edits: [['src/core/hunt/conditions.js', '  return !!family && !!ITEMS[b.partner] && ITEMS[b.partner].family === family;', '  return !!family && !!ITEMS[b.partner] && !!ITEMS[b.partner].family;']] },
  { name: '[rune ladder] a deeper store row priced off the ladder', case: 'store-rune-is-the-one-the-slot-names',
    edits: [['src/data/supply-basics.js', "export const STORE_RUNE_PRICE = Object.freeze(RUNE_TIERS.map((t) => chargePrice(runeId(CRAFTED_RUNE_FAMILIES[0], t.tier))));", 'export const STORE_RUNE_PRICE = Object.freeze(RUNE_TIERS.map(() => 7));']] },
  { name: 'a hit ignores its power', case: 'spell-casts-the-spent-runes-version',
    edits: [['src/core/hunt/abilities.js', '  const hitTag = pm === 1000 ? { id: row.id } : { id: row.id, mult: pm };', '  const hitTag = { id: row.id };']] },
  { name: 'a heal and a shield ignore their version', case: 'version-output-scales-numbers',
    edits: [['src/core/hunt/abilities.js', '    const a = /** @type {{ hit?: number[], heal?: number, shield?: number }} */ (castAmount(row, blow, u.maxHp, pm) || {});', '    const a = /** @type {{ hit?: number[], heal?: number, shield?: number }} */ (castAmount(row, u.maxHit, u.maxHp, 1000) || {});']] },
  { name: 'a sized version is read as the row', case: 'version-output-scales-numbers',
    edits: [['src/data/abilities.js', '  return Number.isInteger(mana) ? { mana, outPm: versionStep(n) } : { mana: row ? row.mana : 0, outPm: 1000 };', '  return { mana: row ? row.mana : 0, outPm: 1000 };']] },
  { name: 'the store is shut while another ammo line has uses (the starter-kit lock)', case: 'store-rune-beside-the-starter-kit',
    edits: [['src/core/action-rules.js', "  return !!hs && (hs.supplySource === 'store' || hs.onEmpty === 'switch');",
      "  return !!hs && (hs.supplySource === 'store' || (hs.onEmpty === 'switch' && !Object.keys(hs.bag || {}).some((id) => kindOf(id) === 'ammo' && leftOf(hs, id) > 0)));"]] },
  { name: 'a basic shot spends or buys a rune (8 g a shot)', case: 'basic-shot-never-buys-a-rune',
    edits: [['src/core/hunt/abilities.js', "  return isRune(itemRow(h, id)) ? { why: 'none' } : shotLocked(h, id) ? { why: 'level' } : resolveLine(h && h.hs, id, undefined);", "  return shotLocked(h, id) ? { why: 'level' } : resolveLine(h && h.hs, id);"]] },
  { name: 'a spent rune line with no store row ends a default hunt ammo_out', case: 'spent-runes-never-end-a-default-hunt',
    edits: [['src/core/action-rules.js', "  if (kind === 'ammo' && storeAllowed(hs)) return false;\n", '']] },
  { name: 'an unaffordable slot marks the hunt gold_out while the bar is still walked', case: 'unaffordable-slot-waits',
    edits: [['src/core/hunt/abilities.js', "    if (s.why) return { why: s.short ? 'gold_short' : s.why === 'level' ? 'level' : 'no_stock' };",
      "    if (s.why) { if (s.short) h.hs.goldOut = true; return { why: s.short ? 'gold_short' : s.why === 'level' ? 'level' : 'no_stock' }; }"]] },
  { name: 'a slot naming no shop rune leaves instead of buying (the old default)', case: 'rune-own-then-store',
    edits: [['src/core/hunt/conditions.js', "  const onEmpty = RUNE_ON_EMPTY.includes(action.onEmpty) ? action.onEmpty : 'store';", "  const onEmpty = RUNE_ON_EMPTY.includes(action.onEmpty) ? action.onEmpty : typeof action.store === 'string' ? 'store' : 'leave';"]] },
  { name: '[rune supply] an unticked rune is spent', case: 'only-ticked-runes-then-on-empty',
    edits: [['src/core/hunt/conditions.js', '  const own = Array.isArray(action.own) ? runes.filter((id) => action.own.includes(id)) : runes.slice();', '  const own = runes.slice();']] },
  { name: '[rune supply] a leaving slot never leaves', case: 'only-ticked-runes-then-on-empty',
    edits: [['src/core/hunt/abilities.js', "  if (sup.onEmpty === 'leave') return { why: locked ? 'level' : 'runes_out', short: false };\n", '']] },
  { name: '[rune supply] a leaving slot leaves on a rune it holds but cannot cast yet', case: 'only-ticked-runes-then-on-empty',
    edits: [['src/core/hunt/abilities.js', "  if (sup.onEmpty === 'leave') return { why: locked ? 'level' : 'runes_out', short: false };", "  if (sup.onEmpty === 'leave') return { why: 'runes_out', short: false };"]] },
  { name: '[rune supply] runes_out ends no hunt', case: 'only-ticked-runes-then-on-empty',
    edits: [['src/core/action-rules.js', "  runes_out: (hs) => typeof hs.runesOut === 'string' && hs.runesOut.length > 0,", '  runes_out: () => false,']] },
  { name: '[rune supply] the bar takes a rune of another family', case: 'only-ticked-runes-then-on-empty',
    edits: [['src/core/hunt/conditions.js', "(!Array.isArray(a.own) || a.own.length !== sup.own.length)) return { error: 'bad_own' };", "!Array.isArray(a.own)) return { error: 'bad_own' };"]] },
  { name: '[rune supply] the bar takes any onEmpty', case: 'only-ticked-runes-then-on-empty',
    edits: [['src/core/hunt/conditions.js', "  if (a.onEmpty !== undefined && a.onEmpty !== sup.onEmpty) return { error: 'bad_on_empty' };\n", '']] },
  { name: '[spell-content] Mend casts at full health', case: 'mend-heals-only-the-hurt',
    edits: [['src/core/hunt/abilities.js', "    case 'self': return pct(hero) < 100 ? hero : null;",
      "    case 'self': return heals(row) || pct(hero) < 100 ? hero : null;"]] },
  /* the shield it plants is Mend's own amount (lane/c-hollow-proofs 2026-11-20, re-aimed by lane/c-spell-rule): dropping the heal line alone sent Mend
     down the shield path with no shield share on its row, makeEvent refused the empty amount and the throw read as the catch, the case unrun */
  { name: '[spell-content] Mend shields instead of healing', case: 'mend-heals-only-the-hurt',
    edits: [['src/core/hunt/abilities.js', '      if (heals(row)) { healOne(u, u, amount().heal, sc, sg, row, piped, cast); break; }\n',
      "      if (heals(row)) { u.shield = amount().heal; u.shieldBy = u.id; sc.emit(makeEvent('shield', sc.atMs, { u: u.id, t: u.id, amount: u.shield })); break; }\n"]] },
  { name: '[spell-content] Mend is kept off a physical bar', case: 'mend-heals-only-the-hurt',
    edits: [['src/data/abilities.js', 'disciplines: DISCIPLINE_IDS, universal: true,', "disciplines: ['destruction', 'restoration'], universal: true,"]] },
  { name: '[spell-content] the sickness mark adds nothing', case: 'sickness-marks-what-it-hits',
    edits: [['src/core/hunt/damage.js', ' ? target.markPm : 0) + takenPmOf(target);', ' ? target.markPm : 0);']] },
  { name: '[spell-content] an area spell marks only its aim', case: 'sickness-marks-what-it-hits',
    edits: [['src/core/hunt/abilities.js', '        strike(m);\n        afflict(m);\n', '        strike(m);\n']] },
  { name: '[spell-content] the sickness mark never wears off', case: 'sickness-marks-what-it-hits',
    edits: [['src/core/hunt/status.js', '      st.left -= sc.dtMs;\n      const row = rowOf(st);\n', '      const row = rowOf(st);\n      if (ticks(row)) st.left -= sc.dtMs;\n']] },
  { name: 'the mark is drawn but adds nothing', case: 'mark-adds-damage',
    edits: [['src/core/hunt/damage.js', '  let mult = markPm ? Math.floor((base * Math.max(1, 1000 + markPm)) / 1000) : base;', '  let mult = base;']] },
  { name: 'the mark never wears off', case: 'mark-adds-damage',
    edits: [['src/core/hunt/damage.js', ' && target.markUntil > sc.atMs ?', ' ?']] },
  { name: 'bleed lands from a blow of 1 whatever the caster', case: 'bleed-scales-with-the-casters-blow',
    edits: [['src/core/hunt/abilities.js', '    const hit = Number.isInteger(own) && own > 0 ? own : 1;', '    const hit = 1;']] },
  { name: 'a rune names a family that is not one of the seven', case: 'rows-validate',
    edits: [['src/data/stonecraft.js', 'ammoPerShot: 1, family, runeTier: t.tier });', "ammoPerShot: 1, family: family === 'rupture' ? 'blood' : family, runeTier: t.tier });"]] },
  { name: 'a rune casts a sixth tier', case: 'rows-validate',
    edits: [['src/data/stonecraft.js', 'ammoPerShot: 1, family, runeTier: t.tier });', 'ammoPerShot: 1, family, runeTier: t.tier === 5 ? 6 : t.tier });']] },
  { name: 'an active ability names a rune no bag can hold', case: 'rows-validate',
    edits: [['src/data/abilities.js', "rune: 'chalked_rupture_rune', target: 'enemy',", "rune: 'life_rune', target: 'enemy',"]] },
  { name: 'the bar fires its last usable ability', case: 'first-usable-in-order',
    edits: [['src/core/hunt/abilities.js', "  const rows = slotsFor(h, 'ability').filter(", "  const rows = slotsFor(h, 'ability').reverse().filter("]] },
  { name: 'a cast does not lock its lane', case: 'lane-blocks-second-cast',
    edits: [['src/core/hunt/abilities.js', "  if (readyAt(hero.lanes, row.lane) > atMs) return 'lane';", '']] },
  { name: 'a cast does not set its cooldown', case: 'cd-set',
    edits: [['src/core/hunt/abilities.js', "  if (readyAt(hero.cds, row.id) > atMs || clockOf(hero, row, atMs) === null) return 'cooldown';", '']] },
  { name: 'mana is not checked', case: 'no-mana-no-cast',
    edits: [['src/core/hunt/abilities.js', "  if (int(hero.mana) < row.mana) return 'mana';", ''], ['src/core/hunt/abilities.js', "    if (int(hero.mana) < mana) return { why: 'mana' };", '']] },
  { name: 'a rune is never taken from the bag', case: 'rune-own-then-store',
    edits: [['src/core/hunt/abilities.js', '  for (const l of pick.lines) if (!takeLine(h.hs, l, sc.atMs)) { h.hs.goldOut = true; return false; }', '']] },
  { name: 'the action set skips nothing', case: 'action-set-skips',
    edits: [['src/core/hunt/abilities.js', "  if ((skip.rune && row.rune) || (skip.area && AREA_TARGETS.includes(row.target))) return 'action_set';", '']] },
  { name: 'a mana basic swings on an empty pool', case: 'basic-costs',
    edits: [['src/core/hunt/abilities.js', '    if (int(hero.mana) < c.mana) return false;', '']] },
  { name: 'a multi-shot ability may fire short', case: 'ammo-per-shot',
    edits: [['src/core/hunt/abilities.js', "      if (!shot) return { why: 'no_ammo' };", '      if (!shot) return { lines };']] },
  { name: 'a shot ability reads only the worn ammo (Andy 10-23: Precision Shot never cast)', case: 'shot-ability-looses-the-bar-arrows',
    edits: [['src/core/hunt/abilities.js', "    const id = slot.action.id === 'loaded' ? h.ammo : slot.action.id;", '    const id = h.ammo;']] },
  { name: 'a shot ability looses a whetstone from the bar', case: 'shot-ability-looses-the-bar-arrows',
    edits: [['src/core/hunt/abilities.js', '    if (!id || !shootsItem(hero.role, itemRow(h, id))) return null;', '    if (!id) return null;'],
      /* the bar's own door (conditions.js attackItem, Andy a41) opened too: two doors keep a whetstone from a bow */
      ['src/core/hunt/conditions.js', 'SHOOTERS.some((r) => shootsItem(r, ITEMS[id]))', "!!ITEMS[id] && ITEMS[id].reqSkill !== 'magic'"]] },
  { name: 'a heal is not capped at the missing HP', case: 'heal-capped',
    edits: [['src/core/hunt/heal-rules.js', '    const got = Math.max(0, Math.min(cut, missing));', '    const got = Math.max(0, cut);']] },
  { name: 'Challenge pulls nothing', case: 'taunt-pulls-back',
    edits: [['src/core/hunt/abilities.js', "    case 'taunt': challengeFrom(inst, sc, u); break;", "    case 'taunt': break;"]] },
  { name: 'fractional mana is dropped every sub-step', case: 'mana-regen',
    edits: [['src/core/hunt/abilities.js', '  u.manaMilli -= whole * 1000;', '  u.manaMilli = 0;']] },
  { name: '[area-engine] a line strikes only its aim', case: 'hero-area-shapes',
    edits: [['src/core/hunt/abilities.js', "      const s = place(areaSpec(row), u, t);\n      const hit = engaged(inst, u).filter((o) => covers(s, o.x, o.y))", "      const s = place(areaSpec(row), u, t);\n      const hit = engaged(inst, u).filter((o) => o === t)"]] },
  { name: '[area-engine] a ring past its maxHits', case: 'hero-area-shapes',
    edits: [['src/core/hunt/abilities.js', '      for (const m of Number.isInteger(row.maxHits) ? hit.slice(0, row.maxHits) : hit) {', '      for (const m of hit) {']] },
  { name: '[area-engine] a hitPm row rolls nothing of the blow', case: 'hero-area-shapes',
    edits: [['src/data/abilities.js', '  return [Math.max(1, Math.ceil((top * ABILITY_RULES.hitLowPm) / 1000)), top];', '  return [1, 1];']] },
  { name: '[area-engine] an ability casts before its unlock', case: 'hero-area-shapes',
    edits: [['src/core/hunt/abilities.js', "    if (row.unlock && h.skills && skillLevel(h, row) < row.unlock) return { why: 'level' };\n", '']] },
  { name: "[area-engine] a row's trigger is ignored", case: 'hero-area-shapes',
    edits: [['src/data/abilities.js', '  if (Array.isArray(row.trigger)) return row.trigger.map((c) => Object.assign({}, c));\n', '']] },
  { name: '[area-engine] the boss set casts a line', case: 'hero-area-shapes',
    edits: [['src/data/abilities.js', "export const AREA_TARGETS = Object.freeze(['area', 'line', 'ring']);", "export const AREA_TARGETS = Object.freeze(['area']);"]] },
  { name: '[area-engine] a line counts like a 3x3', case: 'hero-area-shapes',
    edits: [['src/core/hunt/conditions.js', "  return row && (row.target === 'line' || row.target === 'ring') ? row : null;", '  return null;']] },
  { name: '[area-client] a line strikes nothing in words', case: 'configure-words', also: ['src'],
    edits: [['src/shell/action-facts.js', "  if (spec && spec.shape === 'line') return t('bar.target_line', { len: spec.len });\n", '']] },
  { name: '[area-client] a ring reads the line\'s words', case: 'configure-words', also: ['src'],
    edits: [['src/shell/action-facts.js', "(r.maxHits ? '_max' : '')", "''"]] },
  { name: '[area-client] a hitPm row says nothing of its damage', case: 'configure-words', also: ['src'],
    edits: [['src/shell/action-facts.js', '    if (landsBlow(r)) numbers.push(blowShareLine(r, k.pm));\n', '']] },
  { name: '[area-client] the share reads its top only', case: 'configure-words', also: ['src'],
    edits: [['src/shell/action-facts.js', 'const hi = sharePct(r.hitPm, pm), lo = Math.round((hi * ABILITY_RULES.hitLowPm) / 1000);', 'const hi = sharePct(r.hitPm, pm), lo = hi;']] },
  { name: '[area-client] no unlock wording', case: 'configure-words', also: ['src'],
    edits: [['src/shell/action-facts.js', 'effect, unlock: unlockLine(r),', 'effect, unlock: null,']] },
  { name: '[area-client] a slot under its unlock reads ready', case: 'configure-words', also: ['src'],
    edits: [['src/shell/action-facts.js', "    if (have !== null && have < r.unlock) return { code: 'unlock',", "    if (false) return { code: 'unlock',"]] },
  { name: '[area-client] a shot spell reads mana only', case: 'configure-words', also: ['src'],
    edits: [['src/shell/cast-facts.js', "k.row.ammo ? [t('bar.cost_ammo', { ammo: k.row.ammo })] : []", '[]']] },
  { name: '[area-client] Chill says nothing of what it does', case: 'configure-words', also: ['src'],
    edits: [['src/shell/action-facts.js', "const does = st.slowPm ? ['_slow', slowAt(st, slowScaleAt(st, tier))]", "const does = false ? ['_slow', slowAt(st, slowScaleAt(st, tier))]"]] },
  { name: '[area-client] a new pick keeps the last pick’s rule', case: 'configure-words', also: ['src'],
    edits: [['src/shell/bar-draft.js', "  return !conds || !conds.length || untouched ? startConditions(next) : conds;", '  return !conds || !conds.length ? startConditions(next) : conds;']] },
  { name: '[area-client] a picked count starts below 0', case: 'configure-words', also: ['src'],
    edits: [['src/shell/bar-draft.js', "  const any = m.value === 'count' && m.ops.includes('gte');", '  const any = false;']] },
  { name: '[turning cut] a sword alone\'s again (Tyler 2026-11-16: every melee weapon without a shield)', case: 'turning-cut-every-shieldless-melee',
    edits: [['src/data/abilities.js', "disciplines: ['sword', 'dual_axe', 'club'], lane: 'offense', cdMs: 8000, mana: 8, unlock: 10,", "disciplines: ['sword'], lane: 'offense', cdMs: 8000, mana: 8, unlock: 10,"]] },
  { name: '[turning cut] the tank\'s too', case: 'turning-cut-every-shieldless-melee',
    edits: [['src/data/abilities.js', "disciplines: ['sword', 'dual_axe', 'club'], lane: 'offense', cdMs: 8000, mana: 8, unlock: 10,", "disciplines: ['shield', 'sword', 'dual_axe', 'club'], lane: 'offense', cdMs: 8000, mana: 8, unlock: 10,"]] },
  { name: '[turning cut] a move names its first discipline\'s weapons alone', case: 'turning-cut-every-shieldless-melee', also: ['src'],
    edits: [['src/shell/action-facts.js', '  const ds = r.disciplines;\n', '  const ds = r.disciplines.slice(0, 1);\n']] },
  /* THE TANK RUNE SPELLS (board 2026-11-19 section 6) */
  { name: '[tank runes] a party row with no heal passes validate', case: 'rows-validate',
    edits: [['src/data/abilities.js', "if (r.target === 'party' && !heals(r) && !shells(r)) bad(", "if (false) bad("]] },
  { name: '[tank runes] a shape with nothing to land passes validate', case: 'rows-validate',
    edits: [['src/data/abilities.js', "&& !(AREA_TARGETS.includes(r.target) && r.status)) {", "&& false) {"]] },
  { name: '[tank runes] alone and party only together pass validate', case: 'rows-validate',
    edits: [['src/data/abilities.js', "if (r.party !== undefined && r.alone === true) bad(", "if (false) bad("]] },
  { name: '[tank runes] a party shield heals instead', case: 'party-shield-shells-the-party',
    edits: [['src/core/hunt/abilities.js', "        if (heals(row)) { healOne(u, a, amount().heal, sc, sg, row, piped, cast); continue; }\n", "        if (true) { healOne(u, a, amount().heal || 1, sc, sg); continue; }\n"]] },
  { name: '[tank runes] a party shield lowers a bigger shell', case: 'party-shield-shells-the-party',
    edits: [['src/core/hunt/shields.js', "  if (!t || t.alive !== true || !(n > int(t.shield))) return false;\n", "  if (!t || t.alive !== true) return false;\n"]] },
  { name: '[tank runes] a party shield reaches the whole map', case: 'party-shield-shells-the-party',
    edits: [['src/core/hunt/abilities.js', "        if (!(a === u || dist2(a, u) <= row.radius * row.radius)) continue;\n", '']] },
  { name: '[tank runes] a party shield casts over a shelled party', case: 'party-shield-shells-the-party',
    edits: [['src/core/hunt/abilities.js', "pct(a) < 100 && !(int(a.shield) > 0) && (a === hero || dist2(a, hero) <= r2)", "pct(a) < 100"]] },
  { name: '[tank runes] the refund reads any standing shell (the board\'s section 6 bug)', case: 'party-shield-shells-the-party',
    edits: [['src/core/hunt/abilities.js', "  if (!u || u.shieldBy !== u.id) return 0;\n", '']] },
  { name: '[tank runes] a shell does not say who cast it', case: 'party-shield-shells-the-party',
    edits: [['src/core/hunt/shields.js', "  t.shieldBy = by ? by.id : null;\n", '']] },
  { name: '[tank runes] a status-only ring strikes a blow', case: 'frost-slam-chills-without-a-blow',
    edits: [['src/core/hunt/abilities.js', "        if (!blows) { afflict(m); continue; }\n", "        if (!blows) { landHit(inst, sc, u, m, 1, el, hitTag, sg); afflict(m); continue; }\n"]] },
  { name: '[tank runes] Chill ignores the rune tier', case: 'frost-slam-chills-without-a-blow',
    edits: [['src/core/hunt/status.js', "  if (!ticks(row)) return row.tierPermille[tier - 1];\n", "  if (!ticks(row)) return 1000;\n"]] },
  { name: '[tank runes] a slow reads its row, not its stack', case: 'frost-slam-chills-without-a-blow',
    edits: [['src/core/hunt/status-effects.js', '  slowPm: (u, row, st) => slowAt(row, st.scale),', '  slowPm: (u, row) => row.slowPm,']] },
  { name: '[tank runes] a stronger chill keeps the weaker stack', case: 'frost-slam-chills-without-a-blow',
    edits: [['src/core/hunt/status.js', "    if (!ticks(row)) for (const st of list) if (st.s === row.id && scale > st.scale) st.scale = scale;\n", '']] },
  { name: '[tank runes] the store\'s chill is cut by its share', case: 'frost-slam-chills-without-a-blow',
    edits: [['src/core/hunt/abilities.js', "runeTier: (v && v.version) || 1 }", "runeTier: v && v.pm < 1000 ? 1 : (v && v.version) || 1 }"]] },
  { name: '[tank runes] the slot fires alone (Tyler 2026-11-19: party only)', case: 'party-only-waits-alone',
    edits: [['src/core/hunt/abilities.js', "    && (!solo || !partyOnly(ABILITIES[r.slot.action.id], hero.role))\n", '']] },
  { name: '[tank runes] Frost Slam is no longer party only', case: 'party-only-waits-alone',
    edits: [['src/data/abilities.js', "n: 'Frost Slam', disciplines: ['shield'], party: true,", "n: 'Frost Slam', disciplines: ['shield'],"]] },
  { name: '[tank runes] the bar never greys a party spell alone', case: 'tank-rune-words', also: ['src'],
    edits: [['src/shell/action-facts.js', "  return r && partyOnly(r, role) && alone === true ?", "  return false ?"]] },
  { name: '[tank runes] the card forgets Party only', case: 'tank-rune-words', also: ['src'],
    edits: [['src/shell/action-facts.js', "alone: r.alone ? t('bar.alone') : partyOnly(r, ctx && ctx.set ? ctx.set.role : null) ? t('bar.party_only') : null };", "alone: r.alone ? t('bar.alone') : null };"]] },
  { name: '[tank runes] the chill line reads version I whatever the rune', case: 'tank-rune-words', also: ['src'],
    edits: [['src/shell/action-facts.js', "[statusLine(STATUSES[r.status], k.version)]", "[statusLine(STATUSES[r.status], 1)]"]] },
  { name: '[tank runes] a party shield reads as a party heal', case: 'tank-rune-words', also: ['src'],
    edits: [['src/shell/action-facts.js', "  if (r.target === 'party' && shells(r)) return t('bar.target_party_shield');\n", '']] },
  { name: 'the lanes are not persisted', case: 'clocks-survive-a-cut',
    edits: [['src/core/hunt/abilities.js', "['regenPm', 'int'], ['lanes', 'json'], ['cds', 'json'],", "['regenPm', 'int'], ['cds', 'json'],"]] },
];

await suiteH4('hunt-core/abilities', cases, mutants);
