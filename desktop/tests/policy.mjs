#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// desktop/tests/policy.mjs — THE SHELL'S RULES, IN PLAIN NODE.
//
//   node tests/policy.mjs            the rules
//   node tests/policy.mjs --mutate   each rule's planted defect goes red (a guard that has never been red is not a guard)
// mutant-anchors: none — the mutants are planted in a copy of the policy text, inside this process
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, '..', 'src', 'policy.cjs');

function check(p) {
  const fails = [];
  const eq = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(name + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); };
  const G = 'https://hearthrise.net/play.html', OFF = 'file:///app/src/offline.html';

  eq('no override plays the live site', p.gameUrlOf({}), G);
  eq('a loopback world may be played', p.gameUrlOf({ HR_DESKTOP_URL: 'http://127.0.0.1:8787/play.html' }), 'http://127.0.0.1:8787/play.html');
  eq('another site never', p.gameUrlOf({ HR_DESKTOP_URL: 'https://evil.example/play.html' }), G);
  eq('http on another host never', p.gameUrlOf({ HR_DESKTOP_URL: 'http://192.168.1.9/play.html' }), G);
  eq('a look-alike host never', p.gameUrlOf({ HR_DESKTOP_URL: 'http://127.0.0.1.evil.example/play.html' }), G);
  eq('junk never', p.gameUrlOf({ HR_DESKTOP_URL: 'not a url' }), G);

  eq('the game stays', p.decideNavigation('https://hearthrise.net/play.html#x', G, OFF), 'stay');
  eq('the offline page stays', p.decideNavigation(OFF, G, OFF), 'stay');
  eq('a legal link goes to the browser', p.decideNavigation('https://discord.gg/abc', G, OFF), 'browser');
  eq('mail goes to the browser', p.decideNavigation('mailto:help@hearthrise.net', G, OFF), 'browser');
  eq('http off the game is refused', p.decideNavigation('http://example.com/', G, OFF), 'refuse');
  eq('a file is refused', p.decideNavigation('file:///C:/Windows/win.ini', G, OFF), 'refuse');
  eq('a custom scheme is refused', p.decideNavigation('ms-settings:privacy', G, OFF), 'refuse');
  eq('a look-alike host leaves the window', p.decideNavigation('https://hearthrise.net.evil.example/play.html', G, OFF), 'browser');

  eq('a recovery link', p.tokenLinkFrom(['x.exe', 'hearthrise://auth#access_token=a&type=recovery']), '#access_token=a&type=recovery');
  eq('a failed link', p.tokenLinkFrom(['hearthrise://auth/#error=access_denied']), '#error=access_denied');
  eq('no token, no load', p.tokenLinkFrom(['hearthrise://auth#hello']), null);
  eq('another scheme, no load', p.tokenLinkFrom(['https://auth#access_token=a']), null);

  const d = (scaleFactor, pxW, pxH) => ({ scaleFactor, size: { width: pxW / scaleFactor, height: pxH / scaleFactor } });
  eq('100% stays', p.integerScaleFor(d(1, 1920, 1080)), { scale: 1, zoom: 1 });
  eq('125% shows 1:1', p.integerScaleFor(d(1.25, 1920, 1080)), { scale: 1, zoom: 0.8 });
  eq('150% on 4K shows 1:1', p.integerScaleFor(d(1.5, 3840, 2160)).scale, 1);
  eq('200% on 4K shows 2:1', p.integerScaleFor(d(2, 3840, 2160)), { scale: 2, zoom: 1 });
  eq('200% on 1080p would leave a phone page: 1:1', p.integerScaleFor(d(2, 1920, 1080)), { scale: 1, zoom: 0.5 });
  eq('Deck', p.integerScaleFor(d(1, 1280, 800)), { scale: 1, zoom: 1 });
  return fails;
}

/** Each defect is one rule weakened in a copy of the file. */
const MUTANTS = [
  ['loopback host check dropped', /if \(u\.protocol === 'http:' && LOOPBACK\.test\(u\.hostname\)\) return u\.href;/, 'return u.href;'],
  ['any https link stays in the window', /if \(u\.protocol === 'https:' \|\| u\.protocol === 'mailto:'\) return 'browser';/, "if (u.protocol === 'https:') return 'stay'; if (u.protocol === 'mailto:') return 'browser';"],
  ['refuse becomes browser', /return 'refuse';\n\}/, "return 'browser';\n}"],
  ['a token-less link loads', /return \/\^#\(\.\*&\)\?\(access_token\|error\|error_code\)=\/\.test\(hash\) \? hash : null;/, 'return hash;'],
  ['fractional scale kept', /let k = Math\.max\(1, Math\.floor\(s \+ 1e-6\)\);/, 'let k = s;'],
  ['the phone-page floor dropped', /while \(k > 1 && \(w \/ k < MIN_CSS\.width \|\| h \/ k < MIN_CSS\.height\)\) k--;/, ''],
];

if (process.argv.includes('--mutate')) {
  const text = readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
  let bad = 0;
  for (const [name, from, to] of MUTANTS) {
    if (!from.test(text)) { console.log('  RED  anchor moved: ' + name); bad++; continue; }
    const m = { exports: {} };
    new Function('module', 'exports', 'require', text.replace(from, to))(m, m.exports, require);
    const caught = check(m.exports).length > 0;
    console.log((caught ? '  ok   caught: ' : '  RED  survived: ') + name);
    if (!caught) bad++;
  }
  console.log(bad ? 'policy --mutate: RED' : 'policy --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
  process.exit(bad ? 1 : 0);
}
const fails = check(require(FILE));
for (const f of fails) console.log('  RED  ' + f);
console.log(fails.length ? 'policy: RED' : 'policy: green');
process.exit(fails.length ? 1 : 0);
