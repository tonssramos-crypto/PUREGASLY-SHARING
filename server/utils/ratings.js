const StoreRating = require('../models/StoreRating');

// Trust score for each store: the average of the ratings other stores gave it.
// Returns Map(storeId -> { avg, count }); stores with no ratings are simply absent.
async function trustOf(storeIds) {
  const ids = [...new Set(storeIds.map(String))];
  const out = new Map();
  if (!ids.length) return out;
  const rows = await StoreRating.find({ toStore: { $in: ids } }).select('toStore rating').lean();
  const sums = new Map();
  for (const r of rows) {
    const k = String(r.toStore);
    const cur = sums.get(k) || { total: 0, count: 0 };
    cur.total += r.rating;
    cur.count += 1;
    sums.set(k, cur);
  }
  for (const [k, v] of sums) out.set(k, { avg: Math.round((v.total / v.count) * 10) / 10, count: v.count });
  return out;
}

const trustFor = (map, id) => map.get(String(id)) || { avg: null, count: 0 };

module.exports = { trustOf, trustFor };
