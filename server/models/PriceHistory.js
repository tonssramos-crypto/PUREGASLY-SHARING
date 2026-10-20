const mongoose = require('mongoose');

// One row each time a product's regular price changes (and when it is created).
// This is what lets the "price trends" chart show how prices moved over time,
// without needing a scheduled job.
const priceHistorySchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  price: { type: Number, required: true, min: 0 },
  at: { type: Date, default: Date.now },
});

priceHistorySchema.index({ product: 1, at: 1 });

module.exports = mongoose.model('PriceHistory', priceHistorySchema);
