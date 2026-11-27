#!/usr/bin/env node
// mutant-rule-functions: pure
// ════════════════════════════════════════════════════════════════════════
// tests/piece-client.mjs — THE BROWSER'S HALF OF A TRAIT PIECE: IT READS THE SERVER'S ROWS, SAYS THE DROP ONCE, LISTS IT ON THE RETURN CARD,
// AND SENDS ONLY IDS AND THE SERVER'S PRICE (lane/t1b-piece-verbs, backend-architect, 2026-11-26; 12-targets 8.6, 1072-piece-verbs.sql).
//
//   node tests/piece-client.mjs            the rules
//   node tests/piece-client.mjs --mutate   every planted defect must turn a rule RED
//
// ci-step: client-guards | Trait pieces in the browser - the readers, the drop moment, the return card line, the two intents
// ci-run: node tests/piece-client.mjs
// ci-run: node tools/mutant-gate.mjs node tests/piece-client.mjs --mutate
//
// mutant-anchors: src/session/piece-sections.js src/session/piece-intents.js src/shell/piece-words.js src/shell/windows/away.js src/shell/share-card.js src/core/upgrade-pick.js supabase/functions/hr-accrue/company-wear.js src/shell/widgets/upgrade-line.js src/session/item-sections.js
// mutant-writes-tree: no — every mutant is planted into a temp copy of src (tests/_pure-guard.mjs planted)
//
//   PC-1  THE READERS (src/session/piece-sections.js): dark (no section) reads null and nothing; lit, a row reads as the server sent it, a
//         malformed one is dropped; the piece worn in a slot is this hero's AND only while the slot holds its base (the server's own join);
//         the free pieces leave out the worn and the escrowed; a return card's pieces are its session's and this hero's; the drop
//         moment's are the ids the answer's hunt_settle.found names
//   PC-2  THE DROP MOMENT (src/shell/piece-words.js pieceNewsOf): one `rare` alert a piece this hero just found (the answer's found, or a
//         fresh find of its open hunt a frame carried), each once, none for an old find, another hero's or a closed hunt's; its words name
//         the piece and its Traits; the share card stands it as a Rare (share-card.js cardFacts reads the row)
//   PC-3  THE RETURN CARD (src/shell/windows/away.js awayBlockOf): the hero's block lists the pieces its hunt found, none for a town job
//   PC-4  THE INTENTS (src/session/piece-intents.js): the wear sends the slot, the piece's id, the equip slot and a fresh key, nothing else;
//         the sale sends the price the section showed, never another; an ok answer IS the character (taken, no second read: rule 11); a
//         refusal re-reads once; a piece with no price is never sent to the store
//   PC-5  EQUIP UPGRADES WEIGHS A WORN PIECE IN STEPS, BOTH PATHS (src/core/upgrade-pick.js; lane/piece-gear-fixes): the window's plan (the
//         browser, upgrade-line.js upgradeOf) and the Start's wear lines (the server's pick over the envelope, hr-accrue/company-wear.js, the
//         browser closed) agree: a plain body one tier up takes a plain steel body (CONTROL) and never a Rare one; a plain piece of MORE
//         steps than the Rare's base and Traits takes it, one of exactly as many does not (a tie keeps it), a higher rank holds its slot
//         longer, a Signature is never taken off, a piece another hero wears is no reason; the Start never hands a freed Rare's base on
//   PC-6  ANOTHER OPEN HERO READS THE NEWEST LIST (item-sections.js storageOf / accountSection): a piece sold on one hero is gone from the
//         other's list at once, its sales left with it; a hero read alone keeps its own
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { runPureGuard } from './_pure-guard.mjs';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444', E = '55555555-5555-4555-8555-555555555555';
const NOW = 1_800_000_000_000;
const row = (id, o) => Object.assign({ id, base: 'steel_platebody', slot: 'body', rarity: 'rare', traits: [{ id: 'first_rank', rank: 1 }], signature: null, il: 60,
  ground: 'muster_barrows', depth: 3, found_by: 0, session: 's1', at_ms: NOW - 60000, worn: null, escrow: null, sell: 26184 }, o);
const SECTION = {
  pieces: [
    row(A, { worn: { slot: 0, equip_slot: 'body' } }),                         // worn by this hero
    row(B, { traits: [{ id: 'first_rank', rank: 3 }], sell: 39276 }),          // free, found this hunt, fresh
    row(C, { escrow: 'market' }),                                              // escrowed
    row(D, { found_by: 1, at_ms: NOW - 30000 }),                               // another hero's find
    row(E, { session: 's0', at_ms: NOW - 86400000 }),                          // an old hunt's
    { id: 'not-a-uuid', base: 'x', rarity: 'rare' },                           // malformed
  ],
  sell_left: 19,
};
const csOf = (data) => ({ slot: 0, status: 'ready', read: (k) => data[k], record: { residue: {} } });

async function pure(base) {
  const out = [];
  const u = async (p) => import(pathToFileURL(join(base, p)).href);
  const PS = await u('src/session/piece-sections.js'), PW = await u('src/shell/piece-words.js'), PI = await u('src/session/piece-intents.js');
  const AW = await u('src/shell/windows/away.js'), SC = await u('src/shell/share-card.js');
  const lit = csOf({ pieces: SECTION, equipment: { body: 'steel_platebody' }, hunt: { session_id: 's1', ended: false } });

  /* PC-1 */
  const dark = csOf({ pieces: null, equipment: { body: 'steel_platebody' } });
  if (PS.piecesOf(dark) !== null || PS.freePiecesOf(dark).length || PS.wornPieceOf(dark, 'body') !== null || PS.foundNowOf(dark).length) out.push('PC-1 a dark section reads something');
  const sec = PS.piecesOf(lit);
  if (!sec || sec.pieces.length !== 5 || sec.sellLeft !== 19) out.push('PC-1 the section reads ' + JSON.stringify(sec && { n: sec.pieces.length, left: sec.sellLeft }));
  const b = sec && sec.pieces.find((p) => p.id === B);
  if (!b || b.sell !== 39276 || b.il !== 60 || b.foundBy !== 0 || b.traits[0].rank !== 3 || b.worn !== null) out.push('PC-1 a row reads ' + JSON.stringify(b));
  const worn = PS.wornPieceOf(lit, 'body');
  if (!worn || worn.id !== A) out.push('PC-1 the worn body reads ' + JSON.stringify(worn));
  if (PS.wornPieceOf(csOf({ pieces: SECTION, equipment: { body: 'bronze_platebody' } }), 'body') !== null) out.push('PC-1 a piece whose base left its slot reads worn');
  if (PS.wornPieceOf(Object.assign(csOf({ pieces: SECTION, equipment: { body: 'steel_platebody' } }), { slot: 1 }), 'body') !== null) out.push('PC-1 another hero\'s worn piece reads as this hero\'s');
  const free = PS.freePiecesOf(lit).map((p) => p.id).join(',');
  if (free !== [B, D, E].join(',')) out.push('PC-1 the free pieces read ' + free);
  const found = PS.piecesFoundIn(lit, 's1').map((p) => p.id).join(',');
  if (found !== [A, B, C].join(',')) out.push('PC-1 the hunt s1 found ' + found);
  const now = PS.foundNowOf(csOf({ pieces: SECTION, hunt_settle: { found: [{ id: E }] } })).map((p) => p.id).join(',');
  if (now !== E) out.push('PC-1 the answer\'s found reads ' + now);

  /* PC-2 */
  const told = new Set();
  const news = PW.pieceNewsOf(lit, (id) => told.has(id), 'Rook', NOW);
  const ids = news.map((n) => n.id).sort().join(',');
  if (ids !== ['piece:' + A, 'piece:' + B, 'piece:' + C].sort().join(',')) out.push('PC-2 the fresh finds of the open hunt say ' + ids);
  const nb = news.find((n) => n.id === 'piece:' + B);
  if (!nb || nb.kind !== 'rare' || nb.item !== 'steel_platebody' || !nb.piece || !/Steel Platebody/.test(nb.text) || !/First Rank III/.test(nb.text)) out.push('PC-2 a drop reads ' + JSON.stringify(nb));
  for (const n of news) told.add(n.id);
  if (PW.pieceNewsOf(lit, (id) => told.has(id), 'Rook', NOW).length) out.push('PC-2 a drop said twice');
  if (PW.pieceNewsOf(lit, () => false, 'Rook', NOW + 3600000).length) out.push('PC-2 an hour-old find is news');
  if (PW.pieceNewsOf(csOf({ pieces: SECTION, hunt: { session_id: 's1', ended: true } }), () => false, 'Rook', NOW).length) out.push('PC-2 a closed hunt\'s find is news');
  const answer = PW.pieceNewsOf(csOf({ pieces: SECTION, hunt_settle: { found: [{ id: E }] } }), () => false, 'Rook', NaN).map((n) => n.id).join(',');
  if (answer !== 'piece:' + E) out.push('PC-2 the answer\'s found says ' + answer);
  const card = nb ? SC.cardFacts(nb) : null;
  if (!card || card.standing !== 'rare') out.push('PC-2 the share card stands the piece as ' + JSON.stringify(card && card.standing));

  /* PC-3 */
  const block = AW.awayBlockOf(lit, { session: 's1', facts: { hunt: 'muster_barrows' } });
  if (!block || (block.pieces || []).map((p) => p.id).join(',') !== [A, B, C].join(',')) out.push('PC-3 the return card lists ' + JSON.stringify(block && (block.pieces || []).map((p) => p.id)));
  if ((AW.awayBlockOf(lit, { session: 's1', work: 'w1', facts: {} }).pieces || []).length) out.push('PC-3 a town job\'s card lists pieces');

  /* PC-4 */
  const sent = [];
  let loaded = null, resynced = 0;
  const server = (ans) => ({ rpc: async (name, args) => { sent.push([name, args]); return ans; } });
  const cs = { slot: 2, status: 'ready', load: async (held) => { loaded = held === undefined ? 'read' : held; return true; }, resync: async () => { resynced++; return true; } };
  const env = { ok: true, version: 9, pieces: SECTION };
  const pa = sec ? sec.pieces.find((p) => p.id === B) : null;
  const w = await PI.wearPiece({ server: server({ ok: true, body: env }) }, cs, pa, 'body');
  const [wn, wa] = sent[0] || [];
  if (!w.ok || wn !== 'hr_piece_wear' || JSON.stringify(Object.keys(wa || {}).sort()) !== JSON.stringify(['p_equip_slot', 'p_idem', 'p_piece', 'p_slot'])
      || wa.p_slot !== 2 || wa.p_piece !== B || wa.p_equip_slot !== 'body' || !/^[0-9a-f-]{36}$/.test(String(wa.p_idem))) out.push('PC-4 the wear sent ' + JSON.stringify(sent[0]));
  if (loaded !== env) out.push('PC-4 an ok wear did not take its answer as the character (' + JSON.stringify(loaded) + ')');
  sent.length = 0; loaded = null;
  const s = await PI.sellPiece({ server: server({ ok: true, body: env }) }, cs, pa);
  const [sn, sa] = sent[0] || [];
  if (!s.ok || sn !== 'hr_piece_sell' || !sa || sa.p_gold !== 39276 || sa.p_piece !== B || JSON.stringify(Object.keys(sa).sort()) !== JSON.stringify(['p_gold', 'p_idem', 'p_piece', 'p_slot'])) out.push('PC-4 the sale sent ' + JSON.stringify(sent[0]));
  if (loaded !== env) out.push('PC-4 an ok sale did not take its answer as the character');
  sent.length = 0;
  const r = await PI.sellPiece({ server: server({ ok: true, body: { ok: false, error: 'quote_changed', gold: 40000 } }) }, cs, pa);
  if (r.ok || resynced !== 1) out.push('PC-4 a refused sale answered ' + JSON.stringify(r) + ' after ' + resynced + ' re-read(s)');
  sent.length = 0;
  const none = await PI.sellPiece({ server: server({ ok: true, body: env }) }, cs, Object.assign({}, pa, { sell: null }));
  if (none.ok || sent.length) out.push('PC-4 a piece with no price went to the store');

  /* PC-5 */
  const UL = await u('src/shell/widgets/upgrade-line.js'), CW = await u('supabase/functions/hr-accrue/company-wear.js');
  const KIT = { body: 'steel_platebody', helmet: 'steel_helm', pants: 'steel_platelegs', boots: 'steel_boots', weapon: 'steel_sword', shield: 'coppercap_shield' };
  /* a Level 140 hero in the steel kit, the bag's pieces and the pieces it wears (each a row of the section, worn by hero 0 in its slot) */
  const heroEnv = (bag, worn, o = {}) => ({ ok: true, inventory: bag, equipment: Object.assign({}, KIT, o.equipment || {}), skills: {},
    level: { xp: 1, level: 140, into: 0, need: 100 }, tally: null, hunt_settings: null,
    pieces: { pieces: worn.map(([k, p], i) => row([A, B, C, D][i], Object.assign({ base: KIT[k], slot: k, worn: { slot: o.slot || 0, equip_slot: k } }, p))), sell_left: 20 } });
  /* what each path would put on: the window's plan (the browser, upgrade-line.js upgradeOf) and the Start's wear lines (the server's pick over
     the envelope, hr-accrue/company-wear.js: the browser closed) */
  const viewed = (e) => UL.upgradeOf(Object.assign(csOf(e), { slot: 0 })).ops;
  const closed = (e) => Object.fromEntries(CW.wearLinesFor([{ slot: 0, env: e }]).filter((l) => l.slot === 0).map((l) => [l.equip_slot, l.item]));
  const both = (label, e, slot, want) => {
    for (const [path, ops] of [['viewed', viewed(e)], ['closed', closed(e)]]) {
      if ((ops[slot] || null) !== want) out.push('PC-5 (' + path + ') ' + label + ': ' + slot + ' takes ' + JSON.stringify(ops[slot] || null) + ', want ' + JSON.stringify(want));
    }
  };
  const R1 = [{ id: 'first_rank', rank: 1 }], R3 = [{ id: 'first_rank', rank: 3 }];
  /* CONTROL: the plain steel body takes the Mithril one tier up (the pick sees the bag) */
  both('a plain steel body (CONTROL)', heroEnv({ mithril_platebody: 1 }, []), 'body', 'mithril_platebody');
  both('a Rare steel body (First Rank I) against a plain body one tier up', heroEnv({ mithril_platebody: 1 }, [['body', { traits: R1 }]]), 'body', null);
  both('a Rare steel body (First Rank I) against a plain body two tiers up (more steps)', heroEnv({ rune_platebody: 1 }, [['body', { traits: R1 }]]), 'body', 'rune_platebody');
  both('a Rare steel body (First Rank III) against a plain body two tiers up', heroEnv({ rune_platebody: 1 }, [['body', { traits: R3 }]]), 'body', null);
  both('a Rare steel sword (File Breaker I) against a plain sword of exactly its steps (a tie keeps the Rare)',
    heroEnv({ mithril_sword: 1 }, [['weapon', { traits: [{ id: 'file_breaker', rank: 1 }] }]]), 'weapon', null);
  both('a Signature steel body against a plain body two tiers up', heroEnv({ rune_platebody: 1 }, [['body', { rarity: 'signature', traits: [], signature: 'cairn_belt' }]]), 'body', null);
  both('a piece another hero wears (not this one\'s)', heroEnv({ mithril_platebody: 1 }, [['body', { traits: R1 }]], { slot: 1 }), 'body', 'mithril_platebody');
  /* a Rare taken off for a better plain piece is freed by the server, never a bag copy: the Start never hands its base to another hero */
  const two = CW.wearLinesFor([{ slot: 0, env: heroEnv({ rune_platebody: 1 }, [['body', { traits: R1 }]]) },
    { slot: 1, env: Object.assign(heroEnv({}, [], { slot: 1 }), { equipment: Object.assign({}, KIT, { body: 'bronze_platebody' }) }) }]);
  if (two.some((l) => l.item === 'steel_platebody')) out.push('PC-5 the Start passed a freed Rare\'s base to a hero: ' + JSON.stringify(two));

  /* PC-6 */
  const older = csOf({ pieces: SECTION, now: '2026-11-27T10:00:00Z', bank: {} });
  const newer = csOf({ pieces: { pieces: SECTION.pieces.filter((p) => p.id !== B), sell_left: 18 }, now: '2026-11-27T10:00:05Z', bank: {} });
  const IS = await u('src/session/item-sections.js');
  const acct = IS.storageOf(newer);
  const shown = PS.piecesOf(Object.assign(older, { accountStorage: () => acct }));
  if (!shown || shown.pieces.some((p) => p.id === B) || shown.sellLeft !== 18) out.push('PC-6 another open hero still lists a piece sold on this one: ' + JSON.stringify(shown && { ids: shown.pieces.map((p) => p.id), left: shown.sellLeft }));
  const alone = PS.piecesOf(csOf({ pieces: SECTION, now: '2026-11-27T10:00:00Z', bank: {} }));
  if (!alone || !alone.pieces.some((p) => p.id === B)) out.push('PC-6 a hero read alone lost its own list');
  return out;
}

const MUTANTS = [
  ['a piece reads worn with its base gone', 'src/session/piece-sections.js', ' && eq[k] === p.base) || null;', ') || null;'],
  ['the free pieces keep the worn', 'src/session/piece-sections.js', "return sec ? sec.pieces.filter((p) => !p.worn && !p.escrow) : [];", "return sec ? sec.pieces.filter((p) => !p.escrow) : [];"],
  ['a return card lists another hero\'s finds', 'src/session/piece-sections.js', 'p.session === sid && p.foundBy === cs.slot', 'p.session === sid'],
  ['the answer\'s found is never read', 'src/session/piece-sections.js', 'const sec = ids && ids.size ? piecesOf(cs) : null;', 'const sec = null;'],
  ['every old find is news', 'src/shell/piece-words.js', 'nowMs - p.atMs <= PIECE_NEWS_MS', 'true'],
  ['a drop is said every time', 'src/shell/piece-words.js', ".filter((p) => !told('piece:' + p.id))", '.filter(() => true)'],
  ['the sale sends its own price', 'src/session/piece-intents.js', 'p_gold: piece.sell,', 'p_gold: piece.sell + 1,'],
  ['an ok answer is read again', 'src/session/piece-intents.js', 'await cs.load(b);', 'await cs.load();'],
  ['the return card drops the pieces', 'src/shell/windows/away.js', 'pieces: hunt && cs && a.session ? piecesFoundIn(cs, a.session) : [],', 'pieces: [],'],
  ['the share card stands the base', 'src/shell/share-card.js', "standing: standingOf(a.piece && typeof a.piece === 'object' ? a.piece : a.item)", 'standing: standingOf(a.item)'],
  ['Equip upgrades weighs a worn piece as its base', 'src/core/upgrade-pick.js', 'if (piece && !(plainStepsPm(slot, id) > pieceAt)) continue;', 'if (false) continue;'],
  ['a Trait is worth no steps', 'src/core/upgrade-pick.js', 'steps += (row.trade === true ? GEAR_STEPS.tradeSteps : GEAR_STEPS.traitSteps)[x.rank - 1];', 'steps += 0;'],
  ['a tie strips the Rare', 'src/core/upgrade-pick.js', '!(plainStepsPm(slot, id) > pieceAt)', '!(plainStepsPm(slot, id) >= pieceAt)'],
  ['a Signature is priced as its base', 'src/core/upgrade-pick.js', "if (!piece || piece.rarity === 'signature' || piece.signature || !ITEMS[piece.base]) return null;", 'if (!piece || !ITEMS[piece.base]) return null;'],
  ['a piece reads as worn by every hero', 'src/core/upgrade-pick.js', 'if (!w || w.slot !== slot ||', 'if (!w ||'],
  ['the Start reads no pieces', 'supabase/functions/hr-accrue/company-wear.js', 'wearInputOf((k) => h.env[k], h.slot)', 'wearInputOf((k) => h.env[k])'],
  ['the window reads no pieces', 'src/shell/widgets/upgrade-line.js', 'pieces: wornPiecesOf(cs),', 'pieces: null,'],
  ['another hero reads its own old list', 'src/session/piece-sections.js', "accountSection(cs, 'pieces')", "cs.read('pieces')"],
  ['the account copy carries no pieces', 'src/session/item-sections.js', "pieces: isObj(read(cs, 'pieces')) ? read(cs, 'pieces') : null } : null;", 'pieces: null } : null;'],
];

process.exitCode = await runPureGuard({ mutate: process.argv.includes('--mutate'), guard: 'tests/piece-client.mjs', pure, mutants: MUTANTS,
  /* the Start's wear lines are the edge's own file (PC-5 closed), its imports of src the planted copy's */
  copy: ['supabase/functions/hr-accrue'],
  green: 'Trait pieces in the browser: the readers, the drop said once, the return card line, ids and the server\'s price only' });
