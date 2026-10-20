const mongoose = require('mongoose');

const ACTIVE_STATUSES = ['proposed', 'awaiting_customer'];
const STATUSES = ['proposed', 'awaiting_customer', 'completed', 'declined_by_store', 'declined_by_customer', 'cancelled', 'expired'];

// One store (fromStore) asks another (toStore) to take over a customer's order it
// can't fulfil. The customer must agree before anything moves.
//
//   proposed          -> waiting for the other store to accept (their stock is NOT held yet)
//   awaiting_customer -> the other store accepted and its stock is held; waiting for the customer
//   completed         -> customer agreed: a new order exists at toStore, the old one is cancelled
//   declined_by_store / declined_by_customer / cancelled / expired -> ended without a move
const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }, // the RECEIVING store's product
    name: { type: String, required: true },
    brand: { type: String, default: '' },
    sizeKg: { type: Number },
    unitPrice: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const handoffSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true }, // the original order
    newOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fromStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    toStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },

    status: { type: String, enum: STATUSES, default: 'proposed', index: true },
    reason: { type: String, enum: ['out_of_stock', 'cannot_deliver', 'other'], default: 'out_of_stock' },
    note: { type: String, trim: true, default: '', maxlength: 200 },
    declineReason: { type: String, trim: true, default: '', maxlength: 200 },
    zeroStock: { type: Boolean, default: false }, // set the original products to 0 stock once handed off

    // What the receiving store would charge. Re-checked and LOCKED when it accepts.
    items: { type: [itemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    originalTotal: { type: Number, default: 0 },
    stockReserved: { type: Boolean, default: false }, // the receiving store's stock is being held

    // Agreed between the two stores; the receiving store owes it once the order is delivered.
    referralFee: { type: Number, default: 0, min: 0 },
    feeReceivedAt: { type: Date, default: null },

    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Handoff', handoffSchema);
module.exports.ACTIVE_STATUSES = ACTIVE_STATUSES;
module.exports.STATUSES = STATUSES;
