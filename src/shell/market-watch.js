// ════════════════════════════════════════════════════════════════════════
// src/shell/market-watch.js — THE WEIGHHOUSE'S NOTICES: A SALE WHILE ONLINE, AND WHILE AWAY.
//
// The seller is paid inside the buyer's transaction, online or not, so the only news is
// the account's own history (hr_market_mine). On sign-in that read is compared with the last
// sale this player was told about (residue `marketSeen`): anything newer is ONE away line,
// "While you were away the Weighhouse sold 4 lots for 1,727 gold." After that, only while
// the account has a listing up and the page is showing, one read a minute: a sale reads
// "The Weighhouse sold 1 Iron Platelegs for 240 gold. You received 230." and the purse is
// re-read from the server. Goods back from an expiry say so too. An account with nothing
// listed makes no reads at all. The lines go through the alert centre, so they are also the
// chat's System lines. Every number is the server's; nothing here gates or spends anything.
// ════════════════════════════════════════════════════════════════════════
import { marketMine } from '../session/market-intents.js?v=0.2.76';
import { noticesSince, noticeLines } from './market-model.js?v=0.2.76';

const EVERY_MS = 60 * 1000;

/** Tell the player what they have not heard; mounted once per signed-in page. @returns {{destroy(): void}} */
export function mountMarketWatch(win, account, alerts) {
  let timer = 0, gone = false, told = false, busy = false, open = 0;
  const viewed = () => (account.viewed !== null && account.viewed !== undefined ? account.character(account.viewed) : null);
  const seenOf = () => account.characters().reduce((m, c) => {
    const r = c.record && c.record.residue && c.record.residue.marketSeen;
    return Number.isSafeInteger(r) ? Math.max(m, r) : m;
  }, 0);

  async function check() {
    const cs = viewed();
    if (gone || busy || !cs || cs.status === 'closed' || !cs.record) return;
    busy = true;
    let r;
    try { r = await marketMine(cs); } catch (e) { r = null; }
    busy = false;
    if (gone || !r || !r.ok) return;
    open = Array.isArray(r.body.listings) ? r.body.listings.length : 0;
    const history = Array.isArray(r.body.history) ? r.body.history : [];
    const seen = seenOf();
    const { rows, newest } = noticesSince(history, seen);
    if (rows.length) {
      for (const n of noticeLines(rows, !told)) alerts.say(cs, { id: 'market:' + n.key + '.' + n.at, kind: 'market', session: null, item: n.item, text: n.text });
      cs.setResidue('marketSeen', newest);
      cs.load();
    }
    told = true;
  }

  function tick() {
    if (gone) return;
    if (open > 0 && !win.document.hidden) check();
    timer = win.setTimeout(tick, EVERY_MS);
  }

  /* The first read waits for a hero: the account opens its characters after this mounts. */
  const off = account.subscribe((why) => { if (!told && why === 'opened') check(); });
  if (viewed()) check();
  timer = win.setTimeout(tick, EVERY_MS);
  return { destroy() { gone = true; win.clearTimeout(timer); if (typeof off === 'function') off(); } };
}
