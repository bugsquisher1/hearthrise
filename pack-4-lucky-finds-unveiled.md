# 4. Lucky Finds Unveiled: a reveal sheet, a welcome-back band and 'Where luck hides'

VERDICT: GO-WITH-CHANGES | class A: true | est 2 h

PLAYER VALUE: The rarest thing a week-1 hunter can meet (26 named very-rare finds, 4-30 expected hours at a spot) arrives today as a 4-9 s toast. The toast is dropped if it is queued more than 15 s (toasts.js:50-52). Overnight it is folded into 'Items found +N' on the welcome card (legacy.js:13325), even though b556 promised 'when one lands, you'll know'.

This pack gives an Idle-Clans-style reveal rendered only from the server's rare_drop events. There is a band on the return cards, and a chase list in the Bestiary: 26 hunter's rumours tie each find to its spot, with base odds and the count in your bag. That gives hunters a reason to pick a spot for the week.

PROBLEMS TO FIX IN THIS LANE (each is a condition):
- P1 CONFIRMED (code path; not reproduced live because this review was read-only). The pack uses the wrong attended/away classifier, and that silences the attended find it exists to reveal. (C) adopts the Hearthfind rule (hearthfind.js:861-863: awayMs < 60 s means attended). The settle cadence is 90 s (accrue.js:5879 SETTLE_INTERVAL_MS=90000, decideSettle :6004), and awayMs = grantMs = the credited span. So an ordinary attended settle that carries a lucky rare_drop classifies 'away' and goes to a pending band. Only two surfaces could show that band, and neither will here. The welcome modal (legacy.js:13583) opens only on a return of 30 min or more by residue stamp, once per load. The Home card draws only when classifyReceipt()==='away', i.e. 10 min or more (home-dashboard.js:1350-1372). Net effect: the hunter who is watching gets a log line and nothing else, which is worse than today's toast. There is also an ordering bug. LuckyFinds.noteEnvelope runs inside applyEnvelopeState (accrue.js:3765, reached from :5125) BEFORE G.lastOfflineSummary is written at :5136, so a synchronous classify reads the PREVIOUS envelope's receipt. Fix: queue the find synchronously and classify one task later (the hearthfind.js:852 setTimeout pattern) with HearthriseAccrual.classifyReceipt (accrue.js:5625, the one client classifier; SYNC_MAX_MS is 10 min). Blast radius: self only. Would the tests catch it? No: LUCKY-5/6 go through __present(find, mode), which bypasses classify. Guard to add: two both-path tests through applyAwayEnvelope, one with grantMs 90000 and one with 2 h.
- P1 CONFIRMED. The Home away-card band would vanish 1.5 s after it paints. home-dashboard.js render() re-runs every 1500 ms (setInterval, :1845) and calls awayCardHtml on each run (:1371). A consume-once claimAwayBand() inside awayCardHtml therefore paints once and is gone on the next repaint. Whichever of the welcome modal and the Home card renders first also takes the band from the other. Fix: make awayBandHtml() a NON-consuming read of a held band, stamped with the away receipt's `at` and expiring with the card's 30-minute box. The welcome concat reads the same thing, and the held band clears only when 'See it' opens the sheet. Would the tests catch it? No; LUCKY-6 only asserts that a second claim returns ''. Guard to add: __awayCardHtml(rec) must contain the band on two consecutive calls.
- P2 CONFIRMED. The pack's claim that 'existing LUCKY-1..4 stay green' is false. LUCKY-2 (smoke/monsters-inventory-and-brand.js:8733-8758) asserts exactly ONE lucky TOAST reading 'about 1 in 1,087'. Replacing the attended toast with the sheet turns it RED. Its teardown also never removes a veil, so an open .hr-scrim would leak into later tests and hijack topOpen/anyOpen and Escape. That file is missing from the pack's file list. Fix: retarget LUCKY-2 to the sheet in the same commit. __reset() must remove #hr-lucky-veil, clear the held band and queue, and cancel the wait timer. Put LUCKY-5..7 beside LUCKY-1..4 in that file (CR-1 headroom 88), not in quests-chronicle-and-bonus.js, which lane/ledger-rung-unknown-zero edits (+22).
- P2 CONFIRMED (mechanism) / PLAUSIBLE (lucky-id trigger). The bag count reads the wrong source, which is a §6 violation. 'Server bag after bagHydrated' means G.inventory. That is the display bag: a one-way Math.max merge that can hold client-rolled or client-credited copies, and it drifts on equip (accrue.js:1269-1276 and :1308-1313, the Goblin Seal P1 class). The trigger is plausible for the 6 craftable ids and for equips. Fix: read HearthriseAccrual.serverItemCount(G,id) (accrue.js:1287; it returns null when the bag is unstated), render null as the shared pending mark via HearthriseBalance.countMarkup(null,{label:'Not counted yet'}) (arrives with lane/ledger-rung-unknown-zero), and omit the line at 0. Never read G.inventory.
- P2 CONFIRMED. The chase-list copy is untrue for 6 of the 26 finds. willow_longbow, maple_bow, yew_bow, willow_staff, yew_staff and runewood_staff are also CRAFTED: gear-tiers.js:85,92 generate make_willow_longbow at Crafting 35, make_maple_bow 50, make_yew_bow 65, make_willow_staff 36, make_yew_staff 66 and make_runewood_staff 81. So the intro 'Each of these hides at one hunting spot' is false, and 'In your bag' counts crafted or bought copies under a lucky-find heading. Fix: the intro reads 'drops at only one hunting spot' (true per tests/lucky-finds.mjs rule a). Rows whose window.itemSourceLine(id) starts with 'Crafted' get 'Also made at the bench'. The bag label stays exactly 'In your bag'.
- P3 CONFIRMED. The ledger breaks the Bestiary's discovery rule. Bestiary rows print '???' until a monster is named (bestiary.js:91-102), and FIELDNOTES-2/3 pin notes behind that same predicate. The ledger, inside the same modal, would name Draconia, Elder Cinder and others and print rumours that name them. Fix, as the default for the game-designer to accept or overrule before dispatch: apply the same named predicate. Unnamed rows show '???', the tier, the item and the odds, with no rumour.
- P3 CONFIRMED. Stacking and door bugs. The welcome overlay sits at z 9999 (legacy.css:2115) and the Bestiary at z 9998 (:2189). If 'See it' waits for 'no sheet open', it can never open over the welcome card. If 'Where luck hides' only dismisses the veil, the Bestiary opens BEHIND the welcome card. Fix: user-gesture opens skip the wait. Set #hr-lucky-veil to z-index 10040. 'Where luck hides' closes the veil and an open #welcome-overlay (pressing its data-hr-dismiss) before openBestiary(). The automatic attended sheet waits on HearthriseSheet.anyOpen (from lane/rankup-overlay-show), falling back to topOpen.
- P3 CONFIRMED. The pack names the wrong wiring anchors. main.js has NO hearthfind or lucky lines; both are classic script tags at index.html:1223/1228. The data import belongs beside main.js:30-31, published beside :115-116 as window.HearthriseLuckyRumours. luck-ledger.js is a classic script tag after lucky-finds.js. The pack also names a SETS table in tests/lore-notes.mjs, and none exists at the base. It only appears if batch pack 3 lands first; otherwise add the lucky block to check() directly.
- P3 CONFIRMED. Ratchet budgets the pack does not account for. home-dashboard.js CR-1 headroom is 1 comment line (710 against an allowance of 711, measured at c3ac50ec), and pack 1 shares it. quests-chronicle-and-bonus.js has 97 lines of headroom, not 72. css-literal-ratchet counts rgba() even inside a var() fallback, so the hearthfind pattern var(--x,rgba(...)) is RED in a .css file. modal-primitive-census is at its 6/6 ceiling, so lucky-finds.css must not declare position:fixed or inset. Reuse the tokenised '.ach-overlay hr-scrim' and '.ach-modal hr-sheet' shell.
- P3 CONFIRMED (copy). 'From a {Monster}' produces 'from a Draconia' and 'from a Elder Cinder'. Use 'Dropped by {Monster}', the vocabulary item-index.js:176 already uses.
- BASE and CONFLICTS. origin/set/b559 is now c3ac50ec, not 05fba6a3: companion-procs-authority has merged into it (quests-chronicle-and-bonus.js -151 lines, lore-notes.mjs:94 vocab source, legacy.js -111), so branch from c3ac50ec or later. The pack's conflict note misses that lane/ledger-rung-unknown-zero also edits bestiary.js (paintCharmStrip, :116-127), home-dashboard.js (:1744), legacy.js and quests-chronicle. The hunks do not overlap, so the merge should be zero-conflict, but the pending mark depends on that lane, so land after it. lane/rankup-overlay-show (anyOpen predicate): land after. timberline-caption-legacy-twin (index.html :490-500, main.js :466/491/521): no overlapping hunks. phone-rail-overlap and cook-collect-toast are already merged, with no overlap.
- SIDE FINDING, PLAUSIBLE, outside the pack's scope. hearthfind.js:861-863 uses the same 60 s rule, so an attended Hearthfind that lands on an ordinary 90 s settle is held as an away band that nothing claims until the next return of 30 min or more. Only the 8 h-away case is tested (market-night-and-prices.js:1062). Route it to its own lane-A investigation, and do not copy the rule.
- CLASS A VERIFIED, with exit codes seen on a git-archive copy of c3ac50ec. pack-edge --hash printed 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f. The 19 vendored src/data files do not include lucky-rumours.js, and none of the pack's files are in the payload. All 26 rumours pass LORE-4/5/6 (111-130 chars, charset, no digits, 0 of 29 stat words), leak no own-weakness or hidden-element synonym, name no undropped item, and key exactly the 26 lucky ids. The odds come from the hash-pinned engine function over the same rows the engine runs, labelled 'base'. No RPC, no migration, no cross-player surface. lore-notes, lore-notes --selftest, lucky-finds, comment-ratio, monolith, test-file, modal-census and css-literal all exited 0. tools/lane-done.mjs was NOT run: this was a review with no branch.
- RESIDUAL RISKS ACCEPTED. (a) Self-only forgery: devtools can fake a reveal on your own screen, but nothing is shared or broadcast, so it cannot reach another player. (b) rare_drop events ride only on the settle response, so a lost response loses the reveal (accrual.js:4041, pre-existing). (c) A lucky find during a 10-30 min absence shows only on the Home card within 30 min, plus the log line, the bag and the ledger. (d) If the world tick takes over attended combat, its frames carry no events, and the reveal (like today's toast) goes silent; this is pre-existing.

---

LANE: lane/content-b4-4-lucky-finds-unveiled. Class A: client-only, no migration, no edge deploy, no Security re-review.

BASE: origin/set/b559 at the SHA the Coordinator names. It must contain c3ac50ec plus lane/ledger-rung-unknown-zero (HearthriseBalance.countMarkup), lane/rankup-overlay-show (HearthriseSheet.anyOpen) and batch-4 pack 1 (it shares the welcome region and awayCardHtml). If pack 3 introduced a SETS table in tests/lore-notes.mjs, it must be in the base too. Every new ?v= must equal BUILD.cache in src/build-info.js at that SHA (558 at c3ac50ec). Merge the named base into your branch yourself and resolve any conflict there. No git stash.

INVARIANT: `node tools/pack-edge.mjs hr-accrue --hash` prints 184a155a4c19a7dff5de9639bea6bbf3d5d7a7fd4ebb7b4e9a7657f7fe9b114f before and after. No file under src/core, supabase/functions or a vendored src/data file changes, and none may import or mention lucky-rumours: LORE-7 reads packed content. Do not touch hearthfind.js, accrue.js, collection-log.js, modal-sheet.js, companions.js or the legacy.js block-27 tile builder.

A. NEW src/data/lucky-rumours.js: `export const LUCKY_RUMOURS = Object.freeze({...})`. No imports. The 26 lines, verbatim:
- wolfbone_torc: 'Trappers swear that now and then a cub drags home a torc some old hunter lost, and will not give it up without a fight'
- bramble_blade: 'Pull enough mandrakes and one comes up with a thorned blade tangled in its roots, as though the field had been keeping it'
- banded_signet: 'Kobolds cannot tell brass from bronze, so a signet from some lost free company sometimes ends up at the bottom of a hoard'
- adept_body: 'The apprentice keeps her master’s spare robe folded under her own, and sooner or later a patient hunter finds out why'
- fang_studs: 'Bats roost where trackers once camped, and old hunters say a pair of fang studs still turns up under the roost now and then'
- rat_stick: 'Every hobgoblin sergeant carries a stick for keeping order, and one of them was carved by somebody who truly hated rats'
- willow_longbow: 'Gnolls pick over whatever a dead archer leaves behind, and one pack is said to be dragging a fine willow longbow through the hills'
- willow_staff: 'Some wights were buried with the tools of their trade, and a hedge mage’s willow staff still rises with one of them now and then'
- spidersilk_choker: 'Spiders line their nests with anything that glitters, and a choker of silk and gold has been cut from a nest more than once'
- maple_bow: 'Deserters leave the army with whatever they can carry, and the canny ones carried off the quartermaster’s best maple bows'
- lazlos_maul: 'Lazlo’s own grave was never found, but every so often a zombie climbs out of the churchyard still holding onto his maul'
- warlock_helmet: 'A warlock once tried to bind a fire devil, and the devil has worn his hat ever since as a reminder of how that went'
- wraithglass_drops: 'Giant spiders wrap whatever wanders into the web, and one of them once wrapped a lady still wearing her wraithglass drops'
- warlords_torc: 'A warlord wears his rival’s badge melted into his own collar, right up until the day a hunter claims both of them at once'
- trollhide_cape: 'The story goes that one mountain troll wandered off still wearing the cape of the last hunter who tried to skin it'
- void_censer: 'A void mote drifts through the rift with a censer caught somewhere inside its shape, and lets it go only when it comes apart'
- panthers_eye_pendant: 'Every night panther has two eyes, and the hunters of the south swear that one in a great many wears a third on a string'
- wraithsilk_shroud: 'A banshee mourns in her burial shroud, and if you silence her for good the shroud may yet stay behind when she goes'
- yew_staff: 'The chained demon was summoned with a yew staff, and the staff went down into the pit along with the fool who held it'
- yew_bow: 'Drakes nest in the old yew groves of the high passes, and now and then a bowyer’s last bow is woven into a nest'
- shadowsilk_cape: 'A shadow creeper is said to wear the cape of the first hunter it ever caught, and to give it up only when it is caught in turn'
- chitinweave_cloak: 'The broodmother’s young shed their shells in the dark of the nest, and something down there has been sewing them into a cloak'
- archmage_gloves: 'The bride wore an archmage’s gloves to her wedding, a gift from a guest who never arrived, and she wears them still'
- dragonrib_bow: 'Draconia keeps the ribs of her fallen rivals, and one of them was bent into a bow by somebody brave enough to steal it'
- runewood_staff: 'Lightning strikes the same runewood grove in every storm, and the elemental that rises there sometimes carries a staff of it'
- emberfang_blade: 'The shrine that fell was guarding a blade, and Elder Cinder is guarding it still, whether or not it remembers why'

Wiring for A, in src/main.js:
- Import beside :30-31: `import { LUCKY_RUMOURS } from './data/lucky-rumours.js?v=<cache>';`
- Publish beside :115-116: `window.HearthriseLuckyRumours = LUCKY_RUMOURS;`

B. src/features/lucky-finds.js. It still decides nothing and credits nothing.

noteEnvelope(res):
- Keep today's per-version dedupe and the VERY RARE / RARE log lines.
- Keep the SALVAGE toast exactly as today.
- For a LUCKY item: no toast. Push {item, version} to a pending queue synchronously.
- Record non-lucky rare_drop ids (salvage included), deduped, into a pending 'rare' list.
- The return value stays the count of lucky + salvage announcements, so a sticky_core event still returns 0.
- If anything is pending, setTimeout(present, 0).

present(), which runs one task later because the receipt is written after the funnel (accrue.js:5125, :3765, :5136):
- kind = window.HearthriseAccrual.classifyReceipt(G.lastOfflineSummary). Never hearthfind.classify.
- 'away': move the pending lucky finds and the rare list into `held = {at: receipt.at, finds, rare}`, replacing any older held band.
- 'sync', 'switch' or classifier unavailable: queue the attended sheet.

Attended sheet queue:
- Shows one sheet at a time, only while (HearthriseSheet.anyOpen || HearthriseSheet.topOpen)() is falsy.
- Re-checks every 1000 ms while it waits.
- Never auto-dismisses and never drops a find.

open(id): user gesture. Shows immediately and clears that find from held.

awayBandHtml(): a NON-consuming read of held.
- Returns '' when nothing is held or when now - held.at is 30 min or more.
- One lucky line per find: 'Lucky find while you were away: {Item}, dropped by {Monster}. Base odds about 1 in {n}.' followed by `<button data-lf-see="{id}">See it</button>`.
- Then, if the rare list is not empty: 'Rare finds while you were away: A, B and C.' With more than 3 names, list A, B, C and then 'and {k} more.', where k comes only from the server events.
- Everything passes through esc().

claimAwayBand(): an alias of awayBandHtml(), kept so the welcome concat can call it.

A document-level listener in this file handles [data-lf-see] and [data-lf] clicks.

__reset(): clears told, the index, the queue, the pending lists, held and the timer, and removes #hr-lucky-veil.

__present(find, mode): keep this seam, but only for render assertions.

Sheet DOM:
- `<div id="hr-lucky-veil" class="ach-overlay hr-scrim show" role="dialog" aria-label="A lucky find">`
- containing `<div class="ach-modal hr-sheet hr-lf-card rr-frame">`
- head: 'A lucky find'
- body: itemArt(id, 64); the item name; 'Dropped by {Monster} · base odds about 1 in {n}' (baseOneIn, toLocaleString('en-US')); window.itemDesc(id); the rumour in <i>.
- foot: a 'Where luck hides' button (data-lf="luck") and a 'Close' button (data-lf="close", data-hr-dismiss).

'Where luck hides':
1. Dismiss the veil.
2. If #welcome-overlay is showing, click its [data-hr-dismiss].
3. openBestiary().
4. Set #best-luck.open = true, then call scrollIntoView({block:'start'}).

C. src/legacy.js:13583, NET ZERO LINES: `_hfBand = (window.HearthriseHearthfind.claimAwayBand() || '') + ((window.HearthriseLuckyFinds && window.HearthriseLuckyFinds.claimAwayBand && window.HearthriseLuckyFinds.claimAwayBand()) || '');`

src/features/home-dashboard.js awayCardHtml(off) (:611): prepend a guarded window.HearthriseLuckyFinds.awayBandHtml(). Add AT MOST 1 comment line: CR-1 headroom is 1.

D. NEW src/render/luck-ledger.js, a classic IIFE publishing window.HearthriseLuckLedger = {html(opts), paint()}.
- index.html: a script tag right after lucky-finds.js (:1228).
- src/render/bestiary.js: in the overlay string (:44), add `<details id="best-luck" class="luck-ledger"></details>` after #best-charms. In openBestiary, after paintCharmStrip(C), add `window.HearthriseLuckLedger && window.HearthriseLuckLedger.paint()`.

Ledger content:
- summary: 'Where luck hides · {N} named finds'. N is counted from the MONSTERS lucky rows.
- intro: 'Each of these drops at only one hunting spot. The realm rolls for it on every kill there, watching or away.'
- groups: 'Tier 1'…'Tier 6', by monster tier.

Each row is [data-luck-row="{id}"] containing: art, the item name, '{Monster} · about 1 in {n}', the rumour in <i>, then 'Also made at the bench' when /^Crafted/.test(window.itemSourceLine(id)), then the bag line.

Named rule: use bestiary.js's own predicate: G.bestiary[mid].kills > 0, or HearthriseTrophies.killsOfMonster(mid) > 0.
- An unnamed row shows '??? · about 1 in {n}' and no rumour.

Bag line:
- q = HearthriseAccrual.serverItemCount(G, id). Never read G.inventory.
- q === null: 'In your bag: ' + HearthriseBalance.countMarkup(null, {label:'Not counted yet'}).
- q > 0: 'In your bag: ' + countMarkup(q).
- q === 0: omit the line.

html(opts) accepts {named, count} overrides as a test seam.

E. NEW src/styles/lucky-finds.css, linked in index.html after primers.css (:198) with ?v=<cache>.
- Tokens only. No hex, rgb() or rgba(), not even as a var() fallback.
- No position or inset: the scrim supplies them.
- `#hr-lucky-veil{z-index:10040}`.
- Any @media uses exactly `(max-width: 540px), (max-height: 540px) and (max-width: 1024px)`.
- Every selector must be used.

F. TESTS. Each fix ships with its test in the same commit.

tests/lore-notes.mjs: use a SETS row if pack 3 added the table; otherwise add a lucky block to check().
- LORE-10: the LUCKY_RUMOURS keys equal every {lucky:true} drop id in MONSTERS (26).
- No rumour matches its monster's elementWeak synonyms (the FIELDNOTES-1 SYN table: ember, frost, poison). A monster with hiddenElement must match none of the three.
- LORE-4/5/6 apply to the rumour lines. The foreign lines include MONSTER_NOTES, ITEM_DESC and the other lore lines.
- LORE-7 regex becomes /lore-notes|lucky-rumours/.
- New selftest plants: drop yew_bow (LORE-10); put 'frost' into giant_bat's line (the element rule); pack src/data/lucky-rumours.js (LORE-7). The selftest banner updates to the new N/N.
- RED before: locally delete one key and run `node tests/lore-notes.mjs`; it must exit 1. Do not commit that. GREEN after: exit 0.

In-page tests, in src/features/smoke/monsters-inventory-and-brand.js beside LUCKY-1..4. Rules: tryRunAsync, at most 20 code lines each, zero G.* seeds. Every finally calls LuckyFinds.__reset() and HearthriseAccrual.__resetAwayReceipt().
- LUCKY-2 (retargeted): exactly one VERY RARE line; NO lucky toast; after one task #hr-lucky-veil contains 'Wolfbone Torc', '1 in 1,087' and HearthriseLuckyRumours.wolfbone_torc; a replay adds no second veil or line; sticky_core returns 0.
- LUCKY-5 ATTENDED: applyAwayEnvelope({grantMs:7200000}), then applyAwayEnvelope({grantMs:90000, events:[{type:'rare_drop', item:'wolfbone_torc'}]}). After one task the veil is open. Clicking [data-hr-dismiss] removes it. RED on the base. Mutation proofs: the 60 s rule gives RED; a synchronous classify gives RED.
- LUCKY-6 AWAY: applyAwayEnvelope({grantMs:7200000, events:[wolfbone_torc, sticky_core rare_drops]}). After one task: no veil; LuckyFinds.awayBandHtml() contains 'Lucky find while you were away', 'Wolfbone Torc' and 'Rare finds while you were away'; HearthriseHome.__awayCardHtml(rec) contains the band on TWO consecutive calls. Mutation proof: consume-once gives RED.
- LUCKY-7 LEDGER:
  - html({named:()=>true, count:()=>null}): exactly one [data-luck-row] per lucky id; each row contains its rumour and a .bal-pending.
  - html({named:()=>false, count:()=>0}): no rumour, no monster name, no bag line.
  - count:()=>2: contains 'In your bag: 2'.
  - The maple_bow row contains 'Also made at the bench'.
- LUCKY-1/3/4, SALVAGE-1..2 and FIELDNOTES-* are not edited and must stay green.

G. GATES. Paste each real exit code; never write 'green' without one.
- pack-edge --hash: must equal the hash above.
- lore-notes: plain run and --selftest.
- lucky-finds.mjs, field-salvage.mjs.
- modal-primitive-census, css-literal-ratchet, dead-css, breakpoint-guard.
- window-globals-exist, dead-exports.
- comment-ratio, test-file-ratchet, monolith-ratchet.
- ./bump-version.sh --check.
- node tools/lane-done.mjs: paste its last line. A red ratchet means the lane is not done.

Do NOT run the in-page suite, visual-qa or run-ci-local on this PC. The set run on `next` / GitHub is the in-page record.

Proof PNGs at 1280x800 and 922x423: the attended veil, the welcome card with the band, the Home away card with the band, and the Bestiary with 'Where luck hides' open. Push them only to qa/content-b4-4.

Never deploy. Never commit docs/reports/visual-qa/findings.json. Never touch tests/live-hash-drift.baseline.json.
