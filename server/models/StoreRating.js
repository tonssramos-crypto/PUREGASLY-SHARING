const mongoose = require('mongoose');

// After a handoff is finished, each store can rate the other on reliability.
const storeRatingSchema = new mongoose.Schema(
  {
    handoff: { type: mongoose.Schema.Types.ObjectId, ref: 'Handoff', required: true },
    fromStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    toStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, default: '', maxlength: 200 },
  },
  { timestamps: true }
);

// A store can rate a given handoff only once.
storeRatingSchema.index({ handoff: 1, fromStore: 1 }, { unique: true });

module.exports = mongoose.model('StoreRating', storeRatingSchema);
