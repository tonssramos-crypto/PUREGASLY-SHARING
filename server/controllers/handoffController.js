const Handoff = require('../models/Handoff');
const Order = require('../models/Order');
const Store = require('../models/Store');
const User = require('../models/User');
const StoreRating = require('../models/StoreRating');
const NetworkReport = require('../models/NetworkReport');
const N = require('../utils/network');
const H = require('../utils/handoffs');
const { reserveStock } = require('../utils/stock');
const { notify, notifyStoreStaff } = require('../utils/notify');
const { peso, parseMoney } = require('../utils/delivery');
const { round2, isValidId } = require('../utils/helpers');
const { trustOf, trustFor } = require('../utils/ratings');

const { ACTIVE_STATUSES } = Handoff;
const DONE_ORDER_STATUSES = ['delivered', 'received'];
const fail500 = (res, err) => {
  console.error(err);
  return res.status(500).json({ message: 'Something went wrong.' });
};
const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

// How the referral fee stands (the receiving store owes it once the new order is delivered).
function feeState(h, newOrderStatus) {
  if (!(h.referralFee > 0) || h.status !== 'completed') return 'none';
  if (newOrderStatus === 'cancelled') return 'void';
  if (!DONE_ORDER_STATUSES.includes(newOrderStatus)) return 'pending';
  return h.feeReceivedAt ? 'received' : 'due';
}

// A handoff as one of the two stores sees it. `ctx` carries things looked up once for the whole list.
function shape(h, myStoreId, ctx) {
  const mine = String(myStoreId);
  const iAmSender = String(h.fromStore._id || h.fromStore) === mine;
  const other = iAmSender ? h.toStore : h.fromStore;
  const otherId = String(other._id || other);
  const order = h.order && h.order.orderNo ? h.order : null;
  const newOrder = h.newOrder && h.newOrder.orderNo ? h.newOrder : null;
  const fee = feeState(h, newOrder && newOrder.status);
  const finished = h.status === 'completed' && newOrder && DONE_ORDER_STATUSES.includes(newOrder.status);

  return {
    id: h._id,
    role: iAmSender ? 'sender' : 'receiver',
    status: h.status,
    reason: h.reason,
    note: h.note,
    declineReason: h.declineReason,
    createdAt: h.createdAt,
    expiresAt: h.expiresAt,
    acceptedAt: h.acceptedAt,
    completedAt: h.completedAt,
    other: { id: otherId, name: other.name || '', area: other.area || '', trust: trustFor(ctx.trust, otherId) },
    items: h.items,
    subtotal: h.subtotal,
    deliveryFee: h.deliveryFee,
    total: h.total,
    originalTotal: h.originalTotal || (order ? order.total : 0),
    // the sender knows its own order; the receiver only learns roughly where it is going until the customer agrees
    orderNo: iAmSender && order ? order.orderNo : null,
    deliveryArea: !iAmSender && h.status !== 'completed' ? N.approxDeliveryArea(order ? order.deliveryAddress : '') : null,
    referralFee: h.referralFee,
    fee: { amount: h.referralFee, status: fee },
    newOrder: newOrder ? { orderNo: newOrder.orderNo, status: newOrder.status } : null,
    canRate: !!finished && !ctx.rated.has(String(h._id)),
    rated: ctx.rated.has(String(h._id)),
    reported: ctx.reported.has(String(h._id)),
  };
}

function populateForList(q) {
  return q
    .populate('fromStore', 'name area')
    .populate('toStore', 'name area')
    .populate('order', 'orderNo total deliveryAddress')
    .populate('newOrder', 'orderNo status');
}

// GET /api/network/handoffs/candidates?orderId=&scope=area|network
exports.candidates = async (req, res) => {
  try {
    const { orderId } = req.query;
    if (!isValidId(orderId)) return res.status(400).json({ message: 'Invalid order.' });
    const store = req.currentStore;
    const order = await Order.findOne({ _id: orderId, storeId: store._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (!H.OPEN_ORDER_STATUSES.includes(order.status)) {
      return res.json({ eligible: false, message: 'Only new orders, or ones being prepared, can be handed to another store.', candidates: [] });
    }
    const scope = req.query.scope === 'network' ? 'network' : 'area';
    const candidates = await H.findCandidates(order, store, { scope });
    return res.json({ eligible: true, scope, maxReferralRate: N.MAX_REFERRAL_RATE, maxReferralFee: N.MAX_REFERRAL_FEE, orderTotal: order.total, candidates });
  } catch (err) {
    return fail500(res, err);
  }
};

// POST /api/network/handoffs   body: { orderId, toStoreId, referralFee, reason, note, zeroStock }
exports.create = async (req, res) => {
  try {
    const { orderId, toStoreId, reason = 'out_of_stock', zeroStock } = req.body;
    if (!isValidId(orderId) || !isValidId(toStoreId)) return res.status(400).json({ message: 'Choose an order and a store.' });
    if (!['out_of_stock', 'cannot_deliver', 'other'].includes(reason)) return res.status(400).json({ message: 'Invalid reason.' });

    const from = req.currentStore;
    if (String(toStoreId) === String(from._id)) return res.status(400).json({ message: 'Choose a different store.' });

    const order = await Order.findOne({ _id: orderId, storeId: from._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (!H.OPEN_ORDER_STATUSES.includes(order.status)) {
      return res.status(400).json({ message: 'Only new orders, or ones being prepared, can be handed to another store.' });
    }

    const history = await Handoff.find({ order: order._id }).select('status');
    if (history.some((h) => ACTIVE_STATUSES.includes(h.status))) return res.status(409).json({ message: 'This order already has an open handoff offer.' });
    if (history.length >= N.MAX_HANDOFFS_PER_ORDER) return res.status(400).json({ message: `You can offer one order to other stores at most ${N.MAX_HANDOFFS_PER_ORDER} times.` });

    const to = await Store.findById(toStoreId);
    if (!to || !N.isActiveMember(to)) return res.status(400).json({ message: 'That store is not available in the network.' });

    const offer = await H.offerFor(order, to);
    if (offer.error) return res.status(409).json({ message: H.offerErrorMessage(offer, to) });

    const fee = parseMoney(req.body.referralFee, 'Referral fee', N.MAX_REFERRAL_FEE);
    if (fee.error) return res.status(400).json({ message: fee.error });
    const maxFee = Math.min(N.MAX_REFERRAL_FEE, round2(offer.subtotal * N.MAX_REFERRAL_RATE));
    if (fee.value > maxFee) {
      return res.status(400).json({ message: `The referral fee can be at most ${peso(maxFee)} (${Math.round(N.MAX_REFERRAL_RATE * 100)}% of the items) for this order.` });
    }

    const h = await Handoff.create({
      order: order._id,
      customer: order.customer,
      fromStore: from._id,
      toStore: to._id,
      reason,
      note: clean(req.body.note, 200),
      zeroStock: reason === 'out_of_stock' && zeroStock === true,
      items: offer.items,
      subtotal: offer.subtotal,
      deliveryFee: offer.deliveryFee,
      total: offer.total,
      originalTotal: order.total,
      referralFee: fee.value,
      expiresAt: new Date(Date.now() + N.HANDOFF_PROPOSAL_TTL_MS),
    });

    notifyStoreStaff(to._id, 'manage_orders', {
      type: 'handoff',
      title: `Handoff offer from ${from.name}`,
      message: `${offer.items.reduce((s, i) => s + i.qty, 0)} item(s), ${peso(offer.total)}${fee.value > 0 ? `, referral fee ${peso(fee.value)}` : ''}. Answer within 2 hours.`,
      link: '/network?tab=handoffs',
    });
    return res.status(201).json({ id: h._id });
  } catch (err) {
    return fail500(res, err);
  }
};

// GET /api/network/handoffs
exports.list = async (req, res) => {
  try {
    const store = req.currentStore;
    let rows = await populateForList(Handoff.find({ $or: [{ fromStore: store._id }, { toStore: store._id }] }).sort({ createdAt: -1 }).limit(200));
    rows = await Promise.all(rows.map((h) => H.expireIfStale(h).then((fresh) => (fresh === h ? h : populateForList(Handoff.findById(h._id))))));
    rows = rows.filter(Boolean);

    const ids = rows.map((h) => h._id);
    const [ratings, reports] = await Promise.all([
      StoreRating.find({ handoff: { $in: ids }, fromStore: store._id }).select('handoff').lean(),
      NetworkReport.find({ handoff: { $in: ids }, reporterStore: store._id }).select('handoff').lean(),
    ]);
    const trust = await trustOf(rows.flatMap((h) => [h.fromStore._id, h.toStore._id]));
    const ctx = { trust, rated: new Set(ratings.map((r) => String(r.handoff))), reported: new Set(reports.map((r) => String(r.handoff))) };

    const shaped = rows.map((h) => shape(h, store._id, ctx));
    const sum = (arr) => round2(arr.reduce((s, h) => s + h.fee.amount, 0));
    return res.json({
      incoming: shaped.filter((h) => h.role === 'receiver'),
      outgoing: shaped.filter((h) => h.role === 'sender'),
      fees: {
        dueToMe: sum(shaped.filter((h) => h.role === 'sender' && h.fee.status === 'due')),
        receivedByMe: sum(shaped.filter((h) => h.role === 'sender' && h.fee.status === 'received')),
        iOwe: sum(shaped.filter((h) => h.role === 'receiver' && h.fee.status === 'due')),
      },
    });
  } catch (err) {
    return fail500(res, err);
  }
};

async function loadMine(req, res, side) {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ message: 'Invalid id.' });
    return null;
  }
  const filter = { _id: req.params.id };
  filter[side] = req.currentStore._id;
  const h = await Handoff.findOne(filter);
  if (!h) {
    res.status(404).json({ message: 'Handoff not found.' });
    return null;
  }
  return H.expireIfStale(h);
}

// POST /api/network/handoffs/:id/accept   (the receiving store)
exports.accept = async (req, res) => {
  try {
    const h = await loadMine(req, res, 'toStore');
    if (!h) return;
    if (h.status !== 'proposed') return res.status(409).json({ message: 'This offer is no longer open.' });

    const order = await Order.findById(h.order);
    if (!order || !H.OPEN_ORDER_STATUSES.includes(order.status)) {
      await H.endHandoff(h, 'cancelled');
      return res.status(409).json({ message: 'The order has already changed, so this offer was withdrawn.' });
    }

    // Price and stock are checked again NOW, then held for the customer.
    const me = req.currentStore;
    const offer = await H.offerFor(order, me);
    if (offer.error) return res.status(409).json({ message: H.offerErrorMessage(offer, me).replace(`${me.name} doesn't have`, "You don't have") });
    try {
      await reserveStock(offer.items);
    } catch (err) {
      if (err.code === 'OUT_OF_STOCK') return res.status(409).json({ message: "You no longer have enough stock for this order." });
      throw err;
    }

    const now = new Date();
    const updated = await Handoff.findOneAndUpdate(
      { _id: h._id, status: 'proposed' },
      {
        $set: {
          status: 'awaiting_customer',
          items: offer.items,
          subtotal: offer.subtotal,
          deliveryFee: offer.deliveryFee,
          total: offer.total,
          originalTotal: order.total,
          stockReserved: true,
          acceptedAt: now,
          expiresAt: new Date(now.getTime() + N.HANDOFF_CUSTOMER_TTL_MS),
        },
      },
      { new: true }
    );
    if (!updated) {
      await require('../utils/stock').restoreStock(offer.items); // someone else answered first
      return res.status(409).json({ message: 'This offer is no longer open.' });
    }

    const from = await Store.findById(h.fromStore).select('name');
    notify(h.customer, {
      type: 'handoff',
      title: `${from ? from.name : 'Your store'} can't fulfil order ${order.orderNo}`,
      message: `${me.name} can deliver it for ${peso(offer.total)}. Tap to review and choose.`,
      link: '/orders',
    });
    notifyStoreStaff(h.fromStore, 'manage_orders', { type: 'handoff', title: `${me.name} accepted your handoff`, message: 'Waiting for the customer to agree (within 1 hour).', link: '/network?tab=handoffs' });
    return res.json({ ok: true });
  } catch (err) {
    return fail500(res, err);
  }
};

// POST /api/network/handoffs/:id/decline   body: { reason }   (the receiving store)
exports.decline = async (req, res) => {
  try {
    const h = await loadMine(req, res, 'toStore');
    if (!h) return;
    if (!ACTIVE_STATUSES.includes(h.status)) return res.status(409).json({ message: 'This offer is no longer open.' });
    const wasAwaiting = h.status === 'awaiting_customer';
    const ended = await H.endHandoff(h, 'declined_by_store', { declineReason: clean(req.body.reason, 200) });
    if (!ended) return res.status(409).json({ message: 'This offer is no longer open.' });

    notifyStoreStaff(h.fromStore, 'manage_orders', { type: 'handoff', title: `${req.currentStore.name} declined your handoff`, message: ended.declineReason || 'Try another store or cancel the order.', link: '/network?tab=handoffs' });
    if (wasAwaiting) notify(h.customer, { type: 'handoff', title: 'The handover offer was withdrawn', message: 'The store will contact you about your order.', link: '/orders' });
    return res.json({ ok: true });
  } catch (err) {
    return fail500(res, err);
  }
};

// POST /api/network/handoffs/:id/cancel   (the sending store)
exports.cancel = async (req, res) => {
  try {
    const h = await loadMine(req, res, 'fromStore');
    if (!h) return;
    if (!ACTIVE_STATUSES.includes(h.status)) return res.status(409).json({ message: 'This offer is no longer open.' });
    const wasAwaiting = h.status === 'awaiting_customer';
    const ended = await H.endHandoff(h, 'cancelled');
    if (!ended) return res.status(409).json({ message: 'This offer is no longer open.' });

    notifyStoreStaff(h.toStore, 'manage_orders', { type: 'handoff', title: `${req.currentStore.name} withdrew the handoff`, message: 'Your held stock was released.', link: '/network?tab=handoffs' });
    if (wasAwaiting) notify(h.customer, { type: 'handoff', title: 'The handover offer was withdrawn', message: 'The store will contact you about your order.', link: '/orders' });
    return res.json({ ok: true });
  } catch (err) {
    return fail500(res, err);
  }
};

// POST /api/network/handoffs/:id/fee-received   (the sending store confirms it got paid)
exports.feeReceived = async (req, res) => {
  try {
    const h = await loadMine(req, res, 'fromStore');
    if (!h) return;
    const order = h.newOrder ? await Order.findById(h.newOrder).select('status') : null;
    if (feeState(h, order && order.status) !== 'due') return res.status(409).json({ message: 'There is no referral fee waiting to be confirmed.' });
    h.feeReceivedAt = new Date();
    await h.save();
    notifyStoreStaff(h.toStore, 'manage_orders', { type: 'handoff', title: 'Referral fee confirmed', message: `${req.currentStore.name} confirmed receiving ${peso(h.referralFee)}.`, link: '/network?tab=handoffs' });
    return res.json({ ok: true });
  } catch (err) {
    return fail500(res, err);
  }
};

async function loadEither(req, res) {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ message: 'Invalid id.' });
    return null;
  }
  const me = req.currentStore._id;
  const h = await Handoff.findOne({ _id: req.params.id, $or: [{ fromStore: me }, { toStore: me }] });
  if (!h) {
    res.status(404).json({ message: 'Handoff not found.' });
    return null;
  }
  return h;
}

// POST /api/network/handoffs/:id/rate   body: { rating 1-5, comment }
exports.rate = async (req, res) => {
  try {
    const h = await loadEither(req, res);
    if (!h) return;
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Choose a rating from 1 to 5.' });

    const order = h.newOrder ? await Order.findById(h.newOrder).select('status') : null;
    if (h.status !== 'completed' || !order || !DONE_ORDER_STATUSES.includes(order.status)) {
      return res.status(409).json({ message: 'You can rate the other store once the handed-over order is delivered.' });
    }
    const me = String(req.currentStore._id);
    const toStore = String(h.fromStore) === me ? h.toStore : h.fromStore;
    if (await StoreRating.exists({ handoff: h._id, fromStore: me })) {
      return res.status(409).json({ message: 'You already rated this handoff.' });
    }
    try {
      await StoreRating.create({ handoff: h._id, fromStore: me, toStore, rating, comment: clean(req.body.comment, 200) });
    } catch (err) {
      if (err && err.code === 11000) return res.status(409).json({ message: 'You already rated this handoff.' });
      throw err;
    }
    return res.status(201).json({ ok: true });
  } catch (err) {
    return fail500(res, err);
  }
};

// POST /api/network/reports   body: { handoffId, type, details }
exports.report = async (req, res) => {
  try {
    const { handoffId, type } = req.body;
    if (!isValidId(handoffId)) return res.status(400).json({ message: 'Choose the handoff you are reporting about.' });
    if (!NetworkReport.REPORT_TYPES.includes(type)) return res.status(400).json({ message: 'Choose what is wrong.' });
    const details = clean(req.body.details, 500);
    if (details.length < 5) return res.status(400).json({ message: 'Please describe what happened (at least a few words).' });

    const me = req.currentStore._id;
    const h = await Handoff.findOne({ _id: handoffId, $or: [{ fromStore: me }, { toStore: me }] });
    if (!h) return res.status(404).json({ message: 'You can only report stores you have had a handoff with.' });
    if (await NetworkReport.exists({ handoff: h._id, reporterStore: me, status: 'open' })) {
      return res.status(409).json({ message: 'You already have an open report about this handoff.' });
    }
    const target = String(h.fromStore) === String(me) ? h.toStore : h.fromStore;
    const r = await NetworkReport.create({ handoff: h._id, reporterStore: me, targetStore: target, reportedBy: req.userId, type, details });

    const admins = await User.find({ role: 'admin' }).select('_id');
    admins.forEach((a) => notify(a._id, { type: 'network', title: 'New network report', message: `${req.currentStore.name} reported a store (${type.replace('_', ' ')}).`, link: '/dashboard' }));
    return res.status(201).json({ id: r._id });
  } catch (err) {
    return fail500(res, err);
  }
};

// ---------------------------------------------------------------------------
// The customer's side (routes live under /api/orders/:id/handoff/...)
// ---------------------------------------------------------------------------

// Adds the open "can you accept this?" offer to each of the customer's orders.
exports.attachToCustomerOrders = async (orders) => {
  const ids = orders.filter((o) => H.OPEN_ORDER_STATUSES.includes(o.status)).map((o) => o._id);
  if (!ids.length) return new Map();
  let rows = await Handoff.find({ order: { $in: ids }, status: 'awaiting_customer' }).populate('toStore', 'name area').populate('fromStore', 'name');
  rows = (await Promise.all(rows.map((h) => H.expireIfStale(h)))).filter((h) => h && h.status === 'awaiting_customer');
  const trust = await trustOf(rows.map((h) => h.toStore._id));
  return new Map(
    rows.map((h) => [
      String(h.order),
      {
        id: h._id,
        fromStoreName: h.fromStore.name,
        toStore: { name: h.toStore.name, area: h.toStore.area, trust: trustFor(trust, h.toStore._id) },
        items: h.items,
        subtotal: h.subtotal,
        deliveryFee: h.deliveryFee,
        total: h.total,
        originalTotal: h.originalTotal,
        expiresAt: h.expiresAt,
      },
    ])
  );
};

async function loadForCustomer(req, res) {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ message: 'Invalid id.' });
    return null;
  }
  const h = await Handoff.findOne({ order: req.params.id, customer: req.userId, status: 'awaiting_customer' });
  if (!h) {
    const done = await Handoff.exists({ order: req.params.id, customer: req.userId, status: 'completed' });
    if (done) res.status(409).json({ message: 'You already accepted this offer - your order has moved to the new store.' });
    else res.status(404).json({ message: 'There is no handover offer waiting for you on this order.' });
    return null;
  }
  const fresh = await H.expireIfStale(h);
  if (fresh.status !== 'awaiting_customer') {
    res.status(409).json({ message: 'This offer has expired.' });
    return null;
  }
  return fresh;
}

// POST /api/orders/:id/handoff/accept
exports.customerAccept = async (req, res) => {
  try {
    const h = await loadForCustomer(req, res);
    if (!h) return;
    const result = await H.completeHandoff(h._id, req.userId);
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    return res.json({ ok: true, newOrderId: result.order._id, newOrderNo: result.order.orderNo });
  } catch (err) {
    return fail500(res, err);
  }
};

// POST /api/orders/:id/handoff/decline
exports.customerDecline = async (req, res) => {
  try {
    const h = await loadForCustomer(req, res);
    if (!h) return;
    const ended = await H.endHandoff(h, 'declined_by_customer');
    if (!ended) return res.status(409).json({ message: 'This offer is no longer open.' });
    const to = await Store.findById(h.toStore).select('name');
    notifyStoreStaff(h.fromStore, 'manage_orders', { type: 'handoff', title: 'The customer declined the handoff', message: `They did not want ${to ? to.name : 'the other store'} to take the order. Try another store or cancel it.`, link: '/network?tab=handoffs' });
    notifyStoreStaff(h.toStore, 'manage_orders', { type: 'handoff', title: 'The customer declined the handoff', message: 'Your held stock was released.', link: '/network?tab=handoffs' });
    return res.json({ ok: true });
  } catch (err) {
    return fail500(res, err);
  }
};
