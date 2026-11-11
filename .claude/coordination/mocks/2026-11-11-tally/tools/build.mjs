import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const ROOT = 'R:/the game/the game/.claude/worktrees/agent-ae4c2c53866129ee3';
const DIR = ROOT + '/.claude/coordination/mocks/2026-11-11-tally';
const OUT = DIR + '/after';
mkdirSync(OUT, { recursive: true });
const CSS = readFileSync(DIR + '/mock.css', 'utf8');
const { openWorld } = await import(pathToFileURL(ROOT + '/tools/qa/local-world.mjs').href);
const world = await openWorld({ tickMs: false });

const TASKS = {
  cellar_giant_rats: { mon: 'rat', hunt: 'mill_cellar', ground: 'Mill Cellar', lvl: 1, n: 25, label: 'Giant Rats', gold: 25, piece: 'bronze_helm', pieceName: 'Bronze Helm' },
  thicket_gray_wolves: { mon: 'gray_wolf', hunt: 'meadowbrook_thicket', ground: 'Meadowbrook Thicket', lvl: 5, n: 200, label: 'Gray Wolves', gold: 480, piece: 'bronze_platebody', pieceName: 'Bronze Platebody' },
  wickstead_turncoats: { mon: 'turncoat', hunt: 'wickstead', ground: 'Wickstead', lvl: 8, n: 50, label: 'Turncoats', gold: 780, piece: 'iron_platebody', pieceName: 'Iron Platebody' },
  sewer_rat_king: { mon: 'rat_king', hunt: 'millrace_sewer', ground: 'The Sewer', lvl: 8, n: 5, label: 'the Rat King', gold: 1020, piece: 'iron_helm', pieceName: 'Iron Helm', party: true },
  glade_poachers: { mon: 'glade_poacher', hunt: 'mosslight_glade', ground: 'Mosslight Glade', lvl: 16, n: 60, label: 'Glade Poachers', gold: 920, piece: 'steel_helm', pieceName: 'Steel Helm' },
  warrens_goblin_diggers: { mon: 'goblin_digger', hunt: 'coppercap_warrens', ground: 'Coppercap Warrens', lvl: 32, n: 30, label: 'Goblin Diggers', gold: 1090, piece: 'steel_helm', pieceName: 'Steel Helm', party: true },
};
const ORDER = Object.keys(TASKS);
const SPRITES = {};
const fmt = (n) => n.toLocaleString('en-US');
const ico = (id) => 'assets/icons-bundle/pixel/items/' + id + '.png';
const mon = () => '';
const article = (n) => (/^[aeiou]/i.test(n) ? 'an ' : 'a ') + n;
const title = (t) => (/^the /.test(t.label) ? 'The Rat King, ' + t.n + ' times' : fmt(t.n) + ' ' + t.label);

function marks(kills, n) {
  const cut = Math.floor(Math.min(1, kills / n) * 10);
  let h = '<span class="ht-marks" role="meter" aria-valuenow="' + kills + '" aria-valuemax="' + n + '">';
  for (let g = 0; g < 2; g++) { h += '<span class="ht-five">'; for (let i = 0; i < 5; i++) h += '<i' + (g * 5 + i < cut ? ' class="is-cut"' : '') + '></i>'; h += '</span>'; }
  return h + '</span>';
}
function entry(id, kills, o = {}) {
  const t = TASKS[id];
  const done = kills >= t.n;
  const get = done ? (o.doneWords || 'Done.') + ' You\'ll get <b>' + fmt(t.gold) + ' gp</b> and ' + (/^[aeiou]/i.test(t.pieceName) ? 'an ' : 'a ') + '<b>' + t.pieceName + '</b>' + '.'
    : 'You\'ll get <b>' + fmt(t.gold) + ' gp</b> and ' + (/^[aeiou]/i.test(t.pieceName) ? 'an ' : 'a ') + '<b>' + t.pieceName + '</b>' + '.';
  return '<li class="ht-entry' + (done ? ' is-done' : '') + '">' + mon(t)
    + '<span class="ht-entry-top"><b>' + (/^the /.test(t.label) ? 'The Rat King' : t.label) + '</b><span class="ht-count">' + fmt(Math.min(kills, t.n)) + '<small> / ' + fmt(t.n) + '</small></span></span>'
    + '<span class="ht-pocket"><img alt="" src="' + ico(t.piece) + '"></span>'
    + marks(kills, t.n)
    + '<p class="ht-get">' + get + '</p>'
    + '<div class="ht-foot"><span>' + (o.here ? 'Counting here in ' + t.ground : '<button type="button" class="hs-goto">' + t.ground + '</button>') + '</span>'
    + '<span class="ht-tools"><label class="ht-keep"><input type="checkbox"' + (o.keep ? ' checked' : '') + '> Keep</label><button type="button" class="hh-tool">Give up</button></span></div></li>';
}
function row(id, hero, o = {}) {
  const t = TASKS[id];
  const high = t.lvl > hero + 4;
  return '<li class="ht-row">' + mon(t)
    + '<span class="ht-row-name"><b>' + title(t) + '</b><small><button type="button" class="hs-goto">' + t.ground + '</button> <span class="ht-lvl' + (high ? ' is-high' : '') + '">· Level ' + t.lvl + (t.party ? ', party' : '') + '</span></small></span>'
    + '<span class="ht-pocket"><img alt="" src="' + ico(t.piece) + '"></span>'
    + '<span class="ht-pay"><b>' + fmt(t.gold) + ' gp</b><small>' + t.pieceName + '</small></span>'
    + '<button type="button" class="hh-tool ht-take"' + (o.off ? ' disabled' : '') + '>Take</button></li>';
}
function body(s) {
  let h = '<div class="hw-tally">'
    + '<header class="ht-say"><span class="ht-who">Tamsin Reeve</span><span class="ht-day' + (s.paid >= 3 ? ' is-full' : '') + '">Paid today <b>' + s.paid + ' of 3</b> · new day in ' + s.reset + '</span>'
    + '<p class="ht-voice">' + s.voice + '</p></header>';
  if (s.held.length) {
    h += '<h3 class="ht-head">Your tallies <small>' + s.held.length + ' of 3</small></h3><ol class="ht-mine">' + s.held.map(([id, k, o]) => entry(id, k, o || {})).join('') + '</ol>';
  }
  const board = ORDER.filter((id) => !s.held.some(([x]) => x === id));
  h += '<h3 class="ht-head">Her board</h3>' + (s.boardWhy ? '<p class="ht-board-why">' + s.boardWhy + '</p>' : '')
    + '<ul class="ht-list">' + board.map((id) => row(id, s.hero, { off: !!s.boardWhy })).join('') + '</ul>';
  h += '<div class="ht-pick"><span>' + s.pick + '</span><button type="button" class="hh-tool"' + (s.pickOpen ? ' aria-pressed="true"' : '') + '>Change</button></div>';
  if (s.pickOpen) {
    h += '<div class="ht-pick-open"><div class="ht-weights" role="group"><button class="hh-seg" aria-pressed="true">Heavy</button><button class="hh-seg">Medium</button><button class="hh-seg">Light</button></div>'
      + '<p>Heavy armor adds max HP, up to 28% for a full set, and soaks part of every hit.</p>'
      + '<p>She fills your slots in this order. Tap one to have it first.</p>'
      + '<ol class="ht-slots">' + ['Head', 'Body', 'Legs', 'Feet', 'Hands', 'Waist'].map((x, i) => '<li><button><small>' + (i + 1) + '</small>' + x + '</button></li>').join('') + '</ol>'
      + '<p>She skips a slot you already wear at that tier or better. Once she\'s out of pieces for a ground, she pays in materials.</p></div>';
  }
  return h + '</div>';
}

async function inject(p, s, phone) {
  await p.page.evaluate(({ html, css, phone }) => {
    const win = document.querySelector('.hw-tally').closest('.hs-win');
    if (!document.getElementById('mock-css')) { const st = document.createElement('style'); st.id = 'mock-css'; st.textContent = css; document.head.appendChild(st); }
    win.querySelector('.mock-body')?.remove();
    const orig = win.querySelector('.hs-win-body');
    orig.style.display = 'none';
    const d = document.createElement('div');
    d.className = 'hs-win-body mock-body' + (phone ? ' is-phone-mock' : '');
    d.innerHTML = html;
    orig.after(d);
    d.scrollTop = 0;
  }, { html: body(s), css: CSS, phone });
  await p.page.waitForTimeout(800);
}
async function uninject(p) {
  await p.page.evaluate(() => { const w = document.querySelector('.mock-body'); if (w) { w.previousElementSibling.style.display = ''; w.remove(); } });
}
async function shot(p, tag, name) {
  await p.page.screenshot({ path: OUT + '/' + tag + '-' + name + '.png' });
  const win = await p.page.$('.mock-body');
  if (win) {
    const frame = await win.evaluateHandle((el) => el.closest('.hs-win'));
    await frame.asElement().screenshot({ path: OUT + '/' + tag + '-' + name + '-win.png' }).catch(() => {});
    const info = await win.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight, rows: Array.from(el.querySelectorAll('.ht-entry, .ht-row')).filter((r) => { const a = r.getBoundingClientRect(), b = el.getBoundingClientRect(); return a.bottom <= b.bottom + 1 && a.top >= b.top - 1; }).length,
      small: Array.from(el.querySelectorAll('*')).filter((x) => x.childNodes.length && [...x.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && parseFloat(getComputedStyle(x).fontSize) < 12).length,
      clipped: Array.from(el.querySelectorAll('b, small')).filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent) }));
    console.log('shot', tag, name, JSON.stringify(info));
  }
}
async function openTally(p) {
  if (!(await p.page.$('.hw-tally'))) await p.page.click('[data-hs-open="tally"]');
  await p.page.waitForSelector('.hw-tally');
  await p.page.waitForTimeout(2500);
}
async function closeTally(p) { await uninject(p); const b = await p.page.$('[data-hs-close="tally"]'); if (b) await b.click(); await p.page.waitForTimeout(1500); }

const sizes = [['d', { width: 1440, height: 900 }, false], ['m', { width: 922, height: 423 }, true]];
const ps = [];
for (const [tag, viewport, touch] of sizes) {
  const p = await world.play({ account: 'mock' + tag, viewport, touch });
  await p.createHero(tag === 'd' ? 'Marlow' : 'Wren');
  ps.push([tag, p, touch]);
}
try {
  /* the creatures as the Hunts window draws them (style 1 world sprites) */
  const p0 = ps[0][1];
  
  for (const id of []) {
    const t = TASKS[id];
    try {
      await p0.page.click('.hw-hunt[data-hunt="' + t.hunt + '"]', { timeout: 8000 });
      await p0.page.waitForSelector('.hw-hd-mon.is-drawn[data-monster="' + t.mon + '"] canvas', { timeout: 15000 });
      await p0.page.waitForTimeout(500);
      SPRITES[t.mon] = await p0.page.evaluate((m) => {
        const c = document.querySelector('.hw-hd-mon[data-monster="' + m + '"] canvas');
        /* crop to the drawn pixels so the stand sits on the well's floor */
        const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data;
        let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
        for (let y = 0; y < c.height; y++) for (let i = 0; i < c.width; i++) if (d[(y * c.width + i) * 4 + 3] > 8) { x0 = Math.min(x0, i); y0 = Math.min(y0, y); x1 = Math.max(x1, i); y1 = Math.max(y1, y); }
        const w = x1 - x0 + 1, h = y1 - y0 + 1; const o = document.createElement('canvas'); o.width = w; o.height = h;
        o.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h);
        return { src: o.toDataURL(), w, h, cw: c.width, ch: c.height, css: c.style.width };
      }, t.mon);
      console.log('sprite', t.mon, SPRITES[t.mon].w, SPRITES[t.mon].h, SPRITES[t.mon].cw, SPRITES[t.mon].css);
    } catch (e) { console.log('no sprite', t.mon, String(e).slice(0, 120)); }
  }
  
  /* integer scale: fit each sprite in the well at x1, or x2 when it is small */
  for (const k of Object.keys(SPRITES)) { const s = SPRITES[k]; const f = Math.max(1, Math.floor(Math.min(44 / s.w, 44 / s.h))); s.w *= f; s.h *= f; }

  const PICK_FIRST = 'Your first task asks her for <b>heavy armor</b>, since you fight with a shield.';
  const PICK = 'She pays you in <b>heavy armor</b>, head first, then body and legs.';
  /* S1: nothing taken yet */
  for (const [tag, p, phone] of ps) {
    await openTally(p);
    await inject(p, { hero: 1, paid: 0, reset: '6 h', held: [], voice: 'I kept the mill\'s rats down myself for thirty years. Then they got a king, so now I pay people to do it. Take one off my board.', pick: PICK_FIRST }, phone);
    await shot(p, tag, '01-fresh');
    await uninject(p);
  }
  for (const [, p] of ps) { await p.page.click('[data-hs-act="take"][data-task="cellar_giant_rats"]'); await p.page.waitForSelector('.ht-held .ht-tally'); await p.page.waitForTimeout(1500); }
  for (const [tag, p, phone] of ps) {
    await inject(p, { hero: 1, paid: 0, reset: '6 h', held: [['cellar_giant_rats', 0]], voice: 'Twenty-five rats in the Mill Cellar. They count even while you\'re away, so off you go.', pick: PICK }, phone);
    await shot(p, tag, '02-taken');
    await closeTally(p);
    await p.enterHunt('mill_cellar');
  }
  await world.skip(2);
  for (const [tag, p, phone] of ps) {
    await p.page.waitForTimeout(3000);
    await openTally(p);
    const k = await p.page.evaluate(() => { const m = /(\d+)\/25/.exec(document.querySelector('.ht-tally b')?.textContent || ''); return m ? +m[1] : 9; });
    await inject(p, { hero: 2, paid: 0, reset: '6 h', held: [['cellar_giant_rats', k, { here: true }]], voice: k + ' down, ' + (25 - k) + ' to go. Every one counts, even while you\'re away.', boardWhy: 'You can take more when you\'re back in town.', pick: PICK }, phone);
    await shot(p, tag, '03-hunting');
    await closeTally(p);
  }
  await world.skip(8);
  for (const [tag, p, phone] of ps) {
    await p.page.waitForTimeout(3000);
    await openTally(p);
    await inject(p, { hero: 4, paid: 0, reset: '6 h', held: [['cellar_giant_rats', 25, { here: true, doneWords: 'Done.' }]], voice: 'That\'s all 25. Come back to town and I\'ll pay you.', boardWhy: 'You can take more when you\'re back in town.', pick: PICK }, phone);
    await shot(p, tag, '04-done-hunting');
    await closeTally(p);
    await p.page.click('[data-hs-act="leave"]');
    await p.page.waitForFunction(() => /Mill Cellar/.test(document.querySelector('.hsum-card .hsum-title')?.textContent || ''), null, { timeout: 90000 }).catch(() => console.log('no summary'));
    await p.page.waitForTimeout(2000);
    await p.page.click('[data-hs-close="hunt-summary"]').catch(() => {});
  }
  for (const [tag, p, phone] of ps) {
    await openTally(p);
    await p.page.waitForTimeout(3000);
    await p.page.evaluate(() => { const w = document.querySelector('[data-hs-widget="tally"]'); if (w) w.style.visibility = 'hidden'; });
    await inject(p, { hero: 4, paid: 1, reset: '6 h', held: [['thicket_gray_wolves', 112], ['wickstead_turncoats', 31, { keep: true }]], voice: 'There you go, 25 gold and a Bronze Helm. Want another?', pick: PICK }, phone);
    await shot(p, tag, '05-paid-midgame');
    await inject(p, { hero: 9, paid: 3, reset: '6 h', held: [['wickstead_turncoats', 50, { keep: true, doneWords: 'Done. I\'ll pay you for this one tomorrow.' }], ['thicket_gray_wolves', 140], ['glade_poachers', 14]],
      voice: 'That\'s three today, and three\'s all I pay for. Bring the Turncoats back tomorrow.', boardWhy: 'You have three of mine already. Finish one or give one up.', pick: PICK }, phone);
    await shot(p, tag, '06-capped-full');
    if (!phone) {
      await inject(p, { hero: 4, paid: 1, reset: '6 h', held: [['thicket_gray_wolves', 112]], voice: 'There you go, 25 gold and a Bronze Helm. Want another?', pick: PICK, pickOpen: true }, phone);
      await p.page.evaluate(() => { const b = document.querySelector('.mock-body'); b.scrollTop = b.scrollHeight; });
      await p.page.waitForTimeout(500);
      await shot(p, tag, '07-pick-open');
    }
  }
  for (const [tag, p] of ps) console.log(tag, 'errors', p.errors.length, JSON.stringify(p.errors.slice(0, 3)));
} catch (e) { console.error('FAIL', e); for (const [tag, p] of ps) await p.page.screenshot({ path: OUT + '/' + tag + '-zz-fail.png' }).catch(() => {}); }
await world.close();
process.exit(0);
