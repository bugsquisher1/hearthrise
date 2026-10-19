// tests/hunt-core/consumables.mjs — src/core/hunt/consumables.js + src/data/consumables.js
// (spec §3.4; parity CO-01..CO-08; the one resolver src/core/action-rules.js resolveLine). Run by run-all.mjs.
import { suiteH4, oneHero, steps, supplySession, STORE_FOOD } from './fixtures/h4.js';

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
    const { h, inst, sc } = oneHero(M, { hp: 40 }, { hs: supplySession(M, { bag: { cooked_trout: { loaded: 1 } } }) });
    const heals = M.ITEMS.cooked_trout.heals;
    const now = Math.floor(heals / 2);
    M.consumables.consume(inst, sc);
    if (h.hp !== 40 + now) return 'instant half: hp ' + h.hp + ', want ' + (40 + now);
    steps(inst, sc, consume(M), 70, 100);
    if (h.hp !== 40 + heals) return 'after 6 s the trout restored ' + (h.hp - 40) + ' of ' + heals;
    if (h.otHp !== null) return 'the over-time half is still ticking after 6 s';
    /* At 5.9 s one tick is still to come. */
    const b = oneHero(M, { hp: 40 }, { hs: supplySession(M, { bag: { cooked_trout: { loaded: 1 } } }) });
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
  /* CO-06: food and drink share ONE lane; nothing else fires inside it. */
  'one-shared-lane': (M) => {
    const { h, inst, sc } = oneHero(M, { hp: 10, mana: 5 }, { hs: supplySession(M, { bag: { cooked_shrimp: { loaded: 5 } } }) });
    steps(inst, sc, consume(M), 10, 0);
    const uses = sc.events.filter((e) => e.type === 'eat' || e.type === 'drink');
    if (uses.length !== 1) return uses.length + ' uses inside one ' + M.CD.CONSUMABLE_RULES.laneMs + ' ms lane';
    if (uses[0].type !== 'drink') return 'under both thresholds the hero ' + uses[0].type + ' first; drink comes first';
    sc.atMs = M.CD.CONSUMABLE_RULES.laneMs;
    M.consumables.consume(inst, sc);
    const after = sc.events.filter((e) => e.type === 'eat' || e.type === 'drink');
    return after.length === 2 && after[1].type === 'eat' && h.laneAt === 2 * M.CD.CONSUMABLE_RULES.laneMs ? null : 'the lane did not reopen for food at ' + M.CD.CONSUMABLE_RULES.laneMs + ' ms';
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
  /* CO-03: food waits while a heal landed in the last 2 s. */
  'eat-no-heal-window': (M) => {
    const { h, inst, sc } = oneHero(M, { hp: 10 });
    M.consumables.markHealed(h, 0);
    sc.atMs = M.CD.CONSUMABLE_RULES.noHealWindowMs;
    M.consumables.consume(inst, sc);
    if (eats(sc).length) return 'the hero ate inside the no-heal window';
    sc.atMs += 100;
    M.consumables.consume(inst, sc);
    return eats(sc).length === 1 ? null : 'the hero did not eat once the window passed';
  },
  /* Persisted: an over-time half survives a settle cut (encode/decode between sub-steps). */
  'over-time-survives-a-cut': (M) => {
    const run = (cut) => {
      const x = oneHero(M, { hp: 40, mana: 10 }, { hs: supplySession(M, { bag: { cooked_trout: { loaded: 2 } } }) });
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
    edits: [['src/core/hunt/consumables.js', '      raise(u, stat, part);', '      raise(u, stat, 0);']] },
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
  { name: 'food and drink each keep their own lane', case: 'one-shared-lane',
    edits: [['src/core/hunt/consumables.js', '    if (int(u.laneAt) > sc.atMs) continue;\n    const hero = heroes', '    const hero = heroes']] },
  { name: 'food eats at its threshold, not under it', case: 'thresholds',
    edits: [['src/core/hunt/conditions.js', "    case 'lt': return a < b;", "    case 'lt': return a <= b;"]] },
  { name: 'the no-heal window is ignored', case: 'eat-no-heal-window',
    edits: [['src/core/hunt/consumables.js', "  if (kind === 'food' && u.healedAt !== null", "  if (false && u.healedAt !== null"]] },
  { name: 'the over-time half is not persisted', case: 'over-time-survives-a-cut',
    edits: [['src/core/hunt/consumables.js', "  unit: Object.freeze([['laneAt', 'int'], ['otHp', 'json'], ['otMana', 'json'], ['healedAt', 'int?']]),",
      "  unit: Object.freeze([['laneAt', 'int'], ['otMana', 'json'], ['healedAt', 'int?']]),"]] },
];

await suiteH4('hunt-core/consumables', cases, mutants);
