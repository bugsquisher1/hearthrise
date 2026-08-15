// ════════════════════════════════════════════════════════════════════════
// tools/lib/slice-literal.mjs — read a data literal OUT of a classic script.
//
// WHY THIS EXISTS AS ITS OWN FILE
//   src/legacy.js is a classic script. Deno cannot import it, ESM cannot
//   import it, and it holds game data the server has to own: every shop
//   price (tools/gen-shops.mjs) and every room-rung bonus payload
//   (tools/gen-perks.mjs). Both generators need the same trick — anchor,
//   brace-match, evaluate — and it was written once for shops. A second
//   copy of a PARSER is the same failure as a second copy of DATA: they
//   drift, and the drift is invisible because both sides still "work".
//
//   So it moved here verbatim, and gen-shops.mjs now imports it. That is
//   the whole change to gen-shops.mjs; `node tools/gen-shops.mjs --check`
//   passing afterwards is the proof the extraction is unchanged (the
//   catalogue digest is a hash of the extracted data, so any behavioural
//   difference in the slicer moves it).
//
// WHY NOT A REGEX
//   A regex that scrapes `cost:(\d+)` cannot tell a price from a level
//   requirement and cannot see a table that has been renamed. An evaluated
//   slice either produces the real object or throws. Every anchor must match
//   EXACTLY ONCE — zero means the table was renamed, two means the anchor is
//   ambiguous, and both are build failures rather than guesses.
//
//   Comments and string/template bodies are skipped, so a `}` inside a
//   comment or a `'{'` inside a description cannot close the object early.
//   Regex LITERALS are not tracked — no anchored literal contains one, and if
//   that ever changes the slice stops parsing and this throws, which is the
//   correct outcome rather than a silently truncated table.
// ════════════════════════════════════════════════════════════════════════

/** Fail the build with a named tool prefix. Never returns. */
export function makeDie(tool) {
  return (msg) => { console.error(`${tool}: ${msg}`); process.exit(1); };
}

/**
 * Slice one object/array literal out of `src` and evaluate it.
 * @param src    the whole file text
 * @param anchor must END on the literal's opening bracket, e.g. 'const ROOMS={'
 * @param where  a human name for the file, used in error text
 * @param die    a failure function (makeDie('gen-perks'))
 */
export function sliceLiteral(src, anchor, where, die) {
  const hits = [];
  let at = -1;
  while ((at = src.indexOf(anchor, at + 1)) !== -1) hits.push(at);
  if (hits.length !== 1) {
    die(`anchor ${JSON.stringify(anchor)} matched ${hits.length} times in ${where} `
      + '— expected exactly 1. The table was renamed, moved, or duplicated; '
      + 'fix the anchor rather than letting the extraction guess.');
  }
  const open = hits[0] + anchor.length - 1;
  const openCh = src[open];
  if (openCh !== '{' && openCh !== '[') die(`anchor ${JSON.stringify(anchor)} must end on { or [`);
  const closeCh = openCh === '{' ? '}' : ']';
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) break; i = e + 1; continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); if (e < 0) break; i = e; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; }
      continue;
    }
    if (c === openCh) depth++;
    else if (c === closeCh) { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) die(`unbalanced literal for ${JSON.stringify(anchor)} in ${where}`);
  const text = src.slice(open, i + 1);
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return (${text});`)();
  } catch (e) {
    return die(`literal at ${JSON.stringify(anchor)} in ${where} does not evaluate: ${e.message}`);
  }
}

/**
 * A bare numeric constant (`const VENDOR_RAW_RATE = 0.20;`).
 * Same uniqueness rule as sliceLiteral: exactly one declaration, or fail.
 */
export function sliceNumber(src, decl, where, die) {
  const re = new RegExp(`${decl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`, 'g');
  const hits = [...src.matchAll(re)];
  if (hits.length !== 1) die(`${decl} matched ${hits.length} declarations in ${where} — expected exactly 1`);
  return Number(hits[0][1]);
}
