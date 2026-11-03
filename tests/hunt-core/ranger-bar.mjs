// tests/hunt-core/ranger-bar.mjs — FREMULON'S BAR, BROWSER CLOSED (Andy 2026-10-23: "the ranger abilities are not
// firing"). Run by run-all.mjs.
//
//   fremulon-hour   live v0.2.35, 43 min watched: a Level 46 Ranger (Shortbow, NO ammo worn) with an L41 sword
//                   tank in Mosslight Glade. His bar: Hunter's Mark, Flame Volley (store Fire Rune), Precision
//                   Shot, then attack slots Copper Whetstone, Barbed Arrows, Bronze Arrows, Iron Bolts, three Melee
//                   spells and three foods. The server's tally: 4,334 damage, all `basic`; 1,012 Copper Whetstones
//                   spent (a bow loosed them, one a shot, from slot 6); his 2,600 Bronze Arrows never touched.
//                   One hour of that exact setup on the real settle (play-ground.mjs: the hr-accrue accrueHunt the
//                   world tick runs, ten-minute windows, nobody watching): no whetstone is ever shot, his arrows are,
//                   and Precision Shot, Hunter's Mark and Flame Volley all cast on their lane.
//   client-words    the bar and Configure action say why such a slot never fires (the engine's rule, in words).
//   shot-spell-words a shot spell the engine never casts is struck on the bar with its reason (Andy #62, v0.2.34:
//                   Precision Shot and Flame Volley read ready and never fired): eleven Ranger setups on the real settle,
//                   the bar's reason (action-facts.js reasonOf) strikes Precision Shot exactly when the engine casts it 0 times.
//   under-skill     a slot's ammo the hero's skill can't use yet (Mithril Arrows, Ranged 45; a Ranged 42 hero was on them):
//                   carried, it is not shot; from the store, it is not bought; a shot spell passes it over; the next
//                   slot flies, the wait is said (rule_wait level), and at the level the same bar fires it, nothing pressed.
//
// The viewed half (the browser's engine predicts the same casts and shots, every commit matching):
// tests/hunt-live.mjs LV-RANGER, LV-SHOT-SKILL.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);

/* The live rows (production read, Coordinator 2026-10-23 ~19:35 UTC), as the server stored them. */
const atk = (id) => ({ action: { type: 'attack_with_item', id }, conditions: [], join: 'and' });
const ab = (id, store) => ({ action: { type: 'ability', id, ...(store ? { store } : {}) }, conditions: [], join: 'and' });
const eat = (id, below) => ({ action: { type: 'consume', id }, conditions: [{ op: 'lt', value: below, metric: 'self_hp_pct' }], join: 'and' });
const FREMULON = Object.freeze({
  equipment: { belt: 'bronze_belt', weapon: 'shortbow', cape: 'traveler_cape', ring1: 'copper_ring', gloves: 'leather_gloves', earrings: 'copper_studs',
    necklace: 'hunter_necklace', boots: 'boarhide_boots', body: 'leather_body', pants: 'studded_pants', helmet: 'leather_helmet', ring2: 'copper_ring' },
  bag: { bronze_arrows: { loaded: 2600 }, cooked_shrimp: { loaded: 25 }, copper_whetstone: { loaded: 2350 }, steel_whetstone: { loaded: 1340 } },
  bar: [ab('hunters_mark'), ab('flame_volley', 'plain_fire_rune'), ab('precision_shot'), null, null, atk('copper_whetstone'), atk('barbed_arrows'),
    atk('bronze_arrows'), null, atk('iron_bolts'), null, null, ab('cleave'), ab('power_strike'), ab('flame_strike', 'plain_fire_rune'),
    eat('salted_shark', 30), eat('salted_swordfish', 40), eat('salted_lobster', 50), null, null],
  options: { chase: true, stance: 'offensive', distance: 3, target_mode: 'follow' },
});
const HANK = Object.freeze({ equipment: { weapon: 'steel_sword', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' },
  bag: { cooked_shrimp: { loaded: 200 } }, bar: [ab('challenge'), ab('power_strike'), eat('salted_shrimp', 60)] });

/** One hour of Fremulon + Hank on `P` (a play runner): what the Ranger cast, shot, spent and dealt. */
function fremulonHour(P) {
  const casts = {}, shots = {}, dmg = {}, uses = {}, buys = {};
  let unit = null;
  const x = P.run('mosslight_glade', [46, 41], ['ranger', 'tank'], {
    spanMs: 3600000,
    equipment: (role) => JSON.parse(JSON.stringify((role === 'ranger' ? FREMULON : HANK).equipment)),
    bag: (role) => JSON.parse(JSON.stringify((role === 'ranger' ? FREMULON : HANK).bag)),
    bar: (role) => JSON.parse(JSON.stringify((role === 'ranger' ? FREMULON : HANK).bar)),
    options: (role) => (role === 'ranger' ? { ...FREMULON.options } : {}),
    onWindow: (out) => {
      const r = out.members.find((p) => p.key === 'ranger0');
      if (!r) return;
      if (Number.isInteger(r.hunt.unit_id)) unit = r.hunt.unit_id;
      for (const e of out.events || []) {
        if (e.u !== unit) continue;
        if (e.type === 'cast') casts[e.ability] = (casts[e.ability] || 0) + 1;
        if (e.type === 'shot') shots[e.item] = (shots[e.item] || 0) + 1;
        if (e.type === 'dmg') dmg[e.ability] = (dmg[e.ability] || 0) + e.amount;
      }
      for (const [id, n] of Object.entries(r.hunt.uses || {})) uses[id] = (uses[id] || 0) + n;
      for (const [id, n] of Object.entries(r.hunt.buys || {})) buys[id] = (buys[id] || 0) + n;
    },
  });
  return { x, casts, shots, dmg, uses, buys };
}

const ARROW = (id) => /_(arrows|bolts)$/.test(id);
function judge(r, quiet) {
  const shot = (pred) => Object.entries(r.shots).filter(([id]) => pred(id)).reduce((n, [, k]) => n + k, 0);
  const stones = Object.keys(r.uses).concat(Object.keys(r.shots)).filter((id) => /whetstone/.test(id));
  if (!quiet) {
    console.log('  fremulon-hour: Mosslight Glade, L46 Ranger + L41 sword tank, 1 h, browser closed: casts ' + JSON.stringify(r.casts)
      + '; shots ' + JSON.stringify(r.shots) + '; damage ' + JSON.stringify(r.dmg) + '; own spent ' + JSON.stringify(r.uses)
      + '; store ' + JSON.stringify(r.buys) + '; kills/h ' + r.x.kills + ', falls ' + r.x.falls);
  }
  if (r.x.falls || r.x.ended.length) return 'CONTROL: the hour did not run whole (' + r.x.ended.join(', ') + ', falls ' + r.x.falls + ')';
  if (!(r.x.kills >= 300)) return 'CONTROL: ' + r.x.kills + ' kills/h (no fight to measure)';
  if (stones.length) return 'a bow spent or shot a whetstone: own ' + JSON.stringify(r.uses) + ', shots ' + JSON.stringify(r.shots);
  if (shot(ARROW) < 300) return 'the Ranger shot ' + shot(ARROW) + ' arrows in an hour (want 300+)';
  for (const [id, min] of [['hunters_mark', 60], ['precision_shot', 60], ['flame_volley', 20]]) {
    if (!((r.casts[id] || 0) >= min)) return id + ' cast ' + (r.casts[id] || 0) + ' times in an hour (want ' + min + '+): ' + JSON.stringify(r.casts);
  }
  return (r.dmg.precision_shot || 0) > 0 ? null : 'Precision Shot dealt nothing: ' + JSON.stringify(r.dmg);
}

/* A SLOT'S AMMO THE HERO CAN'T USE YET, BROWSER CLOSED (supplies keep their skill, Tyler 2026-10-24; designer 2026-11-03: the slot
   stays, the engine passes it over, the bar says why). Ten minutes on the real settle, every setup alone in the Glade above its band. */
function underSkillRun(P, L, bar, bag, start) {
  const shots = [], uses = {}, buys = {}, casts = {}, waits = [];
  let unit = null;
  const x = P.run('mosslight_glade', L, ['ranger'], {
    spanMs: 720000, windowMs: 60000, start,
    equipment: () => ({ weapon: 'willow_longbow', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' }),
    bag: () => JSON.parse(JSON.stringify(bag)), bar: () => JSON.parse(JSON.stringify(bar)),
    onWindow: (out) => {
      const r = out.members[0];
      if (Number.isInteger(r.hunt.unit_id)) unit = r.hunt.unit_id;
      for (const e of out.events || []) {
        if (e.u !== unit) continue;
        if (e.type === 'shot') shots.push(e.item);
        if (e.type === 'cast') casts[e.ability] = (casts[e.ability] || 0) + 1;
        if (e.type === 'rule_wait' && e.why === 'level') waits.push(e.rule_label);
      }
      for (const [id, n] of Object.entries(r.hunt.uses || {})) uses[id] = (uses[id] || 0) + n;
      for (const [id, n] of Object.entries(r.hunt.buys || {})) buys[id] = (buys[id] || 0) + n;
    },
  });
  return { x, shots, uses, buys, casts, waits };
}
const countOf = (list, id) => list.filter((x) => x === id).length;
async function underSkill(root) {
  const P = await loadPlay(root);
  const XP = await import(pathToFileURL(join(root, 'src/core/xp.js')).href + V);
  const BAR = [ab('precision_shot'), atk('mithril_arrows'), atk('bronze_arrows')];
  const BAG = { mithril_arrows: { loaded: 2000 }, bronze_arrows: { loaded: 1 } };
  /* carried, under the skill: not one spent, the next slot flies, the shot spell looses it */
  const low = underSkillRun(P, 42, BAR, BAG);
  if (!(low.shots.length >= 20)) return 'CONTROL: a Ranged 42 hero shot ' + low.shots.length + ' time(s) in 12 min';
  if (countOf(low.shots, 'mithril_arrows') || low.uses.mithril_arrows) return 'Ranged 42 shot Mithril Arrows (Ranged 45): shots ' + countOf(low.shots, 'mithril_arrows') + ', spent ' + low.uses.mithril_arrows;
  if (!countOf(low.shots, 'bronze_arrows')) return 'Ranged 42 did not fall through to the next slot: ' + JSON.stringify([...new Set(low.shots)]);
  if (!(low.casts.precision_shot > 0)) return 'Precision Shot never cast on the slot behind Mithril: ' + JSON.stringify(low.casts);
  /* the control: at the level the same bar and bag fire it */
  const at = underSkillRun(P, 45, BAR, BAG);
  if (!(at.uses.mithril_arrows > 0) || !countOf(at.shots, 'mithril_arrows')) return 'CONTROL: Ranged 45 shot no Mithril Arrows: ' + JSON.stringify(at.uses);
  /* the store: nothing bought under the skill, the wait is said, and with nothing else to shoot the hunt ends no_fight (a slot with a test stands ahead of the worn row, conditions.js attackOrder) */
  const store = underSkillRun(P, 42, [{ ...atk('mithril_arrows'), conditions: [{ metric: 'self_hp_pct', op: 'lte', value: 100 }] }], {});
  if (store.buys.plain_mithril_arrows) return 'Ranged 42 bought ' + store.buys.plain_mithril_arrows + ' store Mithril Arrows';
  if (store.shots.length) return 'Ranged 42 with only Mithril on its bar shot ' + store.shots.length + ' time(s)';
  if (!store.waits.includes('mithril_arrows')) return 'the wait was not said (rule_wait level): ' + JSON.stringify(store.waits);
  if (!store.x.ended.some((e) => /no_fight/.test(e))) return 'a hero with nothing it can shoot ended ' + JSON.stringify(store.x.ended) + ', want no_fight';
  const bought = underSkillRun(P, 45, [atk('mithril_arrows')], {});
  if (!bought.buys.plain_mithril_arrows) return 'CONTROL: Ranged 45 bought no store Mithril Arrows: ' + JSON.stringify(bought.buys);
  /* the slot wakes at the level mid-hunt: the same bar, nothing pressed */
  const near = underSkillRun(P, 42, BAR, BAG, () => ({ skills: Object.fromEntries(['melee', 'ranged', 'magic', 'defense', 'inner_flame'].map((k) => [k, k === 'ranged' ? XP.skillXpForLevel('ranged', 45) - 200 : XP.skillXpForLevel(k, 42)])) }));
  const first = near.shots.indexOf('mithril_arrows');
  if (!(first > 0) || near.shots[0] !== 'bronze_arrows') return 'the slot did not wake at Ranged 45 mid-hunt: first Mithril shot at ' + first + ', shots ' + JSON.stringify([...new Set(near.shots)]);
  console.log('  under-skill: 12 min alone in the Glade: Ranged 42 shots ' + low.shots.length + ' [' + [...new Set(low.shots)].join(', ') + '], Precision Shot ' + low.casts.precision_shot + ', Mithril spent 0; Ranged 45 Mithril spent ' + at.uses.mithril_arrows
    + '; store at 42 bought 0, ended ' + store.x.ended.join(', ') + '; store at 45 bought ' + bought.buys.plain_mithril_arrows + '; wakes at Ranged 45 after ' + first + ' shots');
  return null;
}

/* THE SCREEN SAYS WHY (Andy 2026-10-23: a whetstone attack slot looked ready on the bar). The bar's struck
   reason (action-facts.js reasonOf) and Configure action (weaponWarning, the Ammo run) read the engine's own rule
   (hunt-roles.js shootsItem): a Ranger's whetstone slot and a rune slot are struck in words (no weapon shoots
   either: a rune fuels spells only, Tyler 2026-10-23), his arrows read ready; the Ammo run offers neither, and
   every arrow and bolt in it reads ready for a Ranger. */
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
async function clientWords(root) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  const F = await imp('src/shell/action-facts.js'), T = await imp('src/shell/action-table.js'), B = await imp('src/shell/bar-assign.js');
  /* The bag's "Put on the bar" (bar-assign.js barKind, the same attackItem the server's hr_hunt_action_ids pins): Andy a41,
     a whetstone is not ammo for the bar; a rune neither; arrows and bolts are. */
  const kinds = ['copper_whetstone', 'steel_whetstone', 'chalked_fire_rune', 'iron_arrows', 'iron_bolts'].map((id) => B.barKind(id));
  if (JSON.stringify(kinds) !== JSON.stringify([null, null, null, 'ammo', 'ammo'])) return 'the bag puts on the bar (whetstones, rune, arrows, bolts): ' + JSON.stringify(kinds);
  const set = { role: 'ranger', supplySource: 'mine', onEmpty: 'switch', store: [] };
  const slot = (id) => ({ action: { type: 'attack_with_item', id }, conditions: [], join: 'and', usable: true, count: 5 });
  const stone = F.reasonOf(slot('copper_whetstone'), set, [{ id: 'copper_whetstone', qty: 5 }], null);
  if (!stone || !stone.strike || !/^A whetstone is not a shot/.test(stone.text)) return 'a bow\'s Copper Whetstone slot reads ' + JSON.stringify(stone);
  const rune = F.reasonOf(slot('chalked_fire_rune'), set, [{ id: 'chalked_fire_rune', qty: 5 }], null);
  if (!rune || !rune.strike || !/^A rune isn’t a shot/.test(rune.text)) return 'a bow\'s Chalked Fire Rune slot reads ' + JSON.stringify(rune);
  const arrows = F.reasonOf(slot('iron_arrows'), set, [{ id: 'iron_arrows', qty: 5 }], null);
  if (arrows) return 'a bow\'s Iron Arrows slot (5 carried) reads ' + JSON.stringify(arrows);
  if (!F.weaponWarning({ type: 'attack_with_item', id: 'copper_whetstone' }, null, 'ranger')) return 'Configure action says nothing about a whetstone attack slot';
  /* A SHOT UNDER ITS SKILL (the bag reads the server's skills section): struck with both numbers, a word in Configure action, kept on a
     bar, quiet at the level, and never a guess before the server has said (SAY WHY, Tyler 2026-10-25). */
  const at = (n) => ({ ranged: { xp: 1, level: n } });
  const held = [{ id: 'mithril_arrows', qty: 5 }];
  const under = F.reasonOf(slot('mithril_arrows'), set, held, null, null, at(42));
  if (!under || !under.strike || under.code !== 'skill' || under.text !== 'Needs Ranged 45 — you have 42. This slot waits until then, and your next ammo fires.') return 'Mithril Arrows at Ranged 42 read ' + JSON.stringify(under);
  if (F.reasonOf(slot('mithril_arrows'), set, held, null, null, at(45))) return 'Mithril Arrows at Ranged 45 read ' + JSON.stringify(F.reasonOf(slot('mithril_arrows'), set, held, null, null, at(45)));
  if (F.reasonOf(slot('mithril_arrows'), set, held, null, null, null)) return 'with no skills from the server yet, Mithril Arrows read ' + JSON.stringify(F.reasonOf(slot('mithril_arrows'), set, held, null, null, null));
  if (F.weaponWarning({ type: 'attack_with_item', id: 'mithril_arrows' }, null, 'ranger', at(42)) !== under.text) return 'Configure action on Mithril Arrows at Ranged 42 reads ' + JSON.stringify(F.weaponWarning({ type: 'attack_with_item', id: 'mithril_arrows' }, null, 'ranger', at(42)));
  if (F.weaponWarning({ type: 'attack_with_item', id: 'mithril_arrows' }, null, 'ranger', at(45))) return 'Configure action warns at Ranged 45';
  const ammoRun = (skills) => T.tableOf('ammo', { role: 'ranger', bag: [], store: [], skills }).runs.find((r) => r.kind === 'ammo').rows.find((r) => r.action.id === 'mithril_arrows');
  if (!ammoRun(at(42)).locked || ammoRun(at(42)).lockWhy !== 'Needs Ranged 45 — you have 42') return 'the Ammo run at Ranged 42 reads ' + JSON.stringify(ammoRun(at(42)));
  if (ammoRun(at(45)).locked || ammoRun(null).locked) return 'the Ammo run locks Mithril Arrows at Ranged 45 or before the server has said: ' + JSON.stringify([ammoRun(at(45)).locked, ammoRun(null).locked]);
  const run = T.tableOf('ammo', { role: 'ranger', bag: [], store: [] }).runs.find((r) => r.kind === 'ammo');
  const row = (id) => (run && run.rows.find((r) => r.action.id === id)) || null;
  const stones = (run ? run.rows : []).filter((r) => /whetstone|_rune$/.test(r.action.id)).map((r) => r.action.id);
  if (stones.length) return 'the Ammo run offers a whetstone or a rune as a shot: ' + stones.join(', ');
  return row('iron_arrows') && !row('iron_arrows').locked && row('iron_bolts') && !row('iron_bolts').locked ? null
    : 'the Ammo run for a bow: Iron Arrows ' + JSON.stringify(row('iron_arrows')) + ', Iron Bolts ' + JSON.stringify(row('iron_bolts'));
}

/* A SHOT SPELL THE ENGINE NEVER CASTS IS STRUCK, WITH ITS REASON (Andy #62). Each setup plays five minutes of the Sewer
   with a tank on the real settle (nobody watching) and asks the bar's reason for Precision Shot as the action bar does
   (the worn ammo passed: action-bar.js). Struck exactly when the engine cast it 0 times: no shot anywhere, a worn or
   slotted arrow with none carried and the store off, a whetstone, an arrow carried but neither worn nor on the bar. */
async function shotSpellWords(root) {
  const P = await loadPlay(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  const F = await imp('src/shell/action-facts.js'), SB = await imp('src/data/supply-basics.js');
  const store = SB.BASIC_SUPPLIES.map((b) => ({ id: b.id, kind: b.kind, partner: b.partner, price: b.price }));
  const off = { supplySource: 'mine', onEmpty: 'end' };
  const CASES = [
    ['no arrows anywhere', null, {}, [], {}],
    ['Bronze worn and carried', 'bronze_arrows', { bronze_arrows: { loaded: 50 } }, [], {}],
    ['Bronze worn, none carried', 'bronze_arrows', {}, [], {}],
    ['Barbed worn, none carried, store on', 'barbed_arrows', {}, [], {}],
    ['Barbed worn, none carried, store off', 'barbed_arrows', {}, [], off],
    ['a Barbed slot, none carried, store on', null, {}, [atk('barbed_arrows')], {}],
    ['a Barbed slot, none carried, store off', null, {}, [atk('barbed_arrows')], off],
    ['a whetstone slot, carried', null, { copper_whetstone: { loaded: 50 } }, [atk('copper_whetstone')], {}],
    ['Iron Arrows carried, neither worn nor on the bar', null, { iron_arrows: { loaded: 50 } }, [], {}],
    ['an Iron Bolts slot, carried', null, { iron_bolts: { loaded: 50 } }, [atk('iron_bolts')], {}],
    ['a Mithril slot, carried, under its Ranged', null, { mithril_arrows: { loaded: 50 } }, [atk('mithril_arrows')], {}],
  ];
  const bad = [];
  let cast = 0, struck = 0;
  for (const [label, ammo, bag, extra, sess] of CASES) {
    let n = 0, unit = null;
    P.run('millrace_sewer', 20, ['ranger', 'tank'], {
      spanMs: 300000, session: { ...sess },
      equipment: (role, seat, L) => { const k = P.kitFor(L, role); if (role === 'ranger') { delete k.ammo; if (ammo) k.ammo = ammo; } return k; },
      bag: (role) => (role === 'ranger' ? JSON.parse(JSON.stringify(bag)) : {}),
      bar: (role) => (role === 'ranger' ? [ab('precision_shot'), ...extra] : []),
      onWindow: (out) => {
        const r = out.members.find((p) => p.key === 'ranger0');
        unit = r.hunt.unit_id ?? unit;
        for (const e of out.events || []) if (e.u === unit && e.type === 'cast' && e.ability === 'precision_shot') n++;
      },
    });
    const set = { role: 'ranger', discipline: 'ranged', supplySource: sess.supplySource || 'mine', onEmpty: sess.onEmpty || 'switch', store,
      slots: [ab('precision_shot'), ...extra].map((x) => ({ empty: false, enabled: true, usable: true, ...x })) };
    const why = F.reasonOf(set.slots[0], set, Object.entries(bag).map(([id, l]) => ({ id, qty: l.loaded })), null, ammo, { ranged: { xp: 0, level: 20 } });
    const off2 = !!why && why.strike;
    if (n > 0) cast++; else struck++;
    if ((n > 0) === off2 || (off2 && why.code !== 'ammo')) bad.push(label + ': the engine cast Precision Shot ' + n + ' times, the bar reads ' + JSON.stringify(why));
  }
  if (!cast || !struck) return 'CONTROL: ' + cast + ' setup(s) cast and ' + struck + ' never did (want both)';
  return bad.length ? bad.join(' | ') : null;
}

const R = makeReport('hunt-core/ranger-bar');
let why = null;
try { why = judge(fremulonHour(await loadPlay(ROOT)), false); } catch (e) { why = 'threw ' + (e && e.stack || e); }
R.ok(!why, 'fremulon-hour: ' + why);
let words = null;
try { words = await clientWords(ROOT); } catch (e) { words = 'threw ' + (e && e.stack || e); }
R.ok(!words, 'client-words: ' + words);
let shots = null;
try { shots = await shotSpellWords(ROOT); } catch (e) { shots = 'threw ' + (e && e.stack || e); }
R.ok(!shots, 'shot-spell-words: ' + shots);
let locked = null;
try { locked = await underSkill(ROOT); } catch (e) { locked = 'threw ' + (e && e.stack || e); }
R.ok(!locked, 'under-skill: ' + locked);
const SKILL_MUTANTS = [
  { name: 'the engine shoots ammo under its skill', edits: [['src/core/hunt/abilities.js', "function shotLocked(h, id) {\n", "function shotLocked(h, id) {\n  if (h) return false;\n"]] },
  { name: 'the store sells ammo under its skill', edits: [['src/core/hunt/abilities.js', "shotLocked(h, id) ? { why: 'level' } : resolveLine(h && h.hs, id, undefined);", 'resolveLine(h && h.hs, id, undefined);']] },
  { name: 'a shot under its skill reads as out of stock', edits: [['src/core/hunt/damage.js', "(l.why === 'gold_short' || l.why === 'level' ? l.why : 'no_stock')", "(l.why === 'gold_short' ? l.why : 'no_stock')"]] },
];
for (const mu of SKILL_MUTANTS) {
  const p = plant(mu.edits, PLAY_TREES);
  try {
    let w = null;
    try { w = await underSkill(p.root); } catch (e) { w = 'threw ' + e.message; }
    R.ok(!!w && !w.startsWith('CONTROL') && !w.startsWith('threw'), 'mutant "' + mu.name + '" was NOT caught by under-skill (' + w + ')');
  } finally { p.done(); }
}
const SHOT_MUTANTS = [
  { name: 'the bar reads a shot spell with no shot as ready (Andy #62)', edits: [['src/shell/action-facts.js', '    if (r.ammo > 0 && set && !hasShot(set, bag, worn, skills)) {', '    if (false) {']] },
  { name: 'the bar counts the store behind an arrow while the store is off', edits: [['src/shell/action-facts.js', '    if (storeOn && storeOf({ type: \'attack_with_item\', id }, set.store)) return true;', '    if (storeOf({ type: \'attack_with_item\', id }, set.store)) return true;']] },
  { name: 'the bar forgets the worn ammo', edits: [['src/shell/action-facts.js', '  const ids = new Set([worn]);', '  const ids = new Set();']] },
  { name: 'the bar counts a shot under its skill for a shot spell', edits: [['src/shell/action-facts.js', 'if (!id || !shootsItem(set.role, ITEMS[id]) || shortOf(id, skills, null)) continue;', 'if (!id || !shootsItem(set.role, ITEMS[id])) continue;']] },
];
for (const mu of SHOT_MUTANTS) {
  const p = plant(mu.edits, ['src', ...PLAY_TREES]);
  try {
    let w = null;
    try { w = await shotSpellWords(p.root); } catch (e) { w = 'threw ' + e.message; }
    R.ok(!!w && !w.startsWith('CONTROL') && !w.startsWith('threw'), 'mutant "' + mu.name + '" was NOT caught by shot-spell-words (' + w + ')');
  } finally { p.done(); }
}
const CLIENT_MUTANTS = [
  { name: 'the bar shows a bow\'s whetstone slot as ready',
    edits: [['src/shell/action-facts.js', "  if (shot) return { code: shootsItem(set && set.role, ITEMS[a.id]) ? 'skill' : 'weapon', text: shot, glyph: 'uiLock', strike: true };\n", '']] },
  { name: 'the bag puts a whetstone on the bar (Andy a41)',
    edits: [['src/shell/bar-assign.js', "  if (k === 'ammo' && !attackItem(id)) return null;", "  if (k === 'ammo' && /_rune$/.test(id)) return null;"]] },
  { name: 'the bar shows a shot under its skill as ready',
    edits: [['src/shell/action-facts.js', "if (shootsItem(role, it)) { const need = shortOf(a.id, skills, null); return need ? need.text + '. This slot waits until then, and your next ammo fires.' : ''; }", "if (shootsItem(role, it)) return '';"]] },
  { name: 'the Ammo run does not lock a shot under its skill',
    edits: [['src/shell/action-table.js', '(!shootsItem(c.role, ITEMS[id]) || !!short)', '!shootsItem(c.role, ITEMS[id])']] },
  { name: 'Configure action offers whetstones as shots',
    edits: [['src/shell/action-table.js', "r.kind === 'ammo' && roles.some((k) => shootsItem(k, ITEMS[r.id]))", "r.kind === 'ammo'"]] },
];
for (const mu of CLIENT_MUTANTS) {
  const p = plant(mu.edits, ['src']);
  try {
    let w = null;
    try { w = await clientWords(p.root); } catch (e) { w = 'threw ' + e.message; }
    R.ok(!!w && !w.startsWith('threw'), 'mutant "' + mu.name + '" was NOT caught by client-words (' + w + ')');
  } finally { p.done(); }
}

/* The rule's own proof: each half of the live bug, planted back, turns it red (live v0.2.35 is both at once). */
const MUTANTS = [
  { name: 'a bow shoots the whetstone an attack slot names (1,012 spent live)',
    edits: [['src/core/hunt/damage.js', '    if (!shootsItem(u.role, itemRow(h, id))) return null;\n', ''], ['src/core/hunt/conditions.js', 'SHOOTERS.some((r) => shootsItem(r, ITEMS[id]))', "!!ITEMS[id] && ITEMS[id].reqSkill !== 'magic'"]] },
  { name: 'a shot ability reads only the worn ammo (Precision Shot never cast live)',
    edits: [['src/core/hunt/abilities.js', "    const id = slot.action.id === 'loaded' ? h.ammo : slot.action.id;", '    const id = h.ammo;']] },
];
for (const mu of MUTANTS) {
  const p = plant(mu.edits, PLAY_TREES);
  try {
    let w = null;
    try { w = judge(fremulonHour(await loadPlay(p.root)), true); } catch (e) { w = 'threw ' + e.message; }
    R.ok(!!w && !w.startsWith('CONTROL') && !w.startsWith('threw'), 'mutant "' + mu.name + '" was NOT caught by fremulon-hour (' + w + ')');
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  4 cases, ' + (MUTANTS.length + CLIENT_MUTANTS.length + SHOT_MUTANTS.length + SKILL_MUTANTS.length) + ' mutants caught');
R.finish();
