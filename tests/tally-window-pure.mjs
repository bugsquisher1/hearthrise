#!/usr/bin/env node
// mutant-rule-functions: pure
// ════════════════════════════════════════════════════════════════════════
// tests/tally-window-pure.mjs — TAMSIN'S TALLY: THE RULES THAT NEED NO BROWSER, PROVEN IN NODE.
//
//   node tests/tally-window-pure.mjs                    the rules
//   node tests/tally-window-pure.mjs --mutate           every planted defect must turn a rule RED
//   node tests/tally-window-pure.mjs --mutate --only <words>   only the mutants whose name holds <words>
//
// ci-step: client-guards | Tally window rules that need no browser (the tally's pure half)
// ci-run: node tests/tally-window-pure.mjs
// ci-run: node tools/mutant-gate.mjs node tests/tally-window-pure.mjs --mutate
//
// mutant-anchors: src/shell/windows/tally.js src/session/tally-sections.js src/session/tally-intents.js src/data/text/tally.js src/styles/windows.css
// mutant-writes-tree: no — every mutant is planted into a temp copy of src (tests/_pure-guard.mjs planted)
//
// WHY (architecture audit item 8; lane/c-rules-in-node 2026-11-20). tests/tally-window.mjs was the fourth most expensive guard CI runs
// (the most expensive with rules to move after hunt-screen and client-boot: tests/perf-budget.mjs measures the page itself): nightly
// 44730692384 spent 4,131 job-seconds on it, and every one of its 61 mutants ran ALL its rules in a page (no stop at the first red),
// 52-121 s each. Twelve were planted where no page is needed: her words (src/data/text/tally.js), the stylesheets' `content:` text,
// the section reader and the HUD line (src/session/tally-sections.js), the Take intent's body (src/session/tally-intents.js) and the
// window's pure helpers (src/shell/windows/tally.js keeperSay, cutMarks, sharedPieces, takeWhyOf, suggestedWeight, faceOf). They cost
// 725 s of that nightly; here each is caught in about a second, by the rule id that caught it in the page (that run's log).
//
// THE SPLIT KEEPS EVERY CATCH. TW-9's source scan, TW-18's stylesheet scan and the pure halves of TW-15 and TW-17 never needed the
// page (they ran beside it, from the repository) and moved here whole; tests/tally-window.mjs keeps every page rule (what her window,
// the HUD and the Hunts list show, where, and what a press sends). Her words per state, the marks, the HUD line, the Take's body,
// the weight that suits and the fail-safe read run here through the readers the window calls, on the page's own fixture
// (tests/fixtures/alpha-envelope.json with the same `tally` section and board); a mirror of the window's composition is said where
// it is one (the marks per entry, the justPaid it hands keeperSay): a drift there is the page's red.
//
//   TW-9  HER WORDS in plain English: no string a player can read from her (data, window, HUD, refusals, alerts, the log) keeps the
//         riddles it replaced
//   TW-18 NO WORDS OR SEPARATORS DRAWN BY CSS: a `content:` text is invisible to page text, copy and screen readers (allowed: '', one
//         icon glyph alone on a control, the launcher's hover tip)
//   TW-1  her ledger entries cut the server's count in tenths (Gray Wolves 112 / 200: five of ten; the done Giant Rats: all ten)
//   TW-6  the HUD's tally and the hunt list read the server's count ("Gray Wolves 112/200")
//   TW-3  Take sends ONE hr_tally_accept with catalogue ids only (no count, no price)
//   TW-13 A FIRST VISIT: the weight that suits (the worn set's, else the role's) is said once, on her pick line; with nothing to go
//         on there is no guess, and her board says to pick a weight first
//   TW-14 HER LINE PER STATE: first visit, just taken, counting (hunting, and here), done in town and while hunting, just paid, the
//         day's pay used up, her board
//   TW-15 SHE GIVES IT ONCE: her answer's rows carry pick.kind (tally-intents.js boardRow) and sharedPieces reads that; the marks,
//         the reset, no line without a tally
//   TW-17 THE CREATURE'S HEAD: a creature in the head set has a face, one the set lacks none
//   TW-7  FAIL SAFE: with no tally section nothing is read and she says nothing
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, runPureGuard } from './_pure-guard.mjs';

const BASE_ENV = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
/* The page's fixture (tests/tally-window.mjs): her section and her board. */
const ORDER = ['helmet', 'body', 'pants', 'boots', 'gloves', 'belt'];
const TALLY = {
  held: [
    { place: 1, task: 'thicket_gray_wolves', hunt: 'meadowbrook_thicket', monster: 'gray_wolf', kills: 112, target: 200, keep: false, done: false, done_at: null, wait: null },
    { place: 2, task: 'cellar_giant_rats', hunt: 'mill_cellar', monster: 'rat', kills: 120, target: 120, keep: true, done: true, done_at: '2026-10-23T10:00:00.000Z', wait: null }],
  paid_today: 1, per_day: 3, held_max: 3, weight: 'light', order: ORDER, recent: [], day_ends_at: '2025-10-17T18:00:00.000Z',
};
const BOARD = { ok: true, hunting: false, tally: TALLY, board: [
  { task: 'cellar_giant_rats', hunt: 'mill_cellar', monster: 'rat', target: 120, gold: 100, party: false, band_min: 1, held: true, pick: { pick: 'material', item: 'slime_gel', qty: 4 } },
  { task: 'thicket_gray_wolves', hunt: 'meadowbrook_thicket', monster: 'gray_wolf', target: 200, gold: 480, party: false, band_min: 5, held: true, pick: { pick: 'piece', item: 'apprentice_body', qty: 1 } },
  { task: 'glade_poachers', hunt: 'mosslight_glade', monster: 'glade_poacher', target: 60, gold: 920, party: false, band_min: 16, held: false, pick: { pick: 'piece', item: 'adept_helmet', qty: 1 } },
  { task: 'wickstead_turncoats', hunt: 'wickstead', monster: 'turncoat', target: 50, gold: 780, party: false, band_min: 8, held: false, pick: { pick: 'piece', item: 'adept_helmet', qty: 1 } }] };
const TOWN = { hunt: null, state: Object.assign(clone(BASE_ENV.state), { active_kind: 'idle', active_id: null }), tally: TALLY };

/* TW-9 THE WORDS (Tyler 2026-10-24: "this is weird dialogue"; 2026-11-11: Tamsin in the first person, one line per state). */
const FIRST_LINE = 'I kept the mill\'s rats down myself for thirty years. Then they got a king, so now I pay people to do it. Take one off my board.';
const OLD_WORDS = /half of the stick|piece for your back|tally-keeper|picks for|her pick for you|tallies a day|you hold no tally|loads from the server|Tamsin has work/i;
const COPY_FILES = ['src/data/tally-tasks.js', 'src/data/text/tally.js', 'src/shell/windows/tally.js', 'src/session/tally-sections.js', 'src/shell/widgets/tally-hud.js',
  'src/data/refusal-words.js', 'src/data/alerts.js', 'src/shell/alerts.js', 'src/hunt-view/combat-log.js'];
/* TW-18 NO WORDS OR SEPARATORS DRAWN BY CSS (lane a-first-board-copy, 2026-11-13: "Paid today 0 of 3resets in 24 h", "Mill CellarLevel 1",
   "HuntsMill Cellar"): a dot, arrow-between-words or label is markup. Allowed: '' (a box), ONE icon glyph standing alone on a control (a
   fold triangle, a page chevron), and the launcher's hover tip, which repeats its button's own label (CSS_CONTENT_OK). */
const ICON_GLYPH = /^(?:\\(?:203[9A]|25B[48ACE]|25C[24])|[‹›▴▸▾◂])$/i;
const CSS_CONTENT_OK = new Set(['src/styles/shell.css|attr(data-tip) "  " attr(data-key)']);
function cssWords(base) {
  const out = [];
  const dir = join(base, 'src/styles');
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.css')).sort()) {
    const f = 'src/styles/' + name;
    const src = readFileSync(join(dir, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of src.matchAll(/(?:^|[;{\s])content:\s*([^;}]+)/g)) {
      const v = m[1].trim();
      if (v === 'none' || v === 'normal' || /^(['"])\1$/.test(v) || CSS_CONTENT_OK.has(f + '|' + v)) continue;
      const lit = v.match(/^(['"])(.*)\1$/);
      if (lit && ICON_GLYPH.test(lit[2])) continue;
      out.push(f + ' draws ' + v + ' in CSS: make it text in the markup');
    }
  }
  return out;
}

/** The modules the rules read, from `base` (the repository, or a temp copy of src with a mutant planted). */
async function modulesOf(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  return { TS: await imp('src/session/tally-sections.js'), TI: await imp('src/session/tally-intents.js'), TW: await imp('src/shell/windows/tally.js'),
    HS: await imp('src/session/hunt-sections.js'), IS: await imp('src/session/item-sections.js'), PT: await imp('src/render/player-text.js') };
}
/** A character the readers read (the page's `open(sections)`: the fixture with these sections over it). */
const characterOf = (sections) => { const e = Object.assign(clone(BASE_ENV), clone(sections)); return { slot: 0, status: 'ready', read: (k) => e[k], load: async () => {} }; };

/* mutant-rules-start */
/** Every rule, in the page's order (its first red line names the rule the page's verdict did). */
async function pure(base) {
  const M = await modulesOf(base);
  const fails = [];

  /* TW-9 no string a player can read from her keeps the riddles (the strings only: a comment may tell her lore) */
  for (const f of COPY_FILES) {
    const strings = readFileSync(join(base, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').match(/'(?:[^'\\\n]|\\.)*'/g) || [];
    const hit = strings.find((s) => OLD_WORDS.test(s));
    if (hit) fails.push('TW-9 ' + f + ' still says ' + hit);
  }
  for (const f of cssWords(base)) fails.push('TW-18 ' + f);

  { // TW-1, TW-6, TW-3, TW-14 in town: the server's tallies, her ledger's marks, the HUD and hunt-list line, Take's body, her line
    const cs = characterOf(TOWN);
    const tally = M.TS.tallyOf(cs);
    const held = tally ? tally.held : [];
    /* the entries' marks: tally.js patchEntry cuts cutMarks(kills, target, done) of MARKS */
    const cut = held.map((h) => [h.task, M.TW.cutMarks(h.kills, h.target, h.done)]);
    if (JSON.stringify(cut) !== JSON.stringify([['thicket_gray_wolves', 5], ['cellar_giant_rats', 10]])) fails.push('TW-1 the entries\' marks read ' + JSON.stringify(cut) + ' (want the wolves five of ten, the done rats all ten)');
    const hud = held.map(M.TS.tallyLine);
    if (!hud.includes('Gray Wolves 112/200')) fails.push('TW-6 the HUD tally reads ' + JSON.stringify(hud));
    const card = M.TS.heldOn(tally, 'meadowbrook_thicket').map(M.TS.tallyLine);
    if (JSON.stringify(card) !== JSON.stringify(['Gray Wolves 112/200'])) fails.push('TW-6 the Thicket\'s hunt line reads ' + JSON.stringify(card));
    /* TW-3: Take sends ONE hr_tally_accept naming the slot, the task and the weight (none: the server keeps the hero's), and a key */
    const tk = [];
    const account = { server: { rpc: async (name, body) => { tk.push({ name, body }); return { ok: true, status: 200, body: { ok: true }, closed: false }; } } };
    await M.TI.takeTask(account, cs, 'glade_poachers', null);
    if (tk.length !== 1 || tk[0].name !== 'hr_tally_accept' || tk[0].body.p_task !== 'glade_poachers' || tk[0].body.p_slot !== 0 || tk[0].body.p_weight !== null
      || Object.keys(tk[0].body).sort().join() !== 'p_idem,p_slot,p_task,p_weight') fails.push('TW-3 Take sent ' + JSON.stringify(tk.map((c) => c.body)));
    const voice = M.TW.keeperSay(tally, false, false);
    if (voice !== 'That\'s all 120. Let me get your pay.') fails.push('TW-14 with a done task in town she says ' + JSON.stringify(voice));
    const hunting = M.TW.keeperSay(M.TS.tallyOf(characterOf({ tally: TALLY })), true, false);
    if (hunting !== 'That\'s all 120. Come back to town and I\'ll pay you.') fails.push('TW-14 done while hunting she says ' + JSON.stringify(hunting));
  }

  { // TW-13 A FIRST VISIT: the weight that suits said once (on her pick line, never again over her board); nothing to go on, no guess
    const fresh = Object.assign(clone(TALLY), { held: [], recent: [], weight: null, paid_today: 0 });
    /* tally.js patch: suggest = suggestedWeight(equipmentOf(cs), (settingsOf(cs) || {}).role), for a tally with no weight */
    const suggestOf = (cs) => M.TW.suggestedWeight(M.IS.equipmentOf(cs), (M.HS.settingsOf(cs) || {}).role);
    const cs = characterOf(Object.assign(clone(TOWN), { tally: fresh }));
    const tally = M.TS.tallyOf(cs), suggest = suggestOf(cs);
    const why = M.TW.takeWhyOf(tally, false, suggest);
    if (!suggest || suggest.weight !== 'medium') fails.push('TW-13 a first visit asked ' + JSON.stringify(suggest) + ' (want medium: the fixture\'s Leather Boots)');
    else if (why && why === suggest.words) fails.push('TW-13 the weight line is said twice: ' + JSON.stringify({ why, pick: suggest.words }));
    else if (why) fails.push('TW-13 a first visit reads ' + JSON.stringify({ why }));
    const bare = characterOf(Object.assign(clone(TOWN), { tally: fresh, equipment: { weapon: 'iron_sword' } }));
    /* a guess here has no role to word it by, so it can throw rather than return: either way it is a guess (the page's patch then fails too) */
    let none;
    try { none = suggestOf(bare); } catch (e) { none = { threw: String(e && e.message).slice(0, 160) }; }
    const bareWhy = none && none.threw ? '' : M.TW.takeWhyOf(M.TS.tallyOf(bare), false, none);
    if (none !== null || !/^Pick an armor weight first/.test(bareWhy)) fails.push('TW-13 with no worn weight and no role her board reads ' + JSON.stringify({ guess: none, why: bareWhy }));
    /* TW-14 FIRST VISIT: her story (it outlives the weight's answer) */
    const first = M.TW.keeperSay(tally, false, false, true);
    if (first !== FIRST_LINE) fails.push('TW-14 on a first visit she says ' + JSON.stringify(first));
  }

  { // TW-14 HER LINE PER STATE (mocks 2026-11-11, Tyler: "plain / confusing / boring"): just taken, counting while hunting, just paid, the day's pay used up
    const held = (kills, target, task, hunt, monster, done = false) => ({ place: 1, task, hunt, monster, kills, target, keep: false, done, done_at: done ? '2025-10-17T11:00:00.000Z' : null, wait: null });
    const wolves = (kills, done) => held(kills, 200, 'thicket_gray_wolves', 'meadowbrook_thicket', 'gray_wolf', done);
    /* [name, hunting, justPaid (tally.js: a pay within PAID_FRESH_MS of the server's now), her section, her line] */
    const cases = [
      ['taken', false, false, { held: [wolves(0)], paid_today: 0 }, '200 Gray Wolves in Meadowbrook Thicket. Every kill counts, even while you\'re away, so off you go.'],
      ['hunting', true, false, { held: [wolves(112)], paid_today: 0 }, '112 down, 88 to go. Every one counts, even while you\'re away.'],
      ['here', true, false, { held: [held(9, 25, 'cellar_giant_rats', 'mill_cellar', 'rat')], paid_today: 0 }, '9 down, 16 to go. Every one counts, even while you\'re away.'],
      ['paid', false, true, { held: [], paid_today: 1, recent: [{ claim: 'c9', at: '2025-10-17T11:40:00.000Z', task: 'cellar_giant_rats', gold: 100, item: 'slime_gel', qty: 4, pick: 'material' }] },
        'There you go, 100 gold and 4 Slime Gel. Want another?'],
      ['none', false, false, { held: [], paid_today: 0, recent: [{ claim: 'c8', at: '2025-10-16T11:40:00.000Z', task: 'cellar_giant_rats', gold: 100, item: 'slime_gel', qty: 4, pick: 'material' }] },
        'Board\'s full of work. Take one and go hunt, and I\'ll pay you when you\'re back.'],
      ['capped', false, false, { held: [held(50, 50, 'wickstead_turncoats', 'wickstead', 'turncoat', true), wolves(140)], paid_today: 3 },
        'That\'s three today, and three\'s all I pay for. Bring the Turncoats back tomorrow.'],
    ];
    for (const [name, hunting, justPaid, section, want] of cases) {
      const tally = M.TS.tallyOf(characterOf({ tally: Object.assign(clone(TALLY), section) }));
      const got = M.TW.keeperSay(tally, hunting, justPaid);
      if (got !== want) fails.push('TW-14 [' + name + '] her window reads ' + JSON.stringify({ voice: got }));
    }
  }

  { // TW-15 the pure half of the once note: her answer's rows carry pick.kind (tally-intents.js boardRow), and sharedPieces reads that
    const both = M.TW.sharedPieces([{ pick: { kind: 'piece', item: 'adept_helmet', qty: 1 } }, { pick: { kind: 'piece', item: 'adept_helmet', qty: 1 } }, { pick: { kind: 'material', item: 'slime_gel', qty: 4 } }, { pick: { kind: 'material', item: 'slime_gel', qty: 4 } }]);
    if (both.size !== 1 || !both.has('adept_helmet')) fails.push('TW-15 sharedPieces over kind rows gives ' + JSON.stringify([...both]));
    /* ...and over her real answer, read by tally-intents.js tallyBoard (the 11-11 bug lived between the two) */
    const account = { server: { rpc: async () => ({ ok: true, status: 200, body: clone(BOARD), closed: false }) } };
    const board = await M.TI.tallyBoard(account, characterOf(TOWN));
    const fromBoard = board && board.ok ? M.TW.sharedPieces(board.board.filter((r) => !r.held)) : null;
    if (!fromBoard || fromBoard.size !== 1 || !fromBoard.has('adept_helmet')) fails.push('TW-15 sharedPieces over her answer gives ' + JSON.stringify(fromBoard && [...fromBoard]));
    const cuts = [M.TW.cutMarks(112, 200, false), M.TW.cutMarks(0, 25, false), M.TW.cutMarks(24, 25, false), M.TW.cutMarks(24, 25, true), M.TW.cutMarks(9, 25, false)].join();
    if (cuts !== '5,0,9,10,3') fails.push('TW-15 the marks cut ' + cuts);
    const now = Date.parse('2026-10-17T12:00:00Z');
    const reset = [M.TW.resetWords('2026-10-17T18:00:00Z', now), M.TW.resetWords('2026-10-17T12:20:00Z', now), M.TW.resetWords('2026-10-17T11:00:00Z', now), M.TW.resetWords(null, now)].join('|');
    if (reset !== '6 h|20 m||') fails.push('TW-15 the reset reads ' + reset);
    if (M.TW.keeperSay(null, false, false) !== '') fails.push('TW-15 with no tally she speaks');
  }

  { // TW-17 the pure half: a creature in the head set has a face, one the set lacks has none (the entry then draws no well and no broken image)
    const f = M.TW.faceOf;
    if (f('gray_wolf')?.src !== 'assets/icons-bundle/pixel/heads/gray_wolf.png' || f('farmhand') === null || f('not_a_creature') !== null || f(undefined) !== null) fails.push('TW-17 faceOf reads ' + JSON.stringify([f('gray_wolf'), f('not_a_creature')]));
  }

  { // TW-7 FAIL SAFE: with no tally section nothing is read, so nothing is drawn or taken, and she says nothing
    const none = M.TS.tallyOf(characterOf({ tally: null }));
    if (none !== null) fails.push('TW-7 tallies were invented: ' + JSON.stringify(none));
    if (M.TW.keeperSay(none, false, false) !== '') fails.push('TW-7 she speaks with no tally from the server');
  }
  return fails;
}

/* The twelve mutants of tests/tally-window.mjs planted where no page is needed, moved here verbatim (lane/c-rules-in-node 2026-11-20).
   Each is caught by the rule the page's verdict named for it on nightly 44730692384. */
const MUTANTS = [
  /* TW-9 and TW-18: the source and stylesheet scans */
  ['her first line is the riddle again', 'src/data/text/tally.js', "say_first: 'I kept the mill\\'s rats down myself for thirty years. Then they got a king, so now I pay people to do it. Take one off my board.',",
    "say_first: 'Bring me your half of the stick when the count is done, and I pay. Coin, and a piece for your back.',"],
  ['a CSS content draws a separator again', 'src/styles/windows.css', '.hw-hunt-sep { font-weight: 400; color: var(--ink-3); }', ".hw-hunt-sep { font-weight: 400; color: var(--ink-3); }\n.hw-hunt-fit:not(:empty)::before { content: ' · '; }"],
  /* TW-1, TW-6, TW-3: the marks, the HUD line, Take's body */
  ['the marks cut a stroke ahead of the count', 'src/shell/windows/tally.js', "Math.floor((kills / target) * MARKS)", "Math.ceil((kills / target) * MARKS)"],
  ['the HUD shows one more kill than the server', 'src/session/tally-sections.js', "return label + ' ' + h.kills + '/' + h.target;", "return label + ' ' + (h.kills + 1) + '/' + h.target;"],
  ['take carries a count', 'src/session/tally-intents.js', "{ p_slot: cs.slot, p_task: task, p_weight: weight == null ? null : weight, p_idem: newIdem() }", "{ p_slot: cs.slot, p_task: task, p_weight: weight == null ? null : weight, p_count: 1, p_idem: newIdem() }"],
  /* TW-13 a first visit (fresh-account play 11-13) */
  ['the weight that suits is said twice', 'src/shell/windows/tally.js', "  return !tally.weight ? (suggest ? '' : t('tally.no_weight'))", "  return !tally.weight ? (suggest ? suggest.words : t('tally.no_weight'))"],
  ['a first Take guesses with nothing to go on', 'src/shell/windows/tally.js', "const weight = wears || WEIGHT_FOR_ROLE[role] || null;", "const weight = wears || WEIGHT_FOR_ROLE[role] || 'heavy';"],
  /* TW-14: her line per state (mocks 2026-11-11) */
  ['her line counts one kill more than the server', 'src/shell/windows/tally.js', "{ down: whole(open.kills), left: whole(open.target - open.kills) }", "{ down: whole(open.kills + 1), left: whole(open.target - open.kills - 1) }"],
  ['her line is the same in every state', 'src/shell/windows/tally.js', "  const capped = tally.paidToday >= tally.perDay;\n  const done = tally.held.find((h) => h.done);", "  return t('tally.say_none');\n  const capped = tally.paidToday >= tally.perDay;\n  const done = tally.held.find((h) => h.done);"],
  /* TW-15, TW-17: the once note's reader and the creature's head */
  ['sharedPieces reads pick.pick again (the 11-11 bug)', 'src/shell/windows/tally.js', "if (!r.pick || r.pick.kind !== 'piece') continue;", "if (!r.pick || r.pick.pick !== 'piece') continue;"],
  ['a creature with no head still gets a head path', 'src/shell/windows/tally.js', '  const src = headPathFor(monster);', "  const src = headPathFor(monster) || 'assets/icons-bundle/pixel/heads/' + monster + '.png';"],
  /* TW-7: fail safe */
  ['the reader invents a tally', 'src/session/tally-sections.js', "  if (!isObj(raw)) return null;\n  const had", "  if (!isObj(raw)) raw = { held: [], paid_today: 0, per_day: 3, held_max: 3, order: [] };\n  const had"],
];

runPureGuard({ mutate: process.argv.includes('--mutate'), guard: 'tests/tally-window-pure.mjs', pure, mutants: MUTANTS,
  green: 'the tally\'s pure rules hold (TW-9, TW-18, TW-1, TW-6, TW-3, TW-14, TW-13, TW-15, TW-17, TW-7)' })
  .then((code) => process.exit(code));
