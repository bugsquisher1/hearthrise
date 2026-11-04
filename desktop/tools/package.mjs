#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// desktop/tools/package.mjs — THE FOLDER STEAM WOULD SHIP (a SteamPipe depot), AND ITS SIZE.
//
//   node tools/package.mjs [--keep-all-locales]
//
// Steam installs a folder, so there is no installer to build or sign for Steam: this makes desktop/out/Hearthrise-win32-x64
// and prints what a player downloads (xz of the folder, the nearest local stand-in for SteamPipe's compressed chunks) and what
// sits on disk. Nothing is signed; nothing is uploaded.
// mutant-anchors: none — a prototype's packaging script, not a repo guard
// ════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(DESKTOP, 'out');
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
function sizeOf(p) {
  const s = statSync(p);
  if (!s.isDirectory()) return s.size;
  return readdirSync(p).reduce((sum, e) => sum + sizeOf(join(p, e)), 0);
}

const [dir] = await packager({
  dir: DESKTOP,
  out: OUT,
  name: 'Hearthrise',
  platform: 'win32',
  arch: 'x64',
  overwrite: true,
  prune: true,
  /* .node and its .dll must sit on disk: require() can't load them from inside an asar. */
  asar: { unpack: '**/*.{node,dll,so,dylib}' },
  ignore: [/^\/tests($|\/)/, /^\/tools($|\/)/, /^\/out($|\/)/, /^\/\.gitignore$/, /steamworks\.js\/dist\/(linux64|osx)/, /\.lib$/],
});

if (!process.argv.includes('--keep-all-locales')) {
  const locales = join(dir, 'locales');
  for (const f of readdirSync(locales)) if (f !== 'en-US.pak') rmSync(join(locales, f));
}

const archive = join(OUT, 'Hearthrise-win32-x64.tar.xz');
rmSync(archive, { force: true });
const tar = spawnSync('tar', ['-cJf', basename(archive), basename(dir)], { cwd: OUT, encoding: 'utf8', timeout: 600000 });
const biggest = readdirSync(dir).map((f) => [f, sizeOf(join(dir, f))]).sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log('folder: ' + dir);
console.log('installed: ' + mb(sizeOf(dir)));
console.log('download (tar.xz stand-in): ' + (tar.status === 0 ? mb(statSync(archive).size) : 'tar failed: ' + tar.stderr));
console.log('biggest: ' + biggest.map(([f, n]) => f + ' ' + mb(n)).join(', '));
