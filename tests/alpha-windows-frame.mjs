#!/usr/bin/env node
// mutant-rule-functions: checks
// mutant-runner-functions: main
// ════════════════════════════════════════════════════════════════════════
// tests/alpha-windows-frame.mjs — EVERY WINDOW OVER THE WORLD: KEYS, PRESSES, THE HEADER, FIT AND CLIPPING, IN A REAL CHROMIUM.
//
//   node tests/alpha-windows-frame.mjs                 the rules
//   node tests/alpha-windows-frame.mjs --mutate        every planted defect must turn a rule RED
//   node tests/alpha-windows-frame.mjs --mutate --only=<prefix>   just the mutants whose name starts so
//   node tests/alpha-windows-frame.mjs --mutate --shard=K/N   the Kth of N shards, balanced by measured seconds (CI splits them)
//   node tests/alpha-windows-frame.mjs --shard-plan   no browser: smoke.yml's shards cover every mutant once, each in budget
//   node tests/alpha-windows-frame.mjs --shots <dir>  also write the visual-gate screenshots (1440x900 and 922x423)
//
// mutant-anchors: src/shell/windows/shop.js src/shell/windows/inventory/doll.js src/world/world-boot.js src/shell/windows/hunts.js src/shell/windows/storage.js src/shell/hunt-list.js src/shell/windows/skills.js src/styles/windows.css src/session/residue.js src/shell/panel-alpha.js src/styles/shell.css src/shell/shell.js src/shell/windows/hunt-summary.js src/shell/window-fit.js src/shell/window-manager.js src/shell/window-head.js src/styles/market.css
// mutant-writes-tree: no — page mutants are served overrides (tests/_alpha-windows.mjs pageRun)
//
// One of the alpha windows' guards, split from tests/alpha-windows.mjs (2026-11-19, arch audit item 7): tests/_alpha-windows.mjs
// is the harness they share (play.html with supabase-js and the REST paths stubbed, the character's envelope
// tests/fixtures/alpha-envelope.json) and says which guard holds which window's rules.
//
// What every window shares over the World: keys and presses never reach the map under it (Tyler's first playtest),
// nothing clips in a wide font, the window opacity, a window opens whole on a short World, no window lies on the hunt's
// controls, one window header with Back to where a press came from.
//
// Tyler's first live playtest (2026-10-18), in town (a read-only hook puts the World
// pane's runtime on window.__world for its stats() and screenOf()):
//   AW-12 with the Inventory open and a stack focused, D walks the hero; typing in
//         the item search does not (only a text field takes the walk keys)
//   AW-13 presses on the docked Inventory never move the hero; a press on open map does
//   AW-14 going hunting is two presses from town: the mill hatch opens Hunts on the
//         Mill Cellar, Enter is ONE hr_hunt_enter carrying names and counts (the
//         bag's own supplies, whole stacks); the foot shows the spaces and the gold
//   AW-16 no void: with a window docked the whole town view stays on the map; a
//         Storage press from town moves the whole stack with ONE hr_bank_move
//   AW-30 THE WINDOW OPACITY (Tyler 2026-10-24): Settings > Interface > Window opacity at 70
//         puts ONE residue `panelAlpha: 70`, fades a window's floor to 0.7 while its title
//         stays solid, and after a reload the windows are still at 0.7 and the slider says 70%
//   AW-93 A WINDOW OPENS WHOLE (Tyler 2026-11-11, the Hunts window at 1014x652: "when I open a menu, part of it shouldn't
//         automatically be cut off"): at 1014x652, 1024x768 and 922x423, a Level 36 hero in town, Hunts, Inventory, Shop and Market each
//         open inside the World, lose no word or press to a box that hides its overflow or to the frame, and every scroll
//         region ends at rest on a whole row (no line, slot or creature card cut by its foot or by a sticky Enter/Save foot);
//         the Hunts page shows its first creature card whole without a scroll (it had 107 px: the window stopped above the bar);
//         the empty Market at 667x340 too (its invite scrolls in its own box, the press never lost under the window's foot); a trim
//         pass over a window that has not moved writes nothing (perf-budget PB-QUIET, v0.2.142), at least one window trimmed (control)
//   AW-95 NO WINDOW LIES ON THE HUNT'S CONTROLS (play gate 2026-11-13, 1280x720: the bag docked in town covered Leave hunt and
//         the bar's Setup, Target and stance): at 1280x720, 1024x768 and 922x423, in a hunt, with Inventory or Character open, the
//         middle of Leave hunt, Hunt details, Setup, stance and Target is the control itself, never a window (in a hunt a
//         docked window starts under the hunt bar and ends above the action bar; a phone's sheet ends above the bar)
//   AW-94 ONE WINDOW HEADER (UX flow audit 2026-11-11): at 1440 every keyed row of src/data/shell-windows.js opens wearing the same band
//         (Back, title, ? where it has help, key, Close); a creature on a ground's page opens Monster facts as a PAGE of Hunts with Back,
//         and a link out of it opens a window whose Back says Back to Hunts and goes there; the bag stays open beside Storage, the Shop
//         and Character; Hunts lies over Party and Gathering without closing them; two more gold plates planted in the Shop leave one gold
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, tradeJobsFixture } from './_client-harness.mjs';
import { wait, reloadAndPlay, pushEnvelope, openWin, sent, pageRun, plain, mutate, shardPlan } from './_alpha-windows.mjs';

/* The town the playtest checks walk (its size and the mill hatch, from the map row itself). */
const TOWN_ROW = (await import(pathToFileURL(join(ROOT, 'src/data/world/maps/town_common.js')).href)).default;
const TOWN = { w: TOWN_ROW.rows[0].length, h: TOWN_ROW.rows.length, hatch: [TOWN_ROW.exits[0].x, TOWN_ROW.exits[0].y] };
const LEVEL_36_XP = (await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href)).charXpForLevel(36);
/* AW-93: a trim pass over a window whose content and size have not moved writes nothing (window id): the page's own window-fit module
   (its ?v= is the boot module's), one pass to settle, then two watched (perf-budget PB-QUIET, v0.2.142: a trimmed Hunt summary undid and
   re-made the same trim on every repaint in a still town). { trims, writes }; writes -1 when the module or the window is not there. */
const STILL_TRIM = async (id) => {
  const boot = document.querySelector('script[type="module"][src*="src/app/boot.js"]');
  const frame = document.querySelector('.hs-win[data-hs-win="' + id + '"]');
  if (!boot || !frame) return { trims: 0, writes: -1 };
  const F = await import(new URL('src/shell/window-fit.js' + new URL(boot.src).search, boot.src.replace(/src\/app\/boot\.js.*$/, '')).href);
  F.trimEnds(frame);
  const mo = new MutationObserver(() => {});
  mo.observe(frame, { subtree: true, childList: true, attributes: true, characterData: true });
  F.trimEnds(frame);
  F.trimEnds(frame);
  const writes = mo.takeRecords().length;
  mo.disconnect();
  return { trims: frame.querySelectorAll('[data-hs-trim]').length, writes };
};
/* AW-93: what a window loses at rest, measured in the page (window id): the frame past the World, a shown word or press past a box that
   hides its overflow or past the frame, and a row (a list's line, a slot, a creature card) cut by its scroll region's foot line
   (the region's bottom, or the top of a sticky foot stuck there). [] when it opens whole. */
const CLIPPED = (id) => {
  const win = document.querySelector('.hs-win[data-hs-win="' + id + '"]');
  if (!win) return ['not open'];
  const out = [], cs = (e) => getComputedStyle(e), w = win.getBoundingClientRect();
  const nm = (e) => (e.classList[0] || e.tagName) + ' "' + (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24) + '"';
  if (w.bottom > innerHeight + 1 || w.top < -1) out.push('the frame runs past the screen (' + Math.round(w.top) + '-' + Math.round(w.bottom) + ')');
  const shown = (e) => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && e.checkVisibility({ visibilityProperty: true }); };
  const all = Array.from(win.querySelectorAll('*')).filter((e) => !e.closest('.hs-win-coach, .hw-tip, .hw-menu') && shown(e));
  const scrolls = (e) => /(auto|scroll)/.test(cs(e).overflowY) && e.scrollHeight > e.clientHeight + 1;
  const regions = all.filter(scrolls);
  const regionOf = (e) => { for (let a = e.parentElement; a && a !== win; a = a.parentElement) if (regions.includes(a)) return a; return null; };
  for (const e of all) {
    if (!(/^(IMG|BUTTON|INPUT|SELECT)$/.test(e.tagName) || Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()))) continue;
    const q = e.getBoundingClientRect();
    for (let a = e.parentElement; a; a = a.parentElement) {
      const b = a.getBoundingClientRect();
      if (a === win) { if (q.bottom > b.bottom + 1) out.push('lost past the frame: ' + nm(e)); break; }
      if (regions.includes(a)) break;
      if (/(hidden|clip)/.test(cs(a).overflowY) && q.top < b.bottom && q.bottom > b.bottom + 1) { out.push('lost under ' + (a.classList[0] || a.tagName) + ': ' + nm(e)); break; }
    }
  }
  for (const r of regions) {
    const b = r.getBoundingClientRect();
    let line = b.top + r.clientTop + r.clientHeight;
    for (const f of r.querySelectorAll('*')) { const fs = cs(f); if (fs.position === 'sticky' && fs.bottom !== 'auto') { const q = f.getBoundingClientRect(); if (q.height && q.bottom >= line - 2) line = Math.min(line, q.top); } }
    for (const e of r.querySelectorAll('li, [class*="-row"], .hw-hunt, .hw-slot, .hw-pocket, .hw-hd-mon')) {
      if (regionOf(e) !== r || !shown(e) || /^(sticky|absolute|fixed)$/.test(cs(e).position)) continue;
      const q = e.getBoundingClientRect();
      if (q.top < line - 4 && q.bottom > line + 4) { out.push('cut at rest in ' + (r.classList[0] || r.tagName) + ': ' + nm(e) + ' (' + Math.round(q.bottom - line) + ' px hidden)'); break; }
    }
  }
  return out;
};

/* The page rules, in the monolith's order (a mutant is caught by the first rule that goes red: tests/_alpha-windows.mjs pageRun). */
async function checks(overrides, shots, opts) {
  return pageRun(overrides, shots, opts, null, async ({ fails, open, shot }) => {
    /* mutant-rules-start */
    { // AW-12 .. AW-14, AW-16: Tyler's first playtest (10-18), in town with no hunt running
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 40 });
        e.bank = { oak_logs: 12, iron_bar: 3 };
        /* a stale restock target BELOW the bag's 14 bread is ignored: the hunt carries the whole stack */
        e.bag_rules = Object.assign({}, e.bag_rules, { restock: { wheat_bread: 10, goldenroot_tea: 10 } });
      };
      const { ctx, page, errors, s, up } = await open({ mutateEnv: town });
      if (!up || !(await wait(page, () => window.__world && window.__world.stats().walk))) fails.push('AW-12 the town did not mount');
      else {
        const hero = () => page.evaluate(() => window.__world.stats().walk.cell.join(','));
        const at = (x, y) => page.evaluate(([a, b]) => window.__world.screenOf(a, b), [x, y]);
        await openWin(page, 'b', 'inventory');
        await page.waitForTimeout(200);
        /* AW-13 a press on a docked window never reaches the World; a press on open map walks. */
        const c0 = await hero();
        await page.click('[data-hs-win="inventory"] .hw-slot[data-slot="helmet"]');
        await page.click('[data-hs-win="inventory"] .hw-pocket[data-item="rat_tail"]');
        await page.click('[data-hs-win="inventory"] .hw-inv-foot');
        await page.waitForTimeout(900);
        if ((await hero()) !== c0) fails.push('AW-13 clicks inside the docked Inventory walked the hero from ' + c0 + ' to ' + (await hero()));
        const [hx, hy] = c0.split(',').map(Number);
        const p = await at(hx - 3, hy);
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(1500);
        if ((await hero()) === c0) fails.push('AW-13 a click on open map beside the window did not walk the hero (still on ' + c0 + ')');
        /* AW-12 the walk keys work with a window open and an item focused; only a text field takes them. */
        await page.click('[data-hs-win="inventory"] .hw-pocket[data-item="rat_tail"]');
        const k0 = await hero();
        await page.keyboard.down('d'); await page.waitForTimeout(700); await page.keyboard.up('d');
        await page.waitForTimeout(500);
        const k1 = await hero();
        if (k1 === k0) fails.push('AW-12 with the Inventory open and a stack focused, D did not walk the hero (' + k0 + ')');
        await page.focus('[data-hs-win="inventory"] .hw-q');
        await page.keyboard.down('a'); await page.waitForTimeout(700); await page.keyboard.up('a');
        await page.waitForTimeout(500);
        if ((await hero()) !== k1) fails.push('AW-12 typing A in the item search walked the hero');
        await page.evaluate(() => document.activeElement.blur());
        /* AW-16 no void: with the window docked the whole town view stays on the map (the hero is mid-map). */
        const box = await page.evaluate(() => document.querySelector('.world-canvas').getBoundingClientRect().toJSON());
        const tl = await at(0, 0), br = await at(TOWN.w - 1, TOWN.h - 1);
        const half = (br.x - tl.x) / (TOWN.w - 1) / 2;
        if (tl.x - half > box.left + 1 || br.x + half < box.right - 1 || tl.y - half > box.top + 1 || br.y + half < box.bottom - 1)
          fails.push('AW-16 with the Inventory docked the camera shows past the map: map ' + JSON.stringify([tl.x - half, tl.y - half, br.x + half, br.y + half].map(Math.round)) + ' vs canvas ' + JSON.stringify([box.left, box.top, box.right, box.bottom].map(Math.round)));
        /* The capacity bar and the gold under the two columns. */
        const foot = await page.evaluate(() => ({ cap: document.querySelector('.hw-captext').textContent, gold: document.querySelector('.hw-gold').textContent }));
        if (!/ of 40 spaces$/.test(foot.cap) || foot.gold !== 'Gold: 5,200 gp') fails.push('AW-14 the Inventory foot reads ' + JSON.stringify(foot));
        if (shots) await shot(page, 'alpha-1440x900-inventory-town');
        /* AW-14 going hunting is two presses from town: the mill hatch opens Hunts on the Mill Cellar, Enter goes. */
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        /* Havora is bigger than one view: tap the open map toward the hatch until it is well on screen */
        for (let i = 0; i < 8; i++) {
          const h = await at(TOWN.hatch[0], TOWN.hatch[1]);
          const b = await page.evaluate(() => document.querySelector('.world-canvas').getBoundingClientRect().toJSON());
          if (h.x > b.left + 120 && h.x < b.right - 120 && h.y > b.top + 120 && h.y < b.bottom - 200) break;
          await page.mouse.click(Math.min(Math.max(h.x, b.left + 160), b.right - 160), Math.min(Math.max(h.y, b.top + 160), b.bottom - 240));
          await page.waitForTimeout(2500);
        }
        const hatch = await at(TOWN.hatch[0], TOWN.hatch[1]);
        await page.mouse.click(hatch.x, hatch.y);
        const opened = await wait(page, () => document.querySelector('[data-hs-win="hunts"] .hw-hunt.is-picked[data-hunt="mill_cellar"]'), null, 3000);
        if (!opened) fails.push('AW-14 a click on the mill hatch did not open Hunts on the Mill Cellar');
        else {
          if (shots) await shot(page, 'alpha-1440x900-hunts');
          /* the fixture hero is Level 7: the Cellar's hunt ends at 5 (hunt-grounds.js endsAtLevel) and its door refuses it, so Enter is off and
             says so (blind playthrough 2026-11-19, P1; tests/hunt-floor-warning.mjs G9 holds the rule); the hero goes on to the Thicket */
          const cellarOff = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunts"]'); return { off: w.querySelector('.hw-hunt-enter').disabled, why: w.querySelector('.hw-enter-why').textContent }; });
          if (!cellarOff.off || cellarOff.why !== 'Outgrown at Level 5 · Pick a harder ground') fails.push('AW-14 a Level 7 hero\'s Cellar Enter reads ' + JSON.stringify(cellarOff));
          await page.click('[data-hs-win="hunts"] .hw-hunt[data-hunt="meadowbrook_thicket"]');
          await page.waitForTimeout(300);
          await page.click('[data-hs-win="hunts"] .hw-hunt-detail .hw-hunt-enter');
          await page.waitForTimeout(700);
          const enter = sent(s, 'hr_hunt_enter');
          const b = enter[0] && enter[0].body;
          if (enter.length !== 1 || b.p_hunt !== 'meadowbrook_thicket' || b.p_slot !== 0 || !Array.isArray(b.p_bag) || Object.keys(b).some((k) => /price|gold|total|cost/.test(k)))
            fails.push('AW-14 Enter sent ' + JSON.stringify(enter.map((c) => c.body)));
          const bread = b && b.p_bag.find((l) => l.item === 'wheat_bread');
          if (!bread || bread.qty !== 14) fails.push('AW-14 the hunt did not carry the whole bread stack: ' + JSON.stringify(b && b.p_bag));
        }
        /* AW-16b Storage from town: a Shift-press moves a whole stack, ONE hr_bank_move (the amounts are AW-18). */
        await openWin(page, 't', 'storage');
        await page.click('[data-hs-win="storage"] .hw-pocket[data-item="oak_logs"]', { modifiers: ['Shift'] });
        await page.waitForTimeout(700);
        const mv = sent(s, 'hr_bank_move');
        if (mv.length !== 1 || mv[0].body.p_item !== 'oak_logs' || mv[0].body.p_qty !== 12 || mv[0].body.p_dir !== 'withdraw') fails.push('AW-16 a storage press sent ' + JSON.stringify(mv.map((c) => c.body)));
        /* AW-17 (desktop) neither skills window scrolls; the Work window's trades are the company's (09-crafting 4.17), with no combat
           skill among them, and a trade's unlock names the job it opens (Tyler 10-18: "and 1 more" read as nothing). */
        s.env.trade_jobs = tradeJobsFixture(s.env.now, { smithing: 5 });
        await pushEnvelope(page, s);
        for (const [key, id] of [['g', 'skills-trade']]) {
          await openWin(page, key, id);
          await page.waitForTimeout(300);
          const m = await page.evaluate((w) => { const b = document.querySelector('[data-hs-win="' + w + '"] .hs-win-body'); return { sh: b.scrollHeight, ch: b.clientHeight }; }, id);
          if (m.sh > m.ch + 1) fails.push('AW-17 ' + id + ' at 1440x900 scrolls (' + m.sh + ' > ' + m.ch + ')');
        }
        const ledger = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="skills-trade"] .hw-skills .hw-skill')).map((li) => li.textContent.trim()));
        const smith = ledger.find((t) => /^Smithing/.test(t)) || '';
        if (!/^Smithing\s*5/.test(smith) || !/Lv 11: Smelt Iron Bar/.test(smith) || /and 1 more/.test(smith)) fails.push('AW-17 the Smithing trade line reads ' + JSON.stringify(smith));
        if (ledger.some((t) => /^(Melee|Defense|Inner Flame|Magic|Ranged)/.test(t))) fails.push('AW-17 the Work window lists a combat skill: ' + JSON.stringify(ledger));
      }
      if (errors.length) fails.push('AW-13 console errors in town: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // AW-61 NOTHING CLIPS: every window's title and a Shop name, in a wide fallback font (GitHub's Linux runner has one); a member's Hunt again is off and says why
      /* ONE HERO ON THE ACCOUNT (lane/a-strip-all-heroes): the stub answers every slot with this same hero, so slot 1 was a second
         "Tyler" that never showed; the strip now lists a hero not open beside the shown one, and two tabs share the top bar. The
         job's rule is about one tab's room. */
      const stall = (e) => { e.hero_slots = [0]; e.shop = Object.assign({}, e.shop, { offers: [{ offer: 'supply.bronze_axe', item: 'bronze_axe', kind: 'tool', price: 120 }, { offer: 'gear.iron_helm', item: 'iron_helm', kind: 'gear', price: 180 }],
        bids: Object.assign({}, e.shop.bids, { alpha_fang: 450, rat_tail: 1 }) }); e.inventory = Object.assign({}, e.inventory, { alpha_fang: 3, rat_tail: 4 }); };
      const { ctx, page, s, up } = await open({ viewport: { width: 1365, height: 846 }, mutateEnv: stall });
      if (!up) fails.push('AW-61 the page did not mount');
      else {
        /* AW-62 AT THE LAPTOP'S WIDTH, IN THE GAME'S OWN FONT: the stance words whole on the bar; the analyzer's tabs inside their panel; Inventory's foot in the window with a coach card up. */
        const readChrome = () => page.evaluate(() => {
          const stance = Array.from(document.querySelectorAll('.hb-stance .hh-seg')).map((b) => ({ t: b.textContent, over: b.scrollWidth - b.clientWidth }));
          const panel = document.querySelector('[data-hs-widget="analyzer"]');
          const tabs = panel ? Array.from(panel.querySelectorAll('.ha-tab')).map((b) => ({ t: b.textContent, right: b.getBoundingClientRect().right, over: b.scrollWidth - b.clientWidth })) : [];
          const d = document.querySelector('.char-tab.is-shown .char-tab-doing') || document.querySelector('.char-tab-doing');
          let label = null;
          if (d) { const was = d.textContent; d.textContent = 'In town, fueling the Great Hearth with Bones'; label = d.scrollWidth - d.clientWidth; d.textContent = was; }
          return { stance, tabs, label, edge: panel ? panel.getBoundingClientRect().right : null };
        });
        /* THE WIDE FONT, WHOLE: --f-ui with nothing after it to fall to (tests/_test-fonts.mjs draws it the same on every machine; run 41385560100:
           the job 9 px and the stance words 7 px over), at the laptop's width and, for the bar's words, at a Steam Deck's 1280. */
        const wideFont = await page.addStyleTag({ content: ":root, body, body[data-theme] { --f-ui: 'Alegreya Sans' !important; }" });
        const wide = await readChrome();
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(150);
        const deck = await readChrome();
        await page.setViewportSize({ width: 1365, height: 846 });
        await page.waitForTimeout(150);
        await wideFont.evaluate((e) => e.remove());
        const own = await readChrome();
        for (const [font, chrome] of [['the wide font', wide], ['this box\'s font', own]]) {
          if (chrome.label === null || chrome.label > 0) fails.push('AW-62 in ' + font + ' the top bar cuts a hero\'s job by ' + chrome.label + ' px');
        }
        for (const [font, chrome] of [['the wide font', wide], ['the wide font at 1280', deck], ['this box\'s font', own]]) {
          if (chrome.stance.length !== 3 || chrome.stance.some((s) => s.over > 0)) fails.push('AW-62 in ' + font + ' the stance words read ' + JSON.stringify(chrome.stance));
          if (chrome.tabs.length && chrome.tabs.some((t) => t.over > 0 || t.right > chrome.edge)) fails.push('AW-62 in ' + font + ' the analyzer tabs read ' + JSON.stringify(chrome));
        }
        const { SHELL_WINDOWS } = await import(pathToFileURL(join(ROOT, 'src/data/shell-windows.js')).href);
        /* the real band (src/shell/window-head.js), its Back shown: the widest it gets */
        const { headHtml } = await import(pathToFileURL(join(ROOT, 'src/shell/window-head.js')).href);
        const heads = await page.evaluate((list) => list.map((r) => {
          const host = document.createElement('div');
          host.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;width:' + r.width + 'px';
          host.innerHTML = r.head;
          document.body.appendChild(host);
          const t = host.querySelector('h2'), got = { id: r.id, w: t.scrollWidth - t.clientWidth, band: host.firstChild.offsetHeight, ell: getComputedStyle(t).textOverflow };
          host.remove();
          return got;
        }), SHELL_WINDOWS.map((r) => ({ id: r.id, width: r.width,
          head: headHtml(r, {}, false).replace(/^(<header[^>]*>)/, '$1<span class="hs-glyph"></span>').replace(' hidden>&lsaquo;', '>&lsaquo;') })));
        for (const h of heads) if (h.w > 0 || h.band > 46 || h.ell === 'ellipsis') fails.push('AW-61 the ' + h.id + ' title clips: ' + JSON.stringify(h));
        /* the Shop on the phone (a sheet, half of 667): the name has its own line and is never cut; desktop keeps its one row */
        const shopNames = async (p, tag) => {
          await p.addStyleTag({ content: ":root { --f-ui: 'Alegreya Sans' !important; --f-display: 'Alegreya Sans' !important; }" });
          if (!(await openWin(p, 'v', 'shop'))) { fails.push('AW-61 the Shop did not open at ' + tag); return; }
          await wait(p, () => document.querySelector('[data-hs-win="shop"] .hw-line-name b'), null, 3000);
          const names = await p.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="shop"] .hw-line-name b')).filter((b) => b.getClientRects().length).map((b) => ({ t: b.textContent, over: b.scrollWidth - b.clientWidth })));
          if (!names.length) fails.push('AW-61 no Shop name to measure at ' + tag);
          for (const n of names) if (n.over > 0) fails.push('AW-61 ' + tag + ': the Shop cuts ' + JSON.stringify(n));
        };
        await shopNames(page, '1365');
        /* AW-62 A RARE IS NEVER JUNK (audit 2026-11-18 A16, replacing "the confirmation names the rare finds in the sale"): the bag's 3 Alpha Fangs,
           the away card's Best find, are not in Sell all junk at all; its confirmation sells the Junk alone */
        await page.click('[data-hs-win="shop"] .hw-tab[data-tab="sell"]');
        await wait(page, () => document.querySelector('[data-hs-act="sell-loot"]:not([disabled])'), null, 3000);
        await page.click('[data-hs-act="sell-loot"]');
        const saleNote = await page.evaluate(() => { const c = document.querySelector('[data-pane="sell"] .hw-confirm'); return c ? c.querySelector('.hw-confirm-q').textContent + ' | ' + c.querySelector('.hw-confirm-note').textContent : ''; });
        if (!saleNote || /Alpha Fang|rare finds/i.test(saleNote)) fails.push('AW-62 Sell all junk asks: ' + JSON.stringify(saleNote));
        await page.click('[data-hs-win="shop"] [data-hs-act="confirm-no"]');
        /* ...so a Rare reaches a sale only on its own row, and that confirmation still names it before the press (the Shop's note, item-lore.js
           rareSaleWords; set/v0.2.140: with A16 the junk sale above stopped carrying the Fangs, and nothing read the Shop's rare words) */
        await page.click('[data-hs-win="shop"] [data-hs-act="sell"][data-item="alpha_fang"]');
        const rowNote = await page.evaluate(() => { const c = document.querySelector('[data-pane="sell"] .hw-confirm.is-on'); return c ? c.querySelector('.hw-confirm-q').textContent + ' | ' + c.querySelector('.hw-confirm-note').textContent : ''; });
        if (!/Sells rare finds: 3 Alpha Fang/.test(rowNote)) fails.push('AW-62 selling the Alpha Fangs on their own row asks: ' + JSON.stringify(rowNote));
        await page.click('[data-hs-win="shop"] [data-hs-act="confirm-no"]');
        await page.keyboard.press('v');
        /* AW-62 Inventory's foot stands inside the window at a laptop's height, the bag scrolling above it, with a card up too */
        if (!(await openWin(page, 'b', 'inventory'))) fails.push('AW-62 Inventory did not open');
        else {
          await page.setViewportSize({ width: 1366, height: 768 });
          await page.waitForTimeout(300);
          const foot = await page.evaluate(async () => {
            const w = document.querySelector('[data-hs-win="inventory"]');
            w.querySelector('.hs-win-coach').insertAdjacentHTML('beforeend', '<p class="hs-pointer is-line"><b>A card</b> <span class="hs-coach-text">words</span></p>');
            /* the window settles under the card as the shell lets it: a frame for its observers, a frame for what they set */
            for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
            const bottom = (q) => { const e = w.querySelector(q); return e && e.getClientRects().length ? Math.round(e.getBoundingClientRect().bottom) : null; };
            const slots = w.querySelectorAll('.hw-doll .hw-slot'), last = slots[slots.length - 1], cols = w.querySelector('.hw-inv-cols');
            const out = { win: Math.round(w.getBoundingClientRect().bottom), foot: bottom('.hw-inv-foot'), tools: bottom('[data-hs-act="dispatch"]'), scroll: w.querySelector('.hw-inv-scroll').clientHeight,
              doll: slots.length === 14 && last.getBoundingClientRect().bottom <= Math.min(cols.getBoundingClientRect().bottom, w.getBoundingClientRect().bottom) + 0.5 };
            w.querySelector('.hs-win-coach').textContent = '';
            return out;
          });
          /* under a card, in a hunt: the foot and the tools in the window, the bag scrolling above them with two whole rows of 44 px wells
             (it was 97 px), beside the whole doll. Tyler 2026-11-17 put every worn slot first (AW-100): this read three rows beside a doll
             cut after its second row; the doll's column now runs the window's height and the bag shares it with its foot and tools. */
          if (foot.foot === null || foot.foot > foot.win || foot.tools === null || foot.tools > foot.win || foot.scroll < 2 * 44 + 4 + 8 || !foot.doll) fails.push('AW-62 Inventory at 1366x768 reads ' + JSON.stringify(foot));
          /* THE BAG'S KEYS STAND WHOLE (lane/a-text-polish): they sat at the end of the bag's scroll and its edge cut the third line at
             1366x768. Behind the ?, every hint shows, no scrolling box the list sits in cuts it, and it ends inside the window; at rest none
             is in the body. Measured, not snapshotted. A bag with no ? has no way to its keys: that is this rule's red, never a page
             step that throws (release v0.2.131 in-page-18: the "AW-94 the header has no ?" mutant crashed here as HARNESS). */
          const help = '[data-hs-win="inventory"] [data-hs-help]';
          const hasHelp = !!(await page.$(help));
          if (!hasHelp) fails.push('AW-62 the bag has no ? in its header, so its keys cannot be read');
          if (hasHelp) await page.click(help);
          const keys = await page.evaluate(() => {
            const w = document.querySelector('[data-hs-win="inventory"]'), k = w.querySelector('.hs-help-keys');
            if (!k || !k.getClientRects().length) return { cut: 'not shown' };
            const r = k.getBoundingClientRect();
            let cut = r.bottom > w.getBoundingClientRect().bottom + 0.5 ? 'past the window' : null;
            for (let a = k.parentElement; a && a !== w && !cut; a = a.parentElement) {
              if (getComputedStyle(a).overflowY === 'visible') continue;
              const b = a.getBoundingClientRect(), shown = b.top + a.clientTop + a.clientHeight;
              if (r.top < b.top - 0.5 || r.bottom > shown + 0.5) cut = 'cut by .' + a.className.split(' ')[0] + ' (' + Math.round(r.bottom - shown) + ' px)';
            }
            const lis = [...k.querySelectorAll('li')];
            return { cut, hints: lis.length, keyed: lis.filter((li) => li.querySelector('kbd')).length, wrapped: lis.filter((li) => li.getClientRects().length > 1).length };
          });
          if (hasHelp) await page.click(help);
          const inBody = await page.evaluate(() => !!document.querySelector('[data-hs-win="inventory"] .hw-inv .hs-help-keys, [data-hs-win="inventory"] .hw-inv .hw-keys'));
          if ((hasHelp && (keys.cut || keys.hints !== 9 || keys.keyed !== 9 || keys.wrapped)) || inBody) fails.push('AW-62 the bag\'s keys at 1366x768 read ' + JSON.stringify({ keys, inBody }));
          await page.keyboard.press('b');
          /* the Hunts how-to stands aside for a card there, and comes back */
          if (await openWin(page, 'h', 'hunts')) {
            const hint = await page.evaluate(() => {
              const w = document.querySelector('[data-hs-win="hunts"]'), n = w.querySelector('.hw-hunts-now'), slot = w.querySelector('.hs-win-coach');
              n.classList.add('is-hint');   // the how-to's own class: the fixture's hero is hunting, and a running hunt's line stays
              const was = getComputedStyle(n).display;
              slot.insertAdjacentHTML('beforeend', '<p class="hs-pointer is-line"><b>A card</b></p>');
              const under = getComputedStyle(n).display;
              slot.textContent = '';
              return { was, under };
            });
            if (hint.was === 'none' || hint.under !== 'none') fails.push('AW-62 the Hunts how-to beside a card reads ' + JSON.stringify(hint));
            await page.keyboard.press('h');
          }
          await page.setViewportSize({ width: 1365, height: 846 });
        }
        const phone = await open({ viewport: { width: 667, height: 375 }, mutateEnv: stall });
        if (!phone.up) fails.push('AW-61 the phone did not mount');
        else await shopNames(phone.page, '667');
        await phone.ctx.close();
        /* a member's summary: Hunt again is off, says who chooses, and sends nothing */
        const seat = (n, name) => ({ seat: n, name, unit: 10 + n, hunting: false });
        s.env.party = { id: '00000000-0000-4000-a000-0000000000aa', hunt: 'mill_cellar', max: 4, leader_seat: 0, self_seat: 1, members: [seat(0, 'Bramwell'), seat(1, 'Brannoc')] };
        s.env.hunt = Object.assign({}, s.env.hunt, { ended: true, session: { end_reason: 'party_member_left', end_by: 'Bramwell', end_by_why: 'stamina', preset: 0, ended_at: '2026-10-25T00:20:00Z', phase: 'ended' } });
        s.env.state = Object.assign({}, s.env.state, { active_kind: 'idle', active_id: null });
        await pushEnvelope(page, s);
        if (!(await wait(page, () => document.querySelector('[data-hs-win="hunt-summary"] [data-hs-act="again"]'), null, 4000))) fails.push('AW-61 the member\'s summary did not open');
        else {
          await page.waitForTimeout(300);
          const seen = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunt-summary"]'); const b = w.querySelector('[data-hs-act="again"]'); return { off: b.disabled, why: w.querySelector('.hh-intent-msg').textContent, reason: w.querySelector('.hsum-reason').textContent }; });
          if (!seen.off || seen.why !== 'Hunt again off: Party leader picks the hunt') fails.push('AW-61 a member\'s Hunt again reads ' + JSON.stringify(seen));
          if (!/Party ended · Bramwell out of stamina/.test(seen.reason)) fails.push('AW-61 the member\'s end card reads ' + seen.reason);
          /* the leader's own press is the party's Start, never a lone Enter */
          s.env.party = Object.assign({}, s.env.party, { self_seat: 0, leader_seat: 0 });
          await pushEnvelope(page, s);
          await page.waitForTimeout(300);
          const mark = s.calls.length;
          await page.click('[data-hs-win="hunt-summary"] [data-hs-act="again"]');
          await page.waitForTimeout(400);
          const names = s.calls.slice(mark).map((c) => c.name);
          if (!names.includes('hr_hunt_party_start') || names.includes('hr_hunt_enter')) fails.push('AW-61 the leader\'s Hunt again sent ' + names.join(','));
          s.env.party = Object.assign({}, s.env.party, { self_seat: 1, leader_seat: 0 });
          await pushEnvelope(page, s);
          await page.waitForTimeout(300);
          /* AW-63 sent home still in the party (midgame panel 2026-11-01): Hunts' Enter is off with its reason beside it, and Leave party there is ONE intent */
          if (await openWin(page, 'h', 'hunts')) {
            await page.waitForTimeout(200);
            const foot = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunts"]'), e = w.querySelector('.hw-hunt-enter'), l = w.querySelector('[data-hs-act="leave-party"]'); return { off: e.disabled, why: w.querySelector('.hw-enter-why').textContent, leave: !l.hidden && l.getClientRects().length > 0 }; });
            if (!foot.off || !/^Party: Bramwell picks the hunt/.test(foot.why) || !foot.leave) fails.push('AW-63 a member\'s Hunts foot reads ' + JSON.stringify(foot));
            const mk = s.calls.length;
            await page.click('[data-hs-win="hunts"] [data-hs-act="leave-party"]').catch(() => fails.push('AW-63 could not press ' + "'[data-hs-win=\"hunts\"] [data-hs-act=\"leave-party\"]'"));
            await page.waitForTimeout(300);
            if (s.calls.slice(mk).filter((c) => /party_leave/.test(c.name)).length !== 1) fails.push('AW-63 Leave party in Hunts sent ' + s.calls.slice(mk).map((c) => c.name).join());
            await page.keyboard.press('h');
          }
          /* AW-63 the Party window: its answer under its presses, Disband whole and asking first, a seat coming retires an old answer */
          s.env.party = Object.assign({}, s.env.party, { self_seat: 0, leader_seat: 0 });
          await pushEnvelope(page, s);
          await page.waitForTimeout(200);
          if (await openWin(page, 'y', 'hunt-party')) {
            await page.click('[data-hs-win="hunt-party"] .hw-tab[data-tab="party"]').catch(() => {});
            await page.click('[data-hs-win="hunt-party"] [data-hs-act="invite-name"]').catch(() => fails.push('AW-63 could not press ' + "'[data-hs-win=\"hunt-party\"] [data-hs-act=\"invite-name\"]'"));
            await page.waitForTimeout(150);
            const lay = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunt-party"]'), m = w.querySelector('.hw-party > .hh-intent-msg').getBoundingClientRect(), a = w.querySelector('.hw-party-acts').getBoundingClientRect(), d = w.querySelector('[data-hs-act="disband"]'), dr = d.getBoundingClientRect(), b = w.querySelector('.hs-win-body').getBoundingClientRect();
              return { over: m.height > 0 && m.top < a.bottom && a.top < m.bottom, clip: d.scrollWidth - d.clientWidth, past: dr.right - b.right, said: w.querySelector('.hw-party > .hh-intent-msg').textContent }; });
            if (lay.over || lay.clip > 0 || lay.past > 0 || !lay.said) fails.push('AW-63 the Party window lays out as ' + JSON.stringify(lay));
            /* ...and where the window scrolls too (a laptop's short browser; 460 px of page now that a window rises over the bar to fit, AW-93), the presses scrolled to its foot: the sticky
               answer every other window keeps would pin itself there, over Leave party and Disband (an unscrolled window never shows it). */
            await page.setViewportSize({ width: 1366, height: 460 });
            await page.waitForTimeout(200);
            const low = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunt-party"]'), body = w.querySelector('.hs-win-body'), acts = w.querySelector('.hw-party-acts'), m = w.querySelector('.hw-party > .hh-intent-msg');
              const scrolls = body.scrollHeight > body.clientHeight + 1;
              body.scrollTop += acts.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom;
              const a = acts.getBoundingClientRect(), r = m.getBoundingClientRect();
              return { scrolls, said: m.textContent, over: r.height > 0 && r.top < a.bottom && a.top < r.bottom, msg: [Math.round(r.top), Math.round(r.bottom)], acts: [Math.round(a.top), Math.round(a.bottom)] }; });
            await page.setViewportSize({ width: 1365, height: 846 });
            await page.waitForTimeout(200);
            if (!low.scrolls || !low.said) fails.push('AW-63 CONTROL: at 1366x460 the Party window does not scroll with its answer up: ' + JSON.stringify(low));
            else if (low.over) fails.push('AW-63 scrolled to its presses, the Party window\'s answer lies over them: ' + JSON.stringify(low));
            s.env.party = Object.assign({}, s.env.party, { members: s.env.party.members.concat([{ seat: 2, name: 'Solace', unit: 12, hunting: false }]) });
            await pushEnvelope(page, s);
            await page.waitForTimeout(300);
            const stale = await page.evaluate(() => document.querySelector('[data-hs-win="hunt-party"] .hw-party > .hh-intent-msg').textContent);
            if (stale) fails.push('AW-63 an old answer stands after a seat came: ' + stale);
            const dk = s.calls.length;
            await page.click('[data-hs-win="hunt-party"] [data-hs-act="disband"]').catch(() => fails.push('AW-63 could not press ' + "'[data-hs-win=\"hunt-party\"] [data-hs-act=\"disband\"]'"));
            await page.waitForTimeout(150);
            const armed = await page.evaluate(() => document.querySelector('[data-hs-win="hunt-party"] [data-hs-act="disband"]').textContent);
            if (armed !== 'Sure?' || s.calls.slice(dk).some((c) => /disband/.test(c.name))) fails.push('AW-63 Disband\'s first press: ' + armed);
            await page.keyboard.press('y');
          }
          /* AW-63 a lone hero far under a ground's floor (Tyler 2026-11-04 UTC: never blocked): Enter is live under the words, the first press arms "Enter anyway" and sends nothing */
          delete s.env.party;
          s.env.state = Object.assign({}, s.env.state, { level_xp: 0 });
          await pushEnvelope(page, s);
          await page.waitForTimeout(300);
          if (await openWin(page, 'h', 'hunts')) {
            await page.click('[data-hs-win="hunts"] .hw-hunt[data-hunt="coppercap_warrens"]').catch(() => fails.push('AW-63 could not press ' + "'[data-hs-win=\"hunts\"] .hw-hunt[data-hunt=\"coppercap_warrens\"]'"));
            await page.waitForTimeout(200);
            const far = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunts"]'), e = w.querySelector('.hw-hunt-enter'); return { off: e.disabled, why: w.querySelector('.hw-enter-why').textContent, warn: w.querySelector('.hw-hunt-warn').textContent, label: e.textContent }; });
            if (far.off || far.why !== '' || far.label !== 'Enter' || !/^31 Levels under\n[^]*Death: −6% Level XP$/.test(far.warn)) fails.push('AW-63 Coppercap far under its floor reads ' + JSON.stringify(far));
            const sentBefore = s.calls.filter((c) => c.name === 'hr_hunt_enter').length;
            await page.click('[data-hs-win="hunts"] .hw-hunt-enter');
            await page.waitForTimeout(200);
            const armed = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunts"]'); return { label: w.querySelector('.hw-hunt-enter').textContent, said: w.querySelector('.hh-intent-msg').textContent }; });
            if (armed.label !== 'Enter anyway' || armed.said !== 'Press Enter anyway to go' || s.calls.filter((c) => c.name === 'hr_hunt_enter').length !== sentBefore) fails.push('AW-63 the first press of Enter under the floor reads ' + JSON.stringify(armed));
          }
        }
      }
      await ctx.close();
    }

    { // AW-30 the window opacity: a display preference in the residue, the fills fade, the words do not, a reload keeps it
      const { ctx, page, s, up } = await open();
      if (!up) fails.push('AW-30 the page did not mount');
      else {
        const look = () => page.evaluate(() => {
          const w = document.querySelector('[data-hs-win="settings"]:not(.is-leaving)');
          const title = w && w.querySelector('.hs-win-title');
          const val = w && w.querySelector('[data-row="ui.windowOpacity"] .st-val');
          return { root: document.documentElement.style.getPropertyValue('--panel-alpha'), floor: w ? getComputedStyle(w, '::before').opacity : null,
            title: title ? getComputedStyle(title).opacity + '|' + getComputedStyle(title).color : null, val: val ? val.textContent : null };
        });
        const toInterface = async () => {
          if (!(await openWin(page, 'Escape', 'settings'))) return false;
          await page.click('[data-hs-win="settings"] .st-tab[data-cat="interface"]');
          return wait(page, () => document.querySelector('[data-row="ui.windowOpacity"] input[type="range"]'), null, 3000);
        };
        if (!(await toInterface())) fails.push('AW-30 Settings > Interface has no Window opacity slider');
        else {
          const before = await look();
          if (before.root !== '1' || before.floor !== '1' || before.val !== '100%') fails.push('AW-30 a fresh hero\'s windows are not solid at 100%: ' + JSON.stringify(before));
          await page.evaluate(() => { const r = document.querySelector('[data-row="ui.windowOpacity"] input[type="range"]');
            r.focus(); r.value = '70'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
          await page.waitForTimeout(300);
          const now = await look();
          if (now.root !== '0.7' || now.floor !== '0.7') fails.push('AW-30 the slider at 70 did not fade the window floor to 0.7: ' + JSON.stringify(now));
          if (now.title !== before.title || !/^1\|/.test(now.title || '')) fails.push('AW-30 the window title faded with its floor: ' + JSON.stringify([before.title, now.title]));
          /* The put is one per burst, after the residue debounce (src/session/config.js residueDebounceMs). */
          for (let i = 0; i < 40 && !sent(s, 'hr_put_client_state').some((c) => c.body.p_patch && c.body.p_patch.panelAlpha === 70); i++) await page.waitForTimeout(100);
          const puts = sent(s, 'hr_put_client_state').map((c) => c.body.p_patch && c.body.p_patch.panelAlpha).filter((v) => v !== undefined);
          if (puts[puts.length - 1] !== 70) fails.push('AW-30 the opacity was not put as residue panelAlpha 70: ' + JSON.stringify(puts));
          if (!(await reloadAndPlay(page))) fails.push('AW-30 the reload did not come back');
          else if (!(await toInterface())) fails.push('AW-30 after a reload Settings > Interface did not open');
          else {
            const after = await look();
            if (after.root !== '0.7' || after.floor !== '0.7' || after.val !== '70%') fails.push('AW-30 after a reload the windows are not at 70%: ' + JSON.stringify(after));
          }
        }
      }
      await ctx.close();
    }

    { // AW-93 a window opens whole: the short Worlds Tyler plays on (1014x652), a 1024x768 laptop and a phone held sideways
      const lv36 = (e) => { for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, level_xp: LEVEL_36_XP }); };
      let trimmedSeen = 0;
      for (const viewport of [{ width: 1014, height: 652 }, { width: 1024, height: 768 }, { width: 922, height: 423 }]) {
        const { ctx, page, up } = await open({ viewport, mutateEnv: lv36 });
        const at = viewport.width + 'x' + viewport.height;
        if (!up) { fails.push('AW-93 the ' + at + ' screen did not mount'); await ctx.close(); continue; }
        for (const [key, id] of [['h', 'hunts'], ['b', 'inventory'], ['v', 'shop'], ['m', 'market']]) {
          if (!(await openWin(page, key, id))) { fails.push('AW-93 the ' + key.toUpperCase() + ' key did not open ' + id + ' at ' + at); continue; }
          await page.waitForTimeout(400);
          const lost = await page.evaluate(CLIPPED, id);
          if (lost.length) fails.push('AW-93 at ' + at + ' ' + id + ' opens cut off: ' + lost.slice(0, 3).join(' | '));
          /* a pass that moved nothing writes nothing: the trims stand */
          const still = await page.evaluate(STILL_TRIM, id);
          if (still.writes < 0) fails.push('AW-93 CONTROL: the page\'s window-fit module or ' + id + ' was not found at ' + at);
          else if (still.writes) fails.push('AW-93 at ' + at + ' ' + id + ' re-trims on a pass that moved nothing: ' + still.writes + ' DOM changes');
          if (still.trims) trimmedSeen++;
          if (id === 'hunts' && viewport.height > 540) { // the phone's sheet shows the list, then the page
            const card = await page.evaluate(() => { const p = document.querySelector('.hw-hd-page'), c = document.querySelector('.hw-hd-lineup > li');
              if (!p || !c) return 'no page or no creature'; const a = p.getBoundingClientRect(), b = c.getBoundingClientRect();
              return b.top >= a.top - 1 && b.bottom <= a.bottom + 1 ? '' : 'the page shows ' + Math.round(a.height) + ' px and its first creature card ends ' + Math.round(b.bottom - a.bottom) + ' px below it'; });
            if (card) fails.push('AW-93 at ' + at + ' the Hunts page hides Who lives here: ' + card);
          }
          if (shots) await shot(page, 'whole-' + at + '-' + id);
        }
        await ctx.close();
      }
      if (!trimmedSeen) fails.push('AW-93 CONTROL: no window opened with a trimmed region, so the still pass proved nothing');
      /* THE EMPTY MARKET ON THE SHORTEST PHONE (667x340: a 375-tall phone under its browser bar). Since the short invite (v0.2.135) it fits
         every screen above, so only a World this short proves the invite scrolls in its own box and its press is never lost under the window's foot. */
      {
        const { ctx, page, up } = await open({ viewport: { width: 667, height: 340 }, mutateEnv: lv36 });
        if (!up) fails.push('AW-93 the 667x340 screen did not mount');
        else if (!(await openWin(page, 'm', 'market'))) fails.push('AW-93 the M key did not open market at 667x340');
        else {
          await page.waitForTimeout(400);
          if (!(await page.evaluate(() => !!document.querySelector('[data-hs-win="market"] .hw-mk-invite.is-on')))) fails.push('AW-93 CONTROL: the 667x340 Market is not the empty one');
          const lost = await page.evaluate(CLIPPED, 'market');
          if (lost.length) fails.push('AW-93 at 667x340 the empty market opens cut off: ' + lost.slice(0, 3).join(' | '));
          if (shots) await shot(page, 'whole-667x340-market');
        }
        await ctx.close();
      }
    }

    { // AW-95 no window lies on the hunt's controls (play gate 2026-11-13: the bag docked at 1280x720 covered Leave hunt and the bar's Setup, Target, stance)
      for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 922, height: 423 }]) {
        const { ctx, page, up } = await open({ viewport });
        const at = viewport.width + 'x' + viewport.height;
        if (!up) { fails.push('AW-95 the ' + at + ' hunt did not mount'); await ctx.close(); continue; }
        for (const [key, id] of [['b', 'inventory'], ['c', 'character']]) {
          if (!(await openWin(page, key, id))) { fails.push('AW-95 the ' + key.toUpperCase() + ' key did not open ' + id + ' at ' + at); continue; }
          await page.waitForTimeout(400);
          const covered = await page.evaluate(() => {
            const out = [];
            const sels = ['[data-hs-widget="hunt-topbar"] [data-hs-act="leave"]', '[data-hs-widget="hunt-topbar"] [data-hs-act="details"]', '.hb-plaque .hb-set', '.hb-plaque .hb-stance', '.hb-plaque [data-opt="target_mode"]'];
            for (const sel of sels) {
              const b = document.querySelector(sel);
              if (!b || !b.getClientRects().length || b.closest('.is-under-dock')) continue;   // a control not drawn here, or waiting beside the dock, is under no window
              const q = b.getBoundingClientRect();
              if (!q.width || !q.height) continue;
              const top = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
              const win = top && top.closest('.hs-win');
              if (win) out.push(sel + ' lies under the ' + win.getAttribute('data-hs-win') + ' window');
            }
            return out;
          });
          for (const c of covered) fails.push('AW-95 at ' + at + ' with ' + id + ' open, ' + c);
          if (shots) await shot(page, 'hunt-controls-' + at + '-' + id);
        }
        await ctx.close();
      }
    }

    { // AW-94 one window header (UX flow audit 2026-11-11): the same band on every window, Back to where a press came from, a page in its host,
      // the bag beside Storage, the Shop and Character at 1440, Hunts over the dock, one gold plate per window
      const { ctx, page, up } = await open({ viewport: { width: 1440, height: 900 } });
      if (!up) fails.push('AW-94 the 1440 screen did not mount');
      else {
        const { SHELL_WINDOWS } = await import(pathToFileURL(join(ROOT, 'src/data/shell-windows.js')).href);
        const pressOf = (k) => (k === 'escape' ? 'Escape' : k === 'enter' ? 'Enter' : k);
        for (const r of SHELL_WINDOWS.filter((x) => x.key && !x.modal)) {
          await openWin(page, pressOf(r.key), r.id);
          if (!(await wait(page, (w) => document.querySelector('.hs-win[data-hs-win="' + w + '"]:not(.is-leaving)'), r.id, 1500))) { fails.push('AW-94 ' + r.key + ' did not open ' + r.id); continue; }
          const head = await page.evaluate((id) => {
            const h = document.querySelector('.hs-win[data-hs-win="' + id + '"] > .hs-win-head');
            if (!h) return null;
            const kids = Array.from(h.children).map((c) => ['hs-back', 'hs-win-title', 'hs-help', 'hs-key', 'hs-close'].find((k) => c.classList.contains(k))).filter(Boolean);
            return { kids: kids.join(' '), name: h.querySelector('.hs-win-name').textContent, key: h.querySelector('.hs-key') ? h.querySelector('.hs-key').textContent : null, back: h.querySelector('.hs-back').textContent.trim() };
          }, r.id);
          const want = 'hs-back hs-win-title' + (r.help ? ' hs-help' : '') + ' hs-key hs-close';
          if (!head || head.kids !== want || head.name !== (r.title || r.label) || head.back !== '‹ Back') fails.push('AW-94 ' + r.id + '\'s header reads ' + JSON.stringify(head) + ', want ' + want);
        }
        /* a creature on a ground's page opens its facts as a PAGE of Hunts, with Back */
        const shown = (q) => page.evaluate((s) => { const n = document.querySelector(s); return !!n && n.getClientRects().length > 0; }, q);
        if (!(await openWin(page, 'h', 'hunts')) || !(await wait(page, () => document.querySelector('[data-hs-win="hunts"] .hw-hd-mon[data-monster]'), null, 3000))) fails.push('AW-94 CONTROL: no creature on the Hunts page');
        else {
          await page.click('[data-hs-win="hunts"] .hw-hd-mon[data-monster]');
          await wait(page, () => document.querySelector('.hs-win[data-hs-win="hunts"] > .hs-win-body.is-page[data-hs-win="monster"] .mf-name'), null, 3000);
          await page.waitForTimeout(300);
          const pg = await page.evaluate(() => ({ page: !!document.querySelector('.hs-win[data-hs-win="hunts"] > .is-page[data-hs-win="monster"]'), second: !!document.querySelector('.hs-win[data-hs-win="monster"]'),
            own: document.querySelector('.hs-win[data-hs-win="hunts"] > .hs-win-body:not(.is-page)').getClientRects().length > 0, name: document.querySelector('.hs-win[data-hs-win="hunts"] .hs-win-name').textContent }));
          if (!pg.page || pg.second || pg.own || pg.name !== 'Monster facts' || !(await shown('[data-hs-win="hunts"] .hs-win-head .hs-back'))) fails.push('AW-94 Monster facts from Hunts is not a page with Back: ' + JSON.stringify(pg));
          if (shots) await shot(page, 'header-1440-monster-page');
          /* a link out of the page opens its window, whose Back names Hunts and goes there */
          const out = await page.evaluate(() => { const l = Array.from(document.querySelectorAll('[data-hs-win="monster"] [data-hs-goto]')).find((a) => !/^(hunts|monster)\|/.test(a.getAttribute('data-hs-goto')) && a.getClientRects().length);
            if (!l) return null; l.setAttribute('data-aw94', ''); return l.getAttribute('data-hs-goto').split('|')[0]; });
          await page.click('[data-hs-win="hunts"] .hs-win-head .hs-back');
          await page.waitForTimeout(250);
          if (!(await shown('[data-hs-win="hunts"] .hw-hunt-list')) || (await shown('.is-page[data-hs-win="monster"]'))) fails.push('AW-94 Back on the monster page did not return to the Hunts list');
          if (!out) fails.push('AW-94 CONTROL: the monster page links to no other window');
          else {
            await page.click('[data-hs-win="hunts"] .hw-hd-mon[data-monster]');
            await page.waitForTimeout(300);
            await page.evaluate(() => { const l = Array.from(document.querySelectorAll('[data-hs-win="monster"] [data-hs-goto]')).find((a) => !/^(hunts|monster)\|/.test(a.getAttribute('data-hs-goto')) && a.getClientRects().length); if (l) l.click(); });
            await page.waitForTimeout(400);
            const backTitle = () => page.evaluate((w) => { const x = document.querySelector('.hs-win[data-hs-win="' + w + '"] > .hs-win-head .hs-back'); return x && x.getClientRects().length ? (x.getAttribute('title') || 'inner') : null; }, out);
            /* a window opened on one of its own pages (a skill's rows) steps back up through them first, then to Hunts */
            let b = await backTitle();
            for (let i = 0; i < 2 && b === 'inner'; i++) { await page.click('.hs-win[data-hs-win="' + out + '"] > .hs-win-head .hs-back'); await page.waitForTimeout(250); b = await backTitle(); }
            if (b !== 'Back to Hunts') fails.push('AW-94 ' + out + ' opened from Hunts reads its Back as ' + JSON.stringify(b));
            else {
              await page.click('.hs-win[data-hs-win="' + out + '"] > .hs-win-head .hs-back');
              await page.waitForTimeout(300);
              const now = await page.evaluate((w) => ({ gone: !document.querySelector('.hs-win[data-hs-win="' + w + '"]:not(.is-leaving)'), top: (document.querySelector('.hs-win.is-top') || { getAttribute: () => null }).getAttribute('data-hs-win') }), out);
              if (!now.gone || now.top !== 'hunts') fails.push('AW-94 Back from ' + out + ' did not return to Hunts: ' + JSON.stringify(now));
            }
          }
        }
        /* the coexistence table at 1440 */
        const rects = () => page.evaluate(() => Array.from(document.querySelectorAll('.hs-win:not(.is-leaving)')).map((w) => { const q = w.getBoundingClientRect(); return { id: w.getAttribute('data-hs-win'), l: q.left, r: q.right }; }));
        for (const [k, id] of [['t', 'storage'], ['v', 'shop'], ['c', 'character']]) {
          await openWin(page, 'b', 'inventory');
          await page.keyboard.press(k);
          await page.waitForTimeout(350);
          const rs = await rects(), a = rs.find((x) => x.id === 'inventory'), o = rs.find((x) => x.id === id);
          if (!a || !o || !(a.r <= o.l || o.r <= a.l)) fails.push('AW-94 at 1440 the bag and ' + id + ' are not open side by side: ' + JSON.stringify(rs));
          if (shots && id === 'storage') await shot(page, 'header-1440-bag-storage');
        }
        await openWin(page, 'y', 'hunt-party');
        await page.keyboard.press('g'); await page.waitForTimeout(250);
        await page.keyboard.press('h'); await page.waitForTimeout(350);
        const three = (await rects()).map((x) => x.id).sort().join();
        if (three !== 'hunt-party,hunts,skills-trade') fails.push('AW-94 at 1440 Hunts closed the windows under it: ' + three);
        /* a bar slot pressed in Hunt prep opens Configure action as its page, not a second window */
        if (!(await openWin(page, 'p', 'hunt-prep')) || !(await wait(page, () => document.querySelector('[data-hs-win="hunt-prep"] .hb-slot[data-slot="0"]'), null, 3000))) fails.push('AW-94 CONTROL: Hunt prep shows no bar slot');
        else {
          await page.click('[data-hs-win="hunt-prep"] .hb-slot[data-slot="0"]');
          await wait(page, () => document.querySelector('.hs-win[data-hs-win="hunt-prep"] > .is-page[data-hs-win="configure-action"] .ca-tab'), null, 3000);
          await page.waitForTimeout(300);
          const ca = await page.evaluate(() => ({ page: !!document.querySelector('.hs-win[data-hs-win="hunt-prep"] > .is-page[data-hs-win="configure-action"]'), second: !!document.querySelector('.hs-win[data-hs-win="configure-action"]') }));
          if (!ca.page || ca.second) fails.push('AW-94 Configure action from Hunt prep is not its page: ' + JSON.stringify(ca));
          if (shots) await shot(page, 'header-1440-configure-page');
        }
        /* one gold plate per window: two more planted in the Shop, one stays gold */
        if (!(await openWin(page, 'v', 'shop'))) fails.push('AW-94 CONTROL: the Shop did not open');
        else {
          await page.evaluate(() => { const b = document.querySelector('[data-hs-win="shop"] [data-hs-body]'); for (let i = 0; i < 2; i++) { const x = document.createElement('button'); x.className = 'hw-primary is-on'; x.textContent = 'Gold ' + i; b.prepend(x); } });
          await page.waitForTimeout(600);
          const gold = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="shop"] :is(.hw-primary, .hh-tool.is-primary):not(.is-second)')).filter((b) => b.getClientRects().length).length);
          if (gold !== 1) fails.push('AW-94 the Shop shows ' + gold + ' gold plates at once');
        }
      }
      await ctx.close();
    }

    if (shots) { // the window header at 922x423: a page in the Hunts sheet, Back on the left
      const { ctx, page, up } = await open({ viewport: { width: 922, height: 423 } });
      if (up && await openWin(page, 'h', 'hunts') && await wait(page, () => document.querySelector('[data-hs-win="hunts"] .hw-hunt'), null, 3000)) {
        await shot(page, 'header-922-hunts-list');
        await page.evaluate(() => document.querySelector('[data-hs-win="hunts"] .hw-hunt').click());
        await page.waitForTimeout(300);
        await shot(page, 'header-922-hunts-ground');
        await page.evaluate(() => { const m = document.querySelector('[data-hs-win="hunts"] .hw-hd-mon[data-monster]'); if (m) m.click(); });
        await page.waitForTimeout(400);
        await shot(page, 'header-922-monster-page');
        await page.evaluate(() => { const p = document.querySelector('.is-page[data-hs-win="monster"]'); if (p) p.scrollTop = p.scrollHeight; });
        await page.waitForTimeout(150);
        await shot(page, 'header-922-monster-page-end');
        await page.evaluate(() => { const h = document.querySelector('[data-hs-win="hunts"] .hs-help'); if (h) h.click(); });
        await page.waitForTimeout(150);
        await shot(page, 'header-922-help');
      }
      await ctx.close();
    }
  });
}

const MUTANTS = [
  ['AW-93 a docked window stops above the bar on a short World again', 'src/shell/window-manager.js', 'return Number.isFinite(cap) && (rise || cap < DOCK_ROOM_PX) && need > cap;', 'return false && need > cap;'],
  ['AW-95 a window rises over the action bar in a hunt again', 'src/shell/window-fit.js', 'if (cap !== null && !hunt && overBar(cap, Infinity, rise)) {', 'if (cap !== null && overBar(cap, Infinity, rise)) {'],
  ['AW-100 the doll\'s wells never fit a short column', 'src/shell/windows/inventory/doll.js', "    doll.style.setProperty(FIT, dollWell(room, parseFloat(cs.rowGap) || 0, parseFloat(cs.paddingTop) || 0) + 'px');\n", ''],
  ['AW-95 a docked window lies over the hunt bar again', 'src/shell/window-fit.js', '    if (hunt) clearTops(w, hunt.tops, gap);', '    if (false) clearTops(w, hunt.tops, gap);'],
  ['AW-95 the phone sheet lies over the action bar in a hunt again', 'src/shell/shell.js', 'const bars = phoneMq.matches && !hunting ? [] :', 'const bars = phoneMq.matches ? [] :'],
  ['AW-93 a scroll region ends on a cut row again', 'src/shell/window-fit.js', "  if (!frame || frame.classList.contains('is-sized')) return;", '  return;'],
  ['AW-93 a still pass re-makes the same trims again', 'src/shell/window-fit.js', '  if (lastPass.get(frame) === passInputs(frame, view)) return;', '  if (false) return;'],
  ['AW-94 a window shows two gold plates at once', 'src/shell/shell.js', "    for (const w of layer.querySelectorAll(':scope > .hs-win')) oneGold(w);\n", ''],
  ['AW-94 a press inside a window is not remembered as where the next came from', 'src/shell/shell.js', 'function onClick(e) { inWin(e, () => press(e)); }', 'function onClick(e) { press(e); }'],
  ['AW-94 a page is never drawn in its host', 'src/shell/shell.js', '      if (showPage(el, page)) refresh(page);\n', ''],
  ['AW-94 the host\'s own body shows under its page', 'src/styles/shell.css', '.hs-shell .hs-win > .hs-win-body[hidden] { display: none; }\n', ''],
  ['AW-94 the header has no ?', 'src/shell/window-head.js', "    + (help ? '<button type=\"button\" class=\"hs-help\"", "    + (false ? '<button type=\"button\" class=\"hs-help\""],
  ['AW-94 the bag and Storage cannot stay open together at 1440', 'src/shell/window-manager.js', '    return occ.length && occ.every((q) => besides(id, q.id)) ? world().width - DOCK_EDGE : world().width * DOCK_MAX;', '    return world().width * DOCK_MAX;'],
  ['AW-94 Hunts closes the windows under it again', 'src/shell/window-manager.js', '    if (isOver(id)) { slot.set(id, DOCK_EDGE); return; }\n', ''],
  ['AW-93 the empty Market hides its press again', 'src/styles/market.css', 'flex: 1; min-height: 0; overflow-y: auto; flex-direction: column;', 'flex: 1; flex-direction: column;'],
  ['AW-62 the Shop\'s confirmation hides the rares', 'src/shell/windows/shop.js', "[p.spare ? '' : rareSaleWords(p.lines), p.kept.length", "[p.kept.length"],
  ['AW-62 the stance words clip', 'src/styles/hunt.css', '.hb-plaque { position: relative; align-self: stretch; width: 232px;', '.hb-plaque { position: relative; align-self: stretch; width: 170px;'],
  ['AW-62 the top bar cuts a hero\'s job', 'src/styles/app.css', '  min-width: 0; max-width: 360px;\n', '  min-width: 0; max-width: 250px;\n'],
  ['AW-62 a wide font clips the stance words', 'src/styles/hunt.css', 'font-size: var(--t-micro); font-size-adjust: var(--f-ui-aspect); letter-spacing: 0;', 'font-size: var(--t-micro); letter-spacing: 0;'],
  ['AW-62 a wide font cuts a hero\'s job', 'src/styles/app.css', '.char-tab-doing { font-size: var(--t-micro); font-size-adjust: var(--f-ui-aspect);', '.char-tab-doing { font-size: var(--t-micro);'],
  ['AW-62 the how-to stays beside a card', 'src/styles/shell.css', '[data-hs-win="hunts"]:has(.hs-win-coach .hs-pointer) .hw-hunts-now.is-hint { display: none; }\n', ''],
  ['AW-62 the analyzer tab runs past the panel', 'src/styles/hunt.css', '.ha-tabs .ha-tab { margin-bottom: -2px; padding: 0 4px; }', '.ha-tabs .ha-tab { margin-bottom: -2px; }'],
  ['AW-63 Enter off has no reason beside it', 'src/shell/windows/hunts.js', "  text(det.querySelector('.hw-enter-why'), off);\n", ''],
  ['AW-63 a member has no way out at Enter', 'src/shell/windows/hunts.js', "  prop(det.querySelector('[data-hs-act=\"leave-party\"]'), 'hidden', now || !follower);\n", ''],
  ['AW-63 the answer covers Leave party', 'src/styles/windows.css', '.hs-win .hw-party > .hh-intent-msg:not(:empty) { position: static; }\n', ''],
  ['AW-63 Disband goes on one press', 'src/shell/widgets/party-panel.js', '    if (!sc.disbandArmed) {', '    if (false) {'],
  ['AW-63 an old answer stands after a seat came', 'src/shell/windows/party.js', "if (sc.msgSeats !== undefined && !sc.pending) sc.msg = '';", ''],
  ['AW-61 a window title clips again', 'src/styles/shell.css', '.hs-win-title { margin: 0; flex: 1; min-width: 0;', '.hs-win-title { margin: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'],
  ['AW-61 Shop names are cut again', 'src/styles/windows.css', '  .hw-shop .hw-line { flex-wrap: wrap; justify-content: flex-end; }', ''],
  ['AW-61 the summary ignores who may press', 'src/shell/windows/hunt-summary.js', "prop(go, 'disabled', sc.pending || huntOpen || !again || !route.how);", "prop(go, 'disabled', sc.pending || huntOpen || !again);"],
  ['AW-61 the leader enters alone', 'src/shell/windows/hunt-summary.js', "if (how === 'party') leadAgain(ctx, cs, sc, repaint, args.hunt);\n    else if (how === 'enter')", "if (how)"],
  ['a press on a window reaches the World', 'src/world/world-boot.js', "if (!walk || !scene || scene.kind === 'hunt' || !onWorld(e)) return;", "if (!walk || !scene || scene.kind === 'hunt') return;"],
  ['an open window takes the walk keys', 'src/world/world-boot.js', '    if (keyBelongsToField(t, e.code)) { letGo(); return; }', "    if (keyBelongsToField(t, e.code) || (t.closest && t.closest('[data-hs-win]'))) { letGo(); return; }"],
  ['the mill hatch opens nothing', 'src/world/world-boot.js', "    hunt: (id) => emit('entrance', { hunt: id }),", '    hunt: () => false,'],
  ['a hunt carries only part of its own stack', 'src/shell/hunt-list.js', '.map((r) => ({ item: r.id, qty: Math.min(PACK_QTY_MAX, r.qty) }))', '.map((r) => ({ item: r.id, qty: Math.min(PACK_QTY_MAX, r.qty, 10) }))'],
  ['a Shift-press in Storage moves one at a time', 'src/shell/windows/storage.js', "{ id, dir: action, qty: ev.shiftKey ? 'all' : 1 }", '{ id, dir: action, qty: 1 }'],
  ['the skills are one window again', 'src/shell/windows/work.js', "import { tradeLedger } from './skills.js';", "import { tradeLedger as tradeOnly, combatLedger } from './skills.js';\nconst tradeLedger = Object.assign(() => combatLedger() + tradeOnly(), { patch: (b, c) => { combatLedger.patch(b, c); tradeOnly.patch(b, c); } });"],
  ['AW-30 the window opacity is not kept in the residue', 'src/session/residue.js', '  panelAlpha: sanitizePanelAlpha,', ''],
  ['AW-30 the windows do not follow the opacity setting', 'src/shell/panel-alpha.js', '  return Number.isInteger(v) ? v : PANEL_ALPHA.initial;', '  return globalThis.__panelAlpha ?? PANEL_ALPHA.initial;'],
  ['AW-30 the opacity fades the whole window, words and all', 'src/styles/shell.css', '  image-rendering: pixelated; opacity: var(--panel-alpha);\n}', '  image-rendering: pixelated;\n}\n.hs-win { opacity: var(--panel-alpha); }'],
];

const COMPANION = {};

const GUARD = 'tests/alpha-windows-frame.mjs';
/* A mutant whose name starts so is judged by that pure rule function on a planted copy of src (tickerMutant), never the page. */
const JUDGES = {
};

async function main() {
  const g = { guard: GUARD, green: 'window presses and focus never steal the World; no void; Hunts from the hatch in two presses; nothing clips; the window opacity; a window opens whole; no window on the hunt’s controls; one window header', pure: null, checks: checks, mutants: MUTANTS, companion: COMPANION, judges: JUDGES };
  if (process.argv.includes('--shard-plan')) return shardPlan(g);
  if (process.argv.includes('--mutate')) return mutate(g);
  return plain(g);
}

main().then((code) => process.exit(code));
