#!/usr/bin/env node
// mutant-rule-functions: pure
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-screen-pure.mjs — THE HUNT SCREEN'S RULES THAT NEED NO BROWSER, PROVEN IN NODE.
//
//   node tests/hunt-screen-pure.mjs                    the rules
//   node tests/hunt-screen-pure.mjs --mutate           every planted defect must turn a rule RED
//   node tests/hunt-screen-pure.mjs --mutate --only <words>   only the mutants whose name holds <words>
//
// ci-step: client-guards | Hunt screen rules that need no browser (the hunt screen's pure half)
// ci-run: node tests/hunt-screen-pure.mjs
// ci-run: node tools/mutant-gate.mjs node tests/hunt-screen-pure.mjs --mutate
//
// mutant-anchors: src/shell/action-facts.js src/shell/bar-draft.js src/shell/action-table.js src/session/hunt-sections.js src/hunt-view/summary-model.js src/session/character-session.js src/shell/hunt-go.js src/shell/hunt-list.js src/data/combat-text.js
// mutant-writes-tree: no — every mutant is planted into a temp copy of src (tests/_pure-guard.mjs planted)
//
// WHY (architecture audit item 8, "rules proven in Node, not the browser"; lane/c-rules-in-node 2026-11-20). tests/hunt-screen.mjs
// was the most expensive guard CI runs: nightly 44730692384 spent 16,400 job-seconds on it (1,398 plain + 15,002 across 13
// --mutate shards), because each page mutant boots Chromium and walks every rule up to the one that catches it. 23 of its
// mutants were planted in modules with no DOM at all (the slot's reasons, the Configure action table, the bar's drafts and
// plans, the section readers, the summary model, Hunt prep's words, the float defaults, the residue put) and
// were caught after up to 209 booked seconds each, by rules whose logic half reads those modules. Here that half runs on the
// same fixture (tests/fixtures/hunt-envelope.json, with the page's own edits) through the same readers the widgets call, in
// about a second; a mutant is planted into a temp copy of src and judged in about one.
//
// THE SPLIT KEEPS EVERY CATCH. tests/hunt-screen.mjs keeps every rule as a page rule (what the page shows, where, and what a
// press sends): its plain run still reads every number below on screen, and its mutants keep the wiring, layout, input and
// clocks. The 21 mutants moved here verbatim (23 until the two tier-note mutants left with the tiers), and each is caught by the SAME rule id that caught it in the page
// (tests/hunt-screen.mutant-rules.json): the rules run in the page's order (HS-27, HS-4, HS-5, HS-7, HS-19, HS-20, HS-24,
// HS-25, HS-11, HS-8), so the first red one is the one the page's stopAtFirst saw.
//
// The widgets' compositions are mirrored where they live in a DOM module (the bar's hover is action-bar.js tipHtml's
// hoverLines call; a drop's status line is its `r.ok ? '' : refusalWords(r.error)`): a drift there is the page's red.
//
//   HS-27 IN TOWN the panel shows only the server's values (the gold to keep it left unset reads empty, never a client pick),
//         and Configure action's Food & drink tab holds food and drink runs, its Ammo tab the ammo run alone
//   HS-4  THE ANALYZER IS THE SERVER'S: its totals, the Level's next-level eta (a maxed skill's 0 says nothing), the premium
//         Training rows; no section shows no numbers; under 10 minutes no rate; premium is the server's flag, failing safe
//   HS-5  BADGE DEFAULTS: the bleed count is off over regular monsters and on over bosses; every other float type on for both
//   HS-7  the slot's hover says the server's setup in plain words ("When my HP is at most 50%."); the tabs are Spells | Food &
//         drink | Ammo; Save sends ONE intent with the whole bar, the controls off until it answers; a refusal names its
//         condition and keeps the draft
//   HS-19 DROPS: a move, a swap and an insert (never past the first empty slot) are ONE intent each and move nothing before the
//         server answers; a refusal says why; no answer says so after the bar's wait, and the next drop is taken
//   HS-20 every struck or waiting slot says why, the server's reason first (mana, rune, none left, store off, refused, the
//         wrong weapon, a party too small, no weapon), struck only where the server would not fire it
//   HS-24 THE PICKER'S PERSONAL BESTS are the server's, replaced by the next envelope (never merged)
//   HS-25 THE HUNT SUMMARY shows the server's balance and balance per hour to everyone, raw XP per hour to premium only, none
//         under the rate window; a re-read that crossed the card's residue put keeps the card
//   HS-11 A SLOT THAT NEVER FIRES: an earlier slot with the same action under weaker conditions blocks it, and says so;
//         emptying the earlier one clears it
//   HS-8  IN TOWN: the Spells list is castable first, then locked; a locked spell says which weapon casts it, or its unlock
//         and no weapon; the Food run is the server's HP / gold / gold a point, cheapest per point first; the comparison;
//         a new food slot starts with its HP test; Hunt prep reads a store food per use (the tier note, its press line and the
//         pull on the server's pick left with the tiers: lane/retire-tier-chain 2026-11-26, 12-targets 8.4 item 4)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withServerLevel } from './_server-level.mjs';
import { ROOT, runPureGuard } from './_pure-guard.mjs';

const FIXTURE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const UID = '11111111-2222-3333-4444-555555555555';

/** A character the readers read: `read(key)` the envelope's section, the server's Level block stated (as hr_state_of does). */
const characterOf = (env) => { const e = withServerLevel(clone(env)); return { slot: 0, read: (k) => e[k] }; };
/** In town (the page's `open({ town: true })`): no hunt sections and no combat activity. */
function inTown(env) {
  for (const k of ['hunt', 'party', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'hunt_server_now_ms']) delete env[k];
  env.state = Object.assign({}, env.state, { active_kind: null, active_id: null });
  return env;
}
/** Every settled promise callback and immediate so far (the held clock never moves setImmediate). */
const settle = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise((ok) => setImmediate(ok)); };
/**
 * A HELD CLOCK for one rule (HS-19's unanswered drop): until restore(), setTimeout only books its callback and runFor(ms) fires every
 * booked one due within ms, in order; clearTimeout cancels a booked one. The bar's wait (10 s) is then judged in no real time. setImmediate
 * is never held (settle() runs on it).
 */
function heldClock() {
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  const booked = [];
  let now = 0;
  globalThis.setTimeout = (fn, ms = 0, ...args) => { const h = { at: now + Math.max(0, Number(ms) || 0), fn, args, on: true }; booked.push(h); return h; };
  globalThis.clearTimeout = (h) => { if (h && typeof h === 'object' && 'on' in h) h.on = false; else realClear(h); };
  return {
    runFor(ms) {
      const end = now + ms;
      for (let h; (h = booked.filter((x) => x.on && x.at <= end).sort((a, b) => a.at - b.at)[0]);) { h.on = false; now = h.at; h.fn(...h.args); }
      now = end;
    },
    restore() { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; },
  };
}

/** The modules the rules read, from `base` (the repository, or a temp copy of src with a mutant planted). */
async function modulesOf(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  return {
    HS: await imp('src/session/hunt-sections.js'),
    IS: await imp('src/session/item-sections.js'),
    CSX: await imp('src/session/character-sections.js'),
    CS: await imp('src/session/character-session.js'),
    SW: await imp('src/shell/slot-waits.js'),
    AF: await imp('src/shell/action-facts.js'),
    AT: await imp('src/shell/action-table.js'),
    BD: await imp('src/shell/bar-draft.js'),
    IW: await imp('src/shell/intent-words.js'),
    RD: await imp('src/shell/readiness.js'),
    HL: await imp('src/shell/hunt-list.js'),
    SM: await imp('src/hunt-view/summary-model.js'),
    FP: await imp('src/hunt-view/float-prefs.js'),
    CT: await imp('src/data/combat-text.js'),
    ST: await imp('src/data/settings.js'),
    BAR_MS: (await imp('src/data/hunt-hud.js')).BAR_ANSWER_MS,
  };
}

/** The bar's hover lines for slot `i`, as widgets/action-bar.js tipHtml builds them: [{ text, cls }]. */
function hoverOf(M, cs, i) {
  const set = M.HS.settingsOf(cs);
  const wires = Array.from({ length: M.BD.SLOTS }, (_, k) => M.HS.wireSlot(set.slots[k]));
  const facts = M.SW.whyFacts(cs);
  return M.AF.hoverLines(wires[i], { bag: facts.bag, store: set.store, skills: facts.skills, set, worn: facts.worn },
    M.SW.slotWhy(set.slots[i], facts), M.AF.conflictsOf(wires, set).get(i));
}
/** Slot `i`'s reason (slot-waits.js slotWhy over whyFacts: the one answer the bar, its hover and Configure action share). */
const whyOf = (M, cs, i) => M.SW.slotWhy(M.HS.settingsOf(cs).slots[i] || { empty: true }, M.SW.whyFacts(cs));

/** A character whose server answers the bar's intent (hr_action_set_options) with `answer()`; `sent` holds each bar sent. */
function barServer(env, answer) {
  const c = characterOf(env);
  const sent = [];
  c.setHuntOptions = (preset, opts) => { sent.push(opts.slots); return answer(); };
  return { cs: c, sent, set: (fn) => { answer = fn; } };
}

/* mutant-rules-start */
/** Every rule, in the page's order (the first red one is the rule the page's stopAtFirst saw). Fail lines carry the rule id. */
async function pure(base) {
  const M = await modulesOf(base);
  const fails = [];

  { // HS-27 THE BAR IS CONFIGURABLE IN TOWN: the server's values only; an option it left unset is empty, never a client pick
    const env = inTown(clone(FIXTURE));
    Object.assign(env.hunt_settings, { role: 'ranger', target_mode: null, stance: 'balanced', distance: 3, chase: false, gold_floor: null });
    const cs = characterOf(env);
    const s = M.HS.settingsOf(cs);
    const t0 = { target: s.targetMode, dist: s.distance, stance: s.stance, chase: s.chase, gold: M.HS.goldFloorOf(cs) };
    if (t0.target !== null || t0.dist !== 3 || t0.stance !== 'balanced' || t0.chase !== false || t0.gold !== null) fails.push('HS-27 in town the panel does not show only the server\'s values: ' + JSON.stringify(t0));
    env.hunt_settings.gold_floor = 300;
    if (M.HS.goldFloorOf(characterOf(env)) !== 300) fails.push('HS-27 in town the gold to keep does not read the server\'s 300: ' + M.HS.goldFloorOf(characterOf(env)));
    const runs = (tab) => M.AT.tableOf(tab, { store: s.store, bag: M.IS.carriedOf(cs), role: s.role, discipline: s.discipline, skills: M.IS.skillsOf(cs), set: s }).runs.map((r) => r.kind).join();
    const food = runs('food'), ammo = runs('ammo');
    if (food !== 'food,drink' || ammo !== 'ammo') fails.push('HS-27 in town Configure action lists ' + JSON.stringify({ food, ammo }) + ' (want food,drink under Food & drink and ammo alone under Ammo)');
  }

  { // HS-4 THE ANALYZER RENDERS ONLY SERVER DATA (the section's numbers; none without it; free and premium; no rate under 10 min)
    const cs = characterOf(FIXTURE);
    const an = M.HS.analyzerOf(cs);
    const a = FIXTURE.hunt_analyzer.hero;
    if (!an) fails.push('HS-4 the analyzer read nothing from the fixture\'s hunt_analyzer');
    else {
      const got = { kills: an.hero.kills, levelXp: an.hero.levelXp, gold: an.hero.gold, lootValue: an.hero.lootValue, waste: an.hero.waste, balance: an.hero.balance };
      const want = { kills: a.kills, levelXp: a.xp.level, gold: a.coins, lootValue: a.loot_value, waste: a.waste, balance: a.balance };
      for (const k of Object.keys(want)) if (got[k] !== want[k]) fails.push('HS-4 analyzer ' + k + ' shows "' + got[k] + '"; the server sent ' + want[k]);
      /* Next level in is the LEVEL's eta (the fixture's maxed Melee carries eta_h 0 and used to pin it at 00:00:00) */
      if (an.nextLevelMs !== Math.round(a.level.eta_h * 3600000)) fails.push('HS-4 Next level in shows ' + an.nextLevelMs + ' ms; the server sent a Level eta of ' + a.level.eta_h + ' h');
      /* premium's Training rows: each combat skill's XP, its XP an hour and its next level in (a maxed skill's 0 says nothing) */
      const wantLines = Object.entries(a.xp).filter(([k]) => k !== 'level').sort((x, y) => y[1] - x[1])
        .map(([k, v]) => [k, v, a.skills[k].per_hour, a.skills[k].eta_h > 0 ? Math.round(a.skills[k].eta_h * 3600000) : null]);
      const lines = an.hero.training.map((r) => [r.skill, r.xp, r.perHour, r.nextMs]);
      if (JSON.stringify(lines) !== JSON.stringify(wantLines)) fails.push('HS-4 the premium Training tab shows ' + JSON.stringify(lines) + '; the server sent ' + JSON.stringify(wantLines));
    }
    const gone = clone(FIXTURE);
    delete gone.hunt_analyzer;
    if (M.HS.analyzerOf(characterOf(gone)) !== null) fails.push('HS-4 with no hunt_analyzer section the analyzer still showed numbers');
    const free = clone(FIXTURE);
    free.premium = { active: false, premium_until: null };
    const paid = clone(FIXTURE);
    paid.premium = { active: true, premium_until: '2099-01-01T00:00:00Z' };
    const unsent = clone(FIXTURE);
    delete unsent.premium;
    if (M.HS.isPremium(characterOf(free)) || !M.HS.isPremium(characterOf(paid)) || M.HS.isPremium(characterOf(unsent))) fails.push('HS-4 a free character reads as premium (or a premium one as free): ' + JSON.stringify([M.HS.isPremium(characterOf(free)), M.HS.isPremium(characterOf(paid)), M.HS.isPremium(characterOf(unsent))]));
    const early = clone(FIXTURE);
    early.hunt_analyzer.hero.per_hour = null;
    early.hunt_analyzer.hero.level.eta_h = null;
    const e = M.HS.analyzerOf(characterOf(early));
    if (!e || e.hero.kills !== a.kills || e.hero.rated || e.hero.perHour.levelXp !== null || e.nextLevelMs !== null) {
      fails.push('HS-4 a session under 10 minutes (per_hour null) did not show totals plus "Per hour after 10 min.": ' + JSON.stringify(e && { kills: e.hero.kills, rated: e.hero.rated, perHour: e.hero.perHour, next: e.nextLevelMs }));
    }
    const later = M.HS.analyzerOf(characterOf(FIXTURE));
    if (!later || !later.hero.rated || later.hero.perHour.levelXp !== a.per_hour.xp) fails.push('HS-4 once the server sent rates, the per-hour rows did not come back');
  }

  { // HS-5 BADGE DEFAULTS: the bleed count off over regular monsters and on over bosses; every other float type on for both
    const fresh = { record: null };
    const boxes = Object.fromEntries(M.CT.FLOAT_TYPES.flatMap((f) => M.CT.FLOAT_TARGETS.map((tg) => [f.id + ':' + tg, M.FP.floatShown(fresh, f.id, tg)])));
    /* ...and the Settings window's own rows (src/data/settings.js: a toggle per type and target, its default) */
    const rows = Object.fromEntries(M.ST.SETTINGS.filter((r) => r.bind && r.bind.store === 'float').map((r) => [r.bind.type + ':' + r.bind.target, r.default]));
    if (boxes['bleed_badge:regular'] !== false || boxes['bleed_badge:boss'] !== true || rows['bleed_badge:regular'] !== false || rows['bleed_badge:boss'] !== true) {
      fails.push('HS-5 the bleed count default is not off on monsters and on for bosses: ' + JSON.stringify({ shown: boxes, settings: rows }));
    }
    for (const f of M.CT.FLOAT_TYPES.filter((x) => x.id !== 'bleed_badge')) {
      if (boxes[f.id + ':regular'] !== true || boxes[f.id + ':boss'] !== true || rows[f.id + ':regular'] !== true || rows[f.id + ':boss'] !== true) fails.push('HS-5 ' + f.id + ' is not on by default');
    }
  }

  { // HS-7 CONFIGURE ACTION: the hover in plain words; the three tabs; ONE whole-bar intent, off until it answers; a refusal inline
    const tip = hoverOf(M, characterOf(FIXTURE), 2).map((l) => l.text).join(' ');
    if (!/When my HP is at most 50%/.test(tip)) fails.push('HS-7 the slot tooltip did not show the server’s setup in plain words: ' + tip);
    const tabs = M.AF.TABS.map(([, label]) => label).join('|');
    if (tabs !== 'Spells|Food & drink|Ammo') fails.push('HS-7 the tabs read ' + M.AF.TABS.map(([, l]) => l).join(' | '));
    const cs0 = characterOf(FIXTURE), s0 = M.HS.settingsOf(cs0);
    const ctx = { store: s0.store, bag: M.IS.carriedOf(cs0), role: s0.role, discipline: s0.discipline, skills: M.IS.skillsOf(cs0), set: s0 };
    const onFood = M.AT.tableOf('food', ctx).runs.map((r) => r.kind), onAmmo = M.AT.tableOf('ammo', ctx).runs.map((r) => r.kind);
    if (onFood.join() !== 'food,drink') fails.push('HS-7 the Food & drink tab lists the runs ' + JSON.stringify(onFood) + ' (ammo mixed in?)');
    if (onAmmo.join() !== 'ammo') fails.push('HS-7 the Ammo tab lists the runs ' + JSON.stringify(onAmmo));
    /* Save: slot 3's new test (below 40%) goes out as ONE intent restating the whole bar; the controls stay off until the answer. */
    let release;
    const srv = barServer(FIXTURE, () => new Promise((ok) => { release = () => ok({ ok: true }); }));
    M.BD.openSlot(srv.cs, 2);
    const d = M.BD.draftOf(srv.cs);
    d.draft.conditions = [{ metric: 'self_hp_pct', op: 'lt', value: 40 }];
    let closed = false;
    M.BD.saveOpen(srv.cs, () => {}, () => { closed = true; });
    await settle();
    if (!M.BD.draftOf(srv.cs).pending) fails.push('HS-7 Configure action stayed on while its intent was in flight');
    if (release) release();
    await settle();
    const sl = srv.sent[0];
    if (srv.sent.length !== 1 || !Array.isArray(sl) || sl.length !== 20 || JSON.stringify(sl[2].conditions) !== '[{"metric":"self_hp_pct","op":"lt","value":40}]'
      || JSON.stringify(sl[0]) !== JSON.stringify({ action: FIXTURE.hunt_settings.slots[0].action, conditions: FIXTURE.hunt_settings.slots[0].conditions, join: 'and' })) {
      fails.push('HS-7 the save sent ' + JSON.stringify(srv.sent).slice(0, 300));
    }
    if (!closed || M.BD.draftOf(srv.cs).pending || M.BD.draftOf(srv.cs).open !== null) fails.push('HS-7 after the server confirmed, the slot did not show the server’s new test and close');
    /* A refusal: shown inline on the condition the server names; the draft stays (the added condition is still there). */
    const ref = barServer(FIXTURE, async () => ({ ok: false, error: 'bad_value', slot: 0, condition: 0 }));
    M.BD.openSlot(ref.cs, 0);
    M.BD.draftOf(ref.cs).draft.conditions.push(M.BD.blankCondition());
    M.BD.saveOpen(ref.cs, () => {}, () => {});
    await settle();
    const r = M.BD.draftOf(ref.cs);
    const shown = !!r.error && r.error.condition === 0 && r.msg.length > 0;
    if (shown && !(r.draft && r.draft.conditions.length >= 1)) fails.push('HS-7 a refusal threw the draft away');
    if (!shown) fails.push('HS-7 a server validation error was not shown on its condition');
  }

  { // HS-19 DROPS: one intent per choice, nothing moves before the server answers, the status line always comes back
    const env = clone(FIXTURE);
    const srv = barServer(env, async () => ({ ok: true }));
    const line = (r) => (r.ok ? '' : M.IW.refusalWords(r.error));   // widgets/action-bar.js: the drop's status line
    const base = M.BD.serverBar(srv.cs);
    const lastIs = (label, r, want) => {
      if (srv.sent.length !== want.n || JSON.stringify(srv.sent[srv.sent.length - 1]) !== JSON.stringify(want.bar)) fails.push('HS-19 ' + label + ' sent ' + String(JSON.stringify(srv.sent[srv.sent.length - 1])).slice(0, 400));
      if (line(r) !== '') fails.push('HS-19 the status line stayed after the server answered ' + label);
    };
    const moved = base.slice(); moved[7] = base[4]; moved[4] = null;
    lastIs('a move onto an empty slot', await M.BD.sendPlan(srv.cs, (b) => M.BD.movePlan(b, 4, 7), () => {}), { n: 1, bar: moved });
    const swapped = base.slice(); swapped[0] = base[2]; swapped[2] = base[0];
    lastIs('a swap', await M.BD.sendPlan(srv.cs, (b) => M.BD.swapPlan(b, 0, 2), () => {}), { n: 2, bar: swapped });
    /* Insert: the target and the slots after it shift one place, up to the first empty slot — never past it (slot 9 stays). */
    env.hunt_settings.slots[8] = { action: { type: 'ability', id: 'challenge' }, conditions: [], join: 'and', usable: true, mana: 0 };
    const srv8 = barServer(env, async () => ({ ok: true }));
    const base8 = M.BD.serverBar(srv8.cs);
    const ins = base8.slice(); ins[0] = null; ins[2] = base8[0]; ins[3] = base8[2]; ins[4] = base8[3]; ins[5] = base8[4];
    const rIns = await M.BD.sendPlan(srv8.cs, (b) => M.BD.insertPlan(b, 0, 2), () => {});
    if (srv8.sent.length !== 1 || JSON.stringify(srv8.sent[0]) !== JSON.stringify(ins)) fails.push('HS-19 an insert sent ' + String(JSON.stringify(srv8.sent[0])).slice(0, 400));
    if (line(rIns) !== '') fails.push('HS-19 the status line stayed after the server answered an insert');
    /* Nothing moves before the server says so: the server's bar is what the readers still hold. */
    if (JSON.stringify(M.BD.serverBar(srv.cs)) !== JSON.stringify(base)) fails.push('HS-19 the bar shows a move the server’s bar does not hold');
    /* A refusal: the line says why (never stays on "Moving it…"). */
    srv.set(async () => ({ ok: false, error: 'rate_limited' }));
    const refused = line(await M.BD.sendPlan(srv.cs, (b) => M.BD.swapPlan(b, 0, 2), () => {}));
    if (!/^Too many changes/.test(refused)) fails.push('HS-19 a refused drop left the line on ' + JSON.stringify(refused));
    /* No answer at all: the line comes back after the bar's wait (data/hunt-hud.js BAR_ANSWER_MS), on a held clock, and the next drop is taken. */
    srv.set(() => new Promise(() => {}));
    const clock = heldClock();
    try {
      let out = null;
      const n0 = srv.sent.length;
      M.BD.sendPlan(srv.cs, (b) => M.BD.swapPlan(b, 0, 2), () => {}).then((r) => { out = r; });
      await settle();
      clock.runFor(M.BAR_MS + 500);
      await settle();
      if (!out || line(out) !== M.IW.refusalWords('timeout') || !/^No answer from the server/.test(line(out))) fails.push('HS-19 a drop the server never answered left the line on ' + JSON.stringify(out ? line(out) : 'Moving it…'));
      srv.set(async () => ({ ok: true }));
      await M.BD.sendPlan(srv.cs, (b) => M.BD.swapPlan(b, 0, 2), () => {}).then(() => {}, () => {});
      await settle();
      if (srv.sent.length !== n0 + 2) fails.push('HS-19 after a timeout the next drop sent nothing (still pending)');
    } finally { clock.restore(); }
  }

  { // HS-20 every struck slot says why: the server's reason first (action-facts.js reasonOf through slot-waits.js slotWhy)
    const env = clone(FIXTURE);
    const S = env.hunt_settings;
    Object.assign(S, { role: 'tank', discipline: 'shield', supply_source: 'mine', on_empty: 'end' });
    env.hunt.hero.mana = 2;
    /* The struck state of a food or drink is the SERVER's (hr_hunt_settings_view usable + why), never a browser count. */
    S.slots[2] = Object.assign({}, S.slots[2], { count: 0, usable: false, why: 'none_left' });
    S.slots[5] = { action: { type: 'consume', id: 'salted_shrimp' }, conditions: [], join: 'and', usable: false, why: 'store_off', count: null };
    S.slots[7] = { action: { type: 'consume', id: 'cooked_shrimp' }, conditions: [], join: 'and', usable: false, count: 3 };
    const want = [
      [0, 'mana', /^Needs 6 mana, have 2$/, false],
      [1, 'rune', /^No Fire rune: pick the store rune/, true],
      [2, 'none left', /^Out of Wheat Bread: next food or drink slot takes over$/, true],
      [5, 'store off', /^When out: leaves the hunt$/, true],
      [7, 'server', /^Can't use now$/, true],
    ];
    /* EVERY struck or waiting slot on the bar, not only the ones named: a reason, said first in its hover. */
    const sweep = (cs, label) => {
      const set = M.HS.settingsOf(cs);
      const all = set.slots.map((sl, i) => [i, sl]).filter(([, sl]) => sl && !sl.empty).map(([i]) => [i, whyOf(M, cs, i), hoverOf(M, cs, i)])
        .filter(([, w]) => w && !w.rest);   // widgets/action-bar.js patchSlot: a `rest` reason is words only, never marked
      const bad = all.filter(([, w, tip]) => !(w.text.length > 8 && w.glyph && tip[0] && tip[0].text === w.text && /\bis-why\b/.test(tip[0].cls)));
      if (!all.length || bad.length) fails.push('HS-20 ' + label + ': a struck slot without its glyph or reason ' + JSON.stringify((bad.length ? bad : all).map(([i, w]) => [i, w])));
    };
    let cs = characterOf(env);
    sweep(cs, 'the tank bar');
    for (const [i, label, re, strike] of want) {
      const w = whyOf(M, cs, i) || {};
      if (!re.test(w.text) || !w.glyph || !!w.strike !== strike) fails.push('HS-20 the ' + label + ' slot reads ' + JSON.stringify(w));
    }
    S.role = 'healer'; S.discipline = 'restoration';
    cs = characterOf(env);
    const wrong = whyOf(M, cs, 0) || {};
    /* slot 0's Power Strike names EVERY discipline that casts it (action-facts.js weaponsFor, d190f3abc: its first discipline alone
       said Shield). Since the spell rule it is shield, sword and club, not dual axes, so the words list them; Turning Cut, every melee
       weapon but the shield, reads as the label */
    if (wrong.text !== 'Requires Shield, sword, club, hammer or bare hands' || !wrong.strike || !wrong.glyph) fails.push('HS-20 the wrong-weapon slot reads ' + JSON.stringify(wrong));
    const strike0 = env.hunt_settings.slots[0];
    env.hunt_settings.slots[0] = Object.assign({}, strike0, { action: { type: 'ability', id: 'turning_cut' } });
    const cut = whyOf(M, characterOf(env), 0) || {};
    if (cut.text !== 'Requires Melee weapon (no shield)' || !cut.strike || !cut.glyph) fails.push('HS-20 the Turning Cut slot reads ' + JSON.stringify(cut));
    env.hunt_settings.slots[0] = strike0;
    sweep(cs, 'the healer bar');
    /* A SLOT THIS PARTY CAN'T FIRE: wanting more hurt heroes than the party holds never holds. Not struck: it says so, and the
       slot shows what it wants where an item shows its count, ahead of the mana it is also short of. */
    S.slots[9] = { action: { type: 'ability', id: 'mend' }, conditions: [{ metric: 'allies_below', op: 'gte', value: 3, subject: 'under_80' }], join: 'and', usable: true };
    cs = characterOf(env);
    const short = whyOf(M, cs, 9) || {};
    if (short.text !== 'Waiting: needs 3 or more heroes under 80% health, party of 2' || short.strike || !short.glyph || short.need !== '3+') fails.push('HS-20 the group heal this party can\'t fire reads ' + JSON.stringify(short));
    sweep(cs, 'the bar with a slot waiting on a party');
    delete S.slots[9];
    delete S.role; delete S.discipline;
    cs = characterOf(env);
    const none = whyOf(M, cs, 0) || {};
    if (none.text !== 'No weapon equipped' || !none.strike || !none.glyph) fails.push('HS-20 the no-weapon slot reads ' + JSON.stringify(none));
    sweep(cs, 'the bar with no weapon');
  }

  { // HS-24 THE PICKER'S PERSONAL BESTS are the server's (hunt_bests), replaced by each envelope
    const env = inTown(clone(FIXTURE));
    env.hunt_bests = { min_ms: 600000, grounds: { mill_cellar: { solo: { xp_h: 12400, balance_h: 3100 } } } };
    const card = (bests, hunt) => { const w = M.HL.bestWords(bests, hunt); return { line: M.HL.bestLine(bests, hunt), page: w ? [w.solo, w.party, w.none].filter(Boolean) : null }; };
    const b0 = M.HS.huntBestsOf(characterOf(env));
    const a = card(b0, 'mill_cellar');
    if (a.line !== 'Best 12,400 Level XP/h' || (a.page || []).join('|') !== 'Best alone: 12,400 Level XP/h, balance 3,100 gp/h') fails.push('HS-24 the picker does not show the server’s personal bests: ' + JSON.stringify(a));
    const none = card(b0, 'meadowbrook_thicket');
    if (none.line !== 'No record yet' || (none.page || []).join('|') !== 'No record yet (hunt 10+ min)') fails.push('HS-24 a ground with no best does not say so once: ' + JSON.stringify(none));
    /* The next envelope REPLACES the bests (a better party hunt landed, the solo one is gone from this read). */
    env.hunt_bests = { min_ms: 600000, grounds: { mill_cellar: { party: { xp_h: 20500, balance_h: -450 } } } };
    const b = card(M.HS.huntBestsOf(characterOf(env)), 'mill_cellar');
    if (b.line !== 'Best 20,500 Level XP/h' || (b.page || []).join('|') !== 'Best in a party: 20,500 Level XP/h, balance -450 gp/h') fails.push('HS-24 the picker is not replaced by the next envelope: ' + JSON.stringify(b));
  }

  /* HS-25 THE HUNT SUMMARY: the hunt's balance and the server's balance per hour to everyone; raw XP per hour only to premium;
     a hunt under the rate window (no per_hour) no per-hour row at all. */
  for (const [premium, short] of [[true, false], [false, false], [false, true]]) {
    const env = clone(FIXTURE);
    if (!premium) {
      env.premium = Object.assign({}, env.premium, { active: false });
      env.hunt_analyzer.tier = 'basic';
      delete env.hunt_analyzer.hero.per_hour.raw_xp;
      delete env.hunt_analyzer.hero.per_hour.waste;
      if (short) delete env.hunt_analyzer.hero.per_hour;
    }
    env.hunt = Object.assign({}, env.hunt, { ended: true });
    const tag = premium ? 'premium' : short ? 'short free' : 'free';
    const cs = characterOf(env);
    const s = M.SM.buildSummary(M.SM.endedSessionOf(cs), M.HS.analyzerOf(cs), [], null, null, null);
    const ph = FIXTURE.hunt_analyzer.hero.per_hour;
    const got = s && { balance: s.balance, balanceH: s.balanceH, rawXpH: s.rawXpH };
    const want = { balance: FIXTURE.hunt_analyzer.hero.balance, balanceH: short ? null : ph.balance, rawXpH: premium ? ph.raw_xp : null };
    if (JSON.stringify(got) !== JSON.stringify(want)) fails.push('HS-25 the ' + tag + ' summary shows ' + JSON.stringify(got) + '; the server sent ' + JSON.stringify(want));
  }
  { // HS-25 THE CROSSED RE-READ: the card's residue put has gone but the server has not stored it, so the next re-read's client_state
    // has no card. The card must stay; then the server lands the put and echoes it, and it still stays (src/session/character-session.js).
    const ended = clone(FIXTURE);
    ended.hunt = Object.assign({}, ended.hunt, { ended: true });
    const ecs = characterOf(ended);
    const cardOf = M.SM.buildSummary(M.SM.endedSessionOf(ecs), M.HS.analyzerOf(ecs), [], null, null, null);
    let version = 0, stored = {}, puts = 0;
    const answer = (body) => ({ ok: true, status: 200, body, closed: false });
    const server = {
      rpc: async (name) => {
        if (name === 'hr_load') return answer({ ok: true, version: ++version, state: { gold: 1 }, client_state: clone(stored) });
        if (name === 'hr_put_client_state') { puts++; return answer({ ok: true }); }
        return answer({ ok: false, error: 'unknown' });
      },
      accrue: async () => ({ ok: false, status: 500, body: null, closed: false }),
    };
    let now = 1000;
    const cs = new M.CS.CharacterSession({ slot: 0, uid: UID, server, setTimer: () => 0, clearTimer: () => {}, now: () => now });
    try {
      await cs.load();
      cs.setResidue('huntSummaries', [cardOf]);
      await cs.flushResidue();
      const has = () => !!cs.record && Array.isArray(cs.record.residue.huntSummaries) && cs.record.residue.huntSummaries.some((c) => c && c.id === cardOf.id);
      now += 60000;
      await cs.load();
      const crossed = has();
      stored = { huntSummaries: [cardOf] };
      now += 60000;
      await cs.load();
      if (!puts || !crossed || !has()) fails.push('HS-25 the premium card ' + (puts ? 'blinked out on a re-read that crossed its residue put' : 'was never put'));
    } finally { cs.close(); }
  }

  { // HS-11 a slot that can never fire: the same action under weaker conditions earlier blocks it, and says why
    const env = clone(FIXTURE);
    env.hunt_settings.slots[6] = { action: { type: 'ability', id: 'power_strike' }, conditions: [{ metric: 'enemies_in_aoe', op: 'lte', value: 1 }, { metric: 'self_hp_pct', op: 'gt', value: 50 }], join: 'and', usable: true, mana: 6 };
    const conflicts = (e) => { const set = M.HS.settingsOf(characterOf(e)); return M.AF.conflictsOf(Array.from({ length: M.BD.SLOTS }, (_, k) => M.HS.wireSlot(set.slots[k])), set); };
    const c = conflicts(env);
    const tip = hoverOf(M, characterOf(env), 6).filter((l) => /\bis-warn\b/.test(l.cls) && !/\bis-why\b/.test(l.cls)).map((l) => l.text).join(' ');
    if (!c.has(6) || c.has(0) || !/Never fires: slot 1 \(Power Strike\) goes first/.test(tip)) fails.push('HS-11 the never-firing slot shows no "!" or no reason: ' + tip);
    env.hunt_settings.slots[0] = null;
    if (conflicts(env).has(6)) fails.push('HS-11 emptying the earlier slot did not clear the "!"');
  }

  { // HS-8 IN TOWN: the Spells list and its locks, the Food run, the comparison, the new food slot, Hunt prep
    const env = inTown(clone(FIXTURE));
    let cs = characterOf(env);
    const set = M.HS.settingsOf(cs), skills = M.IS.skillsOf(cs), bag = M.IS.carriedOf(cs), worn = (M.IS.equipmentOf(cs) || {}).ammo;
    const ctx = { discipline: set.discipline, role: set.role, skills, store: set.store, bag, set };
    /* Every spell is listed, the weapon's own first; one it cannot cast wears the lock and says why it will stay struck. */
    const sp = M.AT.tableOf('spells', ctx).runs[0].rows.map((r) => ({ id: r.action.id, locked: !!r.locked, need: r.need || '' }));
    const firstLocked = sp.findIndex((r) => r.locked);
    if (firstLocked < 1 || sp.slice(firstLocked).some((r) => !r.locked)) fails.push('HS-8 the Spells list is not castable first, then locked with the lock showing: ' + JSON.stringify(sp));
    else {
      /* a row locked by its WEAPON says which weapon casts it; one the weapon casts at a later LEVEL in its skill ("Melee 12") is no weapon
         problem: it says its unlock instead, and no weapon sentence */
      const byWeapon = sp.find((r) => r.locked && r.need && !/\d/.test(r.need)), byLevel = sp.find((r) => r.locked && /\d/.test(r.need));
      if (!byWeapon) fails.push('HS-8 no spell is locked by its weapon: ' + JSON.stringify(sp));
      else {
        const w = M.AF.weaponWarning({ type: 'ability', id: byWeapon.id }, set.discipline, set.role, skills);
        if (!/^Requires an? \S.*$/.test(w)) fails.push('HS-8 a locked spell picked does not say which weapon casts it: ' + JSON.stringify(w));
      }
      if (byLevel) {
        const a = { type: 'ability', id: byLevel.id };
        const f = M.AF.factsOf(a, { bag, store: set.store, skills, set, worn });
        const req = f && f.requires ? [f.requires, f.unlock, f.alone].filter(Boolean).join(' · ') : '';
        const weapon = M.AF.weaponWarning(a, set.discipline, set.role, skills);
        if (!req.includes('Unlocks at ' + byLevel.need) || weapon !== '') fails.push('HS-8 a spell its weapon casts at ' + byLevel.need + ' does not say its unlock, or blames the weapon: ' + JSON.stringify([weapon, req]));
      }
    }
    /* THE PLAYER PICKS THE ONE ITEM: the Food run lists every food with its HP a use, gold a use and gold a point from the SERVER's
       rows (hunt_settings.store), cheapest per point first, unpriced last; no "Any food". */
    const run = M.AT.tableOf('food', ctx).runs.find((r) => r.kind === 'food');
    /* each cell as the row's text shows it (configure-action.js writes them as text) */
    const food = run ? run.rows.map((r) => ({ id: r.action.id, cells: M.AT.cellsOf(r).map(String), row: r })) : [];
    const heals = FIXTURE.hunt_settings.store.filter((r) => r.kind === 'heal');
    const priced = food.filter((r) => r.cells[2] !== '—');
    const rowOk = (r) => { const c = heals.find((h) => h.id === r.id); return !!c && r.cells[0] === String(c.heals) && r.cells[1] === String(c.price) && r.cells[2] === (Math.round((c.price / c.heals) * 100) / 100).toFixed(2); };
    if (food.some((r) => r.id === 'food' || r.id === 'drink')) fails.push('HS-8 the table still offers an "Any" row');
    if (priced.length !== heals.length || !priced.every(rowOk)) fails.push('HS-8 the Food run is not the catalogue\'s HP / gold / gold a point: ' + JSON.stringify(priced.map((r) => [r.id, r.cells])));
    else if (priced.some((r, k) => k && Number(r.cells[2]) < Number(priced[k - 1].cells[2]))) fails.push('HS-8 the Food run is not cheapest per point first: ' + JSON.stringify(priced.map((r) => r.cells[2])));
    if (food.slice(0, priced.length).some((r) => r.cells[2] === '—')) fails.push('HS-8 an unpriced row sorts above a priced one');
    /* The hovered row against the pick, and the sentence for the pick. */
    const trout = food.find((r) => r.id === 'salted_trout'), lobster = food.find((r) => r.id === 'salted_lobster');
    const cmp = { lines: trout && lobster ? M.AT.compareLines(lobster.row, trout.row) : null, lead: M.AT.sentenceOf({ type: 'consume', id: 'salted_trout' }) };
    if (JSON.stringify(cmp.lines) !== JSON.stringify(['+96 HP a use', '+140 gold a use', '2.5× the gold per HP']) || cmp.lead.verb !== 'Eat' || cmp.lead.item !== 'Salted Trout') fails.push('HS-8 the comparison or the sentence read ' + JSON.stringify(cmp));
    /* A food slot starts at HP below 50% (Eat at is gone); the player moves it. */
    const start = M.BD.startConditions({ type: 'consume', id: 'salted_trout' });
    if (start.length !== 1 || start[0].metric !== 'self_hp_pct') fails.push('HS-8 a new food slot does not start with its HP condition');
    /* Nobody is told to buy first: with a store food on the bar and an empty bag, Hunt prep reads the store per use. */
    env.hunt_settings.slots[5] = { usable: true, count: 0, action: { type: 'consume', id: 'salted_trout' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 60 }], join: 'and' };
    cs = characterOf(env);
    const prep = M.RD.readinessOf(cs);
    const prepText = prep.checks.map((c) => c.text).join(' | ') + ' | ' + prep.short.join(', ');
    if (!prep.checks.some((c) => /^Food: [^|]*Salted Trout \(40 gp\)/.test(c.text)) || /0 food/.test(prepText)) fails.push('HS-8 Hunt prep does not read the store per use for a store food: ' + prepText.slice(0, 500));
  }
  return fails;
}

/* The 21 mutants of tests/hunt-screen.mjs planted in modules with no DOM, moved here verbatim (lane/c-rules-in-node 2026-11-20).
   Each one's page rule (tests/hunt-screen.mutant-rules.json) is the rule that catches it here. */
const MUTANTS = [
  /* Tyler 10-25: ammo on its own tab (HS-27, HS-7). */
  ['ammo mixed back into Food & drink (HS-27, HS-7)', 'src/shell/action-table.js', [["    return { runs, empty: runs.length ? null : t('bar.no_food') };\n", ''], ["  if (tab !== 'ammo') return { runs, empty: null };\n", '']]],
  ['the struck reason of a food slot ignores the server', 'src/shell/action-facts.js', "    if (sl.why === 'none_left') {", "    if (false) {"],
  ['a maxed skill reads next level in 0:00h', 'src/session/hunt-sections.js', 'return h !== null && h > 0 ? Math.round(h * 3600000) : null;', 'return h !== null ? Math.round(h * 3600000) : null;'],
  ['the analyzer keeps the last numbers when the section goes', 'src/session/hunt-sections.js', "  const a = section(cs, 'hunt_analyzer');\n", "  const a = section(cs, 'hunt_analyzer') || globalThis.__lastA;\n  globalThis.__lastA = a;\n"],
  ['a slot tooltip reads its number with no unit (Tyler 2026-11-08: "at or above 2 what?")', 'src/shell/bar-draft.js', " + c.value + unitWords(m, c.value) + (m.subjectAfter ? subject : '');", " + c.value + (m.subjectAfter ? subject : '');"],
  ['a server validation error is not shown inline', 'src/shell/bar-draft.js', '  else { s.error = r;', '  else { s.error = null;'],
  ['the Food run is sorted by name, not gold per point', 'src/shell/action-table.js', "const byValue = (a, b) => ((a.per === null) - (b.per === null)) || ((a.per || 0) - (b.per || 0))", "const byValue = (a, b) => 0 || 0"],
  ['the store price is not shown in the Food run (HS-8)', 'src/shell/action-table.js', '  const price = srv ? srv.price : null;', '  const price = null;'],
  ['a blocked slot is not flagged', 'src/shell/action-facts.js', "      if (a.action.type === b.action.type && a.action.id === b.action.id) {", "      if (false) {"],
  ['Hunt prep tells a player to buy first', 'src/shell/hunt-go.js', "return c.source === 'store' ? { kind: c.kind, own: null, store: off ? null : store, off }", "return c.source === 'store' ? { kind: c.kind, own: null, store: null, off }"],
  ['insert shifts past the first empty slot', 'src/shell/bar-draft.js', '  while (k < SLOTS && out[k]) k++;', '  k = SLOTS - 1;'],
  ['a drop the server never answers stays pending', 'src/shell/bar-draft.js', '  return Promise.race([sent, late])', '  return Promise.race([sent])'],
  ['a server-refused slot is not struck', 'src/shell/action-facts.js', "  if (sl.usable === false) return SERVER;\n  if (a.type === 'consume') return null;", "  if (a.type === 'consume') return null;"],
  ['the gold to keep shows a client default while unset (HS-27)', 'src/session/hunt-sections.js', "  return Number.isSafeInteger(v) && v >= 0 ? v : null;\n}\n\nexport function analyzerOf", "  return Number.isSafeInteger(v) && v >= 0 ? v : 300;\n}\n\nexport function analyzerOf"],
  ['a slot short of its rune says nothing', 'src/shell/action-facts.js', '    if (sup && !(ownCount(a, bag) > 0)', '    if (false && sup && !(ownCount(a, bag) > 0)'],
  /* lane/b-tank-runes: a spell its weapon casts at a later level says its unlock, never the weapon (HS-8). */
  ['a spell its weapon casts later says nothing of its unlock (HS-8)', 'src/shell/action-facts.js', 'effect, unlock: unlockLine(r),', 'effect, unlock: null,'],
  ['a spell its weapon casts later blames the weapon (HS-8)', 'src/shell/action-facts.js', "  if (!r || r.universal || (disc && r.disciplines.includes(disc))) return '';", "  if (!r || r.universal || (disc && r.disciplines.includes(disc) && !r.unlock)) return '';"],
  ['the bleed badge defaults on for regular monsters', 'src/data/combat-text.js', "label: 'Bleed stack count', on: on(false, true)", "label: 'Bleed stack count', on: on(true, true)"],
  /* Personal bests (HS-24): the picker is the server's, replaced by each envelope. The merge lands on a COPY: envelope records are
     deep-frozen, so writing into one threw in the page (run 39899899955, HARNESS) instead of the merged best being shown. */
  ['the picker merges a best the server no longer sends (HS-24)', 'src/session/hunt-sections.js', "  const b = section(cs, 'hunt_bests');\n", "  const b0 = section(cs, 'hunt_bests');\n  const b = b0 && b0.grounds ? Object.assign({}, b0, { grounds: Object.assign({}, b0.grounds) }) : b0;\n  if (b && b.grounds && globalThis.__hb) for (const [k, v] of Object.entries(globalThis.__hb)) b.grounds[k] = Object.assign({}, v, b.grounds[k]);\n  if (b && b.grounds) globalThis.__hb = b.grounds;\n"],
  /* The summary's balance per hour (HS-25). */
  ['the summary has no balance per hour (HS-25)', 'src/hunt-view/summary-model.js', 'balanceH: ph ? ph.balance : null,', 'balanceH: null,'],
  /* The card survives a re-read that crossed its residue put (HS-25; was a 1-in-N flake 2026-10-22, now forced). */
  ['a re-read that crossed the residue put drops the card (HS-25)', 'src/session/character-session.js', 'this._pending = {}; this._sent = Object.assign({}, this._sent, patch);', 'this._pending = {};'],
];

runPureGuard({ mutate: process.argv.includes('--mutate'), guard: 'tests/hunt-screen-pure.mjs', pure, mutants: MUTANTS,
  green: 'the hunt screen\'s pure rules hold (HS-27, HS-4, HS-5, HS-7, HS-19, HS-20, HS-24, HS-25, HS-11, HS-8)' })
  .then((code) => process.exit(code));
