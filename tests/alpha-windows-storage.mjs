#!/usr/bin/env node
// mutant-rule-functions: checks
// mutant-runner-functions: main
// ════════════════════════════════════════════════════════════════════════
// tests/alpha-windows-storage.mjs — STORAGE: AMOUNTS, SORT, A PRESS ANSWERED IN VIEW, IN A REAL CHROMIUM.
//
//   node tests/alpha-windows-storage.mjs               the rules
//   node tests/alpha-windows-storage.mjs --mutate      every planted defect must turn a rule RED
//   node tests/alpha-windows-storage.mjs --mutate --only=<prefix>   just the mutants whose name starts so
//   node tests/alpha-windows-storage.mjs --mutate --shard=K/N   the Kth of N shards, balanced by measured seconds (CI splits them)
//   node tests/alpha-windows-storage.mjs --shard-plan   no browser: smoke.yml's shards cover every mutant once, each in budget
//   node tests/alpha-windows-storage.mjs --shots <dir>  also write the visual-gate screenshots (1440x900 and 922x423)
//
// mutant-anchors: src/shell/press-ack.js src/shell/windows/inventory/bury.js src/shell/windows/inventory/state.js src/shell/bag-model.js src/shell/windows/storage.js src/styles/windows.css
// mutant-writes-tree: no — page mutants are served overrides (tests/_alpha-windows.mjs pageRun)
//
// One of the alpha windows' guards, split from tests/alpha-windows.mjs (2026-11-19, arch audit item 7): tests/_alpha-windows.mjs
// is the harness they share (play.html with supabase-js and the REST paths stubbed, the character's envelope
// tests/fixtures/alpha-envelope.json) and says which guard holds which window's rules.
//
// The Storage window: a press answers in view and off the stack pressed, any amount (one, Shift the stack, a right-click
// asks), sort and filter, presses queue and Deposit all materials, and fueling the Hearth and cooking from the bag, paid
// only by the server.
//
//   AW-65 A STORAGE PRESS ANSWERS IN VIEW (Andy, analytics 11-02: 14 presses in 25 s): at 1366x768 with both grids long and the bag
//         scrolled into reach, "Putting it away…" and the result or the refusal stand in view and off the stack pressed; no stack moves
//         from under the hand; a hero out hunting is told why at the press, and the line goes once the hero is home
//   AW-18 AMOUNTS (Tyler live 10-18, "it's all or nothing"): in Storage a press
//         moves ONE, Shift-press the whole stack, and a right-click asks how many
//         (Enter confirms); each is ONE hr_bank_move naming exactly that count, and
//         store 3 of 10 reads bag 7 / storage 3 from the envelope, before and after a reload
//   AW-23 SORT AND FILTER (Tyler 10-22, "storage doesn't have a way to sort or filter"):
//         a kind chip and the search narrow both Storage grids, Count orders by the
//         stack, Newest puts the stack just stored first, and the chip and sort are
//         remembered (ONE residue put naming storeView) and come back after a reload
//   AW-19 FUEL THE HEARTH (Tyler live 10-18, "can't bury bones"; 10-25: Inner Flame replaces
//         Prayer): bones offer Burn all N; it is ONE set_activity { kind:'artisan', id:'fuel_bones' }
//         and nothing else, the Fueling line reads the server's pointer, Stop is ONE set_activity
//         idle and says what the server burned, and the bag and the Inner Flame XP change only from
//         the envelope (and stay after a reload); a fuel above the server's Inner Flame says so in
//         words and sends nothing
//   AW-20 COOK IS A JOB (playtest 10-22: Raw Wolf Meat sold for 1 gp, nothing said it cooks; 09-crafting
//         4.17: no bench): a raw fish a Cooking job takes offers Cook, which opens the Work window on
//         that job's row and sends nothing; the bag moves only from the server
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, tradeJobsFixture } from './_client-harness.mjs';
import { clone, wait, reloadAndPlay, pushEnvelope, openWin, count, sent, pageRun, plain, mutate, shardPlan } from './_alpha-windows.mjs';

/* The page rules, in the monolith's order (a mutant is caught by the first rule that goes red: tests/_alpha-windows.mjs pageRun). */
async function checks(overrides, shots, opts) {
  return pageRun(overrides, shots, opts, null, async ({ fails, open, shot }) => {
    /* mutant-rules-start */
    { // AW-65 a Storage press answers in view
      const { ITEMS } = await import(pathToFileURL(join(ROOT, 'src/data/items.js')).href);
      const W65 = '[data-hs-win="storage"] ';
      const STACK = W65 + '[data-side="bag"] .hw-pocket[data-item="copper_ore"]';
      const stored = Object.fromEntries(Object.keys(ITEMS).slice(0, 60).map((i) => [i, 3]));
      const bagFull = Object.fromEntries(Object.keys(ITEMS).slice(60, 100).map((i) => [i, 14]));
      const long = (e) => { e.bank = Object.assign({}, stored); e.inventory = Object.assign({}, e.inventory, bagFull, { copper_ore: 14 }); };
      /* The line as a player sees it: its words, in the scrolled body's view or not, and whether it lies on the stack. The bag scrolled into
         reach is the window's body or, side by side (UI audit 2026-11-18 #4), the bag's own well; the stack is whole in view or not. */
      const lineNow = (page) => page.evaluate(([w, st]) => {
        const body = document.querySelector(w + '[data-hs-body]'), m = document.querySelector(w + '.hh-intent-msg'), s = document.querySelector(st);
        const well = s.closest('.hw-store-well');
        const b = body.getBoundingClientRect(), r = m.getBoundingClientRect(), k = s.getBoundingClientRect(), v = (well || body).getBoundingClientRect();
        return { text: m.textContent, scrolled: body.scrollTop + (well ? well.scrollTop : 0), inView: r.height > 0 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1, onStack: r.height > 0 && r.top < k.bottom && k.top < r.bottom,
          sending: s.classList.contains('is-sending'), stackTop: Math.round(k.top), stackWhole: k.top >= v.top - 1 && k.bottom <= v.bottom + 1, lineH: Math.round(r.height) };
      }, [W65, STACK]);
      const reach = async (page) => {
        await openWin(page, 't', 'storage');
        await page.waitForTimeout(300);
        await page.locator(STACK).scrollIntoViewIfNeeded();
        await page.evaluate((st) => document.querySelector(st).scrollIntoView({ block: 'end' }), STACK);
        await page.waitForTimeout(100);
      };
      {
        const { ctx, page, errors, s, up } = await open({ viewport: { width: 1366, height: 768 }, mutateEnv: (e) => { long(e); for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k]; e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 400 }); } });
        if (!up) fails.push('AW-65 the town did not mount');
        else {
          await reach(page);
          const before = await lineNow(page);
          if (!before.scrolled) fails.push('AW-65 CONTROL: the window does not scroll, so this proves nothing');
          s.delayMs = 700;
          await page.click(STACK);
          await page.waitForTimeout(150);
          const waiting = await lineNow(page);
          if (!/^Depositing/.test(waiting.text) || !waiting.inView || !waiting.sending) fails.push('AW-65 a press in a scrolled bag, while it waits: ' + JSON.stringify(waiting));
          await wait(page, (w) => /^Put away/.test(document.querySelector(w + '.hh-intent-msg').textContent), W65, 4000);
          await page.waitForTimeout(150);
          const done = await lineNow(page);
          if (!done.inView) fails.push('AW-65 the result of a press in a scrolled bag is out of sight: ' + JSON.stringify(done));
          if (done.onStack) fails.push('AW-65 the answer lies on the stack just pressed: ' + JSON.stringify(done));
          /* the answer's coming takes no room from the bag: the stack pressed is still whole in view, where it was */
          if (!done.stackWhole || done.stackTop !== before.stackTop) fails.push('AW-65 the answer slid the stack from under the hand: ' + JSON.stringify([before, done]));
          /* ...whatever room the window has left under its cap: the answer's line holds its height before any answer comes (at the cap a
             line that arrived would shorten the wells: 583 then 558 on the first side-by-side build) */
          if (!(before.lineH > 0) || Math.abs(before.lineH - done.lineH) > 1) fails.push('AW-65 the answer\'s line has no room of its own before it comes: ' + JSON.stringify([before.lineH, done.lineH]));
          /* The next press lands where the hand is: its answer moves nothing now the line is up. */
          await page.click(STACK);
          await page.waitForTimeout(100);
          await wait(page, (w) => /^Put away/.test(document.querySelector(w + '.hh-intent-msg').textContent), W65, 4000);
          await page.waitForTimeout(150);
          const twice = await lineNow(page);
          if (twice.stackTop !== done.stackTop) fails.push('AW-65 the stack moved under the hand: y ' + done.stackTop + ' then ' + twice.stackTop);
          if (sent(s, 'hr_bank_move').length !== 2) fails.push('AW-65 two presses sent ' + sent(s, 'hr_bank_move').length + ' moves');
          s.delayMs = 0;
          s.reply = { ok: false, error: 'bank_full', cap: 400 };
          await page.click(STACK);
          await wait(page, (w) => /full/.test(document.querySelector(w + '.hh-intent-msg').textContent), W65, 5000);
          const refused = await lineNow(page);
          if (refused.text !== 'Storage full' || !refused.inView) fails.push('AW-65 a refusal in a scrolled bag: ' + JSON.stringify(refused));
          s.reply = { ok: true };
        }
        if (errors.length) fails.push('AW-65 console errors: ' + errors.slice(0, 2).join(' | '));
        await ctx.close();
      }
      { /* ON A PHONE (922x423) THE SHEET SCROLLS AS ONE, the bag first and the answer's line last (windows.css; the side-by-side desktop window above
           keeps its line in a row of its own, so since v0.2.141 only here does the line stand at the foot of a scrolled body: run 44476966121).
           A stack pressed at the foot of the view: its answer stands in view (sticky at the body's foot), and off the stack (press-ack.js
           clearOfAnswer moves the bag up from under it). */
        const { ctx, page, errors, up } = await open({ viewport: { width: 922, height: 423 }, mutateEnv: (e) => { long(e); for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k]; e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 400 }); } });
        if (!up) fails.push('AW-65 the phone\'s town did not mount');
        else {
          await reach(page);
          const before = await lineNow(page);
          /* the stack stands at the foot of the sheet's view, where the line comes: else neither rule is reached */
          const atFoot = await page.evaluate(([w, st]) => { const b = document.querySelector(w + '[data-hs-body]').getBoundingClientRect(), k = document.querySelector(st).getBoundingClientRect();
            return k.bottom > b.bottom - 40 && k.bottom <= b.bottom + 1; }, [W65, STACK]);
          if (!before.scrolled || !atFoot) fails.push('AW-65 CONTROL: the phone\'s sheet does not scroll the stack to its foot, so this proves nothing: ' + JSON.stringify(before));
          await page.click(STACK);
          await wait(page, (w) => /^Put away/.test(document.querySelector(w + '.hh-intent-msg').textContent), W65, 4000);
          await page.waitForTimeout(150);
          const done = await lineNow(page);
          if (!done.inView) fails.push('AW-65 on a phone the result of a press in a scrolled bag is out of sight: ' + JSON.stringify(done));
          if (done.onStack) fails.push('AW-65 on a phone the answer lies on the stack just pressed: ' + JSON.stringify(done));
        }
        if (errors.length) fails.push('AW-65 console errors (phone): ' + errors.slice(0, 2).join(' | '));
        await ctx.close();
      }
      {
        const { ctx, page, errors, s, up } = await open({ viewport: { width: 1366, height: 768 }, mutateEnv: long });
        if (!up) fails.push('AW-65 the hunt did not mount');
        else {
          await reach(page);
          await page.click(STACK, { button: 'right', force: true });
          await page.waitForTimeout(150);
          const asked = await lineNow(page);
          if (!/in town/i.test(asked.text) || !asked.inView) fails.push('AW-65 a right-click with the hero out hunting does not say why in view: ' + JSON.stringify(asked));
          /* Home: the line no longer holds. */
          const away = clone(s.env);
          for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete s.env[k];
          s.env.state = Object.assign({}, s.env.state, { active_kind: 'idle', active_id: null });
          await pushEnvelope(page, s);
          await page.waitForTimeout(200);
          const home = await lineNow(page);
          if (home.text) fails.push('AW-65 back in town the line still says ' + JSON.stringify(home.text));
          /* Out again, the line empty: a press says why by itself. */
          s.env = away;
          await pushEnvelope(page, s);
          await page.waitForTimeout(200);
          await page.evaluate((st) => document.querySelector(st).scrollIntoView({ block: 'end' }), STACK);
          await page.click(STACK, { force: true });
          await page.waitForTimeout(150);
          const said = await lineNow(page);
          if (!/in town/i.test(said.text) || !said.inView) fails.push('AW-65 a press with the hero out hunting does not say why in view: ' + JSON.stringify(said));
          if (sent(s, 'hr_bank_move').length) fails.push('AW-65 a hero out hunting sent a move');
        }
        if (errors.length) fails.push('AW-65 console errors (hunting): ' + errors.slice(0, 2).join(' | '));
        await ctx.close();
      }
    }

    { // AW-18 amounts in Storage; AW-19 bury — a stateful stub: the server's answer moves its own counts
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 40 });
        e.bank = { oak_logs: 12, iron_bar: 3, shrimp: 2 };
        e.inventory = Object.assign({}, e.inventory, { shrimp: 4, big_bones: 2, bronze_arrows: 12000 });
        e.trade_jobs = tradeJobsFixture(e.now);
      };
      const { ctx, page, errors, s, up } = await open({ mutateEnv: town });
      const shift = (from, to, id, n) => { from[id] -= n; if (!from[id]) delete from[id]; to[id] = (to[id] || 0) + n; };
      s.onCall = (name, b) => {
        if (name === 'hr_bank_move' && s.reply.ok !== false) { if (b.p_dir === 'deposit') shift(s.env.inventory, s.env.bank, b.p_item, b.p_qty); else shift(s.env.bank, s.env.inventory, b.p_item, b.p_qty); }
        if (name === 'hr-accrue' && b.verb === 'set_activity') {
          if (b.activity.kind === 'artisan') Object.assign(s.env.state, { active_kind: 'artisan', active_id: b.activity.id });
          else {
            const inv = s.env.inventory;
            if (s.env.state.active_id === 'fuel_bones') { s.env.skills.inner_flame.xp += 6 * (inv.bones || 0); delete inv.bones; }
            Object.assign(s.env.state, { active_kind: 'idle', active_id: null });
          }
        }
      };
      const sc = (side, id) => page.evaluate(([sd, i]) => { const li = document.querySelector('[data-hs-win="storage"] .hw-pockets[data-side="' + sd + '"] .hw-pocket[data-item="' + i + '"]'); return li ? (li.querySelector('.hw-count').textContent || '1') : null; }, [side, id]);
      if (!up) fails.push('AW-18 the town did not mount');
      else {
        await openWin(page, 't', 'storage');
        /* store 3 of 10 through the picker: right-click, type 3, Enter */
        await page.click('[data-hs-win="storage"] [data-side="bag"] .hw-pocket[data-item="copper_ore"]', { button: 'right' });
        const picker = await wait(page, () => document.querySelector('.hw-menu.is-on .hw-amt-n'), null, 2000);
        if (!picker) fails.push('AW-18 a right-click on a bag stack in Storage did not ask how many');
        else {
          await page.fill('.hw-menu .hw-amt-n', '3');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(800);
        }
        let mv = sent(s, 'hr_bank_move');
        if (mv.length !== 1 || mv[0].body.p_item !== 'copper_ore' || mv[0].body.p_qty !== 3 || mv[0].body.p_dir !== 'deposit') fails.push('AW-18 Store 3 sent ' + JSON.stringify(mv.map((c) => c.body)));
        if ((await sc('bag', 'copper_ore')) !== '7' || (await sc('bank', 'copper_ore')) !== '3') fails.push('AW-18 after storing 3 of 10 the bag shows ' + (await sc('bag', 'copper_ore')) + ' and storage ' + (await sc('bank', 'copper_ore')));
        if (!(await reloadAndPlay(page))) fails.push('AW-18 the reload did not come back');
        else {
          await openWin(page, 't', 'storage');
          await page.waitForTimeout(300);
          if ((await sc('bag', 'copper_ore')) !== '7' || (await sc('bank', 'copper_ore')) !== '3') fails.push('AW-18 after a reload the bag shows ' + (await sc('bag', 'copper_ore')) + ' and storage ' + (await sc('bank', 'copper_ore')));
          /* a press takes ONE out; a Shift-press takes the whole stack */
          await page.click('[data-hs-win="storage"] [data-side="bank"] .hw-pocket[data-item="oak_logs"]');
          await page.waitForTimeout(700);
          await page.click('[data-hs-win="storage"] [data-side="bank"] .hw-pocket[data-item="iron_bar"]', { modifiers: ['Shift'] });
          await page.waitForTimeout(700);
          mv = sent(s, 'hr_bank_move').slice(1).map((c) => c.body.p_item + ':' + c.body.p_qty + ':' + c.body.p_dir);
          if (mv.join() !== 'oak_logs:1:withdraw,iron_bar:3:withdraw') fails.push('AW-18 a press then a Shift-press sent ' + JSON.stringify(mv));
          if ((await sc('bank', 'oak_logs')) !== '11') fails.push('AW-18 one oak log out leaves storage showing ' + (await sc('bank', 'oak_logs')));
          /* AW-18b (Andy 10-26): 12,000 arrows, Shift-pressed, go in as ONE hr_bank_move of 12,000; a refused deposit
             says the bag's words (not Storage's) in a line the player can see without scrolling, and moves nothing. */
          const W18 = '[data-hs-win="storage"] ';
          const msgSeen = () => page.evaluate((w) => {
            const m = document.querySelector(w + '.hh-intent-msg'); const win = document.querySelector(w.trim());
            if (!m || !m.textContent) return null;
            const r = m.getBoundingClientRect(); let box = win.getBoundingClientRect();
            for (let n = m.parentElement; n && n !== win.parentElement; n = n.parentElement) {
              if (/(auto|scroll|hidden)/.test(getComputedStyle(n).overflowY)) { const b = n.getBoundingClientRect(); box = { top: Math.max(box.top, b.top), bottom: Math.min(box.bottom, b.bottom) }; }
            }
            return { text: m.textContent, shown: r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 };
          }, W18);
          s.reply = { ok: false, error: 'insufficient_item', item_id: 'copper_ore', have: 0, need: 7 };
          await page.click(W18 + '[data-side="bag"] .hw-pocket[data-item="copper_ore"]', { modifiers: ['Shift'] });
          await page.waitForTimeout(800);
          s.reply = { ok: true };
          const said = await msgSeen();
          if (!said || said.text !== 'Not enough Copper Ore left') fails.push('AW-18b a refused deposit says ' + JSON.stringify(said && said.text));
          else if (!said.shown) fails.push('AW-18b the refusal of a deposit is out of sight (under the grids, where a full bag scrolls it away)');
          if ((await sc('bag', 'copper_ore')) !== '7') fails.push('AW-18b a refused deposit moved the bag to ' + (await sc('bag', 'copper_ore')));
          await page.click(W18 + '[data-side="bag"] .hw-pocket[data-item="bronze_arrows"]', { modifiers: ['Shift'] });
          await page.waitForTimeout(800);
          const arrows = sent(s, 'hr_bank_move').slice(-1).map((c) => c.body.p_item + ':' + c.body.p_qty + ':' + c.body.p_dir).join();
          if (arrows !== 'bronze_arrows:12000:deposit') fails.push('AW-18b a Shift-press on 12,000 arrows sent ' + arrows);
          const label = await page.evaluate((w) => { const li = document.querySelector(w + '[data-side="bank"] .hw-pocket[data-item="bronze_arrows"]'); return li ? li.getAttribute('aria-label') : null; }, W18);
          if (!/, 12,000: /.test(String(label)) || (await sc('bag', 'bronze_arrows')) !== null) fails.push('AW-18b after 12,000 arrows went in, storage reads ' + JSON.stringify(label) + ' and the bag ' + (await sc('bag', 'bronze_arrows')));
          const done = await msgSeen();
          if (!done || !/^Deposited 12,000 /.test(done.text) || !done.shown) fails.push('AW-18b the 12,000-arrow deposit says ' + JSON.stringify(done));
          await page.click(W18 + '[data-side="bank"] .hw-pocket[data-item="bronze_arrows"]', { modifiers: ['Shift'] });
          await page.waitForTimeout(800);
          if ((await sc('bag', 'bronze_arrows')) === null) fails.push('AW-18b the 12,000 arrows did not come back out');
          /* AW-23 sort and filter: storage holds oak_logs 11, copper_ore 3, shrimp 2 (iron_bar went back to the bag) */
          const W = '[data-hs-win="storage"] ';
          const grid = (sd) => page.evaluate((x) => [...document.querySelectorAll('[data-hs-win="storage"] .hw-pockets[data-side="' + x + '"] .hw-pocket')].map((li) => li.getAttribute('data-item')).join(), sd);
          await page.click(W + '.hw-cat[data-cat="food"]');
          await page.waitForTimeout(200);
          if ((await grid('bank')) !== 'shrimp' || (await grid('bag')).includes('copper_ore')) fails.push('AW-23 the Food chip shows storage ' + (await grid('bank')) + ' / bag ' + (await grid('bag')));
          await page.click(W + '.hw-cat[data-cat="all"]');
          await page.selectOption(W + '[data-hs-act="sort"]', 'count');
          await page.waitForTimeout(200);
          if ((await grid('bank')) !== 'oak_logs,copper_ore,shrimp') fails.push('AW-23 Count orders storage ' + (await grid('bank')));
          await page.fill(W + '.hw-q', 'cop');
          await page.waitForTimeout(200);
          if ((await grid('bank')) !== 'copper_ore' || (await grid('bag')) !== 'copper_ore') fails.push('AW-23 the search "cop" shows storage ' + (await grid('bank')) + ' / bag ' + (await grid('bag')));
          await page.fill(W + '.hw-q', '');
          await page.selectOption(W + '[data-hs-act="sort"]', 'newest');
          await page.click(W + '[data-side="bag"] .hw-pocket[data-item="iron_bar"]', { modifiers: ['Shift'] });
          await page.waitForTimeout(700);
          if (!(await grid('bank')).startsWith('iron_bar,')) fails.push('AW-23 Newest does not put the stack just stored first: ' + (await grid('bank')));
          await page.click(W + '.hw-cat[data-cat="material"]');
          await page.selectOption(W + '[data-hs-act="sort"]', 'count');
          await page.waitForTimeout(1900);
          const views = sent(s, 'hr_put_client_state').map((c) => c.body.p_patch && c.body.p_patch.storeView).filter(Boolean);
          const last = views[views.length - 1];
          if (!last || last.cat !== 'material' || last.sort !== 'count') fails.push('AW-23 the chip and sort were not put as storeView: ' + JSON.stringify(views));
          if (!(await reloadAndPlay(page))) fails.push('AW-23 the reload did not come back');
          else {
            await openWin(page, 't', 'storage');
            await page.waitForTimeout(300);
            const sortNow = await page.evaluate(() => document.querySelector('[data-hs-win="storage"] [data-hs-act="sort"]').value);
            if (sortNow !== 'count' || (await grid('bank')) !== 'copper_ore,iron_bar') fails.push('AW-23 after a reload the sort is ' + sortNow + ' and storage shows ' + (await grid('bank')));
            await page.click(W + '.hw-cat[data-cat="all"]');
          }
          if (shots) await shot(page, 'alpha-1440x900-storage');
        }
        /* AW-19 the Hearth: the bones' primary is Burn all 8; ONE set_activity; Stop collects; the server's numbers only */
        await openWin(page, 'b', 'inventory');
        await page.click('[data-hs-win="inventory"] .hw-pocket[data-item="bones"]');
        const prim = await page.evaluate(() => document.querySelector('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]').textContent);
        if (prim !== 'Burn all 8') fails.push('AW-19 the bones offer "' + prim + '", not Burn all 8');
        else {
          await page.click('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]');
          await page.waitForTimeout(800);
          const go = sent(s, 'hr-accrue', 'set_activity');
          if (go.length !== 1 || JSON.stringify(go[0].body.activity) !== '{"kind":"artisan","id":"fuel_bones"}' || Object.keys(go[0].body).sort().join() !== 'activity,intentId,slot,verb')
            fails.push('AW-19 Burn all sent ' + JSON.stringify(go.map((c) => c.body)));
          const line = await page.evaluate(() => { const b = document.querySelector('[data-hs-win="inventory"] .hw-burying'); return b && b.classList.contains('is-on') ? b.textContent : ''; });
          if (!/^Fueling the Great Hearth with Bones · 8 left/.test(line)) fails.push('AW-19 no Fueling line from the server pointer: ' + JSON.stringify(line));
          if ((await count(page, 'bones')) !== '8') fails.push('AW-19 the bag painted the bury before the server paid it: bones x' + (await count(page, 'bones')));
          if (shots) await shot(page, 'alpha-1440x900-burying');
          await page.click('[data-hs-win="inventory"] [data-hs-act="bury-stop"]');
          await page.waitForTimeout(800);
          const stop = sent(s, 'hr-accrue', 'set_activity').slice(1);
          if (stop.length !== 1 || JSON.stringify(stop[0].body.activity) !== '{"kind":"idle"}') fails.push('AW-19 Stop sent ' + JSON.stringify(stop.map((c) => c.body)));
          const after = await page.evaluate(() => ({ bones: !!document.querySelector('[data-hs-win="inventory"] .hw-pocket[data-item="bones"]'), msg: document.querySelector('[data-hs-win="inventory"] .hh-intent-msg').textContent }));
          if (after.bones || !/: 8 Bones burned in the Great Hearth · Inner Flame \d+$/.test(after.msg)) fails.push('AW-19 after the server burnt them: ' + JSON.stringify(after));
          if (!(await reloadAndPlay(page))) fails.push('AW-19 the reload did not come back');
          else {
            await openWin(page, 'b', 'inventory');
            await page.waitForTimeout(300);
            if (await page.$('[data-hs-win="inventory"] .hw-pocket[data-item="bones"]')) fails.push('AW-19 the bones came back after a reload');
            /* AW-19 a fuel above the server's Inner Flame (Big Bones need 15; the hero has 2) says so in words and sends nothing */
            await page.click('[data-hs-win="inventory"] .hw-pocket[data-item="big_bones"]');
            const big = await page.evaluate(() => { const b = document.querySelector('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]'); return b && !b.hidden ? b.textContent : null; });
            if (big !== 'Burn all 2') fails.push('AW-19 the big bones offer ' + JSON.stringify(big) + ', not Burn all 2');
            else await page.click('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]');
            await page.waitForTimeout(300);
            const low = await page.evaluate(() => document.querySelector('[data-hs-win="inventory"] .hh-intent-msg').textContent);
            if (big === 'Burn all 2' && (low !== 'Big Bones: requires Inner Flame 15' || sent(s, 'hr-accrue', 'set_activity').length !== 2)) fails.push('AW-19 Burn all above the level said ' + JSON.stringify(low));
            /* AW-20 Cook: the raw fish's item menu offers Cook (its primary is Eat: it heals), a link to its job in the Work window; it sends
               nothing and the bag stays the server's */
            await page.click('[data-hs-win="inventory"] .hw-pocket[data-item="shrimp"]', { button: 'right' });
            await page.waitForTimeout(250);
            const cp = await page.evaluate(() => { const b = document.querySelector('.hw-menu.is-on [data-hs-act="m-cook"]'); return b && !b.disabled ? b.textContent : null; });
            if (cp !== 'Cook') fails.push('AW-20 the raw fish\'s menu offers ' + JSON.stringify(cp) + ', not Cook');
            else {
              await page.click('.hw-menu.is-on [data-hs-act="m-cook"]');
              await page.waitForTimeout(600);
              const at = await page.evaluate(() => ({ win: !!document.querySelector('[data-hs-win="skills-trade"] [data-hs-built]'),
                row: !!document.querySelector('[data-hs-win="skills-trade"] .hw-job[data-key="meal_b0"]') }));
              if (!at.win || !at.row) fails.push('AW-20 Cook did not open the Work window on its job: ' + JSON.stringify(at));
              if (sent(s, 'hr-accrue', 'set_activity').length !== 2) fails.push('AW-20 Cook sent a town intent: ' + JSON.stringify(sent(s, 'hr-accrue', 'set_activity').slice(2).map((c) => c.body)));
              if (shots) await shot(page, 'alpha-1440x900-cook-job');
              await openWin(page, 'b', 'inventory');
              if ((await count(page, 'shrimp')) !== '4') fails.push('AW-20 the bag moved on Cook: shrimp x' + (await count(page, 'shrimp')));
            }
          }
        }
      }
      if (errors.length) fails.push('AW-18 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // AW-18q PRESSES QUEUE, AW-18m DEPOSIT ALL MATERIALS (audit 2026-11-18 A8: a full bag at Level 45 took 46 shift-clicks to empty, and two
      // presses a second dropped some and met "Too many changes, try again"). A stateful stub: each answer moves the server's own counts.
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 40 });
        e.bank = { oak_logs: 12 };
        /* a LOCKED Material stack for Deposit all materials to leave (the fixture's own lock, the Sticky Core, has been a part, Junk in the bag,
           since lane/tp-im-steps, so the lock rule had nothing to hold) */
        e.inventory = Object.assign({}, e.inventory, { iron_ore: 6 });
        e.bag_rules = Object.assign({}, e.bag_rules, { locked: [...((e.bag_rules && e.bag_rules.locked) || []), 'iron_ore'] });
      };
      const { ctx, page, errors, s, up } = await open({ mutateEnv: town });
      const shift = (from, to, id, n) => { from[id] -= n; if (!from[id]) delete from[id]; to[id] = (to[id] || 0) + n; };
      s.onCall = (name, b) => {
        if (name === 'hr_bank_move' && s.reply.ok !== false) { if (b.p_dir === 'deposit') shift(s.env.inventory, s.env.bank, b.p_item, b.p_qty); else shift(s.env.bank, s.env.inventory, b.p_item, b.p_qty); }
        if (name === 'hr_bank_move_many') for (const l of b.p_items || []) { if (l.dir === 'deposit' && s.env.inventory[l.item]) shift(s.env.inventory, s.env.bank, l.item, s.env.inventory[l.item]); }
      };
      const W = '[data-hs-win="storage"] ';
      const moves = () => s.calls.filter((c) => c.name === 'hr_bank_move' || c.name === 'hr_bank_move_many')
        .map((c) => (c.name === 'hr_bank_move' ? c.body.p_item + ':' + c.body.p_qty : 'many:' + c.body.p_items.map((l) => l.item).join('+')));
      if (!up) fails.push('AW-18q the town did not mount');
      else {
        await openWin(page, 't', 'storage');
        await page.waitForTimeout(300);
        /* three whole stacks Shift-pressed in a burst (one task, before any answer: no machine is too slow for it): the first goes, the two pressed
           while it was out go together in ONE ask */
        const burst = (presses) => page.evaluate((list) => {
          for (const [id, shiftKey] of list) document.querySelector('[data-hs-win="storage"] [data-side="bag"] .hw-pocket[data-item="' + id + '"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey, detail: 1 }));
        }, presses);
        await burst([['copper_ore', true], ['normal_log', true], ['wolf_pelt', true]]);
        await wait(page, () => !document.querySelector('[data-hs-win="storage"] .hw-store.is-pending'), null, 4000);
        await page.waitForTimeout(400);
        /* a press on one stack, then two on another while the first is out: the first goes, the two wait and go as ONE move of 2 (a second
           press on the stack being sent is the page's to swallow, press-ack.js: one intent per press) */
        await burst([['rat_tail', false], ['slime_gel', false], ['slime_gel', false]]);
        await wait(page, () => !document.querySelector('[data-hs-win="storage"] .hw-store.is-pending'), null, 4000);
        await page.waitForTimeout(400);
        const said = await page.evaluate((w) => document.querySelector(w + '.hh-intent-msg').textContent, W);
        if (moves().join() !== 'copper_ore:10,many:normal_log+wolf_pelt,rat_tail:1,slime_gel:2' || /Too many/.test(said))
          fails.push('AW-18q a burst of presses sent ' + JSON.stringify(moves()) + ' and says ' + JSON.stringify(said));
        /* DEPOSIT ALL MATERIALS: ONE hr_bank_move_many naming every unlocked Material stack in the bag, whole (ids only), and none after it */
        const btn = await page.evaluate((w) => { const b = document.querySelector(w + '[data-hs-act="deposit-materials"]'); return b ? { text: b.textContent, off: b.disabled } : null; }, W);
        const before = moves().length;
        const plan = await page.evaluate(async (ids) => {
          const v = document.querySelector('script[type=module][src*="?v="]')?.src.split('?v=')[1] || '';
          const bm = await import('/src/shell/bag-model.js?v=' + v);
          return { kinds: Object.fromEntries(ids.map((id) => [id, bm.kindOf(id)])) };
        }, Object.keys(s.env.inventory));
        const lockedMats = s.env.bag_rules.locked.filter((id) => s.env.inventory[id] && plan.kinds[id] === 'material');
        if (!lockedMats.length) fails.push('AW-18m CONTROL: the bag holds no locked Material stack, so the lock rule is unproven (' + JSON.stringify(s.env.bag_rules.locked) + ')');
        if (!btn || btn.off || !/^Deposit all materials \(\d+\)$/.test(btn.text)) fails.push('AW-18m the press reads ' + JSON.stringify(btn));
        else {
          await page.click(W + '[data-hs-act="deposit-materials"]');
          await wait(page, () => !document.querySelector('[data-hs-win="storage"] .hw-store.is-pending'), null, 4000);
          await page.waitForTimeout(400);
          const sent = s.calls.filter((c) => c.name === 'hr_bank_move_many').slice(-1)[0];
          const ids = sent ? sent.body.p_items.map((l) => l.item) : [];
          const locked = new Set(s.env.bag_rules.locked);
          const wrong = ids.filter((id) => plan.kinds[id] !== undefined && plan.kinds[id] !== 'material');
          const bagMats = Object.keys(s.env.inventory).filter((id) => plan.kinds[id] === 'material' && !locked.has(id));
          if (moves().length !== before + 1 || !sent || sent.body.p_items.some((l) => l.dir !== 'deposit' || Object.keys(l).sort().join() !== 'dir,item')
            || wrong.length || ids.some((id) => locked.has(id)) || !ids.includes('bones') || bagMats.length)
            fails.push('AW-18m Deposit all materials sent ' + JSON.stringify(moves().slice(before)) + ' (not materials: ' + wrong.join() + '; left in the bag: ' + bagMats.join() + ')');
          const after = await page.evaluate((w) => { const b = document.querySelector(w + '[data-hs-act="deposit-materials"]'); return b ? { shown: b.getClientRects().length > 0, text: b.textContent } : null; }, W);
          if (!after || after.shown) fails.push('AW-18m with no material left the press is still drawn: ' + JSON.stringify(after));
        }
        if (shots) await shot(page, 'alpha-1440x900-storage-materials');
      }
      if (errors.length) fails.push('AW-18q console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
  });
}

const MUTANTS = [
  ['AW-65 a press\'s answer takes its row from the bag (UI audit #4)', 'src/styles/windows.css', '.hw-store > .hh-intent-msg:empty { display: block; visibility: hidden; min-height: calc(1lh + 12px); }\n', ''],
  ['AW-65 the answer stays behind a scrolled bag', 'src/styles/windows.css', '.hs-win .hh-intent-msg:not(:empty, .ca-msg) { position: sticky; bottom: 0; z-index: 1; padding: 6px 10px; }', '.hs-win .hh-intent-msg:not(:empty, .ca-msg) { padding: 6px 10px; }'],
  ['AW-65 a result lies on the stack pressed', 'src/shell/press-ack.js', '    clearOfAnswer(p.el);\n', '    if (p.refused) clearOfAnswer(p.el);\n'],
  ['AW-65 a press mid-hunt says nothing', 'src/shell/windows/storage.js', 'if (off || !row) { sayAway(cs, sc, repaint); return true; }', 'if (off || !row) return true;'],
  ['AW-65 a right-click mid-hunt says nothing', 'src/shell/windows/storage.js', '    else sayAway(cs, sc, repaint);\n', ''],
  ['AW-65 the why stays up in town', 'src/shell/windows/storage.js', "  if (!away && (sc.msg === STORE_AWAY || sc.msg === STORE_TRAINING)) sc.msg = '';   // back in town, it no longer holds\n", ''],
  ['a press in Storage moves the whole stack', 'src/shell/windows/storage.js', "{ id, dir: action, qty: ev.shiftKey ? 'all' : 1 }", "{ id, dir: action, qty: 'all' }"],
  ['AW-18q a press while another is out is dropped again (audit A8)', 'src/shell/windows/storage.js', '  sc.queue = queuePress(sc.queue, p);\n  if (sc.pending) {', '  if (sc.pending) return;\n  sc.queue = queuePress(sc.queue, p);\n  if (sc.pending) {'],
  ['AW-18q the queued whole stacks go one ask each (audit A8)', 'src/shell/windows/storage.js', '    const r = live.length > 1 && account ?', '    const r = false ?'],
  ['AW-18m Deposit all materials sends nothing (audit A8)', 'src/shell/windows/storage.js', "ids.length && ctx.account) then(moveMany(ctx.account, cs, sc, repaint, ids, 'deposit'));", 'ids.length && ctx.account) void ids;'],
  ['AW-18m Deposit all materials takes a locked stack (audit A8)', 'src/shell/storage-model.js', "if (kindOf(r.id) !== 'material' || (locked && locked.has(r.id))) continue;", "if (kindOf(r.id) !== 'material') continue;"],
  ['the Storage chip and sort are not applied', 'src/shell/windows/storage.js', '  const o = { cat: prefs.cat, query: sc.query, sort: prefs.sort,', "  const o = { cat: 'all', query: sc.query, sort: 'name',"],
  ['bones offer no Bury', 'src/shell/windows/inventory/state.js', "  if (br) return ['bury', buryLabel(br, buryQty(st.cs, id), st.cs)];\n", ''],
  ['Stop does not collect', 'src/shell/windows/inventory/bury.js', "cs.edgeIntent('set_activity', { activity: { kind: 'idle' } })", "Promise.resolve({ ok: true })"],
  ['raw food offers no Cook', 'src/shell/bag-model.js', "      if (j.trade !== 'cooking' || kindOf(j.face) !== 'food') continue;", '      continue;'],
  ['the Hearth ignores the server level', 'src/shell/windows/inventory/bury.js', "  if (lv < (e.recipe.req || 1)) return", "  if (false) return"],
];

const COMPANION = {};

const GUARD = 'tests/alpha-windows-storage.mjs';
/* A mutant whose name starts so is judged by that pure rule function on a planted copy of src (tickerMutant), never the page. */
const JUDGES = {
};

async function main() {
  const g = { guard: GUARD, green: 'a Storage press answers in view; store any amount; storage sorts and filters; presses queue; deposit all materials; bury and cook pay from the server', pure: null, checks: checks, mutants: MUTANTS, companion: COMPANION, judges: JUDGES };
  if (process.argv.includes('--shard-plan')) return shardPlan(g);
  if (process.argv.includes('--mutate')) return mutate(g);
  return plain(g);
}

main().then((code) => process.exit(code));
