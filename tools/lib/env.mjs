// ════════════════════════════════════════════════════════════════════════
// tools/lib/env.mjs — WHICH SUPABASE PROJECT A TOOL TALKS TO (lane/a-staging).
//
// Two projects: production (what players play) and staging (the release's dress
// rehearsal; its data is thrown away). Every tool that reaches a project asks
// here which one, and prints the answer as its first line.
//
//   --env production | --env staging      (also --env=…)
//
// THE RULES
//   E1  A WRITE NAMES ITS PROJECT. A run that changes a project with no --env
//       refuses (exit 2). A read with no --env reads production, as before.
//   E2  Only `production` and `staging` are names. A typo refuses.
//   E3  Production's ref is the one in this file. ~/.hearthrise/envs.json may
//       repeat it, never change it.
//   E4  Staging's ref comes from ~/.hearthrise/envs.json and can never be
//       production's: a file that says so refuses every staging run.
//   E5  A staging site's host carries `staging` in a label; production's never does.
//   E6  The token is read as file bytes (default ~/.supabase-token, or the env's
//       own `tokenFile`), only when a call needs it, and is never printed and
//       never in argv.
//   E7  Before a write, the project is asked its own name (assertIdentity):
//       staging's must say staging, production's must not. A ref pasted into the
//       wrong slot stops there, before a byte of SQL leaves.
//
// ~/.hearthrise/envs.json (outside the repo; no secret in it):
//   { "staging": { "ref": "<20 letters>", "publishableKey": "sb_publishable_…",
//                  "site": "https://staging.hearthrise.net", "tokenFile": "~/.supabase-token" } }
//
// Everything here takes its file reader, home and fetch as arguments, so
// tests/tool-env.mjs runs every rule with a fake home and no network.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const ENV_NAMES = Object.freeze(['production', 'staging']);
export const PRODUCTION_REF = 'nezapsylztqbbwuwembx';
export const PRODUCTION_SITE = 'https://hearthrise.net';
export const STAGING_SITE = 'https://staging.hearthrise.net';
export const API = 'https://api.supabase.com';
const REF = /^[a-z]{20}$/;
const KEY = /^sb_publishable_[A-Za-z0-9_-]{10,}$/;
const ENTRY_KEYS = new Set(['ref', 'publishableKey', 'site', 'tokenFile']);

/** A refusal is the tool working: exit 2, the sentence, nothing sent. */
export class EnvRefusal extends Error {
  constructor(message) { super(message); this.name = 'EnvRefusal'; this.refusal = true; }
}
const refuse = (m) => { throw new EnvRefusal(m); };

/** Whether a host name says staging: one of its labels holds the word. */
export function isStagingHost(host) {
  return String(host || '').toLowerCase().split('.').some((label) => label.includes('staging'));
}

/** `--env X` / `--env=X` out of an argv. Returns { name|null, rest }. Refuses a doubled or unknown name. */
export function splitEnvArg(argv) {
  const rest = [];
  let name = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    let v = null;
    if (a === '--env') { v = argv[i + 1] === undefined ? '' : String(argv[i + 1]); i += 1; }
    else if (typeof a === 'string' && a.startsWith('--env=')) v = a.slice(6);
    else { rest.push(a); continue; }
    if (name !== null) refuse('--env is given twice. Name one project.');
    if (!ENV_NAMES.includes(v)) refuse(`--env is "${v}". It is "staging" or "production".`);
    name = v;
  }
  return { name, rest };
}

function readEnvsFile(home, read) {
  const path = join(home, '.hearthrise', 'envs.json');
  let text;
  try { text = read(path); } catch (e) { return { path, file: null }; }
  let file;
  try { file = JSON.parse(text); } catch (e) { refuse(`${path} is not JSON (${String(e.message).slice(0, 60)}).`); }
  if (!file || typeof file !== 'object' || Array.isArray(file)) refuse(`${path} must be an object of environments.`);
  for (const k of Object.keys(file)) {
    if (!ENV_NAMES.includes(k)) refuse(`${path} names an environment "${k}". Only "staging" and "production" exist.`);
    const e = file[k];
    if (!e || typeof e !== 'object' || Array.isArray(e)) refuse(`${path}: "${k}" must be an object.`);
    for (const f of Object.keys(e)) if (!ENTRY_KEYS.has(f)) refuse(`${path}: "${k}.${f}" is not a field (ref, publishableKey, site, tokenFile). No secret belongs in this file.`);
  }
  return { path, file };
}

const expandHome = (p, home) => (p === '~' || /^~[\\/]/.test(p) ? join(home, p.slice(2)) : p);

/**
 * The project one run talks to.
 * @param {object} o
 * @param {string[]} o.argv      the tool's arguments (process.argv.slice(2))
 * @param {boolean} o.write      true when this run changes the project
 * @param {string} [o.home]      the user's home (default: os.homedir())
 * @param {(path: string) => string} [o.read]   a text file reader (default: readFileSync utf8)
 * @returns {{ name: string, ref: string, site: string, publishableKey: string, rest: string[],
 *             banner: string, token: () => string, db: string, fn: (name: string) => string }}
 */
export function resolveEnv(o) {
  const home = o.home || homedir();
  const read = o.read || ((p) => readFileSync(p, 'utf8'));
  const { name: asked, rest } = splitEnvArg(o.argv || []);
  if (asked === null && o.write) {
    refuse('This run changes a project, so it must name one: add --env staging or --env production. Nothing was sent.');
  }
  const name = asked || 'production';
  const { path, file } = readEnvsFile(home, read);
  const entry = (file && file[name]) || {};
  const prodRef = file && file.production ? file.production.ref : undefined;
  if (prodRef !== undefined && prodRef !== PRODUCTION_REF) {
    refuse(`${path} gives production a different project (${String(prodRef).slice(0, 24)}). Production's project is fixed in tools/lib/env.mjs; remove that line.`);
  }
  const stagingRef = file && file.staging ? file.staging.ref : undefined;
  if (stagingRef === PRODUCTION_REF) {
    refuse(`${path} gives staging the PRODUCTION project. Fix staging.ref before any run; nothing was sent.`);
  }
  let ref = PRODUCTION_REF;
  let site = PRODUCTION_SITE;
  if (name === 'staging') {
    if (!file || !file.staging || !file.staging.ref) {
      refuse(`Staging is not set up on this machine: ${path} has no staging.ref. See .claude/coordination/staging-2026-11-10.md, step 2.`);
    }
    ref = String(file.staging.ref);
    if (!REF.test(ref)) refuse(`${path}: staging.ref must be a project ref (20 lower-case letters).`);
    site = entry.site === undefined ? STAGING_SITE : String(entry.site);
  } else if (entry.site !== undefined) site = String(entry.site);
  let host = '';
  try { const u = new URL(site); host = u.protocol === 'https:' ? u.hostname : ''; } catch (e) { host = ''; }
  if (!host) refuse(`${path}: ${name}.site must be an https URL.`);
  if (name === 'staging' && !isStagingHost(host)) refuse(`${path}: the staging site ${host} has no "staging" in its name. A staging host says so in a label.`);
  if (name === 'production' && isStagingHost(host)) refuse(`${path}: the production site ${host} says "staging".`);
  const publishableKey = entry.publishableKey === undefined ? '' : String(entry.publishableKey);
  if (publishableKey && !KEY.test(publishableKey)) refuse(`${path}: ${name}.publishableKey is not a publishable key (sb_publishable_…). No other key belongs in this file.`);
  const tokenFile = expandHome(entry.tokenFile === undefined ? join(home, '.supabase-token') : String(entry.tokenFile), home);
  let cached = null;
  const token = () => {
    if (cached === null) {
      let t;
      try { t = read(tokenFile).trim(); } catch (e) { refuse(`No Supabase token file for ${name} (looked in the ${entry.tokenFile === undefined ? 'default place, ~/.supabase-token' : 'tokenFile that envs.json names'}).`); }
      if (!t) refuse(`The Supabase token file for ${name} is empty.`);
      cached = t;
    }
    return cached;
  };
  return {
    name, ref, site: site.replace(/\/+$/, ''), publishableKey, rest, token,
    banner: `[env: ${name} · project ${ref}]`,
    db: `${API}/v1/projects/${ref}/database/query`,
    fn: (fnName) => `https://${ref}.supabase.co/functions/v1/${fnName}`,
  };
}

/** Scrub a token out of any text bound for a screen or a log. */
export function scrub(text, env) {
  let t = String(text);
  let tok = '';
  try { tok = env.token(); } catch (e) { tok = ''; }
  if (tok) t = t.split(tok).join('***');
  return t;
}

/**
 * E7. Ask the project its own name before a write. Throws EnvRefusal when the name and the env disagree,
 * or when the project cannot be read (a write never goes to a project that did not answer for itself).
 * @param {ReturnType<typeof resolveEnv>} env
 * @param {typeof fetch} fetchImpl
 */
export async function assertIdentity(env, fetchImpl) {
  let res;
  try { res = await fetchImpl(`${API}/v1/projects/${env.ref}`, { headers: { Authorization: 'Bearer ' + env.token() } }); }
  catch (e) { refuse(`Could not ask project ${env.ref} its name (${scrub(e.message, env).slice(0, 80)}). Nothing was sent.`); }
  if (!res.ok) refuse(`Project ${env.ref} did not answer for itself (HTTP ${res.status}). Nothing was sent.`);
  let body;
  try { body = await res.json(); } catch (e) { body = null; }
  const projectName = body && typeof body.name === 'string' ? body.name : '';
  if (!projectName) refuse(`Project ${env.ref} gave no name. Nothing was sent.`);
  const saysStaging = projectName.toLowerCase().includes('staging');
  if (env.name === 'staging' && !saysStaging) {
    refuse(`--env staging points at a project named "${projectName}", which does not say staging. Nothing was sent. Check staging.ref in ~/.hearthrise/envs.json.`);
  }
  if (env.name === 'production' && saysStaging) {
    refuse(`--env production points at a project named "${projectName}". Nothing was sent.`);
  }
  return projectName;
}

/**
 * One SQL call through the Management API. `readOnly` sends it inside a READ ONLY transaction
 * and refuses anything but a select.
 * @returns {Promise<any>} the parsed rows
 */
export async function queryDb(env, sql, { fetch: fetchImpl, readOnly = false } = {}) {
  if (readOnly && (!/^\s*(select|with)\b/i.test(sql) || /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|call|do|copy)\b/i.test(sql))) {
    throw new Error('read-only queries only');
  }
  const body = readOnly ? { query: 'begin read only; ' + sql + ';', read_only: true } : { query: sql };
  const res = await fetchImpl(env.db, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.token(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) { const e = new Error(`HTTP ${res.status}: ${scrub(text, env).slice(0, 800)}`); e.status = res.status; throw e; }
  try { return JSON.parse(text); } catch (e) { return text; }
}

/** The publishable key the client ships for an env, read from the bootstrap's text ('' when that env is not wired). */
export function clientKeyOf(bootText, name) {
  const at = String(bootText).indexOf(`env: '${name}'`);
  if (at < 0) return '';
  const m = /publishableKey:\s*'([^']*)'/.exec(String(bootText).slice(at));
  return m ? m[1] : '';
}

/** Run a tool's main: an EnvRefusal is exit 2 with its sentence; anything else is exit 1. */
export async function runTool(main, argv, deps) {
  try { return await main(argv, deps); }
  catch (e) {
    if (e && e.refusal) { (deps && deps.err ? deps.err : console.error)('REFUSED: ' + e.message); return 2; }
    (deps && deps.err ? deps.err : console.error)('FAILED: ' + (e && e.message ? e.message : e));
    return 1;
  }
}
