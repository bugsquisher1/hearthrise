#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/needs-you.mjs — "NEEDS YOU" ON THE RETURN CARD: AT MOST THREE DECISIONS, RANKED, ONE ROW A KIND (designer D-2 section 2.3; lane/c-company FB-6).
//   src/shell/needs-you.js (the card's ranking and block), src/shell/needs-you/*.js (the line providers), src/data/hunt-after.js NEEDS_YOU.
//
//   node tests/needs-you.mjs            the guard (pure Node: the real modules over the alpha envelope, no browser, no database)
//   node tests/needs-you.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: src/shell/needs-you.js src/shell/needs-you/outgrown.js src/session/danger-sections.js src/shell/needs-you/gear-choice.js src/shell/needs-you/death.js src/shell/needs-you/near-death.js src/data/hunt-after.js src/shell/needs-you/recruits.js
// ci-step: client-guards | Needs you on the return card - three at most, ranked, one row a kind, providers by kind
// ci-run: node tests/needs-you.mjs
// ci-run: node tools/mutant-gate.mjs node tests/needs-you.mjs --mutate
//
//   NY-DATA    NEEDS_YOU is valid (bands in order, no kind twice), NEEDS_SHOWN is 3, and the rest plan's ending rows are valid (D-11: no
//              ending runs a hunt); every provider's kind is a NEEDS_YOU row and no two providers share one
//   NY-RANK    rows from every kind, scrambled, with a kind twice, a kind the data does not list and a row with no words: three show, in the
//              data's order, one a kind (the provider's first), and "{n} more" counts the rest
//   NY-NEAR    the hunt report's Near death (FB-7, GR-66) is a row last in the costs band: the lowest fall named first, in the house's
//              voice for its blow, "Change the plan"; a Close hunt, a death and a running hunt are none; three close calls are Near death
//   NY-REGEAR  a hero OUT HUNTING with a plain upgrade in its bag: the row is the visiting press, "Equip upgrades and go back in", for that
//              hero (D-2 rule 8); never for a boss room (rule 9); a hero in town waiting on a choice goes first
//   NY-HEROES  the real providers over four heroes' envelopes (one outgrown, one died with no Blessing on, one with better gear in its bag,
//              one the server's plan refuses for a full bag): the card shows outgrown, cannot start, death, in that order, and one more;
//              with the company's "Wear upgrades" line on, plain gear is not a decision and the count drops
//   NY-TOP     a hero held at a Danger-scale ground's band top has outgrown it, "Go to" the next open scale ground; a step under is none
//   NY-RECRUITS the account's one hero with the server's recruit press ready: "3 recruits are ready to join {Name} at Level 5." with
//              Recruit (opens All characters); a press not ready, or no offer, is no row (Tyler RD-Q6 a, 1053-recruits.sql)
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { harnessFail, verdict } from './_mutant-verdict.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

async function load(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return { N: await import(u('src/shell/needs-you.js')), P: await import(u('src/shell/needs-you/providers.js')), D: await import(u('src/data/hunt-after.js')) };
}

/* A hero as the session reads it: the alpha envelope with its hunt ended for `reason`, its name, and any extra sections. */
function hero(slot, name, reason, extra = {}) {
  const env = clone(FIXTURE);
  env.name = name;
  env.hunt = Object.assign({}, env.hunt, { ended: true, session: Object.assign({}, env.hunt.session || {}, { end_reason: reason, ended_at: '2026-11-21T10:00:00Z' }) });
  Object.assign(env, extra);
  return { slot, status: 'open', read: (k) => env[k] };
}

const ARMS = {
  'NY-DATA': async (X) => {
    const out = [];
    const probs = [...X.D.validateNeeds(), ...X.D.validateRest()];
    if (probs.length) out.push('the rows have problems: ' + probs.join('; '));
    if (X.D.NEEDS_SHOWN !== 3) out.push('NEEDS_SHOWN is ' + X.D.NEEDS_SHOWN + ', D-2 shows three');
    const kinds = X.P.PROVIDERS.map((p) => p.kind);
    const data = X.D.NEEDS_YOU.map((r) => r.kind);
    for (const k of kinds) if (!data.includes(k)) out.push('a provider supplies ' + k + ', which no NEEDS_YOU row lists');
    if (new Set(kinds).size !== kinds.length) out.push('two providers supply one kind: ' + kinds.join(', '));
    /* D-11: no ending runs a hunt, said as its own refusal (the unknown-kind refusal alone would let a `hunt` kind in once REST_RUNS listed it) */
    if (!X.D.validateRest([...X.D.REST_ENDINGS, { id: 'again', runs: 'hunt' }]).includes('again: an ending may not start a hunt')) out.push('an ending that runs a hunt is not refused by name');
    return out;
  },

  'NY-RANK': async (X) => {
    const out = [];
    const rows = [
      { kind: 'ground_opened', text: 'A ground opened.' },
      { kind: 'death', text: 'Wren died.' },
      { kind: 'gear_choice', text: 'Better gear is waiting for 2 heroes.' },
      { kind: 'death', text: 'Bryn died too.' },
      { kind: 'cannot_start', text: '' },
      { kind: 'no_such_kind', text: 'Not a row.' },
      { kind: 'outgrown', text: 'Tess has outgrown Mill Cellar.' },
      { kind: 'tier_offer', text: 'That hunt was Safe.' },
    ];
    const r = X.N.rankNeeds(rows);
    const got = r.shown.map((x) => x.kind + ':' + x.text);
    if (JSON.stringify(got) !== JSON.stringify(['outgrown:Tess has outgrown Mill Cellar.', 'death:Wren died.', 'gear_choice:Better gear is waiting for 2 heroes.'])) out.push('three shown read ' + JSON.stringify(got));
    if (r.more !== 2) out.push('"more" counts ' + r.more + ', want 2 (tier_offer, ground_opened)');
    const few = X.N.rankNeeds([{ kind: 'can_build', text: 'You can build.' }]);
    if (few.shown.length !== 1 || few.more !== 0) out.push('one row reads ' + JSON.stringify(few));
    if (X.N.rankNeeds(null).shown.length !== 0) out.push('no rows shows a row');
    return out;
  },

  'NY-HEROES': async (X) => {
    const out = [];
    const tiers = [1, 2, 3].map((tier) => ({ tier, permille: 250, price: 100, held: false }));
    const peers = [
      hero(0, 'Tess', 'outgrown'),
      hero(1, 'Wren', 'died', { blessings: { tiers, permille: 0 },
        death_log: [{ id: 7, at: '2026-11-21T09:00:00Z', hunt: 'mill_cellar', session: FIXTURE.hunt.session_id, monster: 'rat', xp: 4200, xp_lost: { level: 4200 } }] }),
      hero(2, 'Bryn', 'stamina', { equipment: {}, inventory: Object.assign({}, FIXTURE.inventory, { bronze_helm: 1 }) }),
      hero(3, 'Dorn', 'stamina'),
    ];
    const plan = { heroes: [{ slot: 3, state: 'no', why: 'bag_full', name: 'Dorn' }] };
    const off = X.N.rankNeeds(X.N.needsRowsOf({ peers: () => peers, plan, wearOn: false }));
    const kinds = off.shown.map((r) => r.kind);
    if (JSON.stringify(kinds) !== '["outgrown","cannot_start","death"]' || off.more !== 1) out.push('with the line off the card reads ' + JSON.stringify(off));
    const say = Object.fromEntries(off.shown.map((r) => [r.kind, r.text]));
    if (say.outgrown !== 'Tess has outgrown Mill Cellar.') out.push('the outgrown row reads ' + JSON.stringify(say.outgrown));
    if (say.cannot_start !== 'Dorn\'s bag is full.') out.push('the cannot start row reads ' + JSON.stringify(say.cannot_start));
    if (say.death !== 'Wren died · Death cost 4,200 Level XP · No Blessing active') out.push('the death row reads ' + JSON.stringify(say.death));
    if (off.shown.some((r) => /[;—–]/.test(r.text))) out.push('a row has a semicolon or a dash');
    const all = X.N.needsRowsOf({ peers: () => peers, plan, wearOn: false });
    const gear = all.find((r) => r.kind === 'gear_choice');
    if (!gear || !/^Better gear is waiting for \d+ heroe?s?\.$/.test(gear.text)) out.push('the gear row reads ' + JSON.stringify(gear));
    /* with the company's line on, plain gear goes on at the next Start by itself: no decision */
    const on = X.N.rankNeeds(X.N.needsRowsOf({ peers: () => peers.map((p) => (p.slot === 2 ? p : p)), plan, wearOn: true }));
    const onGear = X.N.needsRowsOf({ peers: () => [peers[2]], plan: null, wearOn: true }).find((r) => r.kind === 'gear_choice');
    if (onGear) out.push('with the line on, plain gear is still a decision: ' + JSON.stringify(onGear));
    if (on.more > off.more) out.push('the line on made more rows: ' + JSON.stringify(on));
    return out;
  },
};

/* NY-NEAR (lane/c-hunt-report FB-7, GR-66): the hunt report's Near death is a decision row, kind `near_death`, last in its band (after
   gear_choice): the hero whose last hunt fell lowest is named, in the house's voice for its blow, with "Change the plan" (Hunt prep). A Close
   hunt, a hero who died (its own row) and a hero still hunting are none; three close calls make Near death without a deep fall. */
ARMS['NY-NEAR'] = async (X) => {
  const out = [];
  const withReport = (slot, name, reason, report, ended = true) => {
    const p = hero(slot, name, reason);
    const env = { hunt: clone(p.read('hunt')) };
    env.hunt.ended = ended;
    env.hunt.session = Object.assign({}, env.hunt.session, { tally: Object.assign({}, (env.hunt.session || {}).tally || {}, { report }) });
    return { slot, status: 'open', read: (k) => (k in env ? env[k] : p.read(k)) };
  };
  const low = (pm, by, blow) => ({ low: { pm, by, blow, at: 1 }, close: 1 });
  const peers = [
    withReport(0, 'Tess', 'stamina', low(420, 'rat', 'basic')),                 // Close: no row
    withReport(1, 'Wren', 'stamina', low(80, 'rat', 'basic')),                  // Near death, 8%
    withReport(2, 'Bryn', 'stamina', low(30, 'barn_spider', 'venom_spray')),    // Near death, 3%: the lowest, named first
    withReport(3, 'Dorn', 'died', low(0, 'rat', 'basic')),                      // died: the death row's
  ];
  const row = X.N.needsRowsOf({ peers: () => peers, plan: null, wearOn: true }).find((r) => r.kind === 'near_death');
  if (!row || row.slot !== 2 || row.go !== 'prep' || row.label !== 'Change the plan') out.push('the row reads ' + JSON.stringify(row));
  else if (!/^Bryn near death \(3% health, .+, .+\)$/.test(row.text) || /[;—–:]/.test(row.text)) out.push('the row\'s words: ' + row.text);
  const swing = X.N.needsRowsOf({ peers: () => [peers[1]], plan: null, wearOn: true }).find((r) => r.kind === 'near_death');
  if (!swing || !/^Wren near death \(8% health, [^,]+\)$/.test(swing.text)) out.push('a swing reads ' + JSON.stringify(swing && swing.text));
  const calls = withReport(1, 'Wren', 'stamina', { low: { pm: 600, by: 'rat', blow: 'basic', at: 1 }, close: 3 });
  if (!X.N.needsRowsOf({ peers: () => [calls], plan: null, wearOn: true }).some((r) => r.kind === 'near_death')) out.push('three close calls are not Near death');
  const quiet = [peers[0], peers[3], withReport(1, 'Wren', 'stamina', low(80, 'rat', 'basic'), false)];
  if (X.N.needsRowsOf({ peers: () => quiet, plan: null, wearOn: true }).some((r) => r.kind === 'near_death')) out.push('a Close hunt, a death or a hunt still running made the row');
  const data = X.D.NEEDS_YOU.map((r) => r.kind);
  if (!(data.indexOf('near_death') === data.indexOf('gear_choice') + 1 && data.indexOf('fell_back') === data.indexOf('near_death') + 1
        && X.D.NEEDS_YOU[data.indexOf('fell_back')].band === 'costs')) out.push('near_death and fell_back are not last in the costs band: ' + data.join(', '));
  return out;
};

/* NY-REGEAR: a hero OUT HUNTING with a plain upgrade in its bag (nothing changes inside a hunt, D-2 rule 7): the row's press is the visiting
   player's "Equip upgrades and go back in" for that hero; never for a boss room (rule 9); a hero in town waiting on a choice goes first. */
ARMS['NY-REGEAR'] = async (X) => {
  const out = [];
  const { BOSS_CALLS } = await import(pathToFileURL(join(ROOT, 'src/data/boss-calls.js')).href);
  const room = Object.values(BOSS_CALLS)[0].hunt;
  const out0 = (slot, hunt) => {
    const env = clone(FIXTURE);
    env.name = 'Wren';
    env.equipment = {};
    env.inventory = Object.assign({}, FIXTURE.inventory, { bronze_platebody: 1 });
    env.hunt = Object.assign({}, env.hunt, { hunt_id: hunt, ended: false, session: Object.assign({}, env.hunt.session || {}, { end_reason: null }) });
    return { slot, status: 'open', read: (k) => env[k] };
  };
  const r1 = X.N.needsRowsOf({ peers: () => [out0(2, 'mill_cellar')], plan: null, wearOn: true }).find((r) => r.kind === 'gear_choice');
  if (!r1 || r1.go !== 'regear' || r1.label !== 'Equip upgrades and go back in' || JSON.stringify(r1.slots) !== '[2]' || r1.text !== '1 hero out hunting holds better gear.') out.push('a hero out hunting reads ' + JSON.stringify(r1));
  const r2 = X.N.needsRowsOf({ peers: () => [out0(2, room)], plan: null, wearOn: true }).find((r) => r.kind === 'gear_choice');
  if (r2) out.push('a boss room offers the press: ' + JSON.stringify(r2));
  const town = hero(1, 'Bryn', 'stamina', { equipment: {}, inventory: Object.assign({}, FIXTURE.inventory, { bronze_helm: 1 }) });
  const r3 = X.N.needsRowsOf({ peers: () => [out0(2, 'mill_cellar'), town], plan: null, wearOn: false }).find((r) => r.kind === 'gear_choice');
  if (!r3 || r3.go !== 'bag' || r3.slot !== 1) out.push('a hero in town waiting on gear does not go first: ' + JSON.stringify(r3));
  return out;
};

/* NY-RECRUITS (Tyler RD-Q6 a, 1053-recruits.sql): the account's one hero whose server section says the recruit press is ready reads
   "3 recruits are ready to join {Name} at Level 5." with Recruit, which opens All characters (go 'recruits'); a press not ready yet, or no
   section (a company of two or more, the press made), is no row. */
ARMS['NY-RECRUITS'] = async (X) => {
  const out = [];
  const offer = (ready) => ({ recruits: { ready, at: 5, level: 5, first: 0, slots: [1, 2, 3], sets: ['tank', 'healer', 'ranger'] } });
  const row = (peers) => X.N.needsRowsOf({ peers: () => peers, plan: null, wearOn: true }).find((r) => r.kind === 'recruits');
  const r1 = row([hero(0, 'Tess', 'stamina', offer(true))]);
  if (!r1 || r1.text !== '3 recruits are ready to join Tess at Level 5.' || r1.label !== 'Recruit' || r1.go !== 'recruits' || r1.slot !== 0) out.push('a ready press reads ' + JSON.stringify(r1));
  const r2 = row([hero(0, 'Tess', 'stamina', offer(false))]);
  if (r2) out.push('a press not ready yet is a row: ' + JSON.stringify(r2));
  const r3 = row([hero(0, 'Tess', 'stamina', { recruits: null }), hero(1, 'Bryn', 'stamina', { recruits: null })]);
  if (r3) out.push('a company with no offer is a row: ' + JSON.stringify(r3));
  if (r1 && /[;—–]/.test(r1.text)) out.push('the recruits row has a semicolon or a dash');
  return out;
};

/* NY-HELD (R7 art pass 2026-11-22, the away card read "Go to Meadowbrook Thicket" twice: the outgrown row's press and the hero's own gold
   one): a row whose move the card already carries for that hero keeps its words and drops its press; another hero's, another move, or
   nothing held keeps it. The return card hands patchNeeds the moves its hero blocks carry. */
ARMS['NY-HELD'] = async (X) => {
  const out = [];
  const row = X.N.needsRowsOf({ peers: () => [hero(0, 'Tess', 'outgrown')], plan: null, wearOn: true }).find((r) => r.kind === 'outgrown');
  if (!row || row.go !== 'ground' || row.slot !== 0) { out.push('the outgrown row reads ' + JSON.stringify(row)); return out; }
  if (!X.N.pressHeld(row, ['ground:0'])) out.push('the row keeps a press the card already carries for Tess');
  if (X.N.pressHeld(row, ['ground:1']) || X.N.pressHeld(row, ['again:0']) || X.N.pressHeld(row, []) || X.N.pressHeld(row, undefined)) out.push('a press the card does not carry is dropped');
  const away = readFileSync(join(ROOT, 'src/shell/windows/away.js'), 'utf8');
  if (!/needStateOf\(ctx\), \{ held \}/.test(away)) out.push('the return card does not hand patchNeeds the moves its hero blocks carry');
  return out;
};

/* NY-TOP (lane/r10-more-grounds; 12-targets.md 3.2): a hero whose held step on a Danger-scale ground is the band's top (the server's `danger`
   section) has outgrown it: "{Name} has outgrown {ground}." with "Go to {next}", the next OPEN ground on the scale (Hask's Ford's is Muster
   Barrows); one step under the top is no row; a ground the server never named held is none. */
ARMS['NY-TOP'] = async (X) => {
  const out = [];
  const FORD = 'hasks_ford', MUSTER = 'muster_barrows';
  const { DANGER_GROUNDS } = await import(pathToFileURL(join(ROOT, 'src/data/danger.js')).href);
  const top = DANGER_GROUNDS[FORD].topStep;
  const at = (held) => hero(0, 'Tess', 'stamina', { danger: { risk: 'steady', held: { [FORD]: held }, playing: { hunt: FORD, from: 'steady', risk: 'steady', start: 0, step: held, cool: 0 } } });
  const rowAt = (held) => X.N.needsRowsOf({ peers: () => [at(held)], plan: null, wearOn: true }).find((r) => r.kind === 'outgrown') || null;
  const row = rowAt(top);
  if (!row || row.go !== 'ground' || row.slot !== 0 || row.hunt !== MUSTER || !/^Ready for: (The )?Muster Barrows$/.test(row.text) || row.label !== 'Go') out.push('a hero held at the top reads ' + JSON.stringify(row));
  if (rowAt(top - 1)) out.push('a hero one step under the top was told it outgrew the ground');
  /* Muster's top: the next ground up the scale (the Catacomb wings) is staged, so the end of the open road */
  const mTop = DANGER_GROUNDS[MUSTER].topStep;
  const mt = X.N.needsRowsOf({ peers: () => [hero(0, 'Tess', 'stamina', { danger: { risk: 'steady', held: { [MUSTER]: mTop },
    playing: { hunt: MUSTER, from: 'steady', risk: 'steady', start: 0, step: mTop, cool: 0 } } })], plan: null, wearOn: true }).find((r) => r.kind === 'outgrown');
  if (!mt || mt.text !== 'Max depth reached' || mt.label !== '' || mt.hunt !== null) out.push('Muster held at its top reads ' + JSON.stringify(mt));
  const none = X.N.needsRowsOf({ peers: () => [hero(0, 'Tess', 'stamina', { danger: { risk: 'steady', held: {}, playing: null } })], plan: null, wearOn: true });
  if (none.some((r) => r.kind === 'outgrown')) out.push('a hero with nothing held was told it outgrew a ground');
  return out;
};

const MUTANTS = [
  ['the top is never outgrown', 'NY-TOP', 'src/session/danger-sections.js', 'd.held[hunt] >= DANGER_GROUNDS[hunt].topStep', 'd.held[hunt] > DANGER_GROUNDS[hunt].topStep'],
  ['outgrown a step under the top', 'NY-TOP', 'src/session/danger-sections.js', 'd.held[hunt] >= DANGER_GROUNDS[hunt].topStep', 'd.held[hunt] >= DANGER_GROUNDS[hunt].topStep - 1'],
  ['a staged ground is the next one', 'NY-TOP', 'src/session/danger-sections.js', 'if (!h || h.staged === true || ', 'if (!h || '],
  ['the top row names no next ground', 'NY-TOP', 'src/shell/needs-you/outgrown.js', '      const next = nextScaleGround(ground);', '      const next = null;'],
  ['a press the card carries is kept on its row', 'NY-HELD', 'src/shell/needs-you.js', "&& held.includes(row.go + ':' + row.slot)", '&& false'],
  ['any held move drops the press', 'NY-HELD', 'src/shell/needs-you.js', "&& held.includes(row.go + ':' + row.slot)", '&& held.length > 0'],
  ['the recruits row shows before the press is ready', 'NY-RECRUITS', 'src/shell/needs-you/recruits.js', '      if (!o || !o.ready) continue;\n', '      if (!o) continue;\n'],
  ['the recruits row opens nothing', 'NY-RECRUITS', 'src/shell/needs-you/recruits.js', "go: 'recruits', slot: cs.slot", 'slot: cs.slot'],
  ['the visiting press is offered for a boss room', 'NY-REGEAR', 'src/shell/needs-you/gear-choice.js', '!!hunt && !roomOfHunt(hunt) && ', '!!hunt && '],
  ['a hero out hunting is never offered the press', 'NY-REGEAR', 'src/shell/needs-you/gear-choice.js', 'if (plan.picks.length && regearable(h.huntId)) hunting.push(cs);', 'void regearable;'],
  ['the rows lose the data\'s order', 'NY-RANK', 'src/shell/needs-you.js', '  const all = [...byKind.values()].sort((a, b) => RANK.get(a.kind) - RANK.get(b.kind));', '  const all = [...byKind.values()];'],
  ['four rows show', 'NY-RANK', 'src/shell/needs-you.js', 'return { shown: all.slice(0, shown), more: Math.max(0, all.length - shown) };', 'return { shown: all.slice(0, shown + 1), more: Math.max(0, all.length - shown - 1) };'],
  ['a kind shows twice', 'NY-RANK', 'src/shell/needs-you.js', " || byKind.has(r.kind)) continue;\n    byKind.set(r.kind, r);", ") continue;\n    byKind.set(r.kind + byKind.size, Object.assign({}, r));"],
  ['plain gear is a decision with the line on', 'NY-HEROES', 'src/shell/needs-you/gear-choice.js', 'if ((!ctx.wearOn && plan.picks.length) || plan.choices.length)', 'if (plan.picks.length || plan.choices.length)'],
  ['a death with a Blessing missing is not a row', 'NY-HEROES', 'src/shell/needs-you/death.js', "h.endReason !== 'died' || blessingsMissing(cs) !== true", "h.endReason !== 'died' || blessingsMissing(cs) !== false"],
  ['an ending may run a hunt', 'NY-DATA', 'src/data/hunt-after.js', "    if (/hunt/.test(c.runs)) out.push(c.id + ': an ending may not start a hunt');\n", ''],
  ['four shown by the data', 'NY-DATA', 'src/data/hunt-after.js', 'export const NEEDS_SHOWN = 3;', 'export const NEEDS_SHOWN = 4;'],
  ['a hero who died is also near death', 'NY-NEAR', 'src/shell/needs-you/near-death.js', "if (!h || !h.ended || h.endReason === 'died') continue;", 'if (!h || !h.ended) continue;'],
  ['a Close hunt is a decision', 'NY-NEAR', 'src/shell/needs-you/near-death.js', "riskWord(r.low.pm, r.close) !== 'near'", "riskWord(r.low.pm, r.close) === 'safe'"],
  ['the highest fall is named first', 'NY-NEAR', 'src/shell/needs-you/near-death.js', 'near.sort((a, b) => a.low.pm - b.low.pm || a.cs.slot - b.cs.slot);', 'near.sort((a, b) => b.low.pm - a.low.pm || a.cs.slot - b.cs.slot);'],
];

async function runAll(X, only) {
  const fails = [];
  for (const [id, arm] of Object.entries(ARMS)) {
    if (only && id !== only) continue;
    let got;
    /* a throw is HARNESS, never its arm's red (tests/_mutant-verdict.mjs): a crash cannot score a mutant */
    try { got = await arm(X); } catch (e) { fails.push(harnessFail(id, e)); continue; }
    for (const g of got) fails.push(id + ' ' + g);
  }
  return fails;
}

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await runAll(await load(ROOT));
    for (const f of fails) console.log('✗ ' + f);
    console.log(fails.length ? `needs-you: ${fails.length} RED` : `needs-you: green (${Object.keys(ARMS).join(', ')})`);
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await runAll(await load(ROOT));
  if (clean.length) { console.error('needs-you --mutate: the clean tree is red: ' + clean.join(' | ')); process.exit(2); }
  let escaped = 0, harness = 0;
  for (const [name, arm, file, find, repl] of MUTANTS) {
    const dir = mkdtempSync(join(tmpdir(), 'hr-ny-'));
    try {
      cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true, filter: (s) => !/\.(png|webp|jpg|ogg|mp3)$/.test(s) });
      const f = join(dir, file);
      const src = readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
      if (src.split(find).length !== 2) { console.error(`HARNESS: ${file} has no single ${JSON.stringify(find.slice(0, 60))}`); process.exit(2); }
      writeFileSync(f, src.replace(find, () => repl));
      /* caught only by a line its arm named; a throw is HARNESS (exit 2), nothing at all an escape */
      const v = verdict(await runAll(await load(dir), arm));
      if (v.kind === 'caught') console.log(`  caught  ${name} (${v.rule}): ${v.line.slice(0, 140)}`);
      else if (v.kind === 'harness') { console.log(`  HARNESS ${name} (${arm}): ${v.why.slice(0, 140)}`); harness++; }
      else { console.log(`  ESCAPED ${name} (${arm})`); escaped++; }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  console.log(escaped || harness ? `needs-you --mutate: ${escaped} ESCAPED, ${harness} HARNESS`
    : `needs-you --mutate: ${MUTANTS.length}/${MUTANTS.length} caught, each by its named arm`);
  process.exit(escaped ? 1 : harness ? 2 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
