#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/domain.mjs — A PHASE-2 DIVE'S READING LIST, FROM THE GAME ITSELF.
//
//   node tools/balance-program/domain.mjs                 the eight domains and their system counts by status
//   node tools/balance-program/domain.mjs <domain>        every system the domain owns: status, what it uses and gives,
//                                                         and every code anchor it claims (files, tables, functions, client
//                                                         RPCs, sections, switches, unlock rows), read by collect.mjs
//   node tools/balance-program/domain.mjs <domain> --docs also the rulings, board headings, plan headings and lanes it claims
//   node tools/balance-program/domain.mjs --system <id>   one system, with its docs
//
// Reads only. Exit 0 when it ran, 2 on a bad argument. The claim rule is the one inventory.mjs checks (claimsOf below).
// ════════════════════════════════════════════════════════════════════════
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAll, CODE_KINDS } from './collect.mjs';
import { SYSTEMS, DOMAINS, STATUSES } from './systems.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Does `row` (a system or an out-of-scope row) claim `anchor`? Code anchors by `<kind>:<id>`, the rest by their text. */
export function claimsOf(row, anchor) {
  return CODE_KINDS.includes(anchor.kind)
    ? row.code.test(`${anchor.kind}:${anchor.id}`.toLowerCase())
    : row.docs.test(`${anchor.id} ${anchor.text}`.toLowerCase());
}

async function main() {
  const args = process.argv.slice(2);
  const sysId = args.includes('--system') ? args[args.indexOf('--system') + 1] : null;
  const dom = sysId ? null : args.find((a) => !a.startsWith('--'));
  if (!dom && !sysId) {
    console.log('domain | systems | ' + STATUSES.join(' | ') + ' | covers');
    for (const d of DOMAINS) {
      const rows = SYSTEMS.filter((s) => s.domain === d.id);
      console.log([d.id, rows.length, ...STATUSES.map((st) => rows.filter((s) => s.status === st).length), d.brief].join(' | '));
    }
    console.log('all | ' + SYSTEMS.length);
    return 0;
  }
  const rows = sysId ? SYSTEMS.filter((s) => s.id === sysId) : SYSTEMS.filter((s) => s.domain === dom);
  if (!rows.length) { console.error(sysId ? 'no such system ' + sysId : 'no such domain ' + dom + ' (' + DOMAINS.map((d) => d.id).join(', ') + ')'); return 2; }
  const docs = args.includes('--docs') || !!sysId;
  const { anchors } = await collectAll({ root: ROOT });
  for (const s of rows) {
    const mine = anchors.filter((a) => claimsOf(s, a));
    const code = mine.filter((a) => CODE_KINDS.includes(a.kind));
    console.log(`\n## ${s.id} [${s.status}] ${s.name}`);
    console.log(`uses: ${s.uses || '-'}\ngives: ${s.gives || '-'}${s.note ? '\nnote: ' + s.note : ''}`);
    const by = {};
    for (const a of code) (by[a.kind] ??= []).push(a.id);
    for (const [k, ids] of Object.entries(by)) console.log(`${k} (${ids.length}): ${ids.join(', ')}`);
    if (!code.length) console.log('code: none (nothing built)');
    if (docs) for (const a of mine.filter((x) => !CODE_KINDS.includes(x.kind))) console.log(`${a.kind} ${a.id}: ${a.text.slice(0, 200)}`);
    else console.log(`docs: ${mine.length - code.length} rulings, headings, memory lines and lanes (add --docs)`);
  }
  return 0;
}
if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
