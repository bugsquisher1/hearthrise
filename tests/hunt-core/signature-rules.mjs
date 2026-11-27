// tests/hunt-core/signature-rules.mjs — A WORN SIGNATURE IN THE FIGHT: the sample of 5 and batch 2 play their rules as reactions, dark for
// players (lane/signatures-sample and lane/signatures-batch-2, systems, 2026-11-26; src/core/hunt/signature-rules.js, src/data/signatures.js,
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
//   first-blow-half   #1 Bannerman's Pavise: a Challenge lays Blunted on each monster it takes (not one it did not); that monster's next
//                     swing lands half of what the same swing lands without it, and the stack is spent on it
//   cast-count-shield #2 Ossuary Helm: a Frost Slam that Chills 3 shields the wearer 9% of max health, one that Chills 6 holds at 15%;
//                     another move's cast nothing
//   shell-break-ready #3 Grave Guard's Mail: a shell the wearer cast breaking makes Challenge ready; another hero's shell nothing
//   kill-recast       #4 Charred Sabre: a Flame Strike kill casts Flame Strike again on the nearest monster, no mana and no rune; the
//                     free cast's own kill casts nothing more
//   ready-power       #5 Pikeman's Gauntlets: a Flame Strike hit makes Power Strike ready; another move's hit nothing
//   cast-poison       #7 Floodwater Hatchets: a Rend lays Poison ticking 20% of the whole cast's damage over 6 s, a fixed tick
//   marked-bleed      #9 Lurcher's Collar (re-written): a hit on a marked monster lays a Bleed stack, not on an unmarked one, once a 4 s clock
//   kill-ready-clock  #10 Coal Runner's Bow: a Flame Volley kill makes Flame Volley ready, then not again inside 10 s
//   reset-two         #11 Provost's Longbow: a Precision Shot hit takes 1 s off Flame Volley and 1 s off Raking Shot
//   hit-poison        #12 Wyvern Barb Crossbow: a Raking Shot hit lays Poison ticking 20% of that hit over 6 s
//   kill-burst        #13 Hall Fire Wand: a Fireball kill bursts 30% of the fallen's max health on each monster next to it, none further; a
//                     burst's own kill bursts nothing
//   hit-silence       #15 Catacomb Shroud: a Hoarfrost hit Silences its monster 3 s; another move's hit nothing
//   break-kindle      #16 Lamplighter's Robe: the wearer's own shell breaking Kindles it; its next Fireball casts 30% stronger and spends it,
//                     the one after casts plain
//   heal-guard        #17 Bargeman's Pole: a Greater Mend on a hero under half its health as it begins (healed past the line or not) Guards it -20%
//                     taken for 4 s; one on a hero over the line nothing
//   absorb-reflect    #21 Drover's Hat: a monster's blow the wearer's shell takes lands half of what it took back on that monster, exact;
//                     another hero's shell nothing
//   low-mend-chill    #23 Ferry Pennies: a Mend begun under 40% Chills every monster next to the wearer 3 s, none further; over the line nothing
//   reset-from-move   The Wood Book: any Frost Lance hit makes Hoarfrost ready now, another move's nothing; the has filter (a planted
//                     row): only on a chilled target, or another move's
//                     hit on a chilled one, nothing; the chill is read as the hit lands
//   heal-boon         Brewer's Apron: a Circle of Renewal landing on a hero gives it Emboldened for 4 s (+10% dealt), once a hero a cast;
//                     another heal gives nothing
//   real-settle       THE BOTH PATHS (CLAUDE.md section 4): a Muster four each playing a Signature (the sample's, then batch 2's) plays a
//                     different hunt from the same four with none, the boon, the Collar's Bleed, the Pavise's Blunted and the Hat's reflected
//                     blows show on its events, and each settles the same in 10-minute and 100-second windows
//   dark              SIGNATURE_RULES.live is false and no src or server file but the engine's three readers names `wornSignature`; a hero
//                     with none writes no field (the switch off plays as before: engine-parity holds with no re-pin)
//
// mutant-anchors: src/core/hunt/signature-rules.js src/core/hunt/reactions.js src/core/hunt/react-queue.js src/core/hunt/damage.js src/core/hunt/heal-rules.js src/core/hunt-spawn.js src/core/member.js src/core/combat-sim.js src/data/signatures.js supabase/functions/hr-accrue/hunt-settle.js supabase/functions/hr-accrue/accrue-hunt.js src/core/hunt/abilities.js src/core/hunt/status.js src/core/hunt/targeting.js src/data/statuses.js
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
    /* BATCH 2 (15 "Batch 2": #1 to #23 less the sample and #8; #19 and #20 wait on a cell where mana binds, #22 is batch 3's) */
    const BATCH_2 = ['bannermans_pavise', 'ossuary_helm', 'grave_guards_mail', 'charred_sabre', 'pikemans_gauntlets', 'floodwater_hatchets', 'coal_runners_bow',
      'provosts_longbow', 'wyvern_barb_crossbow', 'hall_fire_wand', 'catacomb_shroud', 'lamplighters_robe', 'bargemans_pole', 'drovers_hat', 'ferry_pennies'];
    const ids = Object.keys(M.SG.SIGNATURES);
    if (ids.join() !== SAMPLE.concat(BATCH_2).join()) return 'the Signatures are ' + ids + ', not the ruled sample and batch 2';
    if (BATCH_2.length + 1 > 20) return 'batch 2 is ' + (BATCH_2.length + 1) + ' rows, over the 20 a batch may hold (CLAUDE.md section 10)';
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
    const g = H(M, 1, 10, 3, 'healer', { mana: 999, maxMana: 999 }), a = H(M, 2, 11, 3, 'tank', { hp: 100 }), b = H(M, 3, 12, 3, 'mage', { hp: 200 });
    const inst = fight(M, [g, a, b]);
    wear(M, g, 'brewers_apron');
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
    /* the same Challenge and the same swings, the wearer and a plain tank: the taunted monster's first swing lands half */
    const play = (worn) => {
      const k = H(M, 1, 12, 3, 'tank', { hp: 5000, maxHp: 5000 }), o = H(M, 2, 14, 6, 'mage', { hp: 5000, maxHp: 5000 });
      const a = E(M, 10, 0, 13, 3, 2, { maxHit: 400 }), b = E(M, 11, 0, 13, 4, 2, { maxHit: 400 }), far = E(M, 12, 0, 30, 9, 2, { maxHit: 400 });
      /* (off the Danger scale: a fixture world's pull has no low line yet, so on it every swing reads as a fall back) */
      const inst = fight(M, [k, o, a, b, far], { leader: 1, risk: null });
      if (worn) wear(M, k, 'bannermans_pavise');
      const sc = sc2(M, 41);
      M.targeting.challengeFrom(inst, sc, k); M.RX.drainReactions(inst, sc);
      for (const m of [a, b, far]) m.swingLeftMs = 0;
      const blunted = [a, b, far].map((m) => stacksOf(m, 'blunted').length);
      M.movement.occupancy(inst);
      M.damage.resolveAttacks(inst, sc);
      const took = sc.events.filter((e) => e.type === 'dmg' && e.t === 1).map((e) => e.amount);
      return { k, a, b, far, blunted, took, after: [a, b].map((m) => stacksOf(m, 'blunted').length) };
    };
    const w = play(true), p = play(false);
    if (w.a.target !== 1 || w.b.target !== 1) return 'CONTROL: the Challenge did not take both monsters';
    if (w.blunted.join() !== '1,1,0') return 'Blunted on the taken, the taken and the far monster: ' + w.blunted + ' (want 1,1,0)';
    if (p.blunted.join() !== '0,0,0') return 'a plain tank\'s Challenge Blunted: ' + p.blunted;
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
    if (three.k.shield !== 90) return 'a Frost Slam that Chilled 3: a shield of ' + three.k.shield + ' (want 3% x 3 of 1000)';
    if (six.k.shield !== 150) return 'a Frost Slam that Chilled 6: a shield of ' + six.k.shield + ' (want the 15% cap, 150)';
    if (!other.cast || other.k.shield) return 'another move\'s cast shielded: ' + other.k.shield;
    return null;
  },
  'shell-break-ready': (M) => {
    const k = H(M, 1, 12, 3, 'tank'), o = H(M, 2, 13, 3, 'mage', { hp: 200, maxHp: 200 }), q = H(M, 3, 14, 4, 'healer'), m = E(M, 10, 0, 13, 4, 2);
    const inst = fight(M, [k, o, q, m]);
    wear(M, k, 'grave_guards_mail');
    const sc = sc2(M, 43, 1000);
    k.cds = { challenge: 9000 };
    o.shield = 30; o.shieldBy = 3;
    blowAt(M, inst, sc, m, o, 50); M.RX.drainReactions(inst, sc);
    if (k.cds.challenge !== 9000) return 'another hero\'s shell breaking readied the Challenge';
    o.shield = 30; o.shieldBy = 1;
    blowAt(M, inst, sc, m, o, 10); M.RX.drainReactions(inst, sc);
    if (k.cds.challenge !== 9000) return 'a shell that held readied the Challenge';
    blowAt(M, inst, sc, m, o, 50); M.RX.drainReactions(inst, sc);
    if (k.cds.challenge !== 1000) return 'the wearer\'s shell breaking left the Challenge at ' + k.cds.challenge + ' (want now, 1000)';
    return null;
  },
  'kill-recast': (M) => {
    const u = H(M, 1, 12, 3, 'melee_dps', { mana: 100, maxMana: 100, maxHit: 50 }), o = H(M, 2, 10, 8, 'healer');
    const a = E(M, 10, 0, 13, 3, 1, { hp: 1, maxHp: 400 }), b = E(M, 11, 0, 13, 4, 1, { hp: 1, maxHp: 400 }), c = E(M, 12, 0, 11, 3, 1, { hp: 1, maxHp: 400 });
    const inst = fight(M, [u, o, a, b, c]);
    inst.heroes = { 1: entry(M, ['flame_strike']) };
    u.target = 10;
    wear(M, u, 'charred_sabre');
    const sc = sc2(M, 44);
    M.abilities.castAbilities(inst, sc); M.RX.drainReactions(inst, sc);
    const casts = sc.events.filter((e) => e.type === 'cast' && e.ability === 'flame_strike');
    const dead = [a, b, c].filter((m) => m.alive !== true).length;
    if (casts.length !== 2) return 'a Flame Strike kill cast ' + casts.length + ' Flame Strikes (want the first and one again)';
    if (casts[1].mana !== 0 || !(casts[0].gold > 0) || casts[1].gold !== 0) return 'the free cast paid: ' + JSON.stringify(casts.map((x) => [x.mana, x.gold]));
    if (u.mana !== 100 - casts[0].mana) return 'the wearer\'s mana after two casts is ' + u.mana;
    if (dead !== 2) return dead + ' monsters fell (want the first strike\'s and the free one\'s: the free cast\'s kill casts nothing more)';
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
    at(inst, sc, 4900);
    blowAt(M, inst, sc, r, mk, 5, 'precision_shot'); M.RX.drainReactions(inst, sc);
    if (stacksOf(mk, 'bleed').length !== 1) return 'a second Bleed inside the 4 s clock';
    at(inst, sc, 5000);
    blowAt(M, inst, sc, r, mk, 5, 'basic'); M.RX.drainReactions(inst, sc);
    if (stacksOf(mk, 'bleed').length !== 2) return 'no second Bleed after the 4 s clock: ' + stacksOf(mk, 'bleed').length;
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
    if (s.length !== 1 || s[0].left !== 4000 || M.SE.effectPm(a, 'takenPm') !== -200) return 'a Greater Mend begun at 25%: ' + JSON.stringify(a.statuses) + ' takenPm ' + M.SE.effectPm(a, 'takenPm') + ' (want Guarded -20% for 4 s)';
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
    if (m.hp !== 970) return 'the wearer\'s shell took 60 and sent back ' + (1000 - m.hp) + ' (want half, 30)';
    blowAt(M, inst, sc, m, a, 100); M.RX.drainReactions(inst, sc);
    if (m.hp !== 950) return 'the shell took its last 40 and sent back ' + (970 - m.hp) + ' (want 20: only what it took)';
    return null;
  },
  'low-mend-chill': (M) => {
    const u = H(M, 1, 12, 3, 'tank', { hp: 150, maxHp: 1000 }), a = E(M, 10, 0, 13, 3, 1), b = E(M, 11, 0, 11, 4, 1), far = E(M, 12, 0, 15, 3, 1);
    const inst = fight(M, [u, a, b, far]);
    wear(M, u, 'ferry_pennies');
    const sc = sc2(M, 56);
    const mend = M.AD.ABILITIES.mend;
    M.HR.landHeal(u, u, 100, sc, false, M.AD.ABILITIES.greater_mend, false, { inst, fx: null }); u.hp = 150; M.RX.drainReactions(inst, sc);
    if (stacksOf(a, 'chill').length) return 'another heal under the line Chilled';
    M.HR.landHeal(u, u, 300, sc, false, mend, false, { inst, fx: null }); M.RX.drainReactions(inst, sc);
    const got = [a, b, far].map((m) => stacksOf(m, 'chill').map((s) => s.left).join());
    if (got.join('|') !== '3000|3000|') return 'a Mend begun at 15%: Chill on the two beside and the far one ' + got.join('|') + ' (want 3000|3000|)';
    a.statuses = []; b.statuses = [];
    M.HR.landHeal(u, u, 100, sc, false, mend, false, { inst, fx: null }); M.RX.drainReactions(inst, sc);
    if (stacksOf(a, 'chill').length) return 'a Mend begun at ' + (u.hp - 100) / 10 + '% Chilled';
    return null;
  },
  'real-settle': async (M) => {
    const { loadPlay } = await import(pathToFileURL(join(M.root, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
    const P = await loadPlay(M.root);
    const four = ['tank', 'ranger', 'mage', 'healer'];
    const SIG = ['cairn_belt', 'lurchers_collar', 'the_wood_book', 'brewers_apron'];
    /* batch 2's on the same four: the Pavise's Blunted on each monster taunted, the Longbow's cuts, the Wand's bursts, the Hat's reflected blows */
    const SIG2 = ['bannermans_pavise', 'provosts_longbow', 'hall_fire_wand', 'drovers_hat'];
    const go = (sig, windowMs) => {
      const seen = { boon: 0, bleed: 0, blunted: 0, reflect: 0 };
      const r = P.run('muster_barrows', 60, four, { spanMs: 900000, windowMs, secret: '-4611686018427387904', options: () => ({ risk: 'steady', danger: 570 }),
        equipment: (role, i, L) => ({ ...P.kitFor(L, role), ...(role === 'ranger' ? { ammo: 'steel_arrows' } : {}) }),
        bag: (role) => (role === 'ranger' ? { steel_arrows: { loaded: 400 } } : {}),
        ...(sig ? { signature: (role, i) => sig[i] } : {}),
        /* (the healer opens on Circle of Renewal: the reference bar heals with Greater Mend alone) */
        bar: () => [{ action: { type: 'ability', id: 'circle_of_renewal' }, conditions: [], join: 'and' },
          /* (and wards the hurt: the reference bar casts no Protective Ward, which Drover's Hat reads) */
          { action: { type: 'ability', id: 'protective_ward' }, conditions: [{ op: 'lt', value: 95, metric: 'ally_hp_pct', subject: 'lowest' }], join: 'and' },
          ...P.refBar('muster_barrows')],
        onWindow: (out) => { for (const e of out.events || []) {
          if (e.type === 'status_on' && e.status === 'emboldened') seen.boon++;
          /* (no seat of this four lays a Bleed of its own: every Bleed is the Collar's) */
          if (e.type === 'status_on' && e.status === 'bleed') seen.bleed++;
          if (e.type === 'status_on' && e.status === 'blunted') seen.blunted++;
          if (e.type === 'dmg' && e.ability === 'reflect') seen.reflect++;
        } } });
      return { sig: JSON.stringify({ t: r.totals, x: r.heroXp, seen }), seen };
    };
    const plain = go(null, 600000), closed = go(SIG, 600000), viewed = go(SIG, 100000);
    if (plain.seen.boon || plain.seen.bleed || plain.seen.blunted || plain.seen.reflect) return 'a four with no Signature played one: ' + JSON.stringify(plain.seen);
    if (!closed.seen.boon) return 'Brewer\'s Apron never gave its boon on the real settle';
    if (!closed.seen.bleed) return 'Lurcher\'s Collar never laid a Bleed on the real settle: ' + JSON.stringify(closed.seen);
    if (plain.sig === closed.sig) return 'the four with Signatures played exactly the hunt of the four with none';
    if (closed.sig !== viewed.sig) return 'the same Signatures settled in 10-minute and 100-second windows played two hunts';
    const closed2 = go(SIG2, 600000), viewed2 = go(SIG2, 100000);
    if (!closed2.seen.blunted || !closed2.seen.reflect) return 'batch 2 on the real settle: ' + JSON.stringify(closed2.seen);
    if (plain.sig === closed2.sig) return 'the four with batch 2\'s Signatures played exactly the hunt of the four with none';
    if (closed2.sig !== viewed2.sig) return 'batch 2\'s Signatures settled in 10-minute and 100-second windows played two hunts';
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
const TG = 'src/core/hunt/targeting.js';
const HRL = 'src/core/hunt/heal-rules.js';
const SG = 'src/data/signatures.js';
const STD = 'src/data/statuses.js';
const mutants = [
  { name: 'a list plays its last Signature', case: 'worn-signature', edits: [[SR, '.filter((id) => own(SIGNATURES, id)).slice(0, SIGNATURE_RULES.perHero);', '.filter((id) => own(SIGNATURES, id)).reverse();']] },
  { name: 'no Signature plays at all', case: 'worn-signature', edits: [['src/data/signatures.js', '  perHero: 1,', '  perHero: 0,']] },
  { name: 'heroSetup drops the Signature', case: 'worn-signature', edits: [['src/core/hunt-spawn.js', '    ...(sg ? { wornSignature: sg } : {}),\n', '']] },
  { name: 'a boundary adds the rows again', case: 'worn-signature', edits: [[SR, '.filter((r) => r.sig !== true)', '.filter(() => true)']] },
  { name: 'the Roads\' rows go with the Signature', case: 'worn-signature', edits: [[SR, '    u.reacts = rest && rest.length ? rest.concat(signatureReacts(id)) : signatureReacts(id);', '    u.reacts = signatureReacts(id);']] },
  { name: 'a line-less hp_below passes the check', case: 'rows', edits: [['src/data/talents.js', "  if (e.on === 'hp_below' && e.belowPm === undefined) out.push('hp_below names its line (belowPm)');\n", '']] },
  { name: 'the line is read when the queue drains, not as the blow lands', case: 'low-health-shield', edits: [[RQ, ' && holdsNow(row, ctx, inst.atMs)) (inst.reactQ', ') (inst.reactQ']] },
  { name: 'the hero\'s own health is never queued', case: 'low-health-shield', edits: [[DM, "  if (target.alive) queueOn(inst, target, 'hp_below', { t: target });\n", '']] },
  { name: 'a death is the killer\'s only', case: 'pass-on-death', edits: [[DM, "for (const h of rs) queueOn(inst, h, 'death',", "for (const h of rs) if (h === source) queueOn(inst, h, 'death',"]] },
  { name: 'a Mark moves onto a marked monster', case: 'pass-on-death', edits: [[RX, '(o) => !(int(o.markUntil) > sc.atMs)', '() => true']] },
  { name: 'a passed Mark starts its time again', case: 'pass-on-death', edits: [[RX, 'm.markPm = ctx.markPm; m.markUntil = ctx.markUntil;', 'm.markPm = ctx.markPm; m.markUntil = ctx.markUntil + 1000;']] },
  { name: 'a passed status loses its scale', case: 'pass-on-death', edits: [[RX, 'st.left = was.left; st.scale = was.scale;', 'st.left = was.left;']] },
  { name: 'has is never read', case: 'reset-from-move', edits: [[RQ, "(row.has === undefined || carries(ctx.t, row.has))", 'true']] },
  { name: 'ready waits out the cooldown', case: 'reset-from-move', edits: [[RX, '  u.cds = Object.assign({}, u.cds, { [move]: atMs });', '  u.cds = Object.assign({}, u.cds, { [move]: readyAt(u.cds, move) });']] },
  { name: 'a cast heal queues no moment', case: 'heal-boon', edits: [[HRL, "  if (inst && row) queueOn(inst, u, 'heal', { t, ability: row.id, was });\n", '']] },
  { name: 'a boon keeps the row\'s own time', case: 'heal-boon', edits: [[RX, '    if (row.ms) for (const s of t.statuses) if (s.s === st.id && s.src === u.id && s.left === st.durationMs) s.left = row.ms;\n    return true;\n  },\n});', '    return true;\n  },\n});']] },
  /* ── batch 2: each row's case, its mutant ── */
  { name: 'a Blunted swing is never spent', case: 'first-blow-half', edits: [[DM, '      spendOnce(u, sc);\n      continue;', '      continue;']] },
  { name: 'the taunt names no monsters', case: 'first-blow-half', edits: [[TG, "{ n: took.length, ms: took }", '{ n: took.length }']] },
  { name: 'Blunted cuts nothing', case: 'first-blow-half', edits: [[STD, 'dealtPm: -500, once: true', 'dealtPm: -1, once: true']] },
  { name: 'a cast queues no moment', case: 'cast-count-shield', edits: [[AB, "  if (tally) queueOn(inst, u, 'cast', { t: pick.target, ability: row.id, n: tally.n.size, dmg: tally.dmg });\n", '']] },
  { name: 'a shield ignores its cap', case: 'cast-count-shield', edits: [[RX, 'row.capPm ? Math.min(n, Math.floor((int(u.maxHp) * row.capPm) / 1000)) : n', 'n']] },
  { name: 'a cast counts one monster', case: 'cast-count-shield', edits: [[RX, 'const k = ctx.n === undefined ? 1 : int(ctx.n);', 'const k = 1;']] },
  { name: 'Grave Guard\'s Mail readies its own Shelter', case: 'shell-break-ready', edits: [[SG, "{ on: 'shield_break', do: 'ready', move: 'challenge' }", "{ on: 'shield_break', do: 'ready', move: 'shelter' }"]] },
  { name: 'a cast again waits on its cooldown', case: 'kill-recast', edits: [[AB, "gate === 'cooldown' ? !!(react && react.again) : false", 'false']] },
  { name: 'a cast again spends its rune', case: 'kill-recast', edits: [[AB, 'lines: react && react.again ? [] : s.lines', 'lines: s.lines']] },
  { name: 'the Gauntlets ready Flame Strike', case: 'ready-power', edits: [[SG, "do: 'ready', move: 'power_strike' }", "do: 'ready', move: 'flame_strike' }"]] },
  { name: 'a cast tallies no damage', case: 'cast-poison', edits: [[AB, '    if (tally) tally.dmg += r.dmg;\n', '']] },
  { name: 'the Hatchets read each hit, not the cast', case: 'cast-poison', edits: [[SG, "{ on: 'cast', of: 'rend',", "{ on: 'hit', of: 'rend',"]] },
  { name: 'marked is never read', case: 'marked-bleed', edits: [[RQ, '  && (row.marked !== true || markedAt(ctx.t, atMs));', '  && true;']] },
  { name: 'the Collar has no clock', case: 'marked-bleed', edits: [[SG, "status: 'bleed', clockMs: 4000 }", "status: 'bleed' }"]] },
  { name: 'the Coal Runner\'s Bow has no clock', case: 'kill-ready-clock', edits: [[SG, "move: 'flame_volley', clockMs: 10000 }", "move: 'flame_volley' }"]] },
  { name: 'the Longbow cuts only Flame Volley', case: 'reset-two', edits: [[SG, ",\n      { on: 'hit', of: 'precision_shot', do: 'reset', move: 'raking_shot', ms: 1000, capMs: 4000 }", '']] },
  { name: 'a status with pm lands its row\'s own tick', case: 'hit-poison', edits: [[RX, '  if (row.pm) {\n    const ms = row.ms', '  if (false) {\n    const ms = row.ms']] },
  { name: 'a burst reaches every monster', case: 'kill-burst', edits: [[RX, 'cheb(o, dead) <= row.r).sort', 'true).sort']] },
  { name: 'the Shroud Chills instead', case: 'hit-silence', edits: [[SG, "do: 'status', status: 'silenced', ms: 3000", "do: 'status', status: 'chill', ms: 3000"]] },
  { name: 'a Kindled cast is not raised', case: 'break-kindle', edits: [[AB, 'const raise = spendCastPm(u, row.id, sc);', 'const raise = 0;']] },
  { name: 'Kindled is never spent', case: 'break-kindle', edits: [[ST, '  unit.statuses = list.filter((s) => s !== spent);\n', '']] },
  { name: 'a heal reads its line after the heal', case: 'heal-guard', edits: [[HRL, '{ t, ability: row.id, was }', '{ t, ability: row.id }']] },
  { name: 'a boon ignores its strength', case: 'heal-guard', edits: [[RX, '    if (row.pw) for (const s of t.statuses) if (s.s === st.id && s.src === u.id && s.left === st.durationMs) s.pw = row.pw;\n', '']] },
  { name: 'a shell\'s blow queues nothing', case: 'absorb-reflect', edits: [[DM, "  if (Number.isInteger(shellBy) && r.absorbed > 0 && isHero(target) && isMonster(source)) queueOn(inst, unitById(inst, shellBy), 'absorb', { t: target, src: source, dmg: r.absorbed });\n", '']] },
  { name: 'a status ignores its reach', case: 'low-mend-chill', edits: [[RX, 'const list = Number.isInteger(row.r) ?', 'const list = false ?']] },
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
