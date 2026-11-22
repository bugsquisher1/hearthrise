// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/graph/derive.mjs — WHAT A PIECE OF RULE CODE READS AND WRITES, READ FROM THE CODE (Balance Lab phase 1, the
// model graph; docs/design/redesign/07-balance-lab.md section 3.1). Pure functions on source text. Nothing here is declared by hand.
//
//   topLevel(file, text)            -> every top-level binding: { name, kind, line, endLine }
//   occurrences(file, text, names)  -> every identifier and property name inside the named bindings (all of them when names is null):
//                                      { token, mode: 'r' | 'w', line, binding, kind, member, top }. `kind` 'id' is a bare identifier (with
//                                      `member` when a key is read off it: TABLE.key), 'self' the binding's own name, 'local' a declared local or
//                                      a parameter, 'prop' a property name. `top` is the first-level key of a table the occurrence sits under
//   importsOf(file, text)           -> what each imported local name is: Map(local -> { file, name }), relative paths resolved
//   homeOf(where)                   -> a register row's `where` text as { file, from, to, names }
//   bindingsIn(file, text, home)    -> the binding names a home covers in today's file (its names, else the bindings its lines overlap,
//                                      else the whole file)
//
// READ OR WRITE, one rule each:
//   WRITE  the target of an assignment (=, +=, -= and the rest), the operand of ++ or --, the name of a declared variable, a key of an
//          object literal (a returned row or a data table DEFINES that field), and the binding's own name (a function that returns a
//          bare number writes the thing it is named for).
//   READ   every other use: a property read, a destructured field, a parameter, an identifier in an expression.
// A name that is only a call target (`floor` in Math.floor(x)) and a keyword-like name are not listed. Type-only syntax is not listed.
// ════════════════════════════════════════════════════════════════════════
import ts from 'typescript';

const kindOfFile = (file) => (file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOfFile(file));
const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

/** Every top-level binding of one source text, in file order. A statement that binds no name is `<statements>`. */
export function topLevel(file, text) {
  const sf = parse(file, text);
  const out = [];
  for (const st of sf.statements) {
    const span = (node) => ({ line: lineOf(sf, node.getStart(sf)), endLine: lineOf(sf, node.getEnd()) });
    if (ts.isFunctionDeclaration(st) && st.name) out.push({ name: st.name.text, kind: 'function', node: st, ...span(st) });
    else if (ts.isClassDeclaration(st) && st.name) out.push({ name: st.name.text, kind: 'class', node: st, ...span(st) });
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const fn = d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer));
        if (ts.isIdentifier(d.name)) out.push({ name: d.name.text, kind: fn ? 'function' : 'value', node: d, ...span(st.declarationList.declarations.length === 1 ? st : d) });
        else out.push({ name: '<statements>', kind: 'statements', node: d, ...span(d) });
      }
    } else if (ts.isExportAssignment(st)) out.push({ name: 'default', kind: 'value', node: st, ...span(st) });
    else if (!ts.isImportDeclaration(st) && !ts.isExportDeclaration(st)) out.push({ name: '<statements>', kind: 'statements', node: st, ...span(st) });
  }
  return out;
}

const ASSIGN = new Set([ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken, ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken, ts.SyntaxKind.PercentEqualsToken, ts.SyntaxKind.AsteriskAsteriskEqualsToken, ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken, ts.SyntaxKind.BarEqualsToken, ts.SyntaxKind.AmpersandEqualsToken]);

/** Is `node` (an identifier, or the whole access expression) written to where it stands? */
function isWritten(node) {
  let x = node;
  while (x.parent && (ts.isParenthesizedExpression(x.parent) || ts.isNonNullExpression(x.parent))) x = x.parent;
  const p = x.parent;
  if (!p) return false;
  if (ts.isBinaryExpression(p) && p.left === x && ASSIGN.has(p.operatorToken.kind)) return true;
  if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) return true;
  return false;
}

/**
 * Every identifier and property name inside the named top-level bindings of one file: { token, mode, line, binding }.
 * `names` null reads every binding. Pure.
 */
export function occurrences(file, text, names = null) {
  const sf = parse(file, text);
  const want = names ? new Set(names) : null;
  const out = [];
  for (const b of topLevel(file, text)) {
    if (want && !want.has(b.name)) continue;
    /* a TABLE: a value binding whose initializer is an object literal, bare or wrapped in one call (Object.freeze({...})). Each
       occurrence inside it carries `top`, the first-level key it sits under, so a home can be one key of a shared table */
    let root = null;
    if (b.kind === 'value' && ts.isVariableDeclaration(b.node) && b.node.initializer) {
      let x = b.node.initializer;
      while (ts.isCallExpression(x) && x.arguments.length === 1) x = x.arguments[0];
      if (ts.isObjectLiteralExpression(x)) root = x;
    }
    const topOf = (node) => { for (let x = node; x && x !== b.node; x = x.parent) if (x.parent === root && x.name && (ts.isIdentifier(x.name) || ts.isStringLiteral(x.name))) return x.name.text; return null; };
    const push = (token, mode, node, kind = 'prop') => {
      const row = { token, mode, line: lineOf(sf, node.getStart(sf)), binding: b.name, kind };
      if (root) { const t = topOf(node); if (t) row.top = t; }
      /* `TABLE.key`: the key read off a named binding, so a reader of one row of a table is not a reader of every row */
      if (kind === 'id' && node.parent && ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node && ts.isIdentifier(node.parent.name)) row.member = node.parent.name.text;
      out.push(row);
    };
    if (b.name !== '<statements>' && b.name !== 'default') push(b.name, 'w', b.node, 'self');
    const visit = (x) => {
      if (ts.isTypeNode(x)) return;
      if (ts.isPropertyAccessExpression(x)) {
        const called = x.parent && ts.isCallExpression(x.parent) && x.parent.expression === x;
        if (!called && ts.isIdentifier(x.name)) push(x.name.text, isWritten(x) ? 'w' : 'r', x.name);
        visit(x.expression);
        return;
      }
      if (ts.isElementAccessExpression(x)) {
        if (ts.isStringLiteral(x.argumentExpression)) push(x.argumentExpression.text, isWritten(x) ? 'w' : 'r', x.argumentExpression);
        else visit(x.argumentExpression);
        visit(x.expression);
        return;
      }
      if (ts.isPropertyAssignment(x)) {
        if (ts.isIdentifier(x.name) || ts.isStringLiteral(x.name)) push(x.name.text, 'w', x.name);
        else if (ts.isComputedPropertyName(x.name)) visit(x.name.expression);
        visit(x.initializer);
        return;
      }
      if (ts.isShorthandPropertyAssignment(x)) { push(x.name.text, 'w', x.name); push(x.name.text, 'r', x.name, 'id'); return; }
      if (ts.isMethodDeclaration(x) && ts.isIdentifier(x.name)) { push(x.name.text, 'w', x.name); x.parameters.forEach(visit); if (x.body) visit(x.body); return; }
      if (ts.isBindingElement(x)) {
        /* `const { hp: h } = mon` reads mon.hp; `const { hp } = mon` reads it too; a plain array or name pattern declares a local */
        if (x.propertyName && ts.isIdentifier(x.propertyName)) push(x.propertyName.text, 'r', x.propertyName);
        if (ts.isIdentifier(x.name)) { if (ts.isObjectBindingPattern(x.parent) && !x.propertyName) push(x.name.text, 'r', x.name); } else visit(x.name);
        if (x.initializer) visit(x.initializer);
        return;
      }
      if (ts.isVariableDeclaration(x)) {
        if (ts.isIdentifier(x.name)) { if (x !== b.node) push(x.name.text, 'w', x.name, 'local'); } else visit(x.name);
        if (x.initializer) visit(x.initializer);
        return;
      }
      if (ts.isParameter(x)) {
        if (ts.isIdentifier(x.name)) push(x.name.text, 'r', x.name, 'local'); else visit(x.name);
        if (x.initializer) visit(x.initializer);
        return;
      }
      if (ts.isFunctionDeclaration(x) || ts.isFunctionExpression(x) || ts.isArrowFunction(x)) {
        x.parameters.forEach(visit);
        if (x.body) visit(x.body);
        return;
      }
      if (ts.isCallExpression(x)) {
        /* a bare call target is a function, not a quantity, unless the vocabulary names it: list it as a read */
        if (ts.isIdentifier(x.expression)) push(x.expression.text, 'r', x.expression, 'id'); else visit(x.expression);
        x.arguments.forEach(visit);
        return;
      }
      if (ts.isIdentifier(x)) { push(x.text, isWritten(x) ? 'w' : 'r', x, 'id'); return; }
      ts.forEachChild(x, visit);
    };
    if (b.kind === 'function' && ts.isFunctionDeclaration(b.node)) { b.node.parameters.forEach(visit); if (b.node.body) visit(b.node.body); }
    else if (ts.isVariableDeclaration(b.node)) { if (b.node.initializer) visit(b.node.initializer); }
    else visit(b.node);
  }
  return out;
}

/** What each imported local name of one file is: Map(local -> { file, name }). A `?v=` query is dropped, a bare package is skipped. */
export function importsOf(file, text) {
  const sf = parse(file, text);
  const out = new Map();
  const dir = file.split('/').slice(0, -1);
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text.split('?')[0];
    if (!spec.startsWith('.')) continue;
    const parts = dir.slice();
    for (const seg of spec.split('/')) { if (seg === '.' || seg === '') continue; if (seg === '..') parts.pop(); else parts.push(seg); }
    const target = parts.join('/');
    const c = st.importClause;
    if (!c) continue;
    if (c.name) out.set(c.name.text, { file: target, name: 'default' });
    if (c.namedBindings && ts.isNamedImports(c.namedBindings)) for (const e of c.namedBindings.elements) out.set(e.name.text, { file: target, name: (e.propertyName || e.name).text });
    if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) out.set(c.namedBindings.name.text, { file: target, name: '*' });
  }
  return out;
}

/** A register row's `where` text as { file, from, to, names }. Null when it names no source file. */
export function homeOf(where) {
  const m = /^((?:src|supabase|tools)\/[\w./-]+\.(?:js|mjs|ts|sql))(?::(\d+)(?:-(\d+))?)?(.*)$/.exec(String(where || '').trim());
  if (!m) return null;
  const rest = m[4].replace(/^[,\d\s-]+/, '');
  const names = [...rest.matchAll(/[A-Za-z_$][\w$]*/g)].map((x) => x[0]).filter((n) => !['the', 'line', 'lines', 'table', 'slot', 'xp', 'gp', 'and', 'against'].includes(n));
  return { file: m[1], from: m[2] ? Number(m[2]) : null, to: m[3] ? Number(m[3]) : m[2] ? Number(m[2]) : null, names };
}

/** The binding names a home covers in today's file: its names that exist, else the bindings its lines overlap, else every binding. */
export function bindingsIn(file, text, home) {
  const tops = topLevel(file, text).filter((b) => b.name !== '<statements>');
  const named = (home.names || []).filter((n) => tops.some((b) => b.name === n));
  if (named.length) return named;
  if (home.from) return [...new Set(tops.filter((b) => b.line <= home.to && b.endLine >= home.from).map((b) => b.name))];
  return [...new Set(tops.map((b) => b.name))];
}
