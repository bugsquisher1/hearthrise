// tests/_js-strip.mjs — a JS source in two views, for the text guards. Moved out of the
// retired tests/market-price-source.mjs on 2026-10-17; tests/platform-seam.mjs reads it.
// mutant-anchors: none — a pure helper with no proof arm of its own

/** Two views of a JS source: comments blanked (strings kept), and comments AND
 *  string/template/regex literals blanked. Newlines survive so lines map 1:1. */
export function strip(src) {
  let noC = '', noCS = '';
  let i = 0, prev = '';
  const put = (c, keepInStrings) => { noC += keepInStrings; noCS += c; };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') { put(' ', ' '); i++; }
      continue;
    }
    if (c === '/' && n === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { const k = src[i] === '\n' ? '\n' : ' '; put(k, k); i++; }
      put(' ', ' '); put(' ', ' '); i += 2;
      continue;
    }
    const regexOk = c === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev));
    if (c === '"' || c === "'" || c === '`' || regexOk) {
      const q = c; put(q, q); i++;
      let inClass = false;
      while (i < src.length) {
        const d = src[i];
        if (d === '\\') { put(' ', d + (src[i + 1] || '')); noCS += ' '; i += 2; continue; }
        if (q === '/' && d === '[') inClass = true;
        else if (q === '/' && d === ']') inClass = false;
        if (d === q && !inClass) break;
        if (d === '\n' && q !== '`') break;
        put(d === '\n' ? '\n' : ' ', d); i++;
      }
      if (i < src.length) { put(src[i], src[i]); i++; }
      prev = 'x';
      continue;
    }
    put(c, c);
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return { noC, noCS };
}
