const { TZ_OFFSET_MS, dayKey } = require('./helpers');
const { summarizePrices } = require('./benchmark');

const DAY_MS = 24 * 60 * 60 * 1000;

// Last millisecond of the Philippine calendar day that contains `t` (never later than `now`).
function endOfPhDay(t, now) {
  const start = Math.floor((t + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS;
  return Math.min(start + DAY_MS - 1, now);
}

// Price at a moment in time: the last recorded price at or before it (histories are sorted by time).
function priceAt(history, ms) {
  let price = null;
  for (const h of history) {
    if (h.at <= ms) price = h.price;
    else break;
  }
  return price;
}

// Day-by-day average price of one product type across stores, plus my own price.
//   products:  [{ id, storeId }]          every store's product of this type
//   histories: { [productId]: [{ at(ms), price }] sorted by time }
//   mineIds:   Set of product ids that belong to my store
// A day only gets numbers when enough stores had a price that day (privacy rule);
// the lowest/highest are only shown with enough stores (see summarizePrices).
function buildTrend({ products, histories, mineIds, days, now = Date.now() }) {
  const series = [];
  const mine = [];

  for (let i = days - 1; i >= 0; i--) {
    const end = endOfPhDay(now - i * DAY_MS, now);
    const date = dayKey(end);

    const perStore = new Map();
    let myPrice = null;
    for (const p of products) {
      const price = priceAt(histories[p.id] || [], end);
      if (price == null) continue;
      const sid = String(p.storeId);
      if (!perStore.has(sid) || price < perStore.get(sid)) perStore.set(sid, price);
      if (mineIds.has(p.id) && (myPrice == null || price < myPrice)) myPrice = price;
    }

    const s = summarizePrices([...perStore.values()]);
    series.push({ date, n: perStore.size, avg: s ? s.avg : null, min: s ? s.min : null, max: s ? s.max : null });
    mine.push({ date, price: myPrice });
  }

  return { series, mine };
}

module.exports = { buildTrend, priceAt, endOfPhDay, DAY_MS };
