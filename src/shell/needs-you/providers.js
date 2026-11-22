// ════════════════════════════════════════════════════════════════════════
// src/shell/needs-you/providers.js — THE LINE PROVIDERS OF "NEEDS YOU" (../needs-you.js), ONE FILE A KIND.
//
// A provider is { kind, rowOf(ctx) }: `kind` is a row of src/data/hunt-after.js NEEDS_YOU; rowOf reads only the server's projection
// (ctx.peers(): the account's heroes; ctx.plan: the server's Carry on plan; ctx.wearOn: the company's "Wear upgrades" line) and answers
// ONE row for the account or null: { text, label, go, slot, hunt }. Inside its kind it names the worst-off hero first (D-2 rule 3).
// A new kind is a new file here and one line below, plus its NEEDS_YOU row. tier_offer (FB-7), ground_opened, talent_points (FB-11) and
// can_build (FB-9) are listed in the data and have no provider yet: the card shows nothing for them until theirs lands.
// ════════════════════════════════════════════════════════════════════════
import outgrown from './outgrown.js';
import cannotStart from './cannot-start.js';
import death from './death.js';
import gearChoice from './gear-choice.js';

export const PROVIDERS = Object.freeze([outgrown, cannotStart, death, gearChoice]);
