// The delivery rules, as the customer's cart previews them. Keep in step with
// quoteDelivery() in server/utils/delivery.js - the server is what really
// enforces them when the order is placed.
//   items = the cart total BEFORE any coupon discount.
export function quoteDelivery(settings, items) {
  const fee = Math.max(0, Number(settings?.deliveryFee) || 0);
  const minOrder = Math.max(0, Number(settings?.minOrder) || 0);
  const freeOver = Math.max(0, Number(settings?.freeDeliveryOver) || 0);
  const sub = Number(items) || 0;

  const freeApplied = fee > 0 && freeOver > 0 && sub >= freeOver;
  const round = (n) => Math.round(n * 100) / 100;
  return {
    deliveryFee: freeApplied ? 0 : round(fee),
    freeApplied,
    minOrder,
    belowMinimum: sub < minOrder,
    shortBy: round(Math.max(0, minOrder - sub)),
    // how much more to spend to unlock free delivery (0 = nothing to unlock)
    toFreeDelivery: fee > 0 && freeOver > 0 && !freeApplied ? round(freeOver - sub) : 0,
  };
}

// Short text for store cards: "Delivery ₱50" / "Free delivery" and "Min ₱500".
export function deliverySummary(store, formatPHP) {
  const chips = [];
  const fee = Number(store?.deliveryFee) || 0;
  const min = Number(store?.minOrder) || 0;
  chips.push(fee > 0 ? `Delivery ${formatPHP(fee)}` : 'Free delivery');
  if (min > 0) chips.push(`Min ${formatPHP(min)}`);
  return chips;
}
