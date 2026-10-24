#!/usr/bin/env node
// art/review/ui-options-2026-10-24/inline.mjs <a|b|c> — print one option's CSS as a single injectable line:
// every url('x.png') becomes a data: URI (play.html's CSP allows data: images and inline styles, but not a
// <link> to another port), comments and runs of whitespace go. Paste the output into the browser pane as:
//   (s => { let e = document.getElementById('ui-opt') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'ui-opt' })); e.textContent = s; })(`<output>`)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const opt = process.argv[2];
const file = resolve(here, opt, 'option.css');
let css = readFileSync(file, 'utf8');
/* The game's own art stays a page-relative path (same origin); the option's art is declared once as a variable. */
const vars = new Map();
css = css.replace(/url\('([^')]+\.png)'\)/g, (m, rel) => {
  const at = rel.indexOf('assets/');
  if (at >= 0) return "url('" + rel.slice(at) + "')";
  if (!vars.has(rel)) vars.set(rel, '--uio-' + vars.size);
  return 'var(' + vars.get(rel) + ')';
});
const decl = [...vars].map(([rel, v]) => v + ':url(data:image/png;base64,' + readFileSync(resolve(dirname(file), rel)).toString('base64') + ')').join(';');
css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/: /g, ':').replace(/;}/g, '}').trim();
/* --vars: only the image variables (inject once into <style id="ui-opt-img">); default: only the rules. */
process.stdout.write(process.argv.includes('--vars') ? (decl ? ':root{' + decl + '}' : '') : css);
