// ════════════════════════════════════════════════════════════════════════
// src/data/trades.js — THE TRADES' LEVERS AND KIND ROWS: TOWN WORK ON ONE CURVE (lane/trade-formulas, backend-architect, 2026-11-22;
//   docs/design/redesign/09-crafting.md sections 2.5, 3.3, 3.7 and 4; 13-market.md section 3.2; 20-v030-the-roads.md section 1.4).
//
// THE RULE IS src/core/trades.js; this file is every number it reads that has no other home, and the few authored rows the numbers act
// on. Nothing here is a yield, a time, an XP amount or a price: every one of those is computed (09 section 4: "No recipe has its own
// numbers"). tools/gen-trades.mjs writes the server's copy and its SQL twins; tests/trade-formulas.mjs holds the rule to 09's numbers.
//
// THE LEVERS 09 OWNS ELSEWHERE (one home each, read, never copied):
//   kitWork, townWageShare, storeCeiling, the meal and charge line shares   src/data/store-kit.js STORE_KIT (lane/econ-levers)
//   tierSteps (one band is one gear tier)                                    src/data/gear-steps.js GEAR_STEPS
//   powerStep (the contest curve a band behind reads)                        src/data/danger.js DANGER
//   the wage                                                                 src/data/wage.js (13-market's V reads wage(item step))
//   workDay, premiumWorkExtra                                                src/data/work-day.js WORK_DAY (lane R12)
//
// THE SHAPE (09 section 4.3: "A recipe row holds only: its kind, its line, the trade Level that opens it, and the roles of its inputs"):
//   TRADES   the ten trades, gather or make, and the working name of each one's tool (09 section 3.7)
//   KINDS    one row a good: its trade, its stage (gather, refine, make), its line and share of the line if it is kit, the rung that opens
//            it, its town materials and parts by SHARE (never a count), its hunted inputs by the cover rule (never a count)
//   RUNGS    a trade's ladder: rung r opens at trade Level 1 + (r - 1) x span. A RECIPE is (kind, rung) and its BAND is a number on the job
//            (the band of its materials, 09 section 4.2), so every recipe and activity is a generated row of (trade, band, tier)
//   SHIPS    'v030' or 'later' (20-v030 section 1.4: Alchemy, the camp pot and worn-out tools wait; their rows are here so they land with no
//            new code)
//
// STARTING VALUES, NOT RULINGS (Tyler 2026-11-21: in band is enough). Each lever names its 09 line; JUDGMENT marks a value 09 leaves
// open, and the Lab or the designer settles it.
//
// PURE ESM. Data and its validation only.
// ════════════════════════════════════════════════════════════════════════
import { STORE_KIT } from './store-kit.js';
import { CRAFTED_RUNE_FAMILIES } from './stonecraft.js';
import { IMBUE, IMBUE_SLOTS } from './imbue-rules.js';
import { TEMPER_STEPS, TEMPER_KITS, TEMPER_KIT_NEW } from './temper.js';

export const TRADE_LEVERS = Object.freeze({
  /* 09 4.3: the two lines the store never sells (the meal and charge shares live in STORE_KIT.lineShare). The four sum to one */
  lineShare: Object.freeze({ draught: 0.2, imbuement: 0.1 }),
  /* 09 4.3: how a line's work splits along its chain. A chain with no refine step gives the refine share to the make (09 3.3: a refine
     step exists only where one raw feeds several products) */
  stageShare: Object.freeze({ gather: 0.5, refine: 0.2, make: 0.3 }),
  /* THE LADDER. JUDGMENT (09 2.6 names "the trade Level that opens it" and the XP window, not the spacing): ten rungs ten Levels apart,
     so a trade opens something every ten Levels and the newest rung is always inside the XP window */
  rungs: Object.freeze({ count: 10, span: 10 }),
  /* 09 4.4: yield 0.75 at the recipe's Level, 1.00 fifteen Levels on; Mastery +0.10, the hall's bench up to +0.10, never past 1.25 */
  yield: Object.freeze({ atReq: 0.75, noFailSpan: 15, cap: 1.25, masteryReturn: 0.1, benchMax: 0.1 }),
  /* 09 4.4: the quality cascade, Master first (only with the Mastery), then Fine, else Plain; a rung is qualitySteps item steps */
  quality: Object.freeze({ fineBase: 0.1, fineTop: 0.6, masterTop: 0.5, steps: 5 }),
  /* 09 4.4: speed 1 at Level 0, 1.25 at 99, a straight line */
  speedAt99: 1.25,
  /* 09 4.5: the trade table. hoursTo99 hours of work to Level 99, each Level curve times dearer than the last. XP is counted in seconds of
     work (xpPerHour 3600), so a job's XP is its worked milliseconds over a thousand, times the XP factor */
  table: Object.freeze({ hoursTo99: 1000, curve: 1.045, xpPerHour: 3600, maxLevel: 99 }),
  /* 09 4.5 names both, gives neither. JUDGMENT: full XP on a rung within twenty Levels of its own (the newest two rungs), then falling in a
     straight line to a quarter over the next twenty; the training choice of 09 4.5 (newest: most XP, most waste) comes from this and 4.4 */
  xp: Object.freeze({ windowLevels: 20, floor: 0.25 }),
  /* 09 2.6, 4.7: three Masteries an account. The Mastery verbs ship later (20 section 1.4); the yield and quality terms read the flag now */
  masteryCap: 3,
  /* 09 4.3: the job fee, a share of the made good's catalogue value V, burned */
  jobFee: 0.25,
  /* 09 2.5, 4.6: the store's basics sit storeLag item steps (one gear tier) behind the hero's band and cost storeCeiling (STORE_KIT) times
     the crafted good's V there; the store bids floorShare of V, at most storeBudget hours of wage an account a day */
  store: Object.freeze({ lagSteps: 20, floorShare: 0.4, budgetHours: 1 }),
  /* 09 3.7, 4.7 (Tyler 2026-11-22: "tools break after 12 hours of use"): a Plain tool lasts toolHours work-hours, each quality rung adds
     lifeRung of that (Fine 15, Master 18); it holds toolWork work-hours of goods */
  tool: Object.freeze({ hours: 12, lifeRung: 0.25, work: 1.0 }),
  /* 09 5.4 THE COVER RULE: a hero who uses a hunting stream's sinks fully burns cover hour-units for each hour-unit that hero drops
     (an hour-unit is what one hunted hero-hour drops, 13-market 3.2). A hunted input is a share of its stream's cover, never a count */
  cover: Object.freeze({ common_part: 1.25, remains: 1.5, rare_part: 1.0, scrap: 1.2 }),
});

/* THE NUMBERS 21 OWNS, READ HERE, NEVER COPIED (lane/flame-temper-build's rows; 21-flame-temper-imbue-loot.md sections 2.2 and 3.2):
     an imbuement lasts IMBUE.hours hunted hours on one piece, one a slot (IMBUE_SLOTS: Edge, Ward, Leech), and its quality is LIFE
     (21 D-7: lifeRungPm a rung), so one imbuement is hours / slots kit-hours of its line (09 4.3: 0.53 work-hours each);
     a Temper kit is TEMPER_STEPS.kitHoursPm of wage at its band, so it holds kitHoursPm / townWageShare work-hours of Smithing (0.4). */
export const BORROWED = Object.freeze({
  imbueHours: IMBUE.hours,
  imbueSlots: Object.keys(IMBUE_SLOTS).length,
  imbueLifeRung: IMBUE.lifeRungPm / 1000,
  temperKitWork: TEMPER_STEPS.kitHoursPm / 1000 / STORE_KIT.townWageShare,
});

/* THE TEN TRADES (09 section 1; 20 section 1.4 for what v0.3.0 opens). `tool` is the working name of its tool (09 3.7). `was` names the
   live skill a renamed trade replaces (09 2.2, 2.9), for the job slice that moves company_trades onto these ids. */
export const TRADES = Object.freeze({
  mining: Object.freeze({ name: 'Mining', stage: 'gather', tool: 'pick', ships: 'v030' }),
  woodcutting: Object.freeze({ name: 'Woodcutting', stage: 'gather', tool: 'axe', ships: 'v030' }),
  fishing: Object.freeze({ name: 'Fishing', stage: 'gather', tool: 'rod', ships: 'v030' }),
  farming: Object.freeze({ name: 'Farming', stage: 'gather', tool: 'hoe', ships: 'v030' }),
  cooking: Object.freeze({ name: 'Cooking', stage: 'make', tool: 'knife', ships: 'v030' }),
  smithing: Object.freeze({ name: 'Smithing', stage: 'make', tool: 'hammer', ships: 'v030' }),
  woodcrafting: Object.freeze({ name: 'Woodcrafting', stage: 'make', tool: 'saw', ships: 'v030', was: 'crafting' }),
  runecutting: Object.freeze({ name: 'Runecutting', stage: 'make', tool: 'chisel', ships: 'v030', was: 'runecrafting' }),
  artificing: Object.freeze({ name: 'Artificing', stage: 'make', tool: 'graver', ships: 'v030' }),
  alchemy: Object.freeze({ name: 'Alchemy', stage: 'make', tool: 'mortar', ships: 'later' }),
});

/* THE KINDS. A kit kind is one hunted hour of its line's effect for one hero (`effect` kit-hours; 09 3.3: "one bundle = one hunted hour"),
   its share of the line `split`. A part (`budget: { of, share }`) is a share of another kind's whole work, made in its own trade (the
   arrowhead is half an arrow: 09 3.3's join). `from` lists town materials by share of the material work; `parts` lists parts the kind
   takes whole; `hunted` lists hunting streams by share of the stream's cover. `rolls` marks a finished good that rolls quality:
   'step' (Fine and Master are item steps, 09 4.4) or 'life' (a tool's and an imbuement's quality is life, 09 3.7 and 21 D-7; `life` names whose rung). `opens` is the rung (JUDGMENT: the
   first day's kinds at rung 1, as 09's walk-through has it; the rest staggered so a trade opens a kind every few rungs). */
const raw = (trade) => Object.freeze({ trade, stage: 'gather', opens: 1, ships: TRADES[trade].ships });
const refined = (trade, of) => Object.freeze({ trade, stage: 'refine', opens: 1, from: Object.freeze([Object.freeze({ kind: of, share: 1 })]), ships: 'v030' });
const share = (kind, s) => Object.freeze({ kind, share: s });
const hunted = (stream, s) => Object.freeze({ stream, share: s });
const freeze = (o) => Object.freeze(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? Object.freeze(v) : v])));

const BASE_KINDS = {
  /* GATHER (09 3.1: town hours make these and nothing else does) */
  ore: raw('mining'),
  rune_stone: raw('mining'),
  log: raw('woodcutting'),
  fish: raw('fishing'),
  grain: raw('farming'),
  herb: raw('farming'),
  /* REFINE (09 3.3: one raw feeds several products) */
  bar: refined('smithing', 'ore'),
  shaft: refined('woodcrafting', 'log'),
  cut_stone: refined('runecutting', 'rune_stone'),
  /* THE MEAL LINE (09 3.2: a meal and a drink, the only things that restore health and mana, CR-Q2 a). JUDGMENT: half the line each */
  meal: freeze({ trade: 'cooking', stage: 'make', line: 'meal', split: 0.5, effect: 1, opens: 1, from: [share('fish', 1)], rolls: 'step', ships: 'v030' }),
  drink: freeze({ trade: 'cooking', stage: 'make', line: 'meal', split: 0.5, effect: 1, opens: 1, from: [share('grain', 1)], rolls: 'step', ships: 'v030' }),
  /* THE CHARGE LINE (09 3.2): one kind a style, each the whole charge line, so the bill is the same for every style */
  honing_stone: freeze({ trade: 'smithing', stage: 'make', line: 'charge', split: 1, effect: 1, opens: 1, from: [share('bar', 1)], rolls: 'step', ships: 'v030' }),
  arrowhead: freeze({ trade: 'smithing', stage: 'make', budget: Object.freeze({ of: 'arrow', share: 0.5 }), opens: 1, from: [share('bar', 1)], ships: 'v030' }),
  arrow: freeze({ trade: 'woodcrafting', stage: 'make', line: 'charge', split: 1, effect: 1, opens: 1, parts: ['arrowhead'], from: [share('shaft', 1)], rolls: 'step', ships: 'v030' }),
  bolt: freeze({ trade: 'woodcrafting', stage: 'make', line: 'charge', split: 1, effect: 1, opens: 2, parts: ['arrowhead'], from: [share('shaft', 1)], rolls: 'step', ships: 'v030' }),
  ward_charm: freeze({ trade: 'woodcrafting', stage: 'make', line: 'charge', split: 1, effect: 1, opens: 3, from: [share('shaft', 1)], rolls: 'step', ships: 'v030' }),
  /* THE DECISION LINES (09 3.2). An imbuement is imbueHours / imbueSlots kit-hours of its line (21 3.2: 0.53 work-hours each) */
  imbuement: freeze({ trade: 'artificing', stage: 'make', line: 'imbuement', split: 1, effect: 'imbue', opens: 1, hunted: [hunted('rare_part', 1), hunted('remains', 0.1)], rolls: 'life', life: 'imbue', ships: 'v030' }),
  draught: freeze({ trade: 'alchemy', stage: 'make', line: 'draught', split: 1, effect: 1, opens: 1, from: [share('herb', 1)], hunted: [hunted('common_part', 1)], rolls: 'step', ships: 'later' }),
  /* the camp pot serves a party of four for an hour in place of their draughts (21 D-1), so it is four kit-hours of the draught line.
     JUDGMENT, out of v0.3.0 (20 section 2) */
  camp_pot: freeze({ trade: 'cooking', stage: 'make', line: 'draught', split: 1, effect: 4, opens: 5, from: [share('grain', 1)], hunted: [hunted('common_part', 1)], rolls: 'step', ships: 'later' }),
  /* DURABLE WORK (21 2.2: half a Temper rank is kits at the piece's band; v0.3.0 has no salvage, so no scrap here yet) */
  temper_kit: freeze({ trade: 'smithing', stage: 'make', budget: 'temperKit', opens: 3, from: [share('bar', 1)], ships: 'v030' }),
  /* TOOLS (09 3.7): a smithed head on a haft from Woodcrafting, "the arrow turned around". Out of v0.3.0 (20 1.4: they ship with the Crown
     tools); the rows are here so they land with no new code */
  haft: freeze({ trade: 'woodcrafting', stage: 'make', budget: Object.freeze({ of: 'tool', share: 0.5 }), opens: 2, from: [share('shaft', 1)], ships: 'later' }),
};

/* The rune families a Runecutter cuts: one kind each, so a stack of fire runes is not a stack of ice runes. The family list is the live
   one (src/data/stonecraft.js CRAFTED_RUNE_FAMILIES); a rune binds its cut stone with remains (09 3.5: the flame, the rune trade and the
   market bid for the same remains). JUDGMENT: a tenth of the remains stream's cover goes to binding runes */
const RUNE_KINDS = Object.fromEntries(CRAFTED_RUNE_FAMILIES.map((f) => ['rune_' + f, freeze({ trade: 'runecutting', stage: 'make', line: 'charge',
  split: 1, effect: 1, opens: 1, family: f, from: [share('cut_stone', 1)], hunted: [hunted('remains', 0.1)], rolls: 'step', ships: 'v030' })]));

/* One tool a trade (09 3.7), made by Smithing from bars and a haft. Its work is toolWork (the `budget: 'tool'` rows read it) */
const TOOL_KINDS = Object.fromEntries(Object.entries(TRADES).map(([t, row]) => ['tool_' + row.tool, freeze({ trade: 'smithing', stage: 'make',
  budget: 'tool', opens: 2, forTrade: t, parts: ['haft'], from: [share('bar', 1)], rolls: 'life', life: 'tool', ships: 'later' })]));

export const KINDS = Object.freeze({ ...BASE_KINDS, ...RUNE_KINDS, ...TOOL_KINDS });

/* A raw unit is the gathering behind one meal (09 4.3's arithmetic on the meal line): every raw good is counted in that unit, so the
   first day's meal is one fish and the first honing stone two bars, and no unit size is typed */
export const RAW_UNIT_OF = 'meal';

/* The line shares, all four (STORE_KIT holds the two the store sells). */
export const LINE_SHARE = Object.freeze({ meal: STORE_KIT.lineShare.meal, charge: STORE_KIT.lineShare.charge, ...TRADE_LEVERS.lineShare });

const between = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const permille = (v) => Number.isFinite(v) && Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-9;

/** Every problem with the levers and rows (the shipped ones by default), as sentences. Empty = valid. */
export function validate(L = TRADE_LEVERS, kinds = KINDS, trades = TRADES, lines = LINE_SHARE) {
  const out = [];
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  if (Math.abs(sum(lines) - 1) > 1e-9) out.push('the four line shares sum to ' + sum(lines) + ', not 1');
  if (Math.abs(sum(L.stageShare) - 1) > 1e-9) out.push('the stage shares sum to ' + sum(L.stageShare) + ', not 1');
  for (const [k, v] of Object.entries({ ...lines, ...L.stageShare })) if (!(v > 0) || !permille(v)) out.push(k + ' share ' + v + ' is not a positive permille');
  if (!Number.isInteger(L.rungs.count) || L.rungs.count < 1 || !Number.isInteger(L.rungs.span) || L.rungs.span < 1) out.push('the rungs must be whole');
  if (1 + (L.rungs.count - 1) * L.rungs.span > L.table.maxLevel - 1) out.push('the last rung opens past Level ' + (L.table.maxLevel - 1));
  const y = L.yield;
  if (!between(y.atReq, 0.1, 1) || !(y.cap >= 1) || !Number.isInteger(y.noFailSpan) || y.noFailSpan < 1) out.push('the yield curve must climb from under 1 to a cap at or over 1');
  if (y.atReq + 1e-9 >= y.cap) out.push('the yield at the recipe\'s Level is not under the cap');
  for (const k of ['atReq', 'cap', 'masteryReturn', 'benchMax']) if (!permille(y[k]) || y[k] < 0) out.push('yield.' + k + ' is not a permille');
  const q = L.quality;
  if (!(between(q.fineBase, 0, 1) && between(q.fineTop, q.fineBase, 1) && between(q.masterTop, 0, 1))) out.push('the quality cascade is not inside 0 to 1 with Fine climbing');
  if (!Number.isInteger(q.steps) || q.steps < 1) out.push('a quality rung must be a whole number of steps');
  if (!(L.speedAt99 >= 1) || !permille(L.speedAt99)) out.push('speed at 99 must be at least 1');
  if (!(L.table.hoursTo99 > 0) || !(L.table.curve > 1) || !Number.isInteger(L.table.xpPerHour) || L.table.maxLevel !== 99) out.push('the trade table must climb to 99');
  if (!Number.isInteger(L.xp.windowLevels) || L.xp.windowLevels < L.rungs.span) out.push('the XP window is narrower than a rung: some Level would have no full-XP recipe');
  if (!between(L.xp.floor, 0, 1) || !permille(L.xp.floor)) out.push('the XP floor is not a permille');
  if (!between(L.jobFee, 0, 1) || !permille(L.jobFee)) out.push('the job fee is not a share of V');
  if (!Number.isInteger(L.store.lagSteps) || L.store.lagSteps < 1) out.push('the store must sit a whole number of steps behind');
  if (!between(L.store.floorShare, 0, 1) || !permille(L.store.floorShare)) out.push('the store floor is not a share of V');
  /* 09 5.5: the store's bid stays under the store's ask, so buying basics and selling the crafted good never prints gold */
  if (!(L.store.floorShare < STORE_KIT.storeCeiling)) out.push('the store bids at or over what it asks');
  if (!(L.tool.hours > 0) || !permille(L.tool.lifeRung) || !(L.tool.work > 0)) out.push('a tool must last and hold work');
  if (!Number.isInteger(BORROWED.imbueSlots) || BORROWED.imbueSlots < 1 || !(BORROWED.imbueHours > 0) || !permille(BORROWED.imbueLifeRung)) out.push('the imbuement\'s life, slots and life rung (21) must be positive');
  if (!(BORROWED.temperKitWork > 0)) out.push('a Temper kit (21) must hold work');
  for (const [k, v] of Object.entries(L.cover)) if (!(v >= 1)) out.push('the ' + k + ' cover ' + v + ' is under 1: the stream floods (09 5.4)');
  if (!kinds[RAW_UNIT_OF] || kinds[RAW_UNIT_OF].line !== 'meal') out.push('the raw unit is not read off a meal');
  const ids = Object.keys(kinds);
  for (const id of ids) {
    const k = kinds[id];
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(id)) out.push(id + ' is not a kind id');
    if (!trades[k.trade]) out.push(id + ': no trade ' + k.trade);
    if (!['gather', 'refine', 'make'].includes(k.stage)) out.push(id + ': no stage ' + k.stage);
    if (k.stage === 'gather' && trades[k.trade] && trades[k.trade].stage !== 'gather') out.push(id + ': a make trade does not gather');
    if (k.stage !== 'gather' && trades[k.trade] && trades[k.trade].stage !== 'make') out.push(id + ': a gather trade does not make');
    if (!Number.isInteger(k.opens) || k.opens < 1 || k.opens > L.rungs.count) out.push(id + ': opens at rung ' + k.opens);
    if (!['v030', 'later'].includes(k.ships)) out.push(id + ': ships ' + k.ships);
    if (k.ships === 'v030' && trades[k.trade] && trades[k.trade].ships !== 'v030') out.push(id + ': ships before its trade');
    for (const m of k.from || []) {
      if (!kinds[m.kind] || !['gather', 'refine'].includes(kinds[m.kind].stage)) out.push(id + ': material ' + m.kind + ' is not a gathered or refined kind');
      if (!(m.share > 0)) out.push(id + ': material ' + m.kind + ' has no share');
    }
    if ((k.from || []).length && Math.abs(sum(Object.fromEntries(k.from.map((m) => [m.kind, m.share]))) - 1) > 1e-9) out.push(id + ': material shares do not sum to 1');
    for (const p of k.parts || []) {
      const pk = kinds[p];
      const host = pk && pk.budget && typeof pk.budget === 'object' ? pk.budget.of : null;
      /* a part is sized as a share of its host's work, so it fits any kind whose work is the host's: the same line, split and effect
         (the arrowhead fits the bolt), or any tool (the haft) */
      const sameWork = host && kinds[host] && kinds[host].line && kinds[host].line === k.line && kinds[host].split === k.split && kinds[host].effect === k.effect;
      if (!host) out.push(id + ': part ' + p + ' is not a part');
      else if (!(host === id || sameWork || (host === 'tool' && k.budget === 'tool'))) out.push(id + ': part ' + p + ' is sized for ' + host + ', not this kind');
    }
    for (const h of k.hunted || []) if (!(h.stream in L.cover) || !(h.share > 0 && h.share <= 1)) out.push(id + ': hunted ' + h.stream + ' is no stream share');
    if (k.line) {
      if (!(k.line in lines)) out.push(id + ': no line ' + k.line);
      if (!(k.split > 0 && k.split <= 1)) out.push(id + ': split ' + k.split);
      if (!(k.effect === 'imbue' || k.effect > 0)) out.push(id + ': effect ' + k.effect);
      if (k.budget) out.push(id + ': a kit kind is sized by its line, not a budget');
    } else if (k.stage === 'make' && !k.budget) out.push(id + ': a made kind with no line needs a budget');
    if (k.rolls && !['step', 'life'].includes(k.rolls)) out.push(id + ': rolls ' + k.rolls);
    if ((k.rolls === 'life') !== ['tool', 'imbue'].includes(k.life)) out.push(id + ': a good whose quality is life names whose life rung it reads (tool or imbue), and only it');
    if (k.stage !== 'make' && k.rolls) out.push(id + ': only a made good rolls quality');
    if (k.stage === 'make' && !(k.from || []).length && !(k.hunted || []).length) out.push(id + ': a made kind with no input');
  }
  /* every kit line the store sells has a kind, and every style's charge costs the same (09 3.2: the bill is the same for every style) */
  const charges = ids.filter((id) => kinds[id].line === 'charge');
  if (charges.some((id) => kinds[id].split !== 1 || kinds[id].effect !== 1)) out.push('a charge kind is not the whole charge line: the styles would pay different bills');
  for (const line of Object.keys(lines)) {
    const sp = ids.filter((id) => kinds[id].line === line && kinds[id].effect !== 4).reduce((a, id) => a + (kinds[id].line === 'charge' ? 0 : kinds[id].split), 0);
    if (line !== 'charge' && line !== 'draught' && Math.abs(sp - 1) > 1e-9) out.push('the ' + line + ' line\'s kinds split ' + sp + ' of it, not all');
  }
  /* the named kit recipes read these kinds (09 4.9) */
  out.push(...validateKitRecipes(KIT_RECIPES, kinds, trades));
  return out;
}

/* ── THE KIT RECIPES, NAMED (lane/k1-kit-trades-sample, game designer, 2026-11-26; 09-crafting.md section 4.9, 20 lane K1) ──────────
   A KIT RECIPE IS ONE KIND AT ONE BAND. The kind (KINDS above) carries everything a recipe costs: its line, its hours of work, its
   inputs by stage share. The band is one gear tier (12-targets 8.3: one metal a tier), so a band's goods are its material's goods,
   "Bronze Arrows" at band 0. A row only names that pair for a player: its id is derived (recipeId), its trade Level is the band's rung
   (src/core/trades.js bandRung), its inputs are the same band's goods by the catalogue's counts, and its items are the band's FACES.
   Nothing on a row is a time, a count, an XP amount or a price. tradeCatalogue() resolves every row (`named`), so a bad row refuses the
   server's catalogue like any other.
   ONE FINISHED KIT GOOD IS ONE HUNTED HOUR of its line for one hero at its band (09 3.3's bundle): stock, stock rules and the return card
   count it in hours. The job slice re-cuts each face to that unit when it replaces the live town work (HANDOFFS 2026-11-26, K1); until
   then the faces are the live items the first hour already names (20 section 3.2: "Cook 10 Shrimp").
   THE SAMPLE (CLAUDE.md section 10: about five, played and read before the rest): one recipe for each kit trade and one gathering job,
   all at band 0, so the first day can make every one. tests/kit-recipes.mjs reads every input's door and every output's use from
   catalogue-coherence. The rest of band 0, then bands 1 to 8, land in batches of 20 or fewer once the sample is read.
   NEW FACES are goods no live item is yet (the arrowhead). They are not ITEMS rows: an item with no working door is not authored (W0),
   so the job slice adds each one with the verb that makes it. */

/* THE BAND'S FACES: kind -> the item it is at each band, band 0 (Bronze) first. A hunted stream's face is what a band drops for it
   (13-market 3.2: how many make an hour-unit is the drop formulas'). */
export const KIT_FACES = Object.freeze({
  ore: Object.freeze(['copper_ore']),
  /* the bars Smithing smelts, a metal a band (gear-tiers.js MATERIAL_TIERS): the Temper kits' input to Dawnsteel */
  bar: Object.freeze(['bronze_bar', 'iron_bar', 'steel_bar', 'mithril_bar', 'rune_bar', 'ember_bar', 'dawn_bar']),
  arrowhead: Object.freeze(['bronze_arrowheads']),
  log: Object.freeze(['normal_log']),
  shaft: Object.freeze(['normal_plank']),
  arrow: Object.freeze(['bronze_arrows']),
  fish: Object.freeze(['shrimp']),
  meal: Object.freeze(['cooked_shrimp']),
  rune_stone: Object.freeze(['rune_essence']),
  cut_stone: Object.freeze(['rune_blank']),
  rune_fire: Object.freeze(['chalked_fire_rune']),
  /* THE TEMPER KIT (21 section 2.2, lane/tp-im-steps 2026-11-26): the Tempering Salts the smith already sells are its faces, Iron to
     Emberforged, and Dawnsteel's is new. Band 0 has none: Bronze is never tempered (a rank opens at Level 40, where Steel is worn). Cobalt
     and Wolfram's land with the grounds that drop them. A rank at item Level iL takes the kits of bandOf(iL) (src/core/temper-steps.js) */
  temper_kit: TEMPER_KITS,
});
export const STREAM_FACES = Object.freeze({ remains: Object.freeze(['bones']) });

/* New goods, id -> label. Each is made by one recipe and used by another, and becomes an item with the job slice. */
export const NEW_FACES = Object.freeze({ bronze_arrowheads: 'Bronze Arrowheads', ...TEMPER_KIT_NEW });

/** A recipe's id: its kind and its band ('arrow_b0'). Derived, never typed. */
export const recipeId = (kind, band) => kind + '_b' + band;
/** The item a kind is at `band` (null: no face named yet). */
export const faceOf = (kind, band) => (KIT_FACES[kind] && KIT_FACES[kind][band]) || null;
/** The item a hunted stream drops at `band` (null: none named). */
export const streamFaceOf = (stream, band) => (STREAM_FACES[stream] && STREAM_FACES[stream][band]) || null;

const kitRow = (kind, band, name) => Object.freeze({ id: recipeId(kind, band), kind, band, name });

/* THE SAMPLE: Mining, Smithing, Woodcrafting, Cooking, Runecutting, one each, band 0. The arrowhead and the arrow are 09 3.3's chain 1
   (two trades and one join), so the sample plays the one recipe that needs another trade's part. */
/* THE TEMPER KITS (batch 2, lane/tp-im-steps, 2026-11-26; 21 section 2.2, 20 lane TP): one row a band a rank can sit on in v0.3.0, Iron to
   Dawnsteel. Each is the same derived kind at its band, so the batch is one rule six times, not six designs. */
export const KIT_RECIPES = Object.freeze([
  kitRow('ore', 0, 'Mine Copper Ore'),
  kitRow('arrowhead', 0, 'Forge Bronze Arrowheads'),
  kitRow('arrow', 0, 'Fletch Bronze Arrows'),
  kitRow('meal', 0, 'Cook Shrimp'),
  kitRow('rune_fire', 0, 'Cut Chalked Fire Runes'),
  kitRow('temper_kit', 1, 'Mix Tempering Salts'),
  kitRow('temper_kit', 2, 'Mix Fine Tempering Salts'),
  kitRow('temper_kit', 3, 'Mix Mithril Tempering Salts'),
  kitRow('temper_kit', 4, 'Mix Rune Tempering Salts'),
  kitRow('temper_kit', 5, 'Mix Ember Tempering Salts'),
  kitRow('temper_kit', 6, 'Mix Dawnsteel Tempering Salts'),
]);

/* At most this many named band 0 rows until the first day's sample is read, one a trade (CLAUDE.md section 10), and at most KIT_BATCH_MAX
   named rows in all (a batch of 20 or fewer). */
const KIT_SAMPLE_MAX = 5;
const KIT_BATCH_MAX = 20;
const LABEL = /^[A-Z][A-Za-z' ]{2,40}$/;

/** Every problem with the named recipes (the shipped ones by default), as sentences. Empty = valid. */
export function validateKitRecipes(rows = KIT_RECIPES, kinds = KINDS, trades = TRADES, faces = KIT_FACES, fresh = NEW_FACES) {
  const out = [];
  const first = rows.filter((r) => r.band === 0);
  if (first.length > KIT_SAMPLE_MAX) out.push(first.length + ' band 0 kit recipes before the sample of ' + KIT_SAMPLE_MAX + ' is read (CLAUDE.md section 10)');
  if (rows.length > KIT_BATCH_MAX) out.push(rows.length + ' kit recipes: past a batch of ' + KIT_BATCH_MAX + ' (CLAUDE.md section 10)');
  const seenTrade = new Set(), seenId = new Set();
  for (const r of rows) {
    const k = kinds[r.kind];
    if (Object.keys(r).sort().join() !== 'band,id,kind,name') out.push(r.id + ': a kit recipe holds only its kind, band, id and name');
    if (!k) { out.push(r.id + ': no kind ' + r.kind); continue; }
    if (k.ships !== 'v030' || !trades[k.trade] || trades[k.trade].ships !== 'v030') out.push(r.id + ': ' + r.kind + ' does not ship in v0.3.0');
    if (!Number.isInteger(r.band) || r.band < 0) out.push(r.id + ': band ' + r.band + ' is not a whole band');
    if (r.id !== recipeId(r.kind, r.band)) out.push(r.id + ': the id is not recipeId(kind, band)');
    if (seenId.has(r.id)) out.push(r.id + ': twice');
    seenId.add(r.id);
    if (r.band === 0 && seenTrade.has(k.trade)) out.push(r.id + ': a second ' + k.trade + ' recipe in the sample (one a trade)');
    if (r.band === 0) seenTrade.add(k.trade);
    if (k.stage === 'refine') out.push(r.id + ': a refine step is not a kit recipe the sample plays');
    if (!LABEL.test(r.name)) out.push(r.id + ': name ' + JSON.stringify(r.name) + ' is not a short label');
    if (!faceOf(r.kind, r.band)) out.push(r.id + ': no face for ' + r.kind + ' at band ' + r.band);
  }
  for (const [kind, list] of Object.entries(faces)) {
    if (!kinds[kind]) out.push('a face for no kind ' + kind);
    /* a hole (null) is a band where the kind has no good: a recipe there has no face and is refused above */
    for (const id of list) if (id !== null && !/^[a-z][a-z0-9_]{1,40}$/.test(id)) out.push(kind + ': face ' + id + ' is not an item id');
  }
  for (const [id, name] of Object.entries(fresh)) {
    if (!Object.values(faces).some((l) => l.includes(id))) out.push('new face ' + id + ' is no kind\'s face');
    if (!LABEL.test(name)) out.push('new face ' + id + ' has no label');
  }
  return out;
}
