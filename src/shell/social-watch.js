// ════════════════════════════════════════════════════════════════════════
// src/shell/social-watch.js — A PRIVATE MESSAGE OR A FRIEND REQUEST SAYS IT ARRIVED.
//
// The friends' panel, 2026-11-01: a private message arrived with no toast (a dot on a tab, once Chat was open), and a friend
// request with nothing at all. The lines go through the alert centre, like the Weighhouse's, off what the account's social
// stores hold: a whisper the store counts as unread (pushed while not on screen), a request the server lists as asked of this
// account. One line per person while it is up; a request is told once per hero (the alerts' seen list), and it waits for an
// answer, so it does not fade. Nothing here gates or spends anything, and no message's text is shown: the chat is where it is read.
// ════════════════════════════════════════════════════════════════════════

/** @returns {{destroy(): void}} */
export function mountSocialWatch(account, alerts) {
  const social = account.social;
  if (!social) return { destroy() {} };
  const told = new Set();
  const viewed = () => (account.viewed !== null && account.viewed !== undefined ? account.character(account.viewed) : null);

  function check() {
    const cs = viewed();
    if (!cs) return;
    const up = alerts.list();
    for (const c of social.whispers.conversations()) {
      const last = c.unread > 0 ? social.whispers.lines(c.tab).at(-1) : null;
      if (last && !up.some((a) => a.kind === 'whisper' && a.peer === c.id)) {
        alerts.say(cs, { id: 'whisper:' + c.id + ':' + last.id, kind: 'whisper', session: null, peer: c.id, tab: c.tab, transient: true, text: c.name + ' sent you a private message.' });
      }
    }
    for (const p of social.friends.incoming()) {
      if (told.has(p.id)) continue;
      told.add(p.id);
      alerts.say(cs, { id: 'friend:' + p.id, kind: 'friend', session: null, text: p.name + ' wants to be your friend.' });
    }
  }

  const off = social.subscribe(check);
  return { destroy() { off(); } };
}
