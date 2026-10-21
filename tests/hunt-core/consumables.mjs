// tests/hunt-core/consumables.mjs — src/core/hunt/consumables.js + src/data/consumables.js
// (spec §3.4; parity CO-01..CO-08; the one resolver src/core/action-rules.js resolveLine). Run by run-all.mjs.
import { suiteH4, oneHero, steps, supplySession, STORE_FOOD } from './fixtures/h4.js';
import { spanFixture, runSpan, member, T0 } from './fixtures/h1.js';

const consume = (M) => (inst, sc) => M.consumables.consume(inst, sc);
const eats = (sc) => sc.events.filter((e) => e.type === 'eat');
const drinks = (sc) => sc.events.filter((e) => e.type === 'drink');

const cases = {
  /* CO-04: every row restores exactly one pool — food HP, drink mana; no potion kind exists. */
  'rows-validate': (M) => {
    const bad = M.CD.validate();
    if (bad.length) return bad.join('; ');
    const rows = Object.values(M.CD.CONSUMABLES);
    if (!rows.some((r) => r.kind === 'food' && r.source === 'own') || !rows.some((r) => r.kind === 'drink' && r.source === 'store')) return 'the table lost a kind or a source';
    return JSON.stringify(Object.keys(M.CD.CONSUMABLE_KINDS)) === '["food","drink"]' ? null : 'a kind other than food and drink exists';
  },
  'food-hp-drink-mana': (M) => {
    const { h, inst, sc } = oneHero(M, { hp: 40, mana: 100 }, { hs: supplySession(M, { bag: { cooked_trout: { loaded: 3 } } }) });
    M.consumables.consume(inst, sc);
    if (eats(sc).length !== 1 || h.hp <= 40 || h.mana !== 100) return 'food did not raise HP alone (hp ' + h.hp + ', mana ' + h.mana + ')';
    const b = oneHero(M, { hp: 100, mana: 10 });
    M.consumables.consume(b.inst, b.sc);
    if (drinks(b.sc).length !== 1 || b.h.mana <= 10 || b.h.hp !== 100) return 'drink did not raise mana alone (hp ' + b.h.hp + ', mana ' + b.h.mana + ')';
    return null;
  },
  /* CO-05 / CO-01: half at once, the other half over 6 s in 1 s ticks, exactly the amount. */
  'half-now-half-over-6s': (M) => {
    const { h, inst, sc } = oneHero(M, { hp: 40, maxHp: 210 }, { hs: supplySession(M, { bag: { cooked_trout: { loaded: 1 } } }) });
    const heals = M.ITEMS.cooked_trout.heals;
    const now = Math.floor(heals / 2);
    M.consumables.consume(inst, sc);
    if (h.hp !== 40 + now) return 'instant half: hp ' + h.hp + ', want ' + (40 + now);
    steps(inst, sc, consume(M), 70, 100);
    if (h.hp !== 40 + heals) return 'after 6 s the trout restored ' + (h.hp - 40) + ' of ' + heals;
    if (h.otHp !== null) return 'the over-time half is still ticking after 6 s';
    /* At 5.9 s one tick is still to come. */
    const b = oneHero(M, { hp: 40, maxHp: 210 }, { hs: supplySession(M, { bag: { cooked_trout: { loaded: 1 } } }) });
    M.consumables.consume(b.inst, b.sc);
    steps(b.inst, b.sc, consume(M), 59, 100);
    return b.h.hp < 40 + heals ? null : 'the whole trout landed before 6 s';
  },
  /* CO-07 / §3.4 #5-6: own stack first and free; then the store, at store price. */
  'own-first-then-store': (M) => {
    const hs = supplySession(M, { bag: { cooked_shrimp: { loaded: 1 } }, purse: 1000 });
    const { h, inst, sc } = oneHero(M, { hp: 10 }, { hs });
    M.consumables.consume(inst, sc);
    const first = eats(sc)[0];
    if (!first || first.source !== 'own' || first.gold !== 0 || first.item !== 'cooked_shrimp' || hs.purse !== 1000) return 'the own stack was not eaten first, free: ' + JSON.stringify(first);
    h.otHp = null; h.hp = 10;
    sc.atMs = 5000;
    M.consumables.consume(inst, sc);
    const second = eats(sc)[1];
    if (!second || second.source !== 'store' || second.gold !== 15 || second.item !== STORE_FOOD) return 'an empty own stack did not fall to the store: ' + JSON.stringify(second);
    if (hs.purse !== 1000 - 15 || hs.tally.bought[STORE_FOOD] !== 1 || hs.tally.supplies.cooked_shrimp !== 1) return 'the ledger split is wrong: purse ' + hs.purse + ' ' + JSON.stringify(hs.tally);
    return null;
  },
  /* THE CONFIGURED STORE SLOT (Configure action, lane b-condition-builder): a player's slot "Any food IF
     My HP % at or below 80" eats the own stack first, free; once it is gone the SAME slot, under the SAME
     condition, buys the tier's store food at the server catalogue's price; above 80% nothing fires at all. */
  'configured-store-slot': (M) => {
    const hs = supplySession(M, { bag: { cooked_shrimp: { loaded: 1 } }, purse: 1000 });
    const slots = M.conditions.heroSlots([{ action: { type: 'consume', id: 'food' }, conditions: [{ metric: 'self_hp_pct', op: 'lte', value: 80 }], join: 'and' }], null);
    const { h, inst, sc } = oneHero(M, { hp: 85 }, { hs, slots });
    M.consumables.consume(inst, sc);
    if (eats(sc).length) return 'the slot fired above its condition (85% HP, condition at or below 80%)';
    h.hp = 75;
    M.consumables.consume(inst, sc);
    const first = eats(sc)[0];
    if (!first || first.source !== 'own' || first.item !== 'cooked_shrimp' || hs.purse !== 1000) return 'the own stack was not eaten first, free, at 75% HP: ' + JSON.stringify(first);
    h.otHp = null; h.hp = 75;
    sc.atMs = 5000;
    M.consumables.consume(inst, sc);
    const second = eats(sc)[1];
    const price = hs.basics[STORE_FOOD].price;
    if (!second || second.source !== 'store' || second.item !== STORE_FOOD || second.gold !== price) return 'out of own stock, the slot did not buy the store food at its price: ' + JSON.stringify(second);
    if (hs.purse !== 1000 - price || hs.tally.bought[STORE_FOOD] !== 1) return 'the purse or the tally is wrong: purse ' + hs.purse + ' ' + JSON.stringify(hs.tally);
    return null;
  },
  /* SLOT 1 FIRST (Tyler 10-18): two slots whose conditions both pass and that both can act — the
     earlier slot fires and the later one does not; swap their places and the other one fires. */
  'slot-one-first': (M) => {
    const run = (order) => {
      const hs = supplySession(M, { bag: { cooked_shrimp: { loaded: 3 }, cooked_trout: { loaded: 3 } }, purse: 0 });
      const slots = M.conditions.heroSlots(order.map((id) => ({ action: { type: 'consume', id }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 90 }], join: 'and' })), null);
      const { inst, sc } = oneHero(M, { hp: 50 }, { hs, slots });
      M.consumables.consume(inst, sc);
      return eats(sc).map((e) => e.item);
    };
    const a = run(['cooked_shrimp', 'cooked_trout']), b = run(['cooked_trout', 'cooked_shrimp']);
    if (a.join() !== 'cooked_shrimp') return 'with shrimp in slot 1 the hero ate ' + JSON.stringify(a);
    return b.join() === 'cooked_trout' ? null : 'with trout in slot 1 the hero ate ' + JSON.stringify(b);
  },
  /* §3.4 #7: a hunt never stops for lack of stock; only gold ends it (gold_out). */
  'never-stops-when-out': (M) => {
    const hs = supplySession(M, { bag: { cooked_shrimp: { loaded: 1, essential: true } }, purse: 100 });
    const { h, inst, sc } = oneHero(M, { hp: 10 }, { hs });
    for (let t = 0; t < 60000; t += 100) {
      sc.atMs = t;
      if (t % 1000 === 0) h.hp = Math.min(h.hp, 10);
      M.consumables.consume(inst, sc);
    }
    if (M.AR.endReasonAt(hs, 60000) === 'heals_out') return 'the empty own stack ended the hunt heals_out';
    const store = eats(sc).filter((e) => e.source === 'store').length;
    if (store !== Math.floor(100 / 15)) return store + ' store meals on 100 gold at 15, want ' + Math.floor(100 / 15);
    if (M.AR.endReasonAt(hs, 60000) !== 'gold_out') return 'an empty purse did not end the hunt gold_out (' + M.AR.endReasonAt(hs, 60000) + ')';
    return null;
  },
  /* CO-06 (Tyler 2026-10-19): food and drink share ONE 2 s cooldown; nothing else fires inside it, and under
     both thresholds the default bar eats first (eat-at stands before drink-at). */
  'one-shared-lane': (M) => {
    const lane = M.CD.CONSUMABLE_RULES.laneMs;
    if (lane !== 2000) return 'the shared food-and-drink cooldown is ' + lane + ' ms, Tyler ruled 2 s';
    const { h, inst, sc } = oneHero(M, { hp: 10, mana: 5 }, { hs: supplySession(M, { bag: { cooked_shrimp: { loaded: 5 } } }) });
    steps(inst, sc, consume(M), lane / 100, 0);
    const uses = sc.events.filter((e) => e.type === 'eat' || e.type === 'drink');
    if (uses.length !== 1) return uses.length + ' uses inside one ' + lane + ' ms cooldown';
    if (uses[0].type !== 'eat') return 'under both thresholds the hero ' + uses[0].type + ' first; the default bar eats first';
    sc.atMs = lane;
    M.consumables.consume(inst, sc);
    const after = sc.events.filter((e) => e.type === 'eat' || e.type === 'drink');
    return after.length === 2 && h.laneAt === 2 * lane ? null : 'the shared cooldown did not reopen at ' + lane + ' ms (' + after.length + ' uses)';
  },
  /* NO STARVING (Tyler 2026-10-19): drinks always fire too, yet a hero below eat-at AND drink-at on the default
     bar, with plenty of both, eats at least once every 2 s cooldown for 20 s; above eat-at it drinks, and a
     drink fires while its own over-time half still runs (replacing it). */
  'drink-never-starves-food': (M) => {
    const lane = M.CD.CONSUMABLE_RULES.laneMs;
    const { h, inst, sc } = oneHero(M, { hp: 10, maxHp: 10000, mana: 5, maxMana: 10000 }, { hs: supplySession(M, { purse: 1e6 }) });
    for (let t = 0; t < 20000; t += 100) { sc.atMs = t; M.consumables.consume(inst, sc); }
    const e = eats(sc).map((x) => x.atMs);
    if (e.length < 20000 / lane) return 'a hungry, thirsty hero ate ' + e.length + ' times in 20 s (want one every ' + lane + ' ms)';
    if (e.some((at, i) => i && at - e[i - 1] > lane)) return 'a gap between meals passed one cooldown: ' + JSON.stringify(e);
    const b = oneHero(M, { hp: 100, mana: 5, maxMana: 10000 }, { hs: supplySession(M, { purse: 1e6 }) });
    for (let t = 0; t <= lane; t += 100) { b.sc.atMs = t; M.consumables.consume(b.inst, b.sc); }
    const d = drinks(b.sc);
    if (d.length !== 2 || d[1].atMs !== lane) return 'a thirsty hero drank at ' + JSON.stringify(d.map((x) => x.atMs)) + '; the second drink must fire at ' + lane + ' while the first still ticks';
    return Array.isArray(b.h.otMana) && b.h.otMana[2] === 6 ? null : 'the second drink did not replace the over-time half: ' + JSON.stringify(b.h.otMana);
  },
  /* §3.4 #4, spec §5 #10: default thresholds drink < 30%, food < 50%; per-hero settings override. */
  'thresholds': (M) => {
    const R = M.CD.CONSUMABLE_RULES;
    if (R.drinkBelowPct !== 30 || R.foodBelowPct !== 50) return 'defaults are ' + R.drinkBelowPct + '/' + R.foodBelowPct + ', the spec says 30/50';
    const at = (hp, ctx) => { const x = oneHero(M, { hp, mana: 100 }, ctx); M.consumables.consume(x.inst, x.sc); return eats(x.sc).length; };
    if (at(50) !== 0 || at(49) !== 1) return 'food fires at 50% HP or not under it';
    if (at(60, { foodBelowPct: 61 }) !== 1 || at(40, { foodBelowPct: 39 }) !== 0) return 'the per-hero food threshold is ignored';
    const dr = (mana) => { const x = oneHero(M, { mana }); M.consumables.consume(x.inst, x.sc); return drinks(x.sc).length; };
    return dr(30) === 0 && dr(29) === 1 ? null : 'drink fires at 30% mana or not under it';
  },
  /* CO-03 (rev. 2026-10-19, ALWAYS FIRES): an ability heal that just landed does not hold food back. */
  'eat-right-after-a-heal': (M) => {
    const { h, inst, sc } = oneHero(M, { hp: 10 });
    h.healedAt = 0;
    sc.atMs = 100;
    M.consumables.consume(inst, sc);
    return eats(sc).length === 1 ? null : 'the hero did not eat 100 ms after an ability heal';
  },
  /* P0 2026-10-19 (prod: every hunt since the core rebuild ate food, store and own, and healed.total read 0):
     the analyzer's healed total is the HP food restored — half at once, half over 6 s, the catalogue amount. */
  'tally-healed-is-hp-restored': (M) => {
    const run = (bag, basicsHeals) => {
      /* Own: a purse of 0, so the one trout is all there is; store: 40 of 150 HP, so one meal lifts it past eat-at. */
      const hs = supplySession(M, { bag, purse: basicsHeals === undefined ? 0 : 1000 });
      if (basicsHeals !== undefined) hs.basics[STORE_FOOD] = Object.assign({}, hs.basics[STORE_FOOD], { heals: basicsHeals });
      const x = oneHero(M, { hp: 40, maxHp: basicsHeals === undefined ? 400 : 150 }, { hs });
      steps(x.inst, x.sc, consume(M), 1, 0);
      const instant = x.h.hp - 40;
      steps(x.inst, x.sc, consume(M), 69, 100);
      const t = M.tally.tallyEvents(x.sc.events, M.tally.rosterOf(x.w)).heroes[1];
      return { instant, restored: x.h.hp - 40, healed: t ? t.healed : null, eats: eats(x.sc) };
    };
    const heals = M.ITEMS.cooked_trout.heals;
    const own = run({ cooked_trout: { loaded: 1 } });
    if (own.eats.length !== 1) return 'the trout was eaten ' + own.eats.length + ' times (one in the bag, no gold)';
    if (own.instant !== Math.floor(heals / 2)) return 'the instant half raised HP ' + own.instant + ', want ' + Math.floor(heals / 2);
    if (own.restored !== heals) return 'over 7 s the trout restored ' + own.restored + ' of ' + heals;
    if (!own.healed || own.healed.total !== heals || own.healed.bySource.cooked_trout !== heals) return 'tally.healed ' + JSON.stringify(own.healed) + ' is not the ' + heals + ' HP the trout restored';
    /* A store row heals by the SERVER's catalogue amount (hs.basics), and the tally says so. */
    const store = run({}, 72);
    if (store.eats.length !== 1 || store.eats[0].source !== 'store') return 'the store food was not bought: ' + JSON.stringify(store.eats);
    if (store.restored !== 72 || !store.healed || store.healed.total !== 72 || store.healed.bySource[STORE_FOOD] !== 72) return 'store food restored ' + store.restored + ', tally ' + JSON.stringify(store.healed) + ', want 72 and 72';
    return null;
  },
  /* ALWAYS FIRES (Coordinator 2026-10-19): a second food while the first's over-time half runs fires as soon as
     the lane reopens; its instant half lands and its over-time half REPLACES the running one (no stacking).
     A purse of 0: the two trout are all there is (with gold, store food would replace the second's half in turn). */
  'food-during-over-time': (M) => {
    const { h, w, inst, sc } = oneHero(M, { hp: 40, maxHp: 1000 }, { hs: supplySession(M, { bag: { cooked_trout: { loaded: 2 } }, purse: 0 }) });
    const heals = M.ITEMS.cooked_trout.heals; const half = Math.floor(heals / 2);
    const lane = M.CD.CONSUMABLE_RULES.laneMs;
    M.consumables.consume(inst, sc);
    sc.atMs = lane - 100;
    M.consumables.consume(inst, sc);
    if (eats(sc).length !== 1) return 'a second food fired inside the shared lane';
    const before = h.hp;
    /* The first trout's ticks that landed by the reopen (one a second, the first at 1 s). */
    const later = heals - half; const n = 6; const landedTicks = lane / M.CD.CONSUMABLE_RULES.overTimeTickMs;
    const firstTicks = Array.from({ length: landedTicks }, (_, i) => Math.floor((later - Math.floor(later / n) * i) / (n - i))).reduce((a, b) => a + b, 0);
    const tickedBefore = before - 40 - half;
    sc.atMs = lane;
    M.consumables.consume(inst, sc);
    if (eats(sc).length !== 2) return 'the second food did not fire while the first over-time half ran (' + eats(sc).length + ' eaten)';
    if (h.hp !== 40 + half + firstTicks + half) return 'at the reopen HP went ' + before + ' -> ' + h.hp + ', want the first trout\'s ' + landedTicks + ' ticks (' + firstTicks + ', ' + tickedBefore + ' before) and the instant ' + half;
    if (!Array.isArray(h.otHp) || h.otHp[0] !== heals - half || h.otHp[2] !== 6) return 'the second over-time half did not replace the first: ' + JSON.stringify(h.otHp);
    steps(inst, sc, consume(M), 80, lane + 100);
    const want = 40 + half + firstTicks + heals;
    if (h.hp !== want) return 'after both trout HP is ' + h.hp + ', want ' + want + ' (the first over-time half is replaced, never stacked)';
    const t = M.tally.tallyEvents(sc.events, M.tally.rosterOf(w)).heroes[1];
    return t && t.healed.total === h.hp - 40 ? null : 'tally.healed ' + JSON.stringify(t && t.healed) + ' is not the ' + (h.hp - 40) + ' HP restored';
  },
  /* BOTH PATHS (CLAUDE.md §4, AWAY-1): a solo hunt span that starts hurt eats its own shrimp, and the analyzer
     credits the HP food restored ATTENDED (cut into 2 s windows, the world decoded at every cut) and AWAY (one
     window, ctx.away) alike: more than 0, from the food eaten, at least every instant half that landed and at
     most what the meals hold, and the same number both ways. */
  'span-healed-attended-and-away': (M) => {
    const run = (away) => {
      const fx = spanFixture(M, 11, { spanMs: 60000, members: [member(M, 'a', { unitId: 1, hp: 30, maxHp: 300 })] });
      fx.inst.world.units.find((u) => u.side === 'hero').hp = 30;
      if (away) fx.ctx.away = true;
      const out = JSON.parse(runSpan(M, fx, away ? [] : Array.from({ length: 29 }, (_, i) => T0 + (i + 1) * 2000)));
      const meals = out.events.filter((e) => e.type === 'eat' && e.u === 1);
      const t = M.tally.tallyEvents(out.events, { heroes: [1], kinds: {} }).heroes[1];
      return { meals, healed: t ? t.healed : null };
    };
    const a = run(false); const b = run(true);
    for (const [path, r] of [['attended', a], ['away', b]]) {
      if (!r.meals.length) return path + ': the hurt hero ate nothing';
      const lo = r.meals.reduce((n, e) => n + e.landed, 0); const hi = r.meals.reduce((n, e) => n + e.amount, 0);
      if (!r.healed || !(r.healed.total > 0)) return path + ': ' + r.meals.length + ' meals and tally.healed ' + JSON.stringify(r.healed);
      if (r.healed.total < lo || r.healed.total > hi) return path + ': tally.healed ' + r.healed.total + ' is outside [' + lo + ', ' + hi + '] (instant halves landed .. meals held)';
      if (Object.keys(r.healed.bySource).some((k) => !r.meals.some((e) => e.item === k))) return path + ': healed from a food never eaten ' + JSON.stringify(r.healed.bySource);
    }
    return JSON.stringify(a.healed) === JSON.stringify(b.healed) ? null : 'attended healed ' + JSON.stringify(a.healed) + ', away ' + JSON.stringify(b.healed);
  },
  /* Persisted: an over-time half survives a settle cut (encode/decode between sub-steps). */
  'over-time-survives-a-cut': (M) => {
    const run = (cut) => {
      const x = oneHero(M, { hp: 40, maxHp: 1000, mana: 10 }, { hs: supplySession(M, { bag: { cooked_trout: { loaded: 2 } } }) });
      let w = x.w;
      for (let t = 0; t < 8000; t += 100) {
        if (cut && t % 700 === 0) { w = M.worldstate.decode(JSON.parse(JSON.stringify(M.worldstate.encode(w)))); x.inst.world = w; }
        x.sc.atMs = t;
        M.consumables.consume(x.inst, x.sc);
      }
      return JSON.stringify([M.worldstate.encode(w), x.sc.events]);
    };
    return run(false) === run(true) ? null : 'a cut changed the hunt: an over-time field is not persisted';
  },
};

const mutants = [
  { name: 'a potion restores HP and mana', case: 'rows-validate',
    edits: [['src/data/consumables.js', "  drink: Object.freeze({ stat: 'mana', supply: 'mana' }),", "  drink: Object.freeze({ stat: 'mana', supply: 'mana' }),\n  potion: Object.freeze({ stat: 'hp', supply: 'heal' }),"]] },
  { name: 'a drink restores HP', case: 'food-hp-drink-mana',
    edits: [['src/data/consumables.js', "  drink: Object.freeze({ stat: 'mana', supply: 'mana' }),", "  drink: Object.freeze({ stat: 'hp', supply: 'mana' }),"]] },
  { name: 'the whole amount lands at once', case: 'half-now-half-over-6s',
    edits: [['src/data/consumables.js', '  instantPct: 50,', '  instantPct: 100,']] },
  { name: 'the over-time half is dropped', case: 'half-now-half-over-6s',
    edits: [['src/core/hunt/consumables.js', '      const landed = raise(u, stat, part);', '      const landed = raise(u, stat, 0);']] },
  { name: 'the store is tried before the own stack', case: 'own-first-then-store',
    edits: [['src/core/action-rules.js', "    if (own) return { id: own, source: 'own', price: 0 };", "    if (own && !(hs.shop && hs.shop[want])) return { id: own, source: 'own', price: 0 };"]] },
  { name: 'an empty stack stops eating (the store never takes over)', case: 'never-stops-when-out',
    edits: [['src/core/action-rules.js', "    if (!storeAllowed(hs, want)) return { why: 'store_off' };", "    if (hs) return { why: 'store_off' };"]] },
  { name: 'a store use the purse cannot pay ends nothing', case: 'never-stops-when-out',
    edits: [['src/core/hunt/consumables.js', "      if (w.why === 'gold_short') { if (w.kind === 'food') hero.hs.goldOut = true; return { why: 'gold_short' }; }", "      if (w.why === 'gold_short') return { why: 'gold_short' };"]] },
  { name: 'the last slot is tried first', case: 'slot-one-first',
    edits: [['src/core/hunt/conditions.js', '  for (const row of rows) {\n    const t = testSlot(inst, u, h, row.slot);', '  for (const row of rows.slice().reverse()) {\n    const t = testSlot(inst, u, h, row.slot);']] },
  { name: 'a store use is free', case: 'configured-store-slot',
    edits: [['src/core/action-rules.js', '    hs.purse = Math.max(0, int(hs.purse, 0)) - b.price;', '    hs.purse = Math.max(0, int(hs.purse, 0));']] },
  { name: 'the default bar drinks first (a drink starves food)', case: 'drink-never-starves-food',
    edits: [['src/core/hunt/conditions.js', "  Object.freeze({ id: 'd_food', action: Object.freeze({ type: 'consume', id: 'food' }), conditions: Object.freeze([]), join: 'and' }),\n  Object.freeze({ id: 'd_drink', action: Object.freeze({ type: 'consume', id: 'drink' }), conditions: Object.freeze([]), join: 'and' }),",
      "  Object.freeze({ id: 'd_drink', action: Object.freeze({ type: 'consume', id: 'drink' }), conditions: Object.freeze([]), join: 'and' }),\n  Object.freeze({ id: 'd_food', action: Object.freeze({ type: 'consume', id: 'food' }), conditions: Object.freeze([]), join: 'and' }),"]] },
  { name: 'a drink waits for its running over-time half', case: 'drink-never-starves-food',
    edits: [['src/core/hunt/consumables.js', "  const stat = CONSUMABLE_KINDS[kind].stat;\n  if (!CONSUME_KINDS[id])", "  const stat = CONSUMABLE_KINDS[kind].stat;\n  if (kind === 'drink' && u[OT_KEY[stat]]) return { kind, why: 'ticking' };\n  if (!CONSUME_KINDS[id])"]] },
  { name: 'the shared cooldown back at 1 s', case: 'one-shared-lane',
    edits: [['src/data/consumables.js', '  laneMs: 2000,', '  laneMs: 1000,']] },
  { name: 'food and drink each keep their own lane', case: 'one-shared-lane',
    edits: [['src/core/hunt/consumables.js', '    if (int(u.laneAt) > sc.atMs) continue;\n    const hero = heroes', '    const hero = heroes']] },
  { name: 'food eats at its threshold, not under it', case: 'thresholds',
    edits: [['src/core/hunt/conditions.js', "    case 'lt': return a < b;", "    case 'lt': return a <= b;"]] },
  { name: 'food restores HP but credits no heal (the prod P0: healed.total 0)', case: 'tally-healed-is-hp-restored',
    edits: [['src/core/hunt/consumables.js', "  if (landed > 0) sc.emit(makeEvent('heal'", "  if (landed < 0) sc.emit(makeEvent('heal'"]] },
  { name: 'span: food credits no heal, attended or away', case: 'span-healed-attended-and-away',
    edits: [['src/core/hunt/consumables.js', "  if (landed > 0) sc.emit(makeEvent('heal'", "  if (landed < 0) sc.emit(makeEvent('heal'"]] },
  { name: 'span: the instant half is not credited', case: 'span-healed-attended-and-away',
    edits: [['src/core/hunt/consumables.js', "  if (stat === 'hp') healed(u, landed, line.id, sc);\n  return true;", '  return true;']] },
  { name: 'a food heals 0', case: 'tally-healed-is-hp-restored',
    edits: [['src/core/hunt/consumables.js', '  const amount = lineAmount(hero.hs, line);', '  const amount = 0 * lineAmount(hero.hs, line);']] },
  { name: 'the over-time ticks are not credited', case: 'tally-healed-is-hp-restored',
    edits: [['src/core/hunt/consumables.js', "      if (stat === 'hp') healed(u, landed, item, sc);\n", '']] },
  { name: 'food waits for the running over-time half', case: 'food-during-over-time',
    edits: [['src/core/hunt/consumables.js', "  const stat = CONSUMABLE_KINDS[kind].stat;\n  if (!CONSUME_KINDS[id])", "  const stat = CONSUMABLE_KINDS[kind].stat;\n  if (kind === 'food' && u[OT_KEY[stat]]) return { kind, why: 'ticking' };\n  if (!CONSUME_KINDS[id])"]] },
  { name: 'a second over-time half stacks on the first', case: 'food-during-over-time',
    edits: [['src/core/hunt/consumables.js', '  u[OT_KEY[stat]] = later > 0 ? [later,', '  u[OT_KEY[stat]] = later > 0 ? [later + (Array.isArray(u[OT_KEY[stat]]) ? u[OT_KEY[stat]][0] : 0),']] },
  { name: 'food waits after an ability heal', case: 'eat-right-after-a-heal',
    edits: [['src/core/hunt/consumables.js', "  const stat = CONSUMABLE_KINDS[kind].stat;\n  if (!CONSUME_KINDS[id])", "  const stat = CONSUMABLE_KINDS[kind].stat;\n  if (kind === 'food' && Number.isInteger(u.healedAt)) return { kind, why: 'healed' };\n  if (!CONSUME_KINDS[id])"]] },
  { name: 'the over-time half is not persisted', case: 'over-time-survives-a-cut',
    edits: [['src/core/hunt/consumables.js', "  unit: Object.freeze([['laneAt', 'int'], ['otHp', 'json'], ['otMana', 'json'], ['healedAt', 'int?']]),",
      "  unit: Object.freeze([['laneAt', 'int'], ['otMana', 'json'], ['healedAt', 'int?']]),"]] },
];

await suiteH4('hunt-core/consumables', cases, mutants);
