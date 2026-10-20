const mongoose = require('mongoose');

const REPORT_TYPES = ['abusive_message', 'no_show', 'misleading', 'other'];
const REPORT_ACTIONS = ['dismiss', 'warn', 'mute', 'remove'];

// A store reporting the other side of a handoff. The admin reviews these.
const networkReportSchema = new mongoose.Schema(
  {
    handoff: { type: mongoose.Schema.Types.ObjectId, ref: 'Handoff', required: true },
    reporterStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    targetStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: REPORT_TYPES, required: true },
    details: { type: String, trim: true, required: true, maxlength: 500 },

    status: { type: String, enum: ['open', 'dismissed', 'actioned'], default: 'open', index: true },
    action: { type: String, enum: [...REPORT_ACTIONS, ''], default: '' },
    adminNote: { type: String, trim: true, default: '', maxlength: 400 },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NetworkReport', networkReportSchema);
module.exports.REPORT_TYPES = REPORT_TYPES;
module.exports.REPORT_ACTIONS = REPORT_ACTIONS;
