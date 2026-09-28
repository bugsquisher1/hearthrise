# 1. The Standings: your rival on Home, a named crown for every skill, and the gap on the boards

VERDICT: GO-WITH-CHANGES | class A: true | est 1.5 h

PLAYER VALUE: This pack makes the shared world personal. Today a player's rank is only visible if they open Social, and every skill's number one is called 'Grandmaster <Skill>' (leaderboards.js:89, :390-394). After this pack, Home says who you can catch and by how much: 'You stand #2 on the Mining board, 3,140 xp behind Cynessa.' That gives a player in days 7-30 a named person and a number to chase tonight, and a crown worth taking. The header of leaderboards.js:11-14 describes this as the whole retention mechanism of a leaderboard; today it is hidden one tab away. The pack also folds in a copy fix on the same Social screen: the Friends card tells players to 'add the players you meet', but no friends feature exists (legacy.js:8933).

PROBLEMS TO FIX IN THIS LANE (each is a condition):
- 1. CONFIRMED (code), P1-class honesty (section 6), blast radius self. SLOT MISMATCH. The boards rank slot 0 only: supabase/migrations/2026-08-18-leaderboard-server-source.sql:66-73, where ps.slot = 0 at :282, and player_skills s.slot = 0 in the lv CTE. Row A picks the best skill from the ACTIVE hero's server record (HearthriseSkillRecord; the slot comes from src/multi-character.js activeSlot()). So a player on hero slot 1-4 would read their slot-0 hero's rank and gap on Home as 'You stand #2...'. FIX: draw the Home block and the Social sentence only when HearthriseProfile.activeSlot() === 0; a missing accessor means the block is not drawn. Pin it with a pure eligible({signedIn, slot, online}) and an in-page test (STAND-B).
- 2. CONFIRMED, section 6 (unknown is never 0). skillXpOr(G,id,fb) returns the fallback for UNKNOWN (src/net/skill-record.js:95-98), so the brief's 'skip Row A while skills are unknown' cannot be built on it. FIX: use skillXpNum (null means unknown) and skip Row A if any skill is null. Never call a *ForDisplay( accessor (tests/no-new-prediction.mjs:80 counts it as PRED-1, which would go red). Never read G.skills raw (no-client-copy-of-projection check 4).
- 3. CONFIRMED (by construction): a retry storm, and polling while Home is hidden. Home re-renders every 1.5 s while visible (src/features/home-dashboard.js:1841-1852). HearthriseHome.render() is also called unconditionally from daily-reward.js:336 and identity.js:996. The brief caches only answers, so a fail, unsupported, available:false or rate refusal is re-fetched on every render: about 40 calls/min, doubled by the anon retry on 401 (src/features/leaderboards.js:176-186). Its 'repaint via HearthriseHome.render' also paints a hidden panel. FIX: a negative cache per uid|board for 5 min. Fetch only when signed in, #panel-profile is active and document.visibilityState is 'visible', with one in-flight latch. No explicit repaint; the visible-only 1.5 s loop picks the answer up (same shape as src/net/town.js REFUSAL_BACKOFF_MS and its visibility rule).
- 4. CONFIRMED: the cache is not keyed by account. Signing out and in as another account in the same tab would show the previous account's standing for up to 5 min. FIX: key every cache entry by uid|board, with the uid taken before the await.
- 5. CONFIRMED (by construction), section 6 'browser says one thing'. Social fetches on every paint (leaderboards.js:569), while Home would hold a private 5-min answer. After 'Boards ->' the board can show #1 while Home still says #2. FIX: the one transport keeps the newest ACCEPTED RPC answer per uid|board: LAST, written in fetchBoard, published as HearthriseLeaderboards.lastBoard(id). Home reads only that, so both screens show the newest answer the client has. The legacy reader never writes LAST, because its rank is derived in the browser.
- 6. PLAUSIBLE, self. On an expired token, rpc() retries as anon (leaderboards.js:176-186), and the server answers rank:null because auth.uid() is null. As specified, Home would then say 'You have no place on the Mining board yet' to a ranked player. FIX: Home never draws standing.unranked, and a rank-null row is omitted. Social uses the unranked line only inside its existing signedIn() branch (:519-522).
- 7. CONFIRMED (node collision scan over 702 in-game names), copy integrity. Four crowns collide with existing names. 'the Archmage' is a monster in the Boss of the Day pool (src/core/botd.js:32,:47) and the Archmage gear tier (src/data/gear-tiers.js:149). 'the Deep Seam' is a named rally, 'The Deep Seam' (src/features/muster.js:99), and a CHANGELOG content band. 'the Tidecaller' is close to the mythic Tidecaller's Pearl (src/data/items.js:809). 'the Bulwark' is close to Warband Bulwark (src/data/wave3-uniques.js:19). STAND-2 as written checks only BOARDS crowns, hero titles and renown names, so it would pass all four. FIX: rename them to defense 'the Steadfast', magic 'the Spellwright', mining 'the Veinfinder' and fishing 'the Netmaster'. With those four renamed, the re-scan finds 0 collisions. STAND-2 must cover the whole name corpus.
- 8. CONFIRMED: a missed file turns an existing guard RED. src/features/smoke/muster-nav-and-identity.js:2347 asserts _crownFor('skill:mining') === 'Grandmaster Mining', and the pack does not list this file. Update the expected crown in place (tests are never deleted, TF-3). Also update :2379 'not ranked' to 'no place on the', so it matches the new unranked copy and stays green whether or not a session exists.
- 9. CONFIRMED: registration misses tests/ci-shape.baseline.json. A new guard command is CI-SHAPE-6 UNREGISTERED until the baseline is regenerated with `node tests/ci-shape.mjs --write`. A new STEP after smoke.yml:2737 is also the likeliest anchor for sibling batch-5 packs. FIX: append the two commands to the existing 'Skill guide coverage' step (smoke.yml:2592-2596, client-guards job), then regenerate the baseline. The in-flight lanes edit smoke.yml at :375, :1411 and :2151 and ci-shape.baseline.json at :17, :84 and :143. None of them touches src/features/**, src/legacy.js, src/main.js or src/data/signposts.js, so these hunks are disjoint. lane/settle-before-mutate-f1 also edits tools/lane-done.mjs; do not touch it.
- 10. CONFIRMED: wiring and anchor errors. (a) 'chronicle.milestonesNone' is at signposts.js:31, not :33. (b) The LABELS belong in the labels block (:48-60), not in lines. (c) fill() does not escape (src/features/signposts.js:16-22), so callers must write esc(fill(...)). (d) leaderboards.js is a CLASSIC script (index.html:1261) and cannot import src/data/standings.js. crownFor must read window.HearthriseStandings.crownFor at call time, one direction only: ST.crownFor reads data and never calls back into LB, so there is no recursion. (e) Publishing at module eval breaks the setupX + boot() pattern (main.js:510-540) and would stop tests/standings.mjs importing the module in Node. Use setupStandings() plus boot('standings').
- 11. CONFIRMED, scope. The Social note would append the sentence for every board, but units exist only for skill boards and total_level. On clan_power, 'you' is your clan (v_subject = clan_id, 2026-08-18 migration :452-456). FIX: standingLine returns null for any board except 'skill:*' and 'total_level'.
- 12. MINOR. STAND-A asserts a literal '3,140', which depends on the locale; use (3140).toLocaleString(). 'No digit' must be checked on textContent, because glyph SVG path data contains digits. Scale: the Home block makes every Home viewer an hr_leaderboard reader, and each read does count(*) over the board partition. Pass p_limit 1 through an optional fetchBoard(boardId, limit), whose default stays TOP_N.
- CLOSED / BOUNDED / REMAINING (not blockers). CLOSED: no server surface. hr_leaderboard already exists, rate-gated per user at 120/min (2026-08-29-rpc-gate-bucket-restore.sql:54-58), with no grant change. Edge hash: with every file the pack touches modified, `pack-edge hr-accrue --hash` still printed 184a155a...114f. The positive control (a one-line edit to src/core/xp.js) moved it to d666bb41.... BOUNDED: every number comes from one server answer, and a stamped matview snapshot is at most 5 min old plus settle lag. REMAINING: display names are validated server-side (3-20 chars, charset, reserved list; profiles writes revoked at 2026-08-11-chat-name-authority.sql:130) but not profanity-filtered, so Home now puts an adjacent player's name in a more prominent place than Social and the Common already do. Baseline: 12 cheap guards run on a b559 tree copy all exited 0. lane-done was not run: this was a read-only review with no branch.

---

LANE: lane/content-b5-1-standings. Branch from origin/release/b559 at 467dcf90. Every new or edited ESM import uses ?v=559. CLASS A: client-only. No migration, no SQL, no edge file, no deploy. Never push main or next. Never commit docs/, reports, visual-qa output or findings.json. Never touch tests/live-hash-drift.baseline.json or tools/lane-done.mjs. No git stash (commit WIP on the branch). No bNNN build numbers in any new or edited comment (CR-2/CR-3). legacy.js net lines = 0 (MONO-1). No new CSS and no overlay.

GOAL: Home gets a 'Your standing' block with two rows: your best skill board, and Total Level. Every rank, total, rival name and score comes from ONE hr_leaderboard answer. Each skill board's rank 1 gets a named crown. The Social note gets the same sentence. The Friends empty row stops promising a feature that does not exist.

1. NEW src/data/standings.js (pure data, no imports):
// Client-only display copy: the crown each skill board's rank 1 wears. No src/core or src/data module may import it (tests/standings.mjs STAND-3).
export const STANDING_CROWNS = Object.freeze({ attack: 'the First Blade', strength: 'the Iron Arm', defense: 'the Steadfast', hitpoints: 'the Unbowed', prayer: 'the Graveward', magic: 'the Spellwright', ranged: 'the Farshot', woodcutting: 'the Oakfeller', mining: 'the Veinfinder', fishing: 'the Netmaster', farming: 'the Harvest Keeper', cooking: 'the Feastmaker', crafting: 'the Fine Hand', smithing: 'the Anvil', runecrafting: 'the Sealmaker', stonemason: 'the Wallwright', bountyHunter: 'the Huntmaster' });
The rest of the rank-1 titles stay as they are: the Throne, the Peerless, the Magnate, the Champion, the Bane, the High Seat.

2. src/data/signposts.js.
LINES: insert after :31 ('chronicle.milestonesNone'):
'standing.chase': { text: 'You stand {rank} on the {board} board, {gap} behind {rival}.', vars: ['rank','board','gap','rival'] },
'standing.level': { text: 'You stand {rank} on the {board} board, dead level with {rival}; whoever gains next takes the place.', vars: ['rank','board','rival'] },
'standing.crown': { text: 'You hold the {board} crown as {crown}, {gap} clear of {rival}.', vars: ['board','crown','gap','rival'] },
'standing.crownAlone': { text: 'You hold the {board} crown as {crown}, and nobody else has a place on that board yet.', vars: ['board','crown'] },
'standing.unranked': { text: 'You have no place on the {board} board yet; the boards are read again every few minutes.', vars: ['board'] },
'standing.read': { text: 'The boards are read every few minutes, so what you did just now shows on the next reading.' },
LABELS: insert after :52 ('war.clanClosed'):
'standing.heading': 'Your standing', 'standing.boards': 'Boards', 'standing.pending': 'Reading the boards', 'standing.podium': 'On the podium', 'standing.ten': 'In the first ten', 'standing.roll': 'On the honour roll',
Every one of these 12 keys must appear as a quoted literal in src/features/standings.js (SIGN-1). The ' →' arrow is appended in code, not stored in a label.

3. NEW src/features/standings.js (ESM). No top-level window or DOM access.
Imports: STANDING_CROWNS from '../data/standings.js?v=559'; SIGNPOSTS from '../data/signposts.js?v=559'; fill from './signposts.js?v=559'. Local esc (the & < > " ' map) and fmt = n => Number(n).toLocaleString(). LB means window.HearthriseLeaderboards, read at call time.
Exports:
- TTL_MS = 300000.
- crownFor(boardId): returns STANDING_CROWNS[id] for 'skill:<id>', otherwise null. It reads only the data and never calls LB.
- eligible({signedIn, slot, online}): returns signedIn === true && slot === 0 && online === true. The boards rank slot 0 only (2026-08-18-leaderboard-server-source.sql:66-73, :282).
- bandFor(boardId, rank, total):
  - rank 1: LB.crownFor(boardId).
  - ranks 2-3: label 'standing.podium'.
  - ranks 4-10: label 'standing.ten'.
  - ranks 11-25: label 'standing.roll'.
  - otherwise: '#' + fmt(rank) + ' of ' + fmt(total).
- standingLine(boardId, ans): returns {key, text} or null. It is pure over a reduced answer {rank, total, top, near, available}. The returned text is unescaped; callers escape it.
  - Return null unless boardId === 'total_level' or boardId starts with 'skill:'.
  - Return null if ans.available === false.
  - If ans.rank == null: key 'standing.unranked'.
  - rows = top concatenated with near. me = the row with rank === ans.rank; if me is missing, return null.
  - rank > 1: rival = the row with rank-1 (missing: return null); gap = rival.score - me.score.
  - rank 1: rival = the row with rank 2. If there is none, use 'standing.crownAlone'. Otherwise gap = me.score - rival.score.
  - gap === 0 uses 'standing.level'. Otherwise use 'standing.chase' (rank > 1) or 'standing.crown' (rank 1).
  - Vars: rank = '#' + fmt(rank); board = LB.BOARDS[id].label; crown = LB.crownFor(id); rival = rival.name.
  - gap on skill boards = fmt(gap) + ' xp'. On total_level = fmt(gap) + (gap === 1 ? ' level' : ' levels').
- unrankedText(boardId): fill('standing.unranked', { board: LB.BOARDS[boardId].label }).
- cardHtml(model): uses existing Home classes only.
  - model null (pending): the header h3 'standing.heading', then .hd-rows with one .hd-card.hd-duo. Its .mi holds a glyph and its .bd .s holds esc(label 'standing.pending'). No number.
  - model {rows: [{boardId, ans}], refreshedAt}: the .hd-h header also carries <a data-st-open="FIRST_BOARD_ID">Boards →</a>, with 'Boards' taken from label 'standing.boards'.
  - Each row is .hd-card.hd-duo:
    - .mi: window.HR.icon(LB.BOARDS[id].glyph, 20, 'var(--gold-2)')
    - .bd .t: the board label
    - .bd .s: esc(standingLine(...).text)
    - .when: esc(bandFor(...))
  - Foot: .hd-card.hd-mini with esc(fill('standing.read')) + ' · ' + esc(LB.agoText(refreshedAt)). Use the OLDEST refreshedAt among the rows drawn.
  - Tokens only, no hex values.
- card(G):
  - Return '' unless eligible({ signedIn: HearthriseAuth.isSignedIn(), slot: HearthriseProfile.activeSlot(), online: LB.capability() !== 'offline' }). Any missing accessor also returns ''.
  - Boards: [bestSkillBoard, 'total_level']. bestSkillBoard: for id of LB.SKILL_ORDER, xp = HearthriseSkillRecord.skillXpNum(G, id). If any xp is null, there is no Row A. Otherwise the highest xp > 0 wins, ties go by SKILL_ORDER order, and renown is never chosen.
  - For each board: hit = LB.lastBoard(id). If there is no hit, or Date.now() - hit.at >= TTL_MS, call kick(id).
  - Draw a row only if hit exists, hit.res.available !== false, hit.res.rank != null, and standingLine returns a line. Home never draws 'standing.unranked'.
  - If no row is drawn: return cardHtml(null) only while some board has no hit and no negative-cache entry. Otherwise return ''.
- kick(id), internal:
  - Only one fetch in flight across both boards.
  - Proceed only if document.visibilityState === 'visible' and #panel-profile has the class 'active'.
  - Skip if NEG[uid + '|' + id] > Date.now().
  - Call LB.fetchBoard(id, 1). If the result's action !== 'accept', or available === false, or it throws: NEG[key] = Date.now() + TTL_MS.
  - Never call HearthriseHome.render. Home's own visible-only 1.5 s loop repaints.
- setupStandings(): publish window.HearthriseStandings = Object.freeze({ crownFor, eligible, bandFor, standingLine, unrankedText, cardHtml, card, TTL_MS }). Add one document click listener: on a click inside [data-st-open], call window.showTab('social'), then LB.selectBoard(id).
FORBIDDEN in this file: hr_leaderboard, rpc(, fetch(, any *ForDisplay( call, G.skills, any write to G, localStorage, HearthriseStorage, G.gold, G.gems, addItem, hearth_token.

4. src/features/leaderboards.js (classic script):
- (a) The comment at :30-31 changes "Grandmaster Miner" to "the Veinfinder".
- (b) Near UNAVAILABLE, add: var LAST = Object.create(null);
- (c) crownFor at :390-394:
  function crownFor(boardId) {
    var b = BOARDS[boardId];
    if (!b || !b.crown) return '';
    var ST = window.HearthriseStandings;
    var named = (b.skill && ST && typeof ST.crownFor === 'function') ? ST.crownFor(boardId) : null;
    if (named) return named;
    return b.skill ? (b.crown + ' ' + b.label) : b.crown;
  }
- (d) fetchBoard(boardId, limit):
  - p_limit becomes Math.max(1, Math.min(TOP_N, +limit || TOP_N)).
  - Before the await: var lastKey = (myId() || '') + '|' + boardId;
  - After the RPC's reduceBoard, if d.action === 'accept': LAST[lastKey] = { res: d, at: Date.now() };
  - The legacy degraded reader never writes LAST.
- (e) boardHtml at :516-522:
  - In the rank != null branch, inside the same lb-note, append ' ' + esc(line.text). Only when ST && ST.eligible({ signedIn: signedIn(), slot: (window.HearthriseProfile && typeof window.HearthriseProfile.activeSlot === 'function') ? window.HearthriseProfile.activeSlot() : null, online: true }), and line = ST.standingLine(boardId, { rank: view.rank, total: view.total, top: view.top, near: view.block, available: true }) is non-null.
  - Replace the :522 sentence with esc(ST && ST.unrankedText ? ST.unrankedText(boardId) : 'You have no place on this board yet.').
- (f) Add to the window.HearthriseLeaderboards object: crownFor: crownFor, agoText: agoText, lastBoard: function (id) { return LAST[(myId() || '') + '|' + id] || null; }. Keep every _ seam.

5. src/features/home-dashboard.js: insert ONE line after :1667, before the Hunter's Ledger line at :1668:
try { var ST = window.HearthriseStandings; if (ST && typeof ST.card === 'function') html += ST.card(G); } catch (e) { /* display only */ }

6. src/legacy.js:8933, edited in place with 0 net lines. The text becomes: No friends list yet. The boards above show who is climbing beside you, and the Common on Home shows who is out and about.

7. src/main.js: add `import { setupStandings } from './features/standings.js?v=559';` after :453. Add `boot('standings', setupStandings);` after :534.

8. TESTS.
(a) NEW tests/standings.mjs, in lore-notes style: a pure check(world) and loadReal(). Exit 0 green, 1 red, 2 harness. --selftest runs a clean arm that must be green, then plants one defect per id; each must be caught by its own id.
- STAND-1: keys(STANDING_CROWNS) equals the SKILL_ORDER literal parsed from src/features/leaderboards.js, which equals keys(SKILLS_DEF) from src/data/skills.js. 17 each.
- STAND-2: every crown matches /^the [A-Z][A-Za-z' -]{2,20}$/ and the crowns are unique. Take core = the crown lowercased, minus 'the '. core must not be a substring of any name in the corpus, and no corpus name of 5+ chars may be a substring of core.
  The corpus:
  - MONSTERS[*].name
  - ITEMS[*].n and GEAR_ITEMS[*].n
  - HEARTHFIND_TROPHIES[*].titleName and HEARTHFIND_SET_TITLE.name
  - CHARM_RANK_NAMES and TROPHY_STAGE_NAMES
  - SKILL_GUIDE[*].title
  - renown name/title, via /name: '([^']+)', +title: '([^']+)'/ in src/features/renown.js
  - BOARDS crowns, via /crown: '([^']+)'/ in leaderboards.js
  - rally names, via /name: '(The [^']+)'/ in src/features/muster.js
  Non-vacuity: the corpus must hold at least 600 names.
- STAND-3: the pack('hr-accrue') origins list has at least 10 files and contains neither new file. No src/core or src/data module imports either file (SIGN-7 SPEC_RE). src/data/standings.js has no import.
- STAND-4: the comment-stripped src/features/standings.js contains none of the FORBIDDEN list, and no G write /\bG\.[\w$]+\s*=(?!=)/.
- Selftest plants:
  - STAND-1: delete 'mining'.
  - STAND-2: magic becomes 'the Archmage'.
  - STAND-3: a src/core/zz.js importing '../data/standings.js'.
  - STAND-4: fetch('x') appended to the source.
- RED-before: run node tests/standings.mjs before adding src/data/standings.js. It exits non-zero; report the code.
- GREEN-after: exit 0, and --selftest exits 0 with 4 of 4 caught.
REGISTER: append two lines to the EXISTING step 'Skill guide coverage - every skill has a line and an honest ladder' (.github/workflows/smoke.yml:2592-2596, client-guards job), after `node tests/skill-guide-coverage.mjs --selftest`:
          node tests/standings.mjs
          node tests/standings.mjs --selftest
Also add one comment line above that step. Do NOT add a new step. Then run `node tests/ci-shape.mjs --write`; never hand-edit the JSON. Then `node tests/ci-shape.mjs` must exit 0.
(b) In-page, src/features/smoke/muster-nav-and-identity.js:
- :2347 in place: 'Grandmaster Mining' becomes 'the Veinfinder'.
- :2379 in place: 'not ranked' becomes 'no place on the'.
- Add two tests after the 'ranking pays nothing' test (ends :2349). Each has 20 code lines or fewer and zero G writes.
STAND-A: 'STAND-A: the standing sentence reads one server answer'.
- A = ST.standingLine('total_level', {rank:7, total:38, top:[], near:[{rank:6,name:'Bran<b>',score:412},{rank:7,name:'Me',score:400}]}). Expect key 'standing.chase', and text contains '12 levels behind Bran<b>'.
- ST.cardHtml({rows:[{boardId:'total_level', ans:{...same, available:true}}], refreshedAt:null}) contains 'Bran&lt;b&gt;' and never 'Bran<b>'.
- Rank 1 on skill:mining with scores 5000/1860: key 'standing.crown', and text contains 'the Veinfinder' and (3140).toLocaleString() + ' xp clear of'.
- Equal scores give 'standing.level'. rank null gives 'standing.unranked'. A rank-1 answer with only its own row gives 'standing.crownAlone'. standingLine('wealth', ...) is null.
STAND-B: 'STAND-B: crowns, eligibility and the pending card'.
- LB._crownFor('skill:mining') === 'the Veinfinder' and LB._crownFor('wealth') === 'the Magnate'.
- ST.eligible({signedIn:true,slot:1,online:true}) === false.
- ST.eligible({signedIn:false,slot:0,online:true}) === false.
- ST.eligible({signedIn:true,slot:0,online:true}) === true.
- A div's innerHTML = ST.cardHtml(null): its textContent contains 'Reading the boards' and matches no /\d/.
- Object.keys(ST).join(' ') matches no /claim|grant|reward|payout|token/i.
RED-before / GREEN-after: `node tests/run-smoke.mjs --only "STAND-"` exits 1 before the src changes. After them it must print the FILTERED banner with 0 failed; exit 2 is by design (tests/run-smoke.mjs:4151-4155). Also run `--only "ranking pays nothing"` and `--only "no emoji in the leaderboard"`: 0 failed each. Do not run the full suite locally; the full-suite record is the GitHub run.

9. GATES. Paste each real exit code:
- `node tools/pack-edge.mjs hr-accrue --hash` must print 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f.
- These must each exit 0:
  - node tests/standings.mjs, and with --selftest
  - node tests/signposts.mjs, and with --selftest
  - node tests/ci-shape.mjs
  - node tests/guard-hygiene.mjs
  - node tests/window-globals-exist.mjs
  - node tests/dead-exports.mjs
  - node tests/no-new-prediction.mjs
  - node tests/no-client-copy-of-projection.mjs
- `node tools/lane-done.mjs`: paste its last line, which must be 'lane-done: all green.'
- Proof PNGs at 1280x800 and 922x423: Home with the block (one podium row, one chase row) and the Social Mining board note.
  - Take them headless on the harness page (window.__HR_TEST_HARNESS__ = true).
  - Stub ONLY inside page.evaluate: HearthriseAuth.isSignedIn returns true, HearthriseProfile.activeSlot returns 0, and HearthriseLeaderboards.lastBoard returns fixture answers with refreshedAt = now - 4 min. No product-code seam.
  - Commit the PNGs only to the branch qa/content-b5-1-standings.
  - Read them: at 922x423, .when must not crush .s.
- Play gate, done by the Coordinator on live after the cut: on the QA account's slot 0, check the Home block at desktop and at 922x423. 'Boards →' must open that board, and the rank-1 row must wear its crown. Switch to a hero on another slot: the block must be absent.

10. MERGE. Before reporting, merge origin/release/b559, or the set branch the Coordinator names, into this branch yourself.
- If tests/ci-shape.baseline.json conflicts with a sibling batch-5 pack, take either side and regenerate it with --write.
- The in-flight lanes touch other lines: world-tick-stall-after-repoint, settle-before-mutate-f1 and settle-before-mutate-f2f3 edit smoke.yml at :375, :1411 and :2151, and ci-shape.baseline.json at :17, :84 and :143. None of them touches this pack's src files.
Report: one table plus at most three sentences.

REVIEW BASIS (security). No server surface changes. hr_leaderboard is an existing public reader, per-user 120/min bucket. Edge hash: with all the pack's files modified, `pack-edge --hash` still printed the value above; a one-line edit to src/core/xp.js as a control moved it. Every number shown comes from one server answer, stamped with its reading time. Residual accepted: rival display names are validated server-side but not profanity-filtered, and now appear on Home.
