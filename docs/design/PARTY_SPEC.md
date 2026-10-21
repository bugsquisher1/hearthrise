# Party spec (Game Designer, 2026-10-19)

Trigger: Tyler, live with Andy: "the party system is confusing and broken all together."
Sources: rulings-of-record (party, accounts, hunts), prototypes/hunt-sim (party board, follow/regroup), origin/main
src/shell/windows/party*.js, widgets/party-panel.js, session/party-sections.js, app/character-strip.js,
data/social-menu.js, menu-providers.js, migrations 2026-10-23-hunt-party.sql and 2026-10-25-party-invites.sql.

## Why it feels broken (root causes found in code)
1. Two parsers read the one `party` section. The Party window (party-sections.partyMembershipOf) needs `self_seat`;
   the Party panel (hunt-sections.partyOf) drops any member without a hunt `unit`. In town nobody has a unit, so a
   partied player sees "Not in a hunt." The party exists; the panel hides it.
2. Town presence hides "self" by ACCOUNT id (town-presence.js `w.id === self`). A sibling shares the account id, so your
   own second character is never drawn. The hunt peer drawing probably filters the same way (unverified).
3. Many doors to one act: Hunts "With a party", Party window "Make a party", the finder, typed-name Invite, right-click
   Invite, and a "Bring" list for own characters. The player cannot tell which is the real one.
4. The party is bound to a hunt ground when MADE, before anyone is in it. Pick ground first, invite after: backwards.

## 1. The journey
1. Right-click any player (town, chat, friends) -> Invite to party. The first invite makes the party; you lead.
2. Your own other characters are tabs in the character strip. Right-click the tab -> Invite to party. Same account, so
   no accept step: it joins at once. A sibling already in a hunt is greyed with the reason.
3. A stranger sees a toast anywhere in the game: Join / No thanks. Accepting seats them. Invites expire (server TTL).
4. The Party panel is on screen the whole time you are partied, in town and in the hunt: one row per member (role glyph
   from weapon, name, level, crown, HP/mana, "In town" or "Hunting"), Leave, and for the leader Disband.
5. Members walk visibly in town, your own sibling too. The leader opens Hunts, picks a ground, presses Start with
   party: everyone is moved in together with their own saved setup. If anyone is not ready, the panel names them and
   nobody enters.
6. In the hunt the same panel shows live HP/mana (DPS/HPS expand for premium). Costs stay personal. Loot is split
   evenly by gold value; relics by the 1-100 roll (winner waits until everyone has one).
7. Leader: Kick (town only) and Disband. Anyone: Leave (town only). Leader leaves -> next seat leads; last out closes.
8. Edge cases. A death ends the hunt for the whole party; all return to town still partied (ruling 10-19). A logged-out
   town member shows "Away" for 10 min, then is dropped; a logged-out hunter keeps hunting server-side, as today. If a
   member is in another hunt, Start is refused naming them.
9. Strangers: the Party finder is one tab of the Party window: filter by ground and by the weapon the party lacks
   (default your own). One press Join.

## 2. Screens and controls (one way to do each thing)
KEEP
- Right-click "Invite to party" (social-menu.js `party-invite`): THE way to invite; same entry from chat/friends/rows.
- Character-strip tab right-click: Invite to party / Leave party (new entries on the same menu provider).
- Party panel (widgets/party-panel.js): the only roster, always shown while partied. Footer: Leave, Disband (leader).
- Hunts window: leader's "Start with party" replaces "Start" when partied; the ground is chosen here.
- Party finder: a tab in the Party window, with Invites received as a list above it.
- Invite toast with Join / No thanks.
DELETE
- "Make a party" button, its ground dropdown and ground note (party.js). The first invite makes the party.
- "With a party" button on every hunt row (hunts.js) and the `partyScratch.hunt` hand-off.
- The "Bring" list for own characters (party.js `.hw-bring`) and the invite-less peer.joinParty path.
- Typed-name Invite box (`hw-invite-name`). Keep inviteByName only as the RPC behind the menu.
- The Party window's seat list (duplicates the panel). The window becomes Finder + Invites.
- Friends window's own Invite markup (route through the menu entry).
- Panel "DPS and HPS" toggle when not hunting.

## 3. Today vs spec
| Behaviour | Today | Spec | State | File to change |
|---|---|---|---|---|
| Panel while partied in town | "Not in a hunt." (members need a hunt unit) | roster from party membership; hunt stats overlay when present | GAP | src/shell/widgets/party-panel.js, src/session/hunt-sections.js partyOf (merge with party-sections.js) |
| Own sibling visible in town | Hidden (self = account id) | self = account id + viewed slot | GAP | src/session/town-presence.js, server presence view |
| Own sibling visible in hunt | Missing (same pattern, unverified) | drawn like any peer | GAP | hunt peer renderer in src/world (find the self filter) |
| Invite own character | "Bring" button in leader's Party window | strip right-click, auto-join, no accept | GAP | src/app/character-strip.js, src/shell/menu-providers.js, src/data/social-menu.js |
| Invite a stranger | menu works but needs a party first | first invite creates the party | GAP | src/shell/menu-providers.js, hr_hunt_party_create (hunt optional) |
| Ground chosen | at party creation | at Start by the leader | GAP | 2026-10-23-hunt-party.sql create/start, src/shell/windows/hunts.js |
| Up to 4, any role mix | party_max, no role rule | same | MATCH | hr_hunt_party_join |
| Finder by missing weapon | filter, defaults to own weapon | same, as a tab | MATCH (placement GAP) | src/shell/windows/party-finder.js |
| Loot split by value, rare roll | engine split and roll | same | MATCH (not re-verified live) | src/core/combat-sim.js |
| Leader starts, all enter together or none | hr_hunt_party_start names not_ready seats | same | MATCH | 2026-10-25-party-invites.sql |
| One death ends hunt for all, party kept | party_member_died rule | same | MATCH (party kept: verify) | src/core/action-rules.js, combat-sim.js |
| Leave/kick while hunting | refused (hunt_open, member_hunting) | same, reason shown | MATCH (reason text GAP) | src/shell/windows/party.js, intent-words.js |
| Member logs out | undefined | "Away" 10 min, then dropped | GAP | party view + sweep (server) |
| Invite arrives | only inside the Party window | toast anywhere | GAP | src/shell alerts, invitesOf |
| Disband | none | leader Disband | GAP | new RPC in hunt-party migration, panel footer |

## 4. Open questions for Tyler
1. Own-character invites skip the accept step (my default: yes, same account, one decision). OK?
2. A town member who logs out keeps the seat 10 min (default) or leaves at once?
3. Start with fewer than all ready (unready left behind) or all-or-none as built (default)?
