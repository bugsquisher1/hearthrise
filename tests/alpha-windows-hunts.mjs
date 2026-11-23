#!/usr/bin/env node
// mutant-rule-functions: checks pure huntsPure prepBuilderRules
// mutant-runner-functions: main
// ════════════════════════════════════════════════════════════════════════
// tests/alpha-windows-hunts.mjs — GOING OUT: THE HUNTS WINDOW AND HUNT PREP, IN A REAL CHROMIUM.
//
//   node tests/alpha-windows-hunts.mjs                 the rules
//   node tests/alpha-windows-hunts.mjs --mutate        every planted defect must turn a rule RED
//   node tests/alpha-windows-hunts.mjs --pure          its pure rules only (no browser)
//   node tests/alpha-windows-hunts.mjs --mutate --only=<prefix>   just the mutants whose name starts so
//   node tests/alpha-windows-hunts.mjs --mutate --shard=K/N   the Kth of N shards, balanced by measured seconds (CI splits them)
//   node tests/alpha-windows-hunts.mjs --shard-plan   no browser: smoke.yml's shards cover every mutant once, each in budget
//   node tests/alpha-windows-hunts.mjs --shots <dir>  also write the visual-gate screenshots (1440x900 and 922x423)
//
// mutant-anchors: src/shell/widgets/amount.js src/shell/windows/float-menu.js src/shell/bag-model.js src/shell/windows/hunts.js src/shell/hunt-list.js src/shell/hunt-ground-facts.js src/shell/windows/hunt-detail.js src/render/creature-sprite.js src/shell/hunt-go.js src/data/refusal-words.js src/styles/windows.css src/data/shell-windows.js src/shell/carry-in.js src/shell/prep-draft.js src/shell/windows/hunt-prep/builder.js src/shell/windows/hunt-prep/setups.js src/session/preset-read.js src/shell/window-head.js
// mutant-writes-tree: no — page mutants are served overrides (tests/_alpha-windows.mjs pageRun), pure ones planted into a temp copy of src (tickerMutant)
//
// One of the alpha windows' guards, split from tests/alpha-windows.mjs (2026-11-19, arch audit item 7): tests/_alpha-windows.mjs
// is the harness they share (play.html with supabase-js and the REST paths stubbed, the character's envelope
// tests/fixtures/alpha-envelope.json) and says which guard holds which window's rules.
//
// Going out: the Hunts window (the list and a ground's page, go as, before you go, the party path, the round trip, when the
// hunt ends) and Hunt prep (no supplies in the Shop beside it, the readiness line, carry in, the bar whole under Close and
// Save); pure: the Hunts page's facts (AW-25 .. AW-29) and the Hunt prep builder (AW-85 .. AW-92).
//
//   AW-7  THE SHOP SELLS NO SUPPLIES (Tyler 2026-10-20): the Shop has Buy, Sell and Services (2026-10-25)
//         only (no Refill), Buy lists the tools and never a food, drink or ammo
//         offer even when a server still sends one, Hunt prep has no refill
//         button and the hunt summary no Restock
//   AW-8  HUNT PREP: the readiness line names this character's shortages from the
//         server's bag and bar; Use sends ONE hr_hunt_preset_apply
// THE HUNTS WINDOW, master-detail (designer plan 2026-10-22, PRIORITY_BOARD "Hunts, Hunt
// prep and the Party finder"), a Level 1 hero in town:
//   AW-25 the list is one line a ground: the band in words with its tone (in range /
//         above / far above), the solo / party glyph, the best or "New", "Fits your
//         level" on the recommendation's line only; the picked ground's page draws who
//         lives there from the world's style-1 idle frames at x2, standing on one ground
//         line, common / uncommon / rare from the spawn points, the rare and its ONE
//         carrier, the bests (one "No best here yet" line when none, the server's best
//         replacing it); on the phone the list, then the page as the sheet, then back. On a scaled
//         screen (Tyler 2026-11-16, 125 % and 150 %) a creature's bitmap is whole device px an art px,
//         the most no bigger than x2 (2 at 125 %, 3 at 150 %), shown at exactly its own size. A harder tier a pack measured as a
//         Healer's (healerTiers: a four with no Healer dies there under a Level) says "Recommended: Healer" under that Level, to every group
//   AW-26 GO AS: the setups as lines (weapon, role, the bar's first four on the setup
//         on now; a set with no setup row is not offered); Enter as the setup on now is
//         ONE hr_hunt_enter; as another it is ONE hr_hunt_preset_apply then ONE
//         hr_hunt_enter naming it, from one press, every control off in flight; a
//         refused apply enters nothing and says why in words
//   AW-27 BEFORE YOU GO: one line per supply kind in slot order from the server's bar,
//         bag, stamina and gold (the designer's walk-through starter bar word for word);
//         the next envelope replaces every number; a line that stops the hunt is marked
//   AW-28 THE PARTY PATH: a party ground's page offers Invite a player (the Party window, its
//         name box; no read: there is no party finder) and Bring
//         your heroes (open heroes in no party); a solo ground's page offers neither
//   AW-29 the round trip: pick a ground, Enter, hunting, back in town: Hunts still holds
//         that ground, after a close and reopen too
//   AW-35 WHEN THE HUNT ENDS (Tyler 2026-11-15, the itinerary; src/shell/windows/hunt-after-pane.js): the Hunts page's one
//         select lists what the server offers (a hero with no job to go back to: waiting, and each skill the yard trains),
//         the picked one is the server's and the line under it says what it means; a change sends ONE hr_hunt_after_set
//         with the choice and the skill and nothing else; a server that sends no section draws no control.
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './_client-harness.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';
import { FIXTURE, clone, LEVEL_5_XP, wait, pushEnvelope, openWin, sent, pageRun, plain, mutate, shardPlan, tickerMutant } from './_alpha-windows.mjs';

/* The readiness line with the fixture's bag and bar (supplies are never 'short' against a restock target any more). */
const AW8_LINE = 'Tyler: ready';
/* The hunt rows (each ground's theme) the Hunts page draws. */
const HUNTS = (await import(pathToFileURL(join(ROOT, 'src/data/hunts.js')).href)).HUNT_INDEX;
const CELLAR_ODDS = (await import(pathToFileURL(join(ROOT, 'src/render/format.js')).href)).chance(
  (await import(pathToFileURL(join(ROOT, 'src/shell/hunt-ground-facts.js')).href)).scarceSetOf('mill_cellar', 'medium')[0].chance);
/* A Level 1 hero in town (no hunt, no party, no bests yet), 30 min of stamina, two setups the server can put
   on and a third set it cannot (no setup row): the Hunts window's fresh hero (AW-25 .. AW-29). */
function levelOne(e) {
  for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
  e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, level_xp: 0 });
  e.hunt_bests = { min_ms: 600000, grounds: {} };
  e.stamina = { ms: 1800000, at: e.now, max_ms: 28800000, hunting: false };
  e.hunt_presets = [{ preset: 0, name: 'Cellar rats', action_set: 0, gear: { weapon: 'iron_sword' }, restock: {} },
    { preset: 1, name: 'Bow', action_set: 1, gear: { weapon: 'shortbow' }, restock: {} }];
  e.hunt_settings = Object.assign({}, e.hunt_settings, { presets: [{ preset: 0, name: 'Hunt' }, { preset: 1, name: 'Bow' }, { preset: 2, name: 'Bare set' }] });
}

/* AW-25 .. AW-28 PURE: the Hunts page's facts from the data rows and its lines from the server's sections. */
/* The pure Hunts rules over the src at `base`: how the 'hunts:' mutants are judged (a mutant run skips pure()). */
const huntsRules = (base) => huntsPure((p) => import(pathToFileURL(join(base, p)).href));

async function huntsPure(imp) {
  const fails = [];
  const { residentsOf, scarceSetOf, raresOf, wornWeightOf, bigPullOf } = await imp('src/shell/hunt-ground-facts.js');
  const { MONSTERS } = await imp('src/data/monsters.js');
  const { huntRows, fitWords, bestLine, bestWords, tierPull, tierWords, tierChoiceWords } = await imp('src/shell/hunt-list.js');
  const { setupsOf, beforeLines, freeHeroes } = await imp('src/shell/hunt-go.js');
  const STORE = FIXTURE.hunt_settings.store;
  /* THE PULL EACH TIER BRINGS: Normal is the pack as built for EVERY group size (0; Tyler 2026-11-11 ONE PACK ON NORMAL, partyPull is gone), a harder tier its own row's number for the group's size, and a row of 0 the pack as built too. */
  const rowOf = (hunt) => huntRows().find((x) => x.hunt === hunt);
  const glade = rowOf('mosslight_glade'), thicketR = rowOf('meadowbrook_thicket');
  /* FIXED ROWS, NOT TODAY'S BALANCE (lane/b-tier-dials): the page's words and pulls are read off rows set here on the very rows the page reads
     (hunt-tiers.js, the build's ?v= instance), put back after, so the designer moving a number never turns a words check red. */
  const TV = await import(pathToFileURL(join(ROOT, 'src/data/hunt-tiers.js')).href + sourceQuery(ROOT));
  const kept = { glade: TV.GROUND_TIERS.mosslight_glade, thicket: TV.GROUND_TIERS.meadowbrook_thicket };
  const tierRow = (id, pull, dmgPm, hpPm, xpPm) => ({ id, pull, dmgPm, hpPm, xpPm });
  try {
    TV.GROUND_TIERS.mosslight_glade = { dangerous: tierRow('dangerous', [4, 5, 5, 6], 1200, 1000, 1100), deadly: tierRow('deadly', [8, 8, 8, 8], 1500, 1000, 1200) };
    TV.GROUND_TIERS.meadowbrook_thicket = { dangerous: tierRow('dangerous', [0, 0, 0, 0], 1500, 1000, 1050), deadly: tierRow('deadly', [0, 0, 0, 0], 3000, 1000, 1080) };
    if (tierPull(glade, 'normal', 1) !== 0) fails.push('AW-25 a lone hero moved off the room as built: ' + tierPull(glade, 'normal', 1));
    if (tierPull(glade, 'normal', 2) !== 0 || tierPull(glade, 'normal', 4) !== 0) fails.push('AW-25 a party on Normal does not read the pack as built (Tyler 2026-11-11): ' + tierPull(glade, 'normal', 2) + ' / ' + tierPull(glade, 'normal', 4));
    if (tierPull(glade, 'dangerous', 1) !== 4 || tierPull(glade, 'dangerous', 4) !== 6 || tierPull(glade, 'deadly', 1) !== 8 || tierPull(glade, 'deadly', 4) !== 8) fails.push('AW-25 a harder tier does not read its row');
    if (tierPull(thicketR, 'deadly', 1) !== 0 || tierPull(thicketR, 'deadly', 4) !== 0) fails.push('AW-25 a row with no more monsters does not read the ground as it stands: ' + tierPull(thicketR, 'deadly', 1) + ' / ' + tierPull(thicketR, 'deadly', 4));
    if (tierWords(glade, 'normal', 1) !== '' || tierChoiceWords(glade, 'normal', 1) !== '') fails.push('AW-25 Normal says more than the ground\'s page: ' + tierWords(glade, 'normal', 1));
    /* THE PLAIN LINE (Tyler 2026-11-08: the old numbers note was 'way too exact'; hunt-tiers.js TIER_LINES): a tier that brings more monsters at once than
       this group's Normal reads its 'more' line, one that brings no more its 'same' line, each with the one death line and never a number. */
    const W = (t, k) => TV.TIER_LINES[t][k] + '\n' + TV.TIER_DEATH_LINE;
    if (tierChoiceWords(glade, 'deadly', 1) !== 'Deadly: big groups that hit hard') fails.push('AW-25 the line beside Enter reads: ' + tierChoiceWords(glade, 'deadly', 1));
    if (tierWords(glade, 'deadly', 1) !== W('deadly', 'more')) fails.push('AW-25 the Deadly note reads: ' + tierWords(glade, 'deadly', 1));
    if (tierChoiceWords(glade, 'dangerous', 4) !== 'Dangerous: more monsters that hit harder') fails.push('AW-25 a four on a bigger pull reads: ' + tierChoiceWords(glade, 'dangerous', 4));
    if (tierChoiceWords(thicketR, 'deadly', 1) !== 'Deadly: monsters hit much harder' || tierWords(thicketR, 'dangerous', 4) !== W('dangerous', 'same')) fails.push('AW-25 a row with no more monsters reads: ' + tierChoiceWords(thicketR, 'deadly', 1) + ' / ' + tierWords(thicketR, 'dangerous', 4));
    /* a pull no bigger than this group's Normal (the pack as built, 0 for a pair too since Tyler 2026-11-11) is no more monsters */
    TV.GROUND_TIERS.mosslight_glade.dangerous = tierRow('dangerous', [4, 0, 3, 4], 1200, 1000, 1100);
    if (tierWords(glade, 'dangerous', 2) !== W('dangerous', 'same') || tierWords(glade, 'dangerous', 1) !== W('dangerous', 'more')) fails.push('AW-25 the pull read against Normal: ' + tierWords(glade, 'dangerous', 2));
    /* every dial at a sheet's odd multiple still reads no number, on every tier and group size */
    TV.GROUND_TIERS.mosslight_glade.deadly = tierRow('deadly', [8, 8, 8, 8], 2261, 2847, 1400);
    for (const r of [glade, thicketR]) for (const t of ['dangerous', 'deadly']) for (const n of [1, 2, 3, 4]) if (/\d/.test(tierWords(r, t, n) + tierChoiceWords(r, t, n))) fails.push('AW-25 a tier note carries a number: ' + tierWords(r, t, n));
  } finally { TV.GROUND_TIERS.mosslight_glade = kept.glade; TV.GROUND_TIERS.meadowbrook_thicket = kept.thicket; }
  /* A HEALER'S TIER (lane/a-honest-lines 2026-11-16, re-landed and bounded by Level by lane/a-honesty-rescue; the mechanism is lane/d-late-nearmisses'):
     where a pack's healerTiers names a tier and a Level (hunt-tiers.js HEALER_TIERS, measured: a four with no Healer dies there under that Level and a four
     with one holds), the page says "Recommended: Healer" on that tier to a hero under that Level, alone or in a party, an unknown Level too; and on no
     other ground, tier or Level. A Deadly the grader grades with a Healer (checks.deadlyFourNeeds, the designer's Q4 2026-11-12 "bring a Healer") is
     named, and a named Deadly is graded so: the page and the grader agree both ways. The Muster Barrows and Krell's Hold were graded so since 2026-11-12
     and their pages never said it (each pack carries its measurement). */
  {
    const healerLine = (await imp('src/render/player-text.js')).t('hunts.tier_healer');
    const { GROUND_PACKS } = await import(pathToFileURL(join(ROOT, 'src/data/grounds/index.js')).href + sourceQuery(ROOT));
    let named = 0;
    if (!healerLine || healerLine === 'hunts.tier_healer') fails.push('AW-25 hunts.tier_healer has no words');
    const rows = huntRows();
    for (const [g, row] of Object.entries(TV.HEALER_TIERS || {})) for (const [id, under] of Object.entries(row)) {
      const pk = GROUND_PACKS.find((x) => ((x.ground && x.ground.id) || x.id) === g), hr = rows.find((r) => r.hunt === g);
      if (!TV.tiersOf(g).includes(id)) fails.push('AW-25 ' + g + ' names ' + id + ' a Healer\'s tier, and it does not offer ' + id);
      if (id === 'deadly' && !(pk && pk.checks && pk.checks.deadlyFourNeeds === 'healer')) fails.push('AW-25 ' + g + ' says Deadly needs a Healer, and the grader grades its four without one (checks.deadlyFourNeeds)');
      /* the line stops inside the band, or one past its top: said at EVERY Level of the band (the Pauper Vaults, measured never under one death
         without a Healer up to 185; lane/d-late-items-rescue) */
      if (hr && !(under > hr.band[0] && under <= hr.band[1] + 1)) fails.push('AW-25 ' + g + '\'s Healer line stops at Level ' + under + ', outside its band ' + hr.band.join('-'));
    }
    for (const r of rows) for (const id of TV.tiersOf(r.hunt).filter((x) => x !== TV.DEFAULT_TIER)) {
      const under = (TV.HEALER_TIERS[r.hunt] || {})[id] || null;
      for (const lv of [r.band[0], r.band[1], null, ...(under ? [under - 1, under] : [])]) {
        const want = !!under && !(Number.isInteger(lv) && lv >= under);
        named += want ? 1 : 0;
        for (const n of [1, 2, 4]) if (tierWords(r, id, n, lv).includes(healerLine) !== want) fails.push('AW-25 ' + r.hunt + ' ' + id + ' at Level ' + lv + ', a group of ' + n + ': the page reads "' + tierWords(r, id, n, lv) + '"' + (want ? ', with no word that it needs a Healer' : ', and it is not named one there'));
      }
    }
    for (const pk of GROUND_PACKS) {
      const g = (pk.ground && pk.ground.id) || pk.id;
      if (pk.checks && pk.checks.deadlyFourNeeds === 'healer' && !((TV.HEALER_TIERS[g] || {}).deadly)) fails.push('AW-25 ' + g + '\'s Deadly is graded with a Healer (checks.deadlyFourNeeds) and its page never says to bring one (healerTiers)');
    }
    if (!(TV.isHealerTier('muster_barrows', 'deadly', 59) && !TV.isHealerTier('muster_barrows', 'deadly', 60))) fails.push('AW-25 the Muster Barrows\' Deadly kills a four with no Healer up to 59 and not from 60 (its pack), and the page does not say so there');
    if (!(TV.isHealerTier('krells_hold', 'deadly', 88) && !TV.isHealerTier('krells_hold', 'deadly', 89))) fails.push('AW-25 Krell\'s Hold\'s Deadly kills a four with no Healer up to 88 and hardly from 89 (its pack), and the page does not say so there');
    if (!named) fails.push('AW-25 no ground names a Healer\'s tier: the words were never read');
  }
  /* Who lives here: each creature's share of the ground's spawn points (Tyler 10-18: a common majority, some uncommon, a rare). */
  const cellar = residentsOf('mill_cellar').map((m) => m.id + ':' + m.band + ':' + m.level).join();
  if (cellar !== 'rat:common:2,slime:uncommon:2,hive_wasp:uncommon:4') fails.push('AW-25 the Mill Cellar lives as ' + cellar);
  const thicket = residentsOf('meadowbrook_thicket').map((m) => m.id + ':' + m.band).join();
  if (thicket !== 'gray_wolf:common,gray_whelp:common,briarcoat_wolf:uncommon,dire_gray:rare,grayjaw:rare') fails.push('AW-25 the Thicket lives as ' + thicket);
  for (const r of huntRows()) if (!residentsOf(r.hunt).some((m) => m.band === 'common')) fails.push('AW-25 ' + r.hunt + ' has no common creature');
  /* What drops (the loot bands, 2026-10-23): every Rare and Trophy row of the ground's creatures, item and carrier, the
     Trophies last, never a Scarce piece; the hourly gear a line a tier, the worn weight's line word first. */
  for (const r of huntRows()) {
    const want = new Set(), got = raresOf(r.hunt);
    for (const m of [...residentsOf(r.hunt), ...bigPullOf(r.hunt)]) for (const d of MONSTERS[m.id].drops || []) if (d.band === 'rare' || d.band === 'trophy') want.add(d.id + '@' + m.id);
    const ids = got.map((x) => x.id + '@' + x.carrier.id);
    if (ids.length !== want.size || ids.some((k) => !want.has(k))) fails.push('AW-25 ' + r.hunt + ' rares read ' + ids.join('+') + ', the rows say ' + [...want].join('+'));
    if (got.some((x, i) => x.trophy && got.slice(i + 1).some((y) => !y.trophy))) fails.push('AW-25 ' + r.hunt + ' lists a Trophy before a Rare');
  }
  const sets = (h, w) => scarceSetOf(h, w).map((e) => e.lines.join(',') + ':' + e.slots.join(',') + ':' + e.weapons.join(',')).join('|');
  if (sets('millrace_sewer', 'medium') !== 'Leather,Bronze,Apprentice:bodies,legs:|Studded,Iron,Adept:helmets,boots:Ironbound Shield,Oakboard Spellbook,Oak Wand,Iron Sword') fails.push('AW-25 the Sewer\'s gear reads ' + sets('millrace_sewer', 'medium'));
  /* the page's words are one list (v0.2.100 played on Wickstead: "Iron, Studded, Adept: bodies, legs; Bramble Blade") */
  const wick = scarceSetOf('wickstead', 'medium').map((e) => e.what).join('|');
  if (wick !== 'helmets and boots|bodies, legs, Iron Hatchets and Bramble Blade') fails.push('AW-25 Wickstead\'s drop lines read ' + wick);
  if (sets('mosslight_glade', null) !== 'Iron,Studded,Adept:helmets,bodies,legs,boots:Oak Staff,Longbow,Iron Warhammer,Oak Crossbow') fails.push('AW-25 the glade\'s gear for no worn weight reads ' + sets('mosslight_glade', null));
  /* THE ODDS (Tyler 2026-10-24: "a % drop chance or nothing at all"): each line's chance per kill is the engine's rows
     (monsters.js, the catalogue hr-accrue rolls), the whole kill's for every party size since 2026-11-08. Worked here from the
     rows on the Sewer (a hall built for a party, two tiers): a tier line = any piece of it on one kill of the ground's mix (every
     pocket on its route, as built), a Rare = per kill of its carrier. */
  const { HUNT_GROUNDS } = await imp('src/data/hunt-grounds.js');
  const { ITEMS } = await imp('src/data/items.js');
  const { chance } = await imp('src/render/format.js');
  const { detailHtml } = await imp('src/shell/windows/hunt-detail.js');
  const sewer = Object.values(HUNT_GROUNDS).find((g) => g.hunt === 'millrace_sewer');
  {
    const pts = {};
    for (const i of sewer.route) for (const s of sewer.pockets[i].spawns) pts[s.monster] = (pts[s.monster] || 0) + 1;
    const all = Object.values(pts).reduce((t, k) => t + k, 0);
    const tierOdds = (tier) => Object.entries(pts).reduce((t, [id, k]) => {
      const rows = MONSTERS[id].drops.filter((d) => d.band === 'scarce' && (Number(ITEMS[d.id].tier) || 1) === tier);
      return t + (k / all) * (1 - rows.reduce((p, d) => p * (1 - Math.min(0.95, d.ch)), 1));
    }, 0);
    const shown = scarceSetOf('millrace_sewer', 'medium').map((e) => chance(e.chance)).join('|');
    const want = [1, 2].map((t) => chance(tierOdds(t))).join('|');
    if (shown !== want || /under|^0%/.test(want)) fails.push('AW-25 the Sewer\'s gear odds read ' + shown + ', the rows say ' + want);
    const rr = raresOf('millrace_sewer').map((x) => x.name + ' ' + chance(x.chance)).join('|');
    const rw = residentsOf('millrace_sewer').flatMap((m) => MONSTERS[m.id].drops.filter((d) => d.band === 'rare' || d.band === 'trophy')
      .map((d) => ({ t: d.band === 'trophy', s: ITEMS[d.id].n + ' ' + chance(Math.min(0.95, d.ch)) })))
      .sort((a, b) => Number(a.t) - Number(b.t)).map((x) => x.s).join('|');
    if (rr !== rw) fails.push('AW-25 the Sewer\'s rare odds read ' + rr + ', the rows say ' + rw);
  }
  /* A MONSTER'S OWN DROP BONUS IS IN EVERY ODDS LINE (2026-11-10: the page left it out, so the Cellar's Slime, x1.15, read its Slime Gel 13% under
     what the server rolls). A FIXED ROW, NOT TODAY'S BALANCE: the Sump Slime is given a bonus on the very rows the page reads (the build's ?v=
     instance), put back after. What a row must read is the roller's own chance (drops.js rollDropTable, on a die that reports its chance and never
     lands) at the multiplier the settle hands it (hunt-rewards.js payKill: weakness(row).dropMult, combat.js weaknessInfo, the monster's own). */
  {
    const { materialsOf } = await imp('src/shell/hunt-ground-facts.js');
    const MV = (await import(pathToFileURL(join(ROOT, 'src/data/monsters.js')).href + sourceQuery(ROOT))).MONSTERS;
    const { rollDropTable } = await imp('src/core/drops.js');
    const { weaknessInfo } = await imp('src/core/combat.js');
    const rolls = (id) => { const seen = []; rollDropTable(MV[id].drops, { dropMult: weaknessInfo(MV[id], null).dropMult }, { chance: (c) => { seen.push(c); return false; } }); return MV[id].drops.map((d, i) => ({ d, c: seen[i] })); };
    const pts = {};
    for (const i of sewer.route) for (const s of sewer.pockets[i].spawns) pts[s.monster] = (pts[s.monster] || 0) + 1;
    const all = Object.values(pts).reduce((t, k) => t + k, 0);
    const near = (a, b) => Math.abs(a - b) < 1e-12;
    const SLIME = 'sump_slime', had = MV[SLIME].dropBonus;
    try {
      MV[SLIME].dropBonus = 1.5;
      const tierOdds = (tier) => Object.entries(pts).reduce((t, [id, k]) => t + (k / all) * (1 - rolls(id).filter((r) => r.d.band === 'scarce' && (Number(ITEMS[r.d.id].tier) || 1) === tier).reduce((p, r) => p * (1 - r.c), 1)), 0);
      const gear = scarceSetOf('millrace_sewer', 'medium');
      if (gear.length !== 2 || gear.some((e) => !near(e.chance, tierOdds(e.tier)))) fails.push('AW-25 a monster\'s own drop bonus is not in the gear odds: ' + gear.map((e) => e.chance).join(' | ') + ', the roller says ' + [1, 2].map(tierOdds).join(' | '));
      const mine = rolls(SLIME);
      const rares = raresOf('millrace_sewer').filter((x) => x.carrier.id === SLIME);
      if (!rares.length) fails.push('AW-25 CONTROL: the Sump Slime carries no Rare, so the bonus check reads no Rare line');
      if (rares.some((x) => !near(x.chance, mine.find((r) => r.d.id === x.id).c))) fails.push('AW-25 a monster\'s own drop bonus is not in its Rare odds: ' + rares.map((x) => x.name + ' ' + x.chance).join(' | '));
      /* the materials only it drops here, one at least under the roller's 95% cap, where a bonus shows (today its Lamp Jelly; its Slime Gel sits at the cap either way) */
      const mats = materialsOf('millrace_sewer').filter((e) => e.carriers.length === 1 && e.carriers[0] === MV[SLIME].name);
      if (!mats.some((e) => mine.find((r) => r.d.id === e.id).c < 0.95)) fails.push('AW-25 CONTROL: the Sump Slime alone drops no material under the cap here, so the bonus check reads no Materials line');
      if (mats.some((e) =>!near(e.chance, (pts[SLIME] / all) * mine.find((r) => r.d.id === e.id).c))) fails.push('AW-25 a monster\'s own drop bonus is not in the Materials odds: ' + mats.map((e) => e.name + ' ' + e.chance).join(' | '));
    } finally { if (had === undefined) delete MV[SLIME].dropBonus; else MV[SLIME].dropBonus = had; }
  }
  const fmt =[0.0035, 0.021, 0.12, 0.00009, 0.0001].map(chance).join('|');
  if (fmt !== '0.35%|2.1%|12%|under 0.01%|0.01%') fails.push('AW-25 the odds read ' + fmt + ' (two significant figures, "under 0.01%" below it)');
  /* THE LINEUP FACES THE PLAYER (Tyler 2026-10-24): the page's sprite options draw each creature's idle frame facing
     south, never the side-on east frame (a stub atlas row whose directions sit at different columns). */
  const { LINEUP_SPRITE } = await imp('src/shell/windows/hunt-detail.js');
  const { drawCreature } = await imp('src/render/creature-sprite.js');
  const drewAt = [];
  const g2d = (c) => ({ drawImage: (img, sx) => drewAt.push(sx), clearRect() {}, getImageData: () => ({ data: new Uint8ClampedArray(c.width * c.height * 4).fill(255) }) });
  const fakeCanvas = () => { const c = { width: 0, height: 0, getContext: () => g2d(c) }; return c; };
  const shown = Object.assign(fakeCanvas(), { ownerDocument: { createElement: fakeCanvas } });
  const stubArt = new Map([['rat', { image: {}, row: { frame: [4, 4], anchor: [2, 3], anims: { idle: { dirs: { e: [[0, 0]], s: [[40, 0]], n: [[80, 0]] } } } } }]]);
  if (!drawCreature(shown, stubArt, 'rat', LINEUP_SPRITE) || drewAt[drewAt.length - 1] !== 40 || shown.width !== 8)
    fails.push('AW-25 the lineup draws frame x ' + drewAt[drewAt.length - 1] + ' at ' + shown.width + ' px, wanted the front (south) frame at x 40, x2');
  /* a scaled screen: the 4 art px body drawn whole device px an art px and shown at its own size, never stretched by the browser */
  for (const [dpr, k] of [[1.25, 2], [1.5, 3], [1.75, 3], [2, 4]]) {
    const scaled = Object.assign(fakeCanvas(), { style: {}, ownerDocument: { createElement: fakeCanvas, defaultView: { devicePixelRatio: dpr } } });
    drawCreature(scaled, stubArt, 'rat', LINEUP_SPRITE);
    if (scaled.width !== 4 * k || scaled.style.width !== (4 * k) / dpr + 'px')
      fails.push('AW-25 at ' + dpr + 'x a creature is a ' + scaled.width + ' px bitmap shown ' + scaled.style.width + ' wide, wanted ' + 4 * k + ' px shown ' + (4 * k) / dpr + 'px');
  }
  const head = detailHtml();
  if (!head.includes('<h4 class="hw-hd-h">Drops <small') || /about every hour|no odds/i.test(head)) fails.push('AW-25 the drops heading reads ' + (/<h4 class="hw-hd-h">([^<]*)<small class="hw-hd-per hw-hd-per-size"/.exec(head) || [, '?'])[1]);
  const worn = [wornWeightOf({ helmet: 'leather_helmet', body: 'bronze_platebody', pants: 'leather_pants' }), wornWeightOf({ weapon: 'practice_sword' }), wornWeightOf({ helmet: 'adept_helmet', body: 'iron_platebody' })].join();
  if (worn !== 'medium,,heavy') fails.push('AW-25 the worn weight reads ' + worn);
  /* The list line: the band against the Level in words and a tone; the best, or No best yet. */
  const rows = Object.fromEntries(huntRows().map((r) => [r.hunt, r]));
  /* A ground past the hero's Level reads Below level; only a ground whose hunt ends at a Level the hero has reached reads Outgrown
     (hunt-grounds.js endsAtLevel: the Mill Cellar from 5, whose band then reads 1-4; lane/d-first-day-path) */
  const fits = [[rows.mill_cellar, 1], [rows.meadowbrook_thicket, 1], [rows.mosslight_glade, 1], [rows.meadowbrook_thicket, 20], [rows.mill_cellar, 4], [rows.mill_cellar, 5],
    [rows.mill_cellar, 20], [rows.mill_cellar, null]].map(([r, lv]) => { const f = fitWords(r, lv); return f ? f.tone + ':' + f.words : '-'; }).join('|');
  if (fits !== 'in:In range|above:Above level|far:Far above level|below:Below level|in:In range|below:Outgrown|below:Outgrown|-') fails.push('AW-25 the band words read ' + fits);
  const bests = { minMs: 600000, grounds: { mill_cellar: { solo: { xpH: 7141, balanceH: 1859 }, party: { xpH: 9000, balanceH: 10 } } } };
  const lines = [bestLine(null, 'mill_cellar'), bestLine(bests, 'mill_cellar'), bestLine(bests, 'millrace_sewer')].join('|');
  if (lines !== '|Best 9,000 Level XP/h|No record yet') fails.push('AW-25 the list bests read ' + lines);
  const none = bestWords({ minMs: 600000, grounds: {} }, 'mill_cellar');
  if (none.solo || none.party || none.none !== 'No record yet (hunt 10+ min)') fails.push('AW-25 a ground with no best reads ' + JSON.stringify(none));
  /* A session over plain sections, the way the envelope projects them. */
  const slot = (type, id, count) => ({ action: { type, id }, conditions: [], join: 'and', usable: true, count });
  const START = [slot('ability', 'power_strike'), slot('consume', 'cooked_shrimp', 20), slot('consume', 'salted_shrimp', null), slot('consume', 'thin_turnip_juice', null)];
  const sess = (o) => { const e = Object.assign({ hunt_settings: { preset: 0, presets: [{ preset: 0, name: 'Set 1' }], slots: START, store: STORE },
    state: { gold: 500 }, inventory: { cooked_shrimp: 20 }, stamina: { ms: 28800000, at: '2026-10-22T00:00:00Z', max_ms: 28800000 }, equipment: { weapon: 'practice_sword' } }, o); return { read: (k) => e[k] }; };
  const say = (cs, o) => beforeLines(cs, o).map((l) => (l.short ? '!' : '') + l.text).join(' | ');
  /* (A fresh hero's starter bar and Bring your heroes are read on the page's own modules, AW-27 / AW-28 in checks.) */
  const bare = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [slot('consume', 'cooked_shrimp', 0)], store: STORE }, state: { gold: 0 }, stamina: { ms: 0, max_ms: 28800000 } }));
  if (bare !== 'Food: no Cooked Shrimp left. HP returns only between fights | !Stamina: none') fails.push('AW-27 an empty bar and no stamina read ' + JSON.stringify(bare));
  const poor = say(sess({ state: { gold: 0 }, stamina: { ms: 30 * 60000, max_ms: 28800000 } }));
  if (!/\| Stamina: 30 min left \| !Gold: none \(hunt ends when supplies run out\)$/.test(poor)) fails.push('AW-27 low stamina and no gold read ' + JSON.stringify(poor));
  const other = say(sess({}), { other: 'Bow' });
  if (!/^Supplies: set by Bow’s bar/.test(other)) fails.push('AW-27 another setup\'s supplies read ' + JSON.stringify(other));
  /* Go as: the setups the server can put on, plus the one in use (its bar's first four); a set with no setup row is not offered. */
  const setups = setupsOf(sess({ hunt_settings: { preset: 0, presets: [{ preset: 0, name: 'Hunt' }, { preset: 1, name: 'Bow' }, { preset: 2, name: 'Bare set' }], slots: FIXTURE.hunt_settings.slots, store: STORE },
    hunt_presets: [{ preset: 1, name: 'Bow', action_set: 1, gear: { weapon: 'shortbow' } }], equipment: { weapon: 'iron_sword' } }))
    .map((p) => [p.preset, p.name, p.inUse, p.weapon, p.roleWords, p.bar ? p.bar.length : '-'].join(':')).join('|');
  /* the fixture hero wears an Iron Sword ALONE: Melee damage (Tyler 2026-10-23, the shield makes the tank) */
  if (setups !== '0:Hunt:true:iron_sword:Melee:4|1:Bow:false:shortbow:Ranger:-') fails.push('AW-26 Go as offers ' + setups);
  /* A closed session is no hero to bring (the open one in a party is checked on the page, AW-28). */
  const me = { slot: 0, status: 'ready', read: () => null };
  if (freeHeroes(me, [me, { slot: 3, status: 'closed', read: (k) => (k === 'name' ? 'Wrenna' : null) }]).length) fails.push('AW-28 Bring your heroes offers a closed session');
  /* AW-29 A SCALED HUNT IS FOUND ON THE HUNTS PAGE (audit F26, 2026-11-15: the data and the server existed, no window read them). The server's
     `scaled_hunts` section (2027-03-21-scaled-hunts.sql hr_scaled_hunts_view) reads whole or not at all; the page shows the server's Level, price
     and bank, the slider's hours capped by the bank and the day, says why Buy is off, and Buy sends the server's price an hour x the hours. No
     section (the switch off): nothing anywhere. */
  {
    const SH = await imp('src/session/scaled-hunts.js');
    const SP = await imp('src/shell/windows/scale-pane.js');
    const H = 3600000;
    const section = (grounds, o) => Object.assign({ min_hours: 1, max_hours: 24, bank_max_ms: 24 * H, day_max_hours: 48, today_hours: 0, playing: null, grounds }, o || {});
    const csOf = (s, extra) => ({ slot: 0, status: 'ready', read: (k) => (k === 'scaled_hunts' ? s : extra ? extra[k] : undefined) });
    const sewer = { level: 41, from_level: 26, price: 1640, banked_ms: 6 * H, on: true };
    const sh = SH.scaledHuntsOf(csOf(section({ sewer_drains: sewer, mill_cellar: { level: null, from_level: 9, price: null, banked_ms: 0, on: true }, bad: { level: 5 } })));
    if (!sh || sh.maxHours !== 24 || sh.grounds.sewer_drains.price !== 1640 || sh.grounds.mill_cellar.level !== null || sh.grounds.bad || !Object.isFrozen(sh.grounds)) fails.push('AW-29 the section reads ' + JSON.stringify(sh));
    if (SH.scaledHuntsOf(csOf(null)) !== null || SH.scaledHuntsOf(csOf(undefined)) !== null) fails.push('AW-29 no section (the switch off) still reads as one');
    const view = (s, hunt, o) => SP.scaleView(SH.scaledHuntsOf(csOf(s)), hunt, o);
    const v1 = view(section({ sewer_drains: sewer }), 'sewer_drains', { hours: 4, gold: 100000 });
    if (!v1 || v1.level !== 41 || v1.price !== 1640 || v1.max !== 18 || v1.hours !== 4 || v1.cost !== 6560 || v1.why !== null) fails.push('AW-29 a banked ground reads ' + JSON.stringify(v1));
    const whyOf = (s, o) => { const v = view(s, 'sewer_drains', o); return v ? v.why + ':' + v.max : 'none'; };
    const said = [whyOf(section({ sewer_drains: { ...sewer, banked_ms: 24 * H } }), { gold: 1e6 }), whyOf(section({ sewer_drains: sewer }, { today_hours: 48 }), { gold: 1e6 }),
      whyOf(section({ sewer_drains: sewer }), { hours: 4, gold: 6559 }), whyOf(section({ sewer_drains: sewer }, { today_hours: 40 }), { hours: 20, gold: 1e6 })].join(' ');
    if (said !== 'bank:0 day:0 gold:18 null:8') fails.push('AW-29 Buy off says ' + said + ', want bank:0 day:0 gold:18 null:8');
    const locked = view(section({ mill_cellar: { level: null, from_level: 9, price: null, banked_ms: 0, on: true } }), 'mill_cellar');
    if (!locked || locked.level !== null || locked.locked !== 9 || view(null, 'sewer_drains') !== null || view(section({}), 'sewer_drains') !== null) fails.push('AW-29 a ground not scaled yet reads ' + JSON.stringify(locked));
    const tags = [SP.scaleTag(csOf(section({ sewer_drains: sewer })), 'sewer_drains'), SP.scaleTag(csOf(section({ sewer_drains: { ...sewer, on: false } })), 'sewer_drains'),
      SP.scaleTag(csOf(section({ sewer_drains: { ...sewer, banked_ms: 0 } })), 'sewer_drains'), SP.scaleTag(csOf(null), 'sewer_drains'),
      SP.scaleTag(csOf(section({ mill_cellar: { level: null, from_level: 9, price: null, banked_ms: 0, on: true } })), 'mill_cellar')].join('|');
    if (tags !== 'Scaled: Level 41|Scalable|Scalable||') fails.push('AW-29 the Hunts list\'s tags read ' + JSON.stringify(tags));
    /* the press: ONE hr_scaled_hunt_buy with whole hours and the total seen; a malformed ask never leaves */
    const calls = [];
    const account = { server: { rpc: async (name, args) => { calls.push([name, args]); return { ok: true, body: { ok: true, hours: args.p_hours } }; } } };
    let loads = 0;
    const cs = Object.assign(csOf(section({ sewer_drains: sewer })), { load: async () => { loads++; } });
    const r = await SH.buyScaledHours(account, cs, 'sewer_drains', 4, 6560);
    const sent = calls[0] && calls[0][1];
    if (!r.ok || calls.length !== 1 || calls[0][0] !== 'hr_scaled_hunt_buy' || sent.p_hunt !== 'sewer_drains' || sent.p_hours !== 4 || sent.p_price !== 6560 || sent.p_slot !== 0 || !/^[0-9a-f-]{36}$/.test(sent.p_idem) || loads !== 1) {
      fails.push('AW-29 Buy sent ' + JSON.stringify(calls) + ' -> ' + JSON.stringify(r) + ', re-read ' + loads);
    }
    for (const [hours, price] of [[1.5, 2460], [0, 0], [4, null]]) if ((await SH.buyScaledHours(account, cs, 'sewer_drains', hours, price)).ok || calls.length !== 1) fails.push('AW-29 a malformed Buy (' + hours + ' h, ' + price + ') was sent');
    const sw = await SH.setScaledOn(account, cs, 'sewer_drains', false);
    if (!sw.ok || !calls[1] || calls[1][0] !== 'hr_scaled_hunt_switch' || calls[1][1].p_on !== false) fails.push('AW-29 the switch sent ' + JSON.stringify(calls[1]));
  }
  return fails;
}

/* AW-85 .. AW-92 PURE: THE HUNT PREP BUILDER (lane/b-hunt-prep-builder, Tyler 2026-11-11), over the src at `base` (the
   'prep builder:' mutants judge a planted copy). A fake CharacterSession records every intent; no DOM: the rules drive the
   builder's exported pieces (prep-draft.js, builder.js saveDraft / actBuilder / fightsLine, setups.js actSetups,
   preset-read.js) with the fixture's own hunt_settings, and every expected value is worked out here from the raw rows.
     AW-85  THE COPY IS THE SERVER'S ROW AND SAVE IS ONE INTENT WITH EVERY KEY: the draft reads the fixture's bar, stance, target,
            distance, chase and gold floor; Save sends ONE hr_action_set_options(preset, { slots, stance, target_mode, distance,
            chase, gold_floor }); an option the server never sent is left out, never sent as null
     AW-86  A DROP MOVES OR SWAPS: onto an empty slot the action moves, onto a filled one the two swap, nothing else moves
     AW-87  SAVE AND USE: the save, then ONE hr_hunt_preset_apply of that setup; a refused save puts nothing on; a stale copy sends nothing
     AW-88  USE EQUIPPED ASKS ONCE: the first press sends nothing, the second ONE hr_hunt_preset_save over the picked setup
     AW-89  NEW SAVES ON THE FIRST FREE NUMBER, named from the field (else Setup N)
     AW-90  FIGHTS AS: a press on a dim role says how to get it ("Requires a bow or a crossbow"); the worn role's
            line names the weapon and the shield; no hint shows for the role already worn
     AW-91  SORT AND CLEAR edit the copy: Sort lays the lanes out, Clear empties all twenty; neither sends
     AW-92  THE READ: the setup in use is the envelope's projection (no RPC); another is ONE hr_hunt_preset_read(p_slot, p_preset),
            parsed as hunt_settings is, with the store rows filled in from the envelope when the answer has none; a refusal reads as one */
async function prepBuilderRules(base) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  const D = await imp('src/shell/prep-draft.js');
  const B = await imp('src/shell/windows/hunt-prep/builder.js');
  const S = await imp('src/shell/windows/hunt-prep/setups.js');
  const R = await imp('src/session/preset-read.js');
  const H = await imp('src/session/hunt-sections.js');
  const { TEXT } = await imp('src/data/text/text-table.js');
  const fx = clone(FIXTURE);
  /* two saved setups, 0 (in use) and 2, so the first free number is 1 */
  fx.hunt_presets = [Object.assign(clone(fx.hunt_presets[0]), { preset: 0, name: 'Cellar rats', gear: { weapon: 'iron_sword', shield: 'wooden_shield' } }),
    Object.assign(clone(fx.hunt_presets[0]), { preset: 2, name: 'Boss nights', gear: { weapon: 'shortbow' } })];
  fx.hunt_settings = Object.assign({}, fx.hunt_settings, { preset: 0, gold_floor: 250 });
  fx.state = Object.assign({}, fx.state, { active_kind: 'idle', active_id: null });
  const calls = [];
  const fakeCs = (env, answer = () => ({ ok: true })) => ({
    slot: 0, status: 'open', read: (k) => (Object.prototype.hasOwnProperty.call(env, k) ? env[k] : null),
    savePreset: async (p, n) => { calls.push(['hr_hunt_preset_save', p, n]); return answer('hr_hunt_preset_save'); },
    applyPreset: async (p) => { calls.push(['hr_hunt_preset_apply', p]); return answer('hr_hunt_preset_apply'); },
    setHuntOptions: async (p, o) => { calls.push(['hr_action_set_options', p, o]); return answer('hr_action_set_options'); },
    edgeIntent: async () => ({ ok: true }),
  });
  const scratch = () => ({ pending: false, msg: '', naming: null, arming: null, armingEquipped: false, adding: false, readyOpen: false, picked: 0, draft: null, draftFor: null, base: '', read: null, stale: false, sorted: false, cleared: false, roleHint: null, drag: null });
  const el = (attrs, extra) => Object.assign({ getAttribute: (k) => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null), closest: () => null, blur() {} }, extra || {});
  const click = { type: 'click' };
  const noop = () => {};
  const settle = () => new Promise((ok) => setTimeout(ok, 20));
  const sent = (name) => calls.filter((c) => c[0] === name);

  // AW-85: the copy from the server's row, and the one intent with every key
  const set = H.settingsView(fx.hunt_settings);
  const draft = D.draftFrom(set);
  const wantSlots = Array.from({ length: 20 }, (_, i) => H.wireSlot(set.slots[i]));
  if (!draft || JSON.stringify(draft.slots) !== JSON.stringify(wantSlots) || draft.stance !== 'balanced' || draft.targetMode !== 'nearest' || draft.distance !== 1 || draft.chase !== true || draft.goldFloor !== 250)
    fails.push('AW-85 the copy reads ' + JSON.stringify(draft).slice(0, 200));
  const opts = D.optionsOf(draft);
  if (Object.keys(opts).sort().join() !== 'chase,distance,gold_floor,slots,stance,target_mode' || opts.stance !== 'balanced' || opts.target_mode !== 'nearest' || opts.distance !== 1 || opts.chase !== true || opts.gold_floor !== 250 || JSON.stringify(opts.slots) !== JSON.stringify(wantSlots))
    fails.push('AW-85 Save would send ' + Object.keys(opts).sort().join() + ' = ' + JSON.stringify(opts).slice(0, 160));
  const unset = D.optionsOf(D.draftFrom(H.settingsView(Object.assign({}, fx.hunt_settings, { gold_floor: null, chase: undefined }))));
  if ('gold_floor' in unset || 'chase' in unset || !('stance' in unset)) fails.push('AW-85 an option the server never sent is sent back: ' + Object.keys(unset).sort().join());
  {
    const cs = fakeCs(fx), sc = scratch();
    sc.draft = D.draftFrom(set); sc.base = D.draftKey(sc.draft); sc.draftFor = 0;
    sc.draft.stance = 'offensive';
    B.saveDraft({ character: cs, account: {} }, sc, noop, false);
    await settle();
    const o = sent('hr_action_set_options');
    if (o.length !== 1 || o[0][1] !== 0 || o[0][2].stance !== 'offensive' || Object.keys(o[0][2]).sort().join() !== 'chase,distance,gold_floor,slots,stance,target_mode') fails.push('AW-85 Save sent ' + JSON.stringify(o.map((c) => [c[1], Object.keys(c[2]).sort().join()])));
    if (sent('hr_hunt_preset_apply').length) fails.push('AW-85 Save put the setup on');
    if (sc.draft !== null) fails.push('AW-85 the copy was kept after the save (the next patch must show the server\'s row)');
  }
  // AW-86: a drop moves or swaps
  {
    const bar = wantSlots.slice();
    const a = bar[0], b = bar[1];
    const moved = D.dropPlan(bar, 0, 7);
    if (!moved || moved[7] !== a || moved[0] !== null || moved[1] !== b || moved.length !== 20) fails.push('AW-86 a drop on an empty slot did not move: ' + JSON.stringify((moved || []).map((s) => (s ? s.action.id : '-'))));
    const swapped = D.dropPlan(bar, 0, 1);
    if (!swapped || swapped[0] !== b || swapped[1] !== a || swapped.slice(2).some((s, i) => s !== bar[i + 2])) fails.push('AW-86 a drop on a filled slot did not swap the two: ' + JSON.stringify((swapped || []).map((s) => (s ? s.action.id : '-'))));
    if (D.dropPlan(bar, 0, 0) !== null || D.dropPlan(bar, 7, 0) !== null) fails.push('AW-86 a drop on itself, or of an empty slot, changes the bar');
    if (JSON.stringify(bar) !== JSON.stringify(wantSlots)) fails.push('AW-86 a plan changed the bar it was planned over');
  }
  /* AW-86 THE BAR CHANGED UNDER AN EDIT (the full-game audit's A26: slot 4 set to Salted Swordfish on the HUD bar, and Hunt prep kept the old bar):
     the server's slot comes in where the player changed nothing, the player's stance stays; both changing the same slot is no answer */
  {
    const base = D.draftFrom(set), key = D.draftKey(base);
    const mine = D.draftFrom(set); mine.stance = 'offensive';
    const theirs = D.draftFrom(set); theirs.slots[3] = { action: { type: 'consume', id: 'salted_swordfish' }, conditions: [], join: 'and' };
    const merged = D.rebaseDraft(mine, key, theirs);
    if (!merged || merged.stance !== 'offensive' || JSON.stringify(merged.slots[3]) !== JSON.stringify(theirs.slots[3]) || JSON.stringify(merged.slots[0]) !== JSON.stringify(base.slots[0]))
      fails.push('AW-86 a HUD change under a Hunt prep edit reads ' + JSON.stringify(merged && { stance: merged.stance, s4: merged.slots[3] }));
    const both = D.draftFrom(set); both.slots[3] = { action: { type: 'consume', id: 'salted_lobster' }, conditions: [], join: 'and' };
    if (D.rebaseDraft(both, key, theirs) !== null) fails.push('AW-86 the same slot changed both ways was merged');
  }
  // AW-87: Save and use, a refused save, a stale copy
  {
    calls.length = 0;
    const cs = fakeCs(fx), sc = scratch();
    sc.picked = 2; sc.draft = D.draftFrom(set); sc.base = D.draftKey(sc.draft); sc.draftFor = 2;
    sc.draft.chase = false;
    B.saveDraft({ character: cs, account: {} }, sc, noop, true);
    await settle();
    if (calls.map((c) => c[0] + ':' + c[1]).join() !== 'hr_action_set_options:2,hr_hunt_preset_apply:2') fails.push('AW-87 Save and use sent ' + JSON.stringify(calls.map((c) => c[0] + ':' + c[1])));
    calls.length = 0;
    const cs2 = fakeCs(fx, (name) => (name === 'hr_action_set_options' ? { ok: false, error: 'bad_slot', slot: 3 } : { ok: true })), sc2 = scratch();
    sc2.picked = 2; sc2.draft = D.draftFrom(set); sc2.base = D.draftKey(sc2.draft); sc2.draftFor = 2; sc2.draft.chase = false;
    B.saveDraft({ character: cs2, account: {} }, sc2, noop, true);
    await settle();
    if (calls.map((c) => c[0]).join() !== 'hr_action_set_options' || sc2.draft === null) fails.push('AW-87 a refused save sent ' + calls.map((c) => c[0]).join() + (sc2.draft === null ? ' and dropped the copy' : ''));
    calls.length = 0;
    const sc3 = scratch();
    sc3.draft = D.draftFrom(set); sc3.base = D.draftKey(sc3.draft); sc3.draftFor = 0; sc3.draft.chase = false; sc3.stale = true;
    B.saveDraft({ character: fakeCs(fx), account: {} }, sc3, noop, false);
    await settle();
    if (calls.length) fails.push('AW-87 a stale copy (the bar changed under it) was sent: ' + calls.map((c) => c[0]).join());
  }
  /* AW-87 A PICK IN CONFIGURE ACTION IS IN HUNT PREP'S COPY AT ONCE (the 139 audit's B1: Hunt prep, slot 4, Salted Trout, the window's Back,
     Save, and the bar kept Salted Shrimp, so a card's "Pick Salted Trout" could not be followed): Configure action opened on the copy's slot 4
     and picking Salted Trout, then left by Back (no Configure Save), and the builder's Save sends Salted Trout in slot 4; Cancel puts the
     slot back as it opened */
  {
    /* the instance configure-action.js holds (its import carries the build's ?v=): one host map, not two */
    const BD = await import(pathToFileURL(join(base, 'src/shell/bar-draft.js')).href + sourceQuery(base));
    const CA = await imp('src/shell/windows/configure-action.js');
    const cs = fakeCs(fx), sc = scratch();
    sc.draft = D.draftFrom(set); sc.base = D.draftKey(sc.draft); sc.draftFor = 0; sc.view = set;
    const was = JSON.stringify(sc.draft.slots[3]);
    const host = { bar: () => sc.draft.slots.slice(), set: () => set, write: (k, s) => { sc.draft.slots[k] = s; }, move: () => {}, after: () => {} };
    const ctx = { character: cs, wm: { close: () => {} }, refresh: () => {} };
    const pick = (id) => CA.renderConfigureAction.act(ctx, { querySelector: () => null }, 'cfg', { type: 'click', clientX: 0, clientY: 0 },
      el({ 'data-x': 'pick', 'data-type': 'consume', 'data-id': id }));
    BD.openSlotIn(cs, 3, host);
    pick('salted_trout');
    calls.length = 0;
    B.saveDraft({ character: cs, account: {} }, sc, noop, false);
    await settle();
    const o = sent('hr_action_set_options');
    if (o.length !== 1 || !o[0][2].slots[3] || o[0][2].slots[3].action.id !== 'salted_trout') fails.push('AW-87 a pick left by Back saved slot 4 as ' + JSON.stringify(o.map((c) => c[2].slots[3])));
    const sc2 = scratch();
    sc2.draft = D.draftFrom(set); sc2.base = D.draftKey(sc2.draft); sc2.draftFor = 0; sc2.view = set;
    const host2 = Object.assign({}, host, { bar: () => sc2.draft.slots.slice(), write: (k, s) => { sc2.draft.slots[k] = s; } });
    BD.openSlotIn(cs, 3, host2);
    pick('salted_trout');
    CA.renderConfigureAction.act(ctx, { querySelector: () => null }, 'cfg', { type: 'click', clientX: 0, clientY: 0 }, el({ 'data-x': 'cancel' }));
    if (JSON.stringify(sc2.draft.slots[3]) !== was) fails.push('AW-87 Cancel left slot 4 as ' + JSON.stringify(sc2.draft.slots[3]));
  }
  /* AW-87 ONE BAR TRUTH (the full-game audit's A26, 2026-11-18: Save left "Not saved: Preset 1" over the bar the hunt reads): a hero in town
     whose bar in use has no setup row saves the bar, then keeps it as that setup under its own name; mid-hunt, past the hero's count, or with
     a row already, only the bar goes */
  {
    const town = Object.assign(clone(fx), { hunt: null, hunt_presets: [] });
    const runSave = async (env) => {
      calls.length = 0;
      const sc = scratch();
      sc.draft = D.draftFrom(set); sc.base = D.draftKey(sc.draft); sc.draftFor = 0; sc.draft.chase = false;
      B.saveDraft({ character: fakeCs(env), account: {} }, sc, noop, false);
      await settle();
      return calls.map((c) => c[0] + ':' + c[1] + (c[0] === 'hr_hunt_preset_save' ? ':' + c[2] : '')).join();
    };
    const said = [await runSave(town), await runSave(Object.assign(clone(town), { hunt: fx.hunt })), await runSave(Object.assign(clone(town), { setup_slots: { count: 0, max: 5 } })),
      await runSave(fx)];
    if (said[0] !== 'hr_action_set_options:0,hr_hunt_preset_save:0:Hunt' || said[1] !== 'hr_action_set_options:0' || said[2] !== 'hr_action_set_options:0' || said[3] !== 'hr_action_set_options:0')
      fails.push('AW-87 Save on the bar in use with no setup row sent ' + JSON.stringify(said));
  }
  // AW-88: Use equipped asks once; AW-89: New on the first free number
  {
    calls.length = 0;
    const cs = fakeCs(fx), ctx = { character: cs, account: {} }, sc = scratch();
    sc.picked = 2;
    const body = { querySelector: () => null };
    S.actSetups(ctx, body, sc, noop, 'use-equipped', click, el({}));
    await settle();
    if (calls.length || !sc.armingEquipped) fails.push('AW-88 the first Use equipped press sent ' + calls.map((c) => c[0]).join() + (sc.armingEquipped ? '' : ' and did not ask'));
    S.actSetups(ctx, body, sc, noop, 'use-equipped', click, el({}));
    await settle();
    const over = sent('hr_hunt_preset_save');
    if (over.length !== 1 || over[0][1] !== 2 || over[0][2] !== 'Boss nights' || calls.length !== 1) fails.push('AW-88 the second Use equipped press sent ' + JSON.stringify(calls));
    calls.length = 0;
    const input = { value: '  Thicket solo ', disabled: false, focus() { input.focused = true; } };
    const body2 = { querySelector: (q) => (q === '.hw-preset-name' ? input : null) };
    const sc2 = scratch();
    S.actSetups(ctx, body2, sc2, noop, 'new', click, el({}));
    if (!sc2.adding || !input.focused || calls.length) fails.push('AW-89 New did not open the name field (or sent something)');
    S.actSetups(ctx, body2, sc2, noop, 'save-new', click, el({}));
    await settle();
    const fresh = sent('hr_hunt_preset_save');
    if (fresh.length !== 1 || fresh[0][1] !== 1 || fresh[0][2] !== 'Thicket solo') fails.push('AW-89 New saved ' + JSON.stringify(fresh) + ' (want number 1, the first free, named Thicket solo)');
    if (sc2.picked !== 1 || sc2.adding) fails.push('AW-89 the new setup is not the one picked, or the field stayed open');
    calls.length = 0;
    input.value = '';
    S.actSetups(ctx, body2, scratch(), noop, 'save-new', click, el({}));
    await settle();
    if (sent('hr_hunt_preset_save').map((c) => c[2]).join() !== 'Setup 2') fails.push('AW-89 an empty name saved as ' + JSON.stringify(sent('hr_hunt_preset_save')));
    if (S.firstFree([{ preset: 0 }, { preset: 1 }, { preset: 2 }, { preset: 3 }, { preset: 4 }]) !== 5) fails.push('AW-89 with every number taken the first free is not the limit');
  }
  // AW-90: Fights as
  {
    const ranger = B.fightsLine('ranger', 'tank', { weapon: 'iron_sword', shield: 'wooden_shield' });
    if (ranger !== 'Requires a bow or a crossbow') fails.push('AW-90 the Ranger hint reads ' + JSON.stringify(ranger));
    const worn = B.fightsLine('tank', 'tank', { weapon: 'iron_sword', shield: 'wooden_shield' });
    if (!/Iron Sword/.test(worn) || !/Wooden shield/i.test(worn) || /Wear a/.test(worn)) fails.push('AW-90 the worn role\'s line reads ' + JSON.stringify(worn));
    if (B.fightsLine(null, 'melee_dps', {}) !== 'Weapon: none') fails.push('AW-90 no weapon does not read as bare hands');
    for (const r of ['tank', 'melee_dps', 'ranger', 'mage', 'healer']) if (typeof TEXT.prep['fights_' + r] !== 'string') fails.push('AW-90 no hint row for ' + r);
  }
  // AW-91: Sort and Clear edit the copy and send nothing
  {
    calls.length = 0;
    const cs = fakeCs(fx), ctx = { character: cs, account: {} }, sc = scratch();
    sc.draft = D.draftFrom(set); sc.base = D.draftKey(sc.draft); sc.draftFor = 0;
    /* the fixture's bar: power_strike, flame_strike (moves), wheat_bread, goldenroot_tea (food and drink); put the bread first by hand */
    sc.draft.slots = D.dropPlan(sc.draft.slots, 2, 7) || sc.draft.slots;
    sc.draft.slots = D.dropPlan(sc.draft.slots, 7, 0) || sc.draft.slots;   /* (a drop that cannot apply is AW-86's to judge) */
    /* now bread (slot 1), flame_strike (2), tea (4), power_strike (8): every one ruled, so Sort keeps each lane's order: the moves, then the food and drink */
    const pre = sc.draft.slots.slice();
    B.actBuilder(ctx, {}, sc, noop, 'sort', click, el({}));
    const ids = sc.draft.slots.map((s) => (s ? s.action.id : '-')).join(' ');
    const { sortBar } = await imp('src/shell/bar-sort.js');
    if (!/^flame_strike power_strike wheat_bread goldenroot_tea( -){16}$/.test(ids) || !sc.sorted) fails.push('AW-91 Sort reads ' + ids + (sc.sorted ? '' : ' and the line is not shown'));
    if (JSON.stringify(sc.draft.slots) !== JSON.stringify(sortBar(pre))) fails.push('AW-91 Sort is not bar-sort.js over the copy');
    B.actBuilder(ctx, {}, sc, noop, 'clear', click, el({}));
    if (sc.draft.slots.length !== 20 || sc.draft.slots.some(Boolean) || !sc.cleared) fails.push('AW-91 Clear left ' + sc.draft.slots.filter(Boolean).length + ' slots');
    B.actBuilder(ctx, {}, sc, noop, 'd-stance', click, el({ 'data-val': 'defensive' }));
    B.actBuilder(ctx, {}, sc, noop, 'd-chase', click, el({}));
    B.actBuilder(ctx, {}, sc, noop, 'd-dist', click, el({ 'data-val': '1' }));
    B.actBuilder(ctx, {}, sc, noop, 'd-target', { type: 'change' }, el({}, { value: 'strongest' }));
    B.actBuilder(ctx, {}, sc, noop, 'd-gold', { type: 'change' }, el({}, { value: '500' }));
    const d = sc.draft;
    if (d.stance !== 'defensive' || d.chase !== false || d.distance !== 2 || d.targetMode !== 'strongest' || d.goldFloor !== 500) fails.push('AW-91 the controls wrote ' + JSON.stringify([d.stance, d.chase, d.distance, d.targetMode, d.goldFloor]));
    if (calls.length) fails.push('AW-91 editing the copy sent ' + calls.map((c) => c[0]).join());
    if (!B.draftDirty(sc)) fails.push('AW-91 an edited copy does not read as not saved');
  }
  // AW-92: the read
  {
    const rpcs = [];
    const server = { rpc: async (name, args) => { rpcs.push([name, args]); return { ok: true, status: 200, body: Object.assign({ ok: true }, clone(fx.hunt_settings), { preset: args.p_preset, stance: 'offensive', store: [] }) }; } };
    const account = { server };
    const cs = fakeCs(fx);
    const live = await R.readPreset(account, cs, 0);
    if (!live.ok || !live.live || rpcs.length || live.set.preset !== 0 || live.set.stance !== 'balanced') fails.push('AW-92 the setup in use was read from the server, or not from the envelope: ' + JSON.stringify([live.ok, live.live, rpcs.length]));
    const other = await R.readPreset(account, cs, 2);
    if (rpcs.length !== 1 || rpcs[0][0] !== 'hr_hunt_preset_read' || JSON.stringify(rpcs[0][1]) !== '{"p_slot":0,"p_preset":2}') fails.push('AW-92 another setup asked ' + JSON.stringify(rpcs));
    if (!other.ok || other.live || other.set.preset !== 2 || other.set.stance !== 'offensive' || other.set.slots.length !== 20 || !other.set.store.length) fails.push('AW-92 the read parsed as ' + JSON.stringify(other).slice(0, 200));
    const refused = await R.readPreset({ server: { rpc: async () => ({ ok: false, status: 404, error: 'http_404', body: null }) } }, cs, 2);
    if (refused.ok || !refused.error) fails.push('AW-92 a refused read reads ' + JSON.stringify(refused));
    const limited = await R.readPreset({ server: { rpc: async () => ({ ok: true, status: 200, body: { ok: false, error: 'rate_limited' } }) } }, cs, 2);
    if (limited.ok || limited.error !== 'rate_limited') fails.push('AW-92 the refusal code the server sent is lost: ' + JSON.stringify(limited));
    const bad = await R.readPreset(account, cs, 9);
    if (bad.ok || rpcs.length !== 1) fails.push('AW-92 a preset past the limit was asked');
  }
  return fails;
}

/* This family's pure rules: the plain run and a clean control of its pure mutants run them (a page mutant never does). */
async function pure() {
  return [await huntsRules(ROOT), await prepBuilderRules(ROOT)].flat();
}

/* The page rules, in the monolith's order (a mutant is caught by the first rule that goes red: tests/_alpha-windows.mjs pageRun). */
async function checks(overrides, shots, opts) {
  return pageRun(overrides, shots, opts, pure, async ({ fails, open, shot }) => {
    /* mutant-rules-start */
    { // AW-7 no supplies in the Shop; AW-8 hunt prep
      /* The fixture's server still offers food, drink and ammo (the pre-2026-11-02 section): the client must drop them. */
      /* The hero is BURYING when Use is pressed (Andy live 10-21: "burying locks an action"), so in town:
         the fixture's hunt has ended (Use is town-only since presets C4; tests/preset-names.mjs holds that rule).
         The Shop lists the outfitter's gear above the tools (designer 2026-10-22, 2026-11-24-shop-outfitter.sql). */
      const tools = (e) => { e.shop = Object.assign({}, e.shop, { offers: e.shop.offers.concat([{ offer: 'supply.bronze_axe', item: 'bronze_axe', kind: 'tool', price: 120 },
        { offer: 'supply.leather_gloves', item: 'leather_gloves', kind: 'gear', price: 160 }]) });
        e.state = Object.assign({}, e.state, { active_kind: 'artisan', active_id: 'fuel_bones' });
        e.hunt = Object.assign({}, e.hunt, { ended: true }); };
      const { ctx, page, s, errors, up } = await open({ mutateEnv: tools });
      if (up) {
        if (!(await openWin(page, 'v', 'shop'))) fails.push('AW-7 V did not open the Shop: ' + JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win]')).map((w) => w.getAttribute('data-hs-win') + (w.classList.contains('is-leaving') ? ':leaving' : '')))) + ' ' + errors.slice(0, 2).join(' | '));
        await page.waitForTimeout(150);
        const shop = await page.evaluate(() => ({ tabs: Array.from(document.querySelectorAll('.hw-shop .hw-tab')).map((b) => b.getAttribute('data-tab')),
          lines: Array.from(document.querySelectorAll('.hw-shop [data-pane="buy"] .hw-line')).map((l) => l.getAttribute('data-item')),
          refill: !!document.querySelector('.hw-shop [data-hs-act="refill"]') }));
        /* Buy, Sell, and Services (stamina and Blessings, Tyler 2026-10-25): no supply refill anywhere */
        if (shop.tabs.join() !== 'buy,sell,services' || shop.refill) fails.push('AW-7 the Shop\'s tabs are ' + JSON.stringify(shop) + ', want Buy, Sell and Services and no refill'
          + ' [' + (await page.evaluate(() => { const w = document.querySelector('[data-hs-win="shop"]'); return w ? w.outerHTML.slice(0, 400) : 'no shop'; })) + '] ' + errors.slice(0, 2).join(' | '));
        if (shop.lines.join() !== 'leather_gloves,bronze_axe') fails.push('AW-7 the Shop offers ' + JSON.stringify(shop.lines) + ', not the gear then the tools alone');
        /* AW-96 (first-30 play 2026-11-12): a row never says "0 in the bag"; it wrapped a new hero's every row to three lines */
        const zero = await page.evaluate(() => Array.from(document.querySelectorAll('.hw-shop [data-pane="buy"] .hw-line small')).map((x) => x.textContent).filter((x) => /(^|, )0 in the bag/.test(x) || !/ each/.test(x)));
        if (zero.length) fails.push('AW-96 a Buy row says ' + JSON.stringify(zero));
        /* The session reader is the first filter (the Buy lists only draw their own kinds, so they mask it): it drops
           the fixture's food, drink and ammo itself. */
        const kept = await page.evaluate(async (offers) => (await import('/src/session/item-sections.js?v=0.1.0'))
          .shopOf({ read: (k) => (k === 'shop' ? { offers } : null) }).offers.map((o) => o.kind), FIXTURE.shop.offers);
        if (kept.length) fails.push('AW-7 the session keeps Shop offers of kind ' + JSON.stringify(kept) + ' the server must not sell');
        if (shots) await shot(page, 'alpha-1440x900-shop-tools');
        await openWin(page, 'p', 'hunt-prep');
        await page.waitForTimeout(200);
        if (await page.evaluate(() => !!document.querySelector('[data-hs-act="refill"]'))) fails.push('AW-7 Hunt prep still offers a refill');
        const line = await page.evaluate(() => document.querySelector('.hw-ready-line b').textContent);
        if (line !== AW8_LINE) fails.push('AW-8 the readiness line reads "' + line + '"');
        /* THE CHECKLIST OPENS UNDER THE FOOT, NOT BEHIND IT (v0.2.141 gate: "Ready to hunt" sat 12 px under the foot, whose negative margin is for a
           foot that is last); closed again so the rest reads the window as it was */
        await page.click('[data-hs-win="hunt-prep"] [data-hs-act="ready"]');
        await page.waitForTimeout(250);
        const under = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunt-prep"]'), h = w.querySelector('.hpb-ready-head.is-on');
          return h ? { foot: Math.round(w.querySelector('.hpb-foot').getBoundingClientRect().bottom), head: Math.round(h.getBoundingClientRect().top) } : null; });
        if (!under || under.head < under.foot) fails.push('AW-8 the readiness checklist\'s head lies under the foot: ' + JSON.stringify(under));
        await page.click('[data-hs-win="hunt-prep"] [data-hs-act="ready"]');
        await page.waitForTimeout(150);
        if (shots) await shot(page, 'alpha-1440x900-hunt-prep');
        await page.click('[data-hs-act="apply"][data-preset="0"]');
        /* Use is TWO round trips here (stop the bury, then the apply): wait for the apply itself, not a fixed 600 ms
           (a loaded box answered the first after it and read "Use sent []"); then let any second, wrong one land. */
        for (let i = 0; i < 40 && !sent(s, 'hr_hunt_preset_apply').length; i++) await page.waitForTimeout(100);
        await page.waitForTimeout(300);
        const ap = sent(s, 'hr_hunt_preset_apply');
        if (ap.length !== 1 || ap[0].body.p_preset !== 0) fails.push('AW-8 Use sent ' + JSON.stringify(ap.map((c) => c.body)));
        /* A running bury yields: ONE set_activity idle (the engine pays the bones buried so far) BEFORE the apply. */
        const order = s.calls.map((c, i) => [i, c]).filter(([, c]) => c.name === 'hr_hunt_preset_apply' || (c.name === 'hr-accrue' && c.body.verb === 'set_activity'));
        if (order.length !== 2 || order[0][1].name !== 'hr-accrue' || JSON.stringify(order[0][1].body.activity) !== '{"kind":"idle"}')
          fails.push('AW-8 a burying hero\'s Use did not stop the bury first: ' + JSON.stringify(order.map(([, c]) => c.name + ':' + JSON.stringify(c.body.activity || c.body.p_preset))));
        if (shots) {
          await openWin(page, 'b', 'inventory');
          await page.fill('[data-hs-win="inventory"] .hw-q', 'rat');
          await page.waitForTimeout(600);
          await shot(page, 'alpha-1440x900-find');
        }
      } else fails.push('AW-7 the screen did not mount');
      await ctx.close();
    }

    { // AW-65 CARRY IN (Tyler 2026-11-02, "Yes, add a press"): a hunting hero's Hunt prep offers the bag's supplies with the
      // server's two counts; Carry asks how many and sends ONE hr_hunt_restock (an item id and a count, nothing else); the
      // counts change only from the server's re-read; a settle_first refusal runs the hunter's settle, then ONE more ask
      // under a NEW key. A stateful stub: the server's answer moves its own counts.
      const hunting = (e) => {
        e.hunt = Object.assign({}, e.hunt, { ended: false, session: { bag: [{ item: 'wheat_bread', left: 9, loaded: 14, essential: false }] } });
        e.inventory = Object.assign({}, e.inventory, { cooked_shrimp: 40 });
      };
      const { ctx, page, s, errors, up } = await open({ mutateEnv: hunting });
      if (up) {
        s.onCall = (name, b) => {
          if (name !== 'hr_hunt_restock') return;
          if (s.carryRefuse) { s.reply = { ok: false, error: s.carryRefuse }; s.carryRefuse = null; return; }
          const inv = s.env.inventory, bag = s.env.hunt.session.bag;
          inv[b.p_item] -= b.p_qty; if (!inv[b.p_item]) delete inv[b.p_item];
          const l = bag.find((x) => x.item === b.p_item);
          if (l) { l.left += b.p_qty; l.loaded += b.p_qty; } else bag.push({ item: b.p_item, left: b.p_qty, loaded: b.p_qty, essential: false });
          s.reply = { ok: true, item: b.p_item, qty: b.p_qty, left: (l || bag[bag.length - 1]).left, have: inv[b.p_item] || 0 };
        };
        const P = '[data-hs-win="hunt-prep"] ';
        const row = () => page.evaluate((w) => {
          const b = document.querySelector(w + '[data-hs-act="carry"][data-item="cooked_shrimp"]'), li = b && b.closest('li');
          return li ? { press: b.textContent, label: b.getAttribute('aria-label'), small: li.querySelector('small').textContent, head: !!document.querySelector(w + '.hw-carry-head.is-on') } : null;
        }, P);
        const carry = async (n) => {
          await page.click(P + '[data-hs-act="carry"][data-item="cooked_shrimp"]');
          if (!(await wait(page, () => document.querySelector('.hw-menu.is-on .hw-amt-n'), null, 2000))) return false;
          await page.fill('.hw-menu .hw-amt-n', String(n));
          await page.keyboard.press('Enter');
          return true;
        };
        const said = () => page.evaluate((w) => document.querySelector(w + '.hh-intent-msg').textContent, P);
        if (!(await openWin(page, 'p', 'hunt-prep'))) fails.push('AW-65 P did not open Hunt prep while hunting');
        await page.waitForTimeout(200);
        const r0 = await row();
        if (!r0 || r0.press !== 'Carry 40' || r0.label !== 'Carry 40 into this hunt' || r0.small !== '40 in backpack, 0 in hunt' || !r0.head)
          fails.push('AW-65 a hunting hero\'s Hunt prep offers ' + JSON.stringify(r0) + ' ' + errors.slice(0, 2).join(' | '));
        if (!(await carry(25))) fails.push('AW-65 Carry did not ask how many');
        for (let i = 0; i < 40 && !/^Carried/.test(await said()); i++) await page.waitForTimeout(100);
        const c = sent(s, 'hr_hunt_restock');
        if (c.length !== 1 || c[0].body.p_slot !== 0 || c[0].body.p_item !== 'cooked_shrimp' || c[0].body.p_qty !== 25 || !/^[0-9a-f-]{36}$/.test(c[0].body.p_idem)
            || Object.keys(c[0].body).sort().join() !== 'p_idem,p_item,p_qty,p_slot') fails.push('AW-65 Carry 25 sent ' + JSON.stringify(c.map((x) => x.body)));
        const r1 = await row();
        if (!r1 || r1.small !== '15 in backpack, 25 in hunt' || r1.press !== 'Carry 15') fails.push('AW-65 after the server moved 25, Hunt prep reads ' + JSON.stringify(r1));
        if ((await said()) !== 'Carried 25 Cooked Shrimp into this hunt.') fails.push('AW-65 the answer reads ' + JSON.stringify(await said()));
        /* the hunt is still catching up: the hunter's own settle (paced: catch-up.js's rule), then ONE more ask under a NEW
           key (the first wrote nothing), and the line is the second answer's */
        s.carryRefuse = 'settle_first';
        const at = s.calls.length;
        if (!(await carry(5))) fails.push('AW-65 the second Carry did not ask how many');
        for (let i = 0; i < 40 && sent(s, 'hr_hunt_restock').length < 3; i++) await page.waitForTimeout(100);
        for (let i = 0; i < 40 && !/^Carried 5 /.test(await said()); i++) await page.waitForTimeout(100);
        const asks = s.calls.slice(at).filter((x) => x.name === 'hr_hunt_restock');
        if (asks.length !== 2 || asks[0].body.p_idem === asks[1].body.p_idem || asks.some((x) => x.body.p_qty !== 5))
          fails.push('AW-65 a carry refused settle_first sent ' + JSON.stringify(asks.map((x) => x.body)));
        const r2 = await row();
        if (!r2 || r2.small !== '10 in backpack, 30 in hunt') fails.push('AW-65 after the retried carry, Hunt prep reads ' + JSON.stringify(r2));
        if (shots) await shot(page, 'alpha-1440x900-hunt-prep-carry');
      } else fails.push('AW-65 the screen did not mount');
      await ctx.close();
    }

    { // AW-25 .. AW-28: the Hunts window, master-detail (designer plan 2026-10-22), a Level 1 hero in town
      const { ctx, page, errors, s, up } = await open({ mutateEnv: levelOne });
      const W = '[data-hs-win="hunts"] ';
      if (!up || !(await openWin(page, 'h', 'hunts'))) fails.push('AW-25 the Hunts window did not open for a Level 1 hero');
      else {
        const drawn = await wait(page, (w) => document.querySelectorAll(w + '.hw-hd-mon.is-drawn').length === 3, W, 8000);
        const list = await page.evaluate((w) => Array.from(document.querySelectorAll(w + '.hw-hunt')).map((li) => [li.dataset.hunt, li.classList.contains('is-picked') ? 'picked' : '',
          li.querySelector('.hw-hunt-lv').textContent, li.querySelector('.hw-hunt-fit').getAttribute('data-tone'), li.querySelector('.hw-hunt-fit').textContent,
          li.querySelector('.hw-hunt-fits').textContent, li.querySelector('.hw-hunt-bestline').textContent, li.querySelector('.hw-hunt-glyph').title].join(':')), W);
        /* the Cellar reads Levels 1-4: its hunt ends at Level 5 (hunt-grounds.js endsAtLevel), and the list reads the band's top as the Level under it */
        const want = ['mill_cellar:picked:Levels 1–4:in:In range:Recommended:No record yet:Players: 1 to 4',
          'meadowbrook_thicket::Levels 5–15:above:Above level::No record yet:Players: 1 to 4',
          'millrace_sewer::Levels 5–25:above:Above level::No record yet:Players: 1 to 4',
          /* Wickstead, Greenhaven's sixth (lane b-greenhaven-6, opened on its art v0.2.63): the second solo door for 8-18 */
          'wickstead::Levels 8–18:above:Above level::No record yet:Players: 1 to 4',
          'mosslight_glade::Levels 16–31:far:Far above level::No record yet:Players: 1 to 4',
          'coppercap_warrens::Levels 32–50:far:Far above level::No record yet:Players: 1 to 4',
          /* the Barrow March's five grounds (v0.2.132: their packs opened, src/data/grounds status open) */
          'hasks_ford::Levels 45–60:far:Far above level::No record yet:Players: 1 to 4',
          'the_slake::Levels 50–65:far:Far above level::No record yet:Players: 1 to 4',
          'muster_barrows::Levels 55–75:far:Far above level::No record yet:Players: 1 to 4',
          'pyre_field::Levels 70–90:far:Far above level::No record yet:Players: 1 to 4',
          'krells_hold::Levels 85–110:far:Far above level::No record yet:Players: 1 to 4'];
        if (list.join('|') !== want.join('|')) fails.push('AW-25 the list lines read ' + JSON.stringify(list));
        /* AW-25 A SPACE BETWEEN THE PARTS (lane a-first-board-copy, the class of "Paid today 0 of 3resets"): a reader gets the words apart, the
           eye a dot between them (format.js sepHtml), and the picked ground's page reads its band the same way */
        const readLine = await page.evaluate((w) => { const li = document.querySelector(w + '.hw-hunt[data-hunt="mill_cellar"]');
          const seen = (n) => (n ? n.innerText.replace(/\u00a0/g, ' ') : null);
          return [seen(li.querySelector('.hw-hunt-band')), seen(li.querySelector('.hw-hunt-sub')), seen(document.querySelector(w + '.hw-hd-band'))]; }, W);
        if (readLine[0] !== 'Levels 1–4 · In range' || readLine[1] !== 'Recommended · No record yet' || !/ · In range$/.test(readLine[2] || ''))
          fails.push('AW-25 a reader gets ' + JSON.stringify(readLine));
        /* The picked ground's page: who lives here as the world draws them, at a whole-number scale on one ground line. */
        const page1 = () => page.evaluate((w) => {
          const d = document.querySelector(w + '.hw-hunt-detail');
          const vis = (q) => { const n = d.querySelector(q); return n && n.getClientRects().length ? n.textContent : null; };
          return { name: vis('.hw-hd-name'), theme: vis('.hw-hd-theme'),
            sets: Array.from(d.querySelectorAll('.hw-hd-set')).map((n) => n.firstElementChild.textContent + ' · ' + n.querySelector('.hw-hd-odds').textContent),
            per: vis('.hw-hd-per-size'),
            rares: Array.from(d.querySelectorAll('.hw-hd-rares .hw-hd-rare')).map((n) => n.querySelector('.hw-hd-rare-name').textContent + ' / ' + n.querySelector('.hw-hd-rare-by').textContent + (n.classList.contains('is-trophy') ? ' (trophy)' : '')),
            raresShown: (() => { const h = d.querySelector('.hw-hd-rares'), head = h && h.previousElementSibling; return !!head && head.getClientRects().length > 0; })(),
            mons: Array.from(d.querySelectorAll('.hw-hd-mon')).map((li) => { const c = li.querySelector('canvas'), b = c.getBoundingClientRect(), st = li.querySelector('.hw-hd-stand').getBoundingClientRect();
              const how = li.querySelector('.hw-hd-mon-how');
              return { id: li.dataset.monster, how: how.innerText.replace(/\u00a0/g, ' '), drawn: li.classList.contains('is-drawn'), carrier: li.classList.contains('is-carrier'),
                w: c.width, h: c.height, cw: b.width, ch: b.height, ground: Math.round(st.bottom), inside: b.top >= st.top - 0.5 }; }),
            bests: Array.from(d.querySelectorAll('.hw-hd-best')).filter((n) => n.getClientRects().length).map((n) => n.textContent) };
        }, W);
        const p = await page1();
        /* x2: every side even, and shown at the canvas's own size (no CSS scaling; layout may land it on a sub-pixel). */
        if (!drawn || p.mons.some((m) => !m.drawn || !m.w || m.w % 2 || m.h % 2 || Math.abs(m.cw - m.w) > 0.5 || Math.abs(m.ch - m.h) > 0.5)) fails.push('AW-25 the creatures are not drawn at x2 from the world art: ' + JSON.stringify(p.mons));
        if (new Set(p.mons.map((m) => m.ground)).size !== 1 || p.mons.some((m) => !m.inside)) fails.push('AW-25 the creatures do not stand on one ground line, inside it: ' + JSON.stringify(p.mons.map((m) => [m.ground, m.inside])));
        const mons = p.mons.map((m) => m.id + ':' + m.how + (m.carrier ? ':carrier' : '')).join('|');
        /* AW-25 NO LINE STARTS OR ENDS ON A DOT (v0.2.131 gate: "Level 22" over "· uncommon"; v0.2.130: "Meadowbrook Thicket ·"). Measured:
           in 240 px cards every card draws its dot; narrowed until the cards and the list lines wrap, every dot still drawn has words
           on its own line on both sides. */
        const dots = await page.evaluate((w) => {
          const win = document.querySelector(w.trim()), lineup = win.querySelector('.hw-hd-lineup'), list = win.querySelector('.hw-hunt-list');
          const drawn = (root) => { const lines = [], out = [];
            const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let n = tw.nextNode(); n; n = tw.nextNode()) {
              if (!n.data.trim() || !n.parentElement.getClientRects().length) continue;
              const r = document.createRange(); r.selectNodeContents(n); for (const b of r.getClientRects()) if (b.width) lines.push(b);
              for (let i = n.data.indexOf('\u00b7'); i >= 0; i = n.data.indexOf('\u00b7', i + 1)) { const d = document.createRange(); d.setStart(n, i); d.setEnd(n, i + 1);
                const b = d.getBoundingClientRect(); if (b.width) out.push({ b, at: n.parentElement.parentElement.textContent }); } }
            root.querySelectorAll('.hh-sep').forEach((s) => { const b = s.getBoundingClientRect(); if (b.width > 0.5 && s.getClientRects().length) out.push({ b, at: s.parentElement.textContent }); });
            const same = (a, b) => Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < Math.min(a.height, b.height) / 2;
            return { n: out.length, alone: out.filter(({ b }) => !(lines.some((l) => same(l, b) && l.left < b.left - 1) && lines.some((l) => same(l, b) && l.right > b.right + 1))).map((x) => x.at) }; };
          lineup.style.gridTemplateColumns = 'repeat(auto-fill, 240px)'; const roomy = drawn(lineup).n;
          lineup.style.gridTemplateColumns = 'repeat(auto-fill, 72px)'; if (list) list.style.width = '150px';
          const go = Array.from(win.querySelectorAll('.hw-go-what')); go.forEach((g) => { g.style.display = 'inline-block'; g.style.width = '70px'; });
          const goDots = go.filter((g) => g.querySelector('.hh-sep')).length;
          const narrow = drawn(win), cards = Array.from(lineup.querySelectorAll('.hw-hd-mon-how')).filter((h) => h.getBoundingClientRect().height > 20).length;
          lineup.style.gridTemplateColumns = ''; if (list) list.style.width = ''; go.forEach((g) => { g.style.display = ''; g.style.width = ''; });
          return { roomy, cards, narrow, goDots };
        }, W);
        if (dots.roomy !== p.mons.length) fails.push('AW-25 with room, ' + dots.roomy + ' of ' + p.mons.length + ' creature cards draw their dot');
        if (!dots.cards) fails.push('AW-25 CONTROL: narrowed, no creature card wrapped');
        if (!dots.goDots) fails.push('AW-25 CONTROL: no Go as line has a dot to measure');
        if (dots.narrow.alone.length) fails.push('AW-25 a wrapped line starts or ends on a dot: ' + JSON.stringify(dots.narrow.alone));
        if (p.name !== 'Mill Cellar' || p.theme !== HUNTS.mill_cellar.theme || mons !== 'rat:Level 2 · common|slime:Level 2 · uncommon|hive_wasp:Level 4 · uncommon:carrier')
          fails.push('AW-25 the Mill Cellar page reads ' + JSON.stringify({ name: p.name, theme: p.theme, mons }));
        /* the fixture hero wears Leather Boots, so the medium line reads first; the Cellar's one Rare is the Hive Wasp's
           Queen's Comb (the Great Hearth's named fuel, src/data/hearth.js), so the wasp carries and the Rare heading shows */
        /* each line with its chance per kill, alone (the engine's rows: the pure AW-25 works the math from them) */
        if (p.sets.join('|') !== 'Helmets: Leather, Bronze, Apprentice · ' + CELLAR_ODDS || p.per !== 'chance per kill, hunting alone'
          || p.rares.join('|') !== "Queen's Comb / Hive Wasp" || !p.raresShown)
          fails.push('AW-25 the Cellar\'s drops read ' + JSON.stringify([p.sets, p.per, p.rares, p.raresShown]));
        if (p.bests.join('|') !== 'No record yet (hunt 10+ min)') fails.push('AW-25 with no best the page reads ' + JSON.stringify(p.bests));
        /* AW-25L EVERY DROP IS ON THE CARD (QA audit 2026-11-18 N9: ten minutes in the Cellar dropped 21 Rat Tail, Venom Sac, Stinger, Hide and Sticky Core, and
           the card named none): the loot list holds every row the engine can roll here past gear and Rares, the likeliest first, "+N more" opening the rest */
        const lootRows = () => page.evaluate((w) => Array.from(document.querySelectorAll(w + '.hw-hd-mats .hw-hd-rare')).map((n) => ({ id: n.dataset.item, shown: n.getClientRects().length > 0 })), W);
        const lootMore = () => page.evaluate((w) => { const b = document.querySelector(w + '.hw-hd-mats-more'); return b && b.getClientRects().length ? b.textContent : null; }, W);
        const lootBefore = await lootRows(), moreSaid = await lootMore();
        const LOOT_WANT = ['rat_tail', 'venom_sac', 'hive_wasp_stinger', 'giant_rat_hide', 'sticky_core', 'slime_gel', 'bones'];
        const lootMissing = LOOT_WANT.filter((id) => !lootBefore.some((x) => x.id === id));
        const lootHidden = lootBefore.filter((x) => !x.shown).length;
        if (lootMissing.length || lootBefore.length < 7 || lootBefore.slice(0, 6).some((x) => !x.shown) || moreSaid !== '+' + lootHidden + ' more' || !lootHidden)
          fails.push('AW-25L the Cellar\'s loot reads ' + JSON.stringify({ lootBefore, moreSaid, lootMissing }));
        else {
          await page.click(W + '.hw-hd-mats-more');
          await page.waitForTimeout(150);
          const lootAfter = await lootRows();
          if (lootAfter.some((x) => !x.shown) || await lootMore() !== null) fails.push('AW-25L "+N more" left rows hidden: ' + JSON.stringify(lootAfter));
        }
        if (shots) await shot(page, 'hunts-1440x900-cellar-level1');
        /* The server's best arrives: the line and the page take it (replaced, never kept from before). */
        s.env.hunt_bests = { min_ms: 600000, grounds: { mill_cellar: { solo: { xp_h: 7141, balance_h: 1859 } } } };
        await pushEnvelope(page, s);
        const best = await page.evaluate((w) => document.querySelector(w + '.hw-hunt[data-hunt="mill_cellar"] .hw-hunt-bestline').textContent, W);
        const p2 = await page1();
        if (best !== 'Best 7,141 Level XP/h' || p2.bests.join('|') !== 'Best alone: 7,141 Level XP/h, balance 1,859 gp/h') fails.push('AW-25 the server\'s best reads ' + JSON.stringify([best, p2.bests]));
        /* AW-25b THE PICK FOLLOWS THE ADVICE until the player picks by hand (lane/b-first-hour: the Cellar, picked for a
           Level 1 hero, stayed picked at Level 5 while the coach sent the hero to the Thicket). */
        const pickedNow = () => page.evaluate((w) => (document.querySelector(w + '.hw-hunt.is-picked') || {}).dataset?.hunt, W);
        s.env.state = Object.assign({}, s.env.state, { level_xp: LEVEL_5_XP });
        await pushEnvelope(page, s);
        const at5 = await wait(page, (w) => !!document.querySelector(w + '.hw-hunt.is-picked[data-hunt="meadowbrook_thicket"]'), W, 3000);
        if (!at5) fails.push('AW-25b at Level 5 the pick stayed on ' + (await pickedNow()) + ', not the Thicket the advice marks');
        await page.click(W + '.hw-hunt[data-hunt="mill_cellar"]');
        s.env.state = Object.assign({}, s.env.state, { level_xp: 0 });
        await pushEnvelope(page, s);
        s.env.state = Object.assign({}, s.env.state, { level_xp: LEVEL_5_XP });
        await pushEnvelope(page, s);
        if ((await pickedNow()) !== 'mill_cellar') fails.push('AW-25b a ground picked by hand was replaced by the advice: ' + (await pickedNow()));
        s.env.state = Object.assign({}, s.env.state, { level_xp: 0 });
        await pushEnvelope(page, s);
        /* AW-26 GO AS: the setups as lines, the one on now chosen; Enter as it is ONE hr_hunt_enter and no apply. */
        const goAs = () => page.evaluate((w) => Array.from(document.querySelectorAll(w + '.hw-go')).map((b) => [b.dataset.preset, b.getAttribute('aria-checked'), b.querySelector('.hw-go-name').textContent,
          b.querySelector('.hw-go-what').textContent.split(String.fromCharCode(160)).join(' '), b.querySelectorAll('.hw-go-bar .hh-icon').length, (b.querySelector('.hw-go-weapon img') || {}).src ? b.querySelector('.hw-go-weapon img').getAttribute('src').split('/').pop() : ''].join(':')), W);
        const g0 = (await goAs()).join('|');
        if (g0 !== '0:true:Hunt:Melee · on now:4:iron_sword.png|1:false:Bow:Ranger:0:shortbow.png') fails.push('AW-26 Go as reads ' + JSON.stringify(g0));
        /* AW-27 BEFORE YOU GO: what the bar spends, in slot order, from the server's bar, bag and gold. */
        /* The Before you go list itself: the boss hall's door (boss-hall-pane.js, v0.2.132) wears the same line class for its food line and
           tips, hidden on a ground with no hall, so a window-wide read took its hidden empty red line as "| !" (v0.2.132 release red). */
        const before = () => page.evaluate((w) => Array.from(document.querySelectorAll(w + 'ul.hw-before:not(.hw-hall-tips) > .hw-before-line')).map((li) => (li.classList.contains('is-short') ? '!' : '') + li.textContent).join(' | '), W);
        /* ...and no warning row the player can SEE is empty, wherever in the window it is drawn */
        const emptyShown = () => page.evaluate((w) => Array.from(document.querySelectorAll(w + '.hw-before-line')).filter((n) => n.getClientRects().length && !n.textContent.trim()).length, W);
        /* Flame Strike's slot names its store rune: carried runes first, then the store's a cast, and the gold pays it. */
        const b0 = await before();
        if (await emptyShown()) fails.push('AW-27 the Hunts window draws an empty Before you go row');
        if (b0 !== 'Runes: 40 Fire runes, then Plain Fire Rune (1 gp a cast) | Food: 14 Wheat Bread. Carried: 5 Cooked Shrimp, put it on the bar | Drink: 6 Goldenroot Tea | Stamina: 30 min left | Gold: 5,200 gp')
          fails.push('AW-27 Before you go reads ' + JSON.stringify(b0));
        if (await page.evaluate(() => !!document.querySelector('[data-hs-win="hunts"] .hw-ready, [data-hs-win="hunts"] .hw-checks'))) fails.push('AW-27 the Hunts window still carries the readiness checklist');
        /* The next envelope REPLACES every number (CLAUDE.md §6): fewer runes, less bread, no gold (that line now stops the hunt). */
        s.env.inventory = Object.assign({}, s.env.inventory, { chalked_fire_rune: 3 });
        s.env.hunt_settings = clone(s.env.hunt_settings);
        s.env.hunt_settings.slots[2].count = 2;
        s.env.state = Object.assign({}, s.env.state, { gold: 0 });
        await pushEnvelope(page, s);
        const b1 = await before();
        if (b1 !== 'Runes: 3 Fire runes, then Plain Fire Rune (1 gp a cast) | Food: 2 Wheat Bread. Carried: 5 Cooked Shrimp, put it on the bar | Drink: 6 Goldenroot Tea | Stamina: 30 min left | !Gold: none (hunt ends when supplies run out)')
          fails.push('AW-27 Before you go kept a number the server replaced: ' + JSON.stringify(b1));
        /* The page's own modules (a planted defect in them is what is served): a fresh hero's starter bar (the designer's
           walk-through row 4) and Bring your heroes (this account's other open heroes in no party). */
        const own = await page.evaluate(async (STORE) => {
          const m = await import('/src/shell/hunt-go.js?v=0.1.0');
          const slot = (type, id, count) => ({ action: { type, id }, conditions: [], join: 'and', usable: true, count });
          const sec = { hunt_settings: { preset: 0, presets: [], store: STORE, slots: [slot('ability', 'power_strike'), slot('consume', 'cooked_shrimp', 20), slot('consume', 'salted_shrimp', null), slot('consume', 'thin_turnip_juice', null)] },
            state: { gold: 500 }, inventory: { cooked_shrimp: 20 }, equipment: { weapon: 'practice_sword' } };
          const party = { id: '0a47c0de-0000-4000-a000-00000000aa01', members: [{ seat: 0, name: 'Mira' }], self_seat: 0, leader_seat: 0 };
          const hero = (slot, n, p) => ({ slot, status: 'ready', read: (k) => (k === 'name' ? n : k === 'party' && p ? party : null) });
          const me = hero(0, 'Tyler');
          /* AW-28b (audit 2026-11-15 F23): Bryn's Sewer page while Corwen, Ilsa and Maren play in Corwen's party read "Play one from Characters".
             Nobody to bring says who is in whose party and the way out; the leader, whose heroes are all with him, is told nothing. */
          const d = await import('/src/shell/windows/hunt-detail.js?v=0.1.0');
          const pty = { id: '0a47c0de-0000-4000-a000-00000000f023', members: [{ seat: 0, name: 'Corwen' }, { seat: 1, name: 'Ilsa' }, { seat: 2, name: 'Maren' }], leader_seat: 0 };
          const seated = (s, n) => ({ slot: s, status: 'ready', read: (k) => (k === 'name' ? n : k === 'party' ? { ...pty, self_seat: s } : null) });
          const four = [seated(0, 'Corwen'), seated(1, 'Ilsa'), seated(2, 'Maren'), hero(3, 'Bryn')];
          const noneOf = (cs) => d.bringNone({ bring: m.freeHeroes(cs, four), away: m.partiedHeroes(cs, four), others: m.openOthers(cs, four) });
          return { fresh: m.beforeLines({ read: (k) => sec[k] }).map((l) => l.text).join(' | '), free: m.freeHeroes(me, [me, hero(1, 'Mira', true), hero(2, 'Brannoc')]).map((h) => h.name).join(),
            none: [noneOf(four[3]), noneOf(four[0])] };
        }, FIXTURE.hunt_settings.store);
        if (own.none[0] !== "In Corwen's party: Corwen, Ilsa and Maren (switch to each, press Leave party)" || own.none[1] !== '')
          fails.push("AW-28b nobody to bring, all in Corwen's party, reads " + JSON.stringify(own.none));
        if (own.fresh !== 'Food: 20 Cooked Shrimp, then Salted Shrimp (14 gp) | Drink: Thin Turnip Juice (10 gp) | Gold: 500 gp')
          fails.push('AW-27 a fresh hero\'s Before you go reads ' + JSON.stringify(own.fresh));
        if (own.free !== 'Brannoc') fails.push('AW-28 Bring your heroes offers ' + JSON.stringify(own.free));
        /* AW-35 WHEN THE HUNT ENDS: no section, no control; then the server's section and its training rows arrive. */
        const afterOf = () => page.evaluate((w) => { const sel = document.querySelector(w + '.hw-after-pick'); const sec = sel && sel.closest('.hw-after');
          return sel ? { hidden: sec.hidden, options: Array.from(sel.options).map((o) => o.textContent), value: sel.value, off: sel.disabled, note: sec.querySelector('.hw-after-note').textContent } : null; }, W);
        const bare = await afterOf();
        if (!bare) fails.push('AW-35 the Hunts page has no When the hunt ends control');
        else if (!bare.hidden) fails.push('AW-35 a server with no hunt_after section still draws the control: ' + JSON.stringify(bare));
        if (bare) {
        s.env.hunt_after = { choice: 'job', skill: null, grace_s: 60, job: null, now: null, last: null };
        s.env.training = { skills: ['melee', 'ranged', 'magic', 'defense'], max_hours: 12, quotes: ['melee', 'ranged', 'magic', 'defense'].map((skill) => ({ skill, level: 12, fee_h: 122 })),
          rate: { xp_h: 30000, xp_h_item: 60000, boost_pm: 2000, min_level: 10, level: 12 } };
        await pushEnvelope(page, s);
        const offered = await afterOf();
        if (!offered || offered.hidden || offered.off || offered.options.join('|') !== 'Wait in town|Train Melee at the yard|Train Ranged at the yard|Train Magic at the yard|Train Defense at the yard'
          || offered.value !== 'wait' || !/^Waits in town \(no job to resume\)$/.test(offered.note)) fails.push('AW-35 When the hunt ends reads ' + JSON.stringify(offered));
        /* the server's choice is the picked one, with what it costs */
        s.env.hunt_after = { choice: 'train', skill: 'melee', grace_s: 60, job: { kind: 'gather', id: 'copper_rock' }, now: null, last: null };
        await pushEnvelope(page, s);
        const picked = await afterOf();
        if (!picked || picked.value !== 'train:melee' || picked.options[0] !== 'Go back to mining the Copper Rock'
          || picked.note !== '122 gp/h, paid hourly in advance · up to 12 h · Out of gold: waits in town') fails.push('AW-35 a hero that picked the yard reads ' + JSON.stringify(picked));
        if (shots) { await page.evaluate((w) => document.querySelector(w + '.hw-after').scrollIntoView({ block: 'center' }), W); await page.waitForTimeout(150); await shot(page, 'alpha-1440x900-hunt-after'); }
        /* a change sends ONE ask: the choice and the skill, nothing else */
        const h0 = sent(s, 'hr_hunt_after_set').length;
        await page.selectOption(W + '.hw-after-pick', 'wait');
        for (let i = 0; i < 30 && sent(s, 'hr_hunt_after_set').length === h0; i++) await page.waitForTimeout(100);
        await page.waitForTimeout(400);
        const asked = sent(s, 'hr_hunt_after_set').slice(h0).map((c) => c.body);
        if (asked.length !== 1 || asked[0].p_choice !== 'wait' || asked[0].p_skill !== null || Object.keys(asked[0]).sort().join() !== 'p_choice,p_idem,p_skill,p_slot') fails.push('AW-35 picking Wait in town sent ' + JSON.stringify(asked));
        /* the answer's re-read is what shows: the server still says the yard */
        const back = await afterOf();
        if (!back || back.value !== 'train:melee') fails.push('AW-35 the control kept a pick the server did not send back: ' + JSON.stringify(back && back.value));
        delete s.env.hunt_after; delete s.env.training;
        await pushEnvelope(page, s);
        }
        const enters = () => sent(s, 'hr_hunt_enter').length;
        const applies = () => sent(s, 'hr_hunt_preset_apply').length;
        let e0 = enters(), a0 = applies();
        await page.click(W + '.hw-hunt-detail .hw-hunt-enter');
        for (let i = 0; i < 30 && enters() === e0; i++) await page.waitForTimeout(100);
        await page.waitForTimeout(300);
        const asIs = sent(s, 'hr_hunt_enter').slice(e0);
        if (asIs.length !== 1 || asIs[0].body.p_preset !== 0 || asIs[0].body.p_hunt !== 'mill_cellar' || applies() !== a0) fails.push('AW-26 Enter as the setup on now sent ' + JSON.stringify(s.calls.slice(-3).map((c) => c.name + ':' + JSON.stringify(c.body.p_preset))));
        /* Another setup: ONE apply, then ONE enter as it, one press; every control off while it is in flight. */
        await page.click(W + '.hw-go[data-preset="1"]');
        const note = await page.evaluate((w) => document.querySelector(w + '.hw-go-note').textContent, W);
        if (note !== 'Enter equips Bow first' || !/^Supplies: set by Bow’s bar/.test(await before())) fails.push('AW-26 choosing Bow says ' + JSON.stringify([note, await before()]));
        e0 = enters(); a0 = applies();
        const mark = s.calls.length;
        await page.click(W + '.hw-hunt-detail .hw-hunt-enter');
        const off = await page.evaluate((w) => ({ enter: document.querySelector(w + '.hw-hunt-detail .hw-hunt-enter').disabled, go: Array.from(document.querySelectorAll(w + '.hw-go')).every((b) => b.disabled) }), W);
        if (!off.enter || !off.go) fails.push('AW-26 Enter or Go as stayed on while the press was in flight: ' + JSON.stringify(off));
        for (let i = 0; i < 40 && enters() === e0; i++) await page.waitForTimeout(100);
        await page.waitForTimeout(300);
        const order = s.calls.slice(mark).filter((c) => c.name === 'hr_hunt_preset_apply' || c.name === 'hr_hunt_enter').map((c) => c.name + ':' + c.body.p_preset);
        if (order.join() !== 'hr_hunt_preset_apply:1,hr_hunt_enter:1') fails.push('AW-26 Enter as Bow sent ' + JSON.stringify(order));
        /* A refused apply stops there, in words: nothing is entered. */
        s.reply = { ok: false, error: 'missing_item' };
        await page.click(W + '.hw-go[data-preset="1"]');
        e0 = enters();
        await page.click(W + '.hw-hunt-detail .hw-hunt-enter');
        for (let i = 0; i < 30 && !(await page.evaluate((w) => /not in your bag/.test(document.querySelector(w + '.hh-intent-msg').textContent), W)); i++) await page.waitForTimeout(100);
        const said = await page.evaluate((w) => document.querySelector(w + '.hh-intent-msg').textContent, W);
        if (enters() !== e0 || said !== 'Setup gear missing, nothing equipped') fails.push('AW-26 a refused apply entered or said ' + JSON.stringify([enters() - e0, said]));
        s.reply = { ok: true };
        /* AW-28 THE PARTY PATH: a party ground's page leads to a party; a solo ground's does not. */
        const party = () => page.evaluate((w) => { const b = document.querySelector(w + '.hw-hd-party'); return b && !b.hidden ? [b.querySelector('.hw-hd-party-why').textContent, b.querySelector('.hw-invite-here').textContent, b.querySelector('.hw-bring-none').textContent] : null; }, W);
        if (await party()) fails.push('AW-28 the Mill Cellar page offers a party path');
        await page.click(W + '.hw-hunt[data-hunt="millrace_sewer"]');
        await wait(page, (w) => document.querySelectorAll(w + '.hw-hd-mon.is-drawn').length === 6, W, 4000);
        const sewer = await page1();
        if (sewer.name !== 'The Sewer' || !sewer.rares.includes('Crown Shard / Rat King') || sewer.rares[sewer.rares.length - 1] !== 'Rat King\'s Crown / Rat King (trophy)'
          || sewer.sets.length !== 2 || !sewer.mons.some((m) => m.id === 'rat_king' && m.carrier && m.how === 'Level 25 · boss')) fails.push('AW-25 the Sewer page reads ' + JSON.stringify({ name: sewer.name, sets: sewer.sets, rares: sewer.rares, mons: sewer.mons.map((m) => m.id + ':' + m.how) }));
        /* the area casters, one note under the line (lane/d-area-playtest), never a taller card */
        const castNote = await page.evaluate((w) => { const n = document.querySelector(w + '.hw-hd-casts'); return n && !n.hidden ? n.textContent : null; }, W);
        if (castNote !== 'Sewer Kobold casts: Muck Fling · Rat King casts: Tail Lash and Squeal') fails.push('AW-25 the Sewer\'s casters note reads ' + JSON.stringify(castNote));
        const pp = await party();
        if (!pp || pp[0] !== 'Players: 1 to 4' || pp[1] !== 'Invite a player' || !/^Bring other heroes from Characters/.test(pp[2])) fails.push('AW-28 the Sewer page\'s party path reads ' + JSON.stringify(pp));
        /* Invite a player is a link: its words start on the section's edge with the lines around it, as Hunt prep's do (visual pass 2: a
           boxed button's 10 px padding stood it 8 px in from "Players: 1 to 4") */
        const inset = await page.evaluate((w) => { const a = document.querySelector(w + '.hw-invite-here'), why = document.querySelector(w + '.hw-hd-party-why');
          return a && why ? Math.round(a.getBoundingClientRect().left + parseFloat(getComputedStyle(a).paddingLeft) - why.getBoundingClientRect().left) : null; }, W);
        if (inset === null || inset > 2) fails.push('AW-28 Invite a player\'s words stand ' + inset + ' px in from the section\'s edge');
        if (shots) { await page.evaluate((w) => { const b = document.querySelector(w + '.hs-win-body'); b.scrollTop = 0; }, W); await shot(page, 'hunts-1440x900-sewer'); }
        if (shots) { await page.evaluate((w) => { const b = document.querySelector(w + '.hs-win-body'); b.scrollTop = b.scrollHeight; }, W); await shot(page, 'hunts-1440x900-sewer-foot'); }
        /* Invite a player: the Party window, its name box on screen; no read is sent (there is no party finder: 1059-no-party-finder.sql). */
        const c0 = s.calls.length;
        await page.click(W + '.hw-invite-here');
        const opened = await wait(page, () => document.querySelector('[data-hs-win="hunt-party"] [data-hs-built]'), null, 3000);
        const box = await page.evaluate(() => { const b = document.querySelector('[data-hs-win="hunt-party"] .hw-invite-name'); return !!b && b.getClientRects().length > 0; });
        const asked = s.calls.slice(c0).map((c) => c.name).filter((n) => /party/.test(n));
        if (!opened || !box || asked.length) fails.push('AW-28 Invite a player opened ' + JSON.stringify({ opened, box, asked }));
      }
      if (errors.length) fails.push('AW-25 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // AW-25c 1440x900: the first row of "Who lives here" stands whole above Enter, the warning over it included; a wrapped list line never starts with its dot (board 11-04)
      const { ctx, page, up } = await open({ viewport: { width: 1440, height: 900 }, mutateEnv: levelOne });
      const W = '[data-hs-win="hunts"] ';
      if (!up || !(await openWin(page, 'h', 'hunts'))) fails.push('AW-25c the Hunts window did not open at 1440x900');
      else {
        await page.click(W + '.hw-hunt[data-hunt="millrace_sewer"]');
        await page.waitForTimeout(400);
        const m = await page.evaluate((w) => { const f = document.querySelector(w + '.hw-hd-mon'), pg = document.querySelector(w + '.hw-hd-page'), sub = document.querySelector(w + '.hw-hunt-sub');
          const best = Array.from(document.querySelectorAll(w + '.hw-hunt-bestline')).find((e) => e.textContent);
          return { foot: f && f.getBoundingClientRect().bottom, end: pg.getBoundingClientRect().bottom, flow: getComputedStyle(sub).display, dot: best ? getComputedStyle(best, '::before').content : '' }; }, W);
        if (!m.foot || m.foot > m.end + 0.5) fails.push('AW-25c the first creature is cut at the pane\'s foot: ' + JSON.stringify(m));
        if (m.flow !== 'block') fails.push('AW-25c the list line wraps as flex items, so its dot can start a line: ' + m.flow);
      }
      await ctx.close();
    }

    { // AW-25b the phone: the list, then the ground's page as the sheet, with the way back
      const { ctx, page, up } = await open({ viewport: { width: 922, height: 423 }, mutateEnv: levelOne });
      const W = '[data-hs-win="hunts"] ';
      if (!up || !(await openWin(page, 'h', 'hunts'))) fails.push('AW-25 the Hunts sheet did not open at 922x423');
      else {
        const seen = () => page.evaluate((w) => { const on = (q) => { const n = document.querySelector(w + q); return !!n && n.getClientRects().length > 0; };
          const b = document.querySelector(w + '.hs-win-body'); return [on('.hw-hunt-list'), on('.hw-hunt-detail'), on('.hs-win-head .hs-back'), b.scrollWidth <= b.clientWidth + 1].join(); }, W);
        /* A press as the shell routes it (a DOM click): a control a mutant leaves off-screen is a rule's red, not a harness timeout. */
        const press = (q) => page.evaluate((sel) => { const n = document.querySelector(sel); if (n) n.click(); return !!n; }, W + q);
        const s0 = await seen();
        if (shots) await shot(page, 'hunts-922x423-list');
        await press('.hw-hunt[data-hunt="millrace_sewer"]');
        await page.waitForTimeout(300);
        const s1 = await seen();
        if (shots) await shot(page, 'hunts-922x423-sewer');
        await press('.hs-win-head .hs-back');
        await page.waitForTimeout(200);
        const s2 = await seen();
        if (s0 !== 'true,false,false,true' || s1 !== 'false,true,true,true' || s2 !== 'true,false,false,true') fails.push('AW-25 the phone sheet shows (list, page, back, fits) ' + JSON.stringify([s0, s1, s2]));
      }
      await ctx.close();
    }

    { // AW-29 THE ROUND TRIP: open Hunts, pick a ground, Enter, hunt, back in town: Hunts shows the same pick
      const { ctx, page, s, up } = await open({ mutateEnv: levelOne });
      const W = '[data-hs-win="hunts"] ';
      if (!up || !(await openWin(page, 'h', 'hunts'))) fails.push('AW-29 the Hunts window did not open');
      else {
        await page.click(W + '.hw-hunt[data-hunt="meadowbrook_thicket"]');
        /* a Level 1 under the Thicket's floor: the first press arms "Enter anyway", the second goes */
        await page.click(W + '.hw-hunt-detail .hw-hunt-enter');
        await page.click(W + '.hw-hunt-detail .hw-hunt-enter');
        for (let i = 0; i < 30 && !sent(s, 'hr_hunt_enter').length; i++) await page.waitForTimeout(100);
        const go = sent(s, 'hr_hunt_enter').map((c) => c.body.p_hunt);
        /* The server's answer: the hero is hunting there. */
        s.env.hunt = Object.assign(clone(FIXTURE.hunt), { hunt_id: 'meadowbrook_thicket' });
        s.env.state = Object.assign({}, s.env.state, { active_kind: 'combat', active_id: 'meadowbrook_thicket' });
        await pushEnvelope(page, s);
        /* The server says the hero is hunting: the window that sent the Enter closes (playtest 2026-10-24, HS-9b);
           opened again while hunting, it says where the hero is. */
        const closed = await wait(page, () => !document.querySelector('[data-hs-win="hunts"]:not(.is-leaving)'), null, 4000);
        if (!closed) fails.push('AW-29 the Hunts window stayed over the hunt it entered');
        await openWin(page, 'h', 'hunts');
        const hunting = await wait(page, (w) => /^Hunting: Meadowbrook Thicket/.test(document.querySelector(w + '.hw-hunts-now').textContent)
          && document.querySelector(w + '.hw-hunt-detail .hw-hunt-enter').disabled, W, 4000);
        /* Back in town (the hunt ended): the window still holds the Thicket, ready to go again; after a close and reopen too. */
        s.env.hunt = Object.assign({}, s.env.hunt, { ended: true });
        s.env.state = Object.assign({}, s.env.state, { active_kind: 'idle', active_id: null });
        await pushEnvelope(page, s);
        /* (The hunt's end may bring its summary forward; the Hunts window is opened again as a player would.) */
        await openWin(page, 'h', 'hunts');
        const back = await wait(page, (w) => /^Pick a hunt/.test(document.querySelector(w + '.hw-hunts-now').textContent), W, 4000);
        const after = await page.evaluate((w) => [(document.querySelector(w + '.hw-hunt.is-picked') || {}).dataset?.hunt, document.querySelector(w + '.hw-hd-name').textContent,
          document.querySelector(w + '.hw-hunt-detail .hw-hunt-enter').disabled].join(':'), W);
        if (go.join() !== 'meadowbrook_thicket' || !hunting || !back || after !== 'meadowbrook_thicket:Meadowbrook Thicket:false') fails.push('AW-29 the round trip reads ' + JSON.stringify({ go, hunting, back, after }));
      }
      await ctx.close();
    }

    { // AW-101 the bar in Hunt prep is whole (Coordinator review 2026-11-17: at 1518x845 slots 11-20 ran under the Close/Save foot)
      const inTown = (e) => { for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k]; e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null }); };
      /* 1280x800: the World is tall enough that a docked window stays above the bar (530 px, DOCK_ROOM_PX 525) and Hunt prep needs more, so only
         its `rise` lifts it. Since the place's row went into the top bar (v0.2.141, every World 45 px taller) Hunt prep fits whole above the
         bar at 1518x845, so no size here was left where `rise` was the only thing between its bar and Close and Save (run 44476966121). */
      const SIZES = [[1280, 720], [1280, 800], [1366, 768], [1518, 845], [1920, 1080], [922, 423]];
      for (const scene of ['town', 'hunt']) for (const [w, h] of SIZES) {
        const at = w + 'x' + h + ' (' + scene + ')';
        const { ctx, page, up } = await open(scene === 'town' ? { viewport: { width: w, height: h }, mutateEnv: inTown } : { viewport: { width: w, height: h } });
        if (!up) { fails.push('AW-101 the ' + at + ' screen did not mount'); await ctx.close(); continue; }
        if (!(await openWin(page, 'p', 'hunt-prep'))) { fails.push('AW-101 P did not open Hunt prep at ' + at); await ctx.close(); continue; }
        await page.waitForTimeout(400);
        const m = await page.evaluate(async () => {
          const frames = (n) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });
          const win = document.querySelector('[data-hs-win="hunt-prep"]');
          const moving = () => { for (let n = win; n; n = n.parentElement) if (getComputedStyle(n).transform !== 'none') return true; return false; };
          for (let i = 0; i < 40 && moving(); i++) await new Promise((r) => setTimeout(r, 50));
          await frames(3);
          const body = win.querySelector('.hs-win-body'), foot = win.querySelector('.hpb-foot');
          /* each slot at rest: whole above the foot's drawn rule and the topmost thing at its middle, wholly out of view, or cut; the foot's
             rule is its box-shadow drawn over the line above its box (a slot ending 1 px into it reads cut, and its well's frame under it) */
          const rule = (() => { const m = /(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(getComputedStyle(foot).boxShadow || ''); return m ? Math.min(0, parseFloat(m[2])) : 0; })();
          const read = () => {
            const br = body.getBoundingClientRect(), fr = foot.getBoundingClientRect();
            const floor = Math.min(br.top + body.clientTop + body.clientHeight, fr.top + rule, innerHeight);
            const n = { ok: 0, out: 0, cut: [] };
            for (const s of win.querySelectorAll('.hpb-grid .hb-slot')) {
              const q = s.getBoundingClientRect();
              if (q.bottom <= br.top + 0.5 || q.top >= floor - 0.5) { n.out++; continue; }
              const top = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
              if (q.top >= br.top - 0.5 && q.bottom <= floor + 0.5 && top && (top === s || s.contains(top))) n.ok++;
              else n.cut.push(s.getAttribute('data-slot') + ' ' + Math.round(q.top) + '..' + Math.round(q.bottom) + ' over ' + Math.round(floor));
            }
            n.foot = fr.height > 0 && fr.bottom <= Math.min(win.getBoundingClientRect().bottom, innerHeight) + 0.5;
            /* with every slot in view the bar's well is whole too: its frame never runs under the foot */
            n.well = n.ok === 20 ? win.querySelector('.hpb-gridwrap').getBoundingClientRect().bottom <= floor + 0.5 : null;
            return n;
          };
          const rest = read();
          /* the player scrolls the bar's well up to the foot: every slot whole and pressable, the foot still there */
          const g = win.querySelector('.hpb-gridwrap').getBoundingClientRect();
          body.scrollTop += Math.max(0, g.bottom - foot.getBoundingClientRect().top + 2);
          await frames(2);
          const scrolled = read();
          body.scrollTop = 0;
          return { rest, scrolled, phone: matchMedia('(max-height: 540px) and (max-width: 1024px)').matches };
        });
        /* at rest a row is whole or wholly out of view, never cut; in town on a desktop the window has the room, so all twenty show */
        if (m.rest.cut.length) fails.push('AW-101 at ' + at + ' Hunt prep opens with the bar cut: ' + JSON.stringify(m.rest));
        if (scene === 'town' && !m.phone && (m.rest.ok !== 20 || !m.rest.well)) fails.push('AW-101 at ' + at + ' Hunt prep opens without its whole bar: ' + JSON.stringify(m.rest));
        if (m.scrolled.ok !== 20 || !m.scrolled.well || !m.scrolled.foot) fails.push('AW-101 at ' + at + ' the bar scrolled into view is not whole above the foot: ' + JSON.stringify(m.scrolled));
        if (!m.rest.foot) fails.push('AW-101 at ' + at + ' Hunt prep\'s Close and Save are out of view');
        if (shots) await shot(page, 'prep-bar-' + w + 'x' + h + '-' + scene);
        await ctx.close();
      }
    }
  });
}

const MUTANTS = [
  /* QA audit 2026-11-18 N9, N11 and the UI audit's bag items */
  ['AW-25L the card lists materials only again', 'src/shell/windows/hunt-detail.js', '  const loot = lootOf(r.hunt), all =', '  const loot = lootOf(r.hunt).filter((x) => /gel|bones|wheat|fang|jelly|thread/.test(x.id)), all ='],
  /* v0.2.141 gate P3: the prep checklist under its foot */
  ['AW-8 the readiness checklist\'s head slides under the foot', 'src/styles/windows.css', '.hpb-foot:has(~ .hpb-ready-head.is-on) { margin-bottom: 0; }\n', ''],
  ['AW-28b nobody to bring tells heroes already playing to play one (audit F23)', 'src/shell/windows/hunt-detail.js', '  if (away.length) {\n', '  if (false) {\n'],
  ['AW-25 a creature card\'s dot can end its line','src/shell/windows/hunt-detail.js', "text(how.querySelector('.hw-hd-mon-lv'), lv);", "text(how.querySelector('.hw-hd-mon-lv'), lv && lv + ' ·');"],
  ['AW-25 the dot outlives the break that took its space', 'src/styles/hunt.css', '.hh-sep-t { font-size: 0; font-size-adjust: none; word-spacing: 0; }', '.hh-sep-t { font-size-adjust: none; word-spacing: 0; }'],
  ['AW-25 a list line\'s band and its fit run together in text', 'src/shell/windows/hunts.js', "prop(band.previousElementSibling, 'hidden', !fit || !fit.words);", "prop(band.previousElementSibling, 'hidden', true);"],
  ['AW-25 a list line\'s tag and best run together in text', 'src/shell/windows/hunts.js', "prop(li.querySelector('.hw-hunt-sub .hw-hunt-sep'), 'hidden', !tag || !best);", "prop(li.querySelector('.hw-hunt-sub .hw-hunt-sep'), 'hidden', true);"],
  ['AW-25 the page\'s band and its fit run together in text', 'src/shell/windows/hunt-detail.js', "prop(band.querySelector('.hw-hunt-sep'), 'hidden', !fitWordsShown);", "prop(band.querySelector('.hw-hunt-sep'), 'hidden', true);"],
  ['AW-25 the area casters back on each card (it grows a line)', 'src/shell/windows/hunt-detail.js', "'.hw-hd-mon-band'), m.boss ? 'boss' : m.band);", "'.hw-hd-mon-band'), (m.boss ? 'boss' : m.band) + (m.casts && m.casts.length ? ' · casts ' + m.casts.join(' and ') : ''));"],
  ['AW-25 the casters note is never shown', 'src/shell/windows/hunt-detail.js', "prop(det.querySelector('.hw-hd-casts'), 'hidden', !casts);", "prop(det.querySelector('.hw-hd-casts'), 'hidden', true);"],
  ['AW-101 Hunt prep stays under the dock in town, its bar under Close and Save', 'src/data/shell-windows.js', "over: true, rise: true, help: 'windows.help_prep'", "over: true, help: 'windows.help_prep'"],
  ['AW-94 the header never shows Back', 'src/shell/window-head.js', "  attr(back, 'hidden', !(inner || to));", "  attr(back, 'hidden', true);"],
  /* THE HUNT PREP BUILDER (AW-85 .. AW-92): the copy, its one intent, the drop, Save and use, Use equipped, New setup, Fights as, Sort, Clear, the read. */
  ['prep builder: Save drops the stance', 'src/shell/prep-draft.js', '  if (known(d.stance)) o.stance = d.stance;\n', ''],
  ['prep builder: Save sends a null for an option the server never sent', 'src/shell/prep-draft.js', '  if (known(d.goldFloor)) o.gold_floor = d.goldFloor;', '  o.gold_floor = d.goldFloor;'],
  ['prep builder: a HUD change under an edit is never folded in (audit A26)', 'src/shell/prep-draft.js', '(same(m, b) ? { v: s } :', '(same(m, b) ? { v: m } :'],
  ['prep builder: the same slot changed both ways is folded in', 'src/shell/prep-draft.js', ': same(s, b) || same(m, s) ? { v: m } : null);', ': { v: m });'],
  ['prep builder: a drop on a filled slot does nothing', 'src/shell/prep-draft.js', '  return bar[to] ? swapPlan(bar, from, to) : movePlan(bar, from, to);', '  return bar[to] ? null : movePlan(bar, from, to);'],
  ['prep builder: Save and use never puts the setup on', 'src/shell/windows/hunt-prep/builder.js', '    await settleTownActivity(cs);\n    return cs.applyPreset(preset);', '    return r;'],
  /* AW-35 when the hunt ends (lane/c-hunt-itinerary) */
  ['when the hunt ends: a pick is never sent', 'src/shell/windows/hunt-after-pane.js', '  if (p) send(() => setHuntAfter(ctx.account, ctx.character, p.choice, p.skill));\n', ''],
  ['when the hunt ends: the control is drawn with no section', 'src/shell/windows/hunt-after-pane.js', "  prop(sec, 'hidden', !c);\n", "  prop(sec, 'hidden', false);\n"],
  ['when the hunt ends: a hero with no job is offered one', 'src/shell/hunt-after.js', '      if (!doing) continue;\n', ''],
  ['prep builder: a hosted pick waits for Configure\'s own Save (139 audit B1)', 'src/shell/windows/configure-action.js', '    keepInHost(cs);\n    repaint();\n    return;\n  }', '    repaint();\n    return;\n  }'],
  ['prep builder: Cancel keeps the hosted pick', 'src/shell/bar-draft.js', '  if (h && s.open !== null) { h.write(s.open, s.was ? JSON.parse(JSON.stringify(s.was)) : null); h.after(); }\n', ''],
  ['prep builder: a refused save still puts the setup on', 'src/shell/windows/hunt-prep/builder.js', '    if (!r.ok) return r;\n', ''],
  ['prep builder: Save leaves the bar in use unsaved as a setup (audit A26)', 'src/shell/windows/hunt-prep/builder.js', '    if (keep) { const k = await cs.savePreset(preset, keep.name);', '    if (false) { const k = await cs.savePreset(preset, keep.name);'],
  ['prep builder: Save keeps a setup row mid-hunt (the server refuses hunt_open)', 'src/shell/windows/hunt-prep/builder.js', '|| (h && !h.ended) ||', '||'],
  ['prep builder: Save keeps the bar in use over a number past the hero\'s count', 'src/shell/windows/hunt-prep/builder.js', '|| !slots || preset >= slots.count) return null;', ') return null;'],
  ['prep builder: a stale copy still saves', 'src/shell/windows/hunt-prep/builder.js', '  if (!sc.draft || sc.pending || sc.stale) return;', '  if (!sc.draft || sc.pending) return;'],
  ['prep builder: Use equipped sends at the first press', 'src/shell/windows/hunt-prep/setups.js', '    if (!sc.armingEquipped) { sc.armingEquipped = true; repaint(); return true; }\n', ''],
  ['prep builder: New saves over a used number', 'src/shell/windows/hunt-prep/setups.js', '  const free = firstFree(presetsOf(cs));', '  const free = (presetsOf(cs) || []).length;'],
  ['prep builder: the hint shows for the role already worn', 'src/shell/windows/hunt-prep/builder.js', "  if (roleHint && roleHint !== role && HUNT_ROLES[roleHint]) return t('prep.fights_' + roleHint);", "  if (roleHint && HUNT_ROLES[roleHint]) return t('prep.fights_' + roleHint);"],
  ['prep builder: Sort changes nothing', 'src/shell/windows/hunt-prep/builder.js', "  if (action === 'sort' && click) { d.slots = sortBar(d.slots); sc.sorted = true;", "  if (action === 'sort' && click) { sc.sorted = true;"],
  ['prep builder: Clear leaves the bar', 'src/shell/windows/hunt-prep/builder.js', "  if (action === 'clear' && click) { d.slots = clearedBar(); sc.cleared = true;", "  if (action === 'clear' && click) { sc.cleared = true;"],
  ['prep builder: the setup in use is read from the server', 'src/session/preset-read.js', '  if (live && live.preset === preset) return { ok: true, set: live, live: true, name: null };\n', ''],
  ['prep builder: the read asks for another number', 'src/session/preset-read.js', "{ p_slot: cs.slot, p_preset: preset }", "{ p_slot: cs.slot, p_preset: preset + 1 }"],
  ['AW-63 the first press of Enter under the floor walks straight in', 'src/shell/windows/hunts.js', "if (above && rangeWords(above, levelOf(cs)) && sc.warned !== warnKey(hunt, [])) {", 'if (false) {'],
  ['the Shop lists supplies again', 'src/data/supply-basics.js', "export const SHOP_SOLD_KINDS = Object.freeze(['tool', 'gear', 'seed']);", "export const SHOP_SOLD_KINDS = Object.freeze(['food', 'drink', 'ammo', 'tool', 'gear', 'seed']);"],
  /* AW-25 Outgrown only past a ground's endsAtLevel (lane/d-first-day-reds): never on every ground under the hero, never lost on the Cellar */
  ['hunts: AW-25 Outgrown leaks to every ground under the hero', 'src/shell/hunt-list.js', 'if (Number.isInteger(r.endsAt) && level >= r.endsAt) return', 'if (level > r.band[1]) return'],
  ['hunts: AW-25 the Cellar past its exit reads Below level', 'src/shell/hunt-list.js', 'if (Number.isInteger(r.endsAt) && level >= r.endsAt) return', 'if (false) return'],
  ['AW-25 the Cellar\'s band reads past its exit', 'src/shell/hunt-list.js', '  return g && Number.isInteger(g.endsAtLevel) ? [h.band[0], Math.min(h.band[1], g.endsAtLevel - 1)] : h.band.slice();', '  return h.band.slice();'],
  /* AW-65 carry in (Tyler 2026-11-02): the press sends the count the player picked, and only that. */
  ['AW-65 Carry sends the whole stack, not the count picked', 'src/shell/carry-in.js', 'carryIntoHunt(ctx.account, cs, row.id, n)', 'carryIntoHunt(ctx.account, cs, row.id, row.max)'],
  ['the amount picker sends the whole stack', 'src/shell/widgets/amount.js', "  return n ? clampAmount(n.value, n.getAttribute('data-max')) : 1;", "  return n ? clampAmount(n.getAttribute('data-max'), n.getAttribute('data-max')) : 1;"],
  ['Enter in the amount picker does nothing', 'src/shell/windows/float-menu.js', "      if (e.key === 'Enter' && def) { e.preventDefault(); e.stopPropagation(); def.click(); }\n", ''],
  ['coach: the Hunts window stays over the hunt it entered (AW-29)', 'src/shell/windows/hunts.js', "  const thenClose = (r) => { if (r && r.ok) { sc.closeOnHunt = true; repaint(); } };\n", '  const thenClose = () => {};\n'],
  /* The Hunts window, master-detail (designer plan 2026-10-22): AW-25 .. AW-29. */
  ['AW-25 every creature reads common', 'src/shell/hunt-ground-facts.js', "  if (share >= SHARE_BANDS.common) return 'common';", "  return 'common';"],
  ['AW-25 a Scarce piece reads as the ground\'s Rare (odds, not the band)', 'src/shell/bag-model.js', 'd.ch < 1 && REVEAL_BANDS.includes(bandOf(d));', 'd.ch < 1 && d.ch <= 0.05;'],
  ['AW-25 every line says Right for your level', 'src/shell/hunt-list.js', "if (rec && rec.row && !rec.note && rec.row.hunt === r.hunt) return t('hunts.tag_right_level');", "return t('hunts.tag_right_level');"],
  ['AW-25 the band ignores the floor', 'src/shell/hunt-list.js', "  if (rangeWords(r, level)) return r.band[0] - level < FAR_UNDER_LEVELS ?", "  if (false) return r.band[0] - level < FAR_UNDER_LEVELS ?"],
  ['AW-25 a ground with no best says nothing', 'src/shell/hunt-list.js', 'none: solo || party ? null :', 'none: true ? null :'],
  ['AW-25 the creatures are never drawn', 'src/shell/windows/hunt-detail.js', '  const ok = drawCreature(c, ART, id, LINEUP_SPRITE);', '  const ok = false;'],
  ['AW-25 each creature stands at its own height', 'src/shell/windows/hunt-detail.js', "  style(lineup, '--stand-h', tallest ? tallest + 'px' : null);\n", ''],
  /* 'hunts:' is judged by the pure Hunts rules (huntsPure) on a planted copy of src: the page runs at a 1x screen, so only the pure 125/150 % arm sees it */
  /* A HEALER'S TIER (lane/a-honest-lines, re-landed and bounded by Level by lane/a-honesty-rescue) */
  ['hunts: AW-25 the tier note never says a Healer\'s tier', 'src/shell/hunt-list.js', "  const healer = isHealerTier(r.hunt, tier.id, level) ? [t('hunts.tier_healer')] : [];", '  const healer = [];'],
  ['hunts: AW-25 a Healer\'s tier is said at every Level', 'src/data/hunt-tiers.js', '  return under !== null && !(Number.isInteger(level) && level >= under);', '  return under !== null;'],
  ['hunts: AW-25 the Muster Barrows\' Deadly says nothing of a Healer again', 'src/data/grounds/muster_barrows/pack.js', '  healerTiers: { deadly: 60 },\n', ''],
  ['hunts: AW-25 Krell\'s Hold\'s Deadly says nothing of a Healer', 'src/data/grounds/krells_hold/pack.js', '  healerTiers: { deadly: 89 },\n', ''],
  ['hunts: AW-25 the Pauper Vaults\' Deadly says nothing of a Healer', 'src/data/grounds/unmarked_catacombs/pack.js', '  healerTiers: { deadly: 186 },\n', ''],
  ['hunts: AW-25 a Healer line that stops past its band', 'src/data/grounds/unmarked_catacombs/pack.js', '  healerTiers: { deadly: 186 },\n', '  healerTiers: { deadly: 187 },\n'],
  ['hunts: AW-25 a creature is drawn x2 in CSS px and stretched 2.5x on a 125 % screen', 'src/render/creature-sprite.js', '  const k = Math.max(1, Math.floor(scale * dpr + 1e-9));', '  const k = scale;'],
  ['AW-25 the phone shows the list and the page at once', 'src/styles/windows.css', '  .hw-hunts.is-paged .hw-hunt-list, .hw-hunts.is-paged .hw-hunts-now, .hw-hunts.is-paged .hw-hunts-reco { display: none; }\n', '  .hw-hunts.is-paged .hw-hunts-now, .hw-hunts.is-paged .hw-hunts-reco { display: none; }\n'],
  ['AW-26 the chosen setup is never put on', 'src/shell/windows/hunts.js', '  if (s && Number.isInteger(want) && want !== s.preset) {', '  if (false) {'],
  ['AW-26 the setup on now is put on again', 'src/shell/windows/hunts.js', '  if (s && Number.isInteger(want) && want !== s.preset) {', '  if (s && Number.isInteger(want)) {'],
  ['AW-26 a refused apply still enters', 'src/shell/windows/hunts.js', "    if (!a || !a.ok) return a || { ok: false, error: 'network' };\n", ''],
  ['AW-26 Go as stays on while in flight', 'src/shell/windows/hunt-detail.js', "      prop(b, 'disabled', v.off);", "      prop(b, 'disabled', false);"],
  ['AW-26 a missing piece reads as a bare refusal', 'src/data/refusal-words.js', "  missing_item: 'Setup gear missing, nothing equipped',\n", ''],
  ['AW-26 Go as offers a set the server cannot put on', 'src/shell/hunt-go.js', '  const ids = new Set(saved.map((p) => p.preset).concat([s.preset]));', '  const ids = new Set(s.presets.map((p) => p.preset).concat([s.preset]));'],
  ['AW-27 the store behind a slot is not said', 'src/shell/hunt-go.js', "  const store = st && st.price !== null ? { name: st.name, price: st.price, each: a.type === 'ability' ? 'a cast' : 'each' } : null;", '  const store = null;'],
  ['AW-27 the gold line never shows', 'src/shell/hunt-go.js', '  if (paysStore && gp !== null) {', '  if (false) {'],
  ['AW-27 low stamina is not said', 'src/shell/hunt-go.js', '  else if (st) {', '  else if (false) {'],
  ['AW-27 a line that stops the hunt is not marked', 'src/shell/windows/hunt-detail.js', "cls(li, 'is-short', l.short);", "cls(li, 'is-short', false);"],
  ['AW-28 Invite a player opens nothing', 'src/shell/windows/hunts.js', "  if (action === 'party-invite') { ctx.show('hunt-party'); return true; }", "  if (action === 'party-invite') return true;"],
  ['AW-28 the party path shows on every ground', 'src/shell/windows/hunts.js', "    partyBlock: !follower && (r.groupFit === 'party' || (party && party.isLeader)) ? {", '    partyBlock: !follower ? {'],
  ['AW-28 Bring your heroes offers a hero already in a party', 'src/shell/hunt-go.js', ' && Number.isInteger(o.slot) && !partyMembershipOf(o))', ' && Number.isInteger(o.slot))'],
  ['AW-25b the pick never follows the advice once set', 'src/shell/windows/hunts.js', '  if ((!sc.pick || sc.auto) && list.length) {', '  if (!sc.pick && list.length) {'],
];

const COMPANION = {};

const GUARD = 'tests/alpha-windows-hunts.mjs';
/* A mutant whose name starts so is judged by that pure rule function on a planted copy of src (tickerMutant), never the page. */
const JUDGES = {
  'hunts:': (over) => tickerMutant(over, huntsRules),
  'prep builder:': (over) => tickerMutant(over, prepBuilderRules),
};

async function main() {
  const g = { guard: GUARD, green: 'no supplies in the Shop; Hunt prep reads the server; carry in; the bar in Hunt prep is whole; Hunts is lines and a page (who lives there, go as, before you go, the party path, the round trip, when the hunt ends); the builder', pure: pure, checks: checks, mutants: MUTANTS, companion: COMPANION, judges: JUDGES };
  if (process.argv.includes('--shard-plan')) return shardPlan(g);
  if (process.argv.includes('--mutate')) return mutate(g);
  return plain(g);
}

main().then((code) => process.exit(code));
