const Store = require('../models/Store');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Handoff = require('../models/Handoff');
const PriceHistory = require('../models/PriceHistory');
const N = require('../utils/network');
const { buildBenchmark, pricesByStore } = require('../utils/benchmark');
const { buildTrend } = require('../utils/trends');
const { computeDemand } = require('../utils/demand');
const { trustOf, trustFor } = require('../utils/ratings');
const { ensureBaselines } = require('../utils/priceHistory');

const DAY_MS = 24 * 60 * 60 * 1000;
const fail500 = (res, err) => {
  console.error(err);
  return res.status(500).json({ message: 'Something went wrong.' });
};

// Every approved store that has joined the network (and not been removed).
async function networkStores() {
  const stores = await Store.find({ status: 'approved', 'network.joined': true }).select('name area areaKey network status');
  return stores.filter((s) => N.networkOf(s).status !== 'removed');
}

// GET /api/network/status
exports.status = async (req, res) => {
  try {
    const store = req.currentStore;
    const state = N.networkOf(store);
    const [trust, incoming, outgoing] = await Promise.all([
      trustOf([store._id]),
      Handoff.countDocuments({ toStore: store._id, status: 'proposed' }),
      Handoff.countDocuments({ fromStore: store._id, status: { $in: Handoff.ACTIVE_STATUSES } }),
    ]);
    return res.json({
      area: store.area || '',
      ...state,
      trust: trustFor(trust, store._id),
      termsVersion: N.NETWORK_TERMS_VERSION,
      thresholds: { minStores: N.MIN_STORES, minStoresForRange: N.MIN_STORES_FOR_RANGE, minDemandOrders: N.MIN_DEMAND_ORDERS },
      counts: { incomingOffers: incoming, myActiveOffers: outgoing },
    });
  } catch (err) {
    return fail500(res, err);
  }
};

// GET /api/network/areas  - the area names already in use, so owners pick the same spelling
exports.areas = async (req, res) => {
  try {
    const stores = await networkStores();
    const groups = new Map();
    for (const s of stores) {
      if (!s.areaKey) continue;
      const g = groups.get(s.areaKey) || { names: new Map(), stores: 0 };
      g.names.set(s.area, (g.names.get(s.area) || 0) + 1);
      g.stores += 1;
      groups.set(s.areaKey, g);
    }
    const out = [...groups.values()].map((g) => ({
      name: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      stores: g.stores,
    }));
    return res.json(out.sort((a, b) => b.stores - a.stores || a.name.localeCompare(b.name)));
  } catch (err) {
    return fail500(res, err);
  }
};

// POST /api/network/join   (owner)   body: { agree: true, area? }
exports.join = async (req, res) => {
  try {
    if (req.currentUser.role !== 'owner') {
      return res.status(403).json({ message: 'Only the store owner can join the network.' });
    }
    const store = req.currentStore;
    if (N.networkOf(store).status === 'removed') {
      return res.status(403).json({ code: 'NETWORK_REMOVED', message: 'Your store was removed from the network. Contact the PureGasly admin.' });
    }
    if (req.body.agree !== true) {
      return res.status(400).json({ message: 'Please agree to the network terms to join.' });
    }

    if (req.body.area !== undefined) {
      const area = String(req.body.area).trim().slice(0, 60);
      store.area = area;
      store.areaKey = N.normalizeArea(area);
    }
    if (!store.areaKey) {
      return res.status(400).json({ message: 'Enter the city or town your store serves before joining.' });
    }

    store.network.joined = true;
    store.network.joinedAt = store.network.joinedAt || new Date();
    store.network.termsVersion = N.NETWORK_TERMS_VERSION;
    await store.save();
    return res.json({ joined: true });
  } catch (err) {
    return fail500(res, err);
  }
};

// POST /api/network/leave   (owner)
exports.leave = async (req, res) => {
  try {
    if (req.currentUser.role !== 'owner') {
      return res.status(403).json({ message: 'Only the store owner can leave the network.' });
    }
    const store = req.currentStore;
    const active = await Handoff.countDocuments({ $or: [{ fromStore: store._id }, { toStore: store._id }], status: { $in: Handoff.ACTIVE_STATUSES } });
    if (active > 0) {
      return res.status(409).json({ message: 'Finish or cancel your open handoff offers before leaving the network.' });
    }
    store.network.joined = false;
    await store.save();
    return res.json({ joined: false });
  } catch (err) {
    return fail500(res, err);
  }
};

// Everything needed to compare prices: all network stores' gas products, tagged with their area.
async function loadPriceData() {
  const stores = await networkStores();
  const areaOf = new Map(stores.map((s) => [String(s._id), s.areaKey]));
  const products = await Product.find({ storeId: { $in: stores.map((s) => s._id) }, active: { $ne: false }, category: { $in: N.NETWORK_CATEGORIES } });
  const tagged = products.map((p) => ({
    _id: p._id,
    id: String(p._id),
    storeId: String(p.storeId),
    areaKey: areaOf.get(String(p.storeId)),
    price: p.price,
    promoPrice: p.promoPrice,
    category: p.category,
    brand: p.brand,
    sizeKg: p.sizeKg,
    name: p.name,
    createdAt: p.createdAt,
  }));
  return { stores, products, tagged };
}

// GET /api/network/benchmark
exports.benchmark = async (req, res) => {
  try {
    const store = req.currentStore;
    const { products, tagged } = await loadPriceData();
    await ensureBaselines(products);
    const mine = tagged.filter((p) => p.storeId === String(store._id));
    const items = buildBenchmark({ myStoreId: String(store._id), myAreaKey: store.areaKey, areaName: store.area, myProducts: mine, networkProducts: tagged });
    items.sort((a, b) => a.label.localeCompare(b.label));
    return res.json({ areaName: store.area, items, thresholds: { minStores: N.MIN_STORES, minStoresForRange: N.MIN_STORES_FOR_RANGE } });
  } catch (err) {
    return fail500(res, err);
  }
};

// GET /api/network/trends?key=...&days=30|90|180
exports.trends = async (req, res) => {
  try {
    const store = req.currentStore;
    const days = [30, 90, 180].includes(Number(req.query.days)) ? Number(req.query.days) : 90;
    const key = String(req.query.key || '');

    const { products, tagged } = await loadPriceData();
    await ensureBaselines(products);
    const mine = tagged.filter((p) => p.storeId === String(store._id) && N.isComparable(p));
    const myProduct = mine.find((p) => N.productKey(p) === key);
    if (!myProduct) return res.status(404).json({ message: 'You do not sell that product.' });

    const same = tagged.filter((p) => N.productKey(p) === key);
    const inArea = same.filter((p) => p.areaKey === store.areaKey);
    let scope = null;
    let scoped = [];
    if (pricesByStore(inArea).size >= N.MIN_STORES) {
      scope = 'area';
      scoped = inArea;
    } else if (pricesByStore(same).size >= N.MIN_STORES) {
      scope = 'network';
      scoped = same;
    }
    // my own price line is shown even when there isn't enough data for the area line
    const forChart = scope ? scoped : mine.filter((p) => N.productKey(p) === key);

    const rows = await PriceHistory.find({ product: { $in: forChart.map((p) => p._id) } }).sort({ at: 1 }).lean();
    const histories = {};
    for (const r of rows) (histories[String(r.product)] = histories[String(r.product)] || []).push({ at: new Date(r.at).getTime(), price: r.price });

    const trend = buildTrend({
      products: forChart.map((p) => ({ id: p.id, storeId: p.storeId })),
      histories,
      mineIds: new Set(mine.filter((p) => N.productKey(p) === key).map((p) => p.id)),
      days,
    });

    return res.json({
      key,
      label: N.productLabel(myProduct),
      days,
      scope,
      scopeName: scope === 'area' ? store.area : scope === 'network' ? 'All PureGasly network stores' : null,
      storesNow: pricesByStore(scoped).size,
      ...trend,
    });
  } catch (err) {
    return fail500(res, err);
  }
};

// GET /api/network/demand?days=7|30|90
exports.demand = async (req, res) => {
  try {
    const store = req.currentStore;
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const stores = await networkStores();
    const now = Date.now();

    const orders = await Order.find({
      storeId: { $in: stores.map((s) => s._id) },
      status: { $ne: 'cancelled' },
      createdAt: { $gte: new Date(now - 2 * days * DAY_MS) },
    })
      .select('storeId createdAt items.sizeKg items.brand items.qty')
      .limit(60000)
      .lean();

    const result = computeDemand({
      orders,
      stores: stores.map((s) => ({ id: String(s._id), areaKey: s.areaKey, area: s.area })),
      myStoreId: String(store._id),
      days,
      now,
    });
    return res.json(result);
  } catch (err) {
    return fail500(res, err);
  }
};
