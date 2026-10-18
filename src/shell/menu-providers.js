// ════════════════════════════════════════════════════════════════════════
// src/shell/menu-providers.js — WHO ANSWERS EACH RIGHT-CLICK ENTRY (the seam).
//
// The one context menu (src/shell/context-menu.js) is handed these providers,
// keyed by the `provider` of each row in src/data/social-menu.js:
//   inspect, whispers, friends, blocks   the account's social side
//                                         (SocialSession.menuProviders)
//   party                                 the viewed character's party invite
//                                         (CharacterSession.inviteByName)
//   look                                  a monster's name, tier and weaknesses,
//                                         from the bestiary rows
//   trade                                 none yet: the row is hidden until the
//                                         trade lane (its own server work and the
//                                         Security review) ships
// worldTargetOf turns what the World picked under a pointer into a target.
// ════════════════════════════════════════════════════════════════════════
import { MONSTERS } from '../data/monsters.js?v=0.2.0';
import { WEAPON_WORDS } from '../data/hunt-hud.js?v=0.2.0';
import { CHAT_REFUSALS } from '../data/chat-channels.js?v=0.2.0';
import { monsterName } from './widgets/bits.js?v=0.2.0';

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
 * unit whose ref names a player, else a monster the bestiary knows, else null.
 */
export function worldTargetOf(pick) {
  if (!pick || !Array.isArray(pick.hits)) return null;
  for (const h of pick.hits) {
    const p = h && h.ref && h.ref.player;
    if (p && typeof p.id === 'string' && UUID.test(p.id)) {
      return { kind: 'player', id: p.id, name: typeof p.name === 'string' ? p.name.slice(0, 24) : 'Adventurer', slot: Number.isInteger(p.slot) ? p.slot : null };
    }
    if (h && MONSTERS[h.id]) return { kind: 'monster', id: h.id, title: monsterName(h.id) };
  }
  return null;
}

/** The providers for one shell (its character, its account). */
export function menuProvidersOf(ctx) {
  const social = ctx.account && ctx.account.social;
  const cs = ctx.character;
  const self = (t) => !!(social && social.isSelf(t));
  const own = social ? social.menuProviders() : {};
  return Object.assign({}, own, {
    party: {
      'party-invite': {
        when: (t) => t.kind === 'player' && !self(t) && !!t.name && t.name !== 'Adventurer' && !!cs && typeof cs.inviteByName === 'function',
        run: async (t) => {
          const r = await cs.inviteByName(t.name);
          return r.ok ? { say: 'Invite sent to ' + t.name + '.' } : { say: CHAT_REFUSALS[r.error] || 'The invite did not go through.' };
        },
      },
    },
    look: { look: { when: (t) => t.kind === 'monster' && !!MONSTERS[t.id], run: (t) => ({ say: lookText(t.id) }) } },
  });
}
