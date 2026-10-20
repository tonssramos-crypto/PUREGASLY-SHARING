const { round2 } = require('./helpers');

// Limits for what a store owner can type (stops typos like an extra zero).
const MAX_DELIVERY_FEE = 5000;
const MAX_ORDER_AMOUNT = 100000;

// Works out the delivery part of an order from the store's settings.
//   subtotal = the items total BEFORE any coupon discount.
//   - minOrder:         the items total must reach this to place an order.
//   - deliveryFee:      added on top of the items.
//   - freeDeliveryOver: when the items total reaches this, the fee is waived (0 = never).
// The customer's cart uses the same rules to preview the price; the server is
// the one that actually enforces them when the order is placed.
function quoteDelivery(store, subtotal) {
  const fee = Math.max(0, Number(store && store.deliveryFee) || 0);
  const minOrder = Math.max(0, Number(store && store.minOrder) || 0);
  const freeOver = Math.max(0, Number(store && store.freeDeliveryOver) || 0);
  const sub = Number(subtotal) || 0;

  const freeApplied = fee > 0 && freeOver > 0 && sub >= freeOver;
  return {
    deliveryFee: freeApplied ? 0 : round2(fee),
    freeApplied,
    minOrder: round2(minOrder),
    freeDeliveryOver: round2(freeOver),
    belowMinimum: sub < minOrder,
    shortBy: round2(Math.max(0, minOrder - sub)),
  };
}

// ₱1,234.50 for messages shown to people (the receipt PDF font can't draw ₱, so it uses formatPHP).
function peso(n) {
  return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Reads a peso amount from the owner's form. Blank means 0.
// Returns { value } or { error }.
function parseMoney(raw, label, max) {
  if (raw === '' || raw === null || raw === undefined) return { value: 0 };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { error: `${label} must be a number, 0 or more.` };
  if (n > max) return { error: `${label} can't be more than ₱${max.toLocaleString('en-PH')}.` };
  return { value: round2(n) };
}

module.exports = { quoteDelivery, parseMoney, peso, MAX_DELIVERY_FEE, MAX_ORDER_AMOUNT };
