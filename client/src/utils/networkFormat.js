export const HANDOFF_STATUS_LABEL = {
  proposed: 'Waiting for the store',
  awaiting_customer: 'Waiting for the customer',
  completed: 'Completed',
  declined_by_store: 'Declined',
  declined_by_customer: 'Customer said no',
  cancelled: 'Withdrawn',
  expired: 'Expired',
};

// Reuses the colours of the order status pills.
export function handoffPillClass(status) {
  if (status === 'proposed') return 'pending';
  if (status === 'awaiting_customer') return 'preparing';
  if (status === 'completed') return 'delivered';
  return 'cancelled';
}

export const REASON_LABEL = { out_of_stock: 'Out of stock', cannot_deliver: "Can't deliver", other: 'Other reason' };

export const REPORT_TYPES = [
  { value: 'abusive_message', label: 'Abusive or inappropriate message' },
  { value: 'no_show', label: "Didn't honour the handoff" },
  { value: 'misleading', label: 'Misleading stock or price information' },
  { value: 'other', label: 'Something else' },
];

export const FEE_LABEL = {
  pending: 'Due once the order is delivered',
  due: 'Due now',
  received: 'Paid',
  void: 'Cancelled (order did not go through)',
};

// "1h 20m left", "12m left", "Expired"
export function timeLeft(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (!(ms > 0)) return 'Expired';
  const m = Math.floor(ms / 60000);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m left`;
  return `${Math.max(1, m)}m left`;
}

// "2026-10-18" -> "Oct 18"
export function shortDate(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function hourLabel(h) {
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${h < 12 ? 'a' : 'p'}`;
}
