// ════════════════════════════════════════════════════════════════════════
// src/data/account-rules.js — THE ACCOUNT RULES THE SIGN-IN SCREENS SAY OUT LOUD.
//
// The auth server is the authority: these mirror its live config so the form
// can name the rule before the player presses anything (Tyler 10-24: a 9-character
// password was refused and the form said "try again in a minute"). When the
// auth config changes, this is the one edit; src/net/auth.js and
// src/app/sign-in.js read it from here.
//
// Live auth config read 2026-10-24 (Management API /config/auth):
//   password_min_length 10, password_hibp_enabled true (leaked passwords are
//   refused), mailer_autoconfirm false (a new account confirms by email).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/** The shortest password the auth server takes (its password_min_length). */
export const PASSWORD_MIN_LENGTH = 10;
