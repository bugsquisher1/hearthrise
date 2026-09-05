#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/signup-door.mjs — THE SIGN-UP DOOR, GRADED WITHOUT A BROWSER.
//
//   node tests/signup-door.mjs             # the guard
//   node tests/signup-door.mjs --list      # the mutation catalogue
//   node tests/signup-door.mjs --selftest  # every mutation must be CAUGHT
//   node tests/signup-door.mjs --mutate=<id>
//
// Ships with: src/net/signup-door.js, src/net/auth.js, src/net/account-gate.js
//
// ── WHAT THIS EXISTS FOR ────────────────────────────────────────────────
// The beta-2 funnel lost 11 of 49 sign-ups at the email wall. Three client
// mechanisms caused it and all three were still in the tree byte for byte:
// `signUp` sent no `emailRedirectTo`, there was no resend anywhere, and the
// success copy told the player to go and sign in again. A smoke test written
// after the fact would have been green through all of it, because none of the
// three is visible from the DOM — they are RULES, and rules need a guard that
// can state the rule and then break it.
//
// So every rule lives in src/net/signup-door.js as a pure function, and this
// file grades them against a catalogue of the defects somebody could plausibly
// write. `--selftest` plants each one and requires this guard to go RED. A
// guard that cannot demonstrate it sees failure is decoration.
//
// ── WHAT IT CANNOT PROVE — READ THIS BEFORE CALLING THE DOOR FIXED ──────
// NOTHING HERE IS EVIDENCE ABOUT PRODUCTION. Asserting that we pass
// `emailRedirectTo` proves the client's half only: GoTrue SILENTLY falls back
// to the project's Site URL when the redirect is not in the Auth redirect
// allowlist, so every assertion in this file can be green while the live
// confirm link lands nowhere. Three gates live outside any assertion this repo
// can write — the redirect allowlist, the itch.io iframe's partitioned storage,
// and built-in SMTP throughput. They are written up, with how to verify each,
// in docs/design/signup-door-config-gates.md. Do not mark the door done on a
// green run of this file.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOOR = 'src/net/signup-door.js';
const AUTH = 'src/net/auth.js';
const GATE = 'src/net/account-gate.js';
const INDEX = 'index.html';

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────
   Each entry is a defect a reasonable person could write — several of them
   ARE the pre-b501 code — and each must turn this guard RED. */
const MUTATIONS = {
  // ── the redirect ──────────────────────────────────────────────────────
  no_redirect: {
    file: DOOR,
    why: 'THE beta-2 BUG, restored: the door names no return address, so `signUp` sends no '
       + '`emailRedirectTo` and GoTrue bounces the confirm link at the project Site URL — which '
       + 'on a fresh Supabase project is http://localhost:3000. The player confirms into a dead tab.',
    find: '    if (!/^https?:\\/\\/[^/\\s]+$/i.test(origin)) return null;',
    repl: '    return null;',
  },
  redirect_carries_query: {
    file: DOOR,
    why: 'the return address keeps the query string, so an invite link\'s `?invite=CODE` — or a '
       + 'stale `#access_token` — is baked into the confirm URL, mailed to the player, and then '
       + 'sits in the address bar of the tab they land in',
    find: '    return origin + path;',
    repl: '    return origin + path + String(loc.search || \'\');',
  },
  redirect_not_normalised: {
    file: DOOR,
    why: '/index.html and / stop collapsing to one form, so the Auth redirect allowlist needs two '
       + 'entries and whichever one nobody added silently falls back to the Site URL — the exact '
       + 'failure this whole build is about, for half the players',
    find: "    path = path.replace(/index\\.html?$/i, '');",
    repl: '',
  },

  // ── the arrival ───────────────────────────────────────────────────────
  arrival_blind: {
    file: DOOR,
    why: 'the door cannot tell a confirmation landing from an ordinary load, so a player who has '
       + 'just clicked the link in their email is shown a SIGN-IN FORM — the dead end reproduced '
       + 'as a race instead of as copy',
    find: "    if (hash.access_token) return { kind: 'implicit'",
    repl: "    if (false) return { kind: 'implicit'",
  },
  arrival_error_swallowed: {
    file: DOOR,
    why: 'an expired or already-used confirmation link reads as "nothing happened", so the player '
       + 'is given no reason and no remedy — and `otp_expired` is the single most common auth '
       + 'error a real beta produces',
    find: '    if (errBag) {',
    repl: '    if (false) {',
  },
  arrival_pkce_eats_invite_link: {
    file: DOOR,
    why: 'an invite link is mistaken for a PKCE auth callback, so the one link designed to make '
       + 'sign-up EASIER puts the door into "completing sign-in" and strands the player for '
       + 'twenty seconds',
    find: '    if (looksLikeAuthCode(query.code))',
    repl: '    if (query.code || query.invite)',
  },

  // ── the resend ────────────────────────────────────────────────────────
  resend_no_cooldown: {
    file: DOOR,
    why: 'no cooldown at all, so an impatient player fires three requests in two seconds, the '
       + 'server rate-limits the address, and the recovery control now reliably fails for the '
       + 'people who need it most',
    find: '    if (wait > 0) return { allowed: false, reason: \'cooldown\', waitMs: wait };',
    repl: '',
  },
  resend_backward_clock_locks: {
    file: DOOR,
    why: 'a device whose clock jumps BACKWARD (a time correction, a VM resume) locks the only '
       + 'recovery control the player has for the length of the jump — the same class as every '
       + 'other clock-trust bug in this repo',
    find: '    if (wait > cd) return { allowed: true, reason: \'ready\', waitMs: 0 };',
    repl: '',
  },
  resend_failure_reads_sent: {
    file: DOOR,
    why: 'THE HONESTY BUG. supabase-js resolves auth.resend() with {data, error} instead of '
       + 'throwing, so a caller that reads "the promise resolved" as success tells a rate-limited '
       + 'player to go and wait for a mail that was never dispatched — strictly worse than having '
       + 'no resend button, because it stops them trying',
    find: '    var err = res && res.error;\n    if (!err) {',
    repl: '    var err = null;\n    if (!err) {',
  },
  resend_rate_limit_reads_generic: {
    file: DOOR,
    why: 'a 429 is reported as an unexplained failure rather than as "wait a minute", so the '
       + 'player retries immediately, is refused again, and concludes the game is broken',
    find: "    if (status === 429 || /rate limit|for security purposes|too many|after \\d+ seconds/i.test(msg)) {",
    repl: '    if (false) {',
  },

  // ── the invite ────────────────────────────────────────────────────────
  invite_one_sentence: {
    file: DOOR,
    why: "TODAY'S BEHAVIOUR, restored: every refusal collapses to one undifferentiated sentence, "
       + 'so "you typed it wrong", "this code is spent" and "we could not reach the server" are '
       + 'indistinguishable — despite having three different next actions. beta-2 logged 13 '
       + 'refused_unknown against 5 redeemed and nobody could tell which was which.',
    find: '    if (!kind) kind = \'refused\';',
    repl: '    kind = \'refused\';',
  },
  invite_used_reads_unknown: {
    file: DOOR,
    why: 'the prose table is reordered so "already been used" falls through to the generic '
       + 'invalid-code branch: a player holding a spent code is told to check it for typos, and '
       + 'retypes a correct code forever',
    find: "    [/already (been )?used|code already used/i, 'used'],\n",
    repl: '',
  },
  invite_unreachable_blamed_on_player: {
    file: DOOR,
    why: 'a network failure is reported as a bad code, so flaky wifi tells the player their '
       + 'invite is worthless — the refusal that costs an account we already paid to acquire',
    find: "    if (!kind && payload.transport === 'unreachable') kind = 'unreachable';",
    repl: '',
  },
  invite_link_leaks_in_url: {
    file: DOOR,
    why: 'the code is never stripped from the address bar, so it rides out in the Referer of the '
       + "door's own target=_blank Discord link, gets bookmarked, and survives in session history "
       + '— the migration that owns the check refuses to put a code in a GET for exactly this reason',
    find: '    if (s.indexOf(INVITE_PARAM + \'=\') === -1) return s;',
    repl: '    return s;',
  },
  invite_link_accepts_anything: {
    file: DOOR,
    why: 'a hostile or garbled `?invite=` value is pre-filled into the form as though it were a '
       + 'code, so the player is shown a refusal for something they never typed',
    find: "    if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(s)) return '';",
    repl: '',
  },

  // ── the copy, and the wiring it depends on ────────────────────────────
  sent_copy_dead_end: {
    file: DOOR,
    why: 'the dead end, back in the copy: "confirm the link, then sign in" is the product asking '
       + 'a brand-new player to leave, find us again, and authenticate a second time',
    find: "      body: 'We sent a confirmation link' + where + '. Open it to finish creating your account'",
    repl: "      body: 'Account created. Confirm the link in your email, then sign in.' + (where && '')",
  },
  auth_drops_redirect: {
    file: AUTH,
    why: 'auth.js stops passing the redirect through, so the door computes a perfectly good '
       + 'return address that never reaches GoTrue — green pure tests, dead confirm link',
    find: '  return signUpWith(supabase, email, password, metadata, signupRedirectTo());',
    repl: '  return signUpWith(supabase, email, password, metadata, null);',
  },
  auth_smuggles_data_key: {
    file: AUTH,
    why: 'THE OBVIOUS REFACTOR, and it breaks the invite gate: `data: metadata || {}` sends '
       + '`data:{}` for a codeless signup, so raw_user_meta_data stops being SQL NULL and the '
       + "trigger's absent-vs-blank distinction quietly changes meaning",
    find: '  if (metadata) options.data = metadata;',
    repl: '  options.data = metadata || {};',
  },
  auth_unpins_url_detection: {
    file: AUTH,
    why: 'detectSessionInUrl stops being stated, so the entire confirm-link flow depends on a '
       + 'library default that a version bump can flip — and when it flips, a correctly '
       + 'configured redirect still deposits the player on a sign-in form',
    find: '        detectSessionInUrl: true,',
    repl: '',
  },
  gate_restores_dead_end: {
    file: GATE,
    why: 'the wall goes back to answering a successful sign-up with "then sign in" instead of '
       + 'the check-your-email stage that carries the resend',
    find: "          ui.setStage('sent', { email: addr, usedCode: !!code });",
    repl: "          ui.say('Account created. Confirm the link in your email, then sign in.', 'ok');",
  },
  gate_loses_resend: {
    file: GATE,
    why: 'the wall stops calling the resend entirely, so a player whose confirmation mail never '
       + 'arrived has no path forward that does not involve us in Discord',
    find: '        return a.resendSignupEmail(addr);',
    repl: '        return { error: null };',
  },
};

// ── plumbing ────────────────────────────────────────────────────────────
let SCRATCH = null;
async function scratchDir() {
  if (SCRATCH) return SCRATCH;
  SCRATCH = join(tmpdir(), 'hr-signup-door-' + process.pid);
  await mkdir(SCRATCH, { recursive: true });
  return SCRATCH;
}

/** Read a source file, honouring a planted mutation. */
async function source(rel, mutation) {
  const raw = await readFile(join(ROOT, rel), 'utf8');
  if (!mutation || mutation.file !== rel) return raw;
  if (!raw.includes(mutation.find)) {
    throw new Error(`MUTATION IS STALE: ${rel} no longer contains\n  ${mutation.find}\n`
      + 'The catalogue describes code that has moved. Fix the entry — a mutation that cannot be '
      + 'planted is a defect this guard has silently stopped covering.');
  }
  return raw.replace(mutation.find, mutation.repl);
}

/**
 * Load the door module — the REAL file, possibly mutated — and hand back the
 * API it publishes. It is written to be simultaneously a classic script and an
 * ES module with no bindings (index.html needs the former, this needs the
 * latter), so `import()` executes it and it publishes onto globalThis.
 */
let loadSeq = 0;
async function loadDoor(mutation) {
  const text = await source(DOOR, mutation);
  const dir = await scratchDir();
  const file = join(dir, `door-${loadSeq++}.mjs`);
  await writeFile(file, text, 'utf8');
  delete globalThis.HearthriseSignupDoor;
  await import(pathToFileURL(file).href);
  const api = globalThis.HearthriseSignupDoor;
  if (!api) throw new Error('src/net/signup-door.js published nothing — the door has no rules');
  return api;
}

// ── THE GUARD ───────────────────────────────────────────────────────────
async function run(mutation) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };
  const eq = (got, want, msg) => ok(got === want, `${msg} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

  let D;
  try { D = await loadDoor(mutation); }
  catch (e) { return [`the door module did not load: ${e.message}`]; }

  // ══ 1 · WHERE THE CONFIRM LINK COMES BACK TO ═════════════════════════
  // The rule: it points at THIS GAME, at the origin the player is actually on,
  // carrying nothing else.
  {
    const t = (origin, pathname, search = '', hash = '') =>
      D.signupRedirectTarget({ origin, pathname, search, hash });

    eq(t('https://hearthrise.net', '/'), 'https://hearthrise.net/',
      'the confirm link must return to the game at the origin the player is on');
    eq(t('https://hearthrise.net', '/index.html'), 'https://hearthrise.net/',
      '/index.html and / are the same door and must collapse to ONE allowlist entry');
    eq(t('https://bugsquisher1.github.io', '/hearthrise/index.html'), 'https://bugsquisher1.github.io/hearthrise/',
      'the github.io deploy lives in a subpath and must keep it');
    eq(t('http://127.0.0.1:8123', '/'), 'http://127.0.0.1:8123/',
      'a dev origin must produce a dev return address, not a hard-coded production one');

    // Nothing else may ride along. An invite code in the confirm link would be
    // mailed to the player and then sit in their address bar.
    const carried = t('https://hearthrise.net', '/', '?invite=FRIEND-777', '#access_token=abc');
    ok(!/invite|access_token|[?#]/.test(String(carried).replace(/^https?:\/\//, '')),
      `the return address must carry no query and no fragment — got ${carried}`);

    // No origin worth returning to → say so, do not invent one. Handing GoTrue
    // a malformed redirect fails the WHOLE signup, not just the redirect.
    eq(t('null', '/'), null, 'an opaque origin has no return address and must answer null');
    eq(D.signupRedirectTarget(null), null, 'a missing Location must answer null, not throw');

    // And it must actually BE a return to the game, not merely a string.
    ok(/^https?:\/\//.test(String(t('https://hearthrise.net', '/'))),
      'the return address must be an absolute http(s) URL — GoTrue rejects anything else');
  }

  // ══ 2 · WHAT KIND OF ARRIVAL IS THIS? ════════════════════════════════
  {
    const implicit = D.classifyArrival({
      hash: '#access_token=eyJabc&expires_in=3600&refresh_token=r1&token_type=bearer&type=signup',
      search: '',
    });
    eq(implicit.kind, 'implicit',
      'a confirmation landing (#access_token=…) must be recognised, or the wall shows a sign-in '
      + 'form to somebody who has just confirmed');
    ok(D.arrivalIsPending(implicit), 'an implicit landing is a session about to exist');

    const pkce = D.classifyArrival({ search: '?code=8f14e45fceea167a5a36dedd4bea2543', hash: '' });
    eq(pkce.kind, 'pkce', 'a PKCE callback must be recognised too — the flow is one line from changing');

    const expired = D.classifyArrival({
      hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      search: '',
    });
    eq(expired.kind, 'error', 'an expired confirmation link must be an ERROR, not silence');
    ok(expired.expired === true, 'otp_expired must be recognised as expiry — it is the one with a remedy');
    ok(!D.arrivalIsPending(expired), 'an error is not a pending session');
    const msg = D.arrivalErrorMessage(expired);
    ok(/expired|already used/i.test(msg) && /email/i.test(msg),
      `an expired link must be explained and given a next step — got: ${msg}`);
    ok(!/invalid or has expired/i.test(msg),
      'the player must not be shown GoTrue\'s developer-facing error_description verbatim');

    // GoTrue puts the error in the QUERY for the pkce flow.
    eq(D.classifyArrival({ search: '?error=server_error&error_description=oops', hash: '' }).kind, 'error',
      'an error in the query string is still an error');

    // THE COLLISION THAT MADE THE PARAM NAME `invite`.
    eq(D.classifyArrival({ search: '?invite=FRIEND-777', hash: '' }).kind, 'none',
      'an invite link is NOT an auth callback — mistaking one for the other strands the player '
      + 'on "completing sign-in" for the length of the timeout');
    eq(D.classifyArrival({ search: '', hash: '' }).kind, 'none', 'an ordinary load is an ordinary load');
    eq(D.classifyArrival({ search: '?tab=combat', hash: '#top' }).kind, 'none',
      'ordinary app params must not be read as an auth callback');
  }

  // ══ 3 · RESEND — the cooldown, and the honesty rule ══════════════════
  {
    const CD = D.RESEND_COOLDOWN_MS;
    ok(CD >= 30000 && CD <= 120000,
      `the cooldown must match the server's own per-address interval (~60s), got ${CD}`);

    const fresh = D.resendDecision({ now: 1_000_000, lastSentAt: null });
    ok(fresh.allowed && fresh.reason === 'ready', 'a first resend must be allowed');

    const justSent = D.resendDecision({ now: 1_000_000, lastSentAt: 1_000_000 });
    ok(!justSent.allowed && justSent.reason === 'cooldown',
      'a second press one millisecond later must be refused by the CLIENT, not by the server\'s 429');
    ok(justSent.waitMs > 0 && justSent.waitMs <= CD, `the wait must be inside the cooldown, got ${justSent.waitMs}`);
    ok(/\d+s/.test(D.resendLabel(justSent)),
      `the button must count down rather than looking broken — got "${D.resendLabel(justSent)}"`);

    const later = D.resendDecision({ now: 1_000_000 + CD, lastSentAt: 1_000_000 });
    ok(later.allowed, 'the cooldown must END');

    ok(!D.resendDecision({ now: 1_000_000, lastSentAt: null, inFlight: true }).allowed,
      'a request already in flight must not be sent twice');

    // A clock that jumped backward must not lock the only recovery control.
    ok(D.resendDecision({ now: 1_000_000, lastSentAt: 9_000_000 }).allowed,
      'a lastSentAt in the future means a broken clock, not a cooldown — the safe direction is to allow');

    // ── THE HONESTY RULE ──
    const sent = D.resendOutcome({ data: {}, error: null });
    ok(sent.ok && sent.kind === 'sent', 'a clean send is a send');

    const rate = D.resendOutcome({ error: { message: 'For security purposes, you can only request this after 44 seconds.', status: 429 } });
    eq(rate.kind, 'rate_limited', 'a 429 must be named as a rate limit, so "wait" is the advice');
    ok(!rate.ok, 'a rate-limited resend is not a send');

    const failed = D.resendOutcome({ error: { message: 'Failed to fetch' } });
    ok(!failed.ok && failed.kind === 'failed', 'a failed resend is a failure');
    for (const bad of [rate, failed]) {
      ok(bad.kind !== 'sent' && bad.tone !== 'ok' && !/^sent\b/i.test(bad.message),
        `a failure must NEVER render as success — got kind=${bad.kind} tone=${bad.tone} "${bad.message}"`);
    }

    const done = D.resendOutcome({ error: { message: 'User already confirmed' } });
    eq(done.kind, 'already_confirmed',
      'an already-confirmed address is good news — telling that player it failed sends a finished account away');
  }

  // ══ 4 · THE INVITE, AS A LINK AND AS A REFUSAL ═══════════════════════
  {
    const link = D.readInviteFromUrl({ search: '?invite=friend-777', hash: '' });
    ok(link.present && link.code === 'FRIEND-777',
      `an invite link must arrive as a canonical code — got ${JSON.stringify(link)}`);
    ok(D.readInviteFromUrl({ search: '', hash: '#invite=FRIEND-777' }).code === 'FRIEND-777',
      'a code in the fragment must work too — mail clients rewrite query strings');
    ok(!D.readInviteFromUrl({ search: '?tab=combat', hash: '' }).present,
      'no invite parameter means no invite');

    const junk = D.readInviteFromUrl({ search: '?invite=%3Cscript%3E', hash: '' });
    ok(junk.present && junk.code === '' && junk.malformed,
      'a hostile or garbled value must be REFUSED as malformed, never pre-filled and then blamed '
      + `on the player — got ${JSON.stringify(junk)}`);
    ok(D.readInviteFromUrl({ search: '?invite=' + 'A'.repeat(200), hash: '' }).malformed,
      'an absurdly long value is not a code');

    // The code must not survive in the address bar.
    const stripped = D.stripInviteFromHref('https://hearthrise.net/?invite=FRIEND-777&ref=discord');
    ok(!/invite/.test(stripped) && /ref=discord/.test(stripped),
      `the invite must be removed and everything else kept — got ${stripped}`);
    ok(!/invite/.test(D.stripInviteFromHref('https://hearthrise.net/#invite=FRIEND-777')),
      'a fragment-borne code must be stripped as well');
    eq(D.stripInviteFromHref('https://hearthrise.net/'), 'https://hearthrise.net/',
      'nothing to strip must mean no change, so the caller can skip a pointless history entry');

    // ── THE REFUSAL MUST NAME WHICH ──
    const say = (p) => D.classifyInviteRefusal(p);
    // the prose beta_invite_check ships today
    eq(say({ ok: false, reason: 'Invalid invite code.' }).kind, 'unknown', 'an unrecognised code is UNKNOWN');
    eq(say({ ok: false, reason: 'Code already used.' }).kind, 'used', 'a spent code is USED');
    eq(say({ ok: false, reason: 'Too many attempts. Try again in a minute.' }).kind, 'throttled',
      'a rate limit is THROTTLED');
    // the prose hr_beta_gate_message ships today
    eq(say({ ok: false, reason: 'That invite code was not recognised. Check it for typos — codes look like FRIEND-001 — or ask in the Discord.' }).kind,
      'unknown', 'the signup hook\'s unknown-code sentence must classify as UNKNOWN');
    eq(say({ ok: false, reason: 'That invite code has already been used. Each code creates one account. If this was you, sign in instead.' }).kind,
      'used', 'the signup hook\'s used-code sentence must classify as USED');
    // the machine vocabulary, preferred when present
    eq(say({ ok: false, reason_code: 'refused_unknown', reason: 'anything' }).kind, 'unknown',
      'a machine reason code must WIN over the prose — it is the durable channel');
    eq(say({ ok: false, reason_code: 'invite_used' }).kind, 'used', 'the gate-reason spelling must map too');
    eq(say({ ok: false, reason_code: 'invite_expired' }).kind, 'expired',
      'expiry has a name even though no server answer can produce it yet — see the module header');
    // transport vs. server refusal
    eq(say({ ok: false, transport: 'unreachable', reason: 'Network error — check your connection.' }).kind,
      'unreachable', 'we could not ASK is not the same answer as the code is bad');
    /* …and on the TRANSPORT channel alone. The sentence above happens to
       contain the word "network", so the prose fallback would classify it
       correctly even with the transport branch deleted — an assertion that
       passes for the wrong reason. `validateInvite` also returns
       UNREACHABLE('Cloud not configured.'), which no prose pattern matches, so
       this is the case that actually exercises the channel. */
    eq(say({ ok: false, transport: 'unreachable', reason: 'Cloud not configured.' }).kind,
      'unreachable', 'a transport failure with no recognisable prose is still a transport failure, '
      + 'not a bad code');
    // never guess
    eq(say({ ok: false, reason: 'something nobody has ever seen' }).kind, 'refused',
      'an unrecognised refusal must fall back to the honest generic, never to a guessed cause');

    // …and the three the funnel actually needs must be DIFFERENT SENTENCES.
    const kinds = ['unknown', 'used', 'expired', 'throttled', 'unreachable'];
    const seen = new Map();
    for (const k of kinds) {
      const m = D.INVITE_REFUSAL[k];
      ok(typeof m === 'string' && m.length > 20, `refusal "${k}" has no sentence`);
      ok(!seen.has(m), `refusals "${seen.get(m)}" and "${k}" say the SAME thing — the player still `
        + 'cannot tell which of the three happened, which is the whole defect');
      seen.set(m, k);
    }
    ok(/typo|recognis/i.test(D.INVITE_REFUSAL.unknown), 'the unknown-code refusal must say it is unrecognised');
    ok(/already been used|one account/i.test(D.INVITE_REFUSAL.used), 'the used-code refusal must say it is spent');
    ok(/expired/i.test(D.INVITE_REFUSAL.expired), 'the expired refusal must say expired');
    // b457's lesson: never put a real code SHAPE in front of a player as an example.
    ok(!/FRIEND-\d/i.test(Object.values(D.INVITE_REFUSAL).join(' ')),
      'a live-looking code must never appear as an example — b457 shipped FRIEND-001 as a placeholder '
      + 'and it was a real unused invite');
  }

  // ══ 5 · THE COPY THAT REPLACED THE DEAD END ══════════════════════════
  {
    const c = D.signupSentCopy({ email: 'player@example.com', usedCode: false });
    ok(/confirmation link/i.test(c.body), 'the panel must say what we actually did');
    ok(c.body.includes('player@example.com'), 'it must say WHERE we sent it — a typo\'d address is invisible otherwise');
    ok(!/then sign in|sign in again/i.test(c.body + ' ' + c.title + ' ' + c.hint),
      `THE DEAD END IS BACK: the copy tells the player to go and sign in — got "${c.body}"`);
    ok(/spam|resend/i.test(c.hint), 'the panel must name the two things that actually recover this');
    ok(/invite code/i.test(D.signupSentCopy({ email: 'a@b.c', usedCode: true }).body),
      'a player who spent a code must still be told it was spent');
    ok(!/invite code/i.test(c.body), 'a codeless signup must not be credited with a code it never gave');
  }

  // ══ 6 · THE WIRING PINS ══════════════════════════════════════════════
  // ⚠ THESE ARE PINS, NOT PROOFS. They assert the CALLER still calls; they
  // cannot observe what GoTrue received. The behavioural half is DOOR-1..7 in
  // src/features/smoke-test.js, which drives the shipped functions in a real
  // page; the production half is the config gates, which nothing in this repo
  // can read.
  {
    const auth = await source(AUTH, mutation);
    const gate = await source(GATE, mutation);
    const index = await source(INDEX, mutation);

    ok(/emailRedirectTo/.test(auth),
      'src/net/auth.js no longer mentions emailRedirectTo — the confirm link has no return address');
    ok(/signUpWith\(supabase, email, password, metadata, signupRedirectTo\(\)\)/.test(auth),
      'signUp() no longer hands the computed redirect to the shipped sign-up — a correct return '
      + 'address that never reaches GoTrue is the same outage with more code');
    ok(/detectSessionInUrl:\s*true/.test(auth),
      'detectSessionInUrl is no longer stated — the whole confirm flow would rest on a library default');
    ok(/flowType:\s*'implicit'/.test(auth),
      'the implicit flow is no longer pinned; PKCE cannot complete a link opened in the mail client\'s '
      + 'browser, which is where confirmation links are opened');
    ok(/if \(metadata\) options\.data = metadata;/.test(auth),
      'buildSignUpArgs no longer omits `data` for a codeless signup — the invite gate distinguishes '
      + 'SQL NULL from an empty object');
    ok(/auth\.resend\(/.test(auth), 'auth.js no longer calls auth.resend — there is no resend');

    /* Comments stripped first, and that is not pedantry: the file DELIBERATELY
       quotes the old sentence in the note explaining why it was replaced, and a
       pin that cannot tell code from a comment would either fire on the
       documentation or force the documentation to be deleted. The `[^:]` guard
       on the line-comment pattern is there so `https://…` survives. */
    const gateCode = gate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    ok(!/Confirm the link in your email, then sign in/.test(gateCode),
      'THE DEAD-END SENTENCE IS BACK in src/net/account-gate.js');
    ok(/a\.resendSignupEmail\(addr\)/.test(gateCode),
      'the wall no longer CALLS the resend. (Pinned on the call, not on the identifier: the file '
      + 'also feature-detects `a.resendSignupEmail`, so a name-only pin stays green while the '
      + 'button does nothing.)');
    ok(/setStage\('sent'/.test(gate), 'a successful sign-up no longer opens the check-your-email stage');
    ok(/classifyInviteRefusal|inviteRefusalMessage/.test(gate),
      'the wall no longer classifies an invite refusal, so every refusal reads the same again');

    const doorAt = index.indexOf('src/net/signup-door.js');
    const gateAt = index.indexOf('src/net/account-gate.js');
    ok(doorAt > 0, 'index.html does not load src/net/signup-door.js at all');
    ok(doorAt < gateAt,
      'the door\'s rules must load BEFORE the wall: the wall runs at parse time and asks whether '
      + 'the player is arriving from a confirmation email before it decides what to paint');
    ok(/signup-door\.js\?v=\d+/.test(index),
      'the new script must carry the cache buster like every other browser-loaded file');
  }

  return problems;
}

// ── CLI ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (p) => (argv.find((a) => a.startsWith(p)) || '').split('=')[1];

if (argv.includes('--list')) {
  console.log('\ntests/signup-door.mjs — mutation catalogue\n');
  for (const [id, m] of Object.entries(MUTATIONS)) console.log(`  ${id.padEnd(34)} ${m.why}\n`);
  console.log(`  ${Object.keys(MUTATIONS).length} mutations.\n`);
  process.exit(0);
}

if (argv.includes('--selftest')) {
  console.log('\ntests/signup-door.mjs --selftest — every mutation must be CAUGHT\n');
  const clean = await run(null);
  if (clean.length) {
    console.log('✗ the UNMUTATED tree is already red; fix that before grading mutations:');
    clean.forEach((p) => console.log('   · ' + p));
    process.exit(1);
  }
  console.log('  baseline: clean tree is GREEN\n');
  let escaped = 0;
  for (const [id, m] of Object.entries(MUTATIONS)) {
    let caught = [];
    try { caught = await run(m); }
    catch (e) { caught = ['threw: ' + e.message]; }
    if (caught.length) {
      console.log(`  ✓ ${id.padEnd(34)} caught (${caught.length}) — ${caught[0].slice(0, 96)}`);
    } else {
      escaped++;
      console.log(`  ✗ ${id.padEnd(34)} ESCAPED — ${m.why}`);
    }
  }
  console.log('');
  if (escaped) { console.log(`✗ ${escaped} mutation(s) escaped — this guard does not cover what it claims.`); process.exit(1); }
  console.log(`✓ all ${Object.keys(MUTATIONS).length} mutations caught.\n`);
  process.exit(0);
}

const mutateId = arg('--mutate');
const mutation = mutateId ? MUTATIONS[mutateId] : null;
if (mutateId && !mutation) {
  console.log(`unknown mutation "${mutateId}" — see --list`);
  process.exit(2);
}

const problems = await run(mutation);
if (mutation) console.log(`\n[mutated: ${mutateId}] ${mutation.why}\n`);
if (problems.length) {
  console.log('✗ signup-door guard FAILED\n');
  problems.forEach((p) => console.log('   · ' + p));
  console.log('');
  process.exit(1);
}
console.log('✓ signup-door guard: the return address, the arrival, the resend, the invite link and '
  + 'the refusal vocabulary all hold.');
console.log('  ⚠ this proves the CLIENT only — the Auth redirect allowlist, the itch.io iframe and '
  + 'SMTP throughput are config gates. See docs/design/signup-door-config-gates.md.\n');
