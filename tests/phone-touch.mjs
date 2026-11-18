#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/phone-touch.mjs — THE PHONE: SHEETS THAT FIT, PANELS THAT CLOSE, TARGETS A THUMB CAN HIT.
//
//   node tests/phone-touch.mjs                the rules
//   node tests/phone-touch.mjs --mutate       every planted defect must turn a rule RED
//   node tests/phone-touch.mjs --only PH-6    one rule's pages alone (with --shots, that rule's shots alone)
//   node tests/phone-touch.mjs --shots <dir>  also write the visual-gate screenshots (667x375, 844x390,
//                                             922x423, portrait 390x844 and desktop 1440x900, fonts loaded)
//
// mutant-anchors: src/render/format.js src/shell/windows/hunts.js src/shell/window-head.js src/app/hero-create.js src/shell/context-menu.js src/styles/market.css src/shell/launcher.js src/shell/widgets/party-panel.js src/shell/windows/item-tip.js src/shell/windows/party.js src/shell/windows/storage.js src/styles/hunt.css src/styles/windows.css src/styles/shell.css src/styles/app.css src/shell/shell.js src/shell/shell-hud.js play.html src/shell/windows/configure-action.js src/shell/action-facts.js src/data/text/bar.js src/shell/widgets/hunt-topbar.js src/shell/widgets/analyzer.js src/shell/windows/settings.js src/data/hud-widgets.js src/shell/windows/characters.js src/shell/widgets/action-bar.js src/shell/launcher-names.js src/shell/off-why.js src/shell/windows/tally.js src/shell/windows/shop.js src/app/world-pane.js src/app/sign-in.js src/app/boot.js src/net/connection.js src/shell/windows/boss-hall-pane.js
// mutant-writes-tree: no — page mutants are served overrides
// mutant-rule-functions: huntsWholeRows bagReach configureFits analyzerToggles analyzerOverTown portrait settingsTouch tallEnough bagByTouch coachFits coachOffFight barFits desktopBar staminaBuy coachSheet coachSheetHunting gotItRests huntBarApart partyActs tappedItem createDoor heroDoor groundPage groundBackHunting detailsTabs wordsFit partyFolds barPresses weighhouse sorts partyInvite menuSending inviteToast sheetWords mouseWordsAndTargets stripReach inviteByPress slotPage chatFoot touchMeaning touchHunt alertStack townCard waitWords leaveWords doorRule hallDoor barBesideSheet rules
// mutant-runner-functions: main
//
// QA's phone playtest (2026-10-24) scored mobile 4/10. play.html with supabase-js and the REST paths stubbed
// (tests/_client-harness.mjs): tests/fixtures/hunt-envelope.json in a hunt, tests/fixtures/alpha-envelope.json
// in town. Phones are landscape (CLAUDE.md §1, §7); the phone query is the frozen one.
//   PH-1 CONFIGURE ACTION FITS (667x375, 844x390, 922x423): on the Spells, Food & drink and Ammo tabs the list scrolls
//        inside the sheet until its LAST row is on screen and pressable, while Save, Cancel and the close stay
//        on screen and pressable; a new tab's list starts at its first row; the column heads sit over their own
//        columns (the head's cells line up with the rows' cells, none wraps to a second line); the page itself
//        never pans sideways. THE LIST GETS THE HEIGHT (UI audit 2026-11-18: at 922x423 the list showed its heads and
//        no row): before any scroll the action and its first condition stand on one line and whole rows show under
//        the heads (3 at 922x423, 2 at 844x390, 1 at 667x375); no head or cell wraps or runs past its column.
//        On a desktop (1440x900, the same audit): on every tab no head or cell wraps or runs past its column ("1 Fire
//        rune" stood on two lines); every locked row names what it needs under its name and an open one names nothing,
//        from the server's discipline and skills: a Shield hero's Hunter's Mark needs its weapons, a Sword hero at
//        Melee 9 sees Turning Cut need "Melee 10", and at the server's Melee 10 it opens
//   PH-2 HUNT DETAILS IS A TOGGLE, THE ANALYZER CLOSES, AND NEITHER TRAPS THE HUNT BAR (844x390, 667x375):
//        Hunt details shows the analyzer (pressed) and a second press hides it; the analyzer has its own close;
//        open, it never crosses the hunt bar or the action bar; closed stays closed after a reload, open comes
//        back clear of the hunt bar; a pending leave ("Leaving in Ns") stands where Leave hunt was and keeps the
//        hunt bar on one line, inside the screen and off the Party panel (on screen: a party of two ends above the
//        action bar). At 1440x900 the analyzer shows by default and the same toggle works. Over the town (a training
//        session, 667x375 and 922x423: the World's title row lowers the hunt bar) Details opens it wholly on screen,
//        clear of both bars, its close in reach
//   PH-3 PORTRAIT: a touch phone held upright (390x844, 375x812) sees ONE full-screen "turn your phone
//        sideways" card on top of everything, its words >= 12 px; a phone in landscape, a touch tablet either
//        way up and a desktop (a narrow window included) never see it
//   PH-4 SETTINGS BY TOUCH (844x390): a press on a toggle's words flips its box; every toggle's pressable
//        line is >= 44 px tall; the Window opacity slider's own target is >= 44 px tall
//   PH-5 TOUCH TARGETS (844x390): the Shop's Buy, the hunt bar's buttons and the analyzer's tabs are >= 40 px
//        tall; an item's tooltip fits the screen whole (nothing cut off); with a long bag, the picked item's
//        Equip is on screen and pressable without scrolling
//   PH-6 A LONG COACH ENDS ABOVE THE ACTION BAR (667x375, 844x390, 922x423; under the hunt bar and under the icon
//        row in town): a high Level's "What next" card ends above the bar's top and on screen; its words end part-way
//        into a line (the cue they scroll) and scroll to their end under a wheel over them while its fold stays on
//        screen, pressable, and folds it. At 1440x900 the card is never capped
//   PH-7 THE PHONE'S OWN BAR (667x375, 844x390, 922x423; Tyler 10-25): stance, Chase, distance, the setup's name, its
//        saved setups and sliders, and the stamina "+" are each on screen, cut by no clipping box and pressable where
//        drawn; the tutorial's hooks (data-coach-hook) are each on one shown element; the ring's words sit inside its
//        disc and no pixel medallion is left; a sideways swipe over the slots reaches slots 10 and 20
//   PH-8 THE PHONE'S BAR NEVER COSTS THE DESKTOP (1280x800, 1440x900, 1920x1080; Tyler 10-25): the bar on screen,
//        every filled slot's icon 64 px (x2), the fight controls and the stamina "+" in view and pressable without
//        opening anything, the ring's words inside its disc, no pixel medallion
//   PH-9 THE STAMINA "+" (844x390; Tyler 10-25): a panel wholly on screen with the server's quote and Buy in reach;
//        ONE hr_stamina_refill at that price, Buy off until the answer, the stamina from the re-read; the question asks
//        the price the server quotes at the press; a refusal in words, and one that brings new state (quote_changed,
//        already full) replaces what the panel offers (lane/a-quote-changed); refills used up or too little gold turn Buy off with the reason and keep the "+"; the premium note
//        for a hero without premium only
//   PH-10 THE COACH NEVER LIES ON THE FIGHT (922x423, 844x390; first-hour playtest 10-29 #10: the card covered the hero
//        mid-fight): in a hunt, the open card under the hunt bar crosses neither the viewed hero nor a party member
//        (each figure's tile and the name plate over it), nor does the camera push them under the Party panel to
//        make room; the card stays on screen. At 1440x900 too (audit 2026-11-15 F1): the card stands in the left column
//   A phone player's three days (2026-10-31, art/review/player-feedback-2026-10-31/phone.txt on lane/f-phone):
//   PH-11 THE STRIP (667x375, 844x390, 922x423): "Heroes" a 40 px press clear of the icon row, every icon on screen and
//         at least 40 px wide, a shown hero tab at least 44 px wide and clear of the row, the strip no taller than 40 px;
//         its sheet names every window the top bar reaches, its groups' too (each >= 44 px, each opens its window; the bar's
//         groups, 2026-11-16) and holds Character list and Sign out in
//         reach. At 1440x900 the strip keeps its three words, the chips stay, none of the phone's routes show
//   PH-12 INVITE WITHOUT A LONG PRESS (the same sizes): with two heroes the other's row has a visible Invite, ONE
//         hr_hunt_party_invite_own for its slot, the answer in words; the sheet tells a phone no "right-click" or key
//   PH-13 NOTHING LOST OFF THE EDGE (667x375; the chat at 922x423 too): a gold press beside the slots brings 10 and 20 on
//         screen and back; the chat's box and Send on the sheet, 40 px tall, no tooltip left on the sheet's title
//   PH-14 MEANING WITHOUT HOVER (touch, 667x375 and 922x423): a held icon names itself and opens nothing, a tap opens; no
//         key chip on a sheet; a press on a grey Buy says why beside it; a slot's sheet says why it will not fire;
//         hunting, Tamsin's board says why every Take is grey
//   PH-15 ONE CARD AT A TIME (667x375, 922x423): three alerts show as one solid card and a count, clear of the bar and of
//         the coach card; in town the card stands clear of the hero's column and the place's name, and so does its folded tab
//   PH-16 NEVER A SILENT WAIT (667x375): with the world's module held, offline says so on the waiting line and the
//         connection's line, and both clear back online; a leave with no answer says it waits, and says the connection is
//         gone; a counting leave says what the wait is for, under the bar
//   PH-17 THE DOOR (phones, 1440x900): no focus on a phone (it throws the keyboard up), links >= 44 px, nothing scrolls;
//         a desktop keeps the first field's focus
//   The panel's second read (2026-11-01, art/review/player-feedback-2026-11-01/phone-perf.txt on lane/f2-phone-perf):
//   PH-18 A CARD NEVER HIDES WHAT IT NAMES (667x375): in Hunts the card is at most 90 px and the ground it names is on
//         screen and on top; a ground's page keeps 165 px and Enter; Got it leaves the next card on its tab until pressed,
//         and that card's title takes at most two lines, its foot under its words;
//         a running hunt's note stands aside for a Hunts card
//   PH-19 Summary and Leave at least 16 px apart; a folded card off the Details panel's close (667x375)
//   PH-20 Leave party and Disband inside the sheet at every phone size; Disband's first press asks, its second sends ONE
//   PH-21 A TAPPED ITEM (touch, 667x375): its tip stands off the sheet, takes no press, the action is hit first time;
//         no tip for an item nobody pressed
//   PH-22 THE DOORS: Create account and Back to sign in on screen (667x375, 844x390); Enter town and its way back (667x375)
//   PH-23 Refresh in the sheet, in the purse's row and on no tab; How many, Price each and List on screen together; Sort in the sheet (667x375)
//   PH-24 A PARTY ON A PHONE: an invite from the Party window, ONE hr_hunt_party_invite and its answer in words; an invite
//         shows beside an open sheet (844x390), clear of the town card (What next served long) and its Join with it; the red count says what it wants; no mouse
//         words and no press under 40 px in seven windows (667x375)
//   The small-phone panel on v0.2.83 (2026-11-03, 844x390 and 667x375):
//   PH-25 A GROUND'S PAGE GETS THE SHEET: with its card up, at least 190 px to read (it was 104), the sheet's head in reach in
//         town, the card beside the sheet, Enter and the way back on screen at the page's end; mid-hunt the way back still works
//   PH-26 HUNT DETAILS: all four tabs whole and clear of the fold and the close, no sideways pan; alone, no hero / party switch and
//         at least 72 px of numbers with Next level in showing (it was 61, its first 30 a head that said Session again); in a party the switch stays
//   PH-27 EVERY CARD'S WORDS FIT: each tutorial card's words (three times over since the one-line cards) whole without a scroll, in the town's card, beside a sheet and under the
//         hunt bar, up to the length each room holds (under the hunt bar the cards a hunt can show, each title on one line, its presses on a row under the words); a longer
//         card's corner shows the gold tip until its words end; at 1440x900 no title of three words or more ends on one word
//   PH-28 HOW YOU FIGHT: the lead and all five ways (at twice their English) whole with no scroll; a refusal keeps Enter town on screen; on a screen too short, "More below" until its end
//   PH-29 THE PARTY PANEL: alone, folded to its name and plus, and a press opens it for good; in a party, open; a desktop from 1280 px starts open with its dash (narrower: HS-28)
//   PH-30 THE BAR'S PRESSES: the slots' page at least 36 px wide, the setup's name 36 px tall and clear of its neighbour
//   PH-31 AFTER CREATE ACCOUNT: only the answer and the way back, no word left from the form
//   PH-32 A KEYED HALL'S DOOR (922x423; the Krell hall check 2026-11-14: its red food line under the fold, Open Krell's Hall half under
//         Enter): with the hall's head at the top of a ground's page, its red food line and its press are whole inside the page, clear of
//         Enter's foot and pressable; at the page's end the press is still clear of the foot
//   PH-33 THE BAR BESIDE A TOWN SHEET (667x375, 844x390, 922x423; audit 2026-11-15 F27: slots 9, 10, 19 and 20 lay under the bag's sheet,
//         and where the slots page, the page press with them): with the bag open in town the bar ends left of the sheet, every slot on
//         screen takes a press, and the rest come round with the page press; closed, the bar is whole again with its hub
//   PH-34 THE HUNTS SHEET SHOWS WHOLE LINES (667x375, 844x390, 922x423, in a hunt; audit 2026-11-15 F27, still open 2026-11-18: the sheet over the
//         action bar held two lines, the top one cut): the lines are set tight, so at rest the list shows 3 whole ground lines at 922x423, 2 at
//         844x390 and 1 at 667x375 (a hero who has hunted: three-line grounds), none cut at its top; a scroll or a wheel that stops part-way
//         into a line comes to rest on a line's top
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { RING_WORDS, RING_WORDS_WIDEST } from './_bar-probes.mjs';
import { scopedMutants } from '../tools/lib/mutant-scope.mjs';
import { pinFonts } from './_test-fonts.mjs';
import { withServerLevel } from './_server-level.mjs';
import { pressBar, barWindows, rowIcon } from './_bar.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));
const HUNT = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
const ALPHA = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
/* The scene plays huntPlaybackDelayMs behind the server (src/session/config.js), as tests/hunt-screen.mjs states it. */
HUNT.hunt_server_now_ms += (await import(pathToFileURL(join(ROOT, 'src/session/config.js')).href)).SESSION_CONFIG.huntPlaybackDelayMs;
const { ITEMS } = await import(pathToFileURL(join(ROOT, 'src/data/items.js')).href);
const { charXpForLevel } = await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href);
const { CROPS } = await import(pathToFileURL(join(ROOT, 'src/data/gathering.js')).href);
const { HUNT_INDEX } = await import(pathToFileURL(join(ROOT, 'src/data/hunts.js')).href);
const { HUNT_TUTORIAL } = await import(pathToFileURL(join(ROOT, 'src/data/hunt-tutorial.js')).href);
/* A long bag (the playtest's hero carried 42 stacks): thirty more stacks of plain materials. */
const MATERIALS = Object.keys(ITEMS).filter((id) => !ITEMS[id].kind && !ITEMS[id].type && !(id in ALPHA.inventory)).slice(0, 30);
/* The town prep: that long bag, and a tool and a piece of gear for sale (the Shop sells no supplies, AW-7). */
function longBag(env) {
  for (const id of MATERIALS) env.inventory[id] = 3;
  env.shop = Object.assign({}, env.shop, { offers: env.shop.offers.concat([{ offer: 'supply.bronze_axe', item: 'bronze_axe', kind: 'tool', price: 120 },
    { offer: 'supply.leather_gloves', item: 'leather_gloves', kind: 'gear', price: 160 }]) });
}

/* A read-only hook, served (never written to the tree): the World pane's runtime on window.__world (PH-10 reads the
   figures' screen spots), as tests/window-camera.mjs serves it. */
const PANE = 'src/app/world-pane.js';
const paneSrc = await readFile(join(ROOT, PANE), 'utf8');
if (!paneSrc.includes('    runtime.sync();\n')) throw new Error('phone-touch: the World hook anchor moved');
const WORLD_HOOK = { [PANE]: paneSrc.replace('    runtime.sync();\n', '    runtime.sync();\n    window.__world = runtime;\n') };

const PHONES = [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 922, height: 423 }];
const tagOf = (vp) => vp.width + 'x' + vp.height;
const LOAD_MS = 15000;
/* A navigation is 380 module files on a shared machine; how long they take is no rule of this guard (a slow disk read it as RED). */
const NAV_MS = 90000;
const wait = (page, fn, arg, ms = LOAD_MS) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

function scripted(fixture, prep) {
  /* Like the real server, the residue a put stores comes back in every later envelope (client_state). */
  const s = { env: clone(fixture), version: 1, calls: [], residue: {} };
  if (prep) prep(s.env);
  /* a fixture's own residue is where the server keeps it: the store every later envelope echoes */
  if (s.env.client_state) { s.residue = Object.assign({}, s.env.client_state); delete s.env.client_state; }
  /* The server states the Level itself (hr_state_of's `level` block): the stub states it for the XP a case set (./_server-level.mjs). */
  s.next = () => withServerLevel(Object.assign(clone(s.env), { version: ++s.version, client_state: clone(s.residue) }));
  return s;
}

async function stub(page, s, fonts) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  /* Shots load the real faces (a judgement needs them); the rules run offline on GitHub's own wide fallback, on every machine (tests/_test-fonts.mjs). */
  if (!fonts) await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' && s.emptySlot1 && body.p_slot === 1) return json({ ok: false, error: 'no_character' });
    if (name === 'hr_load') return json(s.next());
    if (name === 'hr-accrue') return json(Object.assign({ accrued: true }, s.next()));
    if (name === 'hr_put_client_state') { s.residue = Object.assign({}, s.residue, body.p_patch || {}); return json({ ok: true }); }
    /* PH-9: a stamina refill, held while s.holdRefill (s.releaseRefill answers it); s.onRefill is the server. */
    if (name === 'hr_stamina_refill' && s.onRefill) { if (s.holdRefill) await new Promise((ok) => { s.releaseRefill = ok; }); return json(s.onRefill(body)); }
    /* PH-14: her board; PH-16: a leave whose answer does not come (a tunnel). */
    if (name === 'hr_tally_view') return json({ ok: true, board: [], hunting: true });
    if (name === 'hr_hunt_leave' && s.holdLeave) return undefined;
    if (name === 'hr_hunt_party_invite_own' && s.holdOwnInvite) return undefined;
    return json({ ok: true });
  });
}

/* Signed in and playing: the bar (and, in a hunt, the party with both heroes). A reload keeps the session. */
async function play(page, base, town, crew = 2) {
  if (base) await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded', timeout: NAV_MS });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"], [data-app="play"][data-slot="0"], .hb-bar'));
  if (await page.$('form[data-auth="sign-in"]')) {
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
  }
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"], .hb-bar'));
  if (await page.$('[data-app="play"][data-slot="0"]')) await page.click('[data-app="play"][data-slot="0"]');
  if (town) return wait(page, () => document.querySelector('.hb-bar') && document.querySelectorAll('.hb-slot[data-item]').length > 0 && document.querySelector('.hs-launchers'));
  return wait(page, (n) => document.querySelectorAll('.hp-m').length === n && document.querySelector('.ht-bar'), crew);
}

/* Rects in the viewport's px, and the plain facts every rule reads. */
const RECT = `window.__r = (q, root) => { const e = typeof q === 'string' ? (root || document).querySelector(q) : q;
  if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect();
  return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  window.__onScreen = (r) => !!r && r.width > 0 && r.height > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
  window.__cross = (a, b) => !!a && !!b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  window.__hits = (e) => { if (!e) return false; const b = e.getBoundingClientRect(); const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!t && (t === e || e.contains(t)); };`;

/* ── PH-1 ── */
/* Configure action's shown heads and number cells that take a second line or run past their column, as "words height/size". */
const WRAPPED = () => Array.from(document.querySelectorAll('.ca-runs .ca-head > .ca-c, .ca-runs .ca-head > .ca-name, .ca-runs .ca-row .ca-c'))
  .filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none' && (e.textContent || '').trim())
  .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().height > 1.8 * parseFloat(getComputedStyle(e).fontSize))
  .map((e) => e.textContent.trim() + ' ' + e.scrollWidth + '>' + e.clientWidth + 'px wide, ' + Math.round(e.getBoundingClientRect().height) + 'px tall at ' + getComputedStyle(e).fontSize);
/* A row's lock and what it needs: [{ id, locked, need }] for every row of the list shown. */
const NEEDS = () => Array.from(document.querySelectorAll('.ca-runs .ca-row')).map((r) => {
  const t = r.querySelector('.ca-need-t'), shown = !!t && t.getClientRects().length > 0;
  return { id: r.getAttribute('data-id'), locked: r.classList.contains('is-locked'), need: shown ? t.textContent : '', cut: shown && t.scrollWidth > t.clientWidth + 1 };
});
/* What the server's discipline and skills leave a spell row needing (src/shell/action-facts.js rowNeed, the window's own words). */
const { rowNeed } = await import(pathToFileURL(join(ROOT, 'src/shell/action-facts.js')).href);
const { ABILITIES } = await import(pathToFileURL(join(ROOT, 'src/data/abilities.js')).href);

/* PH-1 on a desktop: every tab whole (no head or cell wraps), every locked row says what it needs and an open one nothing. */
async function configureDesk(page, tag, fails, discipline) {
  await page.click('.hb-slot[data-slot="2"]');
  if (!(await wait(page, () => { const f = document.querySelector('[data-hs-win="configure-action"] .ca'); return f && !f.classList.contains('is-empty'); }))) { fails.push('PH-1 [' + tag + '] a bar slot did not open Configure action'); return null; }
  let spells = null;
  for (const tab of ['ammo', 'food', 'spells']) {
    await page.click('.ca-tab[data-tab="' + tab + '"]');
    if (!(await wait(page, (t) => document.querySelector('.ca-tab[data-tab="' + t + '"][aria-selected="true"]') && document.querySelectorAll('.ca-runs .ca-row').length > 3, tab, 4000))) { fails.push('PH-1 [' + tag + '] the ' + tab + ' tab shows no list'); continue; }
    const cut = await page.evaluate(WRAPPED);
    if (cut.length) fails.push('PH-1 [' + tag + '] ' + tab + ': a head or cell wraps or runs past its column: ' + cut.slice(0, 4).join(' | '));
    const rows = await page.evaluate(NEEDS);
    const mute = rows.filter((r) => r.locked !== !!r.need);
    if (mute.length) fails.push('PH-1 [' + tag + '] ' + tab + ': a locked row says nothing of what it needs, or an open one says it needs something: ' + JSON.stringify(mute.slice(0, 3)));
    if (tab === 'spells') spells = rows;
  }
  /* a Shield hero's Hunter's Mark: the weapons that cast it, the window's own words for the server's discipline */
  if (discipline === 'shield') {
    const mark = (spells || []).find((r) => r.id === 'hunters_mark');
    const said = rowNeed({ type: 'ability', id: 'hunters_mark' }, { discipline });
    if (!mark || !said || mark.need !== said || mark.cut) fails.push('PH-1 [' + tag + '] a Shield hero\'s Hunter\'s Mark does not say it needs ' + JSON.stringify(said) + ': ' + JSON.stringify(mark));
  }
  return spells;
}

/* THE LIST GETS THE HEIGHT (UI audit 2026-11-18: at 922x423 the sheet showed the list's heads and no row): as the sheet opens, the
   action and its first condition share one line, and at least `want` whole rows show between the heads and the scroller's foot. */
async function listGetsHeight(page, tag, want, fails) {
  const fit = await page.evaluate(() => {
    const mid = document.querySelector('.ca-mid').getBoundingClientRect();
    const head = document.querySelector('.ca-runs .ca-head').getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll('.ca-runs .ca-row')).filter((r) => { const b = r.getBoundingClientRect(); return b.top >= head.bottom - 0.5 && b.bottom <= mid.bottom + 0.5; }).length;
    const lead = document.querySelector('.ca-lead').getBoundingClientRect(), c0 = document.querySelector('.ca-cond[data-cond="0"]').getBoundingClientRect();
    const tall = (q) => { const e = document.querySelector(q); return e && e.getClientRects().length ? Math.round(e.getBoundingClientRect().height) : 0; };
    return { rows, scrolled: document.querySelector('.ca-mid').scrollTop, lead: Math.round((lead.top + lead.bottom) / 2), cond: Math.round((c0.top + c0.bottom) / 2),
      condH: Math.round(c0.height), mid: [Math.round(mid.top), Math.round(mid.bottom)], head: Math.round(head.top), sentence: tall('.ca-sentence') };
  });
  if (fit.scrolled || fit.rows < want || Math.abs(fit.lead - fit.cond) > 4 || fit.condH > 48) {
    fails.push('PH-1 [' + tag + '] the sheet opens with ' + fit.rows + ' whole rows (want ' + want + ') or the action and its condition on two lines: ' + JSON.stringify(fit));
  }
}

/* The audit's own view: in town at 922x423, three whole rows as the sheet opens. */
async function configureTownFits(page, tag, fails) {
  await page.click('.hb-slot[data-slot="2"]');
  if (!(await wait(page, () => { const f = document.querySelector('[data-hs-win="configure-action"] .ca'); return f && !f.classList.contains('is-empty'); }))) { fails.push('PH-1 [' + tag + '] a bar slot did not open Configure action in town'); return; }
  await page.waitForTimeout(300);
  await listGetsHeight(page, tag + ' in town', 3, fails);
}

async function configureFits(page, tag, fails) {
  await page.click('.hb-slot[data-slot="2"]');
  if (!(await wait(page, () => document.querySelector('[data-hs-win="configure-action"] .ca-rank')))) { fails.push('PH-1 [' + tag + '] a bar slot did not open Configure action'); return; }
  /* A press on a slot opens this, and a player may have meant to use it: the foot says the hero does it alone, clear of its buttons (QA 2026-11-04). Every icon at a whole pixel scale (28 px drew 0.875x). */
  const foot = await page.evaluate(() => { const p = document.querySelector('.ca-self'), r = p && p.getBoundingClientRect(), b = document.querySelector('.ca-foot [data-x="clear"]').getBoundingClientRect();
    return { said: !!r && r.width > 0 && /^Fires automatically/.test(p.textContent), clear: !!r && r.right <= b.left + 0.5, tall: r ? r.height : 0, icons: Array.from(document.querySelectorAll('.ca-ico .hh-icon')).map((e) => e.getBoundingClientRect().width).filter((w) => w > 0) }; });
  if (!foot.said || !foot.clear) fails.push('PH-1 [' + tag + '] the foot does not say the hero acts alone, or lies on its buttons: ' + JSON.stringify(foot));
  if (!foot.icons.length || foot.icons.some((w) => Math.abs(w - 32) > 0.01)) fails.push('PH-1 [' + tag + '] an icon is off the whole-pixel scale: ' + JSON.stringify(foot.icons.slice(0, 4)));
  /* In a hunt the sheet starts under the hunt bar, 44 px lower than in town (configureTownFits holds town at 922x423). At 667x375 that
     band is 132 px: the sentence's two lines and the heads fill it, and one scroll brings the rows (below). */
  await listGetsHeight(page, tag, { '922x423': 2, '844x390': 1, '667x375': 0 }[tag] || 0, fails);
  for (const tab of ['spells', 'food', 'ammo']) {
    await page.click('.ca-tab[data-tab="' + tab + '"]');
    if (!(await wait(page, (t) => document.querySelector('.ca-tab[data-tab="' + t + '"][aria-selected="true"]') && document.querySelectorAll('.ca-runs .ca-row').length > 3, tab, 4000))) {
      fails.push('PH-1 [' + tag + '] the ' + tab + ' tab shows no list'); continue;
    }
    /* The column heads: each shown head cell sits over the same column's cells (centre inside the cell). */
    const heads = await page.evaluate(() => Array.from(document.querySelectorAll('.ca-runs .ca-run')).map((run) => {
      const shown = (e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length;
      const hc = Array.from(run.querySelectorAll('.ca-head > .ca-c')).filter(shown).map((e) => e.getBoundingClientRect());
      const row = run.querySelector('.ca-list .ca-row');
      const rc = row ? Array.from(row.querySelectorAll('.ca-c')).filter(shown).map((e) => e.getBoundingClientRect()) : [];
      const head = run.querySelector('.ca-head').getBoundingClientRect();
      const name = run.querySelector('.ca-head .ca-name').getBoundingClientRect();
      const off = hc.map((h, i) => { const r = rc[i]; const cx = h.left + h.width / 2; return r && cx >= r.left - 2 && cx <= r.right + 2 ? null : Math.round(cx); }).filter((x) => x !== null);
      const oneLine = hc.every((h) => h.top >= head.top - 0.5 && h.bottom <= head.bottom + 0.5 && Math.abs((h.top + h.bottom) / 2 - (name.top + name.bottom) / 2) < 12);
      return { run: run.getAttribute('data-run'), heads: hc.length, cells: rc.length, off, oneLine };
    }));
    for (const h of heads) {
      if (h.heads !== h.cells || h.off.length) fails.push('PH-1 [' + tag + '] ' + tab + ' / ' + h.run + ': ' + h.heads + ' head cells over ' + h.cells + ' columns, ' + h.off.length + ' off their column');
      else if (!h.oneLine) fails.push('PH-1 [' + tag + '] ' + tab + ' / ' + h.run + ': a column head wrapped below the row of heads');
    }
    /* ...and no head or cell takes a second line or runs past its column (a head that wrapped grew the row of heads with it, so
       the line-up above never saw "g per HP, cheapest first" stand four lines tall) */
    const cut = await page.evaluate(WRAPPED);
    if (cut.length) fails.push('PH-1 [' + tag + '] ' + tab + ': a head or cell wraps or runs past its column: ' + cut.slice(0, 4).join(' | '));
    /* Scroll the list the way a thumb (or a wheel) does, over its first row (or the middle of a short screen when
       that row is further down), until its last row shows. A new tab's list starts at its first row. */
    const first = await page.evaluate(() => { const r = window.__r('.ca-runs .ca-row'); return r && { x: r.left + r.width / 2, y: r.top + r.height / 2, vh: innerHeight }; });
    if (!first || first.y > first.vh) { fails.push('PH-1 [' + tag + '] ' + tab + ': the list starts below the screen'); continue; }
    if (first.y < 0) { fails.push('PH-1 [' + tag + '] ' + tab + ': the tab opened with its list scrolled past its first row'); continue; }
    await page.mouse.move(first.x, Math.min(first.y, first.vh * 0.55));
    let seen = null;
    for (let i = 0; i < 60; i++) {
      seen = await page.evaluate(() => { const rows = document.querySelectorAll('.ca-runs .ca-row'); const last = rows[rows.length - 1];
        return { on: window.__onScreen(window.__r(last)) && window.__hits(last), n: rows.length }; });
      if (seen.on) break;
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(30);
    }
    if (!seen.on) fails.push('PH-1 [' + tag + '] ' + tab + ': the last of ' + seen.n + ' rows never scrolls on screen inside the sheet');
    const keep = await page.evaluate(() => Object.fromEntries([['Save', '.ca-foot [data-x="save"]'], ['Cancel', '.ca-foot [data-x="cancel"]'], ['the close', '.ca-close']]
      .map(([k, q]) => { const e = document.querySelector(q); return [k, window.__onScreen(window.__r(e)) && window.__hits(e)]; })));
    for (const [k, ok] of Object.entries(keep)) if (!ok) fails.push('PH-1 [' + tag + '] ' + tab + ': ' + k + ' is off screen or covered with the list scrolled down');
  }
  /* The page itself never slides sideways (at 667 px a too-wide icon row let a tap pan the whole game 43 px). */
  const pan = await page.evaluate(() => { const d = document.scrollingElement; const app = document.querySelector('.app');
    return { doc: d.scrollWidth - innerWidth, left: d.scrollLeft + (app ? app.scrollLeft : 0) }; });
  if (pan.doc > 0 || pan.left) fails.push('PH-1 [' + tag + '] the page pans sideways: ' + pan.doc + ' px wider than the screen, slid ' + pan.left + ' px');
  /* ...and never will: the screen layer is the screen. Once the moved widgets came to be clamped on screen (widget-move,
     v0.2.46) nothing of today's fixture runs past the edge, so a screen widget wider than its room is planted (the 667 px
     icon row of 10-24, a long name, a future widget at its default place): the page still may not widen. */
  const wide = await page.evaluate(() => { const scr = document.querySelector('.hs-screen'); if (!scr) return null;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;top:0;left:calc(100% - 40px);width:480px;height:8px;pointer-events:none';
    scr.appendChild(probe);
    const out = { doc: document.scrollingElement.scrollWidth - innerWidth, past: probe.getBoundingClientRect().right - innerWidth };
    probe.remove(); return out; });
  if (!wide) fails.push('PH-1 [' + tag + '] CONTROL: no screen layer (.hs-screen)');
  else if (wide.past <= 0) fails.push('PH-1 [' + tag + '] CONTROL: the planted wide widget does not run past the screen');
  else if (wide.doc > 0) fails.push('PH-1 [' + tag + '] a screen widget wider than its room widens the page by ' + wide.doc + ' px');
}

/* ── PH-2 ── */
const AN = `({ an: window.__r('.ha-analyzer'), bar: window.__r('.ht-bar'), hub: window.__r('.hb-bar'), party: window.__r('.hp-party'),
  pressed: (document.querySelector('[data-hs-act="details"]') || {}).getAttribute && document.querySelector('[data-hs-act="details"]').getAttribute('aria-pressed') })`;
const anState = (page) => page.evaluate((src) => (0, eval)(src), AN);
async function analyzerToggles(page, base, tag, fails, phone) {
  const details = '.ht-bar [data-hs-act="details"]';
  /* A press a thumb can make: the button on top where it is pressed (a panel over it eats the press). */
  const pressDetails = async () => { if (await page.click(details, { timeout: 2500 }).then(() => true, () => false)) return true;
    fails.push('PH-2 [' + tag + '] Hunt details cannot be pressed (something lies over it)'); return false; };
  let a = await anState(page);
  if (phone && a.an) fails.push('PH-2 [' + tag + '] the analyzer shows on a phone before Hunt details is pressed');
  if (!phone && !a.an) fails.push('PH-2 [' + tag + '] the analyzer does not show by default on a desktop');
  if (!phone) { if (!(await pressDetails())) return; await page.waitForTimeout(250); a = await anState(page); if (a.an) fails.push('PH-2 [' + tag + '] Hunt details did not hide a shown analyzer'); }
  if (!(await pressDetails())) return;
  await page.waitForTimeout(300);
  a = await anState(page);
  if (!a.an) { fails.push('PH-2 [' + tag + '] Hunt details did not show the analyzer'); return; }
  if (a.pressed !== 'true') fails.push('PH-2 [' + tag + '] Hunt details does not read pressed while the analyzer shows (' + a.pressed + ')');
  if (window_cross(a.an, a.bar)) fails.push('PH-2 [' + tag + '] the analyzer covers the hunt bar: ' + JSON.stringify([a.an, a.bar]));
  if (window_cross(a.an, a.hub)) fails.push('PH-2 [' + tag + '] the analyzer runs over the action bar: ' + JSON.stringify([a.an, a.hub]));
  if (!(await pressDetails())) return;
  await page.waitForTimeout(300);
  a = await anState(page);
  if (a.an) fails.push('PH-2 [' + tag + '] a second press on Hunt details did not hide the analyzer');
  else if (a.pressed !== 'false') fails.push('PH-2 [' + tag + '] Hunt details still reads pressed with the analyzer hidden');
  /* Its own close: the phone's (on a desktop, as every HUD panel, Hunt details and HUD layout hide it). */
  if (!phone) return;
  if (!(await anState(page)).an && !(await pressDetails())) return;
  await page.waitForTimeout(300);
  const close = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.ha-analyzer button')).find((x) => /close|hide/i.test(x.getAttribute('aria-label') || x.textContent));
    if (!b) return 'none'; const r = window.__r(b); if (!window.__onScreen(r) || !window.__hits(b)) return 'covered'; if (r.height < 40 || r.width < 40) return 'small ' + Math.round(r.width) + 'x' + Math.round(r.height); b.click(); return 'ok'; });
  await page.waitForTimeout(300);
  if (close !== 'ok') fails.push('PH-2 [' + tag + '] the analyzer has no close a thumb can press (' + close + ')');
  else if ((await anState(page)).an) fails.push('PH-2 [' + tag + '] the analyzer\'s close did not hide it');
  /* Closed stays closed after a reload; open comes back clear of the hunt bar. */
  await page.waitForTimeout(2200);   // the residue put (debounced: residueDebounceMs, 1.5 s)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_MS });
  await play(page, null, false);
  await page.evaluate(RECT);
  await page.waitForTimeout(500);
  if ((await anState(page)).an) { fails.push('PH-2 [' + tag + '] a closed analyzer came back after a reload'); return; }
  if (!(await pressDetails())) return;
  await page.waitForTimeout(2200);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_MS });
  await play(page, null, false);
  await page.evaluate(RECT);
  await page.waitForTimeout(600);
  a = await anState(page);
  if (!a.an) fails.push('PH-2 [' + tag + '] an open analyzer did not come back after a reload');
  else if (window_cross(a.an, a.bar)) fails.push('PH-2 [' + tag + '] after a reload the analyzer covers the hunt bar: ' + JSON.stringify([a.an, a.bar]));
}
/* A FIGHT SHOWN OVER THE TOWN (a training session at the yard: the World keeps its title row, so the hunt bar's foot is 48 px lower than in a
   hunt). At 667x375 the room left above the action bar (110 px) was under the analyzer's 120 px floor: Details stepped it below the bar, off
   the screen, and showed nothing (lane/a-training-leftovers). Opened, it lies wholly on screen, clear of both bars, its close a thumb's. */
const atTheYard = (env) => {
  env.hunt = Object.assign({}, env.hunt, { hunt_id: 'training_yard_melee' });
  env.state = Object.assign({}, env.state, { active_kind: 'combat', active_id: 'training_yard_melee' });
  env.training = { skills: ['melee', 'ranged', 'magic', 'defense'], max_hours: 12, quotes: [{ skill: 'melee', level: 20, fee_h: 170, xp_h: 30000, hours_to_next: 1 }],
    run: { skill: 'melee', where: 'yard', since: new Date(env.hunt_server_now_ms - 20 * 60000).toISOString(), fee_h: 170, paid: 340, boosted: false, boost_ms: 0 },
    last_stop: null, rate: { xp_h: 30000, xp_h_item: 60000, boost_pm: 2000, min_level: 10, level: 20 }, gear: [], offers: [], shop: { on: false, today: 0, max: 10 } };
};
async function analyzerOverTown(page, tag, fails) {
  if (!(await wait(page, () => /^Training Melee/.test((document.querySelector('.ht-bar .ht-name') || {}).textContent || '')
    && document.querySelector('#panel-world[data-scene]') && document.querySelector('#panel-world').getAttribute('data-scene') !== 'hunt', null, 6000))) {
    fails.push('PH-2 [' + tag + '] CONTROL: no training session shown over the town'); return;
  }
  if (!(await page.click('.ht-bar [data-hs-act="details"]', { timeout: 2500 }).then(() => true, () => false))) { fails.push('PH-2 [' + tag + '] Details cannot be pressed'); return; }
  await page.waitForTimeout(400);
  const a = await page.evaluate(() => { const c = document.querySelector('.ha-analyzer .ha-close');
    return { an: window.__r('.ha-analyzer'), hub: window.__r('.hb-bar'), bar: window.__r('.ht-bar'), close: !!c && window.__onScreen(window.__r(c)) && window.__hits(c),
      on: window.__onScreen(window.__r('.ha-analyzer')), train: !!window.__r('.ha-analyzer .ha-train') }; });
  if (!a.an || !a.on || !a.close) fails.push('PH-2 [' + tag + '] Details opened no analyzer wholly on screen with a close in reach: ' + JSON.stringify(a));
  else if (!a.train) fails.push('PH-2 [' + tag + '] CONTROL: the analyzer does not show the training session');
  else if (window_cross(a.an, a.hub)) fails.push('PH-2 [' + tag + '] the analyzer runs over the action bar: ' + JSON.stringify([a.an, a.hub]));
  else if (window_cross(a.an, a.bar)) fails.push('PH-2 [' + tag + '] the analyzer covers the hunt bar: ' + JSON.stringify([a.an, a.bar]));
}
function window_cross(a, b) { return !!a && !!b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5; }

/* ── PH-3 ── */
async function portrait(browser, base, fails, shots) {
  const CASES = [
    { vp: { width: 390, height: 844 }, touch: true, want: true }, { vp: { width: 375, height: 812 }, touch: true, want: true },
    { vp: { width: 844, height: 390 }, touch: true, want: false }, { vp: { width: 768, height: 1024 }, touch: true, want: false },
    { vp: { width: 1024, height: 768 }, touch: true, want: false }, { vp: { width: 1440, height: 900 }, touch: false, want: false },
    { vp: { width: 390, height: 844 }, touch: false, want: false },
  ];
  for (const c of CASES) {
    const tag = tagOf(c.vp) + (c.touch ? ' touch' : ' desktop');
    const ctx = await browser.newContext({ viewport: c.vp, hasTouch: c.touch, isMobile: c.touch });
    const page = await ctx.newPage();
    const s = scripted(ALPHA);
    await stub(page, s, !!shots);
    await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded', timeout: NAV_MS });
    await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('body *')).filter((e) => /sideways/i.test(e.textContent || '') && e.children.length === 0 && e.getClientRects().length);
      const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      const screen = top && top.closest('[role="alert"], [role="dialog"], [aria-modal]');
      const box = screen && screen.getBoundingClientRect();
      const words = screen ? Array.from(screen.querySelectorAll('*')).filter((e) => e.childNodes.length && (e.textContent || '').trim() && e.getClientRects().length).map((e) => parseFloat(getComputedStyle(e).fontSize)) : [];
      return { shown: cards.length > 0, onTop: !!screen && /sideways/i.test(screen.textContent), full: !!box && box.left <= 0.5 && box.top <= 0.5 && box.right >= innerWidth - 0.5 && box.bottom >= innerHeight - 0.5,
        minPx: words.length ? Math.min(...words) : null };
    });
    if (c.want && !(r.shown && r.onTop && r.full)) fails.push('PH-3 [' + tag + '] a phone held upright sees no full-screen "turn sideways" card on top: ' + JSON.stringify(r));
    if (c.want && r.shown && !(r.minPx >= 12)) fails.push('PH-3 [' + tag + '] the turn-sideways card has text at ' + r.minPx + ' px');
    if (!c.want && r.shown) fails.push('PH-3 [' + tag + '] the turn-sideways card shows where it must not');
    if (shots && c.want && c.vp.width === 390) await page.screenshot({ path: join(shots, 'portrait-390x844-turn-sideways.png') });
    await ctx.close();
  }
}

/* ── PH-4 ── */
async function settingsTouch(page, tag, fails) {
  await page.keyboard.press('Escape');   // Escape opens Settings with no window open
  if (!(await wait(page, () => document.querySelector('[data-hs-win="settings"] .st-tab[data-cat="interface"]'), null, 4000))) { fails.push('PH-4 [' + tag + '] Settings did not open'); return; }
  await page.click('.st-tab[data-cat="interface"]');
  await page.waitForTimeout(250);
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-page="interface"] .st-row:not([hidden])')).map((row) => {
    const c = row.querySelector('input[type="checkbox"], input[type="range"]');
    if (!c) return null;
    const labels = Array.from(c.labels || []);
    const tall = Math.max(0, ...labels.map((l) => l.getBoundingClientRect().height));
    return { id: row.getAttribute('data-row'), type: c.type, target: c.type === 'range' ? c.getBoundingClientRect().height : Math.max(tall, c.getBoundingClientRect().height), linked: labels.length > 0 };
  }).filter(Boolean));
  if (!rows.some((r) => r.type === 'checkbox')) fails.push('PH-4 [' + tag + '] no toggle on the Interface page');
  for (const r of rows) {
    if (r.type === 'checkbox' && r.target < 44) fails.push('PH-4 [' + tag + '] the ' + r.id + ' toggle can be pressed on a strip ' + Math.round(r.target) + ' px tall' + (r.linked ? '' : ' (its words are not its label)'));
    if (r.type === 'range' && r.target < 44) fails.push('PH-4 [' + tag + '] the ' + r.id + ' slider is ' + Math.round(r.target) + ' px tall to a thumb');
  }
  /* A press on the words flips the box. */
  const id = 'panel.online';
  await page.evaluate((i) => document.querySelector('[data-row="' + i + '"]').scrollIntoView({ block: 'center' }), id);
  await page.waitForTimeout(150);
  const before = await page.evaluate((i) => document.querySelector('[data-row="' + i + '"] input[type="checkbox"]').checked, id);
  const words = await page.evaluate((i) => window.__r('[data-row="' + i + '"] .st-label'), id);
  if (!words) { fails.push('PH-4 [' + tag + '] the ' + id + ' row has no words'); return; }
  await page.mouse.click(words.left + Math.min(40, words.width / 2), words.top + words.height / 2);
  await page.waitForTimeout(250);
  const after = await page.evaluate((i) => document.querySelector('[data-row="' + i + '"] input[type="checkbox"]').checked, id);
  if (after === before) fails.push('PH-4 [' + tag + '] a press on "' + id + '"\'s words did not flip its box');
}

/* ── PH-5 ── */
async function tallEnough(page, q, min, what, tag, fails) {
  const hs = await page.evaluate((s) => Array.from(document.querySelectorAll(s)).filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
    .map((e) => Math.round(e.getBoundingClientRect().height)), q);
  if (!hs.length) fails.push('PH-5 [' + tag + '] no ' + what + ' to measure');
  else if (Math.min(...hs) < min) fails.push('PH-5 [' + tag + '] ' + what + ' are ' + Math.min(...hs) + ' px tall (want >= ' + min + ')');
}
async function openKey(page, key, id) {
  for (let i = 0; i < 4 && await page.evaluate(() => document.querySelectorAll('[data-hs-win]:not(.is-leaving)').length > 0); i++) {
    await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  await page.keyboard.press(key);
  return wait(page, (w) => document.querySelector('[data-hs-win="' + w + '"] [data-hs-built]'), id, 4000);
}
async function bagByTouch(page, tag, fails) {
  if (!(await openKey(page, 'v', 'shop'))) fails.push('PH-5 [' + tag + '] V did not open the Shop');
  else { await page.waitForTimeout(250); await tallEnough(page, '[data-hs-win="shop"] [data-hs-act="buy"]', 40, 'the Shop\'s Buy buttons', tag, fails); }
  if (!(await openKey(page, 'b', 'inventory'))) { fails.push('PH-5 [' + tag + '] B did not open the Inventory'); return; }
  await page.waitForTimeout(300);
  const pocket = '.hw-pocket[data-item="iron_helm"]';
  await page.evaluate((q) => document.querySelector(q).scrollIntoView({ block: 'center' }), pocket);
  if (!(await page.click(pocket, { timeout: 2500 }).then(() => true, () => false))) { fails.push('PH-5 [' + tag + '] the iron helm cannot be pressed in the bag'); return; }
  await page.hover(pocket, { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(300);
  const tip = await page.evaluate(() => { const t = document.querySelector('.hw-tip.is-on'); if (!t) return null; const r = window.__r(t);
    return { r, on: window.__onScreen(r), cut: t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1, vh: innerHeight }; });
  if (!tip) fails.push('PH-5 [' + tag + '] the iron helm shows no tooltip');
  else if (!tip.on || tip.cut) fails.push('PH-5 [' + tag + '] the tooltip does not fit the ' + tip.vh + ' px screen whole: ' + Math.round(tip.r.height) + ' px tall' + (tip.cut ? ', cut off' : '') + ' (' + Math.round(tip.r.top) + '..' + Math.round(tip.r.bottom) + ')');
  await page.mouse.move(2, 200);
  await page.waitForTimeout(200);
  const eq = await page.evaluate(() => { const b = document.querySelector('.hw-pick.is-on .hw-primary'); if (!b) return 'none'; return window.__onScreen(window.__r(b)) && window.__hits(b) ? 'ok' : 'off screen ' + JSON.stringify(window.__r(b)); });
  if (eq !== 'ok') fails.push('PH-5 [' + tag + '] with a long bag the picked item\'s Equip is not on screen (' + eq + ')');
}

/* ── PH-6 ── A high Level's "What next" (the Coordinator's 10-24 gate: a Level 29 mage at 844x390, the card ran down
   over HP / XP / MP). Since the label sweep (2026-11-16) every goal is one short label, so the long card is a hero with many goals: first the harvest
   (the longest list a line holds, below), then under More the deed (its name the server's longest: home-sections.js takes 60), the next gear, the next
   ground (a party's, with how to make one) and the next spell. A Level 29 mage who has walked the grounds above her.
   NO ENGLISH LABEL RUNS PAST FIVE LINES on a phone (set v0.2.135: the whole harvest list is 4 lines at 667x375 and fits every cap), so the card's
   words never scrolled and this rule proved nothing. The cap and its scroll are still the card's guard for longer words (a translation, a
   longer list), so PH-6 serves the harvest row at three times its English (LONG_WORDS, through open()'s route): the layout reads the words the
   page draws, never where they came from. */
const LONG_ROW = "  goal_harvest: 'Harvest {crops} on the Farm (J)',";
const LONG_WORDS = async (page) => {
  const real = await readFile(join(ROOT, 'src/data/text/coach.js'), 'utf8');
  if (!real.includes(LONG_ROW)) throw new Error('PH-6: src/data/text/coach.js has no harvest row ' + LONG_ROW);
  const body = real.replace(LONG_ROW, "  goal_harvest: '" + Array(3).fill('Harvest {crops} on the Farm (J)').join(', then ') + "',");
  await page.route(/\/src\/data\/text\/coach\.js(\?|$)/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'Cache-Control': 'no-store' }, body }));
};
function longCoach(env) {
  env.state = Object.assign({}, env.state, { level_xp: charXpForLevel(29) + 100, gold: 5000 });
  env.hunt_settings = Object.assign({}, env.hunt_settings, { role: 'mage', discipline: 'staff' });
  env.skills = { magic: { xp: 9000000, level: 44 }, defense: { xp: 900, level: 5 } };
  /* THE LONGEST FIRST LINE A HERO CAN READ: the account's field with one plot of every crop ready (a Keep's ten plots). The harvest goes
     before the deed (hunt-tutorial.js nextGoal), so the card's words are the whole list. */
  env.farm_land = { cap: 10, plot_level: 1, plots: Object.keys(CROPS).map((crop, i) => ({ i, crop, ready: true, ready_in_s: 0, waterable: false, regrows_left: 0, by: 0, by_name: 'Basil' })) };
  /* walked: the Warrens (no step up ahead of the deed), Hask's Ford and the Slake, so the next ground is the Muster Barrows, a party's, and the line says how to make one */
  env.hunt_bests = { min_ms: 600000, grounds: Object.fromEntries(['coppercap_warrens', 'hasks_ford', 'the_slake'].map((g) => [g, { solo: { xp_h: 90000, balance_h: 100 }, party: null }])) };
  const materials = ['crow_quill', 'glowing_copper_fleck', 'mosslight_tendril', 'coppercaps_tallow', 'dented_copper_pot', 'skulkers_shiv', 'goblin_totem', 'foremans_lash', 'snare_wire', 'raw_bear_meat', 'raw_wolf_meat', 'magic_essence', 'cooked_shrimp', 'silk_thread', 'lamp_jelly', 'bone_chips'];
  env.home = { tier: 1, rooms: [], tiers: [{ offer: 'home.stonecross', name: 'Stonecross Manor with its Walled Garden and Old Cider House', tier: 2, need: 1, owned: false, gold: 1, items: Object.fromEntries(materials.map((id) => [id, 1500])) }] };
  /* the reactive cards a Level 29 hero has long since read (residue coach.read), and no better gear in its bag, so
     the coach is the long "What next" line, not "Your hero just ate" or "Wear what you found" */
  env.client_state = Object.assign({}, env.client_state, { coach: { read: ['first_eat', 'first_drink', 'fight_settings', 'storage', 'stamina_low'] } });
  if (env.inventory) for (const id of ['bronze_sword', 'steel_sword', 'iron_helm', 'iron_platebody', 'shortbow']) delete env.inventory[id];
}
const COACH = `(() => { const p = document.querySelector('.hs-widget .hs-pointer:not(.is-min)'); if (!p) return null;
  const t = p.querySelector('.hs-coach-text'), dash = p.querySelector('.hs-coach-min');
  return { id: p.getAttribute('data-tutorial'), card: window.__r(p), hub: window.__r('.hb-bar'), chars: (p.textContent || '').length, maxH: getComputedStyle(p).maxHeight, coachH: getComputedStyle(p).getPropertyValue('--coach-h'),
    dash: window.__onScreen(window.__r(dash)) && window.__hits(dash), text: t && window.__r(t), top: t ? t.scrollTop : 0, end: t ? t.scrollHeight - t.clientHeight : 0,
    lines: t ? t.clientHeight / parseFloat(getComputedStyle(t).lineHeight) : 0 }; })()`;
const coachState = (page) => page.evaluate((src) => (0, eval)(src), COACH);
async function coachFits(page, tag, fails, phone) {
  const c = await coachState(page);
  if (!c) { fails.push('PH-6 [' + tag + '] CONTROL: no open coach card'); return; }
  if (c.chars < 300) { fails.push('PH-6 [' + tag + '] CONTROL: the coach (' + c.id + ') says only ' + c.chars + ' characters, so it proves nothing'); return; }
  if (!phone) {
    /* THE DESKTOP'S HUNT CARD STANDS IN THE LEFT COLUMN (hud-room.js dockCoach; audit 2026-11-15 F1: under the hunt bar it lay on the hero): whole where the column has the room,
       else it ends above the action bar with its fold in reach and its words scroll to their end under a wheel. The town's card is never capped. */
    /* lane/b-ui-wave2 (set/v0.2.139) docked the TOWN card too, under the Tally in the right column (max-height --coach-h), so the town's card is
       judged as the hunt's: on screen above the action bar, its fold in reach, its words scrolled to their end. (Was: "the town's card is never capped".) */
    if (!c.hub || !window_onScreen(c.card, page.viewportSize()) || c.card.bottom > c.hub.top + 0.5) { fails.push('PH-6 [' + tag + '] the desktop coach card runs over the action bar or off the screen: ' + JSON.stringify(c.card)); return; }
    if (!c.dash) { fails.push('PH-6 [' + tag + '] the fold of the desktop coach is off screen or covered'); return; }
    /* whole where the column has the room: a desktop card's words scroll only once it has filled its room down to the action bar */
    { const cap = parseFloat(c.maxH), room = parseFloat(c.coachH);
      if (c.end > 0 && room > 0 && !(cap >= room - 2)) { fails.push('PH-6 [' + tag + '] the desktop coach scrolls ' + c.end + ' px capped at ' + c.maxH + ' inside a ' + Math.round(room) + ' px room'); return; } }
    await page.mouse.move(c.text.left + c.text.width / 2, c.text.top + c.text.height / 2);
    let d = c;
    for (let i = 0; i < 20 && d.top < d.end - 1; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(40); d = await coachState(page); }
    if (d.top < d.end - 1) fails.push('PH-6 [' + tag + '] the words of the desktop coach never scroll to their end (' + Math.round(d.top) + ' of ' + Math.round(d.end) + ' px)');
    return;
  }
  if (!c.hub) { fails.push('PH-6 [' + tag + '] CONTROL: no action bar'); return; }
  if (!window_onScreen(c.card, page.viewportSize()) || c.card.bottom > c.hub.top + 0.5) {
    fails.push('PH-6 [' + tag + '] the coach card runs ' + Math.round(c.card.bottom - c.hub.top) + ' px over the action bar (' + Math.round(c.card.top) + '..' + Math.round(c.card.bottom) + ', the bar at ' + Math.round(c.hub.top) + ')');
    return;
  }
  if (!c.dash) { fails.push('PH-6 [' + tag + '] the coach\'s fold is off screen or covered'); return; }
  /* A phone shows its scrollbar only while it scrolls: the words' box ends part-way into a line, so the cut says "more". */
  const part = c.lines % 1;
  if (c.end > 0 && (part < 0.25 || part > 0.75)) { fails.push('PH-6 [' + tag + '] the coach\'s words end on a whole line (' + c.lines.toFixed(2) + ' lines shown), so nothing says they scroll'); return; }
  /* Its words scroll to their end under a wheel (a thumb) over them, and the fold stays in reach and folds it. */
  await page.mouse.move(c.text.left + c.text.width / 2, c.text.top + c.text.height / 2);
  let s = c;
  for (let i = 0; i < 20 && s.top < s.end - 1; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(40); s = await coachState(page); }
  if (!(c.end > 0) || s.top < s.end - 1) { fails.push('PH-6 [' + tag + '] the coach\'s words never scroll to their end (' + Math.round(s.top) + ' of ' + Math.round(s.end) + ' px)'); return; }
  /* PH-27: the gold tip in the box's corner says the words go on, and goes when they end. */
  const atEnd = await goldIn(page, corner(s.text));
  await page.evaluate(() => { document.querySelector('.hs-widget .hs-pointer:not(.is-min) .hs-coach-text').scrollTop = 0; });
  await page.waitForTimeout(60);
  const atTop = await goldIn(page, corner(s.text));
  if (atTop < 4) fails.push('PH-27 [' + tag + '] a card with more words shows no gold tip (' + atTop + ' gold px in the corner)');
  if (atEnd > 1) fails.push('PH-27 [' + tag + '] the gold tip stays once the words have ended (' + atEnd + ' gold px)');
  await page.evaluate(() => { const t = document.querySelector('.hs-widget .hs-pointer:not(.is-min) .hs-coach-text'); t.scrollTop = t.scrollHeight; });
  if (!s.dash) { fails.push('PH-6 [' + tag + '] the coach\'s fold scrolls away with its words'); return; }
  if (!(await page.click('.hs-widget .hs-pointer .hs-coach-min', { timeout: 2500 }).then(() => true, () => false))) { fails.push('PH-6 [' + tag + '] the coach\'s fold cannot be pressed'); return; }
  if (!(await wait(page, () => document.querySelector('.hs-widget .hs-pointer.is-min'), null, 3000))) fails.push('PH-6 [' + tag + '] a press on the coach\'s fold did not fold it');
}
function window_onScreen(r, vp) { return !!r && r.left >= -0.5 && r.top >= -0.5 && r.right <= vp.width + 0.5 && r.bottom <= vp.height + 0.5; }
/* The corner of a card's words where its tip stands; gold px in a box of the screen, read by a blank page (the repo has no PNG reader). */
const corner = (t) => ({ x: Math.round(t.right - 14), y: Math.round(t.bottom - 10), width: 14, height: 10 });
async function goldIn(page, box) {
  const png = await page.screenshot({ clip: box });
  const blank = await page.context().newPage();
  try {
    return await blank.evaluate(async (b64) => {
      const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode();
      const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
      const x = c.getContext('2d'); x.drawImage(i, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let k = 0; k < d.length; k += 4) if (d[k] > 170 && d[k + 1] > 110 && d[k + 2] < 130) n++;
      return n;
    }, png.toString('base64'));
  } finally { await blank.close(); }
}

/* ── PH-10 ── The first card of a hunt ("Your hero fights alone"): the hero and each party member, as boxes on screen
   (the figure's tile and the name plate a tile over it), never under the card. */
async function coachOffFight(page, tag, fails, phone, crew) {
  const f = await page.evaluate((units) => {
    const w = window.__world, s = w && w.stats();
    if (!s || !s.hunt || !s.hunt.hero) return null;
    const p = document.querySelector('[data-hs-widget="hunt-topbar"] > .hs-pointer:not(.is-min)');
    const t = 32 * s.z / s.dpr;
    const box = (x, y) => { const q = w.screenOf(x, y); return { left: q.x - t / 2, right: q.x + t / 2, top: q.y - 1.5 * t, bottom: q.y + t / 2 }; };
    const mates = (s.hunt.units || []).filter((u) => units.includes(u.unit) && u.unit !== s.hunt.hero.unit);
    return { card: p && window.__r(p), id: p && p.getAttribute('data-tutorial'), party: window.__r('.hp-party'),
      figures: [['the hero', box(s.hunt.hero.x, s.hunt.hero.y)]].concat(mates.map((u) => ['party unit ' + u.unit, box(u.x, u.y)])) };
  }, crew);
  if (!f) { fails.push('PH-10 [' + tag + '] CONTROL: no World runtime or no hero in the hunt'); return; }
  if (!f.card) { fails.push('PH-10 [' + tag + '] CONTROL: no open coach card under the hunt bar'); return; }
  if (f.figures.length !== crew.length) { fails.push('PH-10 [' + tag + '] CONTROL: ' + f.figures.length + ' figures drawn, want the hero and ' + (crew.length - 1) + ' party member(s)'); return; }
  if (!window_onScreen(f.card, page.viewportSize())) { fails.push('PH-10 [' + tag + '] the coach card runs off the screen: ' + JSON.stringify(f.card)); return; }
  /* the desktop too (audit 2026-11-15 F1: at 1280x720 the card under the centred hunt bar lay on the hero the camera centres) */
  const hit = f.figures.filter(([, b]) => window_cross(f.card, b)).map(([n, b]) => n + ' at ' + Math.round(b.left) + '..' + Math.round(b.right));
  if (hit.length) fails.push('PH-10 [' + tag + '] the coach card (' + f.id + ', ' + Math.round(f.card.left) + '..' + Math.round(f.card.right) + ' x '
    + Math.round(f.card.top) + '..' + Math.round(f.card.bottom) + ') lies on ' + hit.join(', '));
  /* ...and a card that only pushes the fight under the Party panel has hidden it all the same */
  if (!f.party) { fails.push('PH-10 [' + tag + '] CONTROL: no Party panel'); return; }
  const under = f.figures.filter(([, b]) => window_cross(f.party, b)).map(([n, b]) => n + ' at ' + Math.round(b.left) + '..' + Math.round(b.right));
  if (under.length) fails.push('PH-10 [' + tag + '] with the coach card up the camera puts ' + under.join(', ') + ' under the Party panel (its right edge ' + Math.round(f.party.right) + ')');
}

/* ── PH-7 ── THE PHONE'S OWN BAR (Tyler 10-25: "Not having it there is dangerous for the player"; "mobile needs its own
   bar"). Every fight control and the stamina "+" on screen, uncut by any box that clips it and pressable where it is
   drawn; the tutorial's hooks each on one shown element; the ring's words inside its disc; the last column of slots
   reachable by a sideways swipe over them when the screen is too narrow for all ten. */
const HOOKS = ['fight-settings', 'preset', 'stance', 'chase', 'distance', 'level', 'stamina', 'stamina-buy'];
const BAR_FIT = `(() => {
  const cut = (c) => { const r = c.getBoundingClientRect();
    for (let a = c.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const q = a.getBoundingClientRect(); if (r.left < q.left - 0.5 || r.right > q.right + 0.5 || r.top < q.top - 0.5 || r.bottom > q.bottom + 0.5) return true; }
    return false; };
  const ctl = Array.from(document.querySelectorAll('.hb-plaque [data-opt="stance"], .hb-plaque [data-opt="chase"], .hb-plaque [data-opt="distance"], .hb-plaque .hb-more, .hb-plaque .hb-prep, .hb-set .hs-name, .hb-stam-buy'));
  const bad = ctl.filter((c) => !(window.__onScreen(window.__r(c)) && window.__hits(c) && !cut(c))).map((c) => (c.getAttribute('data-opt') || c.className) + (c.getAttribute('data-val') ? ' ' + c.getAttribute('data-val') : ''));
  const hooks = ${JSON.stringify(HOOKS)}.filter((h) => { const e = document.querySelectorAll('[data-coach-hook="' + h + '"]'); return e.length !== 1 || !window.__onScreen(window.__r(e[0])); });
  return { n: ctl.length, bad, hooks };
})()`;
async function barFits(page, tag, fails) {
  await wait(page, () => document.querySelector('.hb-plaque [data-opt="stance"]:not([disabled])'));
  const f = await page.evaluate((src) => (0, eval)(src), BAR_FIT);
  if (f.n < 9 || f.bad.length) fails.push('PH-7 [' + tag + '] fight controls off screen, cut or covered: ' + f.bad.join(', ') + ' (' + f.n + ' found)');
  if (f.hooks.length) fails.push('PH-7 [' + tag + '] the tutorial hooks missing, doubled or off screen: ' + f.hooks.join(', '));
  const ring = await page.evaluate((src) => (0, eval)(src), RING_WORDS);
  if (ring.err || !ring.n || ring.out.length || ring.bitmap || ring.crisp) fails.push('PH-7 [' + tag + '] the ring: ' + JSON.stringify(ring));
  const widest = await page.evaluate((src) => (0, eval)(src), RING_WORDS_WIDEST);
  if (widest.err || !widest.n || widest.out.length) fails.push('PH-7 [' + tag + '] the ring at its widest words (XP 99% under Level 999): ' + JSON.stringify(widest));
  /* A swipe over the slots (a sideways wheel, as a thumb scrolls) brings slots 10 and 20 into reach. */
  const g = await page.evaluate(() => window.__r('.hb-grid'));
  if (!g) { fails.push('PH-7 [' + tag + '] CONTROL: no slot block'); return; }
  await page.mouse.move(g.left + g.width / 2, g.top + g.height / 2);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(240, 0); await page.waitForTimeout(40); }
  await page.waitForTimeout(250);
  const last = await page.evaluate(() => ['9', '19'].map((n) => { const s = document.querySelector('.hb-slot[data-slot="' + n + '"]'); const r = window.__r(s), g = window.__r('.hb-grid');
    return !!r && window.__onScreen(r) && window.__hits(s) && r.left >= g.left - 0.5 && r.right <= g.right + 0.5; }));
  if (last.some((x) => !x)) fails.push('PH-7 [' + tag + '] slots 10 and 20 cannot be reached by a swipe over the slots: ' + JSON.stringify(last));
}

/* ── PH-8 ── THE PHONE'S BAR NEVER COSTS THE DESKTOP (Tyler 10-25: "I don't want to sacrifice shit on desktop for mobile
   ever"). At 1280x800 (a Steam Deck), 1440x900 and 1920x1080 the bar is on screen, every filled slot's icon is 64 px (its
   32 art px at x2, the bigger icons he asked for), the setup, its buttons, target, stance, chase, distance and the
   stamina "+" are in view and pressable without opening anything, the ring's words sit inside its disc and no pixel
   medallion (its clock ticks and stepped bezel) is left. */
const DESK_BAR = `(() => {
  const bar = document.querySelector('.hb-bar').getBoundingClientRect();
  const icons = Array.from(document.querySelectorAll('.hb-slot[data-item] .hh-icon')).map((i) => Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height));
  const ctl = Array.from(document.querySelectorAll('.hb-plaque [data-opt]:not([data-opt="gold_floor"]), .hb-plaque .hb-more, .hb-plaque .hb-prep, .hb-set .hs-name, .hb-stam-buy'));
  return { inside: bar.left >= 0 && bar.right <= innerWidth && bar.bottom <= innerHeight, icons, n: ctl.length,
    hidden: ctl.filter((c) => !(window.__onScreen(window.__r(c)) && window.__hits(c))).map((c) => c.getAttribute('data-opt') || c.className) };
})()`;
async function desktopBar(page, tag, fails) {
  await wait(page, () => document.querySelector('.hb-plaque [data-opt="stance"]:not([disabled])'));
  const d = await page.evaluate((src) => (0, eval)(src), DESK_BAR);
  if (!d.inside) fails.push('PH-8 [' + tag + '] the desktop bar runs off the screen');
  if (!d.icons.length || d.icons.some((s) => s !== '64x64')) fails.push('PH-8 [' + tag + '] the slot icons are not 64 px (x2): ' + d.icons.join(' '));
  if (d.n < 9 || d.hidden.length) fails.push('PH-8 [' + tag + '] fight controls not in view and pressable on the desktop bar: ' + d.hidden.join(', ') + ' (' + d.n + ' found)');
  const ring = await page.evaluate((src) => (0, eval)(src), RING_WORDS);
  if (ring.err || !ring.n || ring.out.length || ring.bitmap || ring.crisp) fails.push('PH-8 [' + tag + '] the ring: ' + JSON.stringify(ring));
  const widest = await page.evaluate((src) => (0, eval)(src), RING_WORDS_WIDEST);
  if (widest.err || !widest.n || widest.out.length) fails.push('PH-8 [' + tag + '] the ring at its widest words (XP 99% under Level 999): ' + JSON.stringify(widest));
}

/* ── PH-9 ── THE STAMINA "+" (Tyler 10-25), on a phone (844x390): it opens a panel wholly on screen with the server's quote
   ("+4 h for 1,880 gp", "3 h 12 m of 8 h") and Buy in reach; Buy sends ONE hr_stamina_refill at that price and is off until
   the answer; the stamina shown moves only with the re-read; a refusal reads in words; today's refills used or too little
   gold turn Buy off with the reason and keep the "+"; "Premium raises your stamina cap by 4 hours." shows to a hero
   without premium only. */
const H4 = 4 * 3600000;
const freeHero = (gold, quote) => (env) => {
  env.premium = { active: false };
  env.state = Object.assign({}, env.state, { gold });
  env.stamina = Object.assign({}, env.stamina, { ms: 11520000, max_ms: 28800000 });
  env.stamina_refill = quote;
};
const QUOTE = { available: true, why: null, restore_ms: H4, price: 1880, n: 2, per_day: 6 };
const PANEL = `(() => { const b = document.querySelector('.hb-buy'), q = (k) => b.querySelector(k), shown = (e) => !!e && e.getClientRects().length > 0;
  return { on: shown(b), whole: window.__onScreen(window.__r(b)), now: q('.hb-buy-now').textContent, quote: q('.hb-buy-quote').textContent, why: q('.hb-buy-why').textContent,
    premium: shown(q('.hb-buy-premium')), off: q('.hb-buy-go').disabled, reach: window.__onScreen(window.__r(q('.hb-buy-go'))) && window.__hits(q('.hb-buy-go')),
    msg: q('.hb-buy-msg').textContent, plus: window.__onScreen(window.__r('.hb-stam-buy')) }; })()`;
const panelOf = (page) => page.evaluate((src) => (0, eval)(src), PANEL);
async function staminaBuy(open, fails, done) {
  const tag = '844x390', vp = { width: 844, height: 390 };
  const a = await open(vp, HUNT, freeHero(25000, QUOTE));
  if (!a.up) { fails.push('PH-9 the hunt did not mount'); await a.ctx.close(); return; }
  await a.page.click('.hb-stam-buy', { timeout: 2500 }).catch(() => null);
  await a.page.waitForTimeout(250);
  const p0 = await panelOf(a.page);
  if (!p0.on || !p0.whole || !p0.reach || !/\+4 h for 1,880 gp/.test(p0.quote) || p0.off || p0.now !== '3 h 12 m of 8 h') fails.push('PH-9 [' + tag + '] the "+" did not open the server\'s quote whole on screen: ' + JSON.stringify(p0));
  if (!p0.premium) fails.push('PH-9 [' + tag + '] a hero without premium is not told premium raises the cap');
  a.s.holdRefill = true;
  /* The first press asks, in the Shop's words, at the price the server quotes NOW (town rest moved it while the panel stood open, QA 11-14);
     nothing is sent until the second. */
  a.s.env.stamina_refill = Object.assign({}, QUOTE, { price: 1840 });
  await a.page.click('.hb-buy-go', { timeout: 2500 }).catch(() => null);
  await wait(a.page, () => /\?$/.test(document.querySelector('.hb-buy-quote').textContent), null, 4000);
  const asked = await panelOf(a.page);
  if (!/^Buy 4 h of stamina for 1,840 gp\?$/.test(asked.quote) || a.s.calls.some((c) => c.name === 'hr_stamina_refill')) fails.push('PH-9 [' + tag + '] the first press on Buy (the server quotes 1,840 gp now): ' + JSON.stringify(asked));
  a.s.onRefill = () => { a.s.env.stamina = Object.assign({}, a.s.env.stamina, { ms: a.s.env.stamina.ms + H4 }); a.s.env.stamina_refill = Object.assign({}, QUOTE, { restore_ms: 2880000, price: 520, n: 3 }); return { ok: true }; };
  await a.page.click('.hb-buy-go', { timeout: 2500 }).catch(() => null);
  for (let i = 0; i < 40 && !a.s.calls.some((c) => c.name === 'hr_stamina_refill'); i++) await a.page.waitForTimeout(50);
  const mid = await panelOf(a.page);
  if (!mid.off || mid.now !== '3 h 12 m of 8 h') fails.push('PH-9 [' + tag + '] Buy stayed on (or the stamina moved) before the server answered: ' + JSON.stringify(mid));
  a.s.holdRefill = false;
  if (a.s.releaseRefill) a.s.releaseRefill();
  const bought = await wait(a.page, () => document.querySelector('.hb-buy-now').textContent === '7 h 12 m of 8 h' && document.querySelector('.hb-buy-msg').textContent === 'Stamina restored', null, 6000);
  const sent = a.s.calls.filter((c) => c.name === 'hr_stamina_refill');
  if (sent.length !== 1 || sent[0].body.p_price !== 1840 || sent[0].body.p_slot !== 0 || !sent[0].body.p_idem) fails.push('PH-9 [' + tag + '] Buy sent ' + JSON.stringify(sent.map((c) => c.body)));
  if (!bought) fails.push('PH-9 [' + tag + '] after the server answered the panel reads ' + JSON.stringify(await panelOf(a.page)));
  /* A refusal that brings new server state replaces what the panel offers (lane/a-quote-changed; live 11-14: 197 gp shown, 169 quoted, every
     retry refused; "+1 m for 31 gp" offered at 11:59 h after the server said full): the price moved, then the bar filled. */
  const askThenBuy = async () => {
    await a.page.click('.hb-buy-go', { timeout: 2500 }).catch(() => null);
    await wait(a.page, () => /\?$/.test(document.querySelector('.hb-buy-quote').textContent), null, 4000);
    await a.page.click('.hb-buy-go', { timeout: 2500 }).catch(() => null);
  };
  a.s.onRefill = () => { a.s.env.stamina_refill = Object.assign({}, QUOTE, { restore_ms: 2880000, price: 410, n: 3 }); return { ok: false, error: 'quote_changed', stamina_refill: a.s.env.stamina_refill }; };
  a.s.env.stamina_refill = Object.assign({}, QUOTE, { restore_ms: 2880000, price: 520, n: 3 });
  await askThenBuy();   // the question reads 520 (the server's then); the server moves to 410 under the second press
  const moved = await wait(a.page, () => /^Prices changed, check the total and try again$/.test(document.querySelector('.hb-buy-msg').textContent) && / 410 gp$/.test(document.querySelector('.hb-buy-quote').textContent), null, 6000);
  if (!moved) fails.push('PH-9 [' + tag + '] after quote_changed (the server quotes 410 gp) the panel reads ' + JSON.stringify(await panelOf(a.page)));
  a.s.onRefill = () => { a.s.env.stamina = Object.assign({}, a.s.env.stamina, { ms: 28800000 }); a.s.env.stamina_refill = { available: false, why: 'stamina_full', n: 3, per_day: 6 };
    return { ok: false, error: 'stamina_full', stamina_refill: a.s.env.stamina_refill }; };
  await askThenBuy();
  const full = await wait(a.page, () => document.querySelector('.hb-buy-go').disabled && /^Stamina full$/.test(document.querySelector('.hb-buy-why').textContent), null, 6000);
  if (!full) fails.push('PH-9 [' + tag + '] after the server said the bar is full the panel still offers a refill: ' + JSON.stringify(await panelOf(a.page)));
  await done(a, tag);
  /* Cannot be bought: Buy off with the server's words, the "+" still there; a premium hero is not told about premium. */
  for (const [label, prep, words, premium] of [
    ['today\'s refills used', freeHero(25000, { available: false, why: 'refill_limit', n: 7, per_day: 6 }), /^Daily refill limit reached$/, true],
    ['not enough gold, a premium hero', (env) => { freeHero(100, QUOTE)(env); env.premium = { active: true }; }, /^Not enough gold$/, false]]) {
    const o = await open(vp, HUNT, prep);
    if (!o.up) { fails.push('PH-9 [' + label + '] the hunt did not mount'); await o.ctx.close(); continue; }
    await o.page.click('.hb-stam-buy', { timeout: 2500 }).catch(() => null);
    await o.page.waitForTimeout(250);
    const p = await panelOf(o.page);
    if (!words.test(p.why) || !p.off || !p.plus) fails.push('PH-9 [' + tag + '] ' + label + ': ' + JSON.stringify(p));
    if (p.premium !== premium) fails.push('PH-9 [' + tag + '] ' + label + ': the premium note ' + (premium ? 'is missing' : 'shows to a premium hero'));
    await done(o, tag);
  }
}

/* ── PH-18 to PH-24 ── THE PANEL'S SECOND READ (2026-11-01, art/review/player-feedback-2026-11-01/phone-perf.txt on lane/f2-phone-perf). */
const insideSheet = (page, win, q) => page.evaluate(([w, s]) => { const sheet = window.__r('[data-hs-win="' + w + '"]');
  return Array.from(document.querySelectorAll('[data-hs-win="' + w + '"] ' + s)).filter((e) => e.getClientRects().length).map((e) => { const r = window.__r(e); return { t: (e.textContent || e.value || '').trim().slice(0, 18), in: r.left >= sheet.left - 0.5 && r.right <= sheet.right + 0.5, on: window.__onScreen(r) }; }); }, [win, q]);
async function coachSheet(page, tag, fails) {
  await page.click('.hs-launch[data-hs-open="hunts"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="hunts"] .hs-win-coach .hs-pointer') && document.querySelector('.hw-hunt b'), null, 4000))) { fails.push('PH-18 [' + tag + '] CONTROL: no card in Hunts'); return; }
  await page.waitForTimeout(250);
  const f = await page.evaluate(() => { const card = window.__r('[data-hs-win="hunts"] .hs-win-coach .hs-pointer'), sheet = window.__r('[data-hs-win="hunts"]'), name = document.querySelector('.hw-hunt b'), r = window.__r(name);
    return { over: Math.max(0, card.right - sheet.left), on: window.__onScreen(r) && document.elementFromPoint(r.left + 8, r.top + r.height / 2) !== null && name.contains(document.elementFromPoint(r.left + 8, r.top + r.height / 2)), name: name.textContent, cardOn: window.__onScreen(card) }; });
  if (f.over > 0.5) fails.push('PH-18 [' + tag + '] the card in Hunts lies ' + Math.round(f.over) + ' px over the sheet, not beside it');
  if (!f.cardOn) fails.push('PH-18 [' + tag + '] the card beside the sheet runs off the screen');
  if (!f.on) fails.push('PH-18 [' + tag + '] the ground the card names (' + f.name + ') is covered or off screen');
  await page.click('.hw-hunt', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(300);
  const g = await page.evaluate(() => ({ body: window.__r('[data-hs-win="hunts"] .hs-win-body').height, enter: (() => { const b = document.querySelector('.hw-hunt-enter'); return !!b && window.__onScreen(window.__r(b)) && window.__hits(b); })() }));
  if (g.body < 165 || !g.enter) fails.push('PH-18 [' + tag + '] a ground\'s page gets ' + Math.round(g.body) + ' px beside its card, Enter ' + g.enter);
}
/* The how-to already stands aside on every screen (shell.css .is-hint), so a hero in town no longer tells: only a hero mid-hunt with a Hunts card
   up still has a note, "You are hunting in …", and on a phone it gives the sheet's room to the card and the grounds as well. */
async function coachSheetHunting(page, tag, fails) {
  await page.click('.hs-launch[data-hs-open="hunts"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="hunts"] .hs-win-coach .hs-pointer') && document.querySelector('.hw-hunts-now') && document.querySelector('.hw-hunt b'), null, 4000))) { fails.push('PH-18 [' + tag + '] CONTROL: no card in Hunts mid-hunt'); return; }
  await page.waitForTimeout(250);
  const n = await page.evaluate(() => { const note = document.querySelector('.hw-hunts-now'); return { hint: note.classList.contains('is-hint'), said: note.textContent, box: note.getClientRects().length }; });
  if (n.hint || !/^Hunting in /.test(n.said)) fails.push('PH-18 [' + tag + '] CONTROL: mid-hunt the note reads ' + JSON.stringify(n));
  else if (n.box) fails.push('PH-18 [' + tag + '] the note of the running hunt stands over the grounds the card names');
}
/* Got it hands the sheet back: the next card waits on its tab until the tab is pressed. */
async function gotItRests(page, tag, fails) {
  await pressBar(page, 'shop').catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="shop"] .hs-win-coach .hs-coach-got'), null, 4000))) { fails.push('PH-18 [' + tag + '] CONTROL: no card with Got it in the Shop'); return; }
  const first = await page.evaluate(() => document.querySelector('[data-hs-win="shop"] .hs-win-coach .hs-pointer').getAttribute('data-tutorial'));
  await page.click('[data-hs-win="shop"] .hs-win-coach .hs-coach-got', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(500);
  const next = await page.evaluate(() => { const p = document.querySelector('[data-hs-win="shop"] .hs-win-coach .hs-pointer'); return p && { id: p.getAttribute('data-tutorial'), min: p.classList.contains('is-min'), h: window.__r(p).height }; });
  if (!next || next.id === first) { fails.push('PH-18 [' + tag + '] CONTROL: Got it on ' + first + ' brought ' + JSON.stringify(next)); return; }
  if (!next.min || next.h > 60) fails.push('PH-18 [' + tag + '] Got it chained the next card open: ' + JSON.stringify(next));
  await page.click('[data-hs-win="shop"] .hs-win-coach .hs-coach-tab', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(400);
  if (await page.evaluate(() => document.querySelector('[data-hs-win="shop"] .hs-win-coach .hs-pointer').classList.contains('is-min'))) { fails.push('PH-18 [' + tag + '] the tab does not open the next card'); return; }
  /* That card's foot is its own row under its words (2026-11-12: on the title row it stood "Sell what only pays coin" one word to a line, under Don't show tips). */
  await page.waitForTimeout(150);
  const t = await page.evaluate(() => { const p = document.querySelector('[data-hs-win="shop"] .hs-win-coach .hs-pointer'), b = p.querySelector(':scope > b'), w = p.querySelector('.hs-coach-text'), f = p.querySelector('.hs-coach-foot');
    return { title: b.textContent, lines: Math.round(window.__r(b).height / parseFloat(getComputedStyle(b).lineHeight)), under: !!f && window.__r(f).top >= window.__r(w).bottom - 0.5 }; });
  if (t.lines > 2 || !t.under) fails.push('PH-18 [' + tag + '] the card "' + t.title + '" takes ' + t.lines + ' title lines, its foot ' + (t.under ? 'under' : 'beside') + ' its words');
}
/* ── PH-19 ── Summary and Leave apart; the fold's tab off the Details panel's close. */
async function huntBarApart(page, tag, fails) {
  const gap = await page.evaluate(() => window.__r('.ht-bar [data-hs-act="leave"]').left - window.__r('.ht-bar [data-hs-act="summary"]').right);
  if (gap < 16) fails.push('PH-19 [' + tag + '] Summary and Leave are ' + Math.round(gap) + ' px apart');
  await page.click('.ht-bar [data-hs-act="details"]', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(300);
  const x = await page.evaluate(() => { const b = document.querySelector('.ha-close'); return window.__onScreen(window.__r(b)) && window.__hits(b); });
  if (!x) fails.push('PH-19 [' + tag + '] a folded card lies over the Details panel\'s close');
}
/* ── PH-20 ── Leave party and Disband in the sheet; Disband asks once. */
async function partyActs(o, tag, fails) {
  const { page, s } = o;
  await pressBar(page, 'hunt-party').catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="hunt-party"] .hw-party-acts [data-hs-act="disband"]:not([hidden])'), null, 4000))) { fails.push('PH-20 [' + tag + '] CONTROL: the leader has no Disband: ' + await page.evaluate(() => (document.querySelector('[data-hs-win="hunt-party"]') || { innerText: 'no window' }).innerText.slice(0, 160))); return; }
  await page.waitForTimeout(250);
  const out = (await insideSheet(page, 'hunt-party', '.hw-party-acts button')).filter((b) => !b.in);
  if (out.length) fails.push('PH-20 [' + tag + '] outside the sheet: ' + out.map((b) => b.t).join(', '));
  await page.click('[data-hs-win="hunt-party"] [data-hs-act="disband"]', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(200);
  const asked = await page.evaluate(() => ({ word: document.querySelector('[data-hs-win="hunt-party"] [data-hs-act="disband"]').textContent, msg: document.querySelector('[data-hs-win="hunt-party"] .hw-party > .hh-intent-msg').textContent }));
  if (s.calls.some((c) => c.name === 'hr_hunt_party_disband')) fails.push('PH-20 [' + tag + '] one press disbanded the party');
  if (asked.word !== 'Sure?' || !/Sure\?/.test(asked.msg)) fails.push('PH-20 [' + tag + '] the first press asks nothing: ' + JSON.stringify(asked));
  await page.click('[data-hs-win="hunt-party"] [data-hs-act="disband"]', { timeout: 2500 }).catch(() => null);
  for (let i = 0; i < 40 && !s.calls.some((c) => c.name === 'hr_hunt_party_disband'); i++) await page.waitForTimeout(50);
  if (s.calls.filter((c) => c.name === 'hr_hunt_party_disband').length !== 1) fails.push('PH-20 [' + tag + '] the second press did not disband, once');
}
/* ── PH-21 ── A tapped item's tip stands off the sheet and takes no press; no tip that nothing asked for. */
async function tappedItem(page, tag, fails) {
  await page.tap('.hs-launch[data-hs-open="inventory"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="inventory"] .hw-pocket[data-item="iron_helm"]'), null, 4000))) { fails.push('PH-21 [' + tag + '] CONTROL: no helm in the bag'); return; }
  await page.evaluate(() => document.querySelector('.hw-pocket[data-item="iron_helm"]').scrollIntoView({ block: 'center' }));
  await page.tap('.hw-pocket[data-item="iron_helm"]', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(350);
  const t = await page.evaluate(() => { const tip = document.querySelector('.hw-tip.is-on'), go = document.querySelector('.hw-pick.is-on .hw-primary'), sheet = window.__r('[data-hs-win="inventory"]');
    return { tip: !!tip, cross: !!tip && window.__r(tip).right > sheet.left + 0.5, none: tip ? getComputedStyle(tip).pointerEvents : '', go: !!go && window.__onScreen(window.__r(go)) && window.__hits(go) }; });
  if (!t.tip) fails.push('PH-21 [' + tag + '] CONTROL: the tapped item shows no tip');
  if (t.cross) fails.push('PH-21 [' + tag + '] the tip lies on the sheet');
  if (t.none !== 'none') fails.push('PH-21 [' + tag + '] the tip takes presses');
  if (!t.go) fails.push('PH-21 [' + tag + '] the item\'s action is covered');
  const un = await page.evaluate(() => { document.querySelector('.hw-tip').classList.remove('is-on'); const other = document.querySelector('.hw-pocket[data-item]:not([data-item="iron_helm"])'); other.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return !!document.querySelector('.hw-tip.is-on'); });
  if (un) fails.push('PH-21 [' + tag + '] a tip showed for an item nobody pressed');
}
/* ── PH-22 ── The doors fit: Create account's way back, Enter town's foot. */
async function createDoor(browser, base, vp, fails) {
  const tag = tagOf(vp);
  const ctx = await browser.newContext({ viewport: vp });
  try {
    const page = await ctx.newPage();
    await stub(page, scripted(ALPHA), false);
    await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded', timeout: NAV_MS });
    await wait(page, () => document.querySelector('[data-auth-go="create"]'));
    await page.click('[data-auth-go="create"]');
    await page.waitForTimeout(150);
    const d = await page.evaluate(RECT + `;(() => { const l = document.querySelector('[data-auth-go="sign-in"]'), s = document.querySelector('.auth-submit'); return [l, s].every((e) => window.__onScreen(window.__r(e))); })()`);
    if (!d) fails.push('PH-22 [' + tag + '] Create account or Back to sign in is off the screen');
    /* PH-31: sent, the answer and the way back are all that is left. */
    await page.fill('input[name=email]', 'new@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.fill('input[name=confirm]', 'not-a-real-password');
    await page.click('.auth-submit');
    if (!(await wait(page, () => document.querySelector('.auth-card.is-sent'), null, 5000))) { fails.push('PH-31 [' + tag + '] CONTROL: Create account never sent'); return; }
    const sent = await page.evaluate(RECT + `;(() => { const shown = (q) => Array.from(document.querySelectorAll(q)).filter((e) => e.getClientRects().length && (e.textContent || '').trim()).map((e) => e.textContent.trim());
      return { lines: shown('.auth-card p:not(.auth-links)'), back: window.__onScreen(window.__r('[data-auth-go="sign-in"]')) }; })()`);
    if (sent.lines.length !== 1 || !/^Check your email/.test(sent.lines[0])) fails.push('PH-31 [' + tag + '] after Create account the card says: ' + JSON.stringify(sent.lines));
    if (!sent.back) fails.push('PH-31 [' + tag + '] after Create account the way back is off the screen');
  } finally { await ctx.close(); }
}
/* PH-28 READS THE LEAD AND THE FIVE WAYS AT TWICE THEIR ENGLISH. Since the label sweep (set v0.2.135, src/data/how-to-play.js) the lead is 113
   characters and each way a short line, so the step kept 85 px to spare at 667x375 and release run 44118906758 let the missing font-size-adjust
   and a lead moved down and narrowed through. Twice over is about what v0.2.134 said, the length the step was built to hold (a translation, a
   longer rule). Served over the page's own copy (a served mutant stays), never written to the tree: the layout reads the words the page draws. */
const HOW_STYLE = 'const style = (id, role, weapons, name, does, uses) => Object.freeze({ id, role, weapons: Object.freeze(weapons), name, does, uses });';
const HOW_LEAD = /export const HOW_YOU_FIGHT_LEAD = ('(?:[^'\\]|\\.)*');/;
const howTwice = (src) => src.replace(HOW_STYLE, () => HOW_STYLE.replace('does, uses });', "does: does + ' ' + does, uses: uses + ' ' + uses });"))
  .replace(HOW_LEAD, (m, lit) => 'export const HOW_YOU_FIGHT_LEAD = ' + lit + " + ' ' + " + lit + ';');
const HOW_TWICE = async (page) => {
  const real = await readFile(join(ROOT, 'src/data/how-to-play.js'), 'utf8');
  if (!real.includes(HOW_STYLE) || !HOW_LEAD.test(real)) throw new Error('PH-28: src/data/how-to-play.js moved its style() or its lead');
  await page.route(/\/src\/data\/how-to-play\.js(\?|$)/, async (r) => { const res = await r.fetch(); return r.fulfill({ response: res, body: howTwice(await res.text()) }); });
};
async function heroDoor(page, tag, fails) {
  await wait(page, () => document.querySelector('[data-app="create"]'));
  await page.click('[data-app="create"]');
  if (!(await wait(page, () => document.querySelector('.hero-confirm'), null, 5000))) { fails.push('PH-22 [' + tag + '] CONTROL: no hero creation'); return; }
  await page.waitForTimeout(150);
  const on = await page.evaluate(RECT + `;[document.querySelector('.hero-confirm'), document.querySelector('.hero-back')].every((e) => window.__onScreen(window.__r(e)))`);
  if (!on) fails.push('PH-22 [' + tag + '] Enter town or its way back runs off the screen');
  /* The step's box takes no height from its words, so its own height is what shows them. */
  const tall = await page.evaluate(() => Math.round(document.querySelector('.hero-body').getBoundingClientRect().height));
  if (tall < 150) fails.push('PH-22 [' + tag + '] How you fight is ' + tall + ' px tall');
  /* PH-28: the lead and all five ways with no scroll on a phone's screen; too short for them (browser bars, a keyboard), the cue says so until the end. */
  const how = () => page.evaluate(() => { const s = document.querySelector('.hero-body'), h = s.querySelector('.hero-how'), box = (e) => e.getBoundingClientRect(), last = box(h.querySelector('.hero-how-list li:last-child')), lead = box(s.querySelector('.hero-how-lead')), b = box(s), name = box(s.querySelector('.hero-name')), cue = h.querySelector('.hero-how-more'), c = box(cue);
    return { ways: h.querySelectorAll('.hero-how-list li').length, over: Math.round(last.bottom - b.bottom), leadOver: Math.round(lead.bottom - b.bottom), leadOnName: lead.top < name.bottom - 0.5, leadOnWays: lead.right > box(h).left + 0.5, field: Math.round(name.width), end: s.scrollHeight - s.clientHeight, cue: !!cue.getClientRects().length && c.bottom <= b.bottom + 1 && c.top >= b.top - 1 }; });
  for (const vp of [SMALL_PHONES[0], SMALL_PHONES[1]]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(150);
    const f = await how();
    if (f.ways !== 5) fails.push('PH-28 [' + tagOf(vp) + '] CONTROL: ' + f.ways + ' ways to fight');
    if (f.over > 0) fails.push('PH-28 [' + tagOf(vp) + '] How you fight is cut: its last way ends ' + f.over + ' px below the step');
    if (f.leadOver > 0) fails.push('PH-28 [' + tagOf(vp) + '] the lead is cut: it ends ' + f.leadOver + ' px below the step');
    if (f.leadOnName || f.leadOnWays) fails.push('PH-28 [' + tagOf(vp) + '] the lead lies on ' + (f.leadOnName ? 'the name' : 'the five ways'));
    if (f.field < 110) fails.push('PH-28 [' + tagOf(vp) + '] the name\'s field is ' + f.field + ' px wide');
    if (f.cue) fails.push('PH-28 [' + tagOf(vp) + '] the step says More below with nothing below');
    const on = await page.evaluate(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(); return [r('.hero-confirm'), r('.hero-back'), r('.auth-card')].every((b) => b.top >= -0.5 && b.bottom <= innerHeight + 0.5); });
    if (!on) fails.push('PH-28 [' + tagOf(vp) + '] the card runs off the screen');
  }
  /* A refusal's line takes its room from the step: Enter town stays on screen, and the step says it runs on. */
  await page.click('.hero-confirm', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(250);
  const said = await page.evaluate(() => { const m = document.querySelector('.auth-message'), r = (e) => e.getBoundingClientRect(); return { words: m.textContent, on: [r(m), r(document.querySelector('.hero-confirm')), r(document.querySelector('.hero-back'))].every((b) => b.bottom <= innerHeight + 0.5) }; });
  if (!said.words) fails.push('PH-28 [667x375] CONTROL: an empty name was not refused');
  else if (!said.on) fails.push('PH-28 [667x375] a refusal pushes Enter town off the screen');
  await page.setViewportSize({ width: 844, height: 300 });
  await page.waitForTimeout(250);
  const short = await how();
  if (!(short.end > 0)) { fails.push('PH-28 [844x300] CONTROL: the step does not overflow on a short screen'); return; }
  if (!short.cue) fails.push('PH-28 [844x300] the step runs on with no sign of it');
  await page.evaluate(() => { const s = document.querySelector('.hero-body'); s.scrollTop = s.scrollHeight; });
  await page.waitForTimeout(150);
  await page.evaluate(() => { const s = document.querySelector('.hero-body'); s.scrollTop = s.scrollHeight; });
  await page.waitForTimeout(150);
  if ((await how()).cue) fails.push('PH-28 [844x300] More below stays at the step\'s end');
}

/* ── PH-25 to PH-30 ── THE SMALL-PHONE PANEL ON v0.2.83 (2026-11-03). */
const SMALL_PHONES = [{ width: 844, height: 390 }, { width: 667, height: 375 }];
/* A hero with no party: the server's party of one. */
const aloneInHunt = (env) => { env.party = Object.assign({}, env.party, { members: [env.party.members[0]] }); };
async function groundPage(page, tag, fails, floor) {
  await page.click('.hs-launch[data-hs-open="hunts"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="hunts"] .hs-win-coach .hs-pointer') && document.querySelector('.hw-hunt b'), null, 4000))) { fails.push('PH-25 [' + tag + '] CONTROL: no card in Hunts'); return; }
  await page.waitForTimeout(250);
  /* The sheet's head stands at the icon row, on top: Town and Home go under it, and nothing clips it. */
  const head = await page.evaluate(() => { const x = document.querySelector('[data-hs-win="hunts"] .hs-close'), h = window.__r('[data-hs-win="hunts"]'), row = window.__r('.hs-launchers'); return { close: window.__onScreen(window.__r(x)) && window.__hits(x), gap: h.top - row.bottom }; });
  if (!head.close) fails.push('PH-25 [' + tag + '] the sheet\'s close is cut off or covered');
  if (head.gap > 8) fails.push('PH-25 [' + tag + '] the sheet starts ' + Math.round(head.gap) + ' px below the icon row');
  await page.click('.hw-hunt', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(300);
  const facts = () => page.evaluate(() => { const s = document.querySelector('.hw-hd-page'), e = document.querySelector('.hw-hunt-enter'), b = document.querySelector('[data-hs-win="hunts"] .hs-win-head .hs-back');
    return { read: s.clientHeight, end: s.scrollHeight - s.clientHeight, enter: window.__onScreen(window.__r(e)) && window.__hits(e), back: window.__onScreen(window.__r(b)) && window.__hits(b), over: window.__cross(window.__r('[data-hs-win="hunts"] .hs-win-coach .hs-pointer'), window.__r('[data-hs-win="hunts"]')) }; });
  const f = await facts();
  if (f.read < floor) fails.push('PH-25 [' + tag + '] a ground\'s page has ' + f.read + ' px to read, under ' + floor);
  if (f.over) fails.push('PH-25 [' + tag + '] the card takes room in the ground\'s sheet');
  if (!f.enter || !f.back) fails.push('PH-25 [' + tag + '] on a ground\'s page Enter ' + f.enter + ', the way back ' + f.back);
  /* The line beside Enter gets the foot's width, on its own row, as a refusal does (a tier's words stood a word or two a line in 100 px, 2026-11-05). */
  const why = await page.evaluate(() => { const p = document.querySelector('.hw-enter-why'), foot = document.querySelector('.hw-hd-foot'), was = p.textContent; p.textContent = 'Dangerous: more monsters at once, and they hit harder.'; const out = { w: p.getBoundingClientRect().width, foot: foot.clientWidth }; p.textContent = was; return out; });
  if (why.w < why.foot * 0.8) fails.push('PH-25 [' + tag + '] the line beside Enter has ' + Math.round(why.w) + ' px of the foot\'s ' + why.foot);
  if (!(f.end > 0)) { fails.push('PH-25 [' + tag + '] CONTROL: the page does not scroll'); return; }
  await page.evaluate(() => { const s = document.querySelector('.hw-hd-page'); s.scrollTop = s.scrollHeight; });
  await page.waitForTimeout(100);
  const low = await facts();
  if (!low.enter || !low.back) fails.push('PH-25 [' + tag + '] at the page\'s end Enter ' + low.enter + ', the way back ' + low.back);
  await page.click('[data-hs-win="hunts"] .hs-win-head .hs-back', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(200);
  if (!(await page.evaluate(() => !!window.__r('.hw-hunt-list')))) fails.push('PH-25 [' + tag + '] the way back did not bring the list');
}
/* ── PH-33 ── THE BAR BESIDE A TOWN SHEET: no slot under the sheet, every slot in reach. */
async function barBesideSheet(page, tag, fails) {
  await page.click('.hs-launch[data-hs-open="inventory"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="inventory"] .hs-win-body'), null, 4000))) { fails.push('PH-33 [' + tag + '] CONTROL: the bag did not open'); return; }
  await page.waitForTimeout(700);
  const read = () => page.evaluate(() => { const sheet = window.__r('[data-hs-win="inventory"]'), bar = window.__r('.hb-bar'), grid = window.__r('.hb-grid'), press = document.querySelector('.hb-page');
    const slots = Array.from(document.querySelectorAll('.hb-slot')), shown = slots.filter((e) => { const r = window.__r(e); return r.left >= grid.left - 0.5 && r.right <= grid.right + 0.5; });
    return { sheet: sheet.left, bar: bar.right, n: slots.length, shown: shown.map((e) => Number(e.getAttribute('data-slot'))), dead: shown.filter((e) => !window.__hits(e)).length,
      cut: grid.right < window.__r(slots[slots.length - 1]).right - 0.5 || grid.left > window.__r(slots[0]).left + 0.5, press: !!press && press.getClientRects().length > 0 && window.__hits(press) }; });
  const a = await read();
  if (a.n !== 20) { fails.push('PH-33 [' + tag + '] CONTROL: the bar has ' + a.n + ' slots'); return; }
  if (a.bar > a.sheet + 0.5) fails.push('PH-33 [' + tag + '] the bar runs ' + Math.round(a.bar - a.sheet) + ' px under the bag sheet');
  if (a.dead) fails.push('PH-33 [' + tag + '] ' + a.dead + ' of the slots on screen beside the sheet take no press');
  const seen = new Set(a.shown);
  if (a.cut) {
    if (!a.press) fails.push('PH-33 [' + tag + '] slots are cut beside the sheet and the page press is not in reach');
    else { await page.click('.hb-page', { timeout: 2500 }).catch(() => null); await page.waitForTimeout(300); const b = await read(); for (const i of b.shown) seen.add(i);
      if (b.dead || b.bar > b.sheet + 0.5) fails.push('PH-33 [' + tag + '] after the page press ' + b.dead + ' slots on screen take no press'); }
  }
  if (seen.size !== 20) fails.push('PH-33 [' + tag + '] beside the sheet only ' + seen.size + ' of 20 slots can be reached');
  await page.click('[data-hs-win="inventory"] .hs-close', { timeout: 2500 }).catch(() => null);
  const whole = await wait(page, () => !document.querySelector('[data-hs-win="inventory"]') && document.querySelector('.hb-hub').getClientRects().length > 0 && document.querySelector('.hb-plaque').getClientRects().length > 0, null, 4000);
  if (!whole) fails.push('PH-33 [' + tag + '] with the sheet closed the hub and fight panel did not come back');
}
/* ── PH-34 ── THE HUNTS SHEET SHOWS WHOLE LINES: as many as the room over the action bar holds, set tight, and every scroll rests on a line's top.
   The whole lines at rest in a hunt, a hero who has hunted (three-line grounds), the lead on two lines: at 87 px a line the 922x423 sheet held one. */
const WHOLE_LINES = Object.freeze({ '667x375': 1, '844x390': 2, '922x423': 3 });
async function huntsWholeRows(page, tag, fails) {
  await page.click('.hs-launch[data-hs-open="hunts"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelectorAll('[data-hs-win="hunts"] .hw-hunt b').length > 3, null, 4000))) { fails.push('PH-34 [' + tag + '] CONTROL: no list in Hunts'); return; }
  await page.waitForTimeout(400);
  /* the lines the list shows whole, and how far its first shown line starts above the list's top (> 0: cut) */
  const read = () => page.evaluate(() => { const l = document.querySelector('[data-hs-win="hunts"] .hw-hunt-list'), b = l.getBoundingClientRect(), top = b.top + l.clientTop, foot = top + l.clientHeight;
    const rows = Array.from(l.querySelectorAll('.hw-hunt')).map((e) => e.getBoundingClientRect()).filter((r) => r.bottom > top + 0.5 && r.top < foot - 0.5);
    const w = document.querySelector('[data-hs-win="hunts"]').getBoundingClientRect();
    return { whole: rows.filter((r) => r.top >= top - 0.5 && r.bottom <= foot + 4).length, cut: rows.length ? Math.round(top - rows[0].top) : null, at: l.scrollTop, h: l.clientHeight,
      lines: rows.map((r) => Math.round(r.height)), sheet: [Math.round(w.top), Math.round(w.bottom)], list: [Math.round(top), Math.round(foot)] }; });
  const rest = await read();
  if (rest.whole < WHOLE_LINES[tag] || rest.cut > 0.5) fails.push('PH-34 [' + tag + '] at rest the list shows ' + rest.whole + ' whole line(s) in ' + rest.h + ' px (want ' + WHOLE_LINES[tag] + '), its first cut by ' + rest.cut + ' px: ' + JSON.stringify(rest));
  /* a scroll that stops part-way (a swipe's flick, the window revealing a pick), then a wheel over the list */
  await page.evaluate(() => { const l = document.querySelector('[data-hs-win="hunts"] .hw-hunt-list'); l.scrollTop = Math.round(l.querySelector('.hw-hunt').offsetHeight * 0.6); });
  await page.waitForTimeout(500);
  const flick = await read();
  if (flick.cut !== 0) fails.push('PH-34 [' + tag + '] a scroll that stopped part-way rests with the top line cut by ' + flick.cut + ' px (scrolled ' + flick.at + ')');
  const box = await page.evaluate(() => { const r = document.querySelector('[data-hs-win="hunts"] .hw-hunt-list').getBoundingClientRect(); return [r.left + r.width / 2, r.top + 30]; });
  await page.mouse.move(box[0], box[1]);
  await page.mouse.wheel(0, 37);
  await page.waitForTimeout(700);
  const wheel = await read();
  if (wheel.cut !== 0 || wheel.at === flick.at) fails.push('PH-34 [' + tag + '] a wheel over the list rests with the top line cut by ' + wheel.cut + ' px (scrolled ' + flick.at + ' -> ' + wheel.at + ')');
}
/* ── PH-32 ── A KEYED HALL'S DOOR ON A PHONE. The data opens no hall yet (every hall's pack is staged), so the page is served a
   boss-halls.js whose hallFromGround hands every ground Krell's hall (open() o.route); the hero holds its key and eats Salted Shrimp. */
async function hallDoor(page, tag, fails) {
  await page.click('.hs-launch[data-hs-open="hunts"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('.hw-hunt b'), null, 4000))) { fails.push('PH-32 [' + tag + '] CONTROL: no list in Hunts'); return; }
  await page.click('.hw-hunt', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => { const h = document.querySelector('.hw-hd-hall'), f = h && h.querySelector('.hw-hall-food'), b = h && h.querySelector('.hw-call-press');
    return !!h && !h.hidden && !!f && !f.hidden && !!b && !b.disabled; }, null, 4000))) { fails.push('PH-32 [' + tag + '] CONTROL: no hall door with its red food line and an open press'); return; }
  const at = async (where) => {
    await page.evaluate((w) => { const s = document.querySelector('.hw-hd-page');
      s.scrollTop = w === 'end' ? s.scrollHeight : s.scrollTop + document.querySelector('.hw-hd-hall .hw-hd-h').getBoundingClientRect().top - s.getBoundingClientRect().top; }, where);
    await page.waitForTimeout(150);
    return page.evaluate(() => { const s = window.__r('.hw-hd-page'), foot = window.__r('.hw-hd-foot'), press = document.querySelector('.hw-hd-hall .hw-call-press');
      const inside = (r) => !!r && r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5 && !window.__cross(r, foot);
      return { food: inside(window.__r('.hw-hd-hall .hw-hall-food')), press: inside(window.__r(press)) && window.__hits(press) }; });
  };
  const head = await at('head');
  if (!head.food) fails.push('PH-32 [' + tag + '] with the hall\'s head at the page\'s top, its red food line is under the fold or under Enter');
  if (!head.press) fails.push('PH-32 [' + tag + '] with the hall\'s head at the page\'s top, its press is cut off or under Enter');
  const end = await at('end');
  if (!end.press) fails.push('PH-32 [' + tag + '] at the page\'s end the hall\'s press is cut off or under Enter');
}
/* Mid-hunt Enter is off, and the way back is not. */
async function groundBackHunting(page, tag, fails) {
  await page.click('.hs-launch[data-hs-open="hunts"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('.hw-hunt b'), null, 4000))) { fails.push('PH-25 [' + tag + '] CONTROL: no list mid-hunt'); return; }
  await page.click('.hw-hunt', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(250);
  const off = await page.evaluate(() => ({ enter: document.querySelector('.hw-hunt-enter').disabled, back: (() => { const b = document.querySelector('[data-hs-win="hunts"] .hs-win-head .hs-back'); return !b || b.hidden || b.disabled; })() }));
  if (!off.enter) fails.push('PH-25 [' + tag + '] CONTROL: Enter is on mid-hunt');
  if (off.back) fails.push('PH-25 [' + tag + '] mid-hunt the way back to the list is off');
}
const TABS_NOW = () => { const an = document.querySelector('.ha-analyzer'), strip = an.querySelector('.ha-tabs'), s = strip.getBoundingClientRect(), fold = window.__r('.ha-analyzer .hs-wfold'), x = window.__r('.ha-close');
  const tabs = Array.from(an.querySelectorAll('.ha-tab')).filter((t) => t.getClientRects().length).map((t) => ({ t: t.textContent, r: window.__r(t), hits: window.__hits(t) }));
  return { an: window.__r(an), pan: strip.scrollWidth - strip.clientWidth, list: Math.round(window.__r('.ha-scroll').height), scope: !!window.__r('.ha-analyzer .ha-scope'), alone: an.classList.contains('is-alone'), n: tabs.length,
    bad: tabs.filter((q) => q.r.left < s.left - 0.5 || q.r.right > s.right + 0.5 || window.__cross(q.r, fold) || window.__cross(q.r, x) || !q.hits).map((q) => q.t), close: window.__hits(document.querySelector('.ha-close')), fold: window.__hits(an.querySelector('.hs-wfold')) }; };
async function detailsTabs(page, tag, fails, floor, alone) {
  await page.click('.ht-bar [data-hs-act="details"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('.ha-analyzer .ha-tab'), null, 4000))) { fails.push('PH-26 [' + tag + '] CONTROL: Details opened nothing'); return; }
  await page.waitForTimeout(250);
  const f = await page.evaluate(TABS_NOW);
  if (f.n !== 4) fails.push('PH-26 [' + tag + '] CONTROL: ' + f.n + ' tabs');
  if (f.bad.length) fails.push('PH-26 [' + tag + '] tabs cut or under the buttons: ' + f.bad.join(', '));
  if (f.pan > 0) fails.push('PH-26 [' + tag + '] the tabs need a sideways pan of ' + f.pan + ' px');
  if (!f.close || !f.fold) fails.push('PH-26 [' + tag + '] the panel\'s close ' + f.close + ', its fold ' + f.fold);
  if (alone && f.scope) fails.push('PH-26 [' + tag + '] a hero alone keeps the This hero / Party switch');
  if (!alone && !f.scope) fails.push('PH-26 [' + tag + '] a party lost the This hero / Party switch');
  if (f.list < floor) fails.push('PH-26 [' + tag + '] the numbers have ' + f.list + ' px, under ' + floor);
}
/* Each row's words in the card as a host draws it, by the row's own title. Long cards scroll: `under` is the length each room must hold. */
/* A wrapped title never leaves one word alone on its last line (1440x900, 2026-11-14: "Your hero fights on its / own"). The open card's
   title is the one launcher.js drew (keepLastWords: its last two words held by a no-break space); then every title of three words or more,
   through the page's own keepLastWords, is drawn in the card a word to a span, and its last line must hold at least two words. */
async function titlesBalance(page, sel, tag, fails) {
  const titles = HUNT_TUTORIAL.map((c) => [c.id, c.title]).filter(([, t]) => typeof t === 'string' && t.trim().split(/ +/).length >= 3);
  const out = await page.evaluate(async ([q, list]) => {
    const p = document.querySelector(q); if (!p) return null;
    /* the module as the page imports it: the same ?v= as its own scripts, so it is the same (served) file launcher.js runs */
    const v = (Array.from(document.scripts).map((s) => s.src).find((u) => /\?v=/.test(u)) || '').split('?v=')[1];
    if (!v) return { control: 'no ?v= on the page\'s scripts' };
    const { keepLastWords } = await import(new URL('src/render/format.js?v=' + v, location.href).href);
    if (typeof keepLastWords !== 'function') return { control: 'src/render/format.js has no keepLastWords' };
    const b = p.querySelector('b'), keep = b.innerHTML, bad = [], own = b.textContent;
    if (own.trim().split(/ +/).length >= 3 && !/ \S+\s*$/.test(own)) bad.push('the open card\'s title "' + own + '" does not hold its last two words together');
    let wrapped = 0;
    /* At the card's own width, and at 150 px: the guards' fallback face is narrower than Cinzel and wraps no title at 260 px. */
    for (const w of ['', '150px']) {
      b.style.maxWidth = w;
      for (const [id, t] of list) {
        b.textContent = '';
        const spans = keepLastWords(t).trim().split(/ +/).map((x, i) => { if (i) b.append(' '); const s = document.createElement('span'); s.textContent = x; b.append(s); return s; });
        const top = (s) => s.getBoundingClientRect().top, n = spans.length;
        if (top(spans[n - 1]) > top(spans[0]) + 1) wrapped++;
        const last = spans.filter((s) => Math.abs(top(s) - top(spans[n - 1])) <= 1).reduce((k, s) => k + s.textContent.split(/\s+/).length, 0);
        if (last < 2) bad.push(id + ' "' + t + '"' + (w ? ' at ' + w : ''));
      }
    }
    b.style.maxWidth = ''; b.innerHTML = keep;
    return { bad, wrapped, n: list.length };
  }, [sel, titles]);
  if (out === null) { fails.push('PH-27 [' + tag + '] CONTROL: no open card'); return; }
  if (out.control) { fails.push('PH-27 [' + tag + '] CONTROL: ' + out.control); return; }
  if (out.n < 20 || out.wrapped < 3) { fails.push('PH-27 [' + tag + '] CONTROL: ' + out.n + ' titles, ' + out.wrapped + ' wrap, so the rule proves nothing'); return; }
  if (out.bad.length) fails.push('PH-27 [' + tag + '] a title ends on one word: ' + out.bad.join('; '));
}
/* `hunting`: the card under the hunt bar. It shows only the cards a hunt can show (none gated on being in town: those are held to the
   town's card above), and its presses stand on a row under the words, so every title is one line across the card (phone 2026-11-14: on
   the title's row they left it 75 px, and "Your hero fights on its own" stood four lines at 667x375).
   EACH CARD'S WORDS THREE TIMES OVER, as PH-6 serves the harvest row. Since the label sweep (set v0.2.135, src/data/text/coach.js: one line of
   at most ten words) the longest card is 57 characters, at most two lines, while the rooms hold 171 (under the hunt bar) to 283 (the town's card at
   844x390), the same on v0.2.134 and v0.2.135: every card fit however the card was drawn, and release run 44118906758 let the narrow cards, the
   presses' column, the 1.3 leading and the missing font-size-adjust through. Run together three times (57 characters is 173), the words come
   back to the length each room holds, the guard for a longer line (a translation, a longer name): the layout reads the words the page draws. */
async function wordsFit(page, sel, field, under, tag, where, fails, hunting = false) {
  const inTown = (c) => (c.when || []).some((w) => w && w.kind === 'in_town');
  const thrice = (s) => Array(3).fill(s).join(' ');
  const rows = HUNT_TUTORIAL.filter((c) => typeof c.text === 'string' && !(hunting && inTown(c))).map((c) => ({ id: c.id, title: c.title, words: thrice((field === 'in' && (c.textIn || c.inWindow)) || c.text), lines: hunting }));
  if (hunting && rows.length < 20) { fails.push('PH-27 [' + tag + ' ' + where + '] CONTROL: only ' + rows.length + ' cards a hunt can show'); return; }
  const out = await page.evaluate(([q, list, cap]) => {
    const p = document.querySelector(q); if (!p) return null;
    const t = p.querySelector('.hs-coach-text'), b = p.querySelector('b'), keep = [b.textContent, t.textContent], bad = [];
    for (const c of list) {
      b.textContent = c.title; t.textContent = c.words;
      if (c.words.length < cap && t.scrollHeight > t.clientHeight + 1) bad.push(c.id + ' (' + c.words.length + ' characters, ' + t.clientHeight + ' of ' + t.scrollHeight + ' px)');
      const n = b.getBoundingClientRect().height / parseFloat(getComputedStyle(b).lineHeight);
      if (c.lines && n > 1.5) bad.push(c.id + ' title "' + c.title + '" takes ' + Math.round(n) + ' lines');
    }
    b.textContent = keep[0]; t.textContent = keep[1];
    return bad;
  }, [sel, rows, under]);
  if (out === null) fails.push('PH-27 [' + tag + ' ' + where + '] CONTROL: no open card');
  else if (out.length) fails.push('PH-27 [' + tag + ' ' + where + '] cut: ' + out.join('; '));
}
const PARTY_NOW = () => { const w = document.querySelector('.hs-widget.is-party'), f = w.querySelector('.hs-wfold'), m = w.querySelector('.hp-m');
  return { folded: w.classList.contains('is-folded'), box: window.__r(w), panel: window.__r('.hp-party'), member: !!m && m.getClientRects().length > 0, fold: !!f && f.getClientRects().length > 0 && window.__hits(f), said: f ? f.getAttribute('aria-expanded') : null }; };
async function partyFolds(o, base, tag, fails) {
  const { page, s } = o;
  const f = await page.evaluate(PARTY_NOW);
  if (!f.folded || f.member) fails.push('PH-29 [' + tag + '] a hero alone starts with the Party panel open: ' + JSON.stringify(f));
  if (!f.fold) fails.push('PH-29 [' + tag + '] the folded panel\'s plus cannot be pressed');
  if (f.box.width > 140 || f.box.height > 64) fails.push('PH-29 [' + tag + '] the folded panel\'s box is ' + Math.round(f.box.width) + ' x ' + Math.round(f.box.height) + ' px');
  await page.click('.hs-widget.is-party .hs-wfold', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(250);
  const open = await page.evaluate(PARTY_NOW);
  if (open.folded || !open.member || open.said !== 'true') fails.push('PH-29 [' + tag + '] a press on the plus did not open the panel: ' + JSON.stringify(open));
  /* The player's press is theirs: a reload keeps it open. */
  for (let i = 0; i < 40 && !(s.residue.hudLayout && s.residue.hudLayout.phone); i++) await page.waitForTimeout(50);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_MS });
  await play(page, null, false, 1);
  await page.evaluate(RECT);
  await page.waitForTimeout(300);
  const back = await page.evaluate(PARTY_NOW);
  if (back.folded || !back.member) fails.push('PH-29 [' + tag + '] the panel the player opened folded again after a reload');
  await page.click('.hs-widget.is-party .hs-wfold', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(250);
  if (!(await page.evaluate(PARTY_NOW)).folded) fails.push('PH-29 [' + tag + '] a press on the dash did not fold the panel');
}
async function barPresses(page, tag, fails) {
  const f = await page.evaluate(() => { const n = document.querySelector('.hb-set .hs-name'), t = n.querySelector('.hs-name-t'), r = window.__r(n), g = window.__r('.hb-page');
    return { page: g && g.width, h: r.height, w: r.width, cross: window.__cross(r, window.__r('.hb-prep')), hits: window.__hits(n), cut: t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1, words: t.textContent }; });
  if (f.page ? f.page < 36 : tag !== '922x423') fails.push('PH-30 [' + tag + '] More slots is ' + f.page + ' px wide'); // at 922 px all ten columns fit: no press
  if (f.h < 36 || f.w < 44) fails.push('PH-30 [' + tag + '] the setup\'s name is a ' + Math.round(f.w) + ' x ' + Math.round(f.h) + ' px press');
  if (f.cross) fails.push('PH-30 [' + tag + '] the setup\'s name runs under the saved setups\' press');
  if (!f.hits) fails.push('PH-30 [' + tag + '] the setup\'s name is covered');
  if (f.cut) fails.push('PH-30 [' + tag + '] the setup\'s name "' + f.words + '" is cut');
}
/* ── PH-23 ── The Weighhouse and the sorts: whole inside the sheet; the sell sheet's two fields and List together. */
async function weighhouse(page, tag, fails) {
  await pressBar(page, 'market').catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="market"] .hw-mk-refresh'), null, 4000))) { fails.push('PH-23 [' + tag + '] the Weighhouse did not open'); return; }
  await page.waitForTimeout(300);
  const re = await insideSheet(page, 'market', '.hw-mk-refresh');
  if (!re.length || !re[0].in || !re[0].on) fails.push('PH-23 [' + tag + '] Refresh is cut: ' + JSON.stringify(re));
  /* ...and in the purse's row, on no tab (v0.2.131 gate, 922x423: the tabs lead now, and a Refresh pinned to the top lay on Browse). */
  const lie = await page.evaluate(() => { const b = window.__r('[data-hs-win="market"] .hw-mk-refresh');
    return { on: Array.from(document.querySelectorAll('[data-hs-win="market"] .hw-tab')).filter((t) => window.__cross(b, window.__r(t))).map((t) => t.textContent),
      row: window.__cross(b, window.__r('[data-hs-win="market"] .hw-mk-greet')), hits: window.__hits(document.querySelector('[data-hs-win="market"] .hw-mk-refresh')) }; });
  if (lie.on.length || !lie.row || !lie.hits) fails.push('PH-23 [' + tag + '] Refresh lies on a tab or out of the purse\'s row: ' + JSON.stringify(lie));
  await page.click('[data-hs-win="market"] .hw-tab[data-tab="sell"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('.hw-mk-sell .hw-mk-row'), null, 4000))) { fails.push('PH-23 [' + tag + '] CONTROL: nothing to sell'); return; }
  await page.click('.hw-mk-sell .hw-mk-row', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('.hw-mk-sheet.is-on'), null, 4000))) { fails.push('PH-23 [' + tag + '] CONTROL: the stack\'s sheet did not open'); return; }
  await page.waitForTimeout(250);
  const see = await page.evaluate(() => ['#hw-mk-qty', '#hw-mk-ask', '[data-hs-act="ms-list"]'].map((q) => { const e = document.querySelector(q), r = window.__r(e); return [q, !!r && window.__onScreen(r) && window.__hits(e) && r.height >= 40]; }));
  for (const [q, ok] of see) if (!ok) fails.push('PH-23 [' + tag + '] ' + q + ' is not on the sell sheet with the others');
  /* The sheet's layout, not only its fit (the one window header left room for both mutants to fit anyway): a picked
     stack hides the purse and the tabs, and its two fields stand above what it would fetch. */
  const lay = await page.evaluate(() => {
    const shown = (q) => Array.from(document.querySelectorAll('[data-hs-win="market"] .hw-mk > ' + q)).filter((e) => e.getClientRects().length > 0).length;
    const qty = document.querySelector('#hw-mk-qty'), facts = document.querySelector('.hw-mk-sell.is-paged .hw-mk-facts');
    return { purse: shown('.hw-mk-greet'), tabs: shown('.hw-tabs'), factsFirst: !!qty && !!facts && facts.getBoundingClientRect().top < qty.getBoundingClientRect().top };
  });
  if (lay.purse || lay.tabs) fails.push('PH-23 [' + tag + '] the sell sheet keeps the purse or the tabs: ' + JSON.stringify(lay));
  if (lay.factsFirst) fails.push('PH-23 [' + tag + '] what it would fetch stands above How many');
}
async function sorts(page, tag, fails) {
  for (const win of ['inventory', 'storage']) {
    await pressBar(page, win).catch(() => null);
    if (!(await wait(page, (w) => document.querySelector('[data-hs-win="' + w + '"] [data-hs-built]'), win, 4000))) { fails.push('PH-23 [' + tag + '] ' + win + ' did not open'); continue; }
    await page.waitForTimeout(250);
    const out = (await insideSheet(page, win, '.hw-sort select')).filter((b) => !b.in);
    if (out.length) fails.push('PH-23 [' + tag + '] ' + win + '\'s Sort is cut at the sheet\'s edge');
    await page.click('[data-hs-win="' + win + '"] .hs-close', { timeout: 2500 }).catch(() => null);
    await page.waitForTimeout(250);
  }
}
/* ── PH-24 ── A party on a phone: an invite from the Party window, an invite that reaches a player reading a sheet, words a
   thumb can follow, presses a thumb can hit, a count that says what it wants. */
async function partyInvite(o, tag, fails) {
  const { page, s } = o;
  await pressBar(page, 'hunt-party').catch(() => null);
  await wait(page, () => document.querySelector('.hw-party'), null, 4000);
  await page.click('[data-hs-win="hunt-party"] .hw-tab[data-tab="invites"]', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(200);
  if (!(await page.fill('.hw-invite-in', 'Marlow', { timeout: 2500 }).then(() => true, () => false))) { fails.push('PH-24 [' + tag + '] the Party window has no way to invite'); return; }
  await page.click('[data-hs-act="invite-name"]', { timeout: 2500 }).catch(() => null);
  for (let i = 0; i < 40 && !s.calls.some((c) => c.name === 'hr_hunt_party_invite'); i++) await page.waitForTimeout(50);
  const sent = s.calls.filter((c) => c.name === 'hr_hunt_party_invite');
  if (sent.length !== 1 || sent[0].body.p_name !== 'Marlow') fails.push('PH-24 [' + tag + '] the invite sent ' + JSON.stringify(sent.map((c) => c.body)));
  if (!(await wait(page, () => /Invite sent to Marlow/.test(document.querySelector('.hw-party > .hh-intent-msg').textContent), null, 4000))) fails.push('PH-24 [' + tag + '] the inviter is told nothing');
}
/* The menu's Invite answers at once on a slow signal, before the server does. */
async function menuSending(o, tag, fails) {
  const { page, s } = o;
  s.holdOwnInvite = true;
  const opened = await wait(page, () => document.querySelector('.char-tab:not(.is-shown)'), null, 6000);
  if (!opened) { fails.push('PH-24 [' + tag + '] CONTROL: no second hero\'s tab'); return; }
  await page.evaluate(() => { const t = document.querySelector('.char-tab:not(.is-shown)'), r = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.top + 4 })); });
  if (!(await wait(page, () => document.querySelector('.hw-menu [data-hs-act="party-invite"]'), null, 3000))) { fails.push('PH-24 [' + tag + '] CONTROL: no Invite in the tab\'s menu'); return; }
  await page.click('.hw-menu [data-hs-act="party-invite"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => /Sending/.test((document.querySelector('.hw-menu-say') || {}).textContent || ''), null, 1500))) fails.push('PH-24 [' + tag + '] the menu\'s Invite says nothing until the server answers');
}
/* The town's card beside the sheet is What next served long (longCoach, LONG_WORDS: PH-6's card), so its ROOM sets where it ends. Since the
   label sweep (set v0.2.135) the cards are one line, and the hero's next card (Sell junk) ended 86 px down, nowhere near the invite under
   any room: release run 44118906758 let a room that runs past the invite through. */
async function inviteToast(page, tag, fails) {
  await wait(page, () => document.querySelector('.hw-alert'), null, 6000);
  await pressBar(page, 'chat').catch(() => null);
  await wait(page, () => document.querySelector('[data-hs-win="chat"] .hc-field'), null, 4000);
  await page.waitForTimeout(300);
  const a = await page.evaluate(() => { const e = document.querySelector('.hw-alert'), r = window.__r(e), sheet = window.__r('[data-hs-win="chat"]'), join = e.querySelector('.hw-alert-do');
    const p = document.querySelector('.hs-launchers > .hs-pointer:not(.is-min)'), t = p && p.querySelector('.hs-coach-text');
    return { seen: getComputedStyle(e).visibility === 'visible' && window.__onScreen(r), clear: r.right <= sheet.left + 0.5, join: window.__hits(join), box: r, card: p && window.__r(p), scrolls: !!t && t.scrollHeight > t.clientHeight + 1 }; });
  if (!a.seen || !a.clear || !a.join) fails.push('PH-24 [' + tag + '] with a sheet open the invite does not show beside it: ' + JSON.stringify(a));
  if (!a.card || !a.scrolls) { fails.push('PH-24 [' + tag + '] CONTROL: no town card long enough that its room decides where it ends: ' + JSON.stringify(a.card)); return; }
  if (window_cross(a.card, a.box)) fails.push('PH-24 [' + tag + '] the town\'s card lies on the invite beside the sheet: ' + JSON.stringify([a.card, a.box]));
}
async function sheetWords(page, tag, fails) {
  await page.click('.char-tool.is-all', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="characters"] .hw-char'), null, 4000))) { fails.push('PH-24 [' + tag + '] All characters did not open'); return; }
  await page.waitForTimeout(250);
  /* "Also here" (the windows a phone's row had no icon for) left with the bar's groups (2026-11-16): every window is two presses from the
     row on a phone too (tests/top-bar.mjs TB-3 at 922x423 and 667x375), so nothing waits ~700 px down this sheet. */
  const c = await page.evaluate(() => { const w = document.querySelector('.hw-char-waits'), r = window.__r(w);
    return { wait: w ? w.textContent : '', seen: !!r }; });
  if (!c.seen || !/invite/i.test(c.wait)) fails.push('PH-24 [' + tag + '] the red count does not say what it wants: ' + JSON.stringify(c));
}
/* PH-24 Expand in reach: at 922x423 the Storage sheet's Expand sits inside the sheet's visible body on opening, no scroll. */
async function bagReach(page, tag, fails) {
  await pressBar(page, 'storage').catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="storage"] [data-hs-act="expand"]'), null, 4000))) { fails.push('PH-24 [' + tag + '] Storage did not open'); return; }
  await page.waitForTimeout(1500);
  const f = await page.evaluate(() => { const b = window.__r('[data-hs-win="storage"] .hs-win-body'), e = window.__r('[data-hs-win="storage"] [data-hs-act="expand"]');
    return { b, e, text: document.querySelector('[data-hs-win="storage"] [data-hs-act="expand"]').textContent }; });
  if (!f.e || !f.b || f.e.top < f.b.top || f.e.bottom > f.b.bottom || !window_onScreen(f.e, page.viewportSize())) fails.push('PH-24 [' + tag + '] Expand is below the Storage sheet\'s fold: ' + JSON.stringify(f));
  if (!/^Expand \(\+20\)/.test(f.text)) fails.push('PH-24 [' + tag + '] CONTROL: Expand does not read the server\'s offer: ' + f.text);
}
async function mouseWordsAndTargets(page, tag, fails) {
  for (const win of ['storage', 'friends', 'shop', 'tally', 'hunts', 'hunt-party', 'inventory']) {
    await pressBar(page, win).catch(() => null);
    if (!(await wait(page, (w) => document.querySelector('[data-hs-win="' + w + '"] [data-hs-built]'), win, 4000))) { fails.push('PH-24 [' + tag + '] ' + win + ' did not open'); continue; }
    await page.waitForTimeout(250);
    const f = await page.evaluate((w) => { const root = document.querySelector('[data-hs-win="' + w + '"]');
      /* The paper doll's slots are a figure of 36 px wells, side by side with the bag's grid: its look, not a stray control. */
      const small = Array.from(root.querySelectorAll('button:not(.hw-slot), select, input:not([type="checkbox"]):not([type="range"])')).filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().height < 39.5)
        .map((e) => (e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().height));
      return { mouse: /right-click|shift-press/i.test(root.innerText), small: small.slice(0, 4), reading: /Reading your storage/.test(root.innerText) }; }, win);
    if (f.reading) fails.push('PH-24 [' + tag + '] CONTROL: the Storage note never got past reading');
    if (f.mouse) fails.push('PH-24 [' + tag + '] ' + win + ' tells a thumb to use a mouse');
    if (f.small.length) fails.push('PH-24 [' + tag + '] ' + win + ' has presses under 40 px: ' + f.small.join(', '));
    await page.click('[data-hs-win="' + win + '"] .hs-close', { timeout: 2500 }).catch(() => null);
    await page.waitForTimeout(200);
  }
}

/* ── PH-11 to PH-17 ── A PHONE PLAYER'S THREE DAYS (art/review/player-feedback-2026-10-31/phone.txt, lane/f-phone). */
/* ── PH-11 ── The strip: nothing under the icon row, nothing squashed; All characters holds every way a phone lost. */
const twoHeroes = (env) => { env.hero_slots = [0, 1]; env.account = Object.assign({}, env.account, { max_concurrent: 4 }); env.party = null; env.party_invites = []; };
async function stripReach(page, tag, fails) {
  const f = await page.evaluate(() => {
    const all = document.querySelector('.char-tool.is-all'), box = document.querySelector('.char-tabs');
    const shown = (e) => e.getClientRects().length > 0;
    return { all: window.__r(all), hit: window.__hits(all), row: window.__r('.hs-launchers'), word: all.scrollWidth <= all.clientWidth + 1,
      strip: window.__r('.char-strip'), stage: window.__r('.world-stage'),
      icons: Array.from(document.querySelectorAll('.hs-launch')).map((e) => window.__r(e)),
      tabsBox: shown(box) ? window.__r(box) : null, tabs: shown(box) ? Array.from(box.querySelectorAll('.char-tab')).map((e) => window.__r(e)) : [],
      tools: Array.from(document.querySelectorAll('.char-tool:not(.is-all)')).filter(shown).length,
      now: (() => { const n = document.querySelector('.char-tool-now'); return n && shown(n) ? n.textContent : null; })(),
      viewed: (document.querySelector('.char-tab.is-shown .char-tab-name') || {}).textContent };
  });
  /* The hero on screen is named whichever way the strip fits: a tab, or the press to every hero (667 px: no tab, no name anywhere, QA 2026-11-04). */
  if (!f.tabsBox && (!f.now || f.now !== f.viewed)) fails.push('PH-11 [' + tag + '] no tabs and the hero on screen is not named: ' + JSON.stringify([f.now, f.viewed]));
  if (f.tabsBox && f.now) fails.push('PH-11 [' + tag + '] the tabs and Heroes both name the hero');
  if (!f.all || !window_onScreen(f.all, page.viewportSize()) || !f.hit || f.all.height < 40) fails.push('PH-11 [' + tag + '] All characters is not a thumb\'s press on screen: ' + JSON.stringify(f.all) + ' hit ' + f.hit);
  else if (window_cross(f.all, f.row)) fails.push('PH-11 [' + tag + '] the icon row lies over All characters: ' + JSON.stringify([f.all, f.row]));
  if (!f.word) fails.push('PH-11 [' + tag + '] All characters\' word is cut');
  if (f.tools) fails.push('PH-11 [' + tag + '] ' + f.tools + ' more word(s) still stand in the strip');
  /* the row's buttons: Hunts, Bag, Character, Skills, the Book and the groups' icons (tests/top-bar.mjs holds how many) */
  if (f.icons.length < 5 || f.icons.some((r) => r.width < 39.5 || !window_onScreen(r, page.viewportSize()))) fails.push('PH-11 [' + tag + '] an icon is under 40 px wide or off screen: ' + JSON.stringify(f.icons[0]));
  if (f.tabsBox && (f.tabsBox.width < 44 || window_cross(f.tabsBox, f.row))) fails.push('PH-11 [' + tag + '] the tabs get ' + Math.round(f.tabsBox.width) + ' px, or run under the icons');
  if (f.tabs.some((r) => r.width < 44 || r.height < 40)) fails.push('PH-11 [' + tag + '] a hero tab is squashed: ' + JSON.stringify(f.tabs));
  if (f.strip.height > 40) fails.push('PH-11 [' + tag + '] the strip costs the World ' + f.strip.height + ' px');
  /* every window the row reaches, its groups' menus read too (tests/_bar.mjs), before the sheet covers the row */
  const reach = (await barWindows(page).catch(() => [])).sort().join();
  await page.click('.char-tool.is-all', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="characters"] .hw-char'), null, 4000))) { fails.push('PH-11 [' + tag + '] All characters did not open'); return; }
  await page.waitForTimeout(250);
  const names = await page.evaluate(() => { const rows = Array.from(document.querySelectorAll('[data-hs-win="characters"] .hw-icon-names .hw-icon-name'));
    return { ids: rows.map((r) => r.getAttribute('data-hs-open')).sort().join(), small: rows.filter((r) => r.getBoundingClientRect().height < 44).length, empty: rows.filter((r) => !r.textContent.trim()).length }; });
  if (!reach || names.ids !== reach || names.small || names.empty) fails.push('PH-11 [' + tag + '] the sheet does not name every window the row reaches at a thumb\'s size: ' + JSON.stringify(Object.assign({ reach }, names)));
  for (const q of ['[data-hs-win="characters"] [data-app="characters"]', '[data-hs-win="characters"] [data-app="sign-out"]']) {
    const ok = await page.evaluate((s) => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return 'none'; e.scrollIntoView({ block: 'center' }); const r = window.__r(e); return window.__onScreen(r) && window.__hits(e) && r.height >= 44 ? 'ok' : JSON.stringify(r); }, q);
    if (ok !== 'ok') fails.push('PH-11 [' + tag + '] ' + q + ' is out of reach in the sheet: ' + ok);
  }
  /* A grouped window's name opens it from here too. */
  await page.evaluate(() => document.querySelector('[data-hs-win="characters"] .hw-icon-name[data-hs-open="honor"]').click());
  if (!(await wait(page, () => document.querySelector('[data-hs-win="honor"]'), null, 3000))) fails.push('PH-11 [' + tag + '] Leaderboards cannot be opened on a phone');
  await page.click('.char-tool.is-all', { timeout: 2500 }).catch(() => null);
  await wait(page, () => document.querySelector('[data-hs-win="characters"] .hw-char'), null, 4000);
  /* A named icon opens its window. */
  await page.evaluate(() => document.querySelector('[data-hs-win="characters"] .hw-icon-name[data-hs-open="inventory"]').click());
  if (!(await wait(page, () => document.querySelector('[data-hs-win="inventory"]'), null, 3000))) fails.push('PH-11 [' + tag + '] a named icon opens nothing');
}
/* ...and a hero's Invite: a visible press, ONE ask for that slot, its answer in words; a phone reads no "right-click". */
async function inviteByPress(o, tag, fails) {
  const { page, s } = o;
  await page.click('.char-tool.is-all', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelectorAll('[data-hs-win="characters"] .hw-char').length === 2, null, 6000))) { fails.push('PH-12 [' + tag + '] CONTROL: not two heroes in the sheet'); return; }
  await page.waitForTimeout(250);
  const line = await page.evaluate(() => document.querySelector('.hw-parties-line').textContent);
  if (/right-click|\(Y\)/i.test(line)) fails.push('PH-12 [' + tag + '] the sheet tells a phone: ' + line);
  const inv = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.hw-char-invite')).filter((e) => e.getClientRects().length); if (b.length !== 1) return 'shown on ' + b.length + ' rows'; b[0].scrollIntoView({ block: 'nearest' }); const r = window.__r(b[0]); return window.__onScreen(r) && window.__hits(b[0]) && r.height >= 40 ? 'ok' : JSON.stringify(r); });
  if (inv !== 'ok') { fails.push('PH-12 [' + tag + '] no Invite a thumb can press on the other hero: ' + inv); return; }
  await page.click('.hw-char-invite:not([hidden])', { timeout: 2500 }).catch(() => null);
  for (let i = 0; i < 40 && !s.calls.some((c) => c.name === 'hr_hunt_party_invite_own'); i++) await page.waitForTimeout(50);
  const sent = s.calls.filter((c) => c.name === 'hr_hunt_party_invite_own');
  if (sent.length !== 1 || sent[0].body.p_other_slot !== 1) fails.push('PH-12 [' + tag + '] Invite sent ' + JSON.stringify(sent.map((c) => c.body)));
  if (!(await wait(page, () => { const m = document.querySelector('.hw-parties-msg'); return m && m.textContent && !/Sending/.test(m.textContent); }, null, 4000))) fails.push('PH-12 [' + tag + '] Invite\'s answer says nothing');
}

/* ── PH-13 ── The slots' page press, and the chat's input on the sheet. */
async function slotPage(page, tag, fails) {
  const on = await page.evaluate(() => { const b = document.querySelector('.hb-page'); return !!b && b.getClientRects().length > 0 && window.__hits(b); });
  if (!on) { fails.push('PH-13 [' + tag + '] slots 10 and 20 are cut and nothing on screen says so'); return; }
  const at = (n) => page.evaluate((i) => { const s = document.querySelector('.hb-slot[data-slot="' + i + '"]'), g = window.__r('.hb-grid'), r = window.__r(s); return window.__onScreen(r) && window.__hits(s) && r.left >= g.left - 0.5 && r.right <= g.right + 0.5; }, n);
  await page.click('.hb-page', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(200);
  if (!(await at(9)) || !(await at(19))) fails.push('PH-13 [' + tag + '] the press does not bring slots 10 and 20 on screen');
  await page.click('.hb-page', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(200);
  if (!(await at(0)) || !(await at(10))) fails.push('PH-13 [' + tag + '] a second press does not bring slots 1 and 11 back');
}
async function chatFoot(page, tag, fails) {
  await pressBar(page, 'chat').catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="chat"] .hc-field'), null, 4000))) { fails.push('PH-13 [' + tag + '] the chat did not open'); return; }
  await page.waitForTimeout(250);
  const c = await page.evaluate(() => Object.fromEntries(['.hc-field', '.hc-send'].map((q) => { const e = document.querySelector(q), r = window.__r(e); return [q, !!r && window.__onScreen(r) && window.__hits(e) && r.height >= 40]; })));
  for (const [q, ok] of Object.entries(c)) if (!ok) fails.push('PH-13 [' + tag + '] the chat\'s ' + q + ' is off the sheet or under 40 px');
  /* The icon stays hovered and focused after its press (Chat's: its group's, tests/_bar.mjs): its tooltip must not be there to lie over the sheet's title. */
  const tip = await page.evaluate((q) => getComputedStyle(document.querySelector(q), '::before').display, rowIcon('chat'));
  if (tip !== 'none') fails.push('PH-13 [' + tag + '] the pressed icon\'s tooltip lies over the sheet\'s title');
}

/* ── PH-14 ── Meaning without hover, by touch. A touch context: isMobile, hasTouch. */
const holdIcon = (page, id, ms) => page.evaluate(async ([i, t]) => {
  const icon = document.querySelector('.hs-launch[data-hs-open="' + i + '"]');
  const b = icon.getBoundingClientRect(), at = { bubbles: true, pointerType: 'touch', clientX: b.left + 8, clientY: b.top + 8 };
  icon.dispatchEvent(new PointerEvent('pointerdown', at));
  await new Promise((ok) => setTimeout(ok, t));
  const n = document.querySelector('.hs-launch-name');
  const r = n && n.getBoundingClientRect();
  const out = { name: n ? n.textContent : null, on: !!r && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  icon.dispatchEvent(new PointerEvent('pointerup', at));
  icon.click();
  return out;
}, [id, ms]);
async function touchMeaning(page, tag, fails) {
  const held = await holdIcon(page, 'inventory', 550);
  if (held.name !== 'Inventory' || !held.on) fails.push('PH-14 [' + tag + '] a held icon names nothing: ' + JSON.stringify(held));
  await page.waitForTimeout(200);
  if (await page.$('[data-hs-win="inventory"]:not(.is-leaving)')) fails.push('PH-14 [' + tag + '] letting go of a held icon opened its window');
  const tipOff = await page.evaluate(() => getComputedStyle(document.querySelector('.hs-launch'), '::before').display);
  if (tipOff !== 'none') fails.push('PH-14 [' + tag + '] the hover tooltip still waits on the icon for a focus to stick it');
  /* A tap still opens at once, and no sheet shows a keyboard's chip. */
  await pressBar(page, 'shop', { tap: true }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="shop"] [data-hs-built]'), null, 4000))) { fails.push('PH-14 [' + tag + '] a tap on an icon opened nothing'); return; }
  await page.waitForTimeout(250);
  const chips = await page.evaluate(() => Array.from(document.querySelectorAll('.hs-win-head .hs-key')).filter((k) => k.getClientRects().length).map((k) => k.textContent));
  if (chips.length) fails.push('PH-14 [' + tag + '] a sheet shows the key chip ' + chips.join(' '));
  /* A press on a grey Buy says why, on screen, beside it. */
  const buy = await page.evaluate(() => { const b = document.querySelector('[data-hs-win="shop"] [data-hs-act="buy"]:disabled'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = window.__r(b); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (!buy) { fails.push('PH-14 [' + tag + '] CONTROL: no grey Buy with the purse emptied'); return; }
  await page.touchscreen.tap(buy.x, buy.y);
  await page.waitForTimeout(150);
  const said = await page.evaluate(() => { const e = document.querySelector('.hs-off-why'); return e && { text: e.textContent, on: window.__onScreen(window.__r(e)) }; });
  if (!said || !/^Need \d[\d,]* gp more$/.test(said.text) || !said.on) fails.push('PH-14 [' + tag + '] a press on the grey Buy says ' + JSON.stringify(said));
}
/* ...in a hunt: the slot's reason first on its sheet, Tamsin's Take says why, every grey Take on her words. */
async function touchHunt(page, s, tag, fails) {
  const slot = await page.evaluate(() => { const s = Array.from(document.querySelectorAll('.hb-slot')).find((x) => x.querySelector('.hb-why').children.length); return s ? s.getAttribute('data-slot') : null; });
  if (slot === null) { fails.push('PH-14 [' + tag + '] CONTROL: no slot with a reason on the fixture\'s bar'); return; }
  await page.tap('.hb-slot[data-slot="' + slot + '"]', { timeout: 2500 }).catch(() => null);
  if (!(await wait(page, () => document.querySelector('[data-hs-win="configure-action"] .ca-rank'), null, 4000))) { fails.push('PH-14 [' + tag + '] a tap on the slot opened nothing'); return; }
  await page.waitForTimeout(250);
  const why = await page.evaluate(() => { const e = document.querySelector('.ca-why'), r = window.__r(e); return { text: e.textContent, on: !!r && window.__onScreen(r) }; });
  if (!why.text || !why.on) fails.push('PH-14 [' + tag + '] the slot\'s sheet does not say why it will not fire: ' + JSON.stringify(why));
  await page.tap('.ca-close', { timeout: 2500 }).catch(() => null);
  await page.waitForTimeout(250);
  await pressBar(page, 'tally', { tap: true }).catch(() => null);
  /* After her board's answer: the line once stood only until the board had loaded. */
  for (let i = 0; i < 60 && !s.calls.some((c) => c.name === 'hr_tally_view'); i++) await page.waitForTimeout(50);
  await page.waitForTimeout(400);
  const line = await page.evaluate(() => { const l = document.querySelector('[data-hs-win="tally"] .ht-board-why'); return !!l && l.getClientRects().length > 0 && /^Take more in town/.test(l.textContent); });
  if (!line) fails.push('PH-14 [' + tag + '] hunting, her board does not say why every Take is grey');
}

/* ── PH-15 ── One solid alert, clear of the card; the town's card clear of the hero. */
async function alertStack(page, tag, fails) {
  await wait(page, () => document.querySelector('.hw-alert'), null, 6000);
  await page.waitForTimeout(250);
  const a = await page.evaluate(() => { const list = Array.from(document.querySelectorAll('.hw-alert')); const shown = list.filter((e) => e.getClientRects().length);
    const card = document.querySelector('.hs-widget > .hs-pointer:not(.is-min)'); const more = document.querySelector('.hw-alerts-more');
    return { all: list.length, shown: shown.length, box: shown[0] ? window.__r(shown[0]) : null, bg: shown[0] ? getComputedStyle(shown[0]).backgroundColor : '', card: card ? window.__r(card) : null, more: more && more.textContent, moreOn: !!more && window.__onScreen(window.__r(more)), bar: window.__r('.hb-bar') }; });
  if (a.all < 3) { fails.push('PH-15 [' + tag + '] CONTROL: ' + a.all + ' alerts from three invites'); return; }
  if (a.shown !== 1) fails.push('PH-15 [' + tag + '] ' + a.shown + ' alerts stacked at phone size');
  if (/rgba?\([^)]*,\s*0?\.\d+\)|\/ 0?\.\d/.test(a.bg) || a.bg === 'transparent') fails.push('PH-15 [' + tag + '] the alert is see-through: ' + a.bg);
  if (a.more !== (a.all - 1) + ' more' || !a.moreOn) fails.push('PH-15 [' + tag + '] nothing counts the alerts waiting: ' + a.more);
  if (a.box && a.box.bottom > a.bar.top) fails.push('PH-15 [' + tag + '] the alert runs onto the bar');
  if (a.card && a.box && window_cross(a.card, a.box)) fails.push('PH-15 [' + tag + '] the card and the alert lie on each other: ' + JSON.stringify([a.card, a.box]));
  /* The away card is tall (154 px at 667x375): no sliver of a card stays under it, open or folded (QA 2026-11-04). */
  await page.evaluate(() => { const t = document.querySelector('.hw-alert .hw-alert-text'); if (t) t.style.minHeight = '110px'; });
  await page.waitForTimeout(1200);
  const tall = await page.evaluate(() => ({ box: window.__r(Array.from(document.querySelectorAll('.hw-alert')).find((e) => e.getClientRects().length)),
    cards: Array.from(document.querySelectorAll('.hs-widget > .hs-pointer')).filter((e) => e.getClientRects().length).map((e) => window.__r(e)) }));
  if (tall.box && tall.cards.some((c) => window_cross(c, tall.box))) fails.push('PH-15 [' + tag + '] a card lies under a tall alert: ' + JSON.stringify(tall));
  /* ...and folded: its title may wrap to two lines, taller than the room an open card is capped to (v0.2.90's run: 56 px at 922x423) */
  await page.evaluate(() => { const b = document.querySelector('.hs-widget .hs-pointer .hs-coach-min'); if (b) b.click(); });
  await page.waitForTimeout(1200);
  const folded = await page.evaluate(() => ({ box: window.__r(Array.from(document.querySelectorAll('.hw-alert')).find((e) => e.getClientRects().length)),
    cards: Array.from(document.querySelectorAll('.hs-widget > .hs-pointer')).filter((e) => e.getClientRects().length).map((e) => window.__r(e)) }));
  if (folded.box && folded.cards.some((c) => window_cross(c, folded.box))) fails.push('PH-15 [' + tag + '] a folded card lies under a tall alert: ' + JSON.stringify(folded));
}
async function townCard(page, tag, fails, vp) {
  const c = await page.evaluate(() => { const p = document.querySelector('.hs-launchers > .hs-pointer:not(.is-min)'); return p ? window.__r(p) : null; });
  if (!c) { fails.push('PH-15 [' + tag + '] CONTROL: no open card in town'); return; }
  const hero = { left: vp.width / 2 - 40, right: vp.width / 2 + 40, top: 0, bottom: vp.height };
  if (window_cross(c, hero)) fails.push('PH-15 [' + tag + '] the town\'s card lies on the hero\'s column: ' + JSON.stringify(c));
  if (!window_onScreen(c, vp)) fails.push('PH-15 [' + tag + '] the town\'s card runs off the screen: ' + JSON.stringify(c));
  const chrome = await page.evaluate(() => window.__r('.world-chrome'));
  if (chrome && c.top < chrome.bottom - 0.5) fails.push('PH-15 [' + tag + '] the town\'s card lies over the place\'s name');
  /* What next's More shows on a phone (QA 2026-11-04: the one goal, the rest out of reach); only a window's one-line More stays off, its line wraps there. */
  const more = await page.evaluate(() => { const box = document.querySelector('.hs-launchers > .hs-pointer'), b = document.createElement('button'); b.className = 'hs-coach-more'; box.appendChild(b);
    const goal = getComputedStyle(b).display; box.classList.add('is-line'); const line = getComputedStyle(b).display; box.classList.remove('is-line'); b.remove(); return { goal, line }; });
  if (more.goal === 'none' || more.line !== 'none') fails.push('PH-15 [' + tag + '] What next\'s More reads ' + JSON.stringify(more));
  /* FOLDED, ITS TAB STAYS CLEAR OF THE HERO TOO. Since the icon row's own rule (set v0.2.135, shell.css: every screen hangs the town's card at
     the first icon, left: auto) the open card is placed by its own width and right alone, and the phone's rule that keeps the card at the left
     reaches only the folded tab: release run 44118906758 deleted it unseen. Without it the tab hangs under the first icon (252..357 at 667x375). */
  await page.click('.hs-launchers > .hs-pointer:not(.is-min) .hs-coach-min', { timeout: 2500 }).catch(() => null);
  const tab = (await wait(page, () => document.querySelector('.hs-launchers > .hs-pointer.is-min'), null, 3000)) ? await page.evaluate(() => window.__r('.hs-launchers > .hs-pointer.is-min')) : null;
  if (!tab) { fails.push('PH-15 [' + tag + '] CONTROL: the town\'s card did not fold to its tab'); return; }
  if (window_cross(tab, hero)) fails.push('PH-15 [' + tag + '] the town\'s folded card lies on the hero\'s column: ' + JSON.stringify(tab));
  if (!window_onScreen(tab, vp)) fails.push('PH-15 [' + tag + '] the town\'s folded card runs off the screen: ' + JSON.stringify(tab));
}

/* ── PH-16 ── Words while waiting: the world's line and the connection's, a leave with no answer, a leave counting down. */
async function waitWords(browser, base, tag, vp, fails) {
  const ctx = await browser.newContext({ viewport: vp });
  try {
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    const s = scripted(ALPHA, (env) => { env.hunt = null; });
    await stub(page, s, false);
    /* The world's module never arrives: the pane stays on its line. */
    await page.route('**/src/world/world-boot.js*', () => undefined);
    await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded', timeout: NAV_MS });
    await wait(page, () => document.querySelector('form[data-auth="sign-in"], [data-app="play"]'));
    if (await page.$('form[data-auth="sign-in"]')) {
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
    }
    await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
    await page.click('[data-app="play"][data-slot="0"]');
    if (!(await wait(page, () => document.querySelector('.world-status')))) { fails.push('PH-16 [' + tag + '] CONTROL: no waiting line'); return; }
    await ctx.setOffline(true);
    const off = await wait(page, () => /No connection/.test(document.querySelector('.world-status').textContent) && /No connection/.test((document.querySelector('.conn-line') || {}).textContent || ''), null, 3000);
    if (!off) fails.push('PH-16 [' + tag + '] offline, the wait reads: ' + JSON.stringify(await page.evaluate(() => [document.querySelector('.world-status').textContent, (document.querySelector('.conn-line') || {}).textContent])));
    await ctx.setOffline(false);
    const back = await wait(page, () => { const l = document.querySelector('.conn-line'); return !/No connection/.test(document.querySelector('.world-status').textContent) && (!l || l.hidden); }, null, 3000);
    if (!back) fails.push('PH-16 [' + tag + '] back online, the "no connection" words stayed');
  } finally { await ctx.close(); }
}
async function leaveWords(page, s, ctx, tag, fails) {
  s.holdLeave = true;
  await page.click('.ht-bar [data-hs-act="leave"]', { timeout: 2500 }).catch(() => null);
  const line = () => page.evaluate(() => (document.querySelector('.ht-leaving') || {}).textContent);
  const onBar = () => page.evaluate(() => { const l = document.querySelector('.ht-leaving'); return !!l && !l.hidden && window.__onScreen(window.__r(l)); });
  if (!(await wait(page, () => /^Leaving/.test((document.querySelector('.ht-leaving') || {}).textContent || ''), null, 2000))) fails.push('PH-16 [' + tag + '] the press reads: ' + await line());
  if (!(await wait(page, () => /Waiting for server/.test(document.querySelector('.ht-leaving').textContent), null, 6000))) fails.push('PH-16 [' + tag + '] a leave with no answer still reads: ' + await line());
  if (!(await onBar())) fails.push('PH-16 [' + tag + '] the leave\'s words are not on screen');
  if (!(await wait(page, () => /Slow connection/.test((document.querySelector('.conn-line') || {}).textContent || ''), null, 8000))) fails.push('PH-16 [' + tag + '] an ask out for 8 s does not say the connection is slow');
  await ctx.setOffline(true);
  if (!(await wait(page, () => /No connection/.test(document.querySelector('.ht-leaving').textContent), null, 3000))) fails.push('PH-16 [' + tag + '] with the connection gone the leave reads: ' + await line());
  await ctx.setOffline(false);
}

/* ── PH-17 ── The door: no keyboard thrown up on a phone, links a thumb can hit, and the desktop keeps its focus. */
async function doorRule(browser, base, vp, phone, fails) {
  const tag = tagOf(vp);
  const ctx = await browser.newContext({ viewport: vp });
  try {
    const page = await ctx.newPage();
    await stub(page, scripted(ALPHA), false);
    await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded', timeout: NAV_MS });
    await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
    await page.waitForTimeout(200);
    const d = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.tagName, links: Array.from(document.querySelectorAll('.auth-link')).map((a) => a.getBoundingClientRect().height),
      over: document.scrollingElement.scrollHeight - innerHeight }));
    if (phone && d.focus === 'INPUT') fails.push('PH-17 [' + tag + '] the email box takes the focus: a phone throws its keyboard up');
    if (!phone && d.focus !== 'INPUT') fails.push('PH-17 [' + tag + '] a desktop lost the first field\'s focus (' + d.focus + ')');
    if (phone && (!d.links.length || Math.min(...d.links) < 44)) fails.push('PH-17 [' + tag + '] the links are ' + d.links.join(', ') + ' px tall (want >= 44)');
    if (phone && d.over > 0) fails.push('PH-17 [' + tag + '] the sign-in runs ' + d.over + ' px past the screen');
  } finally { await ctx.close(); }
}

async function rules(overrides, shots, { stopAtFirst = false, blocks = null } = {}) {
  /* `blocks`: a mutant runs only the pages its rule reads (BLOCKS_OF), so --mutate costs seconds a mutant, not the suite. */
  const run = (b) => !blocks || blocks.includes(b);
  const fails = [];
  const STOP = Symbol('first red');
  if (stopAtFirst) fails.push = function (...a) { Array.prototype.push.apply(this, a); throw STOP; };
  const { server, port } = await serve(Object.assign({}, WORLD_HOOK, overrides));
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  const opened = [];
  const open = async (vp, fixture, prep, o = {}) => {
    const ctx = await browser.newContext(o.touch ? { viewport: vp, hasTouch: true, isMobile: true } : { viewport: vp });
    opened.push(ctx);
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    /* A HUNT PAGE HERE IS A PLAYER WATCHING: the stamp a page writes on the hunt it shows, a minute old. With none, a hunt past 10 min reads as a return (away-recap.js
       backWithNoStamp), and every card folds to its tab, so PH-6, 10, 15 and 27 would see no open card. `o.back`: the return itself. */
    const s = scripted(fixture, (env) => { if (prep) prep(env);
      if (!o.back && env.hunt && !env.hunt.ended && !(env.client_state && env.client_state.awaySeen)) env.client_state = Object.assign({}, env.client_state, { awaySeen: { s: env.hunt.session_id, at: Date.parse(env.now) - 60000, xp: env.state.level_xp } }); });
    await stub(page, s, !!shots);
    if (o.route) await o.route(page);
    const up = await play(page, base, fixture === ALPHA, o.crew);
    await page.evaluate(RECT);
    await page.waitForTimeout(o.settle || 400);
    return { ctx, page, s, up, errors };
  };
  const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, name + '.png') }); };
  const done = async (o, tag) => { if (o.errors.length) fails.push('PH [' + tag + '] console errors: ' + o.errors.slice(0, 2).join(' | ')); await o.ctx.close(); };
  try {
    for (const vp of run('configure') ? PHONES : []) { // PH-1
      const tag = tagOf(vp);
      const o = await open(vp, HUNT);
      if (!o.up) { fails.push('PH-1 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await configureFits(o.page, tag, fails);
      await shot(o.page, 'configure-items-scrolled-' + tag);
      await o.page.click('.ca-tab[data-tab="spells"]').catch(() => null);
      await o.page.waitForTimeout(250);
      await shot(o.page, 'configure-spells-' + tag);
      await done(o, tag);
    }
    if (run('configure')) { // PH-1 in town at 922x423 (the audit's view)
      const vp = { width: 922, height: 423 }, tag = tagOf(vp);
      const o = await open(vp, ALPHA);
      if (!o.up) fails.push('PH-1 [' + tag + '] the town did not mount');
      else { await configureTownFits(o.page, tag, fails); await shot(o.page, 'configure-town-' + tag); }
      await done(o, tag + ' in town');
    }
    if (run('configure')) { // PH-1 on a desktop: the fixture's Shield hero, then a Sword hero at the server's Melee one under Turning Cut's level and at it
      const desk = { width: 1440, height: 900 }, tag = tagOf(desk);
      const o = await open(desk, HUNT);
      if (!o.up) fails.push('PH-1 [' + tag + '] the hunt did not mount');
      else { await configureDesk(o.page, tag, fails, HUNT.hunt_settings.discipline); await shot(o.page, 'configure-spells-' + tag); }
      await done(o, tag);
      const lvl = ABILITIES.turning_cut.unlock;
      for (const [lv, need] of [[lvl - 1, 'Melee ' + lvl], [lvl, '']]) {
        const sword = await open(desk, HUNT, (env) => { env.hunt_settings.discipline = 'sword'; env.hunt_settings.role = 'melee_dps'; env.skills = Object.assign({}, env.skills, { melee: { xp: 0, level: lv } }); });
        const at = tag + ' Melee ' + lv;
        if (!sword.up) { fails.push('PH-1 [' + at + '] the hunt did not mount'); await sword.ctx.close(); continue; }
        const rows = await configureDesk(sword.page, at, fails, 'sword');
        const cut = (rows || []).find((r) => r.id === 'turning_cut');
        if (!cut || cut.locked !== !!need || cut.need !== need) fails.push('PH-1 [' + at + '] a Sword hero at the server\'s Melee ' + lv + ' sees Turning Cut ' + JSON.stringify(cut) + ' (want ' + (need ? 'locked, needing "' + need + '"' : 'open') + ')');
        await done(sword, at);
      }
    }
    for (const vp of run('hunt') ? [{ width: 844, height: 390 }, { width: 667, height: 375 }, { width: 1440, height: 900 }] : []) { // PH-2
      const tag = tagOf(vp);
      const phone = vp.width < 1024;
      const o = await open(vp, HUNT);
      if (!o.up) { fails.push('PH-2 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await analyzerToggles(o.page, base, tag, fails, phone);
      if (phone) await shot(o.page, 'hunt-analyzer-open-' + tag);
      await done(o, tag);
      if (!phone) continue;
      /* A pending leave: "Leaving in Ns" to the server's leave_at (90 s off on the hunt's server clock,
         hunt_server_now_ms: the fixture's `now` is a year from it), the button off. */
      const leaving = await open(vp, HUNT, (env) => {
        env.hunt.session = Object.assign({}, env.hunt.session, { id: env.hunt.session_id, leave_at: new Date(env.hunt_server_now_ms + 90000).toISOString(), phase: 'leaving' });
      });
      if (!leaving.up) { fails.push('PH-2 [' + tag + '] the leaving hunt did not mount'); await leaving.ctx.close(); continue; }
      const l = await leaving.page.evaluate(() => ({ line: (document.querySelector('.ht-leaving') || {}).textContent, bar: window.__r('.ht-bar'), party: window.__r('.hp-party'),
        rows: (() => { const tops = Array.from(document.querySelectorAll('.ht-bar > *')).filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none' && (e.textContent || '').trim())
          .map((e) => { const b = e.getBoundingClientRect(); return Math.round(b.top + b.height / 2); }); return new Set(tops.map((t) => Math.round(t / 12))).size; })(),
        /* every shown word of the bar inside the bar, and the bar on screen */
        spill: Array.from(document.querySelectorAll('.ht-bar > *')).filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none' && (e.textContent || '').trim())
          .map((e) => e.getBoundingClientRect()).filter((b) => b.right > Math.min(innerWidth, document.querySelector('.ht-bar').getBoundingClientRect().right) + 1).length,
        /* the countdown stands where Leave hunt was: the button (off until the hunt ends) takes no room beside it */
        leaveShown: (() => { const b = document.querySelector('.ht-bar [data-hs-act="leave"]'); return !!b && b.getClientRects().length > 0; })() }));
      if (!/^Leaving in \d+s$/.test(String(l.line))) fails.push('PH-2 [' + tag + '] CONTROL: the pending leave shows "' + l.line + '"');
      else if (!(l.party && l.party.bottom <= vp.height && l.party.top >= 0)) fails.push('PH-2 [' + tag + '] CONTROL: the Party panel is not on screen (' + JSON.stringify(l.party) + ')');
      else if (window_cross(l.bar, l.party)) fails.push('PH-2 [' + tag + '] the leaving hunt bar runs ' + Math.round(l.party.right - l.bar.left) + ' px over the Party panel');
      else if (l.rows > 1) fails.push('PH-2 [' + tag + '] the leaving hunt bar wraps to ' + l.rows + ' lines');
      else if (l.spill) fails.push('PH-2 [' + tag + '] ' + l.spill + ' part(s) of the leaving hunt bar run past its edge or the screen\'s');
      else if (l.leaveShown) fails.push('PH-2 [' + tag + '] the switched-off Leave hunt still takes room beside "' + l.line + '"');
      await shot(leaving.page, 'hunt-leaving-' + tag);
      /* PH-5: the hunt bar's buttons and the analyzer's tabs are thumb-sized. */
      if (vp.width === 844) {
        await tallEnough(leaving.page, '.ht-bar button:not([hidden])', 40, 'the hunt bar\'s buttons', tag, fails);
        await leaving.page.click('.ht-bar [data-hs-act="details"]', { timeout: 2500 }).catch(() => null);
        await leaving.page.waitForTimeout(300);
        await tallEnough(leaving.page, '.ha-analyzer .ha-tab', 40, 'the analyzer\'s tabs', tag, fails);
      }
      await done(leaving, tag);
    }
    for (const vp of run('hunt') ? [{ width: 667, height: 375 }, { width: 922, height: 423 }] : []) { // PH-2 over the town (a training session)
      const tag = tagOf(vp) + ' training';
      const o = await open(vp, HUNT, atTheYard);
      if (!o.up) { fails.push('PH-2 [' + tag + '] the training session did not mount'); await o.ctx.close(); continue; }
      await analyzerOverTown(o.page, tag, fails);
      await shot(o.page, 'training-analyzer-open-' + tagOf(vp));
      await done(o, tag);
    }
    if (run('portrait')) await portrait(browser, base, fails, shots); // PH-3
    for (const vp of run('town') ? [{ width: 844, height: 390 }] : []) { // PH-4, PH-5 in town
      const tag = tagOf(vp);
      const o = await open(vp, ALPHA, longBag);
      if (!o.up) { fails.push('PH-4 [' + tag + '] the town did not mount'); await o.ctx.close(); continue; }
      await settingsTouch(o.page, tag, fails);
      await shot(o.page, 'settings-interface-' + tag);
      await bagByTouch(o.page, tag, fails);
      await shot(o.page, 'inventory-equip-' + tag);
      await done(o, tag);
    }
    /* PH-6: the card under the hunt bar in a hunt, and under the icon row in town (no hunt: the hunt bar is gone). */
    const inTown = (env) => { longCoach(env); env.hunt = null; env.state = Object.assign({}, env.state, { active_kind: null, active_id: null }); };
    for (const vp of run('coach') ? [...PHONES, { width: 1440, height: 900 }] : []) {
      const tag = tagOf(vp);
      for (const [where, fixture, prep] of [['hunt', HUNT, longCoach], ['town', ALPHA, inTown]]) {
        const o = await open(vp, fixture, prep, { route: LONG_WORDS });
        if (!o.up) { fails.push('PH-6 [' + tag + '] the ' + where + ' did not mount'); await o.ctx.close(); continue; }
        await shot(o.page, 'coach-long-' + where + '-' + tag);
        await coachFits(o.page, tag + ' ' + where, fails, vp.width < 1024);
        await done(o, tag);
      }
      /* A RETURN NEVER LOSES THE CARD (v0.2.90): it folds to a tab a press can reach, and the press opens it. */
      const back = await open(vp, HUNT, longCoach, { back: true });
      if (!back.up) { fails.push('PH-6 [' + tag + ' return] the hunt did not mount'); await back.ctx.close(); continue; }
      const tab = await back.page.evaluate(() => { const t = document.querySelector('.hs-widget .hs-pointer.is-min .hs-coach-tab'); return !!t && window.__onScreen(window.__r(t)) && window.__hits(t); });
      if (!tab) fails.push('PH-6 [' + tag + ' return] the folded card has no tab a press can reach');
      else {
        await back.page.click('.hs-widget .hs-pointer.is-min .hs-coach-tab', { timeout: 2500 }).catch(() => null);
        if (!(await wait(back.page, () => document.querySelector('.hs-widget .hs-pointer:not(.is-min) .hs-coach-text'), null, 3000))) fails.push('PH-6 [' + tag + ' return] a press on the tab opens nothing');
      }
      await done(back, tag);
    }
    /* PH-6: a fresh hero's first card, over the town and inside the bag's sheet: it ends above the bar, and its Got it is on
       screen and can be pressed (played at 667x375, 2026-10-31: it ran off the foot, and the hero could not get past it). */
    for (const vp of run('coach') ? PHONES : []) {
      const tag = tagOf(vp);
      const o = await open(vp, ALPHA, (env) => { env.hunt = null; env.state = Object.assign({}, env.state, { level_xp: 0, active_kind: null, active_id: null });
        env.equipment = Object.assign({}, env.equipment, { weapon: 'practice_sword' }); env.client_state = Object.assign({}, env.client_state, { coach: { read: [] } });
        env.tally = { per_day: 3, held_max: 3, paid_today: 0, held: [], recent: [] }; });   // Tamsin's rats not taken yet
      if (!o.up) { fails.push('PH-6 [' + tag + ' first card] the town did not mount'); await o.ctx.close(); continue; }
      const town = await o.page.evaluate(() => { const p = document.querySelector('.hs-launchers > .hs-pointer:not(.is-min)'); return p && { id: p.getAttribute('data-tutorial'), foot: window.__r(p).bottom, bar: window.__r('.hb-bar').top }; });
      if (!town || town.id !== 'tamsins_rats') fails.push('PH-6 [' + tag + ' first card] CONTROL: the first card is ' + JSON.stringify(town));
      else if (town.foot > town.bar + 0.5) fails.push('PH-6 [' + tag + ' first card] it runs ' + Math.round(town.foot - town.bar) + ' px over the action bar');
      /* the first card is Tamsin's rats since 2026-11-12 (the style waits for the first hunt): its Got it is inside her tally */
      await pressBar(o.page, 'tally');
      await wait(o.page, () => document.querySelector('.hs-win-coach .hs-coach-got'), null, 3000);
      await shot(o.page, 'coach-first-in-bag-' + tag);
      const got = await o.page.evaluate(() => { const b = document.querySelector('.hs-win-coach .hs-coach-got'); return b && window.__onScreen(window.__r(b)) && window.__hits(b); });
      if (!got) fails.push('PH-6 [' + tag + ' first card] inside the tally its Got it is off screen or covered');
      await done(o, tag);
    }
    for (const vp of run('fight') ? [{ width: 922, height: 423 }, { width: 844, height: 390 }, { width: 1440, height: 900 }, { width: 1280, height: 720 }] : []) { // PH-10
      const tag = tagOf(vp);
      const o = await open(vp, HUNT, (env) => { env.state = Object.assign({}, env.state, { level_xp: 0 }); }, { settle: 1500 });
      if (!o.up) { fails.push('PH-10 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await shot(o.page, 'coach-fight-' + tag);
      await coachOffFight(o.page, tag, fails, vp.width < 1024, HUNT.party.members.map((m) => m.unit));
      await done(o, tag);
    }
    for (const vp of run('bar') ? PHONES : []) { // PH-7
      const tag = tagOf(vp);
      const o = await open(vp, HUNT, (env) => { env.hunt_settings.presets[0].name = 'Preset 1'; }); // a new hero's own setup's name
      if (!o.up) { fails.push('PH-7 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await shot(o.page, 'bar-' + tag);
      await barFits(o.page, tag, fails);
      await barPresses(o.page, tag, fails); // PH-30
      await done(o, tag);
    }
    for (const vp of run('desk') ? [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }] : []) { // PH-8
      const tag = tagOf(vp);
      const o = await open(vp, HUNT);
      if (!o.up) { fails.push('PH-8 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await shot(o.page, 'desk-bar-' + tag);
      await desktopBar(o.page, tag, fails);
      await done(o, tag);
    }
    if (run('stamina')) await staminaBuy(open, fails, done); // PH-9
    const townOnly = (env) => { env.hunt = null; env.state = Object.assign({}, env.state, { active_kind: null, active_id: null }); };
    for (const vp of run('strip') ? PHONES : []) { // PH-11, PH-12
      const tag = tagOf(vp);
      const o = await open(vp, ALPHA, townOnly);
      if (!o.up) { fails.push('PH-11 [' + tag + '] the town did not mount'); await o.ctx.close(); continue; }
      await shot(o.page, 'strip-' + tag);
      await stripReach(o.page, tag, fails);
      await done(o, tag);
      const two = await open(vp, ALPHA, (env) => { townOnly(env); twoHeroes(env); });
      if (!two.up) { fails.push('PH-12 [' + tag + '] the town did not mount'); await two.ctx.close(); continue; }
      await inviteByPress(two, tag, fails);
      await shot(two.page, 'all-characters-' + tag);
      await done(two, tag);
    }
    if (run('strip')) { // The desktop keeps its strip, its chips and its sheet.
      const o = await open({ width: 1440, height: 900 }, ALPHA, townOnly);
      if (o.up) {
        await o.page.click('.char-tool.is-all');
        await wait(o.page, () => document.querySelector('[data-hs-win="characters"] .hw-char'), null, 4000);
        const d = await o.page.evaluate(() => { const shown = (q) => Array.from(document.querySelectorAll(q)).filter((e) => e.getClientRects().length).length;
          return { phoneOnly: shown('.hw-phone-only') + shown('.hw-char-invite') + shown('.char-tool-short'), tools: shown('.char-tool'), chip: shown('.hs-win-head .hs-key'), left: window.__r('.hs-launchers').width }; });
        if (d.phoneOnly) fails.push('PH-11 [1440x900] the phone\'s routes show on a desktop');
        if (d.tools !== 3) fails.push('PH-11 [1440x900] the desktop strip has ' + d.tools + ' words, not its three');
        if (d.chip < 1) fails.push('PH-11 [1440x900] the desktop lost a window\'s key chip');
      } else fails.push('PH-11 [1440x900] the town did not mount');
      await done(o, '1440x900');
    }
    for (const vp of run('slots') ? [{ width: 667, height: 375 }] : []) { // PH-13
      const tag = tagOf(vp);
      const o = await open(vp, HUNT);
      if (!o.up) { fails.push('PH-13 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await slotPage(o.page, tag, fails);
      await done(o, tag);
    }
    for (const vp of run('slots') ? [{ width: 667, height: 375 }, { width: 922, height: 423 }] : []) { // PH-13 chat
      const tag = tagOf(vp);
      const o = await open(vp, HUNT);
      if (!o.up) { fails.push('PH-13 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await chatFoot(o.page, tag, fails);
      await shot(o.page, 'chat-' + tag);
      await done(o, tag);
    }
    if (run('slots')) {
      const o = await open({ width: 1440, height: 900 }, HUNT);
      if (o.up && await o.page.evaluate(() => { const b = document.querySelector('.hb-page'); return !!b && b.getClientRects().length > 0; })) fails.push('PH-13 [1440x900] the page press shows on a desktop');
      await done(o, '1440x900');
    }
    for (const vp of run('meaning') ? [{ width: 667, height: 375 }, { width: 922, height: 423 }] : []) { // PH-14
      const tag = tagOf(vp);
      const o = await open(vp, ALPHA, (env) => { townOnly(env); longBag(env); env.state = Object.assign({}, env.state, { gold: 0 }); if (env.account) env.account = Object.assign({}, env.account, { gold: 0 }); }, { touch: true });
      if (!o.up) { fails.push('PH-14 [' + tag + '] the town did not mount'); await o.ctx.close(); continue; }
      await touchMeaning(o.page, tag, fails);
      await shot(o.page, 'grey-why-' + tag);
      await done(o, tag);
      const h = await open(vp, HUNT, null, { touch: true });
      if (!h.up) { fails.push('PH-14 [' + tag + '] the hunt did not mount'); await h.ctx.close(); continue; }
      await touchHunt(h.page, h.s, tag, fails);
      await done(h, tag);
    }
    if (run('meaning')) { // PH-14: a touch screen too big for the phone query has no keys and no hover either
      const o = await open({ width: 1024, height: 768 }, ALPHA, townOnly, { touch: true });
      if (o.up) {
        await pressBar(o.page, 'shop', { tap: true }).catch(() => null);
        await wait(o.page, () => document.querySelector('[data-hs-win="shop"] [data-hs-built]'), null, 4000);
        const t = await o.page.evaluate(() => ({ chips: Array.from(document.querySelectorAll('.hs-win-head .hs-key')).filter((k) => k.getClientRects().length).length, heads: document.querySelectorAll('.hs-win-head').length, tip: getComputedStyle(document.querySelector('.hs-launch'), '::before').display }));
        if (!t.heads) fails.push('PH-14 [1024x768 touch] CONTROL: no window opened');
        else if (t.chips || t.tip !== 'none') fails.push('PH-14 [1024x768 touch] a touch screen shows a key chip or keeps the hover tooltip: ' + JSON.stringify(t));
      } else fails.push('PH-14 [1024x768 touch] the town did not mount');
      await done(o, '1024x768');
    }
    for (const vp of run('stack') ? [{ width: 667, height: 375 }, { width: 922, height: 423 }] : []) { // PH-15
      const tag = tagOf(vp);
      const invites = (env) => { env.party_invites = [1, 2, 3].map((n) => ({ id: '00000000-0000-4000-8000-00000000000' + n, hunt: 'mill_cellar', from: 'Mira' })); };
      const o = await open(vp, HUNT, invites);
      if (!o.up) { fails.push('PH-15 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await alertStack(o.page, tag + ' hunt', fails);
      await shot(o.page, 'alert-over-card-' + tag);
      await done(o, tag);
      const t = await open(vp, ALPHA, (env) => { townOnly(env); longCoach(env); townOnly(env); });
      if (!t.up) { fails.push('PH-15 [' + tag + '] the town did not mount'); await t.ctx.close(); continue; }
      await townCard(t.page, tag, fails, vp);
      await shot(t.page, 'town-card-' + tag);
      await done(t, tag);
    }
    for (const vp of run('waits') ? [{ width: 667, height: 375 }] : []) { // PH-16
      const tag = tagOf(vp);
      await waitWords(browser, base, tag, vp, fails);
      const o = await open(vp, HUNT);
      if (!o.up) { fails.push('PH-16 [' + tag + '] the hunt did not mount'); await o.ctx.close(); continue; }
      await leaveWords(o.page, o.s, o.ctx, tag, fails);
      await o.ctx.close();
      const c = await open(vp, HUNT, (env) => { env.hunt.session = Object.assign({}, env.hunt.session, { id: env.hunt.session_id, leave_at: new Date(env.hunt_server_now_ms + 90000).toISOString(), phase: 'leaving' }); });
      if (!c.up) { fails.push('PH-16 [' + tag + '] the leaving hunt did not mount'); await c.ctx.close(); continue; }
      const why = await c.page.evaluate(() => { const w = document.querySelector('.ht-why'), r = window.__r(w), bar = window.__r('.ht-bar'); return { text: w.textContent, on: !!r && window.__onScreen(r), clear: !!r && r.top >= bar.bottom - 0.5, sized: !!r && parseFloat(getComputedStyle(w).fontSize) >= 12 }; });
      if (!why.text || !why.on || !why.clear || !why.sized) fails.push('PH-16 [' + tag + '] a counting leave does not say what the wait is for: ' + JSON.stringify(why));
      await shot(c.page, 'leave-why-' + tag);
      await done(c, tag);
    }
    const SMALLEST = { width: 667, height: 375 };
    const readSoFar = (id) => HUNT_TUTORIAL.slice(0, HUNT_TUTORIAL.findIndex((c) => c.id === id)).map((c) => c.id);
    const reading = (env, id, xp) => { townOnly(env); env.state = Object.assign({}, env.state, { level_xp: xp }); env.client_state = Object.assign({}, env.client_state, { coach: { read: readSoFar(id) } }); };
    if (run('coachsheet')) { // PH-18
      const tag = tagOf(SMALLEST);
      const o = await open(SMALLEST, ALPHA, (env) => reading(env, 'to_the_cellar', 0));
      if (o.up) { await coachSheet(o.page, tag, fails); await shot(o.page, 'coach-in-hunts-' + tag); await done(o, tag); } else fails.push('PH-18 [' + tag + '] the town did not mount');
      const c = await open(SMALLEST, ALPHA, (env) => { reading(env, 'bless', charXpForLevel(5)); longBag(env);
        env.blessings = { tiers: [1, 2, 3].map((tier) => ({ tier, permille: 320, price: 0, held: false })), permille: 0, free_until: 30 }; });
      if (c.up) { await gotItRests(c.page, tag, fails); await done(c, tag); } else fails.push('PH-18 [' + tag + '] the town did not mount');
      /* The one card that still lies over a running hunt's Hunts: "Into the sewer, together", a hero in a party on the Thicket at the Sewer's Level. */
      const h = await open(SMALLEST, HUNT, (env) => { const seat = HUNT.party.members[0].seat;
        env.hunt = Object.assign({}, env.hunt, { hunt_id: 'meadowbrook_thicket' });
        env.state = Object.assign({}, env.state, { level_xp: charXpForLevel(HUNT_INDEX.millrace_sewer.band[0]) });
        env.party = Object.assign(clone(HUNT.party), { id: '11111111-0000-4000-8000-00000000000b', max: 4, self_seat: seat, leader_seat: seat });
        env.client_state = Object.assign({}, env.client_state, { coach: { read: readSoFar('go_below') } }); });
      if (h.up) { await coachSheetHunting(h.page, tag, fails); await done(h, tag); } else fails.push('PH-18 [' + tag + '] the hunt did not mount');
    }
    if (run('apart')) { // PH-19
      const tag = tagOf(SMALLEST);
      const o = await open(SMALLEST, HUNT, (env) => { env.client_state = Object.assign({}, env.client_state, { coach: { min: true } }); });
      if (o.up) { await huntBarApart(o.page, tag, fails); await done(o, tag); } else fails.push('PH-19 [' + tag + '] the hunt did not mount');
    }
    for (const vp of run('partyacts') ? PHONES : []) { // PH-20
      const tag = tagOf(vp);
      const o = await open(vp, ALPHA, (env) => { townOnly(env); const seat = HUNT.party.members[0].seat; env.party = Object.assign(clone(HUNT.party), { id: '11111111-0000-4000-8000-00000000000b', max: 4, self_seat: seat, leader_seat: seat }); });
      if (!o.up) { fails.push('PH-20 [' + tag + '] the town did not mount'); await o.ctx.close(); continue; }
      await partyActs(o, tag, fails);
      await shot(o.page, 'party-acts-' + tag);
      await done(o, tag);
    }
    if (run('tapped')) { // PH-21
      const tag = tagOf(SMALLEST);
      const o = await open(SMALLEST, ALPHA, longBag, { touch: true });
      if (o.up) { await tappedItem(o.page, tag, fails); await shot(o.page, 'tapped-item-' + tag); await done(o, tag); } else fails.push('PH-21 [' + tag + '] the town did not mount');
    }
    if (run('doors')) { // PH-22
      for (const vp of [SMALLEST, { width: 844, height: 390 }]) await createDoor(browser, base, vp, fails);
      const ctx = await browser.newContext({ viewport: SMALLEST });
      try {
        const page = await ctx.newPage();
        const s = scripted(ALPHA, (env) => { env.hero_slots = [0, 1]; });
        s.emptySlot1 = true;
        await stub(page, s, false);
        await HOW_TWICE(page);
        await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded', timeout: NAV_MS });
        await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
        await page.fill('input[name=email]', 'qa@example.test');
        await page.fill('input[name=password]', 'not-a-real-password');
        await page.click('.auth-submit');
        await heroDoor(page, tagOf(SMALLEST), fails);
        await shot(page, 'hero-door-' + tagOf(SMALLEST));
      } finally { await ctx.close(); }
    }
    for (const vp of run('ground') ? SMALL_PHONES : []) { // PH-25
      const tag = tagOf(vp);
      const o = await open(vp, ALPHA, (env) => reading(env, 'to_the_cellar', 0));
      if (o.up) { await groundPage(o.page, tag, fails, vp.width === 844 ? 200 : 190); await shot(o.page, 'ground-page-' + tag); await done(o, tag); } else fails.push('PH-25 [' + tag + '] the town did not mount');
    }
    for (const vp of run('hall') ? [{ width: 922, height: 423 }] : []) { // PH-32
      const tag = tagOf(vp);
      const HALL_FROM = 'export function hallFromGround(huntId) { return Object.values(OPEN_BOSS_HALLS).find((h) => h.id === huntId) || null; }';
      const route = (page) => page.route('**/src/data/boss-halls.js*', async (r) => { const res = await r.fetch(), body = await res.text();
        if (body.split(HALL_FROM).length !== 2) throw new Error('PH-32: the hallFromGround anchor moved');
        return r.fulfill({ response: res, body: body.replace(HALL_FROM, () => 'export function hallFromGround() { return BOSS_HALLS.krells_hold || null; }') }); });
      /* Level 85, the hall's own band: a hall's food floor speaks from there (src/shell/weak-food.js hallFloor, the 139 audit's B2) */
      const o = await open(vp, ALPHA, (env) => { townOnly(env); env.inventory = Object.assign({}, env.inventory, { hall_key: 1 });
        env.state = Object.assign({}, env.state, { level_xp: charXpForLevel(85) });
        for (const sl of env.hunt_settings.slots) if (sl && sl.action && sl.action.id === 'wheat_bread') sl.action.id = 'salted_shrimp'; }, { route });
      if (o.up) { await hallDoor(o.page, tag, fails); await shot(o.page, 'hall-door-' + tag); await done(o, tag); } else fails.push('PH-32 [' + tag + '] the town did not mount');
    }
    for (const vp of run('barsheet') ? PHONES : []) { // PH-33
      const tag = tagOf(vp);
      const o = await open(vp, ALPHA, (env) => { env.hunt = null; env.state = Object.assign({}, env.state, { active_kind: null, active_id: null }); });
      if (o.up) { await barBesideSheet(o.page, tag, fails); await shot(o.page, 'bar-beside-sheet-' + tag); await done(o, tag); } else fails.push('PH-33 [' + tag + '] the town did not mount');
    }
    for (const vp of run('huntlist') ? PHONES : []) { // PH-34
      const tag = tagOf(vp);
      /* a hero who has hunted: the server's bests put "Best ..." and "No record yet" on the lines, as the audit's phone saw them */
      const o = await open(vp, HUNT, (env) => { env.hunt_bests = { min_ms: 600000, grounds: { mill_cellar: { solo: { xp_h: 9413, balance_h: 450 }, party: null } } }; });
      if (o.up) { await huntsWholeRows(o.page, tag, fails); await shot(o.page, 'hunts-list-hunting-' + tag); await done(o, tag); } else fails.push('PH-34 [' + tag + '] the hunt did not mount');
    }
    if (run('ground')) {
      const tag = tagOf(SMALLEST);
      const o = await open(SMALLEST, HUNT);
      if (o.up) { await groundBackHunting(o.page, tag, fails); await done(o, tag); } else fails.push('PH-25 [' + tag + '] the hunt did not mount');
    }
    for (const vp of run('details') ? SMALL_PHONES : []) { // PH-26
      const tag = tagOf(vp);
      const o = await open(vp, HUNT, aloneInHunt, { crew: 1 });
      if (o.up) { await detailsTabs(o.page, tag + ' alone', fails, vp.width === 844 ? 88 : 72, true); await shot(o.page, 'details-alone-' + tag); await done(o, tag); } else fails.push('PH-26 [' + tag + '] the hunt did not mount');
      const two = await open(vp, HUNT);
      if (two.up) { await detailsTabs(two.page, tag + ' party', fails, vp.width === 844 ? 60 : 45, false); await shot(two.page, 'details-party-' + tag); await done(two, tag); } else fails.push('PH-26 [' + tag + '] the hunt did not mount');
    }
    for (const [vp, town, sheet, hunt] of run('cards') ? [[SMALL_PHONES[0], 999, 999, 200], [SMALL_PHONES[1], 200, 200, 160]] : []) { // PH-27
      const tag = tagOf(vp);
      const o = await open(vp, ALPHA, (env) => reading(env, 'styles', 0));
      if (o.up) { await wordsFit(o.page, '.hs-launchers > .hs-pointer:not(.is-min)', 'text', town, tag, 'town', fails); await shot(o.page, 'card-town-' + tag); await done(o, tag); } else fails.push('PH-27 [' + tag + '] the town did not mount');
      const w = await open(vp, ALPHA, (env) => reading(env, 'to_the_cellar', 0));
      if (w.up) {
        await w.page.click('.hs-launch[data-hs-open="hunts"]', { timeout: 2500 }).catch(() => null);
        await wait(w.page, () => document.querySelector('[data-hs-win="hunts"] .hs-win-coach .hs-pointer:not(.is-min)'), null, 4000);
        await w.page.waitForTimeout(250);
        await wordsFit(w.page, '[data-hs-win="hunts"] .hs-win-coach .hs-pointer:not(.is-min)', 'in', sheet, tag, 'beside a sheet', fails);
        await shot(w.page, 'card-sheet-' + tag); await done(w, tag);
      } else fails.push('PH-27 [' + tag + '] the town did not mount');
      const h = await open(vp, HUNT, (env) => { env.state = Object.assign({}, env.state, { level_xp: 0 }); }, { settle: 800 });
      if (h.up) { await wordsFit(h.page, '.hs-widget.is-hunt-topbar > .hs-pointer:not(.is-min)', 'text', hunt, tag, 'under the hunt bar', fails, true); await shot(h.page, 'card-hunt-' + tag); await done(h, tag); } else fails.push('PH-27 [' + tag + '] the hunt did not mount');
    }
    if (run('cards')) { // PH-27 at the desktop: no title ends on one word
      const d = await open({ width: 1440, height: 900 }, HUNT, (env) => { env.state = Object.assign({}, env.state, { level_xp: 0 }); }, { settle: 800 });
      if (d.up) { await titlesBalance(d.page, '.hs-widget.is-hunt-topbar > .hs-pointer:not(.is-min)', '1440x900', fails); await shot(d.page, 'card-hunt-1440x900'); await done(d, '1440x900'); } else fails.push('PH-27 [1440x900] the hunt did not mount');
    }
    for (const vp of run('partyfold') ? SMALL_PHONES : []) { // PH-29
      const tag = tagOf(vp);
      const o = await open(vp, HUNT, aloneInHunt, { crew: 1 });
      if (o.up) { await shot(o.page, 'party-folded-' + tag); await partyFolds(o, base, tag, fails); await done(o, tag); } else fails.push('PH-29 [' + tag + '] the hunt did not mount');
      const two = await open(vp, HUNT);
      if (two.up) { const f = await two.page.evaluate(PARTY_NOW); if (f.folded || !f.member) fails.push('PH-29 [' + tag + '] a party\'s panel starts folded'); await done(two, tag); } else fails.push('PH-29 [' + tag + '] the hunt did not mount');
    }
    if (run('partyfold')) { // PH-29: a desktop at or past the fold width (tokens.css --hud-fold-below) keeps a lone hero's panel open; its dash folds it (2026-11-11)
      const o = await open({ width: 1366, height: 768 }, HUNT, aloneInHunt, { crew: 1 });
      if (o.up) { const f = await o.page.evaluate(PARTY_NOW); if (f.folded || !f.member || !f.fold) fails.push('PH-29 [1366x768] the desktop\'s panel starts folded, or has no dash to fold it: ' + JSON.stringify(f)); await done(o, '1366x768'); } else fails.push('PH-29 [1366x768] the hunt did not mount');
    }
    if (run('market')) { // PH-23
      const tag = tagOf(SMALLEST);
      const o = await open(SMALLEST, ALPHA, (env) => { townOnly(env); longBag(env); });
      if (o.up) { await sorts(o.page, tag, fails); await weighhouse(o.page, tag, fails); await shot(o.page, 'sell-sheet-' + tag); await done(o, tag); } else fails.push('PH-23 [' + tag + '] the town did not mount');
    }
    if (run('partyphone')) { // PH-24
      const tag = tagOf(SMALLEST);
      const noParty = (env) => { townOnly(env); env.party = null; env.party_invites = []; };
      const o = await open(SMALLEST, ALPHA, noParty);
      if (o.up) { await partyInvite(o, tag, fails); await done(o, tag); } else fails.push('PH-24 [' + tag + '] the town did not mount');
      const invited = (env) => { townOnly(env); env.party = null; env.party_invites = [{ id: '00000000-0000-4000-8000-000000000001', hunt: 'mill_cellar', from: 'Mira' }]; };
      const t = await open({ width: 844, height: 390 }, ALPHA, (env) => { longCoach(env); invited(env); }, { route: LONG_WORDS });
      if (t.up) { await inviteToast(t.page, '844x390', fails); await shot(t.page, 'invite-beside-sheet-844x390'); await done(t, '844x390'); } else fails.push('PH-24 the town did not mount');
      const c = await open(SMALLEST, ALPHA, invited);
      if (c.up) { await sheetWords(c.page, tag, fails); await done(c, tag); } else fails.push('PH-24 [' + tag + '] the town did not mount');
      const m = await open(SMALLEST, ALPHA, (env) => { townOnly(env); longBag(env); env.account = Object.assign({}, env.account, { bank: { coal: 3 } }); env.bank = { coal: 3 }; });
      if (m.up) { await mouseWordsAndTargets(m.page, tag, fails); await done(m, tag); } else fails.push('PH-24 [' + tag + '] the town did not mount');
      const sn = await open({ width: 922, height: 423 }, ALPHA, (env) => { townOnly(env); twoHeroes(env); });
      if (sn.up) { await menuSending(sn, '922x423', fails); await sn.ctx.close(); } else fails.push('PH-24 the town did not mount');
      /* A Storage that holds something (thirty stacks): with ONE stack the plain order left Expand 1 px inside the fold once the help lines
         became labels (v0.2.134), and the planted "Expand below the fold" escaped. The rule is about a Storage a player has filled. */
      const held = Object.fromEntries(MATERIALS.map((id) => [id, 3]));
      const bx = await open({ width: 922, height: 423 }, ALPHA, (env) => { townOnly(env); env.bag_expand = { cap: 100, rung: 0, max: 30, next: { offer: 'bank.0', gold: 3000, adds: 20 } };
        env.account = Object.assign({}, env.account, { bank: held, depot: { used: MATERIALS.length, cap: 100, next: { name: 'Millrace Crate', stacks: 20 } } }); env.bank = held; env.depot = env.account.depot; });
      if (bx.up) { await bagReach(bx.page, '922x423', fails); await shot(bx.page, 'storage-expand-922x423'); await done(bx, '922x423'); } else fails.push('PH-24 the town did not mount');
    }
    if (run('door')) { // PH-17
      for (const vp of PHONES) await doorRule(browser, base, vp, true, fails);
      await doorRule(browser, base, { width: 1440, height: 900 }, false, fails);
    }
    if (shots && !blocks) await moreShots(open, shot);
  } catch (e) {
    /* the array's own push: under stopAtFirst `fails.push` throws, and a throw here would leave rules() rejected */
    if (e !== STOP) Array.prototype.push.call(fails, 'PH threw: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
  } finally {
    for (const c of opened) await c.close().catch(() => null);
    await browser.close().catch(() => null);
    server.close();
  }
  return fails;
}

/* The rest of the visual gate: every touched screen at every phone size, and the desktop unchanged. */
async function moreShots(open, shot) {
  for (const vp of [...PHONES, { width: 1440, height: 900 }]) {
    const tag = tagOf(vp);
    const phone = vp.width < 1024;
    const h = await open(vp, HUNT);
    if (h.up) {
      await shot(h.page, 'hunt-' + tag);
      if (phone && vp.width === 922) {
        await h.page.click('.ht-bar [data-hs-act="details"]').catch(() => null);
        await h.page.waitForTimeout(400);
        await shot(h.page, 'hunt-analyzer-open-' + tag);
        await h.page.click('.ht-bar [data-hs-act="details"]').catch(() => null);
        await h.page.waitForTimeout(300);
      }
      await h.page.click('.hb-slot[data-slot="2"]');
      await h.page.waitForTimeout(500);
      await shot(h.page, 'configure-open-' + tag);
    }
    await h.ctx.close();
    if (vp.width === 922) {
      const l = await open(vp, HUNT, (env) => {
        env.hunt.session = Object.assign({}, env.hunt.session, { id: env.hunt.session_id, leave_at: new Date(env.hunt_server_now_ms + 45000).toISOString(), phase: 'leaving' });
      });
      if (l.up) await shot(l.page, 'hunt-leaving-' + tag);
      await l.ctx.close();
    }
    const t = await open(vp, ALPHA, longBag);
    if (t.up) {
      for (const [key, id] of [['v', 'shop'], ['escape', 'settings']]) {
        if (await openKey(t.page, key === 'escape' ? 'Escape' : key, id)) {
          if (id === 'settings') { await t.page.click('.st-tab[data-cat="interface"]').catch(() => null); }
          await t.page.waitForTimeout(300);
          await shot(t.page, id + '-' + tag);
        }
      }
      if (await openKey(t.page, 'b', 'inventory')) {
        await t.page.click('.hw-pocket[data-item="iron_helm"]').catch(() => null);
        await t.page.hover('.hw-pocket[data-item="iron_helm"]').catch(() => null);
        await t.page.waitForTimeout(300);
        await shot(t.page, 'inventory-tip-' + tag);
        if (phone && vp.width !== 844) {
          await t.page.mouse.move(2, 200);
          await t.page.waitForTimeout(250);
          await shot(t.page, 'inventory-equip-' + tag);
        }
      }
    }
    await t.ctx.close();
  }
}

/* The pages each rule reads: a mutant named for a rule runs those alone, or the pages its own fifth field names
   (PH-5's hunt bar and analyzer tabs are measured on the hunt pages, its Shop, tooltip and Equip in town). */
const BLOCKS_OF = Object.freeze({ 'PH-1': ['configure'], 'PH-2': ['hunt'], 'PH-3': ['portrait'], 'PH-4': ['town'], 'PH-5': ['town'], 'PH-6': ['coach'], 'PH-7': ['bar'], 'PH-8': ['desk'], 'PH-9': ['stamina'], 'PH-10': ['fight'], 'PH-11': ['strip'], 'PH-12': ['strip'], 'PH-13': ['slots'], 'PH-14': ['meaning'], 'PH-15': ['stack'], 'PH-16': ['waits'], 'PH-17': ['door'], 'PH-18': ['coachsheet'], 'PH-19': ['apart'], 'PH-20': ['partyacts'], 'PH-21': ['tapped'], 'PH-22': ['doors'], 'PH-23': ['market'], 'PH-24': ['partyphone'], 'PH-25': ['ground'], 'PH-26': ['details'], 'PH-27': ['cards', 'coach'], 'PH-28': ['doors'], 'PH-29': ['partyfold'], 'PH-30': ['bar'], 'PH-31': ['doors'], 'PH-32': ['hall'], 'PH-33': ['barsheet'], 'PH-34': ['huntlist'] });
/* Each planted defect undoes one fix; each must turn a rule red. */
const MUTANTS = [
  ['PH-1 the configure sheet\'s list does not scroll', 'src/styles/hunt.css', '  .hs-win[data-hs-win="configure-action"] .ca-mid {', '  .hs-win[data-hs-win="configure-action"] .ca-mid-x {'],
  ['PH-1 the configure sheet is the window\'s 800 px on a 667 px screen', 'src/styles/hunt.css', 'width: 100%; min-width: 100%; max-width: 100%;', 'width: 100vw; min-width: 100%; max-width: none;'],
  ['PH-1 the screen widgets widen the page', 'src/styles/shell.css', '.hs-screen { z-index: 6; overflow: clip; }', '.hs-screen { z-index: 6; }'],
  ['PH-1 a new tab opens mid-list', 'src/shell/windows/configure-action.js', "v.hover = null; repaint(); listToTop(body); return; }", "v.hover = null; repaint(); return; }"],
  ['PH-1 the column heads hide the wrong cell', 'src/styles/hunt.css', '  .ca-head .ca-c[data-c="1"], .ca-row .ca-c[data-c="1"] { display: none; }', '  .ca-head .ca-c:nth-of-type(2), .ca-row .ca-c[data-c="1"] { display: none; }'],
  /* UI audit 2026-11-18: the list's height, a head four lines tall, the rune column, a lock with no requirement */
  ['PH-1 the phone sentence stands its condition on a line of its own', 'src/styles/hunt.css', '  .ca-conds { display: contents; }\n', ''],
  ['PH-1 the run\'s name takes a line over its heads again', 'src/shell/windows/configure-action.js', "(run.label ? ' aria-label=\"' + esc(run.label) + '\"' : '') + '>'", "'>' + (run.label ? '<h3 class=\"ca-run-label\">' + esc(run.label) + '</h3>' : '')"],
  ['PH-1 a column head says cheapest first on four lines', 'src/data/text/bar.js', "  col_per_mana: 'g per mana',", "  col_per_mana: 'g per mana, cheapest first',"],
  ['PH-1 the rune column wraps beside an empty third of the window', 'src/styles/hunt.css', 'minmax(0, 1fr) 44px 76px 140px;', 'minmax(0, 1fr) 44px 76px 60px;'],
  ['PH-1 a locked row says nothing of what it needs', 'src/shell/windows/configure-action.js', "  text(el.querySelector('.ca-need-t'), r.locked ? r.need || '' : '');", "  text(el.querySelector('.ca-need-t'), '');"],
  ['PH-1 a spell under its level reads open', 'src/shell/action-facts.js', '    return have !== null && have < r.unlock ? level(abilitySkill(r), r.unlock) : null;', '    return null;'],
  ['PH-1 the level wait ignores the server\'s skills', 'src/shell/action-facts.js', '(skills[abilitySkill(r)] || { level: 1 }).level : null);', '1 : null);'],
  ['PH-2 Hunt details only shows', 'src/shell/widgets/hunt-topbar.js', "    if (analyzerOpen(ctx)) { hud.setVisible('analyzer', false); return; }", "    if (analyzerOpen(ctx)) return;"],
  ['PH-2 the analyzer has no close', 'src/shell/widgets/analyzer.js', "  if (action === 'hide') { ctx.hud.setVisible('analyzer', false); return; }", ''],
  ['PH-2 the analyzer sits over the hunt bar', 'src/data/hud-widgets.js', "    below: Object.freeze(['hunt-topbar']),\n", ''],
  ['PH-2 the phone hunt bar is as wide as the ground\'s name', 'src/styles/hunt.css', '  .ht-bar { flex-wrap: nowrap; width: auto; justify-content: flex-end; }', '  .ht-bar { flex-wrap: nowrap; width: fit-content; }'],
  ['PH-2 the phone analyzer keeps its floor over the town', 'src/shell/shell.js', "phoneMq.matches ? 'min(' + floor + ', var(--hs-room, ' + floor + '))' : floor", 'floor'],
  ['PH-2 a party of two runs under the action bar', 'src/styles/hunt.css', '  .hp-party { max-height: calc(100vh - 160px); }', ''],
  ['PH-2 the leaving hunt bar keeps every word', 'src/styles/hunt.css', '  .ht-bar:has(.ht-leaving:not([hidden])) .is-leave { display: none; }', ''],
  ['PH-3 no turn-sideways card', 'src/styles/app.css', '  .turn-phone { display: flex; }', '  .turn-phone { display: none; }'],
  ['PH-3 the turn-sideways card on every small screen', 'src/styles/app.css', '@media (orientation: portrait) and (max-width: 600px) and (hover: none) and (pointer: coarse) {', '@media (max-width: 540px), (max-height: 540px) and (max-width: 1024px) {'],
  ['PH-4 the words are not the toggle\'s label', 'src/shell/windows/settings.js', "? '<label class=\"st-line\">'", "? '<div class=\"st-line\">'"],
  ['PH-4 the slider is its 14 px track', 'src/styles/hunt.css', '  .st-row input[type="range"] { height: var(--tap);', '  .st-row input[type="range"] { height: 14px;'],
  ['PH-5 the Shop\'s Buy is 30 px', 'src/styles/windows.css', '  .hs-win .hh-tool, .hs-win .hh-select,', '  .hs-win .hh-select,'],
  ['PH-5 the tooltip runs off a short screen', 'src/styles/windows.css', '  .hw-tip { width: 460px; columns: 2;', '  .hw-tip { width: 240px; columns: 1;'],
  ['PH-5 the picked item scrolls away', 'src/styles/windows.css', '  .hw-pick.is-on { position: sticky;', '  .hw-pick.is-on { position: static;'],
  ['PH-5 the analyzer tabs are 30 px', 'src/styles/hunt.css', '  .ha-tab, .ht-bar .hh-tool { min-height: 40px; }', '  .ha-tab, .ht-bar .hh-tool { min-height: 30px; }', ['hunt']],
  /* the card's cap is the fallback where round() or lh is missing (the words' box is the tighter cap in Chromium): undo both */
  ['PH-6 nothing caps the phone coach', 'src/styles/shell.css', '{ max-height: calc(var(--coach-room) - 20px); }\n  .hs-pointer:not(.is-min) > .hs-coach-text {\n    grid-area: 2 / 1 / 3 / -1; padding-right: 14px;\n    min-height: 0; max-height: calc(round(down, var(--coach-room) - 76px - var(--coach-foot) - .5lh, 1lh) + .5lh);',
    '{ }\n  .hs-pointer:not(.is-min) > .hs-coach-text {\n    grid-area: 2 / 1 / 3 / -1; padding-right: 14px;\n    min-height: 0;'],
  ['PH-6 the coach\'s room is never measured', 'src/shell/shell.js', '    publishInset();\n    roomForCoach();\n', '    publishInset();\n'],
  /* re-anchored 10-25 (lane/b-widget-move-fold): the coach's own thin scrollbar left for the game's one scrollbar (app.css) */
  ['PH-6 the coach\'s words take no thumb', 'src/styles/shell.css', '    pointer-events: auto;', ''],
  ['PH-6 the coach\'s words end on a whole line', 'src/styles/shell.css', 'max-height: calc(round(down, var(--coach-room) - 76px - var(--coach-foot) - .5lh, 1lh) + .5lh);', ''],
  ['PH-6 the whole card scrolls, its fold with it', 'src/styles/shell.css', '{ max-height: calc(var(--coach-room) - 20px); }\n  .hs-pointer:not(.is-min) > .hs-coach-text {\n    grid-area: 2 / 1 / 3 / -1; padding-right: 14px;\n    min-height: 0; max-height: calc(round(down, var(--coach-room) - 76px - var(--coach-foot) - .5lh, 1lh) + .5lh); overflow-y: auto; overscroll-behavior: contain;', '{ max-height: calc(var(--coach-room) - 20px); overflow-y: auto; pointer-events: auto; }\n  .hs-pointer:not(.is-min) > .hs-coach-text {\n    grid-area: 2 / 1 / 3 / -1; padding-right: 14px;\n    min-height: 0;'],
  ['PH-7 the slots never give way, so the panel runs off a small phone', 'src/styles/hunt.css', '  .hb-grid { order: 1; display: flex; gap: 2px; min-width: 0; overflow-x: auto;', '  .hb-grid { order: 1; display: flex; gap: 2px; min-width: max-content; overflow-x: visible;'],
  ['PH-7 the phone stance folds away', 'src/styles/hunt.css', '  .hb-pl-row.is-stance { grid-area: stance; min-height: 0; }', '  .hb-pl-row.is-stance { display: none; }'],
  ['PH-7 the stamina + takes no press', 'src/styles/hunt.css', '.hb-stam-buy { position: relative; width: 36px;', '.hb-stam-buy { pointer-events: none; position: relative; width: 36px;'],
  ['PH-7 the phone ring carries the desktop words', 'src/styles/hunt.css', '  .hb-lv-k, .hb-xp-k { display: none; }', '  .hb-lv-k, .hb-xp-k { }'],
  ['PH-8 the slot icons stay x1 on a desktop', 'src/styles/hunt.css', '.hb-slot .hh-icon, .hb-socket-ico .hh-icon { width: round(down, 100% - 4px, var(--icon-step)); height: round(down, 100% - 4px, var(--icon-step)); }', '.hb-slot .hh-icon, .hb-socket-ico .hh-icon { width: 32px; height: 32px; }'],
  ['PH-8 the ring is the pixel medallion again', 'src/styles/hunt.css', '.hb-medal { grid-area: medal; align-self: start; position: relative; width: 120px; height: 120px; }', '.hb-medal { grid-area: medal; align-self: start; position: relative; width: 120px; height: 120px; background: url(../../assets/ui/bar-medal.png) center / 100% 100% no-repeat; }'],
  ['PH-8 the ring words run onto the ring', 'src/styles/hunt.css', 'justify-content: center; gap: 1px; line-height: 1;', 'justify-content: center; gap: 12px; line-height: 1;'],
  ['PH-8 the stance folds away on a desktop', 'src/styles/hunt.css', '.hb-stance { display: flex; width: 100%; }', '.hb-stance { display: none; width: 100%; }'],
  ['PH-9 the refill sends a price of its own', 'src/shell/widgets/stamina-buy.js', 'cs.buyStamina(q.price)', 'cs.buyStamina(q.price + 1)'],
  ['PH-9 the premium note shows to premium heroes too', 'src/shell/widgets/stamina-buy.js', "cls(box.querySelector('.hb-buy-premium'), 'is-on', !isPremium(cs));", "cls(box.querySelector('.hb-buy-premium'), 'is-on', true);"],
  ['PH-9 a refused refill loses its words', 'src/shell/widgets/stamina-buy.js', "s.msg = r.ok ? t('hud.stam_done') : refusalWords(r.error);", "s.msg = r.ok ? t('hud.stam_done') : '';"],
  ['PH-9 Buy stays on when a refill cannot be bought', 'src/shell/widgets/stamina-buy.js', "prop(go, 'disabled', !!why || s.pending);", "prop(go, 'disabled', s.pending);"],
  ['PH-9 Buy stays on while the refill is in flight', 'src/shell/widgets/stamina-buy.js', "prop(go, 'disabled', !!why || s.pending);", "prop(go, 'disabled', !!why);"],
  ['PH-9 the stamina panel is wider than a phone', 'src/styles/hunt.css', '.hb-buy { display: none; position: absolute; bottom: calc(100% + 6px); width: 280px;', '.hb-buy { display: none; position: absolute; bottom: calc(100% + 6px); width: 900px;'],
  ['PH-10 the phone card hangs at the hunt bar\'s left end, over the hero', 'src/styles/shell.css', '  .hs-widget.is-hunt-topbar > .hs-pointer { left: auto; right: 0; }\n', ''],
  ['PH-10 the camera frames the fight under the card', 'src/shell/shell.js', '    if (card) widgets.push({ anchor: side(card), rect: rel(card) });\n', ''],
  ['PH-11 the tabs squash to a sliver', 'src/styles/app.css', '  @container char-strip (max-width: 150px) { .char-tabs { display: none; } }\n', '  .char-tab { min-width: 0; width: 12px; padding: 0; }\n'],
  ['PH-11 the three words stay in the strip', 'src/styles/app.css', '  .char-tool:not(.is-all), .char-tool-wide { display: none; }', '  .char-tool-wide { display: none; }'],
  ['PH-11 the sheet names no icons', 'src/shell/windows/characters.js', '    + iconListHtml(ctx)\n', ''],
  ['PH-11 the sheet names only the row\'s own icons, none of a group\'s', 'src/shell/windows/characters.js', "  + iconNames(ctx, iconRows(ctx)) + '</ul></div>';", "  + iconNames(ctx, iconRows(ctx).filter((r) => !r.group)) + '</ul></div>';"],
  ['PH-11 no way to sign out on a phone', 'src/shell/windows/characters.js', '    + ACCOUNT_HTML\n', ''],
  ['PH-11 the phone\'s routes show on a desktop', 'src/styles/windows.css', '.hw-phone-only, .hw-char-invite { display: none; }', '.hw-phone-only { display: block; } .hw-char-invite { display: none; }'],
  ['PH-12 no Invite on the other hero', 'src/shell/windows/characters.js', "prop(inv, 'hidden', !can);", "prop(inv, 'hidden', true);"],
  ['PH-12 the sheet still says right-click', 'src/shell/windows/characters.js', "(ctx.isPhone && ctx.isPhone() ? t('heroes.parties_how_phone')", "(false ? t('heroes.parties_how_phone')"],
  ['PH-13 no page press', 'src/shell/widgets/action-bar.js', "    prop(press, 'hidden', !over);\n", ''],
  ['PH-13 the page press goes nowhere', 'src/shell/widgets/action-bar.js', "  grid.scrollLeft = atEnd(grid) ? 0 : grid.scrollWidth;\n", ''],
  ['PH-13 the chat\'s box starts below the screen', 'src/styles/hunt.css', '  .hs-win[data-hs-win="chat"] .hc-chat { flex: 1; min-height: 0; }\n', '  .hs-win[data-hs-win="chat"] .hc-chat { min-height: 520px; }\n'],
  ['PH-13 the icon\'s tooltip stays on a tapped sheet', 'src/styles/shell.css', '  .hs-win-head .hs-key, .hs-launch::before { display: none; }\n', '  .hs-win-head .hs-key { display: none; }\n'],
  ['PH-14 a held icon says nothing', 'src/shell/launcher-names.js', 'swallow = true; show(icon); }', 'swallow = true; }'],
  ['PH-14 letting go of a held icon opens it', 'src/shell/launcher-names.js', "function onClick(e) { if (swallow && ", "function onClick(e) { if (false && "],
  ['PH-14 the key chips stay on touch', 'src/styles/shell.css', ':root.is-touch .hs-win-head .hs-key, :root.is-touch :is(.hs-launch, .hs-keytip)::before { display: none; }', ':root.is-touch :is(.hs-launch, .hs-keytip)::before { display: none; }'],
  ['PH-14 a grey button says nothing', 'src/shell/off-why.js', "if (words) show(b, words); else hide();", "hide();"],
  ['PH-14 a slot\'s sheet does not say why', 'src/shell/windows/configure-action.js', "text(root.querySelector('.ca-why'), fireWhy ? fireWhy.text : '');", ''],
  ['PH-14 her board does not say why while it is loaded', 'src/shell/windows/tally.js', "const why = !sc.board ? '' : hunting ? t('tally.board_hunting') : takeWhyOf(tally, hunting, suggest);", "const why = !sc.board ? '' : takeWhyOf(tally, hunting, suggest);"],
  ['PH-15 a sliver of card stays under a tall alert', 'src/styles/shell.css', '  .hs-widget.is-no-room > .hs-pointer { display: none; }\n', ''],
  ['PH-6 a press on a folded card\'s tab opens nothing on a return', 'src/shell/launcher.js', '  if (r && r.seen === card.id && r.min !== true) return false;\n', ''],
  ['PH-15 every alert stacks on a phone', 'src/styles/windows.css', '  .hw-alert-list > .hw-alert:not(:first-child) { display: none; }\n', ''],
  ['PH-15 the alert is see-through', 'src/styles/windows.css', 'padding: 0 0 0 10px; background: var(--bg-2); }', 'padding: 0 0 0 10px; }'],
  ['PH-15 nothing counts the alerts behind', 'src/styles/windows.css', '  .hw-alerts-more:not(:empty) { display: block; }\n', ''],
  ['PH-15 the card runs under the alert', 'src/shell/shell.js', "const shared = alert && (w.matches('.is-hunt-topbar') || beside) ? at.top - 8 : floor;", 'const shared = floor;'],
  ['PH-15 the town\'s card hangs on the hero', 'src/styles/shell.css', '  .hs-launchers > .hs-pointer { left: auto; right: calc(100vw - 268px); }\n', ''],
  ['PH-16 the world waits in silence', 'src/app/world-pane.js', 'statusEl.textContent = loadingWords(connection.state(), Date.now() - waitFrom, firstWords);', 'statusEl.textContent = firstWords;'],
  ['PH-16 no connection line', 'src/app/boot.js', 'mountConnectionLine(doc), ', ''],
  ['PH-16 the connection line never clears', 'src/net/connection.js', "    line.hidden = s === 'ok';\n", '    if (s !== \'ok\') line.hidden = false;\n'],
  ['PH-16 a leave with no answer stays on "Leaving"', 'src/shell/widgets/hunt-topbar.js', "return t(waitedMs >= WAIT_WORDS_MS ? LEAVE_WAIT.slow : LEAVING", "return t(LEAVING"],
  ['PH-16 a leave does not know the connection went', 'src/shell/widgets/hunt-topbar.js', "  if (state === 'lost') return t(LEAVE_WAIT.lost);\n", ''],
  ['PH-16 a counting leave does not say why', 'src/shell/widgets/hunt-topbar.js', "prop(el.querySelector('.ht-why'), 'hidden', over || !cd || cd.phase !== 'counting');", ''],
  ['PH-17 the email box throws the keyboard up', 'src/app/sign-in.js', "if (!win || !win.matchMedia('(pointer: coarse), ' + MOBILE_QUERY).matches) input.focus();", 'input.focus();'],
  ['PH-17 a desktop loses its focus', 'src/app/sign-in.js', "if (!win || !win.matchMedia('(pointer: coarse), ' + MOBILE_QUERY).matches) input.focus();", 'void win;'],
  ['PH-17 the links are 24 px', 'src/styles/app.css', '  .auth-link { min-height: var(--tap); padding: 0 8px; }\n', ''],
  ['PH-18 a card stands in the sheet again', 'src/styles/shell.css', '  .hs-win:not(.is-modal) > .hs-win-coach > .hs-pointer { position: absolute; margin: 0; top: 50px; left: calc(min(400px, 48vw) + 5px - 100vw); }\n', ''],
  ['PH-18 the note stands over the ground the card names', 'src/styles/shell.css', '  [data-hs-win="hunts"]:has(.hs-win-coach .hs-pointer) .hw-hunts-now { display: none; }\n', '  [data-hs-win="hunts"]:has(.hs-win-coach .hs-pointer) .hw-hunts-now { min-height: 120px; }\n'],
  ['PH-18 Got it chains the next card open', 'src/shell/launcher.js', 'min = folded.min || !!rest || (!!inWin && RESTED.get(cs) === coachWindow(card));', 'min = folded.min || !!rest;'],
  ['PH-18 the coach foot shares the title row again', 'src/styles/shell.css', '  :is(.hs-launchers, .hs-win-coach, .hs-widget.is-hunt-topbar) > .hs-pointer:not(.is-min) > .hs-coach-foot { grid-area: 3 / 1 / 4 / 3; margin: 0; white-space: normal; }\n  :is(.hs-launchers, .hs-win-coach, .hs-widget.is-hunt-topbar) > .hs-pointer:not(.is-min) > .hs-coach-foot > :is(.hs-coach-got, .hs-coach-off) { min-height: 40px; }\n  :is(.hs-launchers, .hs-win-coach, .hs-widget.is-hunt-topbar) > .hs-pointer:not(.is-min):has(> .hs-coach-foot) > .hs-coach-min { grid-area: 3 / 3; }\n  :is(.hs-launchers, .hs-win-coach, .hs-widget.is-hunt-topbar) > .hs-pointer:not(.is-min):has(> .hs-coach-foot) > b { grid-area: 1 / 1 / 2 / -1; padding-right: 8px; line-height: 1.05; }\n', ''],
  ['PH-18 the next card\'s tab opens nothing', 'src/shell/launcher.js', "  if (action === 'coach-open') RESTED.delete(cs);\n", ''],
  ['PH-19 Summary and Leave stay 7 px apart', 'src/styles/hunt.css', '  .ht-bar [data-hs-act="leave"] { margin-left: 10px; }\n', ''],
  ['PH-19 the folded card lies on the Details close', 'src/styles/hunt.css', '.app:has(.hs-widget.is-analyzer) .hs-widget.is-hunt-topbar > .hs-pointer { display: none; }', '.app:has(.hs-widget.is-analyzer) .hs-widget.is-hunt-topbar > .hs-pointer:not(.is-min) { display: none; }'],
  ['PH-20 the party\'s presses run off the sheet', 'src/styles/windows.css', '  .hw-party-acts { flex-wrap: wrap; }\n', '  .hw-party-acts { flex-wrap: nowrap; min-width: 460px; }\n'],
  ['PH-20 Disband goes on one tap', 'src/shell/widgets/party-panel.js', '    if (!sc.disbandArmed) {', 'if (false) {'],
  ['PH-21 a tip for an item nobody pressed', 'src/shell/windows/item-tip.js', '  if (touch && !(pressed && anchor.contains(pressed))) return;\n', ''],
  ['PH-21 the tip lies on the sheet', 'src/shell/windows/item-tip.js', "const r = ((touch && anchor.closest('.hs-win')) || anchor).getBoundingClientRect();", 'const r = anchor.getBoundingClientRect();'],
  ['PH-21 a mouseout puts the tip away', 'src/shell/windows/item-tip.js', '  if (touching(doc) && !byPress) return;\n', ''],
  ['PH-22 Back to sign in falls off the screen', 'src/styles/app.css', '  .auth-card[data-auth="create"] { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px 10px; }\n', ''],
  ['PH-22 How you fight loses its height', 'src/styles/app.css', 'overflow-y: auto; overscroll-behavior: contain; }\n  .auth-card.is-create .auth-message:empty', 'overflow-y: auto; overscroll-behavior: contain; max-height: 120px; }\n  .auth-card.is-create .auth-message:empty'],
  ['PH-23 Refresh is cut in half', 'src/styles/market.css', '  .hw-mk-refresh { position: absolute; top: calc(100% + 6px); left: 0; margin: 0; }\n', ''],
  ['PH-23 Refresh lies on Browse', 'src/styles/market.css', '  .hw-mk-refresh { position: absolute; top: calc(100% + 6px); left: 0; margin: 0; }\n', '  .hw-mk-refresh { position: absolute; top: 0; left: 0; margin: 0; }\n'],
  ['PH-23 the sell sheet keeps its purse and tabs', 'src/styles/market.css', '  .hw-mk:has(.hw-mk-sell.is-on.is-paged) > :is(.hw-mk-greet, .hw-tabs) { display: none; }\n', ''],
  ['PH-23 what it would fetch comes first', 'src/styles/market.css', '  .hw-mk-sell .hw-mk-facts { order: 1; }\n', '  .hw-mk-sell .hw-mk-facts { order: -1; min-height: 80px; }\n'],
  ['PH-23 Sort is cut at the sheet\'s edge', 'src/styles/windows.css', '  .hw-find .hw-search { flex: 1 1 0; min-width: 0; }\n', '  .hw-find .hw-search { flex: none; width: 260px; }\n'],
  ['PH-24 the menu\'s Invite is silent until the answer', 'src/shell/context-menu.js', "        say('Sending…');\n", ''],
  ['PH-24 no invite in the Party window','src/shell/windows/party.js', "cls(root.querySelector('.hw-invite-name'), 'is-on', true);", ''],
  ['PH-24 the inviter is told nothing', 'src/shell/windows/party.js', "() => { box.value = ''; return 'Invite sent to ' + name + '.'; }", "() => { box.value = ''; return ''; }"],
  ['PH-24 no toast beside a sheet', 'src/styles/hunt.css', '  :root:has(.hs-win:not(.is-modal):not(.is-leaving)) .hs-widget.is-alerts { transform: translateX(calc(-1 * min(400px, 48vw) - 8px)); }\n', ''],
  ['PH-24 the red count says nothing', 'src/shell/windows/characters.js', "text(li.querySelector('.hw-char-waits'), wait ? wait.text : '');", ''],
  ['PH-24 Expand below the Storage fold on a phone', 'src/styles/windows.css', '  .hw-store > .hw-store-baghead, .hw-store > .hw-store-grow { order: -1; }\n', ''],
  ['PH-24 Storage tells a thumb to shift-press', 'src/shell/windows/storage.js', "(ctx.isPhone && ctx.isPhone() ? t('bag.store_help_touch') : ", '(false ? "" : '],
  ['PH-24 the sheet\'s presses stay 30 px', 'src/styles/windows.css', '  .hs-win .hh-tool, .hs-win .hh-select, .hs-win .hh-seg, .hs-win .hh-num, .hs-win .hw-search, .hs-win .hf-name, .hs-win .st-search, .hs-win .hs-close { min-height: 40px; }\n', ''],
  ['PH-24 the town card lies over the invite beside a sheet', 'src/shell/shell.js', "(w.matches('.is-hunt-topbar') || beside) ? at.top - 8", "w.matches('.is-hunt-topbar') ? at.top - 8"],
  ["PH-24 a window card's foot stays 24 px", 'src/styles/shell.css', '> .hs-coach-foot > :is(.hs-coach-got, .hs-coach-off) { min-height: 40px; }', '> .hs-coach-foot > :is(.hs-coach-got, .hs-coach-off) { min-height: 24px; }'],
  ['PH-25 a ground\'s page keeps its frame and padding', 'src/styles/windows.css', '  [data-hs-win="hunts"]:has(.is-paged) .hs-win-body { padding: 0; }\n', '  [data-hs-win="hunts"]:has(.is-paged) .hw-hd-page { max-height: 104px; }\n'],
  ['PH-25 the sheet starts under the place\'s row', 'src/styles/shell.css', '  #panel-world:not([data-scene="hunt"]) .hs-win:not(.is-modal) { top: calc(-1 * (var(--tap) + 6px)); }\n', ''],
  ['PH-25 the stage still clips the sheet\'s head', 'src/styles/shell.css', '  #panel-world:not([data-scene="hunt"]):has(.hs-win:not(.is-modal)) .world-stage { overflow: visible; }\n', ''],
  ['PH-25 a ground\'s page has no way back in the sheet\'s head','src/shell/windows/hunts.js', "renderHunts.inner = (ctx, body) => (ctx.isPhone() && body.querySelector('.is-paged') ? 'back' : null);", 'renderHunts.inner = () => null;'],
  ['PH-25 the line beside Enter stands in a column', 'src/styles/windows.css', ".hw-hd-foot .hh-intent-msg:not(:empty), .hw-hd-foot .hw-enter-why:not(:empty) { flex: 1 0 100%; }", ".hw-hd-foot .hh-intent-msg:not(:empty) { flex: 1 0 100%; }"],
  ['PH-25 mid-hunt the way back is off', 'src/shell/window-head.js', "  attr(back, 'hidden', !(inner || to));", "  attr(back, 'hidden', true);"],
  ['PH-26 the switch\'s span widens the fold and the close', 'src/styles/hunt.css', '  .ha-analyzer .ha-scope { grid-area: 2 / 1 / 3 / -1; justify-self: end; margin-bottom: 0; }\n', '  .ha-analyzer .ha-scope { grid-area: 2 / 2 / 3 / 4; justify-self: end; margin-bottom: 0; }\n'],
  ['PH-26 the panel is too narrow for its tabs', 'src/styles/hunt.css', 'column-gap: 2px; width: min(376px, calc(100vw - 232px));', 'column-gap: 2px; width: 300px;'],
  ['PH-26 a hero alone keeps the switch', 'src/styles/hunt.css', '  .ha-analyzer.is-alone .ha-scope { display: none; }\n', ''],
  ['PH-26 a party loses the switch', 'src/shell/widgets/analyzer.js', "cls(panel, 'is-alone', !crew || crew.members.length < 2);", "cls(panel, 'is-alone', true);"],
  ['PH-27 the presses keep a column down the card', 'src/styles/shell.css', '  .hs-pointer:not(.is-min) > .hs-coach-min { position: static; grid-area: 1 / 3; width: 40px; height: 40px; }\n', '  .hs-pointer:not(.is-min) > .hs-coach-min { position: absolute; top: 0; right: 0; width: 44px; height: 44px; }\n  .hs-pointer:not(.is-min) { padding-right: 48px !important; }\n'],
  ['PH-27 the town\'s card stays narrow', 'src/styles/shell.css', '{ width: min(340px, calc(50vw - 56px)); right: calc(100vw - 8px - min(340px, calc(50vw - 56px))); }', '{ width: 200px; }'],
  ['PH-27 a wrapped title leaves its last word alone', 'src/render/format.js', '.split(/ +/).length >= 3 ? t.replace(', '.split(/ +/).length >= 99 ? t.replace('],
  ['PH-27 the open card draws its title unglued', 'src/shell/launcher.js', "'<b>' + esc(keepLastWords(card.title)) + '</b>", "'<b>' + esc(card.title) + '</b>"],
  ['PH-27 the words under the hunt bar set at 1.3','src/styles/shell.css', '  .hs-widget.is-hunt-topbar > .hs-pointer:not(.is-min):has(> .hs-coach-foot) > .hs-coach-text { line-height: 1.25; }\n', ''],
  ['PH-27 the card under the hunt bar keeps its presses on the title\'s row', 'src/styles/shell.css', '  :is(.hs-launchers, .hs-win-coach, .hs-widget.is-hunt-topbar) > .hs-pointer:not(.is-min):has(> .hs-coach-foot) { padding: 0 0 0 12px; }\n  :is(.hs-launchers, .hs-win-coach, .hs-widget.is-hunt-topbar) > .hs-pointer:not(.is-min) > .hs-coach-foot { grid-area: 3 / 1 / 4 / 3; margin: 0; white-space: normal; }\n  :is(.hs-launchers, .hs-win-coach, .hs-widget.is-hunt-topbar) > .hs-pointer:not(.is-min) > .hs-coach-foot > :is(.hs-coach-got, .hs-coach-off) { min-height: 40px; }\n  :is(.hs-launchers, .hs-win-coach, .hs-widget.is-hunt-topbar) > .hs-pointer:not(.is-min):has(> .hs-coach-foot) > .hs-coach-min { grid-area: 3 / 3; }\n  :is(.hs-launchers, .hs-win-coach, .hs-widget.is-hunt-topbar) > .hs-pointer:not(.is-min):has(> .hs-coach-foot) > b { grid-area: 1 / 1 / 2 / -1; padding-right: 8px; line-height: 1.05; }\n', '  :is(.hs-launchers, .hs-win-coach) > .hs-pointer:not(.is-min):has(> .hs-coach-foot) { padding: 0 0 0 12px; }\n  :is(.hs-launchers, .hs-win-coach) > .hs-pointer:not(.is-min) > .hs-coach-foot { grid-area: 3 / 1 / 4 / 3; margin: 0; white-space: normal; }\n  :is(.hs-launchers, .hs-win-coach) > .hs-pointer:not(.is-min) > .hs-coach-foot > :is(.hs-coach-got, .hs-coach-off) { min-height: 40px; }\n  :is(.hs-launchers, .hs-win-coach) > .hs-pointer:not(.is-min):has(> .hs-coach-foot) > .hs-coach-min { grid-area: 3 / 3; }\n  :is(.hs-launchers, .hs-win-coach) > .hs-pointer:not(.is-min):has(> .hs-coach-foot) > b { grid-area: 1 / 1 / 2 / -1; padding-right: 8px; line-height: 1.05; }\n'],
  ['PH-27 the card under the hunt bar stays narrow', 'src/styles/shell.css', '  .hs-widget.is-hunt-topbar > .hs-pointer:not(.is-min) { width: min(320px, 100%); }\n', '  .hs-widget.is-hunt-topbar > .hs-pointer:not(.is-min) { width: min(200px, 100%); }\n'],
  ['PH-27 no tip says the words go on', 'src/styles/shell.css', 'linear-gradient(to bottom left, var(--gold-2) 50%, transparent 50%) no-repeat right 7px bottom 2px / 5px 6px,\n      linear-gradient(to bottom right, var(--gold-2) 50%, transparent 50%) no-repeat right 2px bottom 2px / 5px 6px;', 'none;'],
  ['PH-7 the ring\'s XP grows past the disc', 'src/styles/hunt.css', '  .hb-xp { font-size-adjust: var(--f-ui-aspect); }\n', '  .hb-xp { font-size-adjust: .7; }\n'],
  ['PH-26 a wide font pans the tabs', 'src/styles/hunt.css', '  .ha-analyzer .ha-tabs .ha-tab { font-size-adjust: var(--f-ui-aspect); }\n', ''],
  ['PH-27 a wide font cuts a card', 'src/styles/shell.css', '  .hs-pointer:not(.is-min) > .hs-coach-text { font-size-adjust: var(--f-ui-aspect); }\n', ''],
  ['PH-28 a wide font cuts How you fight', 'src/styles/app.css', '  .hero-how-lead, .hero-how-list { font-size-adjust: var(--f-ui-aspect); }\n', ''],
  ['PH-27 the tip never goes', 'src/styles/shell.css', "  .hs-pointer:not(.is-min) > .hs-coach-text::after { content: ''; display: block; height: 1lh; margin: -1lh -14px 0 0; background: var(--bg-2); }\n", ''],
  ['PH-28 the lead stays in the column', 'src/styles/app.css', '  .hero-how-lead { position: absolute; left: 0; top: 42px; width: 200px; margin: 0; line-height: 1.3; }\n', ''],
  ['PH-28 the longer lead runs past the step', 'src/styles/app.css', '  .hero-how-lead { position: absolute; left: 0; top: 42px; width: 200px;', '  .hero-how-lead { position: absolute; left: 0; top: 66px; width: 150px;'],
  ['PH-28 the name\'s label stands over its field', 'src/styles/app.css', '  .hero-form .auth-field { flex-direction: row; align-items: center; gap: 8px; }\n', ''],
  ['PH-28 a refusal pushes Enter town off the screen', 'src/styles/app.css', '  .auth-card.is-create:has(.auth-message:not(:empty)) .hero-body { height: min(calc(100vh - 176px), 246px); }\n', ''],
  ['PH-28 nothing says the column runs on', 'src/app/hero-create.js', '    if (more.hidden !== hide) more.hidden = hide;\n', ''],
  ['PH-29 a hero alone keeps the panel open', 'src/data/hud-widgets.js', "phone: Object.freeze({ dx: 4, dy: 4, folded: 'alone' }),", 'phone: Object.freeze({ dx: 4, dy: 4 }),'],
  ['PH-29 a party\'s panel folds as well', 'src/shell/shell-hud.js', 'alone: () => heroIsAlone(opts.character),', 'alone: () => true,'],
  ['PH-29 a folded panel keeps its empty box', 'src/shell/shell.js', "el.style.setProperty('--hs-min-w', L.folded ? '' : row.min[0] + 'px');", "el.style.setProperty('--hs-min-w', row.min[0] + 'px');"],
  ['PH-29 a wide desktop folds a lone hero\'s panel', 'src/data/hud-widgets.js', "folded: 'narrow-alone',", "folded: 'alone',"],
  ['PH-30 More slots stays 24 px', 'src/styles/hunt.css', 'align-self: center; width: 36px; height: 74px;', 'align-self: center; width: 24px; height: 74px;'],
  ['PH-30 the setup\'s name stays a line of text', 'src/styles/hunt.css', '  .hb-set .hs-name { width: 100%; height: 100%; }\n', ''],
  ['PH-30 the name runs under its neighbour', 'src/styles/hunt.css', '  .hb-set { grid-area: set; align-self: stretch;', '  .hb-set { grid-area: set; align-self: stretch; min-width: 90px;'],
  ['PH-30 the name reads Pre...', 'src/styles/hunt.css', '  .hb-set .hs-name-t { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; white-space: normal; overflow-wrap: anywhere; }\n', ''],
  ['PH-32 the hall\'s door stands under what wins, a screen below its head', 'src/shell/windows/boss-hall-pane.js', '\'<p class="hw-call-line"></p><p class="hw-before-line is-short hw-hall-food" hidden></p>\'', '\'<p class="hw-call-line"></p><p class="hs-note hw-hall-bars" hidden></p><ul class="hw-before hw-hall-tips"></ul><p class="hw-before-line is-short hw-hall-food" hidden></p>\''],
  ['PH-31 the form\'s words stay after Create account', 'src/styles/app.css', '.auth-card.is-sent .auth-lead { display: none; }\n', ''],
  ['PH-6 the coach is capped on a desktop too', 'src/styles/shell.css', '.hs-launchers.is-coach-docked > .hs-pointer:not(.is-min) { display: flex; flex-direction: column; box-sizing: border-box; max-height: var(--coach-h); }', '.hs-launchers.is-coach-docked > .hs-pointer:not(.is-min) { display: flex; flex-direction: column; box-sizing: border-box; max-height: 200px; }'],
  ['PH-33 the bar keeps its full width beside a town sheet', 'src/styles/hunt.css', '  #panel-world:not([data-scene="hunt"]):has(.hs-win:not(.is-modal):not(.is-leaving)) .hb-bar { max-width: calc(100vw - min(400px, 48vw) - 40px); }\n', ''],
  ['PH-33 the hub and the fight panel stay beside a town sheet', 'src/styles/hunt.css', '  #panel-world:not([data-scene="hunt"]):has(.hs-win:not(.is-modal):not(.is-leaving)) :is(.hb-hub, .hb-plaque) { display: none; }\n', ''],
  ['PH-34 the phone list rests part-way into a line', 'src/styles/windows.css', '  .hw-hunt-list { flex: 1 1 auto; scroll-snap-type: y mandatory; }', '  .hw-hunt-list { flex: 1 1 auto; }'],
  ['PH-34 the phone lines keep the desktop\'s height', 'src/styles/windows.css', '  .hw-hunt-main { flex-direction: row; flex-wrap: wrap; align-items: baseline; gap: 0 8px; line-height: 1.15; }\n', ''],
  ['PH-33 the widget keeps its 320 px floor beside a sheet', 'src/styles/hunt.css', '  #panel-world:not([data-scene="hunt"]):has(.hs-win:not(.is-modal):not(.is-leaving)) .hs-widget.is-action-bar { min-width: 0; }\n', ''],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'phone-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  /* --only PH-n: that rule's pages alone (a fast loop on one rule; the gate runs them all). */
  const oi = process.argv.indexOf('--only');
  const blocks = oi > 0 ? BLOCKS_OF[process.argv[oi + 1]] : null;
  if (oi > 0 && !blocks) { console.log('phone-touch: --only takes one of ' + Object.keys(BLOCKS_OF).join(' ')); process.exit(2); }
  if (!process.argv.includes('--mutate')) {
    const fails = await rules(null, shots, { blocks });
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'phone-touch: ' + fails.length + ' rule(s) RED' : 'phone-touch: the configure sheet scrolls with Save in reach, Hunt details toggles and the analyzer closes clear of the hunt bar, portrait asks to turn, Settings and the bag answer a thumb, a long coach ends above the action bar and never lies on the fight, the phone bar keeps every fight control in reach, the desktop bar keeps its 64 px icons, the stamina + buys at the server\'s quote' + (shots ? ' (shots in ' + shots + ')' : ''));
    process.exit(fails.length ? 1 : 0);
  }
  /* --mutate --only PH-n: that rule's own mutants over its own pages (the gate runs them all). */
  /* A gated push proves only the mutants its diff touches (tools/lib/mutant-scope.mjs); the nightly proves them all. */
  const MINE = scopedMutants('tests/phone-touch.mjs', MUTANTS);
  if (!MINE.length) process.exit(0);
  const planted = oi > 0 ? MINE.filter(([name]) => name.split(' ')[0] === process.argv[oi + 1]) : MINE;
  const clean = await rules(null, null, { blocks });
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to, only] of planted) {
    const text = await readFile(join(ROOT, file), 'utf8');
    if (text.split(from).length !== 2) { console.log('  ✗ ' + name + ' — anchor not found once in ' + file); bad++; continue; }
    const fails = await rules({ [file]: text.replace(from, to) }, null, { stopAtFirst: true, blocks: only || BLOCKS_OF[name.split(' ')[0]] });
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ').slice(0, 2).join(' ') + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'phone-touch --mutate: ' + bad + ' escaped' : 'phone-touch --mutate: ' + planted.length + '/' + planted.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
