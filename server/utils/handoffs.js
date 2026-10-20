const Handoff = require('../models/Handoff');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Store = require('../models/Store');
const { reserveStock, restoreStock } = require('./stock');
const { notify, notifyStoreStaff } = require('./notify');
const { quoteDelivery, peso } = require('./delivery');
const { round2, newOrderNo } = require('./helpers');
const { trustOf, trustFor } = require('./ratings');
const N = require('./network');

const { ACTIVE_STATUSES } = Handoff;
const OPEN_ORDER_STATUSES = ['pending', 'preparing']; // an order can only be handed over while it hasn't left the store

const priceOf = (p) => (p.promoPrice != null && p.promoPrice < p.price ? p.promoPrice : p.price);

// ---------------------------------------------------------------------------
// The offer: what the RECEIVING store would charge for the same items.
// Pure - give it the order's items and the other store's products.
// ---------------------------------------------------------------------------
//   categories: Map(productId -> 'lpg'|'refill'|'accessory') for the ORIGINAL order's products
function buildOffer({ orderItems, categories, toStore, toProducts }) {
  const wanted = new Map();
  for (const it of orderItems) {
    const key = N.productKey({ category: categories.get(String(it.product)) || 'lpg', brand: it.brand, sizeKg: it.sizeKg, name: it.name });
    const w = wanted.get(key) || { key, qty: 0, name: it.name };
    w.qty += it.qty;
    wanted.set(key, w);
  }

  const byKey = new Map();
  for (const p of toProducts) {
    if (p.active === false) continue;
    const k = N.productKey(p);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(p);
  }

  const items = [];
  for (const w of wanted.values()) {
    const options = (byKey.get(w.key) || []).filter((p) => p.stock >= w.qty).sort((a, b) => priceOf(a) - priceOf(b));
    if (!options.length) return { error: 'missing', itemName: w.name };
    const p = options[0];
    items.push({ product: p._id, name: p.name, brand: p.brand || '', sizeKg: p.sizeKg, unitPrice: priceOf(p), qty: w.qty });
  }

  const subtotal = round2(items.reduce((s, it) => s + it.unitPrice * it.qty, 0));
  const q = quoteDelivery(toStore, subtotal);
  if (q.belowMinimum) return { error: 'minimum', minOrder: q.minOrder };
  return { items, subtotal, deliveryFee: q.deliveryFee, total: round2(subtotal + q.deliveryFee) };
}

async function offerFor(order, toStore) {
  const ids = order.items.map((i) => i.product);
  const [mine, toProducts] = await Promise.all([
    Product.find({ _id: { $in: ids } }).select('category'),
    Product.find({ storeId: toStore._id, active: { $ne: false } }),
  ]);
  const categories = new Map(mine.map((p) => [String(p._id), p.category]));
  return buildOffer({ orderItems: order.items, categories, toStore, toProducts });
}

const offerErrorMessage = (err, store) =>
  err.error === 'minimum'
    ? `${store.name} has a minimum order of ${peso(err.minOrder)}, which this order doesn't reach.`
    : `${store.name} doesn't have enough stock of ${err.itemName}.`;

// ---------------------------------------------------------------------------
// Finding stores that could take an order over
// ---------------------------------------------------------------------------
async function findCandidates(order, myStore, { scope = 'area' } = {}) {
  const filter = { status: 'approved', 'network.joined': true, _id: { $ne: myStore._id } };
  if (scope === 'area') filter.areaKey = myStore.areaKey;
  const stores = (await Store.find(filter)).filter((s) => N.isActiveMember(s));

  // don't offer the same order to a store that already said no / let it lapse
  const past = await Handoff.find({ order: order._id, status: { $in: ['declined_by_store', 'expired'] } }).select('toStore');
  const skip = new Set(past.map((h) => String(h.toStore)));
  const options = stores.filter((s) => !skip.has(String(s._id)));
  if (!options.length) return [];

  const ids = order.items.map((i) => i.product);
  const [mine, products, trust] = await Promise.all([
    Product.find({ _id: { $in: ids } }).select('category'),
    Product.find({ storeId: { $in: options.map((s) => s._id) }, active: { $ne: false } }),
    trustOf(options.map((s) => s._id)),
  ]);
  const categories = new Map(mine.map((p) => [String(p._id), p.category]));

  const out = [];
  for (const s of options) {
    const offer = buildOffer({ orderItems: order.items, categories, toStore: s, toProducts: products.filter((p) => String(p.storeId) === String(s._id)) });
    if (offer.error) continue;
    out.push({
      storeId: String(s._id),
      name: s.name,
      area: s.area,
      sameArea: s.areaKey === myStore.areaKey,
      trust: trustFor(trust, s._id),
      subtotal: offer.subtotal,
      deliveryFee: offer.deliveryFee,
      total: offer.total,
      difference: round2(offer.total - order.total),
    });
  }
  return out.sort((a, b) => a.total - b.total);
}

// ---------------------------------------------------------------------------
// Ending a handoff. The status change is atomic (only while still active), so two
// requests racing can never both "end" it - and stock is only given back by whoever won.
// ---------------------------------------------------------------------------
async function endHandoff(h, status, extra = {}) {
  const ended = await Handoff.findOneAndUpdate(
    { _id: h._id, status: { $in: ACTIVE_STATUSES } },
    { $set: { status, ...extra } },
    { new: true }
  );
  if (!ended) return null;
  if (ended.stockReserved) {
    await restoreStock(ended.items);
    await Handoff.updateOne({ _id: ended._id }, { $set: { stockReserved: false } });
    ended.stockReserved = false;
  }
  return ended;
}

// Lets a handoff lapse if nobody answered in time (checked whenever it is looked at - no scheduler needed).
async function expireIfStale(h) {
  if (!ACTIVE_STATUSES.includes(h.status) || new Date(h.expiresAt) > new Date()) return h;
  const wasAwaitingCustomer = h.status === 'awaiting_customer';
  const ended = await endHandoff(h, 'expired');
  if (ended) {
    const [from, to] = await Promise.all([Store.findById(h.fromStore).select('name'), Store.findById(h.toStore).select('name')]);
    notifyStoreStaff(h.fromStore, 'manage_orders', { type: 'handoff', title: 'Handoff offer expired', message: `${to ? to.name : 'The other store'} didn't get an answer in time.`, link: '/network?tab=handoffs' });
    if (wasAwaitingCustomer) {
      notify(h.customer, { type: 'handoff', title: 'The handover offer expired', message: `${from ? from.name : 'The store'} will contact you about your order.`, link: '/orders' });
      notifyStoreStaff(h.toStore, 'manage_orders', { type: 'handoff', title: 'Handoff offer expired', message: 'The customer did not answer in time. Your held stock was released.', link: '/network?tab=handoffs' });
    }
  }
  return ended || (await Handoff.findById(h._id)) || h;
}

// An order stops being "handable" the moment it is cancelled or leaves the store.
// Call this wherever that happens so a customer is never shown an offer for a dead order.
async function endHandoffsForOrder(orderId, why = 'The order changed.') {
  try {
    const active = await Handoff.find({ order: orderId, status: { $in: ACTIVE_STATUSES } });
    for (const h of active) {
      const wasAwaiting = h.status === 'awaiting_customer';
      const ended = await endHandoff(h, 'cancelled');
      if (!ended) continue;
      notifyStoreStaff(h.toStore, 'manage_orders', { type: 'handoff', title: 'Handoff offer withdrawn', message: why, link: '/network?tab=handoffs' });
      if (wasAwaiting) notify(h.customer, { type: 'handoff', title: 'The handover offer is no longer available', message: why, link: '/orders' });
    }
  } catch (err) {
    console.error('endHandoffsForOrder() failed:', err.message);
  }
}

// When a store is banned or removed from the network, everything it is part of ends.
async function endHandoffsForStore(storeId, why = 'A store left the network.') {
  try {
    const active = await Handoff.find({ $or: [{ fromStore: storeId }, { toStore: storeId }], status: { $in: ACTIVE_STATUSES } });
    for (const h of active) {
      const wasAwaiting = h.status === 'awaiting_customer';
      const ended = await endHandoff(h, 'cancelled');
      if (!ended) continue;
      const other = String(h.fromStore) === String(storeId) ? h.toStore : h.fromStore;
      notifyStoreStaff(other, 'manage_orders', { type: 'handoff', title: 'Handoff cancelled', message: why, link: '/network?tab=handoffs' });
      if (wasAwaiting) notify(h.customer, { type: 'handoff', title: 'The handover offer is no longer available', message: why, link: '/orders' });
    }
  } catch (err) {
    console.error('endHandoffsForStore() failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// The customer agrees: move the order.
//   1. claim the handoff (so a double tap can't do it twice)
//   2. create the NEW order at the receiving store (its stock is already held)
//   3. cancel the ORIGINAL order - only if it is still pending/preparing
//   4. tidy up stock and notify everyone
// If step 2 or 3 fails, everything done so far is undone.
// ---------------------------------------------------------------------------
async function completeHandoff(handoffId, customerId) {
  const claimed = await Handoff.findOneAndUpdate(
    { _id: handoffId, customer: customerId, status: 'awaiting_customer', expiresAt: { $gt: new Date() } },
    { $set: { status: 'completed', completedAt: new Date() } },
    { new: true }
  );
  if (!claimed) return { status: 409, message: 'This offer is no longer available.' };

  const revertClaim = () => Handoff.updateOne({ _id: claimed._id }, { $set: { status: 'awaiting_customer', completedAt: null } });

  const original = await Order.findOne({ _id: claimed.order, customer: customerId });
  if (!original || !OPEN_ORDER_STATUSES.includes(original.status)) {
    await Handoff.updateOne({ _id: claimed._id }, { $set: { status: 'awaiting_customer' } });
    await endHandoff(claimed, 'cancelled');
    return { status: 409, message: 'Your original order has already changed, so it can no longer be handed over.' };
  }
  const [fromStore, toStore] = await Promise.all([Store.findById(claimed.fromStore), Store.findById(claimed.toStore)]);

  let created;
  try {
    const note = `Handed over from ${fromStore ? fromStore.name : 'another store'}.${original.notes ? ' ' + original.notes : ''}`.slice(0, 200);
    created = await Order.create({
      orderNo: newOrderNo(),
      customer: customerId,
      storeId: claimed.toStore,
      items: claimed.items,
      subtotal: claimed.subtotal,
      discount: 0, // the original store's coupon belongs to that store
      couponCode: '',
      deliveryFee: claimed.deliveryFee,
      total: claimed.total,
      status: 'preparing', // the store already agreed to take it
      statusHistory: [{ status: 'pending', at: new Date() }, { status: 'preparing', at: new Date() }],
      deliveryAddress: original.deliveryAddress,
      contactNumber: original.contactNumber,
      notes: note,
      paymentMethod: original.paymentMethod,
      handoff: claimed._id,
      handedOffFrom: claimed.fromStore,
    });
  } catch (err) {
    await revertClaim();
    throw err;
  }

  const cancelled = await Order.findOneAndUpdate(
    { _id: original._id, status: { $in: OPEN_ORDER_STATUSES } },
    { $set: { status: 'cancelled', handoff: claimed._id, handedOffTo: claimed.toStore }, $push: { statusHistory: { status: 'cancelled', at: new Date() } } },
    { new: true }
  );
  if (!cancelled) {
    // the store moved the original order on in the meantime - undo the new one
    await Order.deleteOne({ _id: created._id });
    await Handoff.updateOne({ _id: claimed._id }, { $set: { status: 'awaiting_customer', completedAt: null } });
    await endHandoff(claimed, 'cancelled');
    return { status: 409, message: 'Your original order has already changed, so it can no longer be handed over.' };
  }

  await restoreStock(original.items);
  if (claimed.zeroStock) {
    await Product.updateMany({ _id: { $in: original.items.map((i) => i.product) }, storeId: claimed.fromStore }, { $set: { stock: 0 } });
  }
  // the receiving store's stock now belongs to the new order, not to a hold
  await Handoff.updateOne({ _id: claimed._id }, { $set: { newOrder: created._id, stockReserved: false } });

  notifyStoreStaff(claimed.toStore, 'manage_orders', { type: 'order_placed', title: `Handed-over order ${created.orderNo}`, message: `From ${fromStore ? fromStore.name : 'another store'} - ${peso(created.total)}. The customer agreed.`, link: '/store-orders' });
  notifyStoreStaff(claimed.fromStore, 'manage_orders', { type: 'handoff', title: 'The customer accepted the handoff', message: `Order ${original.orderNo} moved to ${toStore ? toStore.name : 'the other store'}.`, link: '/network?tab=handoffs' });
  notify(customerId, { type: 'order_status', title: `Your order moved to ${toStore ? toStore.name : 'another store'}`, message: `New order ${created.orderNo} is being prepared.`, link: '/orders' });

  return { ok: true, order: created, handoff: claimed };
}

// Is there an offer for this order that hasn't been answered or ended yet?
async function hasOpenHandoff(orderId) {
  return !!(await Handoff.exists({ order: orderId, status: { $in: ACTIVE_STATUSES } }));
}

// Active handoffs (as a map by order id) for the order cards on the store's orders page.
async function activeHandoffsByOrder(orderIds) {
  if (!orderIds.length) return new Map();
  const rows = await Handoff.find({ order: { $in: orderIds }, status: { $in: ACTIVE_STATUSES } }).populate('toStore', 'name');
  return new Map(rows.map((h) => [String(h.order), h]));
}

module.exports = {
  OPEN_ORDER_STATUSES,
  buildOffer,
  offerFor,
  offerErrorMessage,
  findCandidates,
  endHandoff,
  expireIfStale,
  endHandoffsForOrder,
  endHandoffsForStore,
  completeHandoff,
  activeHandoffsByOrder,
  hasOpenHandoff,
};
