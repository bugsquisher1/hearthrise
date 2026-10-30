// ════════════════════════════════════════════════════════════════════════
// src/shell/menu-providers.js — WHO ANSWERS EACH RIGHT-CLICK ENTRY (the seam).
//
// The one context menu (src/shell/context-menu.js) is handed these providers,
// keyed by the `provider` of each row in src/data/social-menu.js:
//   inspect, whispers, friends, blocks   the account's social side
//                                         (SocialSession.menuProviders)
//   party                                 Invite to party: a stranger by name
//                                         (CharacterSession.inviteByName; the
//                                         first invite makes the party), one of
//                                         this account's own characters by slot
//                                         (party-intents.js inviteOwn: it joins
//                                         at once); Leave party for an own
//                                         character that sits in one
//   look                                  a monster's name, tier and weaknesses,
//                                         from the bestiary rows
//   trade                                 none yet: the row is hidden until the
//                                         trade lane (its own server work and the
//                                         Security review) ships
// worldTargetOf turns what the World picked under a pointer into a target.
// ════════════════════════════════════════════════════════════════════════
import { MONSTERS } from '../data/monsters.js?v=0.2.72';
import { WEAPON_WORDS } from '../data/hunt-hud.js?v=0.2.72';
import { refusalText } from './intent-words.js?v=0.2.72';
import { monsterName } from './widgets/bits.js?v=0.2.72';
import { partyMembershipOf, partyPeopleOf } from '../session/party-sections.js?v=0.2.72';
import { inviteOwn, invitePlayer, afterLeave } from '../session/party-intents.js?v=0.2.72';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A monster in plain words: what it is, and what hurts it. Pure. */
function lookText(id) {
  const m = MONSTERS[id];
  if (!m) return null;
  const kind = String(m.className || m.family || 'creature').toLowerCase();
  let s = monsterName(id) + ', a tier ' + (Number.isInteger(m.tier) ? m.tier : '?') + ' ' + kind + (m.boss ? ' boss' : '') + '.';
  if (m.weaponWeak && WEAPON_WORDS[m.weaponWeak]) s += ' Weak to ' + WEAPON_WORDS[m.weaponWeak].toLowerCase() + '.';
  const resist = Array.isArray(m.weaponResist) ? m.weaponResist.filter((w) => WEAPON_WORDS[w]).map((w) => WEAPON_WORDS[w].toLowerCase()) : [];
  if (resist.length) s += ' Shrugs off ' + resist.join(' and ') + '.';
  return s;
}

/**
 * The target under a World pick ({ hits: [{ id, ref }] }), top-most first: a
 * unit whose ref names a player (ref.player, stamped from the server's party /
 * town data), else a monster the bestiary knows (ref.monster), else null — the
 * ground opens nothing.
 */
export function worldTargetOf(pick) {
  if (!pick || !Array.isArray(pick.hits)) return null;
  for (const h of pick.hits) {
    const p = h && h.ref && h.ref.player;
    if (p && typeof p.name === 'string' && p.name) {
      return { kind: 'player', id: typeof p.id === 'string' && UUID.test(p.id) ? p.id : null, name: p.name.slice(0, 24), slot: Number.isInteger(p.slot) ? p.slot : null };
    }
    const mon = h && h.ref && typeof h.ref.monster === 'string' ? h.ref.monster : h && h.id;
    if (MONSTERS[mon]) return { kind: 'monster', id: mon, title: monsterName(mon) };
  }
  return null;
}

/**
 * The party's entries for one shell. A target with this account's id and a slot
 * is one of its OWN characters (the strip's tabs; a sibling the town draws): it
 * is invited by slot and joins at once. Anyone else is invited by the name
 * players see. Which entries show reads the server's party sections only; the
 * server decides every press.
 */
function partyEntries(ctx, cs) {
  const account = ctx.account;
  const social = account && account.social;
  const mine = (t) => !!t && t.kind === 'player' && !!t.id && !!account && t.id === account.userId;
  const ownOf = (t) => (mine(t) && Number.isInteger(t.slot) ? ctx.peers().find((o) => o.slot === t.slot) || null : null);
  return {
    'party-invite': {
      /* Every other player (live v0.2.11: an unnamed "Adventurer" lost the entry because the invite went by
         name); hidden only across a block or for someone already in this party. */
      when: (t) => {
        if (!cs || t.kind !== 'player') return false;
        if (mine(t)) { const o = ownOf(t); return !!o && o !== cs && !partyMembershipOf(o); }
        if (t.id && UUID.test(t.id)) {
          if (social && social.blocks && typeof social.blocks.has === 'function' && social.blocks.has(t.id)) return false;
          for (const p of partyPeopleOf(cs).values()) if (p.id === t.id && (t.slot === null || t.slot === undefined || p.slot === t.slot)) return false;
          return true;
        }
        return !!t.name && t.name !== 'Adventurer' && typeof cs.inviteByName === 'function';
      },
      /* A full party shows the entry off, in words. */
      off: (t) => { const p = partyMembershipOf(cs); return !mine(t) && p && p.full ? 'Party full' : null; },
      run: async (t) => {
        if (mine(t)) {
          const r = await inviteOwn(account, cs, t.slot);
          return { say: r.ok ? t.name + ' joined your party.' : refusalText(r) };
        }
        const r = t.id && UUID.test(t.id) ? await invitePlayer(account, cs, t.id, Number.isInteger(t.slot) ? t.slot : null) : await cs.inviteByName(t.name);
        return { say: r.ok ? 'Invite sent to ' + t.name + '.' : refusalText(r) };
      },
    },
    'party-leave': {
      when: (t) => { const o = ownOf(t); return !!o && !!partyMembershipOf(o); },
      run: async (t) => {
        const o = ownOf(t);
        if (!o) return { say: refusalText({ error: 'closed' }) };
        const r = await afterLeave(account, o, () => o.leaveParty());
        return { say: r.ok ? t.name + ' left the party.' : refusalText(r) };
      },
    },
  };
}

/** The providers for one shell (its character, its account). */
export function menuProvidersOf(ctx) {
  const social = ctx.account && ctx.account.social;
  const cs = ctx.character;
  const own = social ? social.menuProviders() : {};
  return Object.assign({}, own, {
    party: partyEntries(ctx, cs),
    look: { look: { when: (t) => t.kind === 'monster' && !!MONSTERS[t.id], run: (t) => ({ say: lookText(t.id) }) } },
  });
}
