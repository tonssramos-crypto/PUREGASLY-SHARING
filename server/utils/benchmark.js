const { round2 } = require('./helpers');
const { MIN_STORES, MIN_STORES_FOR_RANGE, productKey, productLabel, isComparable } = require('./network');

function median(sortedAsc) {
  const n = sortedAsc.length;
  if (!n) return null;
  const mid = Math.floor(n / 2);
  return n % 2 ? sortedAsc[mid] : round2((sortedAsc[mid - 1] + sortedAsc[mid]) / 2);
}

// Summary of ONE price per store. Returns null when too few stores to be anonymous.
// The lowest/highest are only included with enough stores (they are real prices).
function summarizePrices(prices) {
  const list = prices.filter((p) => Number.isFinite(p)).sort((a, b) => a - b);
  const n = list.length;
  if (n < MIN_STORES) return null;
  const out = { n, avg: round2(list.reduce((s, p) => s + p, 0) / n), median: median(list), min: null, max: null };
  if (n >= MIN_STORES_FOR_RANGE) {
    out.min = list[0];
    out.max = list[n - 1];
  }
  return out;
}

// Where `price` sits among the group's prices.
function positionOf(price, summary, prices) {
  if (!summary || !summary.avg) return null;
  const diffPct = Math.round(((price - summary.avg) / summary.avg) * 1000) / 10;
  const higher = prices.filter((p) => p > price).length;
  return {
    diffPct,
    cheaperThanPct: Math.round((higher / prices.length) * 100), // % of stores that charge more
    label: diffPct < -5 ? 'below' : diffPct > 5 ? 'above' : 'aligned',
  };
}

// One (lowest) price per store for a product type, so a store listing the same
// thing twice can't count as two stores.
function pricesByStore(products) {
  const byStore = new Map();
  for (const p of products) {
    const id = String(p.storeId);
    const price = Number(p.price);
    if (!byStore.has(id) || price < byStore.get(id)) byStore.set(id, price);
  }
  return byStore;
}

// For each of my products: how its (regular) price compares with the area.
//   networkProducts: products of every store in the network (mine included), each with
//                    { storeId, areaKey, price, category, brand, sizeKg, name }
// Uses my area when at least MIN_STORES stores there sell it; otherwise the whole network;
// otherwise says there isn't enough data yet.
function buildBenchmark({ myStoreId, myAreaKey, areaName, myProducts, networkProducts }) {
  const groups = new Map(); // key -> products
  for (const p of networkProducts) {
    if (!isComparable(p)) continue;
    const k = productKey(p);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }

  return myProducts.filter(isComparable).map((mine) => {
    const key = productKey(mine);
    const all = groups.get(key) || [];
    const inArea = all.filter((p) => p.areaKey === myAreaKey);

    let scope = null;
    let summary = null;
    let prices = [];
    const areaPrices = [...pricesByStore(inArea).values()];
    if (areaPrices.length >= MIN_STORES) {
      scope = 'area';
      prices = areaPrices;
      summary = summarizePrices(prices);
    } else {
      const netPrices = [...pricesByStore(all).values()];
      if (netPrices.length >= MIN_STORES) {
        scope = 'network';
        prices = netPrices;
        summary = summarizePrices(prices);
      }
    }

    return {
      productId: String(mine._id),
      key,
      label: productLabel(mine),
      name: mine.name,
      category: mine.category || 'lpg',
      myPrice: mine.price,
      myEffectivePrice: mine.promoPrice != null && mine.promoPrice < mine.price ? mine.promoPrice : mine.price,
      scope, // 'area' | 'network' | null (not enough stores yet)
      scopeName: scope === 'area' ? areaName : scope === 'network' ? 'All PureGasly network stores' : null,
      storesCounted: summary ? summary.n : Math.max(areaPrices.length, 0),
      avg: summary ? summary.avg : null,
      median: summary ? summary.median : null,
      min: summary ? summary.min : null,
      max: summary ? summary.max : null,
      position: summary ? positionOf(mine.price, summary, prices) : null,
    };
  });
}

module.exports = { summarizePrices, positionOf, pricesByStore, buildBenchmark, median };
