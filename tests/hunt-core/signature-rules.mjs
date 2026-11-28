// tests/hunt-core/signature-rules.mjs — A WORN SIGNATURE IN THE FIGHT: the sample of 5 and batches 2 and 3 play their rules, dark for
// players (lane/signatures-sample, lane/signatures-batch-2 and lane/signatures-batch-3, systems, 2026-11-26 and 27; src/core/hunt/signature-rules.js, src/data/signatures.js,
// src/core/hunt/reactions.js, docs/design/redesign/15-signature-candidates.md "Decision: count and size"). Run by run-all.mjs.
//
//   worn-signature    the id the engine plays: an unknown id dropped, a list plays its first known one; heroSetup and the frozen peer carry it;
//                     the boundary adds its rows after the Roads' own (named by the Signature, never ramped), twice adds them once, gone
//                     takes them off and leaves the Roads' rows
//   rows              every row passes the one reaction check the Roads read (src/data/talents.js reactProblems) on the live moves; its home
//                     exists as 24 section 4's contract reads it (a monster, a ground, a Hearth Chest key), its move live, its seat a hunt
//                     role, its ground a Danger scale ground, its slot and weapon kind real; the rows are the sample and batch 2
//   low-health-shield Cairn Belt: a blow that leaves the wearer under 30% shields it for 25% of its max health, once a 60 s clock; a blow
//                     that leaves it over the line shields nothing; another hero's line is not the wearer's
//   reset-per-kill    Barrow Knight's Blade: a Turning Cut hit offers a 6% shield, one shell never added up; another move's hit nothing;
//                     the reset piece (a planted row): a Turning Cut kill takes 1 s off Turning Cut, at most 4 s a cast
//   pass-on-death     the pass piece (a planted row: the sample's Collar, re-written in batch 2): a marked monster's death (any hero's blow)
//                     moves its Mark, time left, to the nearest engaged monster not marked; an unmarked death moves nothing; it moves a
//                     status the wearer laid (a Bleed, scale and time)
// BATCH 2 (one case a row, each with its mutant):
//   first-blow-half   Blunted in a swing (Ferry Pennies' low Mend lays it on the two monsters beside the wearer, not the far one): each one's next
//                     swing lands half of what the same swing lands without it, and the stack is spent on it
//   cast-count-shield #2 Ossuary Helm: a Frost Slam that Chills 3 shields the wearer 6% of max health, one that Chills 6 holds at 10%;
//                     another move's cast nothing
//   shell-break-guard #3 Grave Guard's Mail (reshaped): a shell the wearer cast breaking Guards that shell's hero -30% for 8 s (the wearer
//                     untouched); another hero's shell, or a shell that held, nothing
//   cast-blunt-target #4 Charred Saber (reshaped): a Flame Strike cast Blunts its target (its next blow at half), not the monsters beside it;
//                     another move's cast nothing
//   ready-power       #5 Pikeman's Gauntlets: a Flame Strike hit makes Power Strike ready; another move's hit nothing
//   cast-poison       #7 Floodwater Hatchets: a Rend lays Poison ticking 20% of the whole cast's damage over 6 s, a fixed tick
//   marked-bleed      #9 Lurcher's Collar (re-written; its clock 2 s, lane/designer-sig-metric: 4 s read 4.2 pace steps, 2 s 9.3): a hit
//                     on a marked monster lays a Bleed stack, not on an unmarked one, once a 2 s clock
//   kill-ready-clock  #10 Coal Runner's Bow: a Flame Volley kill makes Flame Volley ready, then not again inside 10 s
//   reset-two         #11 Provost's Longbow: a Precision Shot hit takes 1 s off Flame Volley and 1 s off Raking Shot
//   hit-poison        #12 Wyvern Barb Crossbow: a Raking Shot hit lays Poison ticking 20% of that hit over 6 s
//   kill-burst        #13 Hall Fire Wand: a Fireball kill bursts 30% of the fallen's max health on each monster next to it, none further; a
//                     burst's own kill bursts nothing
//   hit-silence       #15 Catacomb Shroud: a Hoarfrost hit Silences its monster 3 s; another move's hit nothing
//   break-kindle      #16 Lamplighter's Robe: the wearer's own shell breaking Kindles it; its next Fireball casts 30% stronger and spends it,
//                     the one after casts plain
//   heal-guard        #17 Bargeman's Pole: a Greater Mend on a hero under half its health as it begins (healed past the line or not) Guards it -15%
//                     taken for 4 s; one on a hero over the line nothing
//   absorb-reflect    #21 Drover's Hat (cut to 25%, lane/designer-sig-metric: 50% read 19.6 pace steps): a monster's blow the wearer's
//                     shell takes lands a quarter of what it took back on that monster, exact; another hero's shell nothing
//   low-mend-blunt    #23 Ferry Pennies (reshaped): a Mend begun under 45% (healed past it or not) Blunts every monster next to the wearer
//                     (its next blow at half), none further; a Mend begun over the line, or another heal, nothing
//   reset-from-move   The Wood Book: any Frost Lance hit makes Hoarfrost ready now, another move's nothing; the has filter (a planted
//                     row): only on a chilled target, or another move's
//                     hit on a chilled one, nothing; the chill is read as the hit lands
//   heal-boon         Brewer's Apron: a Circle of Renewal landing on a hero gives it Emboldened for 4 s (+10% dealt), once a hero a cast;
//                     another heal gives nothing
// BATCH 3 (lane/signatures-batch-3, 2026-11-27; one case a row, each with its mutant, a new piece's seam or filter where it has one):
//   taunt-party-guard #1 Bannerman's Pavise (reshaped, lane/designer-sig-batch4): a Challenge that takes monsters Guards every living hero of
//                     the party -12.5% for 3 s, a fallen one not
//   taunt-armor-break the piece #1 carried (a planted row): the monsters a Challenge takes off an ally lose a quarter of their armor; one
//                     already on the tank is not taunted (the taunt names its monsters: `list`)
//   near-fall-ready   #19 Lock-Keeper's Chain: an ally crossing its near-fall line readies Spring Tide, once a 30 s clock
//   cast-steeped      #20 Greened Bracers: a Green Sickness cast Steeps its caster (not its monster: `to: 'self'`), its next Greater Mend
//                     casts 30% stronger and spends it
//   alone-kill-heal   #22 Slake Waders: a kill heals a hero hunting alone 4%; the same kill with an ally in the world nothing
//   ice-stokes-fire   #24 Stoker's Ring (reshaped, lane/designer-sig-batch4): an Ice rune spell Stokes its caster, its next Fire rune spell casts
//                     45% stronger and spends it; a Fire spell Stokes nothing
//   rune-save         #25 The Cold Candle: every Ice rune spell buys no rune (gold 0, the purse unmoved, each cast names the rune saved)
//   shell-break-heal  #26 Thrower's Ring: the wearer's shell breaking heals its hero 6% of that hero's max; another hero's shell nothing
//   heal-mana         #27 Riverstone Earrings (reshaped, lane/designer-sig-batch4): a Water rune heal gives the wearer 0.5% of its max mana;
//                     Mend none; the piece it carried (a planted row): mana to the hero healed, 10% of the HP it landed
//   sickness-passes   #28 Vault Leech Ring: a monster dying with the wearer's Sickness passes it, time left, to the nearest monster
//   bleed-six         #29 Fledgling Claw: the wearer's sixth Bleed lands on a monster at five; a plain hero's stays at five; never past six
//   every-fifth-death the piece #31 carried (a planted row): the fifth death (whoever's blow) heals each hero of the party 3% of its own max
//   ally-low-heal     #31 The Cellar Key (reshaped, lane/designer-sig-batch4): a blow that leaves an ally under the line heals that ally, once a
//                     clock for each ally; one over the line, or on the wearer, nothing
//   kill-mana         #33 Teamster's Mitts: a kill gives 2% of max mana, a hit that does not kill nothing
//   boss-low-party    #38 Drowned Signet: a boss left under 25% Emboldens every living hero of the party (1.5 times its row, 10 s), once a
//                     boss; a monster that is no boss nothing; a fallen hero nothing
//   pull-chill        #42 Night Carter's Boots: a pull's start Chills its pack 3 s, none outside it (the seam is real-settle's)
//   single-carry      the piece #43 carried (a planted row): a single-target move's kill carries its overkill to the nearest monster
//   single-low-double #43 Bull's Tooth (reshaped, lane/designer-sig-batch4): a single-target hit that leaves a monster under 30% lands again
//                     for all of it; over the line, or an area move's, nothing
// BATCH 4 (lane/signatures-batch-4, 2026-11-28; one case a row, each engine piece's mutant):
//   shell-break-blunt #26 Thrower's Ring (P5): the wearer's shell breaking Blunts the monster that broke it (shell-break-heal keeps the heal
//                     piece #26 carried on a planted row)
//   lowest-sicken     the piece #28 carried in batch 4 (P6, a planted row): a Poison rune spell Sickens the nearest monster on the ally
//                     lowest on health
//   poison-heal-lowest #28 Vault Leech Ring (lane/designer-sig-batch5): a Poison rune spell heals the hurt ally lowest on health 60% of
//                     the damage it dealt; the plain healer's heals no one
//   power-taunt       #33 Teamster's Mitts (P4): Power Strike on a monster attacking an ally turns it on the wearer, held 4 s; not one a
//                     Challenge holds
//   ally-low-blunt, single-low-double   #42 and #43 with their role filters (P9): a stalker's blow, a brute hit
//   shot-save         #41 Brood Bracers (P3): a credit after three landed shots, spent by the next arrow (none taken, none bought), the
//                     count kept across a settle cut
//   cast-every-free   #32 Ledger Ring (P2): every fourth spell pays no mana, on an empty pool too
//   heal-window       #37 Lychgate Leggings (P2): a heal under 30% mana opens 5 s of free heals, once a 90 s clock
//   spell-health      #44 Pyre Priest's Hood (P2): over 70% health a spell pays health, never under 1 HP
//   aura-guard        #35 Gatekeeper's Plate (P1): the wearer and allies within 2 tiles take 8% less, under Guarded's 30% cap
//   aura-regen        #34 Sergeant's Sash (P1): 20% more mana regeneration within 8 tiles
//   pair-heal-guard   #45 Convoy Bell and #46 Lead Rein (P1, `with`): each works only with the other in the party, below half health
//   fall-save         #40 Hearth Mason's Cloak (P7): a death saved at 1 HP once every 75 minutes; on Bold the pull breaks off, a fall back
// BATCH 5 (lane/signatures-batch-5, 2026-11-28; one case a row, each engine piece's mutant; #33, #26 and #42's batch 4 cases and #18's sample
// case keep their pieces on planted rows: power-taunt, shell-break-blunt, ally-low-blunt, heal-boon):
//   magic-xp-written  ITEM 1: a cast a worn Signature paid another way (the Ledger's free fourth, the Hood's health, the Leggings' window)
//                     trains on its written mana (`xpMana`), credited by the settle's reward as the plain hero's; a Storm spell's mana back
//                     still comes off it
//   interrupt-shield  #8 Stable Troll's Maul (`interrupt`): a Stagger that ends a wind-up shields 10% for each one it ended
//   guard-parry       Ledgehide Breeches (a cast on `windup`, `within`, castNow's `foe`): a monster beside the wearer winding up at an ally
//                     within 1 tile is Parried at once; not one at an ally 2 tiles off, nor by a monster out of reach
//   gash-whetted      Troll Picker's Hooks (`min`, Whetted): a Gash that Bleeds 3 Whets the wearer's next Rend +40%; 2 nothing
//   power-braced      #33 Teamster's Mitts (Braced, a hero's `once` on the taken side): Power Strike Braces, the next blow at half, spent
//   earth-shell-raise #26 Thrower's Ring (`raise`): Earth rune shells +30%; a Water heal and an Earth strike as written
//   windup-blunt      #42 Night Carter's Boots (`windup`): a wind-up begun at an ally under half Blunts its caster, the landing at half
//   circle-again      #18 Brewer's Apron (a heal `to: 'again'`): Circle of Renewal heals the hurt ally lowest on health a second time
//   rune-save         #25 The Cold Candle (`saves.of`): Frost Lance alone saves its rune, Hoarfrost pays (case above, reshaped)
//   real-settle       THE BOTH PATHS (CLAUDE.md section 4): a Muster four each playing a Signature (the sample's, then batch 2's, then batch
//                     3's) plays a different hunt from the same four with none, the Apron's second heal, the Collar's Bleed, the Pavise's
//                     Blunted, the Hat's reflected blows, the Tooth's second hit, the Ring's Stoked caster and the Key's heal show on its
//                     events, and each settles the same in 10-minute and 100-second windows; batch 5's on Carter's Rest, whose monsters wind
//                     up (the Brace, the Maul's shields, the Hooks' Whetted, the Candle's saved Lance, the Apron's second heal)
//   dark              SIGNATURE_RULES.live is false and no src or server file but the engine's three readers names `wornSignature`; a hero
//                     with none writes no field (the switch off plays as before: engine-parity holds with no re-pin)
//
// mutant-anchors: src/core/hunt/signature-auras.js src/core/hunt/signature-costs.js src/core/hunt/fall-save.js src/core/hunt/status-effects.js
// mutant-anchors: src/core/hunt/signature-casts.js src/core/hunt/monster-spells.js src/core/hunt-rewards.js
// mutant-anchors: src/core/hunt/signature-rules.js src/core/hunt/reactions.js src/core/hunt/react-queue.js src/core/hunt/damage.js src/core/hunt/heal-rules.js src/core/hunt-spawn.js src/core/member.js src/core/combat-sim.js src/data/signatures.js supabase/functions/hr-accrue/hunt-settle.js supabase/functions/hr-accrue/accrue-hunt.js src/core/hunt/abilities.js src/core/hunt/status.js src/data/statuses.js src/core/hunt/targeting.js src/core/hunt/pull-cycle.js
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadCore, plant, makeReport, ROOT } from './fixtures/h1.js';
import { H, E, inst2, sc2, world } from './fixtures/h2.js';
import { supplySession } from './fixtures/h4.js';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';

const V = sourceQuery(ROOT);
async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.SR = await imp('src/core/hunt/signature-rules.js');
  M.RX = await imp('src/core/hunt/reactions.js');
  M.HR = await imp('src/core/hunt/heal-rules.js');
  M.SG = await imp('src/data/signatures.js');
  M.TD = await imp('src/data/talents.js');
  M.AD = await imp('src/data/abilities.js');
  M.ST = await imp('src/data/statuses.js');
  M.DG = await imp('src/data/danger.js');
  M.RO = await imp('src/data/hunt-roles.js');
  M.SPAWN = await imp('src/core/hunt-spawn.js');
  M.SE = await imp('src/core/hunt/status-effects.js');
  M.MON = await imp('src/data/monsters.js');
  M.HG = await imp('src/data/hunt-grounds.js');
  M.CH = await imp('src/data/chests.js');
  M.RQ = await imp('src/core/hunt/react-queue.js');
  M.STS = await imp('src/core/hunt/status.js');
  M.RF = await imp('src/data/runes.js');
  M.SA = await imp('src/core/hunt/signature-auras.js');
  M.SCO = await imp('src/core/hunt/signature-costs.js');
  M.FS = await imp('src/core/hunt/fall-save.js');
  /* (batch 5: a Signature's raise and aim, a monster's wind-up, the settle's reward credit) */
  M.SCA = await imp('src/core/hunt/signature-casts.js');
  M.MSD = await imp('src/data/monster-spells.js');
  M.MSP = await imp('src/core/hunt/monster-spells.js');
  M.REW = await imp('src/core/hunt-rewards.js');
  return M;
}

const fight = (M, units, o) => inst2(M, world(M, units, Object.assign({ phase: 'fight', risk: 'steady' }, o || {})));
/* hero `u` plays Signature `id`, as the boundary writes it */
const wear = (M, u, id) => M.SR.syncSignature(u, { wornSignature: id });
const blowAt = (M, inst, sc, src, t, n, id) => M.damage.landHit(inst, sc, src, t, n, null, { id: id || 't', exact: true }, false);
/* a bar slot for move `id` with no conditions (it fires whenever ready), naming the store's rune of its family; a hero's injected entry */
function slotFor(M, id) {
  const row = M.AD.ABILITIES[id];
  const store = row.rune ? M.SB.BASIC_SUPPLIES.find((b) => b.partner === row.rune) : null;
  return { action: { type: 'ability', id, ...(store ? { store: store.id } : {}) }, conditions: [], join: 'and' };
}
const entry = (M, ids, range) => ({ hs: supplySession(M, { runes: true }), actionSet: 'hunt', range: range || 1, slots: M.conditions.heroSlots(ids.map((id) => slotFor(M, id)), null) });
/* the sub-step clock on the instance too (a `marked` filter reads it as the moment is queued, world-step.js sets it) */
const at = (inst, sc, ms) => { sc.atMs = ms; inst.atMs = ms; };
const stacksOf = (u, id) => (u.statuses || []).filter((s) => s.s === id && s.left > 0);

const cases = {
  'worn-signature': (M) => {
    const S = M.SR;
    if (S.wornSignatureOf('nope') !== null || S.wornSignatureOf(null) !== null || S.wornSignatureOf([]) !== null) return 'an unknown id or none played a Signature';
    if (S.wornSignatureOf(['nope', 'cairn_belt', 'the_wood_book']) !== 'cairn_belt') return 'a list did not play its first known Signature';
    const set = M.SPAWN.heroSetup({ weaponType: 'shield', wornSignature: ['cairn_belt', 'brewers_apron'] });
    if (!set || set.wornSignature !== 'cairn_belt') return 'heroSetup carries ' + JSON.stringify(set && set.wornSignature);
    if ('wornSignature' in M.SPAWN.heroSetup({ weaponType: 'shield' })) return 'heroSetup wrote a Signature for a hero with none';
    /* after the Roads (a row as syncTalents writes one): theirs stay, the Signature's join named by it, at full size (never ramped) */
    const u = H(M, 1, 12, 3, 'tank');
    u.reacts = Object.freeze([Object.freeze({ kind: 'react', id: 'cold_iron', on: 'hit_taken', do: 'status', status: 'chill', ms: 2000, melee: true })]);
    const roads = (u.reacts || []).length;
    wear(M, u, 'cairn_belt');
    wear(M, u, 'cairn_belt');
    const mine = (u.reacts || []).filter((r) => r.sig === true);
    if (u.reacts.length !== roads + 1 || mine.length !== 1) return 'two boundaries left ' + mine.length + ' Signature rows beside ' + roads + ' of the Roads';
    if (mine[0].id !== 'cairn_belt' || mine[0].pm !== M.SG.SIGNATURES.cairn_belt.reacts[0].pm || u.signature !== 'cairn_belt') return 'the row reads ' + JSON.stringify(mine[0]);
    wear(M, u, null);
    if (u.signature !== undefined || (u.reacts || []).length !== roads || (u.reacts || []).some((r) => r.sig)) return 'a hero whose Signature went kept it';
    const bare = H(M, 2, 12, 3, 'tank');
    wear(M, bare, 'cairn_belt'); wear(M, bare, null);
    if (bare.reacts !== undefined) return 'a hero with no Roads kept an empty reaction list';
    return null;
  },
  rows: (M) => {
    const moves = Object.keys(M.AD.ABILITIES);
    const SAMPLE = ['cairn_belt', 'barrow_knights_blade', 'lurchers_collar', 'the_wood_book', 'brewers_apron'];
    /* BATCH 2 (15 "Batch 2": #1 to #23 less the sample and #8; #1 dropped, #19 and #20 wait on a cell where mana binds, #22 is batch 3's) */
    const BATCH_2 = ['ossuary_helm', 'grave_guards_mail', 'charred_sabre', 'pikemans_gauntlets', 'floodwater_hatchets', 'coal_runners_bow',
      'provosts_longbow', 'wyvern_barb_crossbow', 'hall_fire_wand', 'catacomb_shroud', 'lamplighters_robe', 'bargemans_pole', 'drovers_hat', 'ferry_pennies'];
    /* BATCH 3 (15 "Decision: count and size": the runes, procs, low health, utility and alone rows, #19 and #20's new rules, the Challenge's;
       the auras, the pair, the mana-cost rows, #40 and #41 are batch 4's, 15 "Batch 3, measured") */
    const BATCH_3 = ['bannermans_pavise', 'lock_keepers_chain', 'greened_bracers', 'slake_waders', 'stokers_ring', 'throwers_ring', 'the_cold_candle',
      'fledgling_claw', 'riverstone_earrings', 'vault_leech_ring', 'the_cellar_key', 'teamsters_mitts', 'drowned_signet', 'night_carters_boots', 'bulls_tooth'];
    /* BATCH 4 (lane/signatures-batch-4, 15 "Batch 4: what is left": the auras, the pair, the cast costs, the saved shot, the fall-back save;
       #26, #28, #33, #42 and #43 rewritten in place) */
    const BATCH_4 = ['ledger_ring', 'sergeants_sash', 'gatekeepers_plate', 'lychgate_leggings', 'hearth_masons_cloak', 'brood_bracers', 'pyre_priests_hood',
      'convoy_bell', 'lead_rein'];
    /* BATCH 5 (lane/signatures-batch-5, 15 "Batch 5: the rows and their moves": Stagger's, Parry's and Gash's new rows; #18, #26, #33, #42 and
       #38 rewritten in place, #29 re-read as built, #25 reshaped on `saves.of`) */
    const BATCH_5 = ['stable_trolls_maul', 'ledgehide_breeches', 'troll_pickers_hooks'];
    const ids = Object.keys(M.SG.SIGNATURES);
    if (ids.join() !== SAMPLE.concat(BATCH_2, BATCH_3, BATCH_4, BATCH_5).join()) return 'the Signatures are ' + ids + ', not the ruled sample and batches 2 to 5';
    /* (batch 4 is 14 rows: these nine and the five rewritten; batch 5 is 9 rows on 8 new pieces, plus the Candle's reshape) */
    if (BATCH_4.length + 5 > 20) return 'batch 4 is ' + (BATCH_4.length + 5) + ' rows, over the 20 a batch may hold (CLAUDE.md section 10)';
    if (BATCH_5.length + 7 > 20) return 'batch 5 is ' + (BATCH_5.length + 7) + ' rows, over the 20 a batch may hold (CLAUDE.md section 10)';
    if (BATCH_2.length + 1 > 20) return 'batch 2 is ' + (BATCH_2.length + 1) + ' rows, over the 20 a batch may hold (CLAUDE.md section 10)';
    if (BATCH_3.length > 20) return 'batch 3 is ' + BATCH_3.length + ' rows, over the 20 a batch may hold (CLAUDE.md section 10)';
    /* a rune Signature names a family (CC-5), and a rule that is no reaction reads it: a rune it saves (every 1: each cast, The Cold Candle
       since lane/designer-sig-batch4), a stack cap it raises */
    const fams = Object.keys(M.RF.RUNE_FAMILIES);
    for (const [id, s] of Object.entries(M.SG.SIGNATURES)) {
      if (s.family !== undefined && !fams.includes(s.family)) return id + ': rune family ' + s.family;
      /* (a rune it saves names its family; a shot it saves, batch 4's Brood Bracers, counts the shots that land) */
      if (s.saves && !(s.saves.ammo === true ? s.saves.hit === true && s.family === undefined : s.saves.family === s.family)) return id + ': saves ' + JSON.stringify(s.saves);
      if (s.saves && !(Number.isInteger(s.saves.every) && s.saves.every >= 1 && s.saves.every <= 10)) return id + ': saves ' + JSON.stringify(s.saves);
      /* (batch 5) a rune save narrowed to one move (`of`, The Cold Candle): a live move that spends a rune of the save's family */
      if (s.saves && s.saves.of !== undefined && !(M.AD.ABILITIES[s.saves.of] && M.AD.ABILITIES[s.saves.of].rune && M.ITEMS[M.AD.ABILITIES[s.saves.of].rune].family === s.saves.family)) return id + ': saves of ' + s.saves.of;
      /* (batch 5) a standing raise on a family's casts (signature-casts.js castRaiseOf) */
      const rz = s.raise;
      if (rz && !(Object.keys(rz).every((k) => ['family', 'pm', 'of'].includes(k)) && fams.includes(rz.family) && Number.isInteger(rz.pm) && rz.pm > 0 && rz.pm <= 1000 && (rz.of === undefined || rz.of === 'shell'))) return id + ': raise ' + JSON.stringify(rz);
      if (s.stackPlus && !(M.ST.STATUSES[s.stackPlus.status] && Number.isInteger(s.stackPlus.n) && s.stackPlus.n >= 1 && s.stackPlus.n <= 3)) return id + ': stackPlus ' + JSON.stringify(s.stackPlus);
      /* (batch 4) a cast's cost, an aura and a fall-back save, each in the shape its reader reads (signature-costs.js, signature-auras.js, fall-save.js) */
      const c = s.costs;
      if (c && !(['spell', 'heal'].includes(c.of) && ['none', 'hp'].includes(c.pay) && Object.keys(c).every((k) => ['of', 'pay', 'every', 'aboveHpPm', 'belowManaPm', 'ms', 'clockMs'].includes(k))
        && (c.every === undefined || (Number.isInteger(c.every) && c.every >= 2 && c.every <= 20)) && (c.aboveHpPm === undefined || (Number.isInteger(c.aboveHpPm) && c.aboveHpPm > 0 && c.aboveHpPm < 1000))
        && ((c.belowManaPm === undefined) === (c.ms === undefined) && (c.ms === undefined) === (c.clockMs === undefined))
        && (c.belowManaPm === undefined || (c.belowManaPm > 0 && c.belowManaPm < 1000 && c.ms % 100 === 0 && c.clockMs % 100 === 0 && c.clockMs >= c.ms)))) return id + ': costs ' + JSON.stringify(c);
      const a = s.aura;
      if (a && !(['takenPm', 'regenPm', 'healPm'].filter((k) => a[k] !== undefined).length === 1 && Object.keys(a).every((k) => ['takenPm', 'regenPm', 'healPm', 'r', 'to', 'with', 'belowPm'].includes(k))
        && (a.takenPm === undefined || (Number.isInteger(a.takenPm) && a.takenPm < 0 && a.takenPm >= -300)) && (a.regenPm === undefined || (Number.isInteger(a.regenPm) && a.regenPm > 0 && a.regenPm <= 1000))
        && (a.healPm === undefined || (Number.isInteger(a.healPm) && a.healPm > 0 && a.healPm <= 1000)) && (a.r === undefined || (Number.isInteger(a.r) && a.r >= 1 && a.r <= 12))
        && (a.to === undefined || (a.to === 'with' && a.with !== undefined && a.r === undefined)) && (a.with === undefined || (M.SG.SIGNATURES[a.with] && a.with !== id))
        && (a.belowPm === undefined || (Number.isInteger(a.belowPm) && a.belowPm > 0 && a.belowPm < 1000)))) return id + ': aura ' + JSON.stringify(a);
      if (s.save && !(Object.keys(s.save).join() === 'clockMs' && Number.isInteger(s.save.clockMs) && s.save.clockMs >= 60000 && s.save.clockMs % 100 === 0)) return id + ': save ' + JSON.stringify(s.save);
      if (!s.reacts.length && !s.saves && !s.stackPlus && !c && !a && !s.save && !rz) return id + ': a Signature with no rule';
    }
    const slots = new Set(Object.values(M.ITEMS).map((it) => it.slot).filter(Boolean)), kinds = new Set(Object.values(M.ITEMS).map((it) => it.weaponType).filter(Boolean));
    const keys = new Set(M.CH.HEARTH_CHEST_KEYS.map((k) => k.id));
    const nums = new Set();
    for (const [id, s] of Object.entries(M.SG.SIGNATURES)) {
      if (s.id !== id || nums.has(s.n) || !Number.isInteger(s.n)) return id + ': its id or number';
      nums.add(s.n);
      for (const r of s.reacts) { const bad = M.TD.reactProblems({ kind: 'react', id, ...r }, moves); if (bad.length) return id + ': ' + bad.join('; '); }
      /* the home as 24-content-pipeline.md section 4 reads it (content-coherence CC-6 holds the kinds): a monster, a ground or a chest key */
      const home = s.home.kind === 'monster' ? M.MON.MONSTERS[s.home.id] : s.home.kind === 'ground' ? M.HG.HUNT_GROUNDS[s.home.id] : s.home.kind === 'chest' ? keys.has(s.home.id) : null;
      if (!home) return id + ': its home ' + JSON.stringify(s.home);
      if (!slots.has(s.slot) || (s.weapon !== undefined && (s.slot !== 'weapon' || !kinds.has(s.weapon)))) return id + ': slot ' + s.slot + ' weapon ' + s.weapon;
      if (s.move !== undefined && !moves.includes(s.move)) return id + ': move ' + s.move + ' is not a live move';
      if (!M.RO.HUNT_ROLES[s.best.seat]) return id + ': seat ' + s.best.seat;
      if (!M.DG.DANGER_GROUNDS[s.best.ground]) return id + ': sized on ' + s.best.ground + ', off the Danger scale';
      if (typeof s.tip !== 'string' || /[;—]/.test(s.tip)) return id + ': its tip';
    }
    if (M.SG.SIGNATURE_RULES.perHero !== 1) return 'more than one Signature a hero';
    if (M.TD.reactProblems({ kind: 'react', id: 'x', on: 'hp_below', do: 'shield', pm: 250 }).length === 0) return 'CONTROL: a line-less hp_below passed the check';
    /* (batch 4) a pair names its partner both ways */
    for (const [id, s] of Object.entries(M.SG.SIGNATURES)) if (s.aura && s.aura.with && !(M.SG.SIGNATURES[s.aura.with].aura && M.SG.SIGNATURES[s.aura.with].aura.with === id)) return id + ': its partner ' + s.aura.with + ' does not name it';
    if (M.TD.reactProblems({ kind: 'react', id: 'x', on: 'hit', role: 'wizard', do: 'status', status: 'blunted' }).length === 0) return 'CONTROL: a role no monster plays passed the check';
    /* (batch 5) a count floor only on a moment that counts, a heal again only on a cast's heals */
    if (M.TD.reactProblems({ kind: 'react', id: 'x', on: 'hit', min: 3, do: 'boon', to: 'self', status: 'kindled' }).length === 0) return 'CONTROL: a count floor on a moment that counts nothing passed the check';
    if (M.TD.reactProblems({ kind: 'react', id: 'x', on: 'heal', do: 'heal', to: 'again', pm: 1000 }).length === 0) return 'CONTROL: a heal again on a heal moment passed the check';
    return null;
  },
  'low-health-shield': (M) => {
    const k = H(M, 1, 12, 3, 'tank', { hp: 1000, maxHp: 1000 }), o = H(M, 2, 13, 3, 'mage', { hp: 1000, maxHp: 1000 }), m = E(M, 10, 0, 13, 4, 1);
    const inst = fight(M, [k, o, m]);
    wear(M, k, 'cairn_belt');
    const sc = sc2(M, 31);
    blowAt(M, inst, sc, m, k, 600, 'over'); M.RX.drainReactions(inst, sc);
    if (k.shield) return 'a blow that left the wearer at 40% shielded it';
    blowAt(M, inst, sc, m, o, 800, 'other'); M.RX.drainReactions(inst, sc);
    if (o.shield || k.shield) return 'another hero under the line set the wearer\'s Signature off';
    blowAt(M, inst, sc, m, k, 150, 'under'); M.RX.drainReactions(inst, sc);
    if (k.shield !== 250) return 'under 30%: a shield of ' + k.shield + ' (want 25% of 1000)';
    k.shield = 0;
    sc.atMs = 59900;
    blowAt(M, inst, sc, m, k, 10, 'again'); M.RX.drainReactions(inst, sc);
    if (k.shield) return 'the shield came back inside its 60 s clock';
    sc.atMs = 60000;
    blowAt(M, inst, sc, m, k, 10, 'after'); M.RX.drainReactions(inst, sc);
    if (k.shield !== 250) return 'the shield did not come back after its clock: ' + k.shield;
    return null;
  },
  'reset-per-kill': (M) => {
    const u = H(M, 1, 12, 3, 'melee_dps');
    const ms = [0, 1, 2, 3, 4, 5].map((i) => E(M, 10 + i, 0, 13, 3 + i, 1, { hp: 1, maxHp: 1 }));
    const inst = fight(M, [u, ...ms]);
    wear(M, u, 'barrow_knights_blade');
    const sc = sc2(M, 32);
    const want = Math.floor((u.maxHp * 60) / 1000);
    if (!(want > 0)) return 'CONTROL: the hero\'s 6% is ' + want;
    blowAt(M, inst, sc, u, ms[0], 5, 'power_strike'); M.RX.drainReactions(inst, sc);
    if (u.shield) return 'another move\'s hit gave the Blade\'s shield: ' + u.shield;
    for (const m of ms.slice(1)) blowAt(M, inst, sc, u, m, 5, 'turning_cut');
    M.RX.drainReactions(inst, sc);
    if (u.shield !== want) return 'five Turning Cut hits left a shield of ' + u.shield + ' (want one 6% shell, ' + want + ', never added up)';
    /* the reset piece the Blade used to carry stays the Roads' (Ready Mark, talents.js mark_reset): a planted row, capped a cast */
    u.reacts = [{ kind: 'react', id: 'reset_test', on: 'kill', of: 'turning_cut', do: 'reset', move: 'turning_cut', ms: 1000, capMs: 4000 }];
    u.cds = { turning_cut: 8000 };
    const more = [0, 1, 2, 3, 4].map((i) => E(M, 20 + i, 0, 11, 3 + i, 1, { hp: 1, maxHp: 1 }));
    inst.world.units.push(...more);
    for (const m of more) blowAt(M, inst, sc, u, m, 5, 'turning_cut');
    M.RX.drainReactions(inst, sc);
    if (u.cds.turning_cut !== 4000) return 'five Turning Cut kills left its cooldown at ' + u.cds.turning_cut + ' (want 8000 less the 4 s cap)';
    return null;
  },
  'pass-on-death': (M) => {
    const r = H(M, 1, 10, 3, 'ranger'), k = H(M, 2, 12, 3, 'tank');
    const dead = E(M, 10, 0, 13, 3, 2, { hp: 5, maxHp: 50 }), near = E(M, 11, 0, 15, 3, 2), far = E(M, 12, 0, 18, 3, 2), marked = E(M, 13, 0, 13, 4, 2);
    const inst = fight(M, [r, k, dead, near, far, marked]);
    /* (the sample's Collar, a planted row: batch 2 re-wrote the Signature, the piece stays for #28 and the Roads' Spread) */
    r.reacts = [{ kind: 'react', id: 'pass_test', on: 'death', do: 'pass', what: 'mark' }];
    const sc = sc2(M, 33, 1000);
    dead.markPm = 250; dead.markUntil = 7000; marked.markPm = 250; marked.markUntil = 9000;
    /* the TANK's blow fells it: a death, whoever's blow */
    blowAt(M, inst, sc, k, dead, 50, 'basic'); M.RX.drainReactions(inst, sc);
    if (near.markPm !== 250 || near.markUntil !== 7000) return 'the Mark did not move to the nearest unmarked monster with its time left: ' + JSON.stringify([near.markPm, near.markUntil]);
    if (far.markUntil || marked.markUntil !== 9000) return 'the Mark moved past the nearest, or onto a marked one';
    if (!sc.events.some((e) => e.type === 'mark' && e.u === 1 && e.t === 11)) return 'a moved Mark said nothing';
    const plain = E(M, 14, 0, 15, 3, 2, { hp: 1, maxHp: 1 });
    inst.world.units.push(plain);
    blowAt(M, inst, sc, k, plain, 5, 'basic'); M.RX.drainReactions(inst, sc);
    if (far.markUntil) return 'an unmarked death moved a Mark';
    /* the general piece: a status the wearer laid moves with its scale and time (a planted row: 15 #28's shape) */
    const b = H(M, 3, 10, 4, 'melee_dps'), d2 = E(M, 20, 0, 13, 6, 3, { hp: 1, maxHp: 1 }), n2 = E(M, 21, 0, 14, 6, 3);
    const i2 = fight(M, [b, d2, n2]);
    b.reacts = [{ kind: 'react', id: 'spread_test', on: 'death', do: 'pass', what: 'bleed' }];
    d2.statuses = [{ s: 'bleed', src: 3, left: 2500, next: 500, scale: 1234 }, { s: 'bleed', src: 99, left: 4000, next: 1000, scale: 1000 }];
    const s2 = sc2(M, 34);
    blowAt(M, i2, s2, b, d2, 5, 'basic'); M.RX.drainReactions(i2, s2);
    const got = (n2.statuses || []).filter((s) => s.s === 'bleed');
    if (got.length !== 1 || got[0].src !== 3 || got[0].left !== 2500 || got[0].scale !== 1234) return 'a passed Bleed: ' + JSON.stringify(n2.statuses);
    return null;
  },
  'reset-from-move': (M) => {
    const u = H(M, 1, 10, 3, 'mage'), cold = E(M, 10, 0, 13, 3, 1, { hp: 900, maxHp: 900 }), warm = E(M, 11, 0, 13, 4, 1, { hp: 900, maxHp: 900 });
    const inst = fight(M, [u, cold, warm]);
    wear(M, u, 'the_wood_book');
    u.cds = { hoarfrost: 9000 };
    const sc = sc2(M, 35, 1000);
    blowAt(M, inst, sc, u, warm, 10, 'fireball'); M.RX.drainReactions(inst, sc);
    if (u.cds.hoarfrost !== 9000) return 'another move\'s hit readied Hoarfrost';
    blowAt(M, inst, sc, u, warm, 10, 'frost_lance'); M.RX.drainReactions(inst, sc);
    if (u.cds.hoarfrost !== 1000) return 'a Frost Lance hit left Hoarfrost at ' + u.cds.hoarfrost + ' (want now, 1000: any target, chilled or not)';
    /* the general piece's `has` filter (a planted row: 15 #3 and #5's shape), read as the hit lands */
    u.reacts = [{ kind: 'react', id: 'has_test', on: 'hit', of: 'frost_lance', has: 'chill', do: 'ready', move: 'hoarfrost' }];
    cold.statuses = [{ s: 'chill', src: 1, left: 3000, next: 0, scale: 1000 }];
    u.cds = { hoarfrost: 9000 };
    blowAt(M, inst, sc, u, warm, 10, 'frost_lance'); M.RX.drainReactions(inst, sc);
    if (u.cds.hoarfrost !== 9000) return 'a has-chill row readied Hoarfrost on an unchilled target';
    blowAt(M, inst, sc, u, cold, 10, 'frost_lance');
    cold.statuses = [];
    M.RX.drainReactions(inst, sc);
    if (u.cds.hoarfrost !== 1000) return 'a has-chill row on a target chilled as the hit landed left Hoarfrost at ' + u.cds.hoarfrost;
    return null;
  },
  'heal-boon': (M) => {
    /* the piece Brewer's Apron carried until lane/signatures-batch-5 (a planted row: the Apron now heals the lowest ally again, circle-again) */
    const g = H(M, 1, 10, 3, 'healer', { mana: 999, maxMana: 999 }), a = H(M, 2, 11, 3, 'tank', { hp: 100 }), b = H(M, 3, 12, 3, 'mage', { hp: 200 });
    const inst = fight(M, [g, a, b]);
    g.reacts = [{ kind: 'react', id: 'boon_test', on: 'heal', of: 'circle_of_renewal', do: 'boon', status: 'emboldened', ms: 4000 }];
    const sc = sc2(M, 36);
    const circle = M.AD.ABILITIES.circle_of_renewal, mend = M.AD.ABILITIES.greater_mend;
    M.HR.landHeal(g, a, 20, sc, false, mend, false, { inst, fx: null }); M.RX.drainReactions(inst, sc);
    if ((a.statuses || []).length) return 'another heal gave a boon';
    for (const t of [a, b]) M.HR.landHeal(g, t, 20, sc, false, circle, false, { inst, fx: null });
    M.RX.drainReactions(inst, sc);
    for (const t of [a, b]) {
      const st = (t.statuses || []).filter((s) => s.s === 'emboldened');
      if (st.length !== 1 || st[0].left !== 4000 || st[0].src !== 1) return 'hero ' + t.id + ' after the Circle: ' + JSON.stringify(t.statuses);
    }
    if (M.SE.effectPm(a, 'dealtPm') !== 100) return 'Emboldened raises what the hero deals by ' + M.SE.effectPm(a, 'dealtPm') + ' permille, not 100';
    return null;
  },

  /* ── BATCH 2 ── */
  'first-blow-half': (M) => {
    /* the same low Mend and the same swings, the wearer and a plain tank: each monster beside it lands its next swing at half */
    const play = (worn) => {
      const k = H(M, 1, 12, 3, 'tank', { hp: 1000, maxHp: 5000 }), o = H(M, 2, 14, 6, 'mage', { hp: 5000, maxHp: 5000 });
      const a = E(M, 10, 0, 13, 3, 1, { maxHit: 400 }), b = E(M, 11, 0, 13, 4, 1, { maxHit: 400 }), far = E(M, 12, 0, 30, 9, 1, { maxHit: 400 });
      /* (off the Danger scale: a fixture world's pull has no low line yet, so on it every swing reads as a fall back) */
      const inst = fight(M, [k, o, a, b, far], { leader: 1, risk: null });
      if (worn) wear(M, k, 'ferry_pennies');
      const sc = sc2(M, 41);
      M.HR.landHeal(k, k, 50, sc, false, M.AD.ABILITIES.mend, false, { inst, fx: null }); M.RX.drainReactions(inst, sc);
      for (const m of [a, b, far]) m.swingLeftMs = 0;
      const blunted = [a, b, far].map((m) => stacksOf(m, 'blunted').length);
      M.movement.occupancy(inst);
      M.damage.resolveAttacks(inst, sc);
      const took = sc.events.filter((e) => e.type === 'dmg' && e.t === 1).map((e) => e.amount);
      return { k, a, b, far, blunted, took, after: [a, b].map((m) => stacksOf(m, 'blunted').length) };
    };
    const w = play(true), p = play(false);
    if (w.blunted.join() !== '1,1,0') return 'Blunted on the two beside and the far monster: ' + w.blunted + ' (want 1,1,0)';
    if (p.blunted.join() !== '0,0,0') return 'a plain tank\'s Mend Blunted: ' + p.blunted;
    /* (the same dice both ways: a swing that misses misses in both, and is still the swing the stack is spent on) */
    if (!w.took.length || w.took.length !== p.took.length || !(p.took[0] >= 8)) return 'CONTROL: the swings at the tank were ' + JSON.stringify([w.took, p.took]);
    for (let i = 0; i < w.took.length; i++) if (Math.abs(2 * w.took[i] - p.took[i]) > 1) return 'a Blunted swing landed ' + w.took[i] + ' where the plain one landed ' + p.took[i] + ' (want half)';
    if (w.after.join() !== '0,0') return 'Blunted was not spent on the swing: ' + w.after;
    return null;
  },
  'cast-count-shield': (M) => {
    const play = (n, move) => {
      const k = H(M, 1, 12, 3, 'tank', { hp: 1000, maxHp: 1000, mana: 500, maxMana: 500 }), o = H(M, 2, 14, 8, 'mage');
      const spots = [[11, 2], [12, 2], [13, 2], [11, 4], [12, 4], [13, 4]];
      const ms = spots.slice(0, n).map(([x, y], i) => E(M, 10 + i, 0, x, y, 1, { hp: 900, maxHp: 900 }));
      const inst = fight(M, [k, o, ...ms], { leader: 1 });
      inst.heroes = { 1: entry(M, [move]) };
      wear(M, k, 'ossuary_helm');
      const sc = sc2(M, 42);
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      return { k, cast: sc.events.some((e) => e.type === 'cast' && e.ability === move), chilled: ms.filter((m) => stacksOf(m, 'chill').length).length };
    };
    const three = play(3, 'frost_slam'), six = play(6, 'frost_slam'), other = play(3, 'power_strike');
    if (!three.cast || three.chilled !== 3 || six.chilled !== 6) return 'CONTROL: Frost Slam chilled ' + three.chilled + ' and ' + six.chilled;
    if (three.k.shield !== 60) return 'a Frost Slam that Chilled 3: a shield of ' + three.k.shield + ' (want 2% x 3 of 1000)';
    if (six.k.shield !== 100) return 'a Frost Slam that Chilled 6: a shield of ' + six.k.shield + ' (want the 10% cap, 100)';
    if (!other.cast || other.k.shield) return 'another move\'s cast shielded: ' + other.k.shield;
    return null;
  },
  'shell-break-guard': (M) => {
    const k = H(M, 1, 12, 3, 'tank'), o = H(M, 2, 13, 3, 'mage', { hp: 200, maxHp: 200 }), q = H(M, 3, 14, 4, 'healer'), m = E(M, 10, 0, 13, 4, 2);
    const inst = fight(M, [k, o, q, m]);
    wear(M, k, 'grave_guards_mail');
    const sc = sc2(M, 43, 1000);
    o.shield = 30; o.shieldBy = 3;
    blowAt(M, inst, sc, m, o, 50); M.RX.drainReactions(inst, sc);
    if (stacksOf(o, 'guarded').length) return 'another hero\'s shell breaking Guarded its hero';
    o.shield = 30; o.shieldBy = 1;
    blowAt(M, inst, sc, m, o, 10); M.RX.drainReactions(inst, sc);
    if (stacksOf(o, 'guarded').length) return 'a shell that held Guarded its hero';
    blowAt(M, inst, sc, m, o, 50); M.RX.drainReactions(inst, sc);
    const g = stacksOf(o, 'guarded');
    if (g.length !== 1 || g[0].left !== 8000 || M.SE.effectPm(o, 'takenPm') !== -300 || stacksOf(k, 'guarded').length) {
      return 'the wearer\'s shell breaking on a hero: ' + JSON.stringify(o.statuses) + ' takenPm ' + M.SE.effectPm(o, 'takenPm') + ' (want that hero Guarded -30% for 8 s, not the wearer)';
    }
    return null;
  },
  'cast-blunt-target': (M) => {
    const play = (move) => {
      const u = H(M, 1, 12, 3, 'melee_dps', { mana: 100, maxMana: 100, maxHit: 50 }), o = H(M, 2, 10, 8, 'healer');
      const t = E(M, 10, 0, 13, 3, 1, { hp: 9000, maxHp: 9000 }), side = E(M, 11, 0, 13, 4, 1, { hp: 9000, maxHp: 9000 });
      const inst = fight(M, [u, o, t, side]);
      inst.heroes = { 1: entry(M, [move]) };
      u.target = 10;
      wear(M, u, 'charred_sabre');
      const sc = sc2(M, 57);
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      return { cast: sc.events.some((e) => e.type === 'cast' && e.ability === move), t: stacksOf(t, 'blunted').length, side: stacksOf(side, 'blunted').length };
    };
    const fs = play('flame_strike'), ps = play('power_strike');
    if (!fs.cast || !ps.cast) return 'CONTROL: the casts ' + JSON.stringify([fs, ps]);
    if (fs.t !== 1 || fs.side !== 0) return 'a Flame Strike cast: Blunted on its target ' + fs.t + ', beside it ' + fs.side + ' (want 1, 0)';
    if (ps.t || ps.side) return 'another move\'s cast Blunted';
    return null;
  },
  'ready-power': (M) => {
    const u = H(M, 1, 12, 3, 'melee_dps'), m = E(M, 10, 0, 13, 3, 1, { hp: 900, maxHp: 900 });
    const inst = fight(M, [u, m]);
    wear(M, u, 'pikemans_gauntlets');
    const sc = sc2(M, 45, 1000);
    u.cds = { power_strike: 9000, flame_strike: 9000 };
    blowAt(M, inst, sc, u, m, 10, 'turning_cut'); M.RX.drainReactions(inst, sc);
    if (u.cds.power_strike !== 9000) return 'another move\'s hit readied Power Strike';
    blowAt(M, inst, sc, u, m, 10, 'flame_strike'); M.RX.drainReactions(inst, sc);
    if (u.cds.power_strike !== 1000 || u.cds.flame_strike !== 9000) return 'a Flame Strike hit left Power Strike at ' + u.cds.power_strike + ' (want now, 1000)';
    return null;
  },
  'cast-poison': (M) => {
    const u = H(M, 1, 12, 3, 'melee_dps', { mana: 100, maxMana: 100, maxHit: 400 }), o = H(M, 2, 10, 8, 'healer'), m = E(M, 10, 0, 13, 3, 1, { hp: 90000, maxHp: 90000 });
    const inst = fight(M, [u, o, m]);
    inst.heroes = { 1: entry(M, ['rend']) };
    u.target = 10;
    wear(M, u, 'floodwater_hatchets');
    const sc = sc2(M, 46);
    M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
    const hits = sc.events.filter((e) => e.type === 'dmg' && e.ability === 'rend' && e.t === 10).map((e) => e.amount);
    const want = Math.floor((hits.reduce((x, y) => x + y, 0) * 200) / 1000 / 6);
    const po = stacksOf(m, 'poison');
    if (hits.length !== 2 || !(want > 0)) return 'CONTROL: Rend landed ' + JSON.stringify(hits);
    if (po.length !== 1 || po[0].amt !== want || po[0].left !== 6000) return 'Poison after a Rend: ' + JSON.stringify(po) + ' (want one stack ticking ' + want + ', 20% of the cast\'s ' + hits.join(' + ') + ' over 6 s)';
    return null;
  },
  'marked-bleed': (M) => {
    const r = H(M, 1, 10, 3, 'ranger', { maxHit: 60 }), mk = E(M, 10, 0, 13, 3, 1, { hp: 9000, maxHp: 9000 }), plain = E(M, 11, 0, 13, 4, 1, { hp: 9000, maxHp: 9000 });
    const inst = fight(M, [r, mk, plain]);
    wear(M, r, 'lurchers_collar');
    const sc = sc2(M, 47);
    at(inst, sc, 1000);
    mk.markPm = 200; mk.markUntil = 60000;
    blowAt(M, inst, sc, r, plain, 5, 'basic'); M.RX.drainReactions(inst, sc);
    if (stacksOf(plain, 'bleed').length) return 'a hit on an unmarked monster laid a Bleed';
    blowAt(M, inst, sc, r, mk, 5, 'basic'); M.RX.drainReactions(inst, sc);
    if (stacksOf(mk, 'bleed').length !== 1 || stacksOf(mk, 'bleed')[0].src !== 1) return 'a hit on the marked monster: ' + JSON.stringify(mk.statuses);
    at(inst, sc, 2900);
    blowAt(M, inst, sc, r, mk, 5, 'precision_shot'); M.RX.drainReactions(inst, sc);
    if (stacksOf(mk, 'bleed').length !== 1) return 'a second Bleed inside the 2 s clock';
    at(inst, sc, 3000);
    blowAt(M, inst, sc, r, mk, 5, 'basic'); M.RX.drainReactions(inst, sc);
    if (stacksOf(mk, 'bleed').length !== 2) return 'no second Bleed after the 2 s clock: ' + stacksOf(mk, 'bleed').length;
    return null;
  },
  'kill-ready-clock': (M) => {
    const r = H(M, 1, 10, 3, 'ranger'), ms = [0, 1, 2, 3].map((i) => E(M, 10 + i, 0, 14, 3 + i, 1, { hp: 1, maxHp: 1 }));
    const inst = fight(M, [r, ...ms]);
    wear(M, r, 'coal_runners_bow');
    const sc = sc2(M, 48, 1000);
    r.cds = { flame_volley: 9000 };
    blowAt(M, inst, sc, r, ms[0], 5, 'raking_shot'); M.RX.drainReactions(inst, sc);
    if (r.cds.flame_volley !== 9000) return 'another move\'s kill readied Flame Volley';
    blowAt(M, inst, sc, r, ms[1], 5, 'flame_volley'); M.RX.drainReactions(inst, sc);
    if (r.cds.flame_volley !== 1000) return 'a Flame Volley kill left it at ' + r.cds.flame_volley + ' (want now, 1000)';
    r.cds.flame_volley = 19000; sc.atMs = 10900;
    blowAt(M, inst, sc, r, ms[2], 5, 'flame_volley'); M.RX.drainReactions(inst, sc);
    if (r.cds.flame_volley !== 19000) return 'Flame Volley readied again inside its 10 s clock';
    sc.atMs = 11000;
    blowAt(M, inst, sc, r, ms[3], 5, 'flame_volley'); M.RX.drainReactions(inst, sc);
    if (r.cds.flame_volley !== 11000) return 'Flame Volley not readied after its 10 s clock: ' + r.cds.flame_volley;
    return null;
  },
  'reset-two': (M) => {
    const r = H(M, 1, 10, 3, 'ranger'), m = E(M, 10, 0, 14, 3, 1, { hp: 900, maxHp: 900 });
    const inst = fight(M, [r, m]);
    wear(M, r, 'provosts_longbow');
    const sc = sc2(M, 49, 1000);
    r.cds = { flame_volley: 9000, raking_shot: 7000, hunters_mark: 8000 };
    blowAt(M, inst, sc, r, m, 5, 'basic'); M.RX.drainReactions(inst, sc);
    if (r.cds.flame_volley !== 9000 || r.cds.raking_shot !== 7000) return 'another hit cut a cooldown';
    blowAt(M, inst, sc, r, m, 5, 'precision_shot'); M.RX.drainReactions(inst, sc);
    if (r.cds.flame_volley !== 8000 || r.cds.raking_shot !== 6000 || r.cds.hunters_mark !== 8000) return 'a Precision Shot hit: ' + JSON.stringify(r.cds) + ' (want Volley and Rake 1 s sooner, the Mark as it was)';
    return null;
  },
  'hit-poison': (M) => {
    const r = H(M, 1, 10, 3, 'ranger'), a = E(M, 10, 0, 14, 3, 1, { hp: 9000, maxHp: 9000 }), b = E(M, 11, 0, 15, 3, 1, { hp: 9000, maxHp: 9000 });
    const inst = fight(M, [r, a, b]);
    wear(M, r, 'wyvern_barb_crossbow');
    const sc = sc2(M, 50);
    blowAt(M, inst, sc, r, a, 600, 'precision_shot'); M.RX.drainReactions(inst, sc);
    if (stacksOf(a, 'poison').length) return 'another move\'s hit Poisoned';
    blowAt(M, inst, sc, r, a, 600, 'raking_shot'); blowAt(M, inst, sc, r, b, 300, 'raking_shot'); M.RX.drainReactions(inst, sc);
    const pa = stacksOf(a, 'poison'), pb = stacksOf(b, 'poison');
    if (pa.length !== 1 || pa[0].amt !== 20 || pb.length !== 1 || pb[0].amt !== 10) return 'Poison after a Raking Shot hit each: ' + JSON.stringify([pa, pb]) + ' (want 20% of 600 and of 300 over 6 ticks: 20 and 10)';
    return null;
  },
  'kill-burst': (M) => {
    const u = H(M, 1, 8, 3, 'mage'), f = E(M, 10, 0, 13, 4, 1, { hp: 1, maxHp: 1000 });
    const n1 = E(M, 11, 0, 14, 4, 1, { hp: 5000, maxHp: 5000 }), n2 = E(M, 12, 0, 12, 5, 1, { hp: 250, maxHp: 5000 });
    const far = E(M, 13, 0, 15, 4, 1, { hp: 5000, maxHp: 5000 }), past = E(M, 14, 0, 11, 6, 1, { hp: 5000, maxHp: 5000 });
    const inst = fight(M, [u, f, n1, n2, far, past]);
    wear(M, u, 'hall_fire_wand');
    const sc = sc2(M, 51);
    blowAt(M, inst, sc, u, n1, 1, 'frost_lance'); M.RX.drainReactions(inst, sc);
    if (n1.hp !== 4999) return 'CONTROL: a lance hit';
    const g = E(M, 15, 0, 20, 9, 1, { hp: 1, maxHp: 1000 });
    inst.world.units.push(g);
    blowAt(M, inst, sc, u, g, 5, 'frost_lance'); M.RX.drainReactions(inst, sc);
    if (sc.events.some((e) => e.ability === 'burst')) return 'another move\'s kill burst';
    blowAt(M, inst, sc, u, f, 5, 'fireball'); M.RX.drainReactions(inst, sc);
    if (n1.hp !== 4999 - 300) return 'the monster next to the fallen took ' + (4999 - n1.hp) + ' (want 30% of its 1000)';
    if (n2.alive !== false) return 'a burst for more than it held left it standing';
    if (far.hp !== 5000 || past.hp !== 5000) return 'a burst reached past the monsters next to the fallen (or a burst\'s kill burst again): ' + far.hp + ', ' + past.hp;
    return null;
  },
  'hit-silence': (M) => {
    const u = H(M, 1, 10, 3, 'mage'), m = E(M, 10, 0, 14, 3, 1, { hp: 900, maxHp: 900 });
    const inst = fight(M, [u, m]);
    wear(M, u, 'catacomb_shroud');
    const sc = sc2(M, 52);
    blowAt(M, inst, sc, u, m, 5, 'fireball'); M.RX.drainReactions(inst, sc);
    if (stacksOf(m, 'silenced').length) return 'another move\'s hit Silenced';
    blowAt(M, inst, sc, u, m, 5, 'hoarfrost'); M.RX.drainReactions(inst, sc);
    const s = stacksOf(m, 'silenced');
    if (s.length !== 1 || s[0].left !== 3000 || !M.SE.hasEffect(m, 'silence')) return 'a Hoarfrost hit: ' + JSON.stringify(m.statuses) + ' (want Silenced 3 s)';
    return null;
  },
  'break-kindle': (M) => {
    const play = (worn) => {
      const u = H(M, 1, 10, 3, 'mage', { mana: 900, maxMana: 900, maxHit: 60 }), o = H(M, 2, 12, 8, 'tank'), m = E(M, 10, 0, 14, 3, 1, { hp: 90000, maxHp: 90000 });
      const inst = fight(M, [u, o, m]);
      inst.heroes = { 1: entry(M, ['fireball'], 8) };
      u.target = 10;
      if (worn) wear(M, u, 'lamplighters_robe');
      const sc = sc2(M, 53);
      u.shield = 10; u.shieldBy = 1;
      blowAt(M, inst, sc, m, u, 30); M.RX.drainReactions(inst, sc);
      const kindled = stacksOf(u, 'kindled').length;
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      const spent = stacksOf(u, 'kindled').length;
      u.cds = {}; u.lanes = {};
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      return { kindled, spent, power: sc.events.filter((e) => e.type === 'cast' && e.ability === 'fireball').map((e) => e.power) };
    };
    const w = play(true), p = play(false);
    if (p.kindled || w.kindled !== 1) return 'Kindled after the shell broke: ' + w.kindled + ' (plain ' + p.kindled + ')';
    if (w.power.length !== 2 || p.power.length !== 2 || !(p.power[0] > 0)) return 'CONTROL: the casts ' + JSON.stringify([w.power, p.power]);
    if (w.power[0] !== Math.floor((p.power[0] * 1300) / 1000)) return 'the next Fireball cast at ' + w.power[0] + ' (want 30% over ' + p.power[0] + ')';
    if (w.spent !== 0 || w.power[1] !== p.power[1]) return 'Kindled was not spent on its Fireball: ' + JSON.stringify(w);
    return null;
  },
  'heal-guard': (M) => {
    const g = H(M, 1, 10, 3, 'healer', { mana: 999, maxMana: 999 }), a = H(M, 2, 11, 3, 'tank', { hp: 25, maxHp: 100 }), b = H(M, 3, 12, 3, 'mage', { hp: 50, maxHp: 100 });
    const inst = fight(M, [g, a, b]);
    wear(M, g, 'bargemans_pole');
    const sc = sc2(M, 54);
    const mend = M.AD.ABILITIES.greater_mend, circle = M.AD.ABILITIES.circle_of_renewal;
    M.HR.landHeal(g, b, 20, sc, false, mend, false, { inst, fx: null }); M.RX.drainReactions(inst, sc);
    if (stacksOf(b, 'guarded').length) return 'a Greater Mend on a hero at 50% Guarded it';
    M.HR.landHeal(g, a, 20, sc, false, circle, false, { inst, fx: null }); a.hp = 25; M.RX.drainReactions(inst, sc);
    if (stacksOf(a, 'guarded').length) return 'another heal Guarded';
    /* healed from 25 to 60: the line is read as the heal begins */
    M.HR.landHeal(g, a, 35, sc, false, mend, false, { inst, fx: null }); M.RX.drainReactions(inst, sc);
    const s = stacksOf(a, 'guarded');
    if (s.length !== 1 || s[0].left !== 4000 || M.SE.effectPm(a, 'takenPm') !== -150) return 'a Greater Mend begun at 25%: ' + JSON.stringify(a.statuses) + ' takenPm ' + M.SE.effectPm(a, 'takenPm') + ' (want Guarded -15% for 4 s)';
    return null;
  },
  'absorb-reflect': (M) => {
    const g = H(M, 1, 10, 3, 'healer'), a = H(M, 2, 12, 3, 'tank', { hp: 500, maxHp: 500 }), q = H(M, 3, 11, 5, 'mage'), m = E(M, 10, 0, 13, 3, 2, { hp: 1000, maxHp: 1000 });
    const inst = fight(M, [g, a, q, m]);
    wear(M, g, 'drovers_hat');
    const sc = sc2(M, 55);
    a.shield = 100; a.shieldBy = 3;
    blowAt(M, inst, sc, m, a, 60); M.RX.drainReactions(inst, sc);
    if (m.hp !== 1000) return 'another hero\'s shell sent a blow back';
    a.shield = 100; a.shieldBy = 1;
    blowAt(M, inst, sc, m, a, 60); M.RX.drainReactions(inst, sc);
    if (m.hp !== 985) return 'the wearer\'s shell took 60 and sent back ' + (1000 - m.hp) + ' (want a quarter, 15)';
    blowAt(M, inst, sc, m, a, 100); M.RX.drainReactions(inst, sc);
    if (m.hp !== 975) return 'the shell took its last 40 and sent back ' + (985 - m.hp) + ' (want 10: only what it took)';
    return null;
  },
  'low-mend-blunt': (M) => {
    const u = H(M, 1, 12, 3, 'tank', { hp: 150, maxHp: 1000 }), a = E(M, 10, 0, 13, 3, 1), b = E(M, 11, 0, 11, 4, 1), far = E(M, 12, 0, 15, 3, 1);
    const inst = fight(M, [u, a, b, far]);
    wear(M, u, 'ferry_pennies');
    const sc = sc2(M, 56);
    const mend = M.AD.ABILITIES.mend;
    M.HR.landHeal(u, u, 100, sc, false, M.AD.ABILITIES.greater_mend, false, { inst, fx: null }); u.hp = 150; M.RX.drainReactions(inst, sc);
    if (stacksOf(a, 'blunted').length) return 'another heal under the line Blunted';
    /* begun at 15%, healed to 45%: the line is read as the Mend begins */
    M.HR.landHeal(u, u, 300, sc, false, mend, false, { inst, fx: null }); M.RX.drainReactions(inst, sc);
    const got = [a, b, far].map((m) => stacksOf(m, 'blunted').length);
    if (got.join() !== '1,1,0') return 'a Mend begun at 15%: Blunted on the two beside and the far one ' + got + ' (want 1,1,0)';
    if (M.SE.effectPm(a, 'dealtPm') !== -500) return 'Blunted cuts the next blow by ' + M.SE.effectPm(a, 'dealtPm') + ' permille, not 500';
    a.statuses = []; b.statuses = [];
    M.HR.landHeal(u, u, 100, sc, false, mend, false, { inst, fx: null }); M.RX.drainReactions(inst, sc);
    if (stacksOf(a, 'blunted').length) return 'a Mend begun at ' + (u.hp - 100) / 10 + '% (over the 45% line) Blunted';
    return null;
  },
  /* ── BATCH 3 ── */
  'taunt-party-guard': (M) => {
    /* #1 Bannerman's Pavise (reshaped, lane/designer-sig-batch4: Armor Break on the taunted read -1.3 pace steps): a Challenge that takes
       monsters Guards every living hero of the party at 1.25 times its row (-12.5% taken) for 3 s; a fallen hero nothing; a Challenge that
       takes none nothing */
    const k = H(M, 1, 12, 3, 'tank'), o = H(M, 2, 11, 5, 'mage'), dead = H(M, 3, 11, 6, 'healer', { alive: false, hp: 0 }), a = E(M, 10, 0, 13, 4, 2), b = E(M, 11, 0, 12, 4, 2);
    const inst = fight(M, [k, o, dead, a, b], { leader: 1 });
    wear(M, k, 'bannermans_pavise');
    const sc = sc2(M, 61);
    const took = M.targeting.challengeFrom(inst, sc, k); M.RX.drainReactions(inst, sc);
    if (took !== 2) return 'CONTROL: the Challenge took ' + took + ' (want the two on the mage)';
    for (const h of [k, o]) {
      const g = stacksOf(h, 'guarded');
      if (g.length !== 1 || g[0].left !== 3000 || M.SE.effectPm(h, 'takenPm') !== -125) return 'hero ' + h.id + ' after the Challenge: ' + JSON.stringify(h.statuses) + ' (want Guarded -125 permille, 3 s)';
    }
    if (stacksOf(dead, 'guarded').length) return 'a fallen hero was Guarded';
    k.statuses = []; o.statuses = [];
    const again = M.targeting.challengeFrom(inst, sc, k); M.RX.drainReactions(inst, sc);
    if (again === 0 && stacksOf(o, 'guarded').length) return 'a Challenge that took nothing Guarded the party';
    return null;
  },
  'taunt-armor-break': (M) => {
    /* the piece the Pavise used to carry (a planted row, lane/designer-sig-batch4): the monsters a Challenge takes off an ally lose a quarter
       of their armor; one already on the tank is not taunted (the taunt names its monsters: `list`) */
    const k = H(M, 1, 12, 3, 'tank'), o = H(M, 2, 11, 5, 'mage'), a = E(M, 10, 0, 13, 4, 2), b = E(M, 11, 0, 12, 4, 2), held = E(M, 12, 0, 13, 3, 1);
    const inst = fight(M, [k, o, a, b, held], { leader: 1 });
    k.reacts = [{ kind: 'react', id: 'break_test', on: 'taunt', do: 'status', status: 'armor_break' }];
    const sc = sc2(M, 61);
    const took = M.targeting.challengeFrom(inst, sc, k); M.RX.drainReactions(inst, sc);
    if (took !== 2) return 'CONTROL: the Challenge took ' + took + ' (want the two on the mage)';
    const ab = [a, b, held].map((m) => stacksOf(m, 'armor_break').length);
    if (ab.join() !== '1,1,0') return 'Armor Break on the two taunted and the one already held: ' + ab + ' (want 1,1,0)';
    if (M.SE.effectPm(a, 'armorPm') !== -250) return 'Armor Break keeps ' + M.SE.effectPm(a, 'armorPm') + ' permille of armor off, not 250';
    return null;
  },
  'near-fall-ready': (M) => {
    /* #19 Lock-Keeper's Chain: an ally crossing its near-fall line readies Spring Tide, once a 60 s clock (30 s until lane/designer-sig-batch5) */
    const g = H(M, 1, 10, 3, 'healer'), a = H(M, 2, 12, 3, 'mage', { hp: 1000, maxHp: 1000 }), m = E(M, 10, 0, 13, 3, 2);
    const inst = fight(M, [g, a, m]);
    wear(M, g, 'lock_keepers_chain');
    const sc = sc2(M, 62);
    at(inst, sc, 1000);
    g.cds = { spring_tide: 61000 };
    blowAt(M, inst, sc, m, a, 100); M.RX.drainReactions(inst, sc);
    if (g.cds.spring_tide !== 61000) return 'a blow that left the ally at 90% readied Spring Tide';
    blowAt(M, inst, sc, m, a, 850); M.RX.drainReactions(inst, sc);
    if (g.cds.spring_tide !== 1000) return 'an ally crossing its near-fall line left Spring Tide at ' + g.cds.spring_tide + ' (want now, 1000)';
    a.hp = 1000; g.cds = Object.assign({}, g.cds, { spring_tide: 120000 });
    at(inst, sc, 60900);
    blowAt(M, inst, sc, m, a, 950); M.RX.drainReactions(inst, sc);
    if (g.cds.spring_tide !== 120000) return 'Spring Tide readied again inside its 60 s clock';
    a.hp = 1000;
    at(inst, sc, 61000);
    blowAt(M, inst, sc, m, a, 950); M.RX.drainReactions(inst, sc);
    if (g.cds.spring_tide !== 61000) return 'Spring Tide not readied after its 60 s clock: ' + g.cds.spring_tide;
    return null;
  },
  'cast-steeped': (M) => {
    /* #20 Greened Bracers: a Green Sickness cast Steeps its caster, and its next Greater Mend casts 30% stronger and spends it */
    const play = (worn) => {
      const g = H(M, 1, 10, 3, 'healer', { mana: 2000, maxMana: 2000, maxHit: 60 }), a = H(M, 2, 11, 3, 'tank', { hp: 100, maxHp: 5000 });
      const m = E(M, 10, 0, 12, 3, 2, { hp: 90000, maxHp: 90000 }), n = E(M, 11, 0, 12, 4, 2, { hp: 90000, maxHp: 90000 });
      const inst = fight(M, [g, a, m, n]);
      inst.heroes = { 1: entry(M, ['green_sickness'], 8) };
      g.target = 10;
      if (worn) wear(M, g, 'greened_bracers');
      const sc = sc2(M, 63);
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      const steeped = stacksOf(g, 'steeped').length, onMonster = stacksOf(m, 'steeped').length;
      inst.heroes = { 1: entry(M, ['greater_mend'], 8) }; g.cds = {}; g.lanes = {};
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      const cast = (id) => sc.events.filter((e) => e.type === 'cast' && e.ability === id);
      return { steeped, onMonster, spent: stacksOf(g, 'steeped').length, gs: cast('green_sickness').length, power: cast('greater_mend').map((e) => e.power) };
    };
    const w = play(true), p = play(false);
    if (w.gs !== 1 || p.gs !== 1 || w.power.length !== 1 || p.power.length !== 1 || !(p.power[0] > 0)) return 'CONTROL: the casts ' + JSON.stringify([w, p]);
    if (w.steeped !== 1 || w.onMonster || p.steeped) return 'Steeped after Green Sickness: on the caster ' + w.steeped + ', on its monster ' + w.onMonster + ' (plain ' + p.steeped + ')';
    if (w.power[0] !== Math.floor((p.power[0] * 1300) / 1000)) return 'the next Greater Mend cast at ' + w.power[0] + ' (want 30% over ' + p.power[0] + ')';
    if (w.spent) return 'Steeped was not spent on the Greater Mend';
    return null;
  },
  'alone-kill-heal': (M) => {
    /* #22 Slake Waders: a kill heals a hero hunting alone 4% of its max health; the same kill with an ally in the world heals nothing */
    const play = (withAlly) => {
      const u = H(M, 1, 12, 3, 'melee_dps', { hp: 500, maxHp: 1000 }), m = E(M, 10, 0, 13, 3, 1, { hp: 5, maxHp: 50 });
      const inst = fight(M, withAlly ? [u, H(M, 2, 10, 6, 'healer'), m] : [u, m]);
      wear(M, u, 'slake_waders');
      const sc = sc2(M, 64);
      blowAt(M, inst, sc, u, m, 50, 'basic'); M.RX.drainReactions(inst, sc);
      return u.hp;
    };
    const alone = play(false), party = play(true);
    if (alone !== 540) return 'a kill alone left the hero at ' + alone + ' (want 500 + 4% of 1000)';
    if (party !== 500) return 'a kill with an ally in the world healed the hero to ' + party;
    return null;
  },
  'ice-stokes-fire': (M) => {
    /* #24 Stoker's Ring (reshaped, lane/designer-sig-batch4: the echo on a chilled target read 0.2 pace steps, its moment rare): an Ice rune
       spell's cast Stokes its caster, and its next Fire rune spell casts 45% stronger and spends it; a Fire spell's own cast Stokes nothing */
    const play = (worn, first) => {
      const u = H(M, 1, 10, 3, 'mage', { mana: 9000, maxMana: 9000, maxHit: 60 });
      const m = E(M, 10, 0, 12, 3, 2, { hp: 90000, maxHp: 90000 }), n = E(M, 11, 0, 12, 4, 2, { hp: 90000, maxHp: 90000 });
      const inst = fight(M, [u, m, n]);
      inst.heroes = { 1: entry(M, [first], 8) };
      u.target = 10;
      if (worn) wear(M, u, 'stokers_ring');
      const sc = sc2(M, 65);
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      const stoked = stacksOf(u, 'stoked').length, onMonster = stacksOf(m, 'stoked').length;
      inst.heroes = { 1: entry(M, ['fireball'], 8) }; u.cds = {}; u.lanes = {};
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      const cast = (id) => sc.events.filter((e) => e.type === 'cast' && e.ability === id);
      return { stoked, onMonster, spent: stacksOf(u, 'stoked').length, first: cast(first).length, power: cast('fireball').map((e) => e.power) };
    };
    const w = play(true, 'frost_lance'), p = play(false, 'frost_lance'), f = play(true, 'fireball');
    if (w.first !== 1 || p.first !== 1 || w.power.length !== 1 || p.power.length !== 1 || !(p.power[0] > 0)) return 'CONTROL: the casts ' + JSON.stringify([w, p]);
    if (w.stoked !== 1 || w.onMonster || p.stoked) return 'Stoked after a Frost Lance: on the caster ' + w.stoked + ', on its monster ' + w.onMonster + ' (plain ' + p.stoked + ')';
    if (w.power[0] !== Math.floor((p.power[0] * 1450) / 1000)) return 'the next Fireball cast at ' + w.power[0] + ' (want 45% over ' + p.power[0] + ')';
    if (w.spent) return 'Stoked was not spent on the Fireball';
    if (f.stoked) return 'a Fireball (a Fire rune spell) Stoked its caster';
    return null;
  },
  'rune-save': (M) => {
    /* #25 The Cold Candle (reshaped, lane/designer-sig-batch5, `saves.of`: every Ice spell read 27.8 coin steps, over the bar, Frost Lance
       alone 19.6): every Frost Lance buys no rune (each cast says which rune it saved), and a Hoarfrost, the other Ice rune spell, pays
       its rune; a plain mage buys every one */
    const play = (worn, move) => {
      const u = H(M, 1, 10, 3, 'mage', { mana: 9000, maxMana: 9000, maxHit: 60 }), m = E(M, 10, 0, 14, 3, 1, { hp: 90000, maxHp: 90000 });
      const inst = fight(M, [u, m]);
      inst.heroes = { 1: entry(M, [move], 8) };
      u.target = 10;
      if (worn) wear(M, u, 'the_cold_candle');
      const sc = sc2(M, 66);
      const purse = [];
      for (let i = 0; i < 3; i++) { u.cds = Object.fromEntries(Object.entries(u.cds || {}).filter(([k]) => k.startsWith('~'))); u.lanes = {}; M.abilities.castAbilities(inst, sc); purse.push(inst.heroes[1].hs.purse); }
      const casts = sc.events.filter((e) => e.type === 'cast' && e.ability === move);
      return { gold: casts.map((e) => e.gold), saved: casts.map((e) => e.saved || null), purse, count: (u.cds || {})['~n:the_cold_candle'] };
    };
    const w = play(true, 'frost_lance'), p = play(false, 'frost_lance'), h = play(true, 'hoarfrost');
    if (p.gold.length !== 3 || !p.gold.every((g) => g > 0)) return 'CONTROL: the plain mage\'s casts cost ' + JSON.stringify(p.gold);
    if (M.AD.ABILITIES.hoarfrost.rune !== M.AD.ABILITIES.frost_lance.rune) return 'CONTROL: Hoarfrost and Frost Lance spend one rune family';
    if (w.gold.join() !== '0,0,0') return 'the Candle\'s three Frost Lances cost ' + w.gold + ' (want 0, 0, 0)';
    if (!w.saved.every(Boolean)) return 'the saved rune: ' + JSON.stringify(w.saved);
    if (w.purse[2] !== w.purse[0] || !(w.purse[0] > 0)) return 'the Candle\'s casts spent ' + (w.purse[0] - w.purse[2]) + ' gold';
    /* (the other Ice rune spell: paid, and never counted, so a Frost Lance after it is still saved) */
    if (h.gold.length !== 3 || !h.gold.every((g) => g > 0) || h.saved.some(Boolean) || h.count !== undefined) return 'the Candle\'s wearer cast Hoarfrost for ' + JSON.stringify(h) + ' (want each paid, none saved, nothing counted)';
    return null;
  },
  'shell-break-heal': (M) => {
    /* the piece #26 Thrower's Ring carried in batch 3 (a planted row, lane/signatures-batch-4: the Ring's new rule Blunts the breaker): a
       shell the wearer cast breaking heals its hero 6% of that hero's max health; another hero's shell nothing */
    const g = H(M, 1, 10, 3, 'healer'), a = H(M, 2, 12, 3, 'tank', { hp: 500, maxHp: 1000 }), q = H(M, 3, 11, 5, 'mage'), m = E(M, 10, 0, 13, 3, 2);
    const inst = fight(M, [g, a, q, m]);
    g.reacts = [{ kind: 'react', id: 'heal_test', on: 'shield_break', do: 'heal', to: 'target', pm: 60 }];
    const sc = sc2(M, 67);
    a.shield = 30; a.shieldBy = 3;
    blowAt(M, inst, sc, m, a, 50); M.RX.drainReactions(inst, sc);
    if (a.hp !== 480) return 'another hero\'s shell breaking healed: ' + a.hp;
    a.shield = 30; a.shieldBy = 1;
    blowAt(M, inst, sc, m, a, 50); M.RX.drainReactions(inst, sc);
    if (a.hp !== 520) return 'the wearer\'s shell breaking left its hero at ' + a.hp + ' (want 480 - 20 + 6% of 1000)';
    return null;
  },
  'heal-mana': (M) => {
    /* #27 Riverstone Earrings (reshaped, lane/designer-sig-batch4: 10% of the heal to the hero healed read 4.1 coin steps, its mana on the
       tank, who never drinks): a Water rune heal gives the wearer 0.5% of its own max mana; Mend (no rune) none */
    const g = H(M, 1, 10, 3, 'healer', { mana: 0, maxMana: 2000 }), a = H(M, 2, 11, 3, 'mage', { hp: 100, maxHp: 1000, mana: 0, maxMana: 1000 });
    const inst = fight(M, [g, a]);
    wear(M, g, 'riverstone_earrings');
    const sc = sc2(M, 68);
    M.HR.landHeal(g, a, 300, sc, false, M.AD.ABILITIES.mend, false, { inst, fx: null }); M.RX.drainReactions(inst, sc);
    if (g.mana || a.mana) return 'a Mend gave mana';
    M.HR.landHeal(g, a, 250, sc, false, M.AD.ABILITIES.greater_mend, false, { inst, fx: null }); M.RX.drainReactions(inst, sc);
    if (g.mana !== 10 || a.mana) return 'a Greater Mend gave the wearer ' + g.mana + ' and the healed ' + a.mana + ' mana (want 0.5% of 2000, 10, and 0)';
    /* the piece the row used to carry, mana to the healed hero as a share of the heal (a planted row): 10% of 250 */
    g.reacts = [{ kind: 'react', id: 'mana_test', on: 'heal', family: 'water', do: 'mana', to: 'target', pm: 100 }];
    M.HR.landHeal(g, a, 250, sc, false, M.AD.ABILITIES.greater_mend, false, { inst, fx: null }); M.RX.drainReactions(inst, sc);
    if (a.mana !== 25) return 'the planted row gave the healed ' + a.mana + ' mana (want 10% of the 250 healed, 25)';
    return null;
  },
  'bleed-six': (M) => {
    /* #29 Fledgling Claw: the wearer's sixth Bleed lands on a monster at five; a plain hero's stays at five, and no landing goes past six */
    const play = (worn) => {
      const u = H(M, 1, 12, 3, 'melee_dps', { maxHit: 50 }), o = H(M, 2, 11, 3, 'ranger', { maxHit: 50 }), m = E(M, 10, 0, 13, 3, 1, { hp: 90000, maxHp: 90000 });
      const inst = fight(M, [u, o, m]);
      if (worn) wear(M, u, 'fledgling_claw');
      const sc = sc2(M, 70);
      const lay = (by) => M.STS.applyStatus(inst, m, M.ST.STATUSES.bleed, { u: by.id, maxHit: 50, runeTier: 1 }, sc);
      for (let i = 0; i < 5; i++) lay(o);
      const five = stacksOf(m, 'bleed').length;
      lay(u); const six = stacksOf(m, 'bleed').length;
      lay(u); lay(o); const after = stacksOf(m, 'bleed').length;
      return { five, six, after };
    };
    const w = play(true), p = play(false);
    if (w.five !== 5 || p.five !== 5) return 'CONTROL: five stacks laid read ' + w.five + ', ' + p.five;
    if (w.six !== 6 || w.after !== 6) return 'the wearer\'s Bleeds on a monster at five: ' + w.six + ', then ' + w.after + ' (want 6, 6)';
    if (p.six !== 5) return 'a plain hero\'s Bleed went past five: ' + p.six;
    return null;
  },
  'every-fifth-death': (M) => {
    /* the piece The Cellar Key used to carry (a planted row, lane/designer-sig-batch4): every fifth monster that dies (whoever's blow) heals
       each living hero of the wearer's party 3% of its own max */
    const g = H(M, 1, 10, 3, 'healer', { hp: 500, maxHp: 1000 }), k = H(M, 2, 12, 3, 'tank', { hp: 1000, maxHp: 2000 });
    const ms = [0, 1, 2, 3, 4].map((i) => E(M, 10 + i, 0, 13, 3 + i, 2, { hp: 1, maxHp: 1 }));
    const inst = fight(M, [g, k, ...ms]);
    g.reacts = [{ kind: 'react', id: 'every_test', on: 'death', every: 5, do: 'heal', to: 'party', pm: 30 }];
    const sc = sc2(M, 71);
    for (const m of ms.slice(0, 4)) { blowAt(M, inst, sc, k, m, 5, 'basic'); M.RX.drainReactions(inst, sc); }
    if (g.hp !== 500 || k.hp !== 1000) return 'four deaths healed: ' + g.hp + ', ' + k.hp;
    blowAt(M, inst, sc, k, ms[4], 5, 'basic'); M.RX.drainReactions(inst, sc);
    if (g.hp !== 530 || k.hp !== 1060) return 'the fifth death left the party at ' + g.hp + ', ' + k.hp + ' (want 3% of each one\'s max: 530, 1060)';
    return null;
  },
  'ally-low-heal': (M) => {
    /* #31 The Cellar Key (reshaped, lane/designer-sig-batch4: the party heal read 0.0 pace steps, overheal): a monster's blow that leaves an
       ally under 30% heals that ally 3% of its max health, once every 20 s for each ally (2% and 30 s until lane/designer-sig-batch5); a blow that leaves it over the line, or one on the
       wearer itself, nothing */
    const g = H(M, 1, 10, 3, 'healer', { hp: 1000, maxHp: 1000 }), a = H(M, 2, 12, 3, 'tank', { hp: 1000, maxHp: 1000 }), b = H(M, 3, 11, 5, 'mage', { hp: 1000, maxHp: 1000 });
    const m = E(M, 10, 0, 13, 3, 2);
    const inst = fight(M, [g, a, b, m]);
    wear(M, g, 'the_cellar_key');
    const sc = sc2(M, 71);
    at(inst, sc, 1000);
    blowAt(M, inst, sc, m, a, 500); M.RX.drainReactions(inst, sc);
    if (a.hp !== 500) return 'a blow that left the ally at half healed it to ' + a.hp;
    blowAt(M, inst, sc, m, a, 250); M.RX.drainReactions(inst, sc);
    if (a.hp !== 280) return 'a blow that left the ally at 25% left it at ' + a.hp + ' (want 250 + 3% of 1000)';
    at(inst, sc, 20900);
    blowAt(M, inst, sc, m, a, 100); M.RX.drainReactions(inst, sc);
    if (a.hp !== 180) return 'the same ally healed again inside its 20 s: ' + a.hp;
    blowAt(M, inst, sc, m, b, 750); M.RX.drainReactions(inst, sc);
    if (b.hp !== 280) return 'another ally under the line, on its own clock, left at ' + b.hp + ' (want 280)';
    at(inst, sc, 21000);
    blowAt(M, inst, sc, m, a, 10); M.RX.drainReactions(inst, sc);
    if (a.hp !== 200) return 'the ally after its 20 s left at ' + a.hp + ' (want 170 + 30)';
    blowAt(M, inst, sc, m, g, 750); M.RX.drainReactions(inst, sc);
    if (g.hp !== 250) return 'a blow on the wearer itself (left at 25%) healed it to ' + g.hp;
    return null;
  },
  'boss-low-party': (M) => {
    /* #38 Drowned Signet: a hit that leaves a boss under 25% makes every living hero of the party Emboldened at 1.5 times its row for 10 s,
       once a boss; a monster that is no boss nothing */
    const r = H(M, 1, 10, 3, 'ranger'), k = H(M, 2, 12, 3, 'tank'), dead = H(M, 3, 11, 5, 'mage', { alive: false, hp: 0 });
    const boss = E(M, 10, 0, 13, 3, 2, { kind: 'captain_hask', hp: 1000, maxHp: 1000 }), mob = E(M, 11, 0, 13, 4, 2, { hp: 1000, maxHp: 1000 });
    const inst = fight(M, [r, k, dead, boss, mob]);
    if (M.MONSTERS[boss.kind].boss !== true || M.MONSTERS[mob.kind].boss === true) return 'CONTROL: the fixture\'s boss ' + boss.kind + ' and monster ' + mob.kind;
    wear(M, r, 'drowned_signet');
    const sc = sc2(M, 73, 1000);
    blowAt(M, inst, sc, r, mob, 800, 'basic'); M.RX.drainReactions(inst, sc);
    if (stacksOf(r, 'emboldened').length) return 'a monster that is no boss, under 25%, Emboldened the party';
    blowAt(M, inst, sc, r, boss, 700, 'basic'); M.RX.drainReactions(inst, sc);
    if (stacksOf(r, 'emboldened').length) return 'a boss at 30% Emboldened the party';
    blowAt(M, inst, sc, r, boss, 100, 'basic'); M.RX.drainReactions(inst, sc);
    for (const h of [r, k]) {
      const s = stacksOf(h, 'emboldened');
      if (s.length !== 1 || s[0].left !== 10000 || M.SE.effectPm(h, 'dealtPm') !== 150) return 'hero ' + h.id + ' after the boss fell under 25%: ' + JSON.stringify(h.statuses);
    }
    if (stacksOf(dead, 'emboldened').length) return 'a fallen hero was Emboldened';
    r.statuses = []; k.statuses = [];
    blowAt(M, inst, sc, r, boss, 10, 'basic'); M.RX.drainReactions(inst, sc);
    if (stacksOf(r, 'emboldened').length) return 'the same boss Emboldened the party twice';
    return null;
  },
  'ally-low-blunt': (M) => {
    /* #42 Night Carter's Boots (reshaped, lane/designer-sig-batch4: every pull-start shape read under, -2.9 to +0.8): a monster's blow that
       leaves an ally under 45% Blunts that monster (its next blow at half); a blow that leaves the ally over the line, or one on the wearer
       itself, nothing */
    /* (lane/signatures-batch-4, P9: a stalker's blow only, monster-roles.js: Muster's Cairn Wight a stalker, its Pikeman a swarm) */
    /* (a planted row since lane/signatures-batch-5 re-specced the Boots on a wind-up, windup-blunt: the piece and its role filter stay) */
    const g = H(M, 1, 10, 3, 'healer', { hp: 1000, maxHp: 1000 }), a = H(M, 2, 12, 3, 'tank', { hp: 1000, maxHp: 1000 });
    const st = { kind: 'cairn_wight' };
    const m = E(M, 10, 0, 13, 3, 2, st), n = E(M, 11, 0, 13, 4, 2, st), o = E(M, 12, 0, 11, 3, 2, st), sw = E(M, 13, 0, 12, 4, 2, { kind: 'barrow_pikeman' });
    const inst = fight(M, [g, a, m, n, o, sw]);
    if (M.MONSTERS.cairn_wight.role !== 'stalker' || M.MONSTERS.barrow_pikeman.role === 'stalker') return 'CONTROL: the fixture\'s roles';
    g.reacts = [{ kind: 'react', id: 'stalker_test', on: 'ally_hit', belowPm: 450, role: 'stalker', do: 'status', status: 'blunted' }];
    const sc = sc2(M, 74);
    blowAt(M, inst, sc, m, a, 500); M.RX.drainReactions(inst, sc);
    if (stacksOf(m, 'blunted').length) return 'a blow that left the ally at half Blunted its monster';
    /* (a stalker's blow to 42%: under the 45% line, over a 40% one) */
    blowAt(M, inst, sc, n, a, 80); M.RX.drainReactions(inst, sc);
    if (stacksOf(n, 'blunted').length !== 1 || stacksOf(m, 'blunted').length) return 'a stalker\'s blow that left the ally at 42%: ' + JSON.stringify([m.statuses, n.statuses]) + ' (want the striker Blunted, the other not)';
    blowAt(M, inst, sc, sw, a, 100); M.RX.drainReactions(inst, sc);
    if (stacksOf(sw, 'blunted').length) return 'a swarm\'s blow that left the ally at 32% Blunted it (want a stalker\'s only)';
    blowAt(M, inst, sc, o, g, 700); M.RX.drainReactions(inst, sc);
    if (stacksOf(o, 'blunted').length) return 'a blow on the wearer itself Blunted its monster';
    return null;
  },
  'pull-chill': (M) => {
    /* the piece #42 carried (a planted row, lane/designer-sig-batch4): a pull's start Chills every monster of its pack for 3 s, none outside it */
    const k = H(M, 1, 12, 3, 'tank'), a = E(M, 10, 0, 18, 3, 1), b = E(M, 11, 0, 19, 4, 1), c = E(M, 12, 0, 13, 4, 1);
    const inst = fight(M, [k, a, b, c]);
    k.reacts = [{ kind: 'react', id: 'pull_test', on: 'pull', do: 'status', status: 'chill', ms: 3000 }];
    const sc = sc2(M, 74);
    M.RQ.queueOn(inst, k, 'pull', { list: [a, b], n: 2 }); M.RX.drainReactions(inst, sc);
    const got = [a, b, c].map((m) => stacksOf(m, 'chill').map((s) => s.left).join('/') || '-');
    if (got.join() !== '3000,3000,-') return 'Chill after a pull of two: ' + got + ' (want 3000,3000,-)';
    return null;
  },
  'single-carry': (M) => {
    /* the piece Bull's Tooth used to carry (a planted row, lane/designer-sig-batch4): a single-target move's kill carries its overkill to
       the nearest monster; a line move's kill carries nothing */
    const r = H(M, 1, 10, 3, 'ranger');
    const f1 = E(M, 10, 0, 13, 3, 1, { hp: 100, maxHp: 1000 }), n1 = E(M, 11, 0, 14, 3, 1, { hp: 5000, maxHp: 5000 });
    const f2 = E(M, 12, 0, 13, 8, 1, { hp: 100, maxHp: 1000 }), n2 = E(M, 13, 0, 14, 8, 1, { hp: 5000, maxHp: 5000 });
    const inst = fight(M, [r, f1, n1, f2, n2]);
    r.reacts = [{ kind: 'react', id: 'carry_test', on: 'kill', single: true, do: 'carry', pm: 1000, capPm: 1000, r: 8 }];
    const sc = sc2(M, 75);
    blowAt(M, inst, sc, r, f2, 400, 'raking_shot'); M.RX.drainReactions(inst, sc);
    if (n2.hp !== 5000) return 'a line move\'s kill carried ' + (5000 - n2.hp);
    blowAt(M, inst, sc, r, f1, 400, 'precision_shot'); M.RX.drainReactions(inst, sc);
    if (n1.hp !== 4700) return 'a Precision Shot that killed for 300 past the HP it took carried ' + (5000 - n1.hp) + ' (want 300)';
    return null;
  },
  'single-low-double': (M) => {
    /* #43 Bull's Tooth (reshaped, lane/designer-sig-batch4: the carried overkill read 0.3 pace steps): a single-target hit that leaves a
       monster under half (30% until lane/designer-sig-batch5) lands again for all of it a sub-step later; one that leaves it over the
       line, or an area move's, nothing */
    /* (lane/signatures-batch-4, P9: a brute only: Muster's Knight a brute, its Pikeman a swarm) */
    const r = H(M, 1, 10, 3, 'ranger');
    const br = { kind: 'muster_knight', hp: 1000, maxHp: 1000 };
    const hi = E(M, 10, 0, 13, 3, 1, br), lo = E(M, 11, 0, 13, 4, 1, br), ar = E(M, 12, 0, 13, 5, 1, br), sw = E(M, 13, 0, 13, 6, 1, { kind: 'barrow_pikeman', hp: 1000, maxHp: 1000 });
    const inst = fight(M, [r, hi, lo, ar, sw]);
    if (M.MONSTERS.muster_knight.role !== 'brute' || M.MONSTERS.barrow_pikeman.role === 'brute') return 'CONTROL: the fixture\'s roles';
    wear(M, r, 'bulls_tooth');
    const sc = sc2(M, 75);
    blowAt(M, inst, sc, r, hi, 400, 'precision_shot'); blowAt(M, inst, sc, r, ar, 800, 'flame_volley'); blowAt(M, inst, sc, r, sw, 750, 'precision_shot'); M.RX.drainReactions(inst, sc);
    if (stacksOf(hi, 'echo').length || stacksOf(ar, 'echo').length) return 'a hit that left its monster at 60%, or an area move\'s at 20%, landed again';
    if (stacksOf(sw, 'echo').length) return 'a single-target hit that left a swarm at 25% landed again (want a brute only)';
    blowAt(M, inst, sc, r, lo, 550, 'precision_shot'); M.RX.drainReactions(inst, sc);
    const e = stacksOf(lo, 'echo');
    if (e.length !== 1 || e[0].amt !== 550) return 'a Precision Shot that left its monster at 45%: ' + JSON.stringify(e) + ' (want one echo of all 550)';
    return null;
  },
  /* ── BATCH 4 (lane/signatures-batch-4, 2026-11-28; one case a row, each engine piece with its mutant) ── */
  'shell-break-blunt': (M) => {
    /* the piece #26 Thrower's Ring carried in batch 4 (P5, a broken shell's breaker; a planted row since lane/signatures-batch-5 re-specced
       the Ring as a raise, earth-shell-raise): a shell the wearer cast breaking Blunts the monster whose blow broke it; another hero's
       shell, or a shell that held, nothing */
    const g = H(M, 1, 10, 3, 'healer'), a = H(M, 2, 12, 3, 'tank', { hp: 500, maxHp: 1000 }), q = H(M, 3, 11, 5, 'mage'), m = E(M, 10, 0, 13, 3, 2), n = E(M, 11, 0, 13, 4, 2);
    const inst = fight(M, [g, a, q, m, n]);
    g.reacts = [{ kind: 'react', id: 'breaker_test', on: 'shield_break', do: 'status', status: 'blunted' }];
    const sc = sc2(M, 76);
    a.shield = 30; a.shieldBy = 3;
    blowAt(M, inst, sc, m, a, 50); M.RX.drainReactions(inst, sc);
    if (stacksOf(m, 'blunted').length) return 'another hero\'s shell breaking Blunted its breaker';
    a.shield = 30; a.shieldBy = 1;
    blowAt(M, inst, sc, m, a, 10); M.RX.drainReactions(inst, sc);
    if (stacksOf(m, 'blunted').length) return 'a shell that held Blunted the monster';
    blowAt(M, inst, sc, n, a, 50); M.RX.drainReactions(inst, sc);
    if (stacksOf(n, 'blunted').length !== 1 || stacksOf(m, 'blunted').length || stacksOf(a, 'blunted').length) return 'the wearer\'s shell broken by the second monster: ' + JSON.stringify([m.statuses, n.statuses]) + ' (want the breaker Blunted, nobody else)';
    return null;
  },
  'lowest-sicken': (M) => {
    /* the piece #28 Vault Leech Ring carried in batch 4 (P6, a monster picked by its target; a planted row since lane/designer-sig-batch5
       reshaped the Ring to a heal on the lowest ally): a Poison rune spell Sickens the monster attacking the ally lowest on health, the
       nearest of those on it; the plain healer's cast Sickens only what it hit; with nobody on the lowest, nothing more */
    const play = (worn, onLow) => {
      const g = H(M, 1, 10, 3, 'healer', { mana: 2000, maxMana: 2000, maxHit: 60 }), a = H(M, 2, 11, 3, 'tank', { hp: 900, maxHp: 1000 }), b = H(M, 3, 9, 6, 'mage', { hp: 300, maxHp: 1000 });
      const m = E(M, 10, 0, 12, 3, 2, { hp: 90000, maxHp: 90000 }), n = E(M, 11, 0, 9, 7, onLow ? 3 : 2, { hp: 90000, maxHp: 90000 }), far = E(M, 12, 0, 9, 9, onLow ? 3 : 2, { hp: 90000, maxHp: 90000 });
      const inst = fight(M, [g, a, b, m, n, far]);
      inst.heroes = { 1: entry(M, ['green_sickness'], 8) };
      g.target = 10;
      if (worn) g.reacts = [{ kind: 'react', id: 'lowest_test', on: 'cast', family: 'poison', do: 'status', status: 'sickness', at: 'lowest' }];
      const sc = sc2(M, 77);
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      return { cast: sc.events.some((e) => e.type === 'cast' && e.ability === 'green_sickness'), sick: [m, n, far].map((x) => stacksOf(x, 'sickness').length).join() };
    };
    const w = play(true, true), p = play(false, true), none = play(true, false);
    if (!w.cast || !p.cast || p.sick !== '1,0,0') return 'CONTROL: the plain healer\'s Green Sickness Sickened ' + p.sick + ' (want its target only, 1,0,0)';
    if (w.sick !== '1,1,0') return 'the wearer\'s Green Sickness Sickened ' + w.sick + ' (want its target and the nearest monster on the lowest ally, 1,1,0)';
    if (none.sick !== '1,0,0') return 'with nobody on the lowest ally the wearer\'s cast Sickened ' + none.sick + ' (want 1,0,0)';
    return null;
  },
  'poison-heal-lowest': (M) => {
    /* #28 Vault Leech Ring (reshaped, lane/designer-sig-batch5: the Sickness on the monster attacking the lowest ally read 3.2 pace steps): a
       Poison rune spell heals the hurt ally lowest on health 60% of the damage the cast dealt, through the heal door; the plain healer's
       cast heals no one; with every ally full, nothing */
    const play = (worn, hurt) => {
      const g = H(M, 1, 10, 3, 'healer', { mana: 2000, maxMana: 2000, maxHit: 60 }), a = H(M, 2, 11, 3, 'tank', { hp: hurt ? 900 : 1000, maxHp: 1000 });
      const b = H(M, 3, 9, 6, 'mage', { hp: hurt ? 300 : 1000, maxHp: 1000 });
      const m = E(M, 10, 0, 12, 3, 2, { hp: 90000, maxHp: 90000 }), n = E(M, 11, 0, 12, 4, 2, { hp: 90000, maxHp: 90000 });
      const inst = fight(M, [g, a, b, m, n]);
      inst.heroes = { 1: entry(M, ['green_sickness'], 8) };
      g.target = 10;
      if (worn) wear(M, g, 'vault_leech_ring');
      const sc = sc2(M, 77);
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      const dealt = sc.events.filter((e) => e.type === 'dmg' && e.u === 1 && e.ability === 'green_sickness').reduce((x, e) => x + Math.max(0, Math.floor(Number(e.amount) || 0)), 0);
      const heals = sc.events.filter((e) => e.type === 'heal' && e.ability === 'vault_leech_ring');
      return { cast: sc.events.some((e) => e.type === 'cast' && e.ability === 'green_sickness'), dealt, heals, a: a.hp, b: b.hp };
    };
    const w = play(true, true), p = play(false, true), full = play(true, false);
    if (!w.cast || !p.cast || !(w.dealt > 0)) return 'CONTROL: the casts ' + JSON.stringify({ w: w.cast, p: p.cast, dealt: w.dealt });
    if (p.heals.length || p.b !== 300) return 'the plain healer\'s Green Sickness healed ' + JSON.stringify(p.heals);
    const want = Math.floor((w.dealt * 600) / 1000);
    if (w.heals.length !== 1 || w.heals[0].t !== 3 || w.b !== 300 + want || w.a !== 900) return 'the wearer\'s cast dealt ' + w.dealt + ' and healed ' + JSON.stringify(w.heals) + ' (mage ' + w.b + ', tank ' + w.a + '; want the mage, the lowest, +' + want + ')';
    if (full.heals.length) return 'with every ally full the cast healed ' + JSON.stringify(full.heals);
    return null;
  },
  'power-taunt': (M) => {
    /* the piece #33 Teamster's Mitts carried in batch 4 (P4, a one-monster taunt; a planted row since lane/signatures-batch-5 re-specced the
       Mitts as a Brace, power-braced): a Power Strike hit on a monster attacking an ally turns it on the wearer, held 4 s; another move's
       hit, a monster already on the wearer, or one a Challenge holds, nothing */
    const u = H(M, 1, 12, 3, 'melee_dps'), g = H(M, 2, 9, 6, 'healer'), k = H(M, 3, 14, 3, 'tank');
    const m = E(M, 10, 0, 13, 3, 2, { hp: 9000, maxHp: 9000 }), o = E(M, 11, 0, 13, 4, 2, { hp: 9000, maxHp: 9000 }), mine = E(M, 12, 0, 11, 3, 1, { hp: 9000, maxHp: 9000 });
    const held = E(M, 13, 0, 13, 2, 3, { hp: 9000, maxHp: 9000, holdMs: 3000 });
    const inst = fight(M, [u, g, k, m, o, mine, held]);
    u.reacts = [{ kind: 'react', id: 'taunt_test', on: 'hit', of: 'power_strike', do: 'taunt', ms: 4000 }];
    const sc = sc2(M, 78);
    blowAt(M, inst, sc, u, o, 10, 'turning_cut'); M.RX.drainReactions(inst, sc);
    if (o.target !== 2) return 'another move\'s hit turned its monster';
    blowAt(M, inst, sc, u, m, 10, 'power_strike'); M.RX.drainReactions(inst, sc);
    if (m.target !== 1 || m.holdMs !== 4000 || m.queued !== false) return 'a Power Strike on a monster attacking the healer: target ' + m.target + ', held ' + m.holdMs + ' (want the wearer, 4000)';
    if (!sc.events.some((e) => e.type === 'target' && e.u === 10 && e.t === 1)) return 'the turn said nothing';
    blowAt(M, inst, sc, u, mine, 10, 'power_strike'); M.RX.drainReactions(inst, sc);
    if (mine.holdMs) return 'a Power Strike on a monster already on the wearer held it';
    blowAt(M, inst, sc, u, held, 10, 'power_strike'); M.RX.drainReactions(inst, sc);
    if (held.target !== 3 || held.holdMs !== 3000) return 'a Power Strike took a monster a Challenge holds off the tank';
    return null;
  },
  'shot-save': (M) => {
    /* #41 Brood Bracers (P3, a saved shot): every third basic shot of an arrow that lands earns a credit (every fifth until
       lane/designer-sig-batch5), and the next shot that would take
       an arrow takes none and buys none; the count is kept on the cooldowns, across a settle cut (world-state encode and decode); a plain
       ranger takes an arrow a shot */
    const play = (worn) => {
      const r = H(M, 1, 10, 3, 'ranger', { acc: 600, maxHit: 6 }), m = E(M, 10, 0, 14, 3, 1, { hp: 900000, maxHp: 900000 });
      const w = world(M, [r, m], { phase: 'fight', risk: null });
      const inst = inst2(M, w);
      inst.heroes = { 1: Object.assign(entry(M, [], 7), { ammo: 'iron_arrows', hs: supplySession(M, { bag: { iron_arrows: { loaded: 40 } } }) }) };
      r.target = 10;
      if (worn) wear(M, r, 'brood_bracers');
      const sc = sc2(M, 79);
      const log = [];
      let kept = null;
      for (let i = 0; i < 24; i++) {
        at(inst, sc, i * 2000);
        r.swingLeftMs = 0;
        const n = sc.events.length, left = inst.heroes[1].hs.bag.iron_arrows.left;
        M.movement.occupancy(inst);
        M.damage.resolveAttacks(inst, sc);
        const evs = sc.events.slice(n);
        const shot = evs.some((e) => (e.type === 'dmg' || e.type === 'miss') && e.u === 1);
        log.push({ shot, landed: evs.some((e) => e.type === 'dmg' && e.u === 1), took: left - inst.heroes[1].hs.bag.iron_arrows.left });
        /* (a settle cut at the first credit: the stored world keeps the count) */
        if (worn && kept === null && (r.cds || {})['~n:brood_bracers'] === 3) kept = M.worldstate.decode(M.worldstate.encode(w)).units.find((x) => x.id === 1).cds['~n:brood_bracers'];
      }
      return { log, kept };
    };
    const w = play(true), p = play(false);
    if (!p.log.every((x) => x.shot && x.took === 1)) return 'CONTROL: the plain ranger\'s shots ' + JSON.stringify(p.log);
    const hit = p.log.filter((x) => x.landed).length;
    if (hit < 10 || hit === 24) return 'CONTROL: ' + hit + ' of 24 shots landed (want some to land and some to miss)';
    /* the rule played out shot by shot: a credit after three landed, spent by the next shot */
    let c = 0, free = 0;
    for (const [i, x] of w.log.entries()) {
      const want = c >= 3 ? 0 : 1;
      if (want === 0) { c = 0; free++; }
      if (x.landed && c < 3) c++;
      if (x.took !== want) return 'shot ' + (i + 1) + ' took ' + x.took + ' arrows (want ' + want + ': the count stood at ' + (want ? c - (x.landed ? 1 : 0) : 3) + ')';
    }
    if (free < 3) return 'CONTROL: ' + free + ' saved shots in 24';
    if (w.kept !== 3) return 'the stored world kept the count at ' + w.kept + ' (want the credit, 3)';
    return null;
  },
  'cast-every-free': (M) => {
    /* #32 Ledger Ring (P2, a cast's cost, `every`): every fourth spell the wearer casts pays no mana (every fifth until
       lane/designer-sig-batch5), even on an empty pool; the others pay as written; a plain mage pays every one and casts nothing on an
       empty pool */
    const play = (worn) => {
      const u = H(M, 1, 10, 3, 'mage', { mana: 9000, maxMana: 9000, maxHit: 60 }), m = E(M, 10, 0, 14, 3, 1, { hp: 9000000, maxHp: 9000000 });
      const inst = fight(M, [u, m]);
      inst.heroes = { 1: entry(M, ['frost_lance'], 8) };
      u.target = 10;
      if (worn) wear(M, u, 'ledger_ring');
      const sc = sc2(M, 80);
      for (let i = 0; i < 12; i++) {
        u.cds = Object.fromEntries(Object.entries(u.cds || {}).filter(([k]) => k.startsWith('~'))); u.lanes = {};
        if (i === 11) u.mana = 0;
        M.abilities.castAbilities(inst, sc);
      }
      return sc.events.filter((e) => e.type === 'cast' && e.ability === 'frost_lance').map((e) => e.mana);
    };
    const w = play(true), p = play(false);
    if (p.length !== 11 || !p.every((x) => x > 0)) return 'CONTROL: the plain mage\'s casts cost ' + JSON.stringify(p) + ' (want eleven paid, none on the empty pool)';
    if (w.length !== 12 || w.map((x, i) => (i === 3 || i === 7 || i === 11 ? x === 0 : x === p[0])).some((ok) => !ok)) return 'the wearer\'s twelve casts cost ' + JSON.stringify(w) + ' (want every fourth free, the twelfth on an empty pool)';
    return null;
  },
  'heal-window': (M) => {
    /* #37 Lychgate Leggings (P2, a window): a heal begun under half mana opens 5 s of heals that cost no mana, once a 40 s clock (30% and
       90 s until lane/designer-sig-batch5); a heal
       outside the window pays, under the line inside the clock too */
    const g = H(M, 1, 10, 3, 'healer', { mana: 100, maxMana: 2000, maxHit: 60 }), a = H(M, 2, 11, 3, 'tank', { hp: 100, maxHp: 5000 }), m = E(M, 10, 0, 13, 3, 2);
    const inst = fight(M, [g, a, m]);
    inst.heroes = { 1: entry(M, ['greater_mend'], 8) };
    wear(M, g, 'lychgate_leggings');
    const sc = sc2(M, 81);
    const cast = (ms, mana) => {
      at(inst, sc, ms); g.mana = mana; a.hp = 100; g.lanes = {};
      g.cds = Object.fromEntries(Object.entries(g.cds || {}).filter(([k]) => k.startsWith('~')));
      const n = sc.events.length;
      M.abilities.castAbilities(inst, sc);
      const e = sc.events.slice(n).find((x) => x.type === 'cast' && x.ability === 'greater_mend');
      return e ? e.mana : null;
    };
    const got = [cast(1000, 800), cast(3000, 1500), cast(6100, 1500), cast(7000, 800), cast(41000, 800)];
    if (got.some((x) => x === null)) return 'CONTROL: a heal did not cast: ' + JSON.stringify(got);
    if (got[0] !== 0 || got[1] !== 0) return 'the heal at 40% mana and the one 2 s later cost ' + got.slice(0, 2) + ' (want 0, 0)';
    if (!(got[2] > 0)) return 'a heal after the 5 s window cost ' + got[2];
    if (!(got[3] > 0)) return 'a heal under the line inside the 40 s clock cost ' + got[3] + ' (want its mana)';
    if (got[4] !== 0) return 'a heal under the line after the clock cost ' + got[4] + ' (want 0)';
    return null;
  },
  'spell-health': (M) => {
    /* #44 Pyre Priest's Hood (P2, health for mana): over 70% health a spell pays its mana in health, 1 a mana, even on an empty pool; under
       the line, or a cast that would leave the hero under 1 HP, pays its mana */
    const play = (worn, hp, maxHp, mana) => {
      const u = H(M, 1, 10, 3, 'mage', { hp, maxHp, mana, maxMana: 9000, maxHit: 60 }), m = E(M, 10, 0, 14, 3, 1, { hp: 9000000, maxHp: 9000000 });
      const inst = fight(M, [u, m]);
      inst.heroes = { 1: entry(M, ['frost_lance'], 8) };
      u.target = 10;
      if (worn) wear(M, u, 'pyre_priests_hood');
      const sc = sc2(M, 82);
      M.abilities.castAbilities(inst, sc);
      const e = sc.events.find((x) => x.type === 'cast' && x.ability === 'frost_lance');
      return { e, hp: u.hp, mana: u.mana };
    };
    const full = play(true, 1000, 1000, 500), low = play(true, 600, 1000, 500), thin = play(true, 20, 20, 500), dry = play(true, 1000, 1000, 0), plain = play(false, 1000, 1000, 500), plainDry = play(false, 1000, 1000, 0);
    const cost = plain.e && plain.e.mana;
    if (!(cost > 0) || plainDry.e) return 'CONTROL: the plain mage\'s cast ' + JSON.stringify([plain.e, plainDry.e]);
    if (!full.e || full.e.mana !== 0 || full.e.paidHp !== cost || full.hp !== 1000 - cost || full.mana < 500) return 'a spell at full health: ' + JSON.stringify(full) + ' (want ' + cost + ' health paid, no mana)';
    if (!low.e || low.e.mana !== cost || low.e.paidHp || low.hp !== 600) return 'a spell at 60%: ' + JSON.stringify(low) + ' (want its mana, ' + cost + ')';
    if (!thin.e || thin.e.mana !== cost || thin.hp !== 20) return 'a spell that would leave its caster under 1 HP: ' + JSON.stringify(thin) + ' (want its mana)';
    if (!dry.e || dry.e.paidHp !== cost) return 'a spell on an empty pool at full health: ' + JSON.stringify(dry) + ' (want it cast for health)';
    return null;
  },
  'aura-guard': (M) => {
    /* #35 Gatekeeper's Plate (P1, an aura; CUT to 4%, lane/signatures-batch-4: 8% read 22.0 pace steps, over the band): the wearer and every
       ally within 2 tiles take 4% less, added to Guarded under its key's 30% cap;
       an ally 3 tiles off, or anyone once the wearer has fallen, none; the cut lands on a monster's blow */
    const play = (worn) => {
      const k = H(M, 1, 12, 3, 'tank', { hp: 50000, maxHp: 50000 }), a = H(M, 2, 14, 4, 'mage', { hp: 50000, maxHp: 50000 }), far = H(M, 3, 15, 6, 'healer', { hp: 50000, maxHp: 50000 });
      const m = E(M, 10, 0, 13, 3, 1);
      const inst = fight(M, [k, a, far, m], { risk: null });
      if (worn) wear(M, k, 'gatekeepers_plate');
      const eff = (h) => M.SE.effectPm(h, 'takenPm', M.SA.auraEffects(inst, h, 'takenPm'));
      const sc = sc2(M, 83);
      const took = [k, a, far].map((h) => M.damage.landHit(inst, sc, m, h, 1000, null, { id: 't' }, false).dmg);
      return { k, a, far, eff, took };
    };
    const w = play(true), p = play(false);
    if (w.eff(w.k) !== -40 || w.eff(w.a) !== -40 || w.eff(w.far) !== 0) return 'the Plate\'s cut on the wearer, an ally 2 tiles off and one 3 off: ' + [w.eff(w.k), w.eff(w.a), w.eff(w.far)] + ' (want -40, -40, 0)';
    if (p.took.some((n) => !(n >= 500)) || w.took[2] !== p.took[2]) return 'CONTROL: the blows landed ' + JSON.stringify([w.took, p.took]);
    for (const i of [0, 1]) if (Math.abs(w.took[i] - Math.floor((p.took[i] * 960) / 1000)) > 1) return 'a blow under the Plate landed ' + w.took[i] + ' where the plain one landed ' + p.took[i] + ' (want 4% less)';
    w.a.statuses = [{ s: 'guarded', src: 9, left: 4000, next: 0, scale: 1000, pw: 2800 }];
    if (w.eff(w.a) !== -300) return 'the Plate beside a Guarded -28% reads ' + w.eff(w.a) + ' (want the key\'s cap, -300)';
    w.k.alive = false;
    if (w.eff(w.a) !== -280) return 'the Plate held on after its wearer fell: ' + w.eff(w.a);
    return null;
  },
  'aura-regen': (M) => {
    /* #34 Sergeant's Sash (P1, a mana channel): the wearer and every ally within 8 tiles regenerate 20% more mana; one 15 tiles off as plain */
    const g = H(M, 1, 10, 3, 'healer', { mana: 0, maxMana: 10000 }), a = H(M, 2, 14, 7, 'mage', { mana: 0, maxMana: 10000 }), far = H(M, 3, 25, 3, 'ranger', { mana: 0, maxMana: 10000 });
    const inst = fight(M, [g, a, far]);
    wear(M, g, 'sergeants_sash');
    const sc = sc2(M, 84);
    for (let i = 0; i < 600; i++) { at(inst, sc, i * 100); M.abilities.castAbilities(inst, sc); }
    if (!(far.mana > 100)) return 'CONTROL: a minute of regen gave ' + far.mana;
    /* (each sub-step's milli-mana floored apart: within 3 of 1.2 times) */
    for (const h of [g, a]) if (Math.abs(h.mana - Math.floor((far.mana * 1200) / 1000)) > 3) return 'hero ' + h.id + ' under the Sash regenerated ' + h.mana + ' where the hero out of reach did ' + far.mana + ' (want 20% more)';
    return null;
  },
  'pair-heal-guard': (M) => {
    /* #45 Convoy Bell and #46 Lead Rein (P1, the pair, `with`): with the Rein in the party, the Bell's heals on its wearer below half land
       30% more, and with the Bell in the party, the Rein's wearer below half takes 7.5% less; neither alone, nor over the line */
    const play = (bell, rein) => {
      const g = H(M, 1, 10, 3, 'healer'), k = H(M, 2, 12, 3, 'tank', { hp: 400, maxHp: 1000 }), o = H(M, 3, 11, 5, 'mage', { hp: 400, maxHp: 1000 }), m = E(M, 10, 0, 13, 3, 2);
      const inst = fight(M, [g, k, o, m]);
      if (bell) wear(M, g, 'convoy_bell');
      if (rein) wear(M, k, 'lead_rein');
      const sc = sc2(M, 85);
      const heal = (t, hp) => { t.hp = hp; M.HR.landHeal(g, t, 100, sc, false, M.AD.ABILITIES.greater_mend, false, { inst, fx: null }); const got = t.hp - hp; t.hp = hp; return got; };
      const cut = (t, hp) => { t.hp = hp; const v = M.SE.effectPm(t, 'takenPm', M.SA.auraEffects(inst, t, 'takenPm')); t.hp = 400; return v; };
      return [heal(k, 400), heal(o, 400), heal(k, 600), cut(k, 400), cut(k, 600), cut(o, 400)].join();
    };
    const both = play(true, true), bell = play(true, false), rein = play(false, true);
    /* (the Rein CUT to 7.5%, lane/signatures-batch-4: its own half read 19.0 pace steps at 15%) */
    if (both !== '130,100,100,-75,0,0') return 'the pair: heals on the Rein below half, on another, on the Rein over half, then its cut below and over half and another\'s: ' + both + ' (want 130,100,100,-75,0,0)';
    if (bell !== '100,100,100,0,0,0') return 'the Bell with no Rein in the party: ' + bell;
    if (rein !== '100,100,100,0,0,0') return 'the Rein with no Bell in the party: ' + rein;
    return null;
  },
  'fall-save': (M) => {
    /* #40 Hearth Mason's Cloak (P7, a fall-back save): a blow that would kill a hero of the wearer's party leaves it at 1 HP, its `dmg` event
       naming the wearer, once every 75 minutes on the wearer's clock (an hour until lane/designer-sig-batch5); inside it the next such blow
       kills, an hour on too; after it the wearer itself is saved.
       On the scale, in a fight, the save breaks the pull off at once on any stance (Bold breaks off on nothing else) */
    const play = (worn) => {
      const g = H(M, 1, 10, 3, 'healer', { hp: 50, maxHp: 1000 }), a = H(M, 2, 12, 3, 'tank', { hp: 100, maxHp: 1000 }), c = H(M, 3, 11, 4, 'mage', { hp: 100, maxHp: 1000 }), m = E(M, 10, 0, 13, 3, 2);
      const inst = fight(M, [g, a, c, m], { risk: null });
      if (worn) wear(M, g, 'hearth_masons_cloak');
      const sc = sc2(M, 86, 1000);
      blowAt(M, inst, sc, m, a, 500);
      const first = { hp: a.hp, alive: a.alive, ev: sc.events.find((e) => e.type === 'dmg' && e.t === 2) };
      return { g, a, c, m, inst, sc, first };
    };
    const w = play(true), p = play(false);
    if (p.first.alive !== false) return 'CONTROL: the plain blow left the tank ' + JSON.stringify(p.first);
    if (w.first.hp !== 1 || w.first.alive !== true || !w.first.ev || w.first.ev.saved !== 1 || w.first.ev.amount !== 99 || w.first.ev.hp !== 1) return 'the saved blow: ' + JSON.stringify(w.first) + ' (want the tank at 1 HP, its dmg 99 naming the wearer)';
    if (w.g.cds['~r:hearth_masons_cloak'] !== 1000 + 4500000) return 'the Cloak\'s clock reads ' + JSON.stringify(w.g.cds);
    w.sc.atMs = 1000 + 600000;
    blowAt(M, w.inst, w.sc, w.m, w.a, 500);
    if (w.a.alive !== false) return 'a second would-be death inside the clock was saved too';
    w.sc.atMs = 1000 + 3600000;
    blowAt(M, w.inst, w.sc, w.m, w.c, 500);
    if (w.c.alive !== false) return 'a would-be death an hour on, inside the 75 minutes, was saved';
    w.sc.atMs = 1000 + 4500000;
    blowAt(M, w.inst, w.sc, w.m, w.g, 500);
    if (w.g.alive !== true || w.g.hp !== 1) return 'the wearer\'s own would-be death after the 75 minutes: ' + JSON.stringify({ hp: w.g.hp, alive: w.g.alive });
    /* ON THE SCALE: a Bold pull in a fight breaks off at the save (the step falls, the pack goes home) */
    /* (a max health over 1,000, so 1 HP is under a permille: the margin reads it as a hero standing, never a death) */
    const k = H(M, 1, 12, 3, 'tank', { hp: 100, maxHp: 5000 }), b = E(M, 10, 0, 13, 3, 1);
    const wb = world(M, [k, b], { phase: 'fight', risk: 'bold', danger: 100, low: 1000, climb: 1, clean: 0, cool: 0 });
    wb.packs[0].aggro = true;
    const ib = inst2(M, wb);
    wear(M, k, 'hearth_masons_cloak');
    const sb = sc2(M, 87, 1000);
    blowAt(M, ib, sb, b, k, 500);
    if (k.hp !== 1 || wb.phase !== 'regroup' || wb.packs[0].aggro !== false) return 'a Bold save: the hero at ' + k.hp + ', the phase ' + wb.phase + ', the pack aggro ' + wb.packs[0].aggro + ' (want 1 HP, a regroup, the pack home)';
    const dz = sb.events.find((e) => e.type === 'danger');
    if (!dz || dz.why !== 'fall') return 'the Bold save\'s pull ended ' + JSON.stringify(dz) + ' (want a fall back, never a death)';
    return null;
  },
  /* ── BATCH 5 (lane/signatures-batch-5, 2026-11-28; one case a row, each engine piece with its mutant) ── */
  'magic-xp-written': (M) => {
    /* ITEM 1 (15 "Batch 4's calls": a Signature changes what a cast costs, never what it trains): a cast its worn Signature paid another way
       carries the plain cast's mana as its Magic XP basis (`xpMana`), and the settle's reward credits Magic XP on it, the plain hero's for
       that cast: the Ledger Ring's free fourth spell, the Hood's spell paid in health, a Leggings heal in its window; a cast paid as written
       carries none; a spell's own mana back still comes off it, as the plain cast's does */
    const magicOf = (inst, events) => {
      let got = 0;
      M.REW.rewardSwing(new Map([[1, { fx: { addXp: (skill, n) => { if (skill === 'magic') got += n; } } }]]), events.filter((e) => e.type === 'cast'), inst.world, {});
      return got;
    };
    const ledger = (worn) => {
      const u = H(M, 1, 10, 3, 'mage', { mana: 9000, maxMana: 9000, maxHit: 60 }), m = E(M, 10, 0, 14, 3, 1, { hp: 9000000, maxHp: 9000000 });
      const inst = fight(M, [u, m]);
      inst.heroes = { 1: entry(M, ['frost_lance'], 8) };
      u.target = 10;
      if (worn) wear(M, u, 'ledger_ring');
      const sc = sc2(M, 96);
      for (let i = 0; i < 8; i++) { u.cds = Object.fromEntries(Object.entries(u.cds || {}).filter(([k]) => k.startsWith('~'))); u.lanes = {}; M.abilities.castAbilities(inst, sc); }
      const casts = sc.events.filter((e) => e.type === 'cast' && e.ability === 'frost_lance');
      return { casts, xp: magicOf(inst, sc.events) };
    };
    const lw = ledger(true), lp = ledger(false);
    if (lp.casts.length !== 8 || !(lp.casts[0].mana > 0) || lp.casts.some((e) => e.xpMana !== undefined) || !(lp.xp > 0)) return 'CONTROL: the plain mage\'s casts ' + JSON.stringify(lp.casts.map((e) => [e.mana, e.xpMana]));
    if (lw.casts[3].mana !== 0 || lw.casts[3].xpMana !== lp.casts[3].mana || lw.casts[0].xpMana !== undefined) return 'the Ledger\'s casts paid and trained ' + JSON.stringify(lw.casts.map((e) => [e.mana, e.xpMana])) + ' (want the free fourth training on ' + lp.casts[3].mana + ', the paid ones carrying no basis)';
    if (lw.xp !== lp.xp) return 'eight Frost Lances under the Ledger credited ' + lw.xp + ' Magic XP, the plain mage\'s eight ' + lp.xp;
    /* the Hood: a spell paid in health trains on its mana as written */
    const hood = (worn) => {
      const u = H(M, 1, 10, 3, 'mage', { hp: 1000, maxHp: 1000, mana: 500, maxMana: 9000, maxHit: 60 }), m = E(M, 10, 0, 14, 3, 1, { hp: 9000000, maxHp: 9000000 });
      const inst = fight(M, [u, m]);
      inst.heroes = { 1: entry(M, ['frost_lance'], 8) };
      u.target = 10;
      if (worn) wear(M, u, 'pyre_priests_hood');
      const sc = sc2(M, 97);
      M.abilities.castAbilities(inst, sc);
      return { e: sc.events.find((x) => x.type === 'cast'), xp: magicOf(inst, sc.events) };
    };
    const hw = hood(true), hp = hood(false);
    if (!hw.e || !(hw.e.paidHp > 0) || hw.e.mana !== 0 || hw.e.xpMana !== hp.e.mana || hw.xp !== hp.xp || !(hp.xp > 0)) return 'a spell the Hood paid in health: ' + JSON.stringify([hw, hp]) + ' (want it to train as the plain one)';
    /* the Leggings: a heal in its window */
    const legs = (worn) => {
      const g = H(M, 1, 10, 3, 'healer', { mana: 100, maxMana: 2000, maxHit: 60 }), a = H(M, 2, 11, 3, 'tank', { hp: 100, maxHp: 5000 }), m = E(M, 10, 0, 13, 3, 2);
      const inst = fight(M, [g, a, m]);
      inst.heroes = { 1: entry(M, ['greater_mend'], 8) };
      if (worn) wear(M, g, 'lychgate_leggings');
      const sc = sc2(M, 98);
      M.abilities.castAbilities(inst, sc);
      return { e: sc.events.find((x) => x.type === 'cast'), xp: magicOf(inst, sc.events) };
    };
    const gw = legs(true), gp = legs(false);
    if (!gw.e || gw.e.mana !== 0 || gw.e.xpMana !== gp.e.mana || gw.xp !== gp.xp || !(gp.xp > 0)) return 'a heal in the Leggings\' window: ' + JSON.stringify([gw, gp]) + ' (want it to train as the plain one)';
    /* a spell that gives mana back (a Storm spell's manaPerHit, a planted row: no Storm spell is live): the plain cast trains on what it
       kept, and the same cast paid in health trains on that too, never on its whole written mana */
    const storm = (worn) => {
      const u = H(M, 1, 10, 3, 'mage', { hp: 1000, maxHp: 1000, mana: 500, maxMana: 9000, maxHit: 60 }), m = E(M, 10, 0, 14, 3, 1, { hp: 9000000, maxHp: 9000000 });
      const inst = fight(M, [u, m]);
      inst.heroes = { 1: entry(M, [], 8) };
      if (worn) wear(M, u, 'pyre_priests_hood');
      const sc = sc2(M, 99);
      const row = Object.assign({}, M.AD.ABILITIES.frost_lance, { manaPerHit: 3 });
      M.abilities.fire(inst, u, { row, target: m, lines: [], version: 1, mana: 20, pm: 1000 }, sc);
      return sc.events.find((x) => x.type === 'cast');
    };
    const sw = storm(true), sp = storm(false);
    if (!sp || sp.mana !== 17 || sp.back !== 3) return 'CONTROL: the plain Storm cast ' + JSON.stringify(sp);
    if (!sw || sw.paidHp !== 20 || sw.mana !== 0 || sw.xpMana !== 17) return 'the Hood\'s Storm cast trains on ' + JSON.stringify(sw) + ' (want 20 less its mana back, 17)';
    return null;
  },
  'interrupt-shield': (M) => {
    /* #8 Stable Troll's Maul (the `interrupt` moment): a Stagger that ends its target's wind-up shields the wearer 10% of its max health for
       each wind-up it ended; a Stagger at a target winding up nothing, or a plain hammer's, shields nothing; a moment of two (Wide Stagger's
       ring) 20%, under the one shield rule */
    const windup = () => ({ s: 'heavy_blow', ms: 1600, left: 900, kind: 'cone', x: 13, y: 3, dx: -1, dy: 0, r: 0, len: 2 });
    const play = (worn, winding) => {
      const u = H(M, 1, 12, 3, 'melee_dps', { hp: 1000, maxHp: 1000, mana: 900, maxMana: 900, maxHit: 40 }), m = E(M, 10, 0, 13, 3, 1, { hp: 90000, maxHp: 90000 });
      const inst = fight(M, [u, m]);
      inst.heroes = { 1: entry(M, ['stagger'], 1) };
      u.target = 10;
      if (winding) m.cast = windup();
      if (worn) wear(M, u, 'stable_trolls_maul');
      const sc = sc2(M, 100);
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      return { cast: sc.events.some((e) => e.type === 'cast' && e.ability === 'stagger'), ended: sc.events.some((e) => e.type === 'spell_end' && e.why === 'interrupted'), shield: u.shield || 0 };
    };
    const w = play(true, true), p = play(false, true), none = play(true, false);
    if (!w.cast || !p.cast || !none.cast || !w.ended || !p.ended || none.ended) return 'CONTROL: the Staggers ' + JSON.stringify([w, p, none]);
    if (w.shield !== 100) return 'a Stagger that ended a wind-up shielded the wearer ' + w.shield + ' (want 10% of 1000)';
    if (p.shield || none.shield) return 'a plain hammer\'s Stagger, or one that ended nothing, shielded ' + JSON.stringify([p.shield, none.shield]);
    const u = H(M, 1, 12, 3, 'melee_dps', { hp: 1000, maxHp: 1000 }), inst = fight(M, [u]);
    wear(M, u, 'stable_trolls_maul');
    const sc = sc2(M, 101);
    M.RQ.queueOn(inst, u, 'interrupt', { ability: 'stagger', n: 2 }); M.RX.drainReactions(inst, sc);
    if (u.shield !== 200) return 'two wind-ups ended shielded ' + u.shield + ' (want 20%)';
    return null;
  },
  'guard-parry': (M) => {
    /* Ledgehide Breeches (a cast on the `windup` moment, `within`, castNow's `foe`): a monster beside the sword that begins a wind-up at an
       ally within 1 tile is Parried at once by the wearer (the Parry on its bar, its cooldown and mana as written, no lane waited on); a plain
       sword's Parry on its own rule waits (that monster is not its target); a wind-up at an ally 2 tiles off, or by a monster out of the
       sword's reach, nothing (never a Parry at another monster instead) */
    const T = M.MSD.MONSTER_SPELLS, was = M.MSD.SPELL_SWITCH.live, span = M.MSD.SPELL_STAGGER.spanPm, had = Object.prototype.hasOwnProperty.call(M.MONSTERS.rat, 'spells'), list = M.MONSTERS.rat.spells;
    T.zz_heavy = { n: 'Heavy Blow', shape: 'ring', r: 1, range: 1, windupMs: 1600, cdMs: 20000, hitPm: 2000, element: null };
    M.MSD.SPELL_SWITCH.live = true; M.MSD.SPELL_STAGGER.spanPm = 0; M.MONSTERS.rat.spells = ['zz_heavy'];
    try {
      const play = (worn, o) => {
        const u = H(M, 1, 12, 3, 'melee_dps', { hp: 1000, maxHp: 1000, mana: 900, maxMana: 900 }), a = H(M, 2, o.ax || 13, 4, 'mage', { hp: 1000, maxHp: 1000 });
        /* (its own target casts nothing: a Cairn Wight) */
        const own = E(M, 10, 0, 11, 3, 1, { kind: 'cairn_wight', hp: 90000, maxHp: 90000 }), m = E(M, 11, 0, o.mx || 13, 3, 2, { hp: 90000, maxHp: 90000 });
        const inst = fight(M, [u, a, own, m], { risk: null });
        const slots = [{ action: { type: 'ability', id: 'parry' }, conditions: M.AD.suggestedTrigger(M.AD.ABILITIES.parry), join: 'and' }];
        inst.heroes = { 1: { hs: supplySession(M, { runes: true }), actionSet: 'hunt', range: 1, slots: M.conditions.heroSlots(slots, null) } };
        u.target = 10;
        if (worn) wear(M, u, 'ledgehide_breeches');
        M.movement.occupancy(inst);
        const sc = sc2(M, 102);
        at(inst, sc, 0); M.MSP.castSpells(inst, sc); M.RX.drainReactions(inst, sc); M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
        const c = sc.events.find((e) => e.type === 'cast' && e.ability === 'parry');
        return { winds: sc.events.some((e) => e.type === 'spell' && e.u === 11 && e.t === 2), t: c ? c.t : null, parried: stacksOf(m, 'parried').length };
      };
      if (M.AD.suggestedTrigger(M.AD.ABILITIES.parry)[0].metric !== 'target_winding_up') return 'CONTROL: Parry\'s own rule';
      const got = { worn: play(true, {}), plain: play(false, {}), far: play(true, { ax: 14 }), off: play(true, { mx: 14 }) };
      if (!Object.values(got).every((g) => g.winds)) return 'CONTROL: the wind-ups ' + JSON.stringify(got);
      if (got.worn.t !== 11 || got.worn.parried !== 1 || got.plain.t !== null) return 'a monster beside the sword winding up at the mage beside it: the Breeches\' Parry on ' + got.worn.t + ', a plain sword\'s on ' + got.plain.t + ' (want 11, none)';
      if (got.far.t !== null || got.off.t !== null) return 'a wind-up at an ally 2 tiles off, or by a monster out of reach, was answered: ' + JSON.stringify(got);
    } finally {
      delete T.zz_heavy; M.MSD.SPELL_SWITCH.live = was; M.MSD.SPELL_STAGGER.spanPm = span;
      if (had) M.MONSTERS.rat.spells = list; else delete M.MONSTERS.rat.spells;
    }
    return null;
  },
  'gash-whetted': (M) => {
    /* Troll Picker's Hooks (`min` and Whetted): a Gash that Bleeds 3 monsters Whets the wearer, and its next Rend casts 40% stronger and
       spends it; a Gash that Bleeds 2 Whets nothing; a plain axe's Gash nothing */
    const play = (worn, n) => {
      const u = H(M, 1, 12, 3, 'melee_dps', { hp: 1000, maxHp: 1000, mana: 900, maxMana: 900, maxHit: 40 });
      const ring = [[13, 3], [11, 3], [12, 4], [12, 2]].slice(0, n).map(([x, y], i) => E(M, 10 + i, 0, x, y, 1, { hp: 90000, maxHp: 90000 }));
      const inst = fight(M, [u, ...ring]);
      inst.heroes = { 1: entry(M, ['gash'], 1) };
      u.target = 10;
      if (worn) wear(M, u, 'troll_pickers_hooks');
      const sc = sc2(M, 103);
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      const whetted = stacksOf(u, 'whetted').length;
      inst.heroes = { 1: entry(M, ['rend'], 1) }; u.cds = {}; u.lanes = {};
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      const rend = sc.events.filter((e) => e.type === 'cast' && e.ability === 'rend');
      return { gash: sc.events.some((e) => e.type === 'cast' && e.ability === 'gash'), whetted, power: rend.map((e) => e.power), spent: stacksOf(u, 'whetted').length };
    };
    const w3 = play(true, 3), w2 = play(true, 2), p3 = play(false, 3);
    if (!w3.gash || !w2.gash || !p3.gash || w3.power.length !== 1 || p3.power.length !== 1) return 'CONTROL: the casts ' + JSON.stringify([w3, w2, p3]);
    if (w3.whetted !== 1 || w2.whetted || p3.whetted) return 'Whetted after a Gash of 3, a Gash of 2 and a plain Gash of 3: ' + [w3.whetted, w2.whetted, p3.whetted] + ' (want 1, 0, 0)';
    if (w3.power[0] !== Math.floor((p3.power[0] * 1400) / 1000)) return 'the next Rend cast at ' + w3.power[0] + ' (want 40% over ' + p3.power[0] + ')';
    if (w3.spent) return 'Whetted was not spent on the Rend';
    return null;
  },
  'power-braced': (M) => {
    /* #33 Teamster's Mitts (re-specced: Braced, a hero-side Blunted): a Power Strike cast Braces its caster; the next blow at it lands at
       half and spends it, a tick spends nothing, the blow after lands whole; a plain sword's Power Strike, or another move, Braces nothing */
    const play = (worn, move) => {
      const u = H(M, 1, 12, 3, 'melee_dps', { hp: 50000, maxHp: 50000, mana: 900, maxMana: 900, maxHit: 40 }), m = E(M, 10, 0, 13, 3, 1, { hp: 90000, maxHp: 90000 });
      const inst = fight(M, [u, m], { risk: null });
      inst.heroes = { 1: entry(M, [move], 1) };
      u.target = 10;
      if (worn) wear(M, u, 'teamsters_mitts');
      const sc = sc2(M, 104);
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      const braced = stacksOf(u, 'braced').length;
      M.damage.landHit(inst, sc, m, u, 100, null, { id: 'bleed', dot: true }, false);
      const ticked = stacksOf(u, 'braced').length;
      const blow = () => M.damage.landHit(inst, sc, m, u, 1000, null, { id: 't' }, false).dmg;
      return { cast: sc.events.some((e) => e.type === 'cast' && e.ability === move), braced, ticked, first: blow(), second: blow(), left: stacksOf(u, 'braced').length };
    };
    const w = play(true, 'power_strike'), p = play(false, 'power_strike'), o = play(true, 'turning_cut');
    if (!w.cast || !p.cast || !(p.first >= 500) || p.first !== p.second) return 'CONTROL: ' + JSON.stringify([w, p]);
    if (w.braced !== 1 || p.braced || o.braced) return 'Braced after a Power Strike, a plain one and a Turning Cut: ' + [w.braced, p.braced, o.braced] + ' (want 1, 0, 0)';
    if (w.ticked !== 1) return 'a tick spent the Brace';
    if (Math.abs(w.first - Math.floor(p.first / 2)) > 1 || w.second !== p.second || w.left) return 'the blows at the Braced hero landed ' + [w.first, w.second] + ' where the plain hero took ' + [p.first, p.second] + ' (want the first at half, the Brace spent, the second whole)';
    return null;
  },
  'earth-shell-raise': (M) => {
    /* #26 Thrower's Ring (re-specced: a standing raise): the wearer's Earth rune shells land 30% more (Protective Ward); its Water heals, and
       an Earth rune strike (Stagger, on a hammer wearing the ring), land as written */
    const play = (worn, move, role) => {
      const u = H(M, 1, 10, 3, role, { mana: 9000, maxMana: 9000, maxHit: 60, hp: 1000, maxHp: 1000 }), a = H(M, 2, 11, 3, 'tank', { hp: 500, maxHp: 50000 });
      const m = E(M, 10, 0, 11, 4, 2, { hp: 90000, maxHp: 90000 });
      const inst = fight(M, [u, a, m]);
      inst.heroes = { 1: entry(M, [move], role === 'melee_dps' ? 1 : 8) };
      u.target = 10;
      if (worn) wear(M, u, 'throwers_ring');
      const sc = sc2(M, 105);
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      const c = sc.events.find((e) => e.type === 'cast' && e.ability === move);
      return { power: c ? c.power : null, shield: a.shield || 0, hp: a.hp };
    };
    const fam = (id) => M.ITEMS[M.AD.ABILITIES[id].rune].family;
    if (fam('protective_ward') !== 'earth' || fam('stagger') !== 'earth' || fam('greater_mend') !== 'water') return 'CONTROL: the rune families';
    const [wW, wP, hW, hP, sW, sP] = [play(true, 'protective_ward', 'healer'), play(false, 'protective_ward', 'healer'), play(true, 'greater_mend', 'healer'),
      play(false, 'greater_mend', 'healer'), play(true, 'stagger', 'melee_dps'), play(false, 'stagger', 'melee_dps')];
    if (!(wP.shield > 0) || !(hP.hp > 500) || !(sP.power > 0)) return 'CONTROL: ' + JSON.stringify([wP, hP, sP]);
    if (wW.power !== Math.floor((wP.power * 1300) / 1000) || !(wW.shield > wP.shield)) return 'the Ring\'s Protective Ward cast at ' + wW.power + ' for a shell of ' + wW.shield + ' (want 30% over ' + wP.power + ', more than ' + wP.shield + ')';
    if (hW.power !== hP.power || hW.hp !== hP.hp) return 'a Water heal under the Ring: ' + JSON.stringify([hW, hP]);
    if (sW.power !== sP.power) return 'an Earth rune strike under the Ring cast at ' + sW.power + ' (want ' + sP.power + ': shells only)';
    /* (every shell today spends an Earth rune, so the family is read on a planted shell of another: a Water rune ward) */
    const u = H(M, 1, 10, 3, 'healer');
    wear(M, u, 'throwers_ring');
    const ward = M.AD.ABILITIES.protective_ward;
    if (M.SCA.castRaiseOf(u, ward) !== 300 || M.SCA.castRaiseOf(u, Object.assign({}, ward, { rune: M.AD.ABILITIES.greater_mend.rune })) !== 0) return 'the Ring raises an Earth ward by ' + M.SCA.castRaiseOf(u, ward) + ' and a Water one by ' + M.SCA.castRaiseOf(u, Object.assign({}, ward, { rune: M.AD.ABILITIES.greater_mend.rune })) + ' (want 300, 0)';
    return null;
  },
  'windup-blunt': (M) => {
    /* #42 Night Carter's Boots (re-specced, the `windup` moment): a monster that begins a wind-up at an ally below half health is Blunted
       as it begins, so that blow, its landing, lands at half and spends it; a wind-up at an ally over the line, or at the wearer itself,
       nothing; a plain healer's ally takes the whole landing */
    const T = M.MSD.MONSTER_SPELLS, was = M.MSD.SPELL_SWITCH.live, span = M.MSD.SPELL_STAGGER.spanPm, had = Object.prototype.hasOwnProperty.call(M.MONSTERS.rat, 'spells'), list = M.MONSTERS.rat.spells;
    T.zz_heavy = { n: 'Heavy Blow', shape: 'ring', r: 1, range: 1, windupMs: 1600, cdMs: 20000, hitPm: 2000, element: null };
    M.MSD.SPELL_SWITCH.live = true; M.MSD.SPELL_STAGGER.spanPm = 0; M.MONSTERS.rat.spells = ['zz_heavy'];
    try {
      const play = (worn, hp, on) => {
        /* (the healer beside the caster too, so a wind-up at the wearer itself begins in its 1-tile range) */
        const g = H(M, 1, 13, 4, 'healer', { hp: 400, maxHp: 1000 }), a = H(M, 2, 12, 3, 'tank', { hp, maxHp: 1000 }), b = H(M, 3, 14, 3, 'mage', { hp: 400, maxHp: 1000 });
        const m = E(M, 10, 0, 13, 3, on || 2, { hp: 90000, maxHp: 90000 });
        const inst = fight(M, [g, a, b, m], { risk: null });
        if (worn) wear(M, g, 'night_carters_boots');
        M.movement.occupancy(inst);
        const sc = sc2(M, 106);
        let blunted = 0;
        for (let ms = 0; ms <= 2000; ms += 100) { at(inst, sc, ms); M.MSP.castSpells(inst, sc); M.RX.drainReactions(inst, sc); if (ms === 0) blunted = stacksOf(m, 'blunted').length; }
        const end = sc.events.find((e) => e.type === 'spell_end' && e.spell === 'zz_heavy');
        const took = sc.events.filter((e) => e.type === 'dmg' && e.u === 10).reduce((s, e) => s + e.amount, 0);
        return { started: sc.events.some((e) => e.type === 'spell' && e.spell === 'zz_heavy'), blunted, end: end && end.why, took, left: stacksOf(m, 'blunted').length };
      };
      const w = play(true, 400), p = play(false, 400), over = play(true, 600), self = play(true, 400, 1);
      if (!w.started || !p.started || !self.started || w.end !== 'landed' || p.end !== 'landed' || !(p.took >= 4)) return 'CONTROL: the wind-ups ' + JSON.stringify([w, p, self]);
      if (w.blunted !== 1 || p.blunted || over.blunted || self.blunted) return 'Blunted as the wind-up began at an ally at 40%, for a plain healer, at an ally at 60% and at the wearer: ' + [w.blunted, p.blunted, over.blunted, self.blunted] + ' (want 1, 0, 0, 0)';
      if (w.left || Math.abs(w.took - Math.floor(p.took / 2)) > 2) return 'the Blunted wind-up landed ' + w.took + ' where the plain one landed ' + p.took + ', its stack ' + w.left + ' (want half, spent)';
    } finally {
      delete T.zz_heavy; M.MSD.SPELL_SWITCH.live = was; M.MSD.SPELL_STAGGER.spanPm = span;
      if (had) M.MONSTERS.rat.spells = list; else delete M.MONSTERS.rat.spells;
    }
    return null;
  },
  'circle-again': (M) => {
    /* #18 Brewer's Apron (re-specced: a heal again on the lowest ally, once a cast): a Circle of Renewal heals the hurt ally lowest on health
       a second time, by its own heal's amount; the plain healer's Circle heals each hero once; another heal heals nothing again */
    const play = (worn, move) => {
      const g = H(M, 1, 10, 3, 'healer', { mana: 9000, maxMana: 9000, maxHit: 60, hp: 1000, maxHp: 1000 });
      const a = H(M, 2, 11, 3, 'tank', { hp: 900, maxHp: 1000 }), b = H(M, 3, 10, 4, 'mage', { hp: 200, maxHp: 1000 }), c = H(M, 4, 11, 4, 'ranger', { hp: 600, maxHp: 1000 });
      const m = E(M, 10, 0, 13, 3, 2, { hp: 90000, maxHp: 90000 });
      const inst = fight(M, [g, a, b, c, m]);
      inst.heroes = { 1: entry(M, [move], 8) };
      if (worn) wear(M, g, 'brewers_apron');
      const sc = sc2(M, 107);
      M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
      const heals = sc.events.filter((e) => e.type === 'heal');
      return { cast: sc.events.some((e) => e.type === 'cast' && e.ability === move), again: heals.filter((e) => e.ability === 'brewers_apron'), circle: heals.filter((e) => e.ability !== 'brewers_apron' && e.t === 3), b: b.hp };
    };
    const w = play(true, 'circle_of_renewal'), p = play(false, 'circle_of_renewal'), o = play(true, 'greater_mend');
    if (!w.cast || !p.cast || !o.cast || p.circle.length !== 1 || !(p.circle[0].amount > 0)) return 'CONTROL: the casts ' + JSON.stringify([w, p]);
    const x = p.circle[0].amount;
    if (p.again.length || o.again.length) return 'a plain Circle, or a Greater Mend under the Apron, healed again: ' + JSON.stringify([p.again, o.again]);
    if (w.again.length !== 1 || w.again[0].t !== 3 || w.again[0].amount !== x || w.b !== 200 + 2 * x) return 'the Apron\'s Circle healed again ' + JSON.stringify(w.again) + ', the mage at ' + w.b + ' (want the mage, the lowest, once more by ' + x + ')';
    return null;
  },
  'real-settle': async (M) => {
    const { loadPlay } = await import(pathToFileURL(join(M.root, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
    const P = await loadPlay(M.root);
    const four = ['tank', 'ranger', 'mage', 'healer'];
    const SIG = ['cairn_belt', 'lurchers_collar', 'the_wood_book', 'brewers_apron'];
    /* batch 2's on the same four: the Saber's Blunted on a Flame Strike's target, the Longbow's cuts, the Wand's bursts, the Hat's reflected blows */
    const SIG2 = ['charred_sabre', 'provosts_longbow', 'hall_fire_wand', 'drovers_hat'];
    /* batch 3's, as lane/designer-sig-batch4 reshaped them: the Pavise's Guarded party as the tank calls, the Tooth's second hit on a low
       monster, the Ring's Stoked caster (the Boots left the set with lane/signatures-batch-5: their wind-up is Carter's Rest's, below) */
    const SIG3 = ['bannermans_pavise', 'bulls_tooth', 'stokers_ring', null];
    /* (and the Key's heal on a low ally, on the ranger, whose ally the tank is) */
    const SIG4 = [null, 'the_cellar_key', null, null];
    /* batch 4's (lane/signatures-batch-4): the Plate's cut beside the tank, the Bracers' saved arrows, the Ledger's free fourth spell, the
       Sash's regen; then the pair (the Rein on the tank, the Bell on the healer) with the Hood's health-paid spells; then the Mitts' Brace on
       the tank's Power Strike and the Thrower's Ring's raised Ward (both re-specced, lane/signatures-batch-5); then the Cloak on a Bold four,
       whose saves break the pull off */
    const SIG5 = ['gatekeepers_plate', 'brood_bracers', 'ledger_ring', 'sergeants_sash'];
    const SIG6 = ['lead_rein', null, 'pyre_priests_hood', 'convoy_bell'];
    const SIG7 = ['teamsters_mitts', null, null, 'throwers_ring'];
    const SIGB = [null, null, null, 'hearth_masons_cloak'];
    const go = (sig, windowMs, risk) => {
      const seen = { boon: 0, bleed: 0, blunted: 0, reflect: 0, burst: 0, stoked: 0, echo: 0, key: 0, guarded: 0, free: 0, freeXp: 0, paidHp: 0, saved: 0, deaths: 0,
        fallAtSave: 0, again: 0, braced: 0 };
      const saves = new Set();
      /* (the Bold four: a Level 45 four at step 680 meets a would-be death at 10 s, the Cloak saves it and the next comes at 145 s, past its
         span of 140 s: a death's leave lands at the settle boundary, so the hunt after a death is its window's, CLAUDE.md section 6) */
      const r = P.run('muster_barrows', risk === 'bold' ? 45 : 60, four, { spanMs: risk === 'bold' ? 140000 : 900000, windowMs, secret: '-4611686018427387904', options: () => ({ risk: risk || 'steady', danger: risk === 'bold' ? 680 : 570 }),
        equipment: (role, i, L) => ({ ...P.kitFor(L, role), ...(role === 'ranger' ? { ammo: 'steel_arrows' } : {}) }),
        bag: (role) => (role === 'ranger' ? { steel_arrows: { loaded: 400 } } : {}),
        ...(sig ? { signature: (role, i) => sig[i] } : {}),
        /* (the healer opens on Circle of Renewal: the reference bar heals with Greater Mend alone) */
        bar: () => [{ action: { type: 'ability', id: 'circle_of_renewal' }, conditions: [], join: 'and' },
          /* (and wards the hurt: the reference bar casts no Protective Ward, which Drover's Hat reads) */
          { action: { type: 'ability', id: 'protective_ward' }, conditions: [{ op: 'lt', value: 95, metric: 'ally_hp_pct', subject: 'lowest' }], join: 'and' },
          /* (and the tank strikes with Flame Strike, which the Charred Saber reads) */
          { action: { type: 'ability', id: 'flame_strike' }, conditions: [], join: 'and' },
          /* (and the mage opens on Fireball, whose kills the Hall Fire Wand reads: on the reference bar a Fireball kill in 15 minutes was
             luck, and the Hat cut to 25% (lane/designer-sig-metric) played a hunt with none) */
          { action: { type: 'ability', id: 'fireball' }, conditions: [], join: 'and' },
          /* (and casts Frost Lance, an Ice rune spell, which Stokes the Stoker's Ring's wearer: lane/designer-sig-batch4) */
          { action: { type: 'ability', id: 'frost_lance' }, conditions: [], join: 'and' },
          /* (and the tank calls the Challenge, which the Bannerman's Pavise reads) */
          { action: { type: 'ability', id: 'challenge' }, conditions: [], join: 'and' },
          /* (and strikes with Power Strike, which the Teamster's Mitts read: lane/signatures-batch-4) */
          { action: { type: 'ability', id: 'power_strike' }, conditions: [], join: 'and' },
          ...P.refBar('muster_barrows')],
        onWindow: (out) => { for (const e of out.events || []) {
          if (e.type === 'status_on' && e.status === 'emboldened') seen.boon++;
          /* (no seat of this four lays a Bleed of its own: every Bleed is the Collar's) */
          if (e.type === 'status_on' && e.status === 'bleed') seen.bleed++;
          if (e.type === 'status_on' && e.status === 'blunted') seen.blunted++;
          if (e.type === 'dmg' && e.ability === 'reflect') seen.reflect++;
          if (e.type === 'dmg' && e.ability === 'burst') seen.burst++;
          /* (no move of this bar Chills: a Chill at a pull's own instant is the Boots') */
          if (e.type === 'status_on' && e.status === 'stoked') seen.stoked++;
          if (e.type === 'status_on' && e.status === 'guarded') seen.guarded++;
          if (e.type === 'dmg' && e.ability === 'echo') seen.echo++;
          if (e.type === 'heal' && e.ability === 'the_cellar_key') seen.key++;
          /* (batch 4: a rune spell cast for no mana, a spell paid in health, a would-be death saved and the pull it broke off) */
          if (e.type === 'cast' && e.mana === 0 && ['fireball', 'frost_lance'].includes(e.ability)) seen.free++;
          /* (lane/signatures-batch-5: each such cast trains on its written mana, `xpMana`, which the settle's reward credits) */
          if (e.type === 'cast' && e.mana === 0 && ['fireball', 'frost_lance'].includes(e.ability) && e.xpMana > 0) seen.freeXp++;
          if (e.type === 'cast' && e.paidHp > 0) seen.paidHp++;
          if (e.type === 'heal' && e.ability === 'brewers_apron') seen.again++;
          if (e.type === 'status_on' && e.status === 'braced') seen.braced++;
          if (e.type === 'dmg' && Number.isInteger(e.saved)) { seen.saved++; saves.add(e.atMs); }
          if (e.type === 'danger' && e.why === 'fall' && saves.has(e.atMs)) seen.fallAtSave++;
          if (e.type === 'danger' && e.why === 'death') seen.deaths++;
        } } });
      return { sig: JSON.stringify({ t: r.totals, x: r.heroXp, seen }), seen };
    };
    const plain = go(null, 600000), closed = go(SIG, 600000), viewed = go(SIG, 100000);
    if (plain.seen.boon || plain.seen.bleed || plain.seen.blunted || plain.seen.reflect || plain.seen.burst) return 'a four with no Signature played one: ' + JSON.stringify(plain.seen);
    if (!closed.seen.again) return 'Brewer\'s Apron never healed a hero again on the real settle: ' + JSON.stringify(closed.seen);
    if (!closed.seen.bleed) return 'Lurcher\'s Collar never laid a Bleed on the real settle: ' + JSON.stringify(closed.seen);
    if (plain.sig === closed.sig) return 'the four with Signatures played exactly the hunt of the four with none';
    if (closed.sig !== viewed.sig) return 'the same Signatures settled in 10-minute and 100-second windows played two hunts';
    const closed2 = go(SIG2, 600000), viewed2 = go(SIG2, 100000);
    if (!closed2.seen.blunted || !closed2.seen.reflect || !closed2.seen.burst) return 'batch 2 on the real settle: ' + JSON.stringify(closed2.seen);
    if (plain.sig === closed2.sig) return 'the four with batch 2\'s Signatures played exactly the hunt of the four with none';
    if (closed2.sig !== viewed2.sig) return 'batch 2\'s Signatures settled in 10-minute and 100-second windows played two hunts';
    if (plain.seen.stoked || plain.seen.echo || plain.seen.key || plain.seen.guarded) return 'a four with no Signature played batch 3\'s: ' + JSON.stringify(plain.seen);
    const closed3 = go(SIG3, 600000), viewed3 = go(SIG3, 100000);
    if (!closed3.seen.stoked || !closed3.seen.echo || !closed3.seen.guarded) return 'batch 3 on the real settle: ' + JSON.stringify(closed3.seen);
    if (plain.sig === closed3.sig) return 'the four with batch 3\'s Signatures played exactly the hunt of the four with none';
    if (closed3.sig !== viewed3.sig) return 'batch 3\'s Signatures settled in 10-minute and 100-second windows played two hunts';
    const closed4 = go(SIG4, 600000), viewed4 = go(SIG4, 100000);
    if (!closed4.seen.key) return 'the Cellar Key never healed a low ally on the real settle: ' + JSON.stringify(closed4.seen);
    if (closed4.sig !== viewed4.sig) return 'the Cellar Key settled in 10-minute and 100-second windows played two hunts';
    if (plain.seen.free || plain.seen.paidHp || plain.seen.saved || plain.seen.again || plain.seen.braced) return 'a four with no Signature played batch 4\'s or 5\'s: ' + JSON.stringify(plain.seen);
    for (const [name, set, want] of [['the Plate, Bracers, Ledger and Sash', SIG5, 'free'], ['the pair and the Hood', SIG6, 'paidHp'], ['the Mitts and the Thrower\'s Ring', SIG7, 'braced']]) {
      const c = go(set, 600000), v = go(set, 100000);
      if (!c.seen[want]) return name + ' on the real settle: ' + JSON.stringify(c.seen) + ' (want ' + want + ')';
      if (c.seen.free !== c.seen.freeXp) return name + ': ' + c.seen.free + ' casts paid no mana and ' + c.seen.freeXp + ' trained on their written mana (want every one)';
      if (plain.sig === c.sig) return 'the four wearing ' + name + ' played exactly the hunt of the four with none';
      if (c.sig !== v.sig) return name + ' settled in 10-minute and 100-second windows played two hunts';
    }
    /* BATCH 5 ON A GROUND WHOSE MONSTERS WIND UP (lane/signatures-batch-5; Carter's Rest: the Stable Troll's Trough Swing beside its target,
       the Troll Brewer's Boiling Mash on the party; Muster's monsters wind up nothing): the Mitts' Brace on the tank, the Maul's shield on each
       wind-up its hammer's Stagger ends, the Breeches' Parry on a sword and the Boots' Blunted on a wind-up at a low ally; then the Hooks'
       Whetted Rend, the Candle's Frost Lance, the Apron's second heal and the Ring's raised Shelter. Each set plays a hunt of its own and
       settles the same in 10-minute and 100-second windows */
    const C1 = { roles: ['tank', 'melee_dps', 'melee_dps', 'healer'], weapons: [null, null, 'mithril_sword', null],
      sig: ['teamsters_mitts', 'stable_trolls_maul', 'ledgehide_breeches', 'night_carters_boots'] };
    const C2 = { roles: ['tank', 'melee_dps', 'mage', 'healer'], weapons: [null, 'mithril_hatchets', null, null],
      sig: ['throwers_ring', 'troll_pickers_hooks', 'the_cold_candle', 'brewers_apron'] };
    const slot = (id, conditions) => ({ action: { type: 'ability', id }, conditions: conditions || [], join: 'and' });
    const goC = (set, sig, windowMs) => {
      const seen = { braced: 0, maul: 0, blunted: 0, whetted: 0, candle: 0, again: 0, parry: 0 };
      const ended = new Set(), staggers = new Set();
      const r = P.run('carters_rest', 117, set.roles, { spanMs: 900000, windowMs, secret: '-4611686018427387904', options: () => ({ risk: 'steady', danger: 40 }),
        equipment: (role, i, L) => ({ ...P.kitFor(L, role), ...(set.weapons[i] ? { weapon: set.weapons[i] } : {}) }),
        ...(sig ? { signature: (role, i) => sig[i] } : {}),
        /* (each move on its own new-slot trigger, as a player adds it: Stagger and Parry on "my target is winding up", Gash at two) */
        bar: () => [slot('stagger', M.AD.suggestedTrigger(M.AD.ABILITIES.stagger)), slot('parry', M.AD.suggestedTrigger(M.AD.ABILITIES.parry)),
          slot('gash', M.AD.suggestedTrigger(M.AD.ABILITIES.gash)), slot('rend'), slot('power_strike'), slot('shelter'),
          slot('circle_of_renewal', [{ op: 'gte', value: 2, metric: 'allies_below', subject: 'under_90' }]), slot('greater_mend', [{ op: 'lt', value: 80, metric: 'ally_hp_pct', subject: 'lowest' }]),
          slot('frost_lance'), ...P.refBar('carters_rest')],
        onWindow: (out) => { for (const e of out.events || []) {
          if (e.type === 'status_on' && e.status === 'braced') seen.braced++;
          if (e.type === 'cast' && e.ability === 'stagger') staggers.add(e.u);
          if (e.type === 'spell_end' && e.why === 'interrupted') ended.add(e.atMs);
          if (e.type === 'shield' && staggers.has(e.u) && e.t === e.u && ended.has(e.atMs)) seen.maul++;
          if (e.type === 'cast' && e.ability === 'parry') seen.parry++;
          if (e.type === 'status_on' && e.status === 'blunted') seen.blunted++;
          if (e.type === 'status_on' && e.status === 'whetted') seen.whetted++;
          if (e.type === 'cast' && e.ability === 'frost_lance' && e.saved) seen.candle++;
          if (e.type === 'heal' && e.ability === 'brewers_apron') seen.again++;
        } } });
      /* (keys sorted: a hero that buys nothing in a 10-minute window's first stretch enters the buy tally later than in a 100-second cut,
         the same buys in another key order) */
      const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
      return { sig: JSON.stringify(canon({ t: r.totals, x: r.heroXp, seen })), seen };
    };
    /* (the Boots ride C1 unasked: on this short hunt no wind-up begins at an ally under half, since the Danger scale holds a Steady four's
       lowest near its clean line, so their moment is queued at every wind-up and passes none; their rule is windup-blunt's) */
    for (const [name, set, want] of [['the Mitts, the Maul, the Breeches and the Boots', C1, ['braced', 'maul']], ['the Ring, the Hooks, the Candle and the Apron', C2, ['whetted', 'candle', 'again']]]) {
      const p = goC(set, null, 600000), c = goC(set, set.sig, 600000), v = goC(set, set.sig, 100000);
      if (want.some((k) => p.seen[k])) return 'a Carter\'s Rest four with no Signature played batch 5\'s: ' + JSON.stringify(p.seen);
      if (want.some((k) => !c.seen[k])) return name + ' on the real settle: ' + JSON.stringify(c.seen) + ' (want ' + want + ')';
      if (p.sig === c.sig) return 'the four wearing ' + name + ' played exactly the hunt of the four with none';
      if (c.sig !== v.sig) return name + ' settled in 10-minute and 100-second windows played two hunts';
    }
    /* THE FALL-BACK SAVE ON BOTH DOORS (CLAUDE.md section 4: a rule that touches a death): a Bold four deep enough to die, with the Cloak,
       saves a death and breaks that pull off at the save, and the closed and viewed hunts play the same; the plain Bold four dies */
    /* (the viewed door in 20 s windows: seven settle cuts across the save, its clock and its fall back) */
    const boldPlain = go(null, 600000, 'bold'), boldClosed = go(SIGB, 600000, 'bold'), boldViewed = go(SIGB, 20000, 'bold');
    if (!boldPlain.seen.deaths) return 'CONTROL: the plain Bold four never died in 15 minutes: ' + JSON.stringify(boldPlain.seen);
    if (!boldClosed.seen.saved || boldClosed.seen.fallAtSave !== boldClosed.seen.saved) return 'the Cloak on the real settle: ' + JSON.stringify(boldClosed.seen) + ' (want a save, each breaking its pull off at once)';
    if (boldClosed.sig !== boldViewed.sig) return 'the Cloak settled in one window and in 20-second windows played two hunts';
    return null;
  },
  dark: (M) => {
    if (M.SG.SIGNATURE_RULES.live !== false) return 'SIGNATURE_RULES.live is ' + M.SG.SIGNATURE_RULES.live + ': Signatures are dark until wave 4';
    /* (lane/t1-traits-drop) the settle's projection hands it, the server's own read only (hr_hunt_instance_read `worn_signature`, null while
       the server's `signatures` switch is off: 1071-trait-pieces.sql, tests/trait-pieces-db.mjs), so the edge file joins the engine's readers */
    const allowed = new Set(['src/core/hunt/signature-rules.js', 'src/core/hunt-spawn.js', 'src/core/member.js', 'supabase/functions/hr-accrue/hunt-settle.js']);
    const strip = (x) => x.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const walk = (abs, rel, out) => {
      if (!existsSync(abs)) return out;
      for (const e of readdirSync(abs)) {
        const a = join(abs, e), r = rel + '/' + e;
        if (statSync(a).isDirectory()) walk(a, r, out); else if (/\.(m?js|ts)$/.test(e)) out.push([r, readFileSync(a, 'utf8')]);
      }
      return out;
    };
    const files = [...walk(join(M.root, 'src'), 'src', []), ...walk(join(M.root, 'supabase', 'functions'), 'supabase/functions', [])];
    if (files.length < 50) return 'CONTROL: ' + files.length + ' files read';
    for (const [rel, text] of files) if (!allowed.has(rel) && /\bwornSignature\b/.test(strip(text))) return rel + ' names wornSignature: it hands a hero a Signature while Signatures are dark';
    /* the settle hands only the read's own field, never a value of its own making */
    const settle = files.find(([rel]) => rel === 'supabase/functions/hr-accrue/hunt-settle.js');
    if (settle && /\bwornSignature\b/.test(strip(settle[1])) && !/_wornSignature: typeof m\.worn_signature === 'string' && m\.worn_signature \? m\.worn_signature : null,/.test(settle[1])) return 'hunt-settle.js hands a Signature that is not the server read\'s worn_signature';
    const u = H(M, 1, 12, 3, 'tank');
    M.SR.syncSignature(u, {});
    if (u.signature !== undefined || u.reacts !== undefined) return 'a hero with no Signature got a field';
    return null;
  },
};

/* one declaration a line: tests/mutant-anchors.mjs resolves a file constant by its own line (four on one line read as the last, damage.js) */
const SR = 'src/core/hunt/signature-rules.js';
const RX = 'src/core/hunt/reactions.js';
const RQ = 'src/core/hunt/react-queue.js';
const DM = 'src/core/hunt/damage.js';
const AB = 'src/core/hunt/abilities.js';
const ST = 'src/core/hunt/status.js';
const HRL = 'src/core/hunt/heal-rules.js';
const SG = 'src/data/signatures.js';
const STD = 'src/data/statuses.js';
const TG = 'src/core/hunt/targeting.js';
const PC = 'src/core/hunt/pull-cycle.js';
const SA = 'src/core/hunt/signature-auras.js';
const SCO = 'src/core/hunt/signature-costs.js';
const FSV = 'src/core/hunt/fall-save.js';
const SE = 'src/core/hunt/status-effects.js';
const DZ = 'src/core/hunt/danger.js';
const SCA = 'src/core/hunt/signature-casts.js';
const MSP = 'src/core/hunt/monster-spells.js';
const REW = 'src/core/hunt-rewards.js';
const mutants = [
  { name: 'a list plays its last Signature', case: 'worn-signature', edits: [[SR, '.filter((id) => own(SIGNATURES, id)).slice(0, SIGNATURE_RULES.perHero);', '.filter((id) => own(SIGNATURES, id)).reverse();']] },
  { name: 'no Signature plays at all', case: 'worn-signature', edits: [['src/data/signatures.js', '  perHero: 1,', '  perHero: 0,']] },
  { name: 'heroSetup drops the Signature', case: 'worn-signature', edits: [['src/core/hunt-spawn.js', '    ...(sg ? { wornSignature: sg } : {}),\n', '']] },
  { name: 'a boundary adds the rows again', case: 'worn-signature', edits: [[SR, '.filter((r) => r.sig !== true)', '.filter(() => true)']] },
  { name: 'the Roads\' rows go with the Signature', case: 'worn-signature', edits: [[SR, '    u.reacts = rest && rest.length ? rest.concat(signatureReacts(id)) : signatureReacts(id);', '    u.reacts = signatureReacts(id);']] },
  { name: 'a line-less hp_below passes the check', case: 'rows', edits: [['src/data/talents.js', "  if (e.on === 'hp_below' && e.belowPm === undefined) out.push('hp_below names its line (belowPm)');\n", '']] },
  { name: 'the line is read when the queue drains, not as the blow lands', case: 'low-health-shield', edits: [[RQ, ' && holdsNow(row, ctx, inst.atMs) && holdsToo(inst, u, row, ctx)) (inst.reactQ', ' && holdsToo(inst, u, row, ctx)) (inst.reactQ']] },
  { name: 'the hero\'s own health is never queued', case: 'low-health-shield', edits: [[DM, "  if (target.alive) queueOn(inst, target, 'hp_below', { t: target });\n", '']] },
  { name: 'a death is the killer\'s only', case: 'pass-on-death', edits: [[DM, "for (const h of rs) queueOn(inst, h, 'death',", "for (const h of rs) if (h === source) queueOn(inst, h, 'death',"]] },
  { name: 'a Mark moves onto a marked monster', case: 'pass-on-death', edits: [[RX, '(o) => !(int(o.markUntil) > sc.atMs)', '() => true']] },
  { name: 'a passed Mark starts its time again', case: 'pass-on-death', edits: [[RX, 'm.markPm = ctx.markPm; m.markUntil = ctx.markUntil;', 'm.markPm = ctx.markPm; m.markUntil = ctx.markUntil + 1000;']] },
  { name: 'a passed status loses its scale', case: 'pass-on-death', edits: [[RX, 'st.left = was.left; st.scale = was.scale;', 'st.left = was.left;']] },
  { name: 'has is never read', case: 'reset-from-move', edits: [[RQ, "(row.has === undefined || carries(ctx.t, row.has))", 'true']] },
  { name: 'ready waits out the cooldown', case: 'reset-from-move', edits: [[RX, '  u.cds = Object.assign({}, u.cds, { [move]: atMs });', '  u.cds = Object.assign({}, u.cds, { [move]: readyAt(u.cds, move) });']] },
  { name: 'a cast heal queues no moment', case: 'heal-boon', edits: [[HRL, "  if (inst && row) queueOn(inst, u, 'heal', { t, ability: row.id, was, dmg: landed });\n", '']] },
  { name: 'a boon keeps the row\'s own time', case: 'heal-boon', edits: [[RX, '  if (row.ms) for (const s of t.statuses) if (s.s === st.id && s.src === u.id && s.left === st.durationMs) s.left = row.ms;\n  return true;\n}', '  return true;\n}']] },
  /* ── batch 2: each row's case, its mutant ── */
  { name: 'a Blunted swing is never spent', case: 'first-blow-half', edits: [[DM, '      spendOnce(u, sc);\n      continue;', '      continue;']] },
  { name: 'Blunted cuts nothing', case: 'first-blow-half', edits: [[STD, 'dealtPm: -500, once: true', 'dealtPm: -1, once: true']] },
  { name: 'a cast queues no moment', case: 'cast-count-shield', edits: [[AB, "  if (tally) queueOn(inst, u, 'cast', { t: pick.target, ability: row.id, n: tally.n.size, dmg: tally.dmg, healed: tally.healed });\n", '']] },
  { name: 'a shield ignores its cap', case: 'cast-count-shield', edits: [[RX, 'row.capPm ? Math.min(n, Math.floor((int(u.maxHp) * row.capPm) / 1000)) : n', 'n']] },
  { name: 'a cast counts one monster', case: 'cast-count-shield', edits: [[RX, 'const k = ctx.n === undefined ? 1 : int(ctx.n);', 'const k = 1;']] },
  { name: 'Grave Guard\'s Mail guards at its row\'s own strength', case: 'shell-break-guard', edits: [[SG, "status: 'guarded', pw: 3000, ms: 8000 }", "status: 'guarded', ms: 8000 }"]] },
  { name: 'a broken shell queues nothing', case: 'shell-break-guard', edits: [[DM, "  if (brokeBy !== null) queueOn(inst, unitById(inst, brokeBy), 'shield_break', { t: target, src: source });\n", '']] },
  { name: 'the Saber Blunts every monster beside the wearer', case: 'cast-blunt-target', edits: [[SG, "{ on: 'cast', of: 'flame_strike', do: 'status', status: 'blunted' }", "{ on: 'cast', of: 'flame_strike', do: 'status', status: 'blunted', r: 1 }"]] },
  { name: 'the Gauntlets ready Flame Strike', case: 'ready-power', edits: [[SG, "do: 'ready', move: 'power_strike' }", "do: 'ready', move: 'flame_strike' }"]] },
  { name: 'a cast tallies no damage', case: 'cast-poison', edits: [[AB, '    if (tally) tally.dmg += r.dmg;\n', '']] },
  { name: 'the Hatchets read each hit, not the cast', case: 'cast-poison', edits: [[SG, "{ on: 'cast', of: 'rend',", "{ on: 'hit', of: 'rend',"]] },
  { name: 'marked is never read', case: 'marked-bleed', edits: [[RQ, '  && (row.marked !== true || markedAt(ctx.t, atMs));', '  && true;']] },
  { name: 'the Collar has no clock', case: 'marked-bleed', edits: [[SG, "status: 'bleed', clockMs: 2000 }", "status: 'bleed' }"]] },
  /* (lane/designer-sig-metric) the Collar at the 4 s clock that read 4.2 pace steps, under the band */
  { name: 'the Collar\'s clock at 4 s', case: 'marked-bleed', edits: [[SG, "status: 'bleed', clockMs: 2000 }", "status: 'bleed', clockMs: 4000 }"]] },
  { name: 'the Coal Runner\'s Bow has no clock', case: 'kill-ready-clock', edits: [[SG, "move: 'flame_volley', clockMs: 10000 }", "move: 'flame_volley' }"]] },
  { name: 'the Longbow cuts only Flame Volley', case: 'reset-two', edits: [[SG, ",\n      { on: 'hit', of: 'precision_shot', do: 'reset', move: 'raking_shot', ms: 1000, capMs: 4000 }", '']] },
  { name: 'a status with pm lands its row\'s own tick', case: 'hit-poison', edits: [[RX, '  if (row.pm) {\n    const ms = row.ms', '  if (false) {\n    const ms = row.ms']] },
  { name: 'a burst reaches every monster', case: 'kill-burst', edits: [[RX, 'cheb(o, dead) <= row.r).sort', 'true).sort']] },
  { name: 'the Shroud Chills instead', case: 'hit-silence', edits: [[SG, "do: 'status', status: 'silenced', ms: 3000", "do: 'status', status: 'chill', ms: 3000"]] },
  { name: 'a Kindled cast is not raised', case: 'break-kindle', edits: [[AB, 'const raise = spendCastPm(u, row.id, sc) + (', 'const raise = 0 + (']] },
  { name: 'Kindled is never spent', case: 'break-kindle', edits: [[ST, '  unit.statuses = list.filter((s) => s !== spent);\n', '']] },
  { name: 'a heal reads its line after the heal', case: 'heal-guard', edits: [[HRL, '{ t, ability: row.id, was, dmg: landed }', '{ t, ability: row.id, dmg: landed }']] },
  { name: 'a boon ignores its strength', case: 'heal-guard', edits: [[RX, '  if (row.pw) for (const s of t.statuses) if (s.s === st.id && s.src === u.id && s.left === st.durationMs) s.pw = row.pw;\n', '']] },
  { name: 'a shell\'s blow queues nothing', case: 'absorb-reflect', edits: [[DM, "  if (Number.isInteger(shellBy) && r.absorbed > 0 && isHero(target) && isMonster(source)) queueOn(inst, unitById(inst, shellBy), 'absorb', { t: target, src: source, dmg: r.absorbed });\n", '']] },
  /* (lane/designer-sig-metric) the Hat at the 50% that read 19.6 pace steps, over the band */
  { name: 'the Hat sends back half', case: 'absorb-reflect', edits: [[SG, "reacts: [{ on: 'absorb', do: 'reflect', pm: 250 }]", "reacts: [{ on: 'absorb', do: 'reflect', pm: 500 }]"]] },
  { name: 'a status ignores its reach', case: 'low-mend-blunt', edits: [[RX, 'const list = Number.isInteger(row.r) ?', 'const list = false ?']] },
  { name: 'the Pennies\' line at half health', case: 'low-mend-blunt', edits: [[SG, "belowPm: 450, do: 'status', status: 'blunted', r: 1 }", "belowPm: 500, do: 'status', status: 'blunted', r: 1 }"]] },
  /* ── batch 3: each row's case, its mutant (a new piece's seam or filter, else the row itself) ── */
  /* (lane/designer-sig-batch4) the Pavise at the -15% for 4 s that read 17.6 pace steps, over the band */
  { name: 'the Pavise at -15% for 4 s', case: 'taunt-party-guard', edits: [[SG, "status: 'guarded', pw: 1250, ms: 3000 }", "status: 'guarded', pw: 1500, ms: 4000 }"]] },
  { name: 'the Pavise guards only the tank', case: 'taunt-party-guard', edits: [[SG, "{ on: 'taunt', do: 'boon', to: 'party', status: 'guarded'", "{ on: 'taunt', do: 'boon', to: 'self', status: 'guarded'"]] },
  { name: 'a taunt names no monsters', case: 'taunt-armor-break', edits: [[TG, "queueOn(inst, k, 'taunt', { n: took.length, list: took })", "queueOn(inst, k, 'taunt', { n: took.length })"]] },
  { name: 'the Chain has no clock', case: 'near-fall-ready', edits: [[SG, "move: 'spring_tide', clockMs: 60000 }", "move: 'spring_tide' }"]] },
  /* (lane/designer-sig-batch5: the Chain's clock as set, a minute; at the 30 s it was it read 13.0 pace steps, over the band) */
  { name: 'the Chain at 30 s', case: 'near-fall-ready', edits: [[SG, "move: 'spring_tide', clockMs: 60000 }", "move: 'spring_tide', clockMs: 30000 }"]] },
  { name: 'a self boon lands on the cast\'s monster', case: 'cast-steeped', edits: [[SG, "do: 'boon', to: 'self', status: 'steeped' }", "do: 'boon', status: 'steeped' }"]] },
  { name: 'alone is never read', case: 'alone-kill-heal', edits: [[RQ, '(row.alone !== true || aloneIn(inst, u))', 'true']] },
  { name: 'family is never read', case: 'ice-stokes-fire', edits: [[RQ, '(row.family === undefined || familyOf(ctx.ability) === row.family)', 'true']] },
  /* (lane/designer-sig-batch4) the Ring at the 60% that read 15.6 pace steps on Pyre Field, over the band (45% read 12.5) */
  { name: 'the Stoker\'s Ring at 60%', case: 'ice-stokes-fire', edits: [[STD, "castPm: 450,\n    castOf: Object.freeze(['fireball', 'flame_strike', 'flame_volley'])", "castPm: 600,\n    castOf: Object.freeze(['fireball', 'flame_strike', 'flame_volley'])"]] },
  { name: 'the Stoker\'s Ring Stokes on a Fire spell', case: 'ice-stokes-fire', edits: [[SG, "{ on: 'cast', family: 'ice', do: 'boon', to: 'self', status: 'stoked' }", "{ on: 'cast', do: 'boon', to: 'self', status: 'stoked' }"]] },
  { name: 'a saved rune is paid anyway', case: 'rune-save', edits: [[AB, '  if (save && save.drop) pick = Object.assign({}, pick, { lines: pick.lines.slice(1), saved: pick.lines[0].id });\n', '']] },
  /* (lane/designer-sig-batch4: the Candle saves every Ice rune spell, so no shipped row reads the count; the count's mutant "the Candle's
     count is never kept" is replaced by the row's own at the every-third it was. #41's saved shot (batch 4, every fifth arrow that hits)
     reads the count again and brings its case and the count's mutant back with it: HANDOFFS 2026-11-28 designer-sig-batch4 item 4) */
  { name: 'the Candle saves every third', case: 'rune-save', edits: [[SG, "saves: { family: 'ice', every: 1, of: 'frost_lance' }", "saves: { family: 'ice', every: 3, of: 'frost_lance' }"]] },
  /* (lane/signatures-batch-5, `saves.of`: the Candle on Frost Lance alone) */
  { name: 'a rune save reads every spell of its family', case: 'rune-save', edits: [[AB, ' || (s.saves.of && s.saves.of !== pick.row.id)) return null;', ') return null;']] },
  /* (lane/signatures-batch-4: the Ring's heal is a planted row now; its own rule Blunts the breaker, below) */
  { name: 'a heal to the moment\'s hero lands on the wearer', case: 'shell-break-heal', edits: [[RX, "for (const t of row.to === 'party' ? partyOf(inst, u) : [ctx.t]) {", "for (const t of row.to === 'party' ? partyOf(inst, u) : [u]) {"]] },
  { name: 'a heal moment carries no amount', case: 'heal-mana', edits: [[HRL, 'was, dmg: landed });', 'was });']] },
  /* (lane/signatures-batch-4: the Leech Ring's passed Sickness is retired with its row; a passed status is pass-on-death's planted Bleed) */
  { name: 'a raised stack cap is never read', case: 'bleed-six', edits: [[ST, '    else if (before < row.maxStacks + stackPlus(inst, row, src)) list.push(fresh());\n', '']] },
  { name: 'every is never counted', case: 'every-fifth-death', edits: [[RX, '    if (c !== 0) return;\n', '']] },
  { name: 'a party heal lands on the wearer only', case: 'every-fifth-death', edits: [[RX, "for (const t of row.to === 'party' ? partyOf(inst, u) : [ctx.t]) {", 'for (const t of [u]) {']] },
  { name: 'the Key heals the wearer\'s own hits too', case: 'ally-low-heal', edits: [[DM, '  if (blow && isMonster(source)) for (const h of rs) if (h !== target && isAlly(h, target)) queueOn(', '  if (blow && isMonster(source)) for (const h of rs) if (isAlly(h, target) || h === target) queueOn(']] },
  /* (lane/designer-sig-batch4) the Key at the 40% line and 8% that read 84.2 pace steps on Carter's Rest, over the band */
  { name: 'the Key at 40% and 8%', case: 'ally-low-heal', edits: [[SG, "{ on: 'ally_hit', belowPm: 300, do: 'heal', to: 'target', pm: 30, clockMs: 20000,", "{ on: 'ally_hit', belowPm: 400, do: 'heal', to: 'target', pm: 80, clockMs: 20000,"]] },
  { name: 'the Key has no clock', case: 'ally-low-heal', edits: [[SG, "pm: 30, clockMs: 20000, per: 'target' }", "pm: 30 }"]] },
  /* (lane/designer-sig-batch5: the Key as it was, 2% once every 30 s, read 5.7 pace steps on Carter's Rest's 36 seeds, under the band) */
  { name: 'the Key at 2% and 30 s', case: 'ally-low-heal', edits: [[SG, "pm: 30, clockMs: 20000, per: 'target' }", "pm: 20, clockMs: 30000, per: 'target' }"]] },
  { name: 'the Riverstone gives its mana to the healed', case: 'heal-mana', edits: [[SG, "{ on: 'heal', family: 'water', do: 'mana', pm: 5 }", "{ on: 'heal', family: 'water', do: 'mana', to: 'target', pm: 5 }"]] },
  { name: 'the Tooth reads any blow', case: 'single-low-double', edits: [[SG, "{ on: 'hit', single: true, belowPm: 500, role: 'brute', do: 'echo', pm: 1000, ms: 100 }", "{ on: 'hit', belowPm: 500, role: 'brute', do: 'echo', pm: 1000, ms: 100 }"]] },
  /* (lane/signatures-batch-4, P9) */
  { name: 'the Tooth reads any monster', case: 'single-low-double', edits: [[SG, "belowPm: 500, role: 'brute', do: 'echo'", "belowPm: 500, do: 'echo'"]] },
  { name: 'role is never read', case: 'single-low-double', edits: [[RX, '  if (row.role !== undefined && roleIdOf(inst, monsterOf(ctx)) !== row.role) return;\n', '']] },
  { name: 'the Tooth\'s line at 40%', case: 'single-low-double', edits: [[SG, "{ on: 'hit', single: true, belowPm: 500,", "{ on: 'hit', single: true, belowPm: 400,"]] },
  /* (lane/designer-sig-batch5: the line as it was, 30%, read 2.2 pace steps at home with the brute filter) */
  { name: 'the Tooth\'s line at 30%', case: 'single-low-double', edits: [[SG, "{ on: 'hit', single: true, belowPm: 500,", "{ on: 'hit', single: true, belowPm: 300,"]] },
  /* (lane/signatures-batch-4: the Mitts' mana on a kill is retired with its row; the wearer's mana doer is #27's) */
  { name: 'boss is never read', case: 'boss-low-party', edits: [[RQ, '(row.boss !== true || bossOf(inst, ctx.t))', 'true']] },
  { name: 'the Signet has no clock', case: 'boss-low-party', edits: [[SG, "pw: 1500, ms: 10000, clockMs: 600000, per: 'target' }", 'pw: 1500, ms: 10000 }']] },
  { name: 'a moment\'s monsters are never read', case: 'pull-chill', edits: [[RX, '    : Array.isArray(ctx.list) ? ctx.list : [ctx.src || ctx.t];', '    : [ctx.src || ctx.t];']] },
  /* (lane/designer-sig-batch4: "a pull queues nothing" is retired with the Boots' pull-start Chill, the seam's one shipped reader, which read
     under on five shapes. The seam stays for a future pull row, which brings its real-settle case back: HANDOFFS 2026-11-28 designer-sig-batch4) */
  /* (lane/signatures-batch-4, P9: a blow at a hero reads its striker's role; the stalker Boots a planted row since lane/signatures-batch-5,
     their three data mutants retired with the row: the Boots' own are windup-blunt's) */
  { name: 'role reads the moment\'s hero, never its striker', case: 'ally-low-blunt', edits: [[RX, 'const monsterOf = (ctx) => (ctx.src && isMonster(ctx.src) ? ctx.src : ctx.t && isMonster(ctx.t) ? ctx.t : null);', 'const monsterOf = (ctx) => (ctx.t && isMonster(ctx.t) ? ctx.t : null);']] },
  { name: 'single is never read', case: 'single-carry', edits: [[RQ, '(row.single !== true || singleOf(ctx.ability))', 'true']] },
  /* ── batch 4 (lane/signatures-batch-4): each row's case, each engine piece's mutant ── */
  { name: 'a broken shell names no breaker', case: 'shell-break-blunt', edits: [[DM, "'shield_break', { t: target, src: source });", "'shield_break', { t: target });"]] },
  /* (a planted row since lane/signatures-batch-5: the status lands on the moment's source, its breaker) */
  { name: 'a broken shell\'s status lands on its hero', case: 'shell-break-blunt', edits: [[RX, '    : Array.isArray(ctx.list) ? ctx.list : [ctx.src || ctx.t];', '    : Array.isArray(ctx.list) ? ctx.list : [ctx.t];']] },
  /* (lane/designer-sig-batch5: the Leech's heal, its number as set and where it lands) */
  { name: 'the Leech heals at 100%', case: 'poison-heal-lowest', edits: [[SG, "do: 'heal', to: 'lowest', pm: 600 }", "do: 'heal', to: 'lowest', pm: 1000 }"]] },
  { name: 'the Leech heals its wearer', case: 'poison-heal-lowest', edits: [[SG, "do: 'heal', to: 'lowest', pm: 600 }", "do: 'heal', to: 'self', pm: 600 }"]] },
  { name: 'at is never read', case: 'lowest-sicken', edits: [[RX, "  if (row.at === 'lowest') { const m = onLowest(inst, u); return m ? [m] : []; }\n", '']] },
  { name: 'the lowest hero is the highest', case: 'lowest-sicken', edits: [[RX, 'if (!low || share(a) < share(low) ||', 'if (!low || share(a) > share(low) ||']] },
  { name: 'the farthest monster on the lowest is picked', case: 'lowest-sicken', edits: [[RX, 'if (!m || cheb(o, low) < cheb(m, low) ||', 'if (!m || cheb(o, low) > cheb(m, low) ||']] },
  { name: 'a one-monster taunt takes a held monster', case: 'power-taunt', edits: [[RX, ' || !isHero(u) || m.holdMs > 0) return false;', ' || !isHero(u)) return false;']] },
  { name: 'a one-monster taunt holds nothing', case: 'power-taunt', edits: [[RX, '  m.holdMs = Math.max(STEP, Math.floor(ms / STEP) * STEP);', '  m.holdMs = 0;']] },
  /* (the count's case and mutant back, HANDOFFS 2026-11-28 designer-sig-batch4 item 3: the Candle saves every Ice cast now) */
  { name: 'the saved shot\'s count is never kept', case: 'shot-save', edits: [[SCO, '  if (n !== readyAt(u.cds, key)) u.cds = Object.assign({}, u.cds || {}, { [key]: n });', '']] },
  { name: 'a saved shot takes its arrow anyway', case: 'shot-save', edits: [[AB, '    if (c.free === true) return Object.assign({}, l, { saved: true });\n', '']] },
  { name: 'a shot that missed counts as landed', case: 'shot-save', edits: [[DM, 'const landsOn = (r) => !!r && r.dodged !== true;', 'const landsOn = () => true;']] },
  { name: 'the Bracers save every fourth', case: 'shot-save', edits: [[SG, "saves: { ammo: true, every: 3, hit: true }", "saves: { ammo: true, every: 4, hit: true }"]] },
  /* (lane/designer-sig-batch5: the Ledger's count as set, every fourth; at the every fifth it was, the case's fourth cast pays) */
  { name: 'the Ledger frees every fifth', case: 'cast-every-free', edits: [[SG, "costs: { of: 'spell', pay: 'none', every: 4 }", "costs: { of: 'spell', pay: 'none', every: 5 }"]] },
  { name: 'every is never counted', case: 'cast-every-free', edits: [[SCO, '    if (n !== 0) paysOther = false;\n', '']] },
  { name: 'a free cast waits on the mana gate', case: 'cast-every-free', edits: [[AB, "  if (int(hero.mana) < row.mana && !paysWithoutMana(hero, row, row.mana, atMs)) return 'mana';", "  if (int(hero.mana) < row.mana) return 'mana';"]] },
  { name: 'a window never shuts', case: 'heal-window', edits: [[SCO, "const open = readyAt(u.cds, '~w:' + s.id) > atMs;", "const open = readyAt(u.cds, '~w:' + s.id) > 0;"]] },
  { name: 'the Leggings\' clock at 5 s', case: 'heal-window', edits: [[SG, 'ms: 5000, clockMs: 40000 }', 'ms: 5000, clockMs: 5000 }']] },
  /* (lane/designer-sig-batch5: the line as it was, 30% mana, read 3.0 coin steps: the healer drinks before it gets there) */
  { name: 'the Leggings at 30% mana', case: 'heal-window', edits: [[SG, 'belowManaPm: 500, ms: 5000', 'belowManaPm: 300, ms: 5000']] },
  { name: 'the Hood\'s line is never read', case: 'spell-health', edits: [[SCO, '  if (c.aboveHpPm !== undefined && !(int(u.hp) * 1000 > c.aboveHpPm * int(u.maxHp))) paysOther = false;\n', '']] },
  { name: 'a health cost may leave its caster under 1 HP', case: 'spell-health', edits: [[SCO, 'int(u.hp) - mana >= 1 ? { mana: 0, hp: mana, writes }', 'true ? { mana: 0, hp: mana, writes }']] },
  { name: 'a health cost takes no health', case: 'spell-health', edits: [[AB, '    if (cost.hp > 0) u.hp = int(u.hp) - cost.hp;\n', '']] },
  /* (the Plate at the 8% that read 22.0 pace steps, over the band) */
  { name: 'the Plate at 8%', case: 'aura-guard', edits: [[SG, 'aura: { takenPm: -40, r: 2 }', 'aura: { takenPm: -80, r: 2 }']] },
  { name: 'an aura reaches past its r', case: 'aura-guard', edits: [[SA, 'w === unit || (Number.isInteger(a.r) && cheb(w, unit) <= a.r)', 'w === unit || Number.isInteger(a.r)']] },
  { name: 'a blow reads no aura', case: 'aura-guard', edits: [[DM, "isHero(u) ? auraEffects(inst, u, 'takenPm') : null", 'null']] },
  { name: 'a standing effect is never folded into its key', case: 'aura-guard', edits: [[SE, '  for (const e of held) keys = foldStanding(keys, e);\n', '']] },
  { name: 'regen reads no aura', case: 'aura-regen', edits: [[AB, '  if (aura) pm = Math.floor((pm * (1000 + aura)) / 1000);\n', '']] },
  /* (the Rein at the 15% whose own half read 19.0 pace steps, over the band) */
  { name: 'the Rein at 15%', case: 'pair-heal-guard', edits: [[SG, "aura: { takenPm: -75, with: 'convoy_bell', belowPm: 500 }", "aura: { takenPm: -150, with: 'convoy_bell', belowPm: 500 }"]] },
  { name: 'with is never read', case: 'pair-heal-guard', edits: [[SA, '    if (a.with !== undefined && !partnerIn(inst, w, a.with)) continue;\n', '']] },
  { name: 'the Bell lifts its heals on every ally', case: 'pair-heal-guard', edits: [[SA, "a.to === 'with' ? unit !== w && unit.signature === a.with :", "a.to === 'with' ? unit !== w :"]] },
  { name: 'the pair\'s line is never read', case: 'pair-heal-guard', edits: [[SA, '    if (a.belowPm !== undefined && !(int(unit.hp) * 1000 < a.belowPm * int(unit.maxHp))) continue;\n', '']] },
  { name: 'a heal reads no aura', case: 'pair-heal-guard', edits: [[HRL, '  if (lift) n = Math.floor((n * (1000 + lift)) / 1000);\n', '']] },
  { name: 'a save never happens', case: 'fall-save', edits: [[DM, '  const saved = r.killed && isHero(target) && saversOf(inst).length ? saveFall(inst, sc, target, r) : null;', '  const saved = null;']] },
  { name: 'the save has no clock', case: 'fall-save', edits: [[FSV, '    if (readyAt(w.cds, key) > sc.atMs) continue;\n', '']] },
  /* (lane/designer-sig-batch5: the Cloak's clock as it was, an hour, read +21.3 Bold steps against Steady, over the band) */
  { name: 'the Cloak once an hour', case: 'fall-save', edits: [[SG, 'save: { clockMs: 4500000 }', 'save: { clockMs: 3600000 }']] },
  { name: 'a save leaves the pull on', case: 'fall-save', edits: [[DM, '  if (saved) fallBackNow(inst, sc);\n', '']] },
  { name: 'a hero left at 1 HP reads as a death', case: 'fall-save', edits: [[DZ, '(u.hp > 0 ? Math.max(1, Math.floor((u.hp * 1000) / u.maxHp)) : 0)', 'Math.floor((Math.max(0, u.hp) * 1000) / u.maxHp)']] },
  /* ── batch 5 (lane/signatures-batch-5): each row's case, each engine piece's mutant ── */
  { name: 'a free cast trains on what it paid', case: 'magic-xp-written', edits: [[AB, '  const plain = paid !== written ?', '  const plain = false ?']] },
  { name: 'the reward credits the mana paid', case: 'magic-xp-written', edits: [[REW, '        const basis = Number.isInteger(ev.xpMana) ? ev.xpMana : ev.mana;', '        const basis = ev.mana;']] },
  { name: 'a free Storm cast trains on its whole written mana', case: 'magic-xp-written', edits: [[AB, '    if (plain !== undefined) xpMana = plain - Math.min(', '    if (false) xpMana = plain - Math.min(']] },
  { name: 'a cast counts no wind-up it ended', case: 'interrupt-shield', edits: [[AB, '    if (winding && !m.cast) ended++;\n', '']] },
  { name: 'the interrupt moment is never queued', case: 'interrupt-shield', edits: [[AB, "  if (ended > 0) queueOn(inst, u, 'interrupt', { t, ability: row.id, n: ended });\n", '']] },
  { name: 'the Maul shields 6%', case: 'interrupt-shield', edits: [[SG, "{ on: 'interrupt', of: 'stagger', do: 'shield', pm: 100 }", "{ on: 'interrupt', of: 'stagger', do: 'shield', pm: 60 }"]] },
  { name: 'a reaction\'s monster is never aimed at', case: 'guard-parry', edits: [[AB, '      if (cx && cx.guard && fresh.includes(cx.guard)) return cx.guard;\n', '']] },
  { name: 'a reaction\'s strike takes another monster', case: 'guard-parry', edits: [[AB, '    if (!pick || pick.why || (foe && pick.target !== foe)) continue;', '    if (!pick || pick.why) continue;']] },
  { name: 'a cast reaction names no monster', case: 'guard-parry', edits: [[RX, "{ target: ctx.t || null, foe: monsterOf(ctx), free: row.free === true }", "{ target: ctx.t || null, free: row.free === true }"]] },
  { name: 'within is never read', case: 'guard-parry', edits: [[RX, '  if (row.within !== undefined && !(ctx.t && cheb(u, ctx.t) <= row.within)) return;\n', '']] },
  { name: 'the Breeches guard 2 tiles', case: 'guard-parry', edits: [[SG, "{ on: 'windup', within: 1, do: 'cast', move: 'parry' }", "{ on: 'windup', within: 2, do: 'cast', move: 'parry' }"]] },
  { name: 'min is never read', case: 'gash-whetted', edits: [[RX, '  if (row.min !== undefined && !(int(ctx.n) >= row.min)) return;\n', '']] },
  { name: 'Whetted at 30%', case: 'gash-whetted', edits: [[STD, "castPm: 400,\n    castOf: Object.freeze(['rend'])", "castPm: 300,\n    castOf: Object.freeze(['rend'])"]] },
  { name: 'the Hooks Whet on any Gash', case: 'gash-whetted', edits: [[SG, "{ on: 'cast', of: 'gash', min: 3, do: 'boon'", "{ on: 'cast', of: 'gash', do: 'boon'"]] },
  { name: 'a Brace is never spent', case: 'power-braced', edits: [[DM, "Array.isArray(target.statuses) && target.statuses.length) spendOnce(target, sc, 'takenPm');", 'false) spendOnce(target, sc, \'takenPm\');']] },
  { name: 'a tick spends the Brace', case: 'power-braced', edits: [[DM, "  if (isHero(target) && !(ability && ability.dot) && Array.isArray(target.statuses)", '  if (isHero(target) && Array.isArray(target.statuses)']] },
  { name: 'Braced cuts nothing', case: 'power-braced', edits: [[STD, 'takenPm: -500, once: true', 'takenPm: -1, once: true']] },
  { name: 'the Mitts Brace on any cast', case: 'power-braced', edits: [[SG, "{ on: 'cast', of: 'power_strike', do: 'boon', to: 'self', status: 'braced' }", "{ on: 'cast', do: 'boon', to: 'self', status: 'braced' }"]] },
  { name: 'a standing raise is never read', case: 'earth-shell-raise', edits: [[AB, "+ (typeof u.signature === 'string' ? castRaiseOf(u, row) : 0);", '+ 0;']] },
  { name: 'a raise reads every Earth cast', case: 'earth-shell-raise', edits: [[SCA, " || (r.of === 'shell' && !shells(row))) return 0;", ') return 0;']] },
  { name: 'a raise reads any family', case: 'earth-shell-raise', edits: [[SCA, 'if (!r || familyOf(row) !== r.family ||', 'if (!r ||']] },
  { name: 'the Ring at 50%', case: 'earth-shell-raise', edits: [[SG, "raise: { family: 'earth', pm: 300, of: 'shell' }", "raise: { family: 'earth', pm: 500, of: 'shell' }"]] },
  { name: 'a wind-up queues no moment', case: 'windup-blunt', edits: [[MSP, "  if (isHero(t)) for (const h of reactorsOf(inst)) if (h !== t && isAlly(h, t)) queueOn(inst, h, 'windup', { t, src: u });\n", '']] },
  { name: 'a wind-up at the wearer counts', case: 'windup-blunt', edits: [[MSP, 'if (h !== t && isAlly(h, t)) queueOn(inst, h, \'windup\'', 'if (isAlly(h, t) || h === t) queueOn(inst, h, \'windup\'']] },
  { name: 'the Boots read any ally\'s wind-up', case: 'windup-blunt', edits: [[SG, "{ on: 'windup', belowPm: 500, do: 'status', status: 'blunted' }", "{ on: 'windup', do: 'status', status: 'blunted' }"]] },
  { name: 'a cast keeps no heals', case: 'circle-again', edits: [[HRL, '  if (cast && cast.healed) cast.healed.push([t, n]);\n', '']] },
  { name: 'again picks the highest', case: 'circle-again', edits: [[RX, 'if (a.alive === true && (!t || share(a) < share(t) ||', 'if (a.alive === true && (!t || share(a) > share(t) ||']] },
  { name: 'the Apron heals again at half', case: 'circle-again', edits: [[SG, "do: 'heal', to: 'again', pm: 1000 }", "do: 'heal', to: 'again', pm: 500 }"]] },
  { name: 'the settle never syncs the Signature', case: 'real-settle', edits: [['src/core/combat-sim.js', '  syncSignature(u, m.hero);', '  void syncSignature;']] },
  { name: 'the member drops the Signature', case: 'real-settle', edits: [['src/core/member.js', "        ...(typeof h.wornSignature === 'string' && h.wornSignature ? { wornSignature: h.wornSignature } : {}),\n", '']] },
  { name: 'Signatures switched on', case: 'dark', edits: [['src/data/signatures.js', '  live: false,', '  live: true,']] },
  { name: 'the settle hands a hero its Signature', case: 'dark', edits: [['src/core/combat-sim.js', '  syncSignature(u, m.hero);', '  syncSignature(u, { wornSignature: m.hero.wornSignature });']] },
  /* (lane/t1-traits-drop) the scan still bites past the settle's projection, and the projection hands the read's own field */
  { name: 'another server file hands a Signature', case: 'dark', edits: [['supabase/functions/hr-accrue/accrue-hunt.js', 'export function accrueHunt(inp) {', 'export const wornSignature = null;\nexport function accrueHunt(inp) {']] },
  { name: 'the settle hands a Signature of its own making', case: 'dark', edits: [['supabase/functions/hr-accrue/hunt-settle.js', "_wornSignature: typeof m.worn_signature === 'string' && m.worn_signature ? m.worn_signature : null,", "_wornSignature: 'cairn_belt',"]] },
];

const R = makeReport('signature-rules');
const M0 = await load(ROOT);
for (const [cn, fn] of Object.entries(cases)) {
  let why = null;
  try { why = await fn(M0); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
if (!process.argv.includes('--no-mutants')) for (const mu of mutants) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits, ['src/render', 'supabase/functions/hr-accrue', 'tests/hunt-core/fixtures']);
  try {
    let why = null;
    try { why = await cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    /* SIG_WHY=1 prints what each mutant tripped, so a mutant caught only by a throw shows */
    if (process.env.SIG_WHY) console.log('  mutant "' + mu.name + '" -> ' + String(why).slice(0, 160));
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + mutants.length + ' mutants caught');
R.finish();
