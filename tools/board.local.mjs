// tools/board.local.mjs — the second-monitor board: every one-screen tool on one page, no tokens.
//
//   node tools/board.local.mjs              serve http://localhost:8199 (Ctrl+C stops)
//   node tools/board.local.mjs --port 8200  another port
//   node tools/board.local.mjs --once       run every panel once, print them, exit (for checking)
//
// Runs the existing local tools on their own timers (lane-watch, release-check for the live version,
// hunt-health, vitals, pc-load, economy-watch) and serves their text as panels, each stamped with its
// age. The page polls /state.json every 10 s; nothing is computed in the browser. /translate is an
// offline translator: tools/translate-worker.py (Argos Translate, Python) runs as a child; nothing leaves the PC.
// Reads only what those tools read. Writes nothing. Local tool, not in CI.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const portAt = args.indexOf('--port');
const PORT = portAt >= 0 ? Number(args[portAt + 1]) || 8199 : Number(process.env.PORT) || 8199;
const ONCE = args.includes('--once');
const LIVE = 'https://hearthrise.net/src/build-info.js';

/* Each panel: a tool, how often it runs (seconds), how long it may take. Order is the page order. */
const PANELS = [
  { id: 'release', title: 'Release', every: 60, timeout: 60, argv: async () => ['tools/release-check.local.mjs', await liveVersion()] },
  { id: 'lanes', title: 'Lanes', every: 60, timeout: 90, argv: () => ['tools/lane-watch.local.mjs'] },
  { id: 'hunts', title: 'Hunt health', every: 30, timeout: 45, argv: () => ['tools/hunt-health.local.mjs'] },
  { id: 'pc', title: 'This PC', every: 15, timeout: 30, argv: () => ['tools/pc-load.local.mjs'] },
  { id: 'vitals', title: 'Vitals (7 days)', every: 300, timeout: 90, argv: () => ['tools/vitals.mjs'] },
  { id: 'refusals', title: 'Refusals', every: 300, timeout: 90, argv: () => ['tools/vitals.mjs', '--refusals'] },
  { id: 'economy', title: 'Economy', every: 300, timeout: 90, argv: () => ['tools/economy-watch.local.mjs'] },
];

const state = Object.fromEntries(PANELS.map((p) => [p.id, { title: p.title, text: 'waiting…', at: 0, ms: 0, ok: true, every: p.every }]));

async function liveVersion() {
  try { const t = await (await fetch(LIVE + '?n=' + Date.now())).text(); return (t.match(/version:\s*'([^']+)'/) || [])[1] || '0.0.0'; } catch { return '0.0.0'; }
}

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

function run(argv, timeout) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, argv, { cwd: process.cwd(), env: process.env, windowsHide: true });
    let out = '';
    const take = (d) => { out += d; if (out.length > 60000) out = out.slice(-60000); };
    child.stdout.on('data', take); child.stderr.on('data', take);
    const timer = setTimeout(() => { child.kill(); out += `\n[killed after ${timeout}s]`; }, timeout * 1000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ out: stripAnsi(out).trim(), code, ms: Date.now() - t0 }); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ out: String(e), code: -1, ms: Date.now() - t0 }); });
  });
}

async function refresh(p) {
  const s = state[p.id];
  if (s.busy) return;
  s.busy = true;
  try {
    const r = await run(await p.argv(), p.timeout);
    s.text = r.out || '(no output)'; s.at = Date.now(); s.ms = r.ms; s.ok = r.code === 0;
  } catch (e) { s.text = String(e); s.at = Date.now(); s.ok = false; }
  s.busy = false;
}

/* ── offline translator worker (tools/translate-worker.py, Argos) ────── */
const PY = [join(process.env.LOCALAPPDATA || '', 'Programs/Python/Python312/python.exe'), 'python'].find((p) => p === 'python' || existsSync(p));
let worker = null, ready = false; const queue = [];
function startWorker() {
  worker = spawn(PY, ['tools/translate-worker.py'], { cwd: process.cwd(), windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  let buf = '';
  worker.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    if (j.ready) { ready = true; continue; } const q = queue.shift(); if (q) q(j); } });
  worker.stderr.on('data', () => {});
  worker.on('close', () => { ready = false; worker = null; for (const q of queue.splice(0)) q({ error: 'translator restarted' }); setTimeout(startWorker, 3000); });
}
function translate(req) {
  return new Promise((resolve) => { if (!worker) return resolve({ error: 'translator not running' }); queue.push(resolve); worker.stdin.write(JSON.stringify(req) + '\n'); });
}
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => r(b)); });

/* ── the page ───────────────────────────────────────────────────────────── */
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hearthrise board</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#1b1a18;--panel:#24221f;--ink:#e8e2d4;--dim:#9a927f;--gold:#d9a94a;--red:#e06b5a;--line:#33302a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.35 ui-monospace,Consolas,monospace}
header{display:flex;gap:18px;align-items:baseline;padding:8px 14px;border-bottom:1px solid var(--line)}
header h1{font-size:15px;margin:0;color:var(--gold);letter-spacing:.08em;text-transform:uppercase}
header a{color:var(--dim);text-decoration:none}header a:hover{color:var(--gold)}
#clock{margin-left:auto;color:var(--dim)}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:10px;padding:10px}
section{background:var(--panel);border-radius:4px;padding:8px 12px 10px;min-height:120px;display:flex;flex-direction:column}
section h2{font-size:13px;margin:0 0 6px;display:flex;justify-content:space-between;color:var(--gold);text-transform:uppercase;letter-spacing:.06em}
section h2 small{color:var(--dim);font-weight:normal;text-transform:none;letter-spacing:0}
section.stale h2 small{color:var(--red)}section.red h2{color:var(--red)}
pre{margin:0;white-space:pre-wrap;word-break:break-word;flex:1;overflow:auto;max-height:46vh}
.alarm{color:var(--red);font-weight:bold}.good{color:#8cc66b}
</style></head><body>
<header><h1>Hearthrise</h1><a href="/translate">translator</a><span id="clock"></span></header>
<main id="main"></main>
<script>
const ALARM=/\\b(FREEZING|STALLED|RED|failed|failure|timed out|unreachable|P1|refused|error)\\b/g;
const GOOD=/\\b(green|serving v[0-9.]+|LANE DONE|none freezing)\\b/g;
function paint(t){return t.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])).replace(ALARM,'<span class=alarm>$&</span>').replace(GOOD,'<span class=good>$&</span>')}
function ago(ms){const s=Math.round(ms/1000);return s<60?s+'s':Math.floor(s/60)+'m'+String(s%60).padStart(2,'0')+'s'}
async function tick(){
  let st;try{st=await (await fetch('/state.json?n='+Date.now())).json()}catch{document.getElementById('clock').textContent='board server gone';return}
  const main=document.getElementById('main');const now=Date.now();
  for(const [id,s] of Object.entries(st)){
    let sec=document.getElementById(id);
    if(!sec){sec=document.createElement('section');sec.id=id;sec.innerHTML='<h2><span></span><small></small></h2><pre></pre>';main.appendChild(sec)}
    const age=s.at?now-s.at:0;
    sec.querySelector('h2 span').textContent=s.title;
    sec.querySelector('h2 small').textContent=s.at?ago(age)+' ago · '+(s.ms/1000).toFixed(1)+'s':'…';
    sec.classList.toggle('stale',s.at&&age>s.every*3000);sec.classList.toggle('red',!s.ok);
    sec.querySelector('pre').innerHTML=paint(s.text);
  }
  document.getElementById('clock').textContent=new Date().toUTCString().slice(17,25)+' UTC';
}
tick();setInterval(tick,10000);
</script></body></html>`;

const TRANSLATE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Translator</title>
<style>
:root{--bg:#1b1a18;--panel:#24221f;--ink:#e8e2d4;--dim:#9a927f;--gold:#d9a94a;--line:#33302a}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,sans-serif}
header{display:flex;gap:18px;align-items:baseline;padding:8px 14px;border-bottom:1px solid var(--line)}
header h1{font-size:15px;margin:0;color:var(--gold);letter-spacing:.08em;text-transform:uppercase}header a{color:var(--dim)}
main{padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
textarea{width:100%;height:60vh;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:10px;font:inherit;resize:vertical}
select,button{background:var(--panel);color:var(--ink);border:1px solid var(--line);padding:6px 10px;font:inherit;border-radius:4px}
.bar{grid-column:1/-1;display:flex;gap:10px;align-items:center}#status{color:var(--dim);margin-left:auto}
</style></head><body>
<header><h1>Translator</h1><a href="/">board</a></header>
<main>
<div class="bar">
 <label>From <select id="from"><option value="auto">detect</option></select></label>
 <label>To <select id="to"></select></label>
 <button id="swap">⇄</button>
 <button id="run">Translate</button>
 <span id="status">checking Chrome's on-device translator…</span>
</div>
<textarea id="src" placeholder="Paste text here. Translation runs on this PC, nothing leaves it."></textarea>
<textarea id="dst" readonly placeholder="Translation"></textarea>
</main>
<script>
const LANGS=[['en','English'],['es','Spanish'],['pt','Portuguese'],['de','German'],['fr','French'],['pl','Polish'],['ru','Russian'],['tr','Turkish'],['it','Italian']];const OLD=[['es','Spanish'],['pt','Portuguese'],['fr','French'],['de','German'],['it','Italian'],['nl','Dutch'],['pl','Polish'],['ru','Russian'],['uk','Ukrainian'],['tr','Turkish'],['ar','Arabic'],['hi','Hindi'],['ja','Japanese'],['ko','Korean'],['zh','Chinese'],['vi','Vietnamese'],['th','Thai'],['id','Indonesian'],['sv','Swedish'],['da','Danish'],['fi','Finnish'],['nb','Norwegian'],['cs','Czech'],['hu','Hungarian'],['ro','Romanian'],['el','Greek'],['he','Hebrew']];void OLD;
const $=id=>document.getElementById(id);
for(const [c,n] of LANGS){$('from').append(new Option(n,c));$('to').append(new Option(n,c))}
$('to').value='en';$('from').value=localStorage.getItem('from')||'auto';$('from').addEventListener('change',()=>localStorage.setItem('from',$('from').value));
const status=t=>$('status').textContent=t;
status('ready · paste text, press Translate (Ctrl+Enter) · runs on this PC');
let timer,translator,key='';
const within=(p,ms)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('this browser never answered: it has no on-device translator. Use Chrome itself (138+), not the Claude app pane')),ms))]);
async function detect(text){
  if(!('LanguageDetector' in self)||await within(LanguageDetector.availability(),8000)==='unavailable')throw new Error('this browser cannot detect the language. Pick it under From');
  const d=await LanguageDetector.create();const r=await d.detect(text);return (r[0]&&r[0].detectedLanguage)||'en';
}
async function go(){try{await run()}catch(e){status('error: '+(e&&e.message||e))}}
async function run(){
  const text=$('src').value.trim();if(!text)return;status('translating…');
  const r=await (await fetch('/api/translate',{method:'POST',body:JSON.stringify({from:$('from').value,to:$('to').value,text})})).json();
  if(r.error){status('error: '+r.error);return}
  $('dst').value=r.out;status(r.from+'>'+$('to').value+' · '+r.ms+' ms · on this PC');translator=true;return;
  let from=$('from').value;if(from==='auto')from=await detect(text);
  const to=$('to').value;if(from===to){$('dst').value=text;status('same language');return}
  const k=from+'>'+to;
  if(k!==key){status('loading '+k+' model (first time downloads it, then it is on disk)…');
    const avail=await within(Translator.availability({sourceLanguage:from,targetLanguage:to}),8000);
    if(avail==='unavailable'){status(k+' is not a pair Chrome can do offline');return}
    translator=await Translator.create({sourceLanguage:from,targetLanguage:to,monitor(m){m.addEventListener('downloadprogress',e=>status('downloading '+Math.round(e.loaded*100)+'%'))}});key=k}
  const t0=performance.now();$('dst').value=await translator.translate(text);status(k+' · '+Math.round(performance.now()-t0)+' ms · on device');
}
$('src').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(go,600)});
$('run').onclick=go;
$('src').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.ctrlKey)go()});
$('from').onchange=$('to').onchange=go;
$('swap').onclick=()=>{const f=$('from').value,t=$('to').value;if(f==='auto')return;$('from').value=t;$('to').value=f;$('src').value=$('dst').value;go()};

</script></body></html>`;

/* ── main ───────────────────────────────────────────────────────────────── */
if (ONCE) {
  for (const p of PANELS) { await refresh(p); console.log(`\n== ${p.title} (${(state[p.id].ms / 1000).toFixed(1)}s, exit ${state[p.id].ok ? 0 : 'non-zero'}) ==\n${state[p.id].text}`); }
  process.exit(0);
}

startWorker();
for (const p of PANELS) { refresh(p); setInterval(() => refresh(p), p.every * 1000); }

createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/state.json') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(state)); }
  if (url === '/api/translate' && req.method === 'POST') { return readBody(req).then(async (b) => { let j; try { j = JSON.parse(b); } catch { j = {}; } const r = await translate({ from: j.from || 'auto', to: j.to || 'en', text: String(j.text || '').slice(0, 5000) }); res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(r)); }); }
  if (url === '/translate') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(TRANSLATE); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE);
}).listen(PORT, '127.0.0.1', () => console.log(`board: http://localhost:${PORT}  (translator: /translate)`));
