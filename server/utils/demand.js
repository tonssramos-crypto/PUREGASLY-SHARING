const { TZ_OFFSET_MS } = require('./helpers');
const { MIN_STORES, MIN_DEMAND_ORDERS, norm } = require('./network');

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Philippine weekday (0 = Monday ... 6 = Sunday) and hour (0-23) of a moment.
function phParts(date) {
  const d = new Date(new Date(date).getTime() + TZ_OFFSET_MS);
  return { weekday: (d.getUTCDay() + 6) % 7, hour: d.getUTCHours() };
}

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

function sizeLabel(sizeKg) {
  return Number(sizeKg) > 0 ? `${Number(sizeKg)} kg` : 'Other';
}

function titleCase(s) {
  return String(s).replace(/\b\w/g, (c) => c.toUpperCase());
}

// Anonymous demand patterns for my area (or the whole network when my area is too small).
//   orders: non-cancelled orders { storeId, createdAt, items:[{sizeKg, brand, qty}] } covering 2 x `days`
//   stores: stores in the network { id, areaKey, area }
// Everything is a share of ORDERS or UNITS - no store other than mine is ever singled out,
// and nothing is shown without enough stores and orders behind it.
function computeDemand({ orders, stores, myStoreId, days, now = Date.now() }) {
  const me = stores.find((s) => String(s.id) === String(myStoreId));
  if (!me) return { ready: false, reason: 'not_in_network' };

  const areaStores = stores.filter((s) => s.areaKey === me.areaKey);
  const useArea = areaStores.length >= MIN_STORES;
  const scopeStores = useArea ? areaStores : stores;
  if (scopeStores.length < MIN_STORES) {
    return { ready: false, reason: 'stores', storesCounted: scopeStores.length, needed: MIN_STORES };
  }
  const scopeIds = new Set(scopeStores.map((s) => String(s.id)));
  const scopeName = useArea ? me.area : 'All PureGasly network stores';

  const since = now - days * DAY_MS;
  const before = now - 2 * days * DAY_MS;
  const inScope = orders.filter((o) => scopeIds.has(String(o.storeId)));
  const current = inScope.filter((o) => new Date(o.createdAt).getTime() >= since);
  const previous = inScope.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= before && t < since;
  });
  const mineOrders = current.filter((o) => String(o.storeId) === String(myStoreId));

  if (current.length < MIN_DEMAND_ORDERS) {
    return { ready: false, reason: 'orders', ordersCounted: current.length, needed: MIN_DEMAND_ORDERS, scopeName, storesCounted: scopeStores.length };
  }

  // busiest weekdays and hours
  const wdArea = Array(7).fill(0);
  const wdMine = Array(7).fill(0);
  const hrArea = Array(24).fill(0);
  const hrMine = Array(24).fill(0);
  for (const o of current) {
    const { weekday, hour } = phParts(o.createdAt);
    wdArea[weekday] += 1;
    hrArea[hour] += 1;
    if (String(o.storeId) === String(myStoreId)) {
      wdMine[weekday] += 1;
      hrMine[hour] += 1;
    }
  }
  const weekdays = WEEKDAYS.map((label, i) => ({ label, area: pct(wdArea[i], current.length), mine: mineOrders.length ? pct(wdMine[i], mineOrders.length) : null }));
  const hours = hrArea.map((c, h) => ({ hour: h, area: pct(c, current.length), mine: mineOrders.length ? pct(hrMine[h], mineOrders.length) : null }));

  // what sells: by size and by brand (share of units)
  const sizeArea = new Map();
  const sizeMine = new Map();
  const brandArea = new Map();
  let unitsArea = 0;
  let unitsMine = 0;
  for (const o of current) {
    const isMine = String(o.storeId) === String(myStoreId);
    for (const it of o.items || []) {
      const qty = Number(it.qty) || 0;
      const sl = sizeLabel(it.sizeKg);
      sizeArea.set(sl, (sizeArea.get(sl) || 0) + qty);
      unitsArea += qty;
      const b = norm(it.brand);
      if (b) brandArea.set(b, (brandArea.get(b) || 0) + qty);
      if (isMine) {
        sizeMine.set(sl, (sizeMine.get(sl) || 0) + qty);
        unitsMine += qty;
      }
    }
  }
  const sizes = [...sizeArea.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, units]) => ({ label, area: pct(units, unitsArea), mine: unitsMine ? pct(sizeMine.get(label) || 0, unitsMine) : null }));
  const brandTotal = [...brandArea.values()].reduce((s, n) => s + n, 0);
  const brands = [...brandArea.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([b, units]) => ({ label: titleCase(b), area: pct(units, brandTotal) }));

  // which areas order the most - across the whole network; small areas are lumped together
  const orderCountByStore = new Map();
  const currentAll = orders.filter((o) => new Date(o.createdAt).getTime() >= since);
  for (const o of currentAll) orderCountByStore.set(String(o.storeId), (orderCountByStore.get(String(o.storeId)) || 0) + 1);
  const byArea = new Map();
  for (const s of stores) {
    const g = byArea.get(s.areaKey) || { name: s.area, stores: 0, orders: 0 };
    g.stores += 1;
    g.orders += orderCountByStore.get(String(s.id)) || 0;
    byArea.set(s.areaKey, g);
  }
  const networkOrders = [...byArea.values()].reduce((s, g) => s + g.orders, 0);
  const named = [];
  let otherOrders = 0;
  for (const [key, g] of byArea) {
    if (g.stores >= MIN_STORES) named.push({ name: g.name, orders: g.orders, share: pct(g.orders, networkOrders), isMine: key === me.areaKey });
    else otherOrders += g.orders;
  }
  named.sort((a, b) => b.orders - a.orders);
  const areas = named.slice(0, 8).map(({ name, share, isMine }) => ({ name, share, isMine }));
  if (otherOrders > 0) areas.push({ name: 'Smaller areas (combined)', share: pct(otherOrders, networkOrders), isMine: false, combined: true });

  const growthPct = previous.length >= MIN_DEMAND_ORDERS ? Math.round(((current.length - previous.length) / previous.length) * 1000) / 10 : null;

  // plain-language takeaways
  const tips = [];
  const topDay = weekdays.reduce((a, b) => (b.area > a.area ? b : a));
  tips.push(`${topDay.label} is the busiest day in ${scopeName} (${topDay.area}% of orders).`);
  const peak = hours.reduce((a, b) => (b.area > a.area ? b : a));
  tips.push(`Orders peak around ${String(peak.hour).padStart(2, '0')}:00 - make sure stock and riders are ready before then.`);
  if (sizes.length) tips.push(`${sizes[0].label} makes up ${sizes[0].area}% of units sold - keep it well stocked.`);
  if (growthPct != null) tips.push(growthPct >= 0 ? `Demand is up ${growthPct}% compared with the previous ${days} days.` : `Demand is down ${Math.abs(growthPct)}% compared with the previous ${days} days.`);

  return {
    ready: true,
    scopeName,
    scope: useArea ? 'area' : 'network',
    storesCounted: scopeStores.length,
    ordersCounted: current.length,
    myOrders: mineOrders.length,
    days,
    growthPct,
    weekdays,
    hours,
    sizes,
    brands,
    areas,
    tips,
  };
}

module.exports = { computeDemand, phParts, WEEKDAYS };
