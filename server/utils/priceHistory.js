const PriceHistory = require('../models/PriceHistory');

// Records a product's regular price so the trends chart can show how it moved.
// Best-effort: a failure here must never break saving the product itself.
async function recordPrice(product) {
  try {
    await PriceHistory.create({ product: product._id, storeId: product.storeId, price: product.price, at: new Date() });
  } catch (err) {
    console.error('recordPrice() failed:', err.message);
  }
}

// Products that existed before price history was introduced have no rows yet.
// Give each one a starting row dated NOW - the honest answer to "what was the
// price before we started recording?" is "we don't know", so charts start today.
async function ensureBaselines(products) {
  try {
    if (!products.length) return;
    const have = new Set((await PriceHistory.find({ product: { $in: products.map((p) => p._id) } }).distinct('product')).map(String));
    const missing = products.filter((p) => !have.has(String(p._id)));
    if (missing.length) {
      const at = new Date();
      await PriceHistory.insertMany(missing.map((p) => ({ product: p._id, storeId: p.storeId, price: p.price, at })));
    }
  } catch (err) {
    console.error('ensureBaselines() failed:', err.message);
  }
}

module.exports = { recordPrice, ensureBaselines };
