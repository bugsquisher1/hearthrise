// ════════════════════════════════════════════════════════════════════════
// src/shell/command-model.js — ONE CHARACTER AT A GLANCE (QoL 3).
//
// PURE. What the character strip's tab and the command centre's row show for
// one open character, read from ITS OWN record only (never another's): name,
// the role its weapon plays, HP / mana / stamina, what it is doing, its bag's
// worth at the server's bids, whether it is ready to hunt, its party, and how
// many alerts wait for it. Nothing here is a number of the client's own.
// ════════════════════════════════════════════════════════════════════════
import { nameOf, bagOf, shopOf } from '../session/item-sections.js?v=0.2.63';
import { assignmentOf, vitalsOf, roleIdOf, partyMembershipOf } from '../session/party-sections.js?v=0.2.63';
import { bagValue } from './bag-model.js?v=0.2.63';
import { readinessOf } from './readiness.js?v=0.2.63';

/**
 * @param {object} cs        a CharacterSession
 * @param {object} [alerts]  the account's alert centre (src/shell/alerts.js)
 */
export function summaryOf(cs, alerts) {
  const bag = bagOf(cs);
  const shop = shopOf(cs);
  const worth = bag && shop ? bagValue(bag, shop.bids) : null;
  const ready = readinessOf(cs);
  return {
    slot: cs.slot,
    name: nameOf(cs) || 'Character ' + (cs.slot + 1),
    loaded: !!cs.record,
    role: roleIdOf(cs),
    vitals: vitalsOf(cs),
    doing: assignmentOf(cs),
    bagValue: worth ? worth.total : null,
    ready: ready.ready,
    readyLine: !cs.record ? 'Not read yet' : ready.ready ? 'Ready to hunt' : 'Short: ' + ready.short.join(', '),
    party: partyMembershipOf(cs),
    alerts: alerts ? alerts.countFor(cs.slot) : 0,
  };
}
