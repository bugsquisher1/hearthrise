#!/usr/bin/env node
// mutant-rule-functions: checks
// mutant-runner-functions: main
// ════════════════════════════════════════════════════════════════════════
// tests/alpha-windows-return.mjs — THE WAY HOME: THE HUNT SUMMARY, BACK IN TOWN AND THE SHOP'S SALE, IN A REAL CHROMIUM.
//
//   node tests/alpha-windows-return.mjs                the rules
//   node tests/alpha-windows-return.mjs --mutate       every planted defect must turn a rule RED
//   node tests/alpha-windows-return.mjs --mutate --only=<prefix>   just the mutants whose name starts so
//   node tests/alpha-windows-return.mjs --mutate --shard=K/N   the Kth of N shards, balanced by measured seconds (CI splits them)
//   node tests/alpha-windows-return.mjs --shard-plan   no browser: smoke.yml's shards cover every mutant once, each in budget
//   node tests/alpha-windows-return.mjs --shots <dir>  also write the visual-gate screenshots (1440x900 and 922x423)
//
// mutant-anchors: src/shell/windows/inventory/bury.js src/shell/windows/inventory/grid.js src/shell/windows/shop.js src/shell/windows/hunts.js src/shell/launcher.js src/styles/windows.css src/shell/shell.js src/shell/shell-hud.js src/shell/alerts.js src/shell/windows/hunt-summary.js src/data/shell-windows.js src/data/hunt-tutorial.js src/shell/windows/inventory/index.js src/styles/summary.css
// mutant-writes-tree: no — page mutants are served overrides (tests/_alpha-windows.mjs pageRun)
//
// One of the alpha windows' guards, split from tests/alpha-windows.mjs (2026-11-19, arch audit item 7): tests/_alpha-windows.mjs
// is the harness they share (play.html with supabase-js and the REST paths stubbed, the character's envelope
// tests/fixtures/alpha-envelope.json) and says which guard holds which window's rules.
//
// After a hunt: one gold press on the way home, the next buy and the first dangerous run, a seed's needs before its
// purchase, the clean return (the summary as the one notice, the card's next step, the sale in view, Services in the Shop),
// top loot in sight, the summary's answer line, and nothing lying on the press in hand.
//
//   AW-74 A SEED SAYS WHAT PLANTING IT NEEDS (coverage bot 2026-11-07: carrot and wheat seeds bought on tier 1 land, every plant refused
//         plot_tier_locked): on the server's tier 1 land a Farming 10 hero's carrot seed reads "Needs plot tier 2 to plant" before the
//         purchase; the turnip seed (tier 1, Farming 1) names no need
//   AW-31 THE CLEAN RETURN (designer walk 2026-10-25 #5, #6; Tyler 2026-10-25 Services in the Shop): a hero leaving the
//         Cellar gets the summary as the one notice (no analyzer, party panel, hunt bar or "has ended" toast); its main press is
//         the tutorial card's next step ("Next: Sell what only pays coin", Hunt again second), which opens the Shop with
//         the card inside it while the hunt bar leaves with the summary; the ring walks the Sell tab -> Sell all loot ->
//         the confirmation's Sell, and the confirmation is in view inside the window (it sat under a long list); no
//         Services icon, and R opens the Shop on its Services tab (stamina and Blessings), closed or open
//   AW-66 THE SUMMARY'S ANSWER IS THE PRESS'S (party panel 2026-11-03): at 1366x620, on a card tall enough to scroll, the line lies on no press (it
//         stood on the gold "Next:" plate, whose foot read as a half-filled progress bar), "Setting out." goes once the hunt it set out on is over,
//         and every press is in reach as the window opens (door panel 2026-11-04: a hunt out of stamina opened with none in sight)
//   AW-67 NOTHING LIES ON THE PRESS IN HAND (newcomer panel 2026-11-03, 1366x768, the coach's line up): a stack in hand drops the last press's
//         result; its Burn all, and Stop while it fuels, take a real press at their middle, over the answer line and inside the column; the
//         player's own scroll is not fought; the Shop's tabs stay whole at the top of a scrolled body; the All characters card's
//         figure says what it is (optimizer panel: "Bag 19,369 gp" beside "Your gold 51.7k")
//   AW-71 THE SAME CARD KEEPS ITS BOX AND ITS WORDS FOLLOW THE SERVER (door panel 2026-11-04): "You have 19 left" stood over a bar reading 6 for a whole hunt
//   AW-72 A RING STANDS CLEAR OF THE ANSWER LINE (door panel 2026-11-04, a phone's Services): the next Bless lay behind "Blessing I is yours."
//   AW-105 THE NEXT GROUND LEADS AFTER A GROUND OUTGROWN (audit 2026-11-19 L2): the Cellar's Level 5 end's ONE gold press is the summary
//         foot's "Go to Meadowbrook Thicket", in view as the window opens at 1440x900, 1280x720 and 667x375, Hunt again gone
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './_client-harness.mjs';
import { barWindows } from './_bar.mjs';
import { LEVEL_5_XP, wait, pushEnvelope, openWin, sent, pageRun, plain, mutate, shardPlan } from './_alpha-windows.mjs';

/* The page rules, in the monolith's order (a mutant is caught by the first rule that goes red: tests/_alpha-windows.mjs pageRun). */
async function checks(overrides, shots, opts) {
  return pageRun(overrides, shots, opts, null, async ({ fails, open, shot }) => {
    /* mutant-rules-start */
    { // AW-78 ONE GOLD PRESS ON THE WAY HOME (UX flow audit 2026-11-11, flow C; Tyler: after 4 h the summary's gold button was still the first tutorial card)
      /* The AW-31 hero (Level 5, no gear in the bag, the bar's lessons read) comes home from the Cellar with the fixture's loot plan: Rat Tail and
         Slime Gel marked Sell, Sticky Core marked Sell but locked. The card waiting is "Sell what only pays coin". */
      const home5 = (e) => {
        e.state = Object.assign({}, e.state, { level_xp: LEVEL_5_XP });
        e.skills = Object.assign({}, e.skills, { farming: { xp: 28, level: 1, frac: 0 } });
        for (const id of ['bronze_sword', 'steel_sword', 'iron_helm', 'iron_platebody', 'shortbow']) delete e.inventory[id];
        e.hunt_settings = Object.assign({}, e.hunt_settings, { slots: [], bar: [] });
      };
      const { ctx, page, s, errors, up } = await open({ mutateEnv: home5, residue: { coach: { read: ['bar_intro'] } } });
      if (!up) fails.push('AW-78 the page did not mount');
      else {
        s.env.hunt = Object.assign({}, s.env.hunt, { ended: true, session: { end_reason: 'left', ended_at: '2026-10-25T00:20:00Z', phase: 'ended' } });
        s.env.state = Object.assign({}, s.env.state, { active_kind: 'idle', active_id: null });
        await pushEnvelope(page, s);
        await wait(page, () => document.querySelector('[data-hs-win="hunt-summary"] [data-hs-built]'), null, 3000);
        await page.waitForTimeout(300);
        const look = () => page.evaluate(() => {
          const w = document.querySelector('[data-hs-win="hunt-summary"]');
          const shown = (b) => !b.hidden && b.getClientRects().length > 0;
          const q = (sel) => w.querySelector(sel);
          const row = q('.hsum-step[data-step="sell"]');
          return {
            gold: Array.from(w.querySelectorAll('button.is-primary')).filter(shown).map((b) => b.getAttribute('data-hs-act') + ':' + (b.getAttribute('data-step') || '')),
            steps: Array.from(w.querySelectorAll('.hsum-step')).map((li) => li.getAttribute('data-step') + (li.classList.contains('is-done') ? ':done' : '')),
            title: row ? row.querySelector('b').textContent : null, words: row ? row.querySelector('small').textContent : null,
            done: row ? (row.querySelector('.hsum-done').hidden ? '' : row.querySelector('.hsum-done').textContent) : null,
            next: q('[data-hs-act="coach-next"]') && shown(q('[data-hs-act="coach-next"]')) ? q('[data-hs-act="coach-next"]').textContent : null,
            ring: Array.from(document.querySelectorAll('[data-coach-ring]')).map((e) => (e.getAttribute('data-hs-act') || '') + ':' + (e.getAttribute('data-step') || '')),
          };
        });
        const before = await look();
        /* the Sell step is the one gold press: its count and value are the server's (31 Rat Tail at 6, 12 Slime Gel at 5), the locked Sticky Core left out;
           the coach's next step is a press, not the gold one, and the card rings the row it is about */
        /* (the rows after it are the Next ground line, a Level 5 back from the Cellar: the Hunts list recommends the Thicket, tests/hunt-summary.mjs T6; and the Next buy
           line, this hero's bare helmet slot and where its weight's helmet comes from, AW-98's row; neither is ever gold) */
        if (JSON.stringify(before.gold) !== '["town:sell"]' || JSON.stringify(before.steps) !== '["sell","ground","buy"]') fails.push('AW-78 the gold presses on the summary are ' + JSON.stringify(before));
        if (before.title !== 'Sell 2 stacks for 246 gp' || before.words !== 'Marked Sell: Rat Tail and Slime Gel') fails.push('AW-78 the Sell row reads ' + JSON.stringify([before.title, before.words]));
        if (before.next !== 'Next: Sell junk') fails.push('AW-78 the card\'s next step is not a press on the summary: ' + JSON.stringify(before.next));
        if (JSON.stringify(before.ring) !== '["town:sell"]') fails.push('AW-78 the return card rings ' + JSON.stringify(before.ring) + ', want the summary\'s Sell row');
        if (shots) await shot(page, 'alpha-1440x900-back-in-town');
        /* the press: ONE vendor_sell_many naming the plan's stacks whole; the server's answer (the stacks gone) turns the row to Done, and Hunt again is gold */
        s.onEdge = (body) => { if (body.verb === 'vendor_sell_many') { delete s.env.inventory.rat_tail; delete s.env.inventory.slime_gel; } };
        await page.click('[data-hs-win="hunt-summary"] [data-hs-act="town"][data-step="sell"]');
        await wait(page, () => { const w = document.querySelector('[data-hs-win="hunt-summary"]'); return w && w.querySelector('.hsum-step[data-step="sell"].is-done'); }, null, 4000);
        await page.waitForTimeout(200);
        const sales = sent(s, 'hr-accrue', 'vendor_sell_many');
        if (sales.length !== 1 || JSON.stringify(sales[0].body.lines) !== '[{"item":"rat_tail","qty":31},{"item":"slime_gel","qty":12}]') fails.push('AW-78 the Sell step sent ' + JSON.stringify(sales.map((c) => c.body.lines)));
        const after = await look();
        if (JSON.stringify(after.steps) !== '["sell:done","ground","buy"]' || after.done !== 'Done' || after.title !== 'Sell 2 stacks for 246 gp') fails.push('AW-78 after the sale the row reads ' + JSON.stringify(after));
        if (JSON.stringify(after.gold) !== '["again:"]') fails.push('AW-78 after the sale the gold presses are ' + JSON.stringify(after.gold) + ', want Hunt again alone');
        if (shots) await shot(page, 'alpha-1440x900-back-in-town-done');
        if (errors.length) fails.push('AW-78 console errors: ' + errors.join(' | ').slice(0, 300));
      }
      await ctx.close();
      /* on a phone the same list, stacked: the first open step's gold press stands under the reason, before the numbers, in view as the sheet opens */
      const phone = await open({ viewport: { width: 922, height: 423 }, mutateEnv: home5, residue: { coach: { read: ['bar_intro'] } } });
      if (!phone.up) fails.push('AW-78 the phone page did not mount');
      else {
        phone.s.env.hunt = Object.assign({}, phone.s.env.hunt, { ended: true, session: { end_reason: 'left', ended_at: '2026-10-25T00:20:00Z', phase: 'ended' } });
        phone.s.env.state = Object.assign({}, phone.s.env.state, { active_kind: 'idle', active_id: null });
        await pushEnvelope(phone.page, phone.s);
        await wait(phone.page, () => document.querySelector('[data-hs-win="hunt-summary"] [data-hs-built]'), null, 3000);
        await phone.page.waitForTimeout(300);
        const sheet = await phone.page.evaluate(() => {
          const w = document.querySelector('[data-hs-win="hunt-summary"]');
          const box = w.querySelector('[data-hs-body]').getBoundingClientRect();
          const gold = Array.from(w.querySelectorAll('button.is-primary')).filter((b) => !b.hidden && b.getClientRects().length);
          const r = gold.length === 1 ? gold[0].getBoundingClientRect() : null;
          const stats = w.querySelector('.hsum-stats').getBoundingClientRect(), reason = w.querySelector('.hsum-reason').getBoundingClientRect();
          return { gold: gold.map((b) => b.getAttribute('data-hs-act') + ':' + (b.getAttribute('data-step') || '')), inView: !!r && r.top >= box.top && r.bottom <= Math.min(box.bottom, window.innerHeight),
            order: !!r && r.top >= reason.bottom && r.bottom <= stats.top };
        });
        if (JSON.stringify(sheet.gold) !== '["town:sell"]' || !sheet.inView || !sheet.order) fails.push('AW-78 on a phone the Sell step reads ' + JSON.stringify(sheet) + ', want its gold press alone, in view, under the reason and before the numbers');
        if (shots) await shot(phone.page, 'alpha-922x423-back-in-town');
      }
      await phone.ctx.close();

      /* AW-105 THE NEXT GROUND LEADS AFTER A GROUND OUTGROWN (audit 2026-11-19 L2, played at 1440x900: the Cellar's Level 5 end opened on a greyed
         Hunt again and "Hunt again off: Ground outgrown", and the Next ground row lay under the sticky foot, below the window's edge). The same
         Level 5 hero, its Cellar hunt ended `outgrown`: the window's ONE gold press is the foot's "Go to Meadowbrook Thicket", inside the window as it
         opens at 1440x900, 1280x720 and 667x375, Hunt again gone; the press opens Hunts on that ground (the Next ground row's own link) */
      for (const [vp, tag] of [[{ width: 1440, height: 900 }, '1440x900'], [{ width: 1280, height: 720 }, '1280x720'], [{ width: 667, height: 375 }, '667x375']]) {
        const o = await open({ viewport: vp, mutateEnv: home5, residue: { coach: { read: ['bar_intro'] } } });
        if (!o.up) { fails.push('AW-105 the page did not mount at ' + tag); await o.ctx.close(); continue; }
        o.s.env.hunt = Object.assign({}, o.s.env.hunt, { ended: true, session: { end_reason: 'outgrown', ended_at: '2026-10-25T00:20:00Z', phase: 'ended' } });
        o.s.env.state = Object.assign({}, o.s.env.state, { active_kind: 'idle', active_id: null });
        await pushEnvelope(o.page, o.s);
        await wait(o.page, () => document.querySelector('[data-hs-win="hunt-summary"] [data-hs-built]'), null, 3000);
        await o.page.waitForTimeout(300);
        const lead = await o.page.evaluate(() => {
          const w = document.querySelector('[data-hs-win="hunt-summary"]');
          const box = w.querySelector('[data-hs-body]').getBoundingClientRect();
          const shown = (b) => !b.hidden && b.getClientRects().length > 0;
          const gold = Array.from(w.querySelectorAll('button.is-primary')).filter(shown);
          const r = gold.length === 1 ? gold[0].getBoundingClientRect() : null;
          const again = w.querySelector('[data-hs-act="again"]');
          return { gold: gold.map((b) => b.getAttribute('data-hs-act') + ':' + b.textContent + ':' + b.getAttribute('data-hs-goto')),
            inView: !!r && r.top >= box.top && r.bottom <= Math.min(box.bottom, window.innerHeight) && r.right <= window.innerWidth,
            again: shown(again), msg: w.querySelector('.hh-intent-msg').textContent };
        });
        if (JSON.stringify(lead.gold) !== '["next-ground:Go to Meadowbrook Thicket:hunts|meadowbrook_thicket|"]' || !lead.inView || lead.again || /Hunt again off/.test(lead.msg))
          fails.push('AW-105 at ' + tag + ' the outgrown card leads with ' + JSON.stringify(lead) + ', want Go to Meadowbrook Thicket alone, in view, no Hunt again');
        if (shots) await shot(o.page, 'alpha-' + tag + '-outgrown-next-ground');
        if (tag === '1440x900') {
          await o.page.click('[data-hs-win="hunt-summary"] [data-hs-act="next-ground"]');
          await wait(o.page, () => !!document.querySelector('[data-hs-win="hunts"] [data-hs-built]'), null, 3000);
          await o.page.waitForTimeout(200);
          const on = await o.page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunts"]'); return w ? w.textContent.includes('Meadowbrook Thicket') : false; });
          if (!on) fails.push('AW-105 Go to did not open Hunts on Meadowbrook Thicket');
        }
        if (o.errors.length) fails.push('AW-105 console errors at ' + tag + ': ' + o.errors.join(' | ').slice(0, 300));
        await o.ctx.close();
      }
    }

    { // AW-98 THE NEXT BUY (lane/a-next-steps; audit 2026-11-15 F12/F20: gold piled up and Back in town said nothing once the bag was sorted)
      /* The AW-78 hero with its loot sold and nothing to deposit or bless, the Shop offering a Leather Belt for an empty belt slot: the card names that ONE buy,
         last, its press a Show that is never gold, and the Show opens the Shop's Buy tab. On a phone the row stays inside the sheet. The hero wears Leather
         Boots, so its weight is medium: a heavy Bronze Belt is never its buy (the full-game audit's A11; tests/hunt-summary.mjs T5 holds that rule). */
      const sorted = (e) => {
        e.state = Object.assign({}, e.state, { level_xp: LEVEL_5_XP });
        e.skills = Object.assign({}, e.skills, { farming: { xp: 28, level: 1, frac: 0 } });
        for (const id of ['bronze_sword', 'steel_sword', 'iron_helm', 'iron_platebody', 'shortbow', 'rat_tail', 'slime_gel', 'bronze_belt', 'leather_belt']) delete e.inventory[id];
        e.hunt_settings = Object.assign({}, e.hunt_settings, { slots: [], bar: [] });
        e.shop = Object.assign({}, e.shop, { offers: e.shop.offers.concat([{ offer: 'gear.leather_belt', item: 'leather_belt', kind: 'gear', price: 110 }]) });
      };
      for (const [vp, tag] of [[{ width: 1440, height: 900 }, '1440x900'], [{ width: 922, height: 423 }, '922x423']]) {
        const { ctx, page, s, errors, up } = await open({ viewport: vp, mutateEnv: sorted, residue: { coach: { read: ['bar_intro'] } } });
        if (!up) { fails.push('AW-98 the page did not mount at ' + tag); await ctx.close(); continue; }
        s.env.hunt = Object.assign({}, s.env.hunt, { ended: true, session: { end_reason: 'left', ended_at: '2026-10-25T00:20:00Z', phase: 'ended' } });
        s.env.state = Object.assign({}, s.env.state, { active_kind: 'idle', active_id: null });
        await pushEnvelope(page, s);
        await wait(page, () => document.querySelector('[data-hs-win="hunt-summary"] [data-hs-built]'), null, 3000);
        await page.waitForTimeout(300);
        const row = await page.evaluate(() => {
          const w = document.querySelector('[data-hs-win="hunt-summary"]');
          const li = w.querySelector('.hsum-step[data-step="buy"]');
          const b = li && li.querySelector('button');
          const body = w.querySelector('[data-hs-body]').getBoundingClientRect(), r = li ? li.getBoundingClientRect() : null;
          return { steps: Array.from(w.querySelectorAll('.hsum-step')).map((x) => x.getAttribute('data-step')), title: li ? li.querySelector('b').textContent : null,
            words: li ? li.querySelector('small').textContent : null, verb: b ? b.textContent : null, gold: b ? b.classList.contains('is-primary') : null,
            go: b ? b.getAttribute('data-hs-goto') : null, inside: !!r && r.left >= body.left - 1 && r.right <= body.right + 1 };
        });
        if (JSON.stringify(row.steps.slice(-1)) !== '["buy"]' || row.title !== 'Next buy: Leather Belt (110 gp)' || row.words !== '+1 Defense, +0.4% critical chance, empty belt slot'
          || row.verb !== 'Show' || row.gold !== false || row.go !== 'shop|buy|leather_belt' || !row.inside) fails.push('AW-98 at ' + tag + ' the next buy reads ' + JSON.stringify(row));
        if (shots) await shot(page, 'alpha-' + tag + '-back-in-town-buy');
        if (tag === '1440x900') {
          await page.click('[data-hs-win="hunt-summary"] .hsum-step[data-step="buy"] button');
          await wait(page, () => !!document.querySelector('[data-hs-win="shop"] [data-hs-built]'), null, 3000);
          await page.waitForTimeout(200);
          const shop = await page.evaluate(() => { const tb = document.querySelector('[data-hs-win="shop"] .hw-tab[aria-selected="true"]'); return tb ? tb.getAttribute('data-tab') : null; });
          if (shop !== 'buy') fails.push('AW-98 Show opened ' + JSON.stringify(shop) + ', want the Shop on its Buy tab');
          if (shots) await shot(page, 'alpha-1440x900-back-in-town-buy-shop');
        }
        if (errors.length) fails.push('AW-98 console errors at ' + tag + ': ' + errors.join(' | ').slice(0, 300));
        await ctx.close();
      }
    }

    { // AW-99 THE FIRST DANGEROUS RUN (lane/a-next-steps; board 2026-11-15 F5): a Level 8 hero home in a helmet and a body piece, every other card read, meets the one
      /* offer on the real page; in Hunts its ring stands on the Thicket's line, then on that page's Dangerous press. */
      const TUT = (await import(pathToFileURL(join(ROOT, 'src/data/hunt-tutorial.js')).href)).HUNT_TUTORIAL;
      const L8 = (await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href)).charXpForLevel(8);
      const dressed = (e) => {
        e.state = Object.assign({}, e.state, { level_xp: L8, active_kind: 'idle', active_id: null });
        e.equipment = Object.assign({}, e.equipment, { helmet: 'bronze_helm', body: 'bronze_platebody' });
        e.hunt = Object.assign({}, e.hunt, { hunt_id: 'meadowbrook_thicket', ended: true, session: { end_reason: 'left', ended_at: '2026-10-25T00:20:00Z', phase: 'ended' } });
        e.hunt_tier = { picks: {}, playing: null };
        /* one hero on the account: a second past the first hour would already know (the card is `knowledge`, and the stub answers every slot with this hero) */
        e.hero_slots = [0];
      };
      const { ctx, page, errors, up } = await open({ mutateEnv: dressed, residue: { coach: { read: TUT.map((r) => r.id).filter((id) => id !== 'first_dangerous') } } });
      if (!up) fails.push('AW-99 the page did not mount');
      else {
        for (let i = 0; i < 4 && await page.evaluate(() => document.querySelectorAll('[data-hs-win]:not(.is-leaving)').length > 0); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(160); }
        await page.waitForTimeout(300);
        const card = await page.evaluate(() => { const p = document.querySelector('.hs-pointer[data-tutorial]'); return p ? { id: p.getAttribute('data-tutorial'), text: (p.querySelector('.hs-coach-text') || {}).textContent || null } : null; });
        if (!card || card.id !== 'first_dangerous' || card.text !== 'Hunts → Meadowbrook Thicket → Dangerous → Enter') fails.push('AW-99 in town the coach shows ' + JSON.stringify(card));
        if (shots) await shot(page, 'alpha-1440x900-first-dangerous');
        if (!(await openWin(page, 'h', 'hunts'))) fails.push('AW-99 Hunts did not open');
        else {
          await page.waitForTimeout(300);
          const ringed = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="hunts"] [data-coach-ring]'))
            .map((e) => (e.getAttribute('data-hunt') || '') + ':' + (e.getAttribute('data-tier') || '')));
          const onLine = await ringed();
          if (JSON.stringify(onLine) !== '["meadowbrook_thicket:"]') fails.push('AW-99 in Hunts the ring stands on ' + JSON.stringify(onLine) + ', want the Thicket\'s line');
          if (shots) await shot(page, 'alpha-1440x900-first-dangerous-hunts');
          await page.click('[data-hs-win="hunts"] .hw-hunt[data-hunt="meadowbrook_thicket"]');
          await page.waitForTimeout(400);
          const onTier = await ringed();
          if (JSON.stringify(onTier) !== '["meadowbrook_thicket:dangerous"]') fails.push('AW-99 on the Thicket\'s page the ring stands on ' + JSON.stringify(onTier) + ', want its Dangerous press');
          if (shots) await shot(page, 'alpha-1440x900-first-dangerous-tier');
        }
        if (errors.length) fails.push('AW-99 console errors: ' + errors.join(' | ').slice(0, 300));
      }
      await ctx.close();
    }

    { // AW-74 a seed says what planting it needs, before the purchase (the server's Farming and the account's plot tier)
      const seeds = (e) => {
        e.shop = Object.assign({}, e.shop, { offers: e.shop.offers.concat([{ offer: 'supply.turnip_seed', item: 'turnip_seed', kind: 'seed', price: 5 },
          { offer: 'supply.carrot_seed', item: 'carrot_seed', kind: 'seed', price: 10 }]) });
        e.skills = Object.assign({}, e.skills, { farming: { xp: 1154, level: 10, frac: 0 } });
        e.farm_land = { cap: 2, plot_level: 1, deeds: 0, upgrade: { level: 2, gold: 500, deeds: 1, farming: 5 }, plots: [] };
      };
      const { ctx, page, up } = await open({ mutateEnv: seeds });
      if (up && await openWin(page, 'v', 'shop')) {
        await page.waitForTimeout(150);
        const said = await page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('.hw-shop [data-pane="buy"] .hw-line'))
          .map((l) => [l.getAttribute('data-item'), l.querySelector('small').textContent])));
        if (!/, Needs plot tier 2 to plant/.test(said.carrot_seed || '') || /Farming/.test(said.carrot_seed || '')) fails.push('AW-74 the carrot seed on tier 1 land reads ' + JSON.stringify(said.carrot_seed));
        if (!said.turnip_seed || /Needs/.test(said.turnip_seed)) fails.push('AW-74 the turnip seed reads ' + JSON.stringify(said.turnip_seed));
      } else fails.push('AW-74 the Shop did not open');
      await ctx.close();
    }

    { // AW-31 THE CLEAN RETURN (designer walk 2026-10-25 #5), THE CARD'S NEXT STEP, THE SALE IN VIEW (#6), SERVICES IN THE SHOP
      /* A Level 5 hero in the Cellar with loot and no gear in its bag (the bar's lessons read, a bar with nothing left to
         teach), so the card waiting in town is "Sell what only pays coin"; 25 more priced loot stacks make the Sell list
         run past the Shop's fold. */
      const MORE = ['small_fang', 'giant_rat_hide', 'venom_sac', 'hive_wasp_stinger', 'goblin_ear', 'goblin_totem', 'magic_essence', 'rune_frag', 'coal',
        'bat_wing', 'night_fang', 'oak_log', 'iron_ore', 'spider_eye', 'bear_claw', 'dire_fang', 'alpha_fang', 'willow_log', 'troll_hide', 'iron_bar',
        'steel_bar', 'hell_ember', 'dark_sigil', 'brute_plate', 'cracked_spellstone'];
      const back5 = (e) => {
        e.state = Object.assign({}, e.state, { level_xp: LEVEL_5_XP });
        e.skills = Object.assign({}, e.skills, { farming: { xp: 28, level: 1, frac: 0 } });
        for (const id of ['bronze_sword', 'steel_sword', 'iron_helm', 'iron_platebody', 'shortbow']) delete e.inventory[id];
        for (const id of MORE) { e.inventory[id] = 3; e.shop.bids[id] = 2; }
        e.hunt_settings = Object.assign({}, e.hunt_settings, { slots: [], bar: [] });
        /* this hunt's loot holds Bones too (a skill's offering, never coin) */
        e.hunt = Object.assign({}, e.hunt, { loot: e.hunt.loot.concat([{ item: 'bones', count: 8 }]) });
      };
      const { ctx, page, s, errors, up } = await open({ mutateEnv: back5, residue: { coach: { read: ['bar_intro'] } } });
      if (!up) fails.push('AW-31 the page did not mount');
      else {
        const look = () => page.evaluate(() => {
          const btn = (q) => document.querySelector('[data-hs-win="hunt-summary"] ' + q);
          return { analyzer: !!document.querySelector('[data-hs-widget="analyzer"]'), party: !!document.querySelector('[data-hs-widget="party"]'),
            bar: !!document.querySelector('[data-hs-widget="hunt-topbar"]'), summary: !!document.querySelector('[data-hs-win="hunt-summary"]:not(.is-leaving)'),
            toast: /has ended/.test((document.querySelector('[data-hs-widget="alerts"]') || {}).textContent || ''),
            next: btn('[data-hs-act="coach-next"]') && !btn('[data-hs-act="coach-next"]').hidden ? btn('[data-hs-act="coach-next"]').textContent : null,
            againMain: btn('[data-hs-act="again"]') ? btn('[data-hs-act="again"]').classList.contains('is-primary') : null };
        });
        const ringed = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-coach-ring]')).map((e) => e.getAttribute('data-hs-open') || e.getAttribute('data-tab')
          || e.getAttribute('data-coach-hook') || e.getAttribute('data-hs-act') || e.className));
        const inHunt = await look();
        if (!inHunt.analyzer || !inHunt.bar) fails.push('AW-31 the fixture hunt shows no hunt widgets: ' + JSON.stringify(inHunt));
        /* the hero leaves the Cellar: the summary is the one notice; no analyzer, no party panel, no "has ended" toast */
        s.env.hunt = Object.assign({}, s.env.hunt, { ended: true, session: { end_reason: 'left', ended_at: '2026-10-25T00:20:00Z', phase: 'ended' } });
        s.env.state = Object.assign({}, s.env.state, { active_kind: 'idle', active_id: null });
        await pushEnvelope(page, s);
        await wait(page, () => document.querySelector('[data-hs-win="hunt-summary"] [data-hs-built]'), null, 3000);
        await page.waitForTimeout(300);
        const town = await look();
        /* ...and no hunt bar: with the summary open it would hold only a Summary press for it (first-hour playtest 10-29 #10) */
        if (town.analyzer || town.party || town.bar || town.toast || !town.summary) fails.push('AW-31 back in town the screen holds more than the summary: ' + JSON.stringify(town));
        /* the card's next step is a press on the summary, never its gold one (AW-78): the Back in town Sell step is gold here, Hunt again is not */
        if (town.next !== 'Next: Sell junk' || town.againMain !== false) fails.push('AW-31 the summary\'s presses read ' + JSON.stringify(town) + ', want "Next: Sell junk" shown and Hunt again not gold');
        if (shots) await shot(page, 'alpha-1440x900-return-summary');
        /* pressed: the summary goes, the hunt bar leaves with it, and the Shop opens with the card inside it, the Sell tab ringed */
        await page.click('[data-hs-win="hunt-summary"] [data-hs-act="coach-next"]');
        const inShop = await wait(page, () => document.querySelector('[data-hs-win="shop"] [data-hs-built]') && !document.querySelector('[data-hs-win="hunt-summary"]:not(.is-leaving)'), null, 3000);
        await page.waitForTimeout(400);
        const after = await look();
        const card = await page.evaluate(() => { const p = document.querySelector('[data-hs-win="shop"] > .hs-win-coach .hs-pointer'); return p ? p.getAttribute('data-tutorial') : null; });
        if (!inShop || after.bar || card !== 'sell_loot') fails.push('AW-31 the next step left ' + JSON.stringify({ inShop, bar: after.bar, card }) + ', want the Shop open with "Sell what only pays coin" in it and no hunt bar');
        const r0 = await ringed();
        if (r0.join() !== 'sell') fails.push('AW-31 in the Shop the ring is on ' + JSON.stringify(r0) + ', want the Sell tab');
        await page.click('[data-hs-win="shop"] .hw-tab[data-tab="sell"]');
        await page.waitForTimeout(400);
        if ((await ringed()).join() !== 'sell-loot') fails.push('AW-31 on the Sell tab the ring is on ' + JSON.stringify(await ringed()) + ', want Sell all loot');
        /* the confirmation is in view inside the window (it sat under the list, below the fold), by the Shop's own doing:
           measured in the same task as the press, before the coach's ring (which scrolls to what it rings) can land */
        const cf = await page.evaluate(() => {
          document.querySelector('[data-hs-win="shop"] [data-hs-act="sell-loot"]').click();
          const c = document.querySelector('[data-hs-win="shop"] [data-pane="sell"] .hw-confirm');
          /* in view = inside the window's body box AND on the screen (a body taller than the screen still hides it) */
          const w = c.closest('[data-hs-win]').querySelector('[data-hs-body]').getBoundingClientRect(), r = c.getBoundingClientRect();
          return { on: c.classList.contains('is-on'), top: Math.round(r.top), bottom: Math.round(r.bottom), boxTop: Math.round(Math.max(0, w.top)),
            boxBottom: Math.round(Math.min(window.innerHeight, w.bottom)), lines: document.querySelectorAll('[data-hs-win="shop"] .hw-sell-list > li').length };
        });
        if (!cf.on || cf.top < cf.boxTop || cf.bottom > cf.boxBottom) fails.push('AW-31 the sale\'s confirmation is out of view: ' + JSON.stringify(cf));
        await page.waitForTimeout(400);
        if ((await ringed()).join() !== 'sell-confirm') fails.push('AW-31 with the confirmation open the ring is on ' + JSON.stringify(await ringed()) + ', want its Sell');
        if (shots) await shot(page, 'alpha-1440x900-shop-sell-confirm');
        /* "Decide once" rings a loot rule on a stack that only pays coin, never on Bones (played 2026-10-25) */
        await openWin(page, 'b', 'inventory');
        await page.click('[data-hs-win="inventory"] .hw-tab[data-tab="hunt"]');
        await page.waitForTimeout(300);
        const coinRows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="inventory"] [data-rule-item]')).map((s) => s.getAttribute('data-rule-item') + (s.hasAttribute('data-coin') ? ':coin' : '')));
        if (!coinRows.includes('rat_tail:coin') || coinRows.some((x) => /^bones:coin/.test(x))) fails.push('AW-31 the loot-rule rows read ' + JSON.stringify(coinRows) + ' (want Rat Tail marked as coin, never Bones)');
        await openWin(page, 'v', 'shop');
        await page.click('[data-hs-win="shop"] .hw-tab[data-tab="sell"]');
        await page.waitForTimeout(200);
        /* SERVICES IN THE SHOP (Tyler 2026-10-25): no Services icon; R opens the Shop on its Services tab, from the Sell tab too */
        const icons = await barWindows(page);
        if (icons.includes('services') || !icons.includes('shop')) fails.push('AW-31 the top bar reaches ' + icons.join(','));
        await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
        /* at once, in the same task as the key (not at the next display tick) */
        const atOnce = await page.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
          return (document.querySelector('[data-hs-win="shop"] .hw-tab[aria-selected="true"]') || {}).dataset?.tab; });
        if (atOnce !== 'services') fails.push('AW-31 R over the open Shop did not switch it to Services at once (it shows ' + atOnce + ')');
        await page.waitForTimeout(300);
        const svc = () => page.evaluate(() => ({ tab: (document.querySelector('[data-hs-win="shop"] .hw-tab[aria-selected="true"]') || {}).dataset?.tab,
          pane: !!document.querySelector('[data-hs-win="shop"] [data-pane="services"].is-on .hw-services .hw-bless'),
          stam: !!document.querySelector('[data-hs-win="shop"] [data-pane="services"].is-on [data-hs-act="stam-ask"]') }));
        const v1 = await svc();
        if (v1.tab !== 'services' || !v1.pane || !v1.stam) fails.push('AW-31 R over the open Shop shows ' + JSON.stringify(v1) + ', want its Services tab');
        await openWin(page, 'r', 'shop');
        await page.waitForTimeout(200);
        const v2 = await svc();
        if (v2.tab !== 'services' || !v2.pane) fails.push('AW-31 R with the Shop closed opens ' + JSON.stringify(v2) + ', want the Shop on Services');
        if (shots) await shot(page, 'alpha-1440x900-shop-services');
      }
      if (errors.length) fails.push('AW-31 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // AW-95 TOP LOOT IN SIGHT (first-30 play 2026-11-12): the loot list sat under the sticky foot, so a first gear drop went unseen
      const card = { id: '11111111-0000-4000-8000-000000000095', hunt: 'mill_cellar', at: Date.parse('2026-10-17T12:30:00Z'), reason: 'left', ms: 910000, kills: 111, xp: 2327, gold: 111,
        lootValue: 325, balance: 426, balanceH: 1685, rawXpH: 8153, died: 0, loot: [['rat_tail', 29], ['bones', 13], ['slime_gel', 9], ['sticky_core', 4]],
        supplies: [['wheat_bread', 'own', 2]], preset: 0, hoursLimit: null, bag: [], deaths: [] };
      const { ctx, page, up } = await open({ viewport: { width: 1440, height: 900 }, mutateEnv: (e) => {
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
        for (const k of ['hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.hunt.ended = true;
        e.hunt.session = Object.assign({}, e.hunt.session, { hunt: 'mill_cellar', preset: 0, bag: [], end_reason: 'left', ended_at: '2026-10-17T12:30:00Z', phase: 'ended' });
      }, residue: { huntSummaries: [card] } });
      if (!up) fails.push('AW-95 the town did not mount');
      else if (!(await openWin(page, 'l', 'hunt-summary'))) fails.push('AW-95 the summary did not open');
      else {
        await page.waitForTimeout(300);
        /* the ended envelope records its own (lootless) card first: pick the one with the loot, as AW-66 does */
        if (await page.$('[data-hs-win="hunt-summary"] .hsum-past [data-hs-act="pick"]')) { await page.click('[data-hs-win="hunt-summary"] .hsum-past [data-hs-act="pick"]'); await page.waitForTimeout(200); }
        const loot = await page.evaluate(() => {
          const w = document.querySelector('[data-hs-win="hunt-summary"]');
          w.querySelector('[data-hs-body]').scrollTop = 0;
          const body = w.querySelector('[data-hs-body]').getBoundingClientRect();
          const first = w.querySelector('.hsum-loot li'), stats = w.querySelector('.hsum-stats').getBoundingClientRect();
          if (!first) return { rows: 0 };
          const r = first.getBoundingClientRect();
          return { rows: w.querySelectorAll('.hsum-loot li').length, inView: r.top >= body.top && r.bottom <= Math.min(body.bottom, window.innerHeight), aboveStats: r.bottom <= stats.top };
        });
        if (!loot.rows || !loot.inView || !loot.aboveStats) fails.push('AW-95 the summary\'s Top loot is out of sight: ' + JSON.stringify(loot));
      }
      await ctx.close();
    }

    { // AW-66 the summary's answer line and its width
      const W66 = '[data-hs-win="hunt-summary"] ';
      const OVER = { hunt: 'mill_cellar', preset: 0, bag: [], end_reason: 'party_member_left', end_by: 'Bramwell', end_by_why: 'left', ended_at: '2026-10-17T12:30:00Z', phase: 'ended' };
      const past = (id, at) => ({ id, hunt: 'mill_cellar', at, reason: 'party_member_left', by: 'Bramwell', why: 'left', ms: 3600000, kills: 1336, xp: 12176, gold: 1135, lootValue: 2243, balance: 3378, balanceH: 1944, rawXpH: 7009, died: 0, loot: [], supplies: [], preset: 0, hoursLimit: null, bag: [], deaths: [] });
      const { ctx, page, errors, s, up } = await open({ viewport: { width: 1366, height: 620 }, mutateEnv: (e) => {
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
        for (const k of ['hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.hunt.ended = true;
        e.hunt.session = Object.assign({}, e.hunt.session, OVER);
      }, residue: { huntSummaries: [past('11111111-0000-4000-8000-000000000001', Date.parse('2026-10-17T12:30:00Z')), past('11111111-0000-4000-8000-000000000002', Date.parse('2026-10-17T11:00:00Z'))] } });
      if (!up) fails.push('AW-66 the town did not mount');
      else {
        if (!(await openWin(page, 'l', 'hunt-summary'))) fails.push('AW-66 the summary did not open');
        else {
          await page.waitForTimeout(300);
          /* The card with every number on it: the presses are pushed down to the window's foot. */
          await page.click(W66 + '.hsum-past [data-hs-act="pick"]');
          await page.waitForTimeout(200);
          /* The press's line, as this hero's scratch holds it: its words go with the hunt they were said about. */
          await page.evaluate((w) => { const b = document.querySelector(w + '[data-hs-act="again"]'); if (b) { b.disabled = false; b.click(); } }, W66);
          await page.waitForTimeout(700);
          const said = await page.evaluate((w) => {
            const body = document.querySelector(w + '[data-hs-body]'), m = document.querySelector(w + '.hh-intent-msg');
            body.scrollTop = 0;   // the window as it opens: reaching Earlier hunts scrolled it past the presses
            const r = m.getBoundingClientRect();
            /* It stands under every press, wherever the window is scrolled: stuck to the foot it lay on one, or over one still below the fold. */
            const on = Array.from(document.querySelectorAll(w + '.hsum-actions button')).filter((x) => !x.hidden && x.getClientRects().length)
              .filter((x) => r.top < x.getBoundingClientRect().bottom - 1).map((x) => x.textContent);
            /* ...and every press is in reach as the window opens, whatever the reason and the numbers above them weigh (door panel 2026-11-04). */
            const br = body.getBoundingClientRect();
            const cut = Array.from(document.querySelectorAll(w + '.hsum-actions button')).filter((x) => !x.hidden && x.getClientRects().length)
              .filter((x) => { const b = x.getBoundingClientRect(); return b.bottom > br.bottom + 1 || b.top < br.top - 1; }).map((x) => x.textContent);
            const foot = document.querySelector(w + '.hsum-foot').getBoundingClientRect();
            return { text: m.textContent, scrolls: body.scrollHeight - body.clientHeight, on, cut, gap: Math.round(br.bottom - foot.bottom) };
          }, W66);
          if (said.cut.length) fails.push('AW-66 under the summary\'s fold as it opens: ' + said.cut.join(', '));
          if (Math.abs(said.gap) > 1) fails.push('AW-66 the numbers read on ' + said.gap + ' px under the summary\'s presses');
          if (!/^Setting out/.test(said.text)) fails.push('AW-66 CONTROL: Hunt again did not say it set out: ' + JSON.stringify(said));
          if (said.scrolls <= 0) fails.push('AW-66 CONTROL: the card does not scroll at this size, so the line has nothing to lie on');
          if (said.on.length) fails.push('AW-66 the summary\'s answer stands over ' + said.on.join(', '));
          s.env.hunt = Object.assign({}, s.env.hunt, { ended: false, session_id: '5d1c0f2e-0000-4000-8000-000000000066', session: Object.assign({}, s.env.hunt.session, { end_reason: null, ended_at: null, phase: 'hunting' }) });
          await pushEnvelope(page, s);
          s.env.hunt = Object.assign({}, s.env.hunt, { ended: true, session: Object.assign({}, s.env.hunt.session, OVER) });
          await pushEnvelope(page, s);
          await page.waitForTimeout(400);
          const home = await page.evaluate((w) => { const m = document.querySelector(w + '.hh-intent-msg'); return m ? m.textContent : null; }, W66);
          if (/Setting out/.test(home || '')) fails.push('AW-66 the hero is home and the summary still says ' + JSON.stringify(home));
          /* On a phone's sheet the presses come right under the reason and lie on none of the numbers. */
          await page.setViewportSize({ width: 844, height: 390 });
          await page.waitForTimeout(400);
          const sheet = await page.evaluate((w) => {
            const body = document.querySelector(w + '[data-hs-body]'), stats = document.querySelector(w + '.hsum-stats').getBoundingClientRect();
            body.scrollTop = 0;
            const br = body.getBoundingClientRect();
            const on = Array.from(document.querySelectorAll(w + '.hsum-actions button')).filter((x) => !x.hidden && x.getClientRects().length).map((x) => x.getBoundingClientRect());
            return { n: on.length, inReach: on.every((b) => b.bottom <= br.bottom + 1 && b.top >= br.top - 1), clear: on.every((b) => b.bottom <= stats.top + 1) };
          }, W66);
          if (!sheet.n || !sheet.inReach || !sheet.clear) fails.push('AW-66 the summary on a phone: ' + JSON.stringify(sheet));
        }
      }
      if (errors.length) fails.push('AW-66 console errors: ' + errors.slice(0, 2).join(' | '));
      await ctx.close();
    }

    { // AW-67 nothing lies on the press in hand
      const W67 = '[data-hs-win="inventory"] ';
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
        e.inventory = Object.assign({}, e.inventory, { bones: 23 });
      };
      /* The press takes a real click at its middle: nothing lies on it, and it is inside the column's view. */
      const takes = (page, sel) => page.evaluate((q) => {
        const b = document.querySelector(q);
        if (!b || !b.getClientRects().length) return { hit: false, why: 'not on screen' };
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), low = document.elementFromPoint(r.left + r.width / 2, r.bottom - 2);
        const on = (n) => !!n && (n === b || b.contains(n));
        return { hit: on(top) && on(low), top: top && (top.className || top.tagName), low: low && (low.className || low.tagName) };
      }, sel);
      /* 560 tall: on a short World a window now rises over the bar to fit (AW-93), so the columns these controls need to overflow do so only here */
      const { ctx, page, errors, s, up } = await open({ viewport: { width: 1366, height: 560 }, mutateEnv: town });
      s.onCall = (name, b) => { if (name === 'hr-accrue' && b.verb === 'set_activity') Object.assign(s.env.state, b.activity && b.activity.kind ? { active_kind: b.activity.kind, active_id: b.activity.id } : { active_kind: 'idle', active_id: null }); };
      if (!up) fails.push('AW-67 the town did not mount');
      else {
        await openWin(page, 'b', 'inventory');
        await page.waitForTimeout(300);
        await page.evaluate((w) => { const m = document.querySelector(w + '.hh-intent-msg'); m.textContent = 'Put on 1 piece.'; }, W67);
        await page.click(W67 + '.hw-pocket[data-item="bones"]');
        await page.waitForTimeout(250);
        /* the column: the one beside the doll, which scrolls on its own while the doll stands still (AW-100) */
        const col = await page.evaluate((w) => { const c = document.querySelector(w + '.hw-inv-side'); return c.scrollHeight - c.clientHeight; }, W67);
        if (col <= 0) fails.push('AW-67 CONTROL: the column does not overflow at this size, so this proves nothing');
        const fuel = await takes(page, W67 + '.hw-pick [data-hs-act="primary"]');
        if (!fuel.hit) fails.push('AW-67 Burn all does not take a press with the stack in hand: ' + JSON.stringify(fuel));
        await page.click(W67 + '.hw-pick [data-hs-act="primary"]');
        await wait(page, (w) => document.querySelector(w + '.hw-burying.is-on'), W67, 4000);
        await page.waitForTimeout(400);
        const line = await page.evaluate((w) => document.querySelector(w + '.hh-intent-msg').textContent, W67);
        /* The press that worked reads as one: the job's own line has the Stop, and no "Already fueling... Stop it first." sits over it. */
        const onFire = await page.evaluate((w) => document.querySelector(w + '.hw-pick-why').textContent, W67);
        if (onFire) fails.push('AW-67 the stack just put on the fire is refused in words: ' + JSON.stringify(onFire));
        const stop = await takes(page, W67 + '[data-hs-act="bury-stop"]');
        if (!stop.hit) fails.push('AW-67 Stop does not take a press while it fuels (line ' + JSON.stringify(line) + '): ' + JSON.stringify(stop));
        /* The player's own scroll stands: the next patch does not pull the column back. */
        await page.evaluate((w) => { document.querySelector(w + '.hw-inv-side').scrollTop = 0; }, W67);
        await page.waitForTimeout(700);
        if ((await page.evaluate((w) => document.querySelector(w + '.hw-inv-side').scrollTop, W67)) !== 0) fails.push('AW-67 the column fights the player\'s own scroll');
        /* The Shop's tabs on a scrolled body. */
        await openWin(page, 'v', 'shop');
        await page.waitForTimeout(300);
        await page.click('[data-hs-win="shop"] .hw-tab:last-child');
        await page.waitForTimeout(250);
        const tabs = await page.evaluate(() => {
          const b = document.querySelector('[data-hs-win="shop"] [data-hs-body]'), t = document.querySelector('[data-hs-win="shop"] .hw-tabs');
          b.scrollTop = 40;
          const br = b.getBoundingClientRect(), r = t.getBoundingClientRect();
          return { scrolled: b.scrollTop, whole: r.top >= br.top - 1 && r.bottom <= br.bottom, gap: Math.round(r.top - br.top) };
        });
        if (!tabs.scrolled) fails.push('AW-67 CONTROL: the Shop does not scroll at this size');
        if (!tabs.whole) fails.push('AW-67 the Shop\'s tabs are cut on a scrolled body: ' + JSON.stringify(tabs));
        if (tabs.gap > 1) fails.push('AW-67 the list reads on ' + tabs.gap + ' px above the Shop\'s stuck tabs');
        /* A tab opens at its top: a carried-over scroll laid its first press behind the stuck tabs. */
        /* the press itself, not Playwright's: its click scrolls the page to the tab first */
        const topped = await page.evaluate(async () => {
          const b = document.querySelector('[data-hs-win="shop"] [data-hs-body]');
          /* this fixture's other tabs are short and would clamp a kept scroll to 0: a floor under them keeps it */
          const floor = document.createElement('div'); floor.style.height = '1500px'; b.append(floor);
          b.scrollTop = 40;
          const was = b.scrollTop;
          document.querySelector('[data-hs-win="shop"] .hw-tab:first-child').click();
          await new Promise((r) => setTimeout(r, 200));
          const now = b.scrollTop;
          floor.remove();
          return { was, now };
        });
        if (!topped.was) fails.push('AW-67 CONTROL: the Shop does not scroll before its tab is pressed');
        if (topped.now !== 0) fails.push('AW-67 the Shop\'s tab opened scrolled down by ' + topped.now);
        /* The card's figure is what the bag would fetch, never a purse (Tyler 10-23: one purse per account). */
        await openWin(page, 'o', 'characters');
        await page.waitForTimeout(250);
        const bagWords = await page.evaluate(() => (document.querySelector('.hw-char .hw-char-bag') || {}).textContent);
        if (!/^Bag worth /.test(bagWords || '')) fails.push('AW-67 the All characters card reads ' + JSON.stringify(bagWords));
        /* AW-71 THE SAME CARD KEEPS ITS BOX AND ITS WORDS FOLLOW THE SERVER (door panel 2026-11-04: "You have 19 left" over a bar reading 6, for the whole hunt). */
        const coachNow = await page.evaluate(async () => {
          const { placeCoach } = await import(location.origin + '/src/shell/launcher.js');
          const box = document.createElement('div');
          const card = (n) => '<p class="hs-pointer" data-coach="first_eat"><b>Your hero just ate</b> <span class="hs-coach-text">You have ' + n + ' left.</span></p>';
          placeCoach(box, card(19));
          const first = box.querySelector('.hs-pointer');
          placeCoach(box, card(19));
          placeCoach(box, card(6));
          return { same: box.querySelector('.hs-pointer') === first, one: box.children.length === 1, words: first.querySelector('.hs-coach-text').textContent };
        });
        if (!coachNow.same || !coachNow.one || coachNow.words !== 'You have 6 left.') fails.push('AW-71 the same card over a new number reads ' + JSON.stringify(coachNow));
        /* AW-72 A RING STANDS CLEAR OF THE ANSWER LINE (door panel 2026-11-04, a phone's Services: the next Bless behind "Blessing I is yours."). */
        const clear = await page.evaluate(async () => {
          const { revealInWindow } = await import(location.origin + '/src/shell/widgets/bits.js');
          const win = document.createElement('div'); win.setAttribute('data-hs-win', 'x');
          win.innerHTML = '<div class="box" style="overflow:auto;height:200px"><div style="height:150px"></div><button style="height:40px;display:block">Bless</button><div style="height:300px"></div>'
            + '<p class="hh-intent-msg" style="position:sticky;bottom:0;margin:0;height:40px">Said.</p></div>';
          document.body.append(win);
          const b = win.querySelector('button');
          revealInWindow(b);
          const out = { press: Math.round(b.getBoundingClientRect().bottom), line: Math.round(win.querySelector('.hh-intent-msg').getBoundingClientRect().top) };
          win.remove();
          return out;
        });
        if (clear.press > clear.line) fails.push('AW-72 a ring landed under the answer line: ' + JSON.stringify(clear));
      }
      if (errors.length) fails.push('AW-67 console errors: ' + errors.slice(0, 2).join(' | '));
      await ctx.close();
    }
  });
}

const MUTANTS = [
  ['AW-103 the foot stands beside the doll again', 'src/styles/windows.css', '[data-hs-win="inventory"] .hw-inv > .hw-inv-cols { flex: 1 1 auto; min-height: 0; }', '[data-hs-win="inventory"] .hw-inv > .hw-inv-cols { flex: 1 1 auto; min-height: 0; flex-wrap: wrap; } [data-hs-win="inventory"] .hw-inv > .hw-inv-foot { order: -1; }'],
  ['AW-62 the foot scrolls off', 'src/styles/windows.css', '.hs-win[data-hs-win="inventory"] .hs-win-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }\n', ''],
  ['AW-66 "Setting out." outlives its hunt', 'src/shell/windows/hunt-summary.js', "  if (sc.huntNow !== huntNow) { if (!sc.pending) sc.msg = ''; sc.huntNow = huntNow; }\n", ''],
  ['AW-66 the summary\'s answer lies on its presses', 'src/styles/windows.css', '.hs-win .hsum-foot > .hh-intent-msg:not(:empty) { position: static; }\n', '.hs-win .hsum-foot > .hh-intent-msg:not(:empty) { position: absolute; top: 0; pointer-events: none; }\n'],
  ['AW-66 the summary\'s presses sit under the fold', 'src/styles/summary.css', '.hsum-foot { position: sticky; bottom: -12px; z-index: 2;', '.hsum-foot {'],
  ['AW-66 the numbers read on under the summary\'s presses', 'src/styles/summary.css', 'position: sticky; bottom: -12px;', 'position: sticky; bottom: 0;'],
  ['AW-67 the Shop\'s last row reads on above its tabs', 'src/styles/windows.css', 'position: sticky; top: -10px; margin-top: -10px; padding-top: 10px;', 'position: sticky; top: 0;'],
  ['AW-67 a Shop tab keeps the last tab\'s scroll', 'src/shell/windows/shop.js', "sc.wear = false; body.scrollTop = 0; repaint(); return true; }", "sc.wear = false; repaint(); return true; }"],
  ['AW-74 a seed the land cannot grow yet is sold with no word', 'src/shell/windows/shop.js', "  const tier = requiredPlotLevel(crop) > (field ? field.plotLevel : 1) ? requiredPlotLevel(crop) : 0;\n", '  const tier = 0;\n'],
  ['AW-72 a ring lands under the answer line', 'src/shell/widgets/bits.js', 'if (r.bottom > floor) { p.scrollTop += r.bottom - floor + 8; return true; }', 'if (r.bottom > b.bottom) { p.scrollTop += r.bottom - b.bottom + 8; return true; }'],
  ['AW-66 the summary\'s presses lie on a phone\'s numbers', 'src/styles/summary.css', '  .hsum-card.is-on { display: flex; flex-direction: column; }\n', ''],
  ['AW-71 the same card keeps its first number', 'src/shell/launcher.js', '  else if (key) sameCardWords(have, html);\n', ''],
  ['AW-67 the stack on the fire is refused in words', 'src/shell/windows/inventory/grid.js', "(buryingOf(st.cs) === buryRecipeOf(cur) ? '' : buryBlock(st.cs, buryRecipeOf(cur)))", 'buryBlock(st.cs, buryRecipeOf(cur))'],
  ['AW-67 the card reads as a purse', 'src/data/text/heroes.js', "  bag_worth: 'Bag worth {gold}',", "  bag_worth: 'Bag {gold}',"],
  ['AW-67 the press in hand stays under the answer', 'src/shell/windows/inventory/index.js', '  if (over > 0) col.scrollTop += over + 4;\n', ''],
  ['AW-67 the column fights the player', 'src/shell/windows/inventory/index.js', '  if (st.sc.clearSig === sig) return;\n', ''],
  ['AW-67 the Shop\'s tabs slice', 'src/styles/windows.css', '.hw-shop > .hw-tabs { position: sticky; top: -10px; margin-top: -10px; padding-top: 10px; z-index: 1; background: var(--bg-1); }\n', ''],
  /* lane/b-back-in-town (AW-78): one gold press on the way home */
  ['AW-78 Hunt again stays gold beside an open step', 'src/shell/windows/hunt-summary.js', "cls(go, 'is-primary', town.primary === 'again');", "cls(go, 'is-primary', true);"],
  ['AW-78 the coach takes the gold press again', 'src/shell/windows/hunt-summary.js', '<button type="button" class="hh-tool is-link" data-hs-act="coach-next" hidden>', '<button type="button" class="hh-tool is-primary" data-hs-act="coach-next" hidden>'],
  ['AW-78 a step pressed never reads Done', 'src/shell/windows/hunt-summary.js', 'const mark = (r) => { if (r && (r.ok || r.moved > 0)) {', 'const mark = (r) => { if (false) {'],
  /* audit 2026-11-19 L2 (AW-105): the outgrown card leads with Go to the next ground, in view on a phone too */
  ['AW-105 the outgrown card leads with a greyed Hunt again again', 'src/shell/windows/hunt-summary.js', "    const way = town.primary === 'ground' ? town.steps.find((s) => s.id === 'ground') : null;", '    const way = null;'],
  ['AW-105 a phone stacks the Go to press under the steps', 'src/styles/summary.css', '  .hsum-card.is-onward > .hsum-foot { order: 0; position: sticky;', '  .hsum-card.is-onward > .hsum-foot { order: 1; position: static;'],
  ['AW-78 the steps are not the newest card\'s', 'src/shell/windows/hunt-summary.js', "const town = cur === list[0] && !huntOpen ? townOf(cs, sc, cur.id) : { steps: [], primary: 'again' };", "const town = { steps: [], primary: 'again' };"],
  ['AW-78 the return card rings the Shop, never the summary\'s row', 'src/data/hunt-tutorial.js', "      hooks: ['[data-hs-win=\"hunt-summary\"] [data-hs-act=\"town\"][data-step=\"sell\"]',\n        '[data-hs-win=\"shop\"] .hw-tab[data-tab=\"sell\"]',", "      hooks: ['[data-hs-win=\"shop\"] .hw-tab[data-tab=\"sell\"]',"],
  ['Bury debits the bag before the server answers', 'src/shell/windows/inventory/bury.js', "  const qty = buryQty(cs, id);\n", "  const qty = buryQty(cs, id);\n  delete cs.read('inventory')[id];\n"],
  ['the Burying line ignores the server pointer', 'src/shell/windows/inventory/bury.js', "  if (e) return lineParts(buryingWord(e) + ' ' + itemName(e.input), runParts(cs, workOf(cs), true), '');", '  if (e) return [];'],
  ['a new player gets no pointer to Hunts', 'src/shell/launcher.js', "+ (ctx.hud && ctx.hud.isShown('hunt-topbar') ? '' : pointerFor(ctx)) + '</nav>'", "+ '</nav>'"],
  ['coach: the card leaves when its window opens (AW-17b, playtest 2026-10-24)', 'src/shell/shell.js', "placeCoach(slot, win && slot.parentElement.getAttribute('data-hs-win') === win ? coachHtml(cs, card, true) : '');", "placeCoach(slot, '');"],
  ['coach: nothing inside a window is ringed (AW-17b)', 'src/shell/shell.js', '    ringCoach(ctx, card, ringRoots);\n', ''],
  ['coach: the ring is on a control nobody can see (AW-17b)', 'src/shell/launcher.js', "const shown = (el) => el.getClientRects().length > 0 && !el.closest('[hidden]');", 'const shown = () => true;'],
  /* lane/b-tutorial-rings (AW-31): the clean return, the card's next step, the sale in view, Services in the Shop */
  ['coach: the analyzer and the party panel stay in town after the hunt (AW-31)', 'src/shell/shell-hud.js', '    if (!h || !h.ended) return true;\n', '    return true;\n'],
  ['coach: the hunt\'s "has ended" toast shows over its summary (AW-31)', 'src/shell/alerts.js', '    if (c.quiet) return false;\n', ''],
  ['coach: Hunt again stays the summary\'s main press over the card (AW-31)', 'src/shell/windows/hunt-summary.js', 'const card = huntOpen ? null : nextStepOf(ctx);', 'const card = null;'],
  ['coach: the sale\'s confirmation sits under the list, out of view (AW-31)', 'src/shell/windows/shop.js', '  if (opening) revealInWindow(cf);\n', ''],
  ['coach: the sale\'s confirmation is never ringed (AW-31)', 'src/shell/windows/shop.js', ' data-coach-hook="sell-confirm"', ''],
  ['coach: R opens nothing once Services left the icon row (AW-31)', 'src/data/shell-windows.js', ", tabKeys: Object.freeze({ r: 'services' }) }),", ' }),'],
  ['coach: "Decide once" rings Bones for the shop (AW-31)', 'src/shell/windows/inventory/grid.js', "attr(sel, 'data-coin', coin.has(l.item) ? '' : null);", "attr(sel, 'data-coin', '');"],
  ['coach: R over the open Shop never switches it to Services (AW-31)', 'src/shell/shell.js', '    for (const id of wm.openIds()) if (wm.wantsTab(id) || wm.wantsFind(id)) refresh(id);\n', ''],
  ['coach: an ended hunt\'s bar stays over its open summary (AW-31)', 'src/shell/shell-hud.js', " && !wm.isOpen('hunt-summary');", ';'],
  ['AW-25 the page shows the first ground, not the pick', 'src/shell/windows/hunts.js', '  const r = list.find((x) => x.hunt === sc.pick) || null;', '  const r = list[0] || null;'],
  ['AW-29 the pick resets after a hunt', 'src/shell/windows/hunts.js', '  if ((!sc.pick || sc.auto) && list.length) {', '  if ((!sc.pick || sc.auto || (h && h.ended)) && list.length) {'],
  ['AW-25b a pick by hand is replaced by the advice', 'src/shell/windows/hunts.js', "    sc.pick = hunt; sc.auto = false; sc.msg = ''; sc.paged = true; repage();", "    sc.pick = hunt; sc.msg = ''; sc.paged = true; repage();"],
];

const COMPANION = {
  /* today's Shop: the confirmation after the list AND no reveal (either alone keeps it in view) */
  'coach: the sale\'s confirmation sits under the list, out of view (AW-31)': ['src/shell/windows/shop.js',
    `    /* the confirmation beside the press, never under the list (the coach rings its Sell: data-coach-hook) */
    + '<div class="hw-confirm" role="alertdialog" aria-label="Confirm the sale"><p class="hw-confirm-q"></p><p class="hw-confirm-note"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="confirm-yes" data-coach-hook="sell-confirm"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="confirm-no">' + t('controls.cancel') + '</button></div></div>'
    + '<ul class="hw-ledger hw-sell-list"></ul><p class="hh-empty hw-sell-none">Nothing to sell</p></section>'`,
    `    + '<ul class="hw-ledger hw-sell-list"></ul><p class="hh-empty hw-sell-none">Nothing to sell</p>'
    + '<div class="hw-confirm" role="alertdialog" aria-label="Confirm the sale"><p class="hw-confirm-q"></p><p class="hw-confirm-note"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="confirm-yes" data-coach-hook="sell-confirm"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="confirm-no">' + t('controls.cancel') + '</button></div></div></section>'`] };

const GUARD = 'tests/alpha-windows-return.mjs';
/* A mutant whose name starts so is judged by that pure rule function on a planted copy of src (tickerMutant), never the page. */
const JUDGES = {
};

async function main() {
  const g = { guard: GUARD, green: 'one gold press home; the next ground after one outgrown; the next buy; the first dangerous run; a seed says its needs; the clean return; top loot in sight; the summary’s answer is the press’s; nothing lies on the press in hand', pure: null, checks: checks, mutants: MUTANTS, companion: COMPANION, judges: JUDGES };
  if (process.argv.includes('--shard-plan')) return shardPlan(g);
  if (process.argv.includes('--mutate')) return mutate(g);
  return plain(g);
}

main().then((code) => process.exit(code));
