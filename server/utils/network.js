// Rules and small helpers shared by everything in the store network.

const NETWORK_TERMS_VERSION = '2026-10-18';

// Privacy thresholds: no number is shown unless enough stores sit behind it,
// so nobody can work out what one particular store charges or sells.
const MIN_STORES = 3; // fewest stores before an area average / share is shown
const MIN_STORES_FOR_RANGE = 5; // fewest stores before a lowest-highest price is shown
const MIN_DEMAND_ORDERS = 10; // fewest orders before demand patterns are shown

// Handoffs
const HANDOFF_PROPOSAL_TTL_MS = 2 * 60 * 60 * 1000; // the other store has 2 hours to answer
const HANDOFF_CUSTOMER_TTL_MS = 60 * 60 * 1000; // then the customer has 1 hour
const MAX_HANDOFFS_PER_ORDER = 3;
const MAX_REFERRAL_RATE = 0.2; // a referral fee can't be more than 20% of the items...
const MAX_REFERRAL_FEE = 1000; // ...or more than 1,000 pesos

// Only gas products can be compared across stores (tanks and refills).
const NETWORK_CATEGORIES = ['lpg', 'refill'];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// "Urdaneta", "Urdaneta City", "City of Urdaneta" and "Urdaneta, Pangasinan" are one area.
function normalizeArea(text) {
  const first = String(text || '').split(',')[0];
  return norm(first)
    .split(' ')
    .filter((w) => w && !['city', 'of', 'municipality', 'town'].includes(w))
    .join(' ');
}

// What makes two stores' products "the same thing" to compare or swap:
// same kind (tank / refill), same brand, same size. Products with no brand and
// no size (e.g. a regulator) only match on an identical name.
function productKey(p) {
  const category = p.category || 'lpg';
  const brand = norm(p.brand);
  const size = Number(p.sizeKg) > 0 ? Number(p.sizeKg) : null;
  if (brand || size) return `${category}|${brand}|${size ?? ''}`;
  return `${category}|name:${norm(p.name)}`;
}

function productLabel(p) {
  const parts = [p.brand, Number(p.sizeKg) > 0 ? `${Number(p.sizeKg)} kg` : ''].filter(Boolean);
  const base = parts.join(' ') || p.name;
  return p.category === 'refill' ? `${base} (refill)` : base;
}

// Is this product something we compare across the network (a gas tank / refill with a brand or size)?
function isComparable(p) {
  return NETWORK_CATEGORIES.includes(p.category || 'lpg') && (norm(p.brand) !== '' || Number(p.sizeKg) > 0);
}

// The store's network standing right now. A mute that has run out counts as active again.
function networkOf(store, now = new Date()) {
  const n = (store && store.network) || {};
  let status = n.status || 'active';
  if (status === 'muted' && (!n.mutedUntil || new Date(n.mutedUntil) <= now)) status = 'active';
  return {
    joined: !!n.joined,
    status,
    mutedUntil: status === 'muted' ? n.mutedUntil : null,
    warnings: n.warnings || 0,
    statusNote: n.statusNote || '',
  };
}

// A store that can take part in new handoffs and appear in other stores' candidate lists.
function isActiveMember(store, now = new Date()) {
  const n = networkOf(store, now);
  return n.joined && n.status === 'active' && store.status === 'approved';
}

// Before the customer agrees, the receiving store only sees roughly WHERE the order is going
// (everything after the first comma - street and house number are dropped).
function approxDeliveryArea(address) {
  const parts = String(address || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  return parts.slice(1).join(', ');
}

module.exports = {
  NETWORK_TERMS_VERSION,
  MIN_STORES,
  MIN_STORES_FOR_RANGE,
  MIN_DEMAND_ORDERS,
  HANDOFF_PROPOSAL_TTL_MS,
  HANDOFF_CUSTOMER_TTL_MS,
  MAX_HANDOFFS_PER_ORDER,
  MAX_REFERRAL_RATE,
  MAX_REFERRAL_FEE,
  NETWORK_CATEGORIES,
  norm,
  normalizeArea,
  productKey,
  productLabel,
  isComparable,
  networkOf,
  isActiveMember,
  approxDeliveryArea,
};
