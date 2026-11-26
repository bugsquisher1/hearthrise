// ════════════════════════════════════════════════════════════════════════
// src/data/company-lines.js — THE COMPANY PLAN'S STANDING LINES AND THE VALUES EACH TAKES (1051-company-start.sql hr_company_line_set).
//
// One home for the line catalogue: src/session/carry-on-intents.js setCompanyLine checks a press against it and src/core/plan-code.js
// checks a pasted share code against it. The server holds its own copy in hr_company_line_set and refuses anything else (bad_intent).
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const COMPANY_LINES = Object.freeze({
  wear_upgrades: Object.freeze(['on', 'off']),
  if_one_falls: Object.freeze(['hunt_on', 'all_home']),
});
