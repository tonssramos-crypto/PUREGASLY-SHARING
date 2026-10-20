const Store = require('../models/Store');
const NetworkReport = require('../models/NetworkReport');
const Handoff = require('../models/Handoff');
const { notify } = require('../utils/notify');
const { logAdminAction } = require('../utils/audit');
const { endHandoffsForStore } = require('../utils/handoffs');
const { networkOf } = require('../utils/network');
const { trustOf, trustFor } = require('../utils/ratings');
const { isValidId } = require('../utils/helpers');

const fail500 = (res, err) => {
  console.error(err);
  return res.status(500).json({ message: 'Something went wrong.' });
};
const DAY_MS = 24 * 60 * 60 * 1000;
const note = (s) => String(s || '').trim().slice(0, 400);

// Applies a moderation action to a store's network standing. Returns an error string or null.
async function applyAction(store, action, { days, adminNote }) {
  if (action === 'warn') {
    store.network.warnings = (store.network.warnings || 0) + 1;
  } else if (action === 'mute') {
    const d = Math.min(90, Math.max(1, Math.round(Number(days)) || 7));
    store.network.status = 'muted';
    store.network.mutedUntil = new Date(Date.now() + d * DAY_MS);
  } else if (action === 'unmute' || action === 'restore') {
    store.network.status = 'active';
    store.network.mutedUntil = null;
  } else if (action === 'remove') {
    store.network.status = 'removed';
    store.network.mutedUntil = null;
  } else {
    return 'Unknown action.';
  }
  store.network.statusNote = ['unmute', 'restore'].includes(action) ? '' : adminNote;
  store.markModified('network');
  await store.save();
  if (action === 'remove' || action === 'mute') await endHandoffsForStore(store._id, 'A store was restricted in the network.');
  return null;
}

const ACTION_COPY = {
  warn: { title: 'You received a network warning', verb: 'warning' },
  mute: { title: 'Your store was muted in the network', verb: 'mute' },
  remove: { title: 'Your store was removed from the network', verb: 'removal' },
  unmute: { title: 'Your network mute was lifted', verb: 'unmute' },
  restore: { title: 'Your store is back in the network', verb: 'restore' },
};

function tellOwner(store, action, adminNote) {
  if (!store.owner) return;
  const c = ACTION_COPY[action];
  notify(store.owner._id || store.owner, { type: 'network', title: c.title, message: adminNote || 'Contact the PureGasly admin if you have questions.', link: '/network' });
}

function audit(req, store, action, details) {
  logAdminAction({
    adminId: req.currentUser._id,
    adminName: req.currentUser.name,
    action: `network.${action}`,
    targetType: 'store',
    targetId: store._id,
    targetLabel: store.name,
    details: String(details || '').slice(0, 400),
  });
}

// GET /api/admin/network/reports?status=open|dismissed|actioned|all
exports.listReports = async (req, res) => {
  try {
    const filter = ['open', 'dismissed', 'actioned'].includes(req.query.status) ? { status: req.query.status } : {};
    const reports = await NetworkReport.find(filter)
      .populate('reporterStore', 'name area')
      .populate('targetStore', 'name area network')
      .populate({ path: 'handoff', select: 'note declineReason status reason referralFee items total createdAt' })
      .sort({ createdAt: -1 })
      .limit(200);

    // how many times each reported store has been reported before - context for the decision
    const counts = new Map();
    const all = await NetworkReport.find({ targetStore: { $in: reports.map((r) => r.targetStore && r.targetStore._id).filter(Boolean) } }).select('targetStore').lean();
    all.forEach((r) => counts.set(String(r.targetStore), (counts.get(String(r.targetStore)) || 0) + 1));

    return res.json(
      reports.map((r) => ({
        id: r._id,
        type: r.type,
        details: r.details,
        status: r.status,
        action: r.action,
        adminNote: r.adminNote,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
        reporter: r.reporterStore ? { id: r.reporterStore._id, name: r.reporterStore.name, area: r.reporterStore.area } : null,
        target: r.targetStore
          ? { id: r.targetStore._id, name: r.targetStore.name, area: r.targetStore.area, network: networkOf(r.targetStore), totalReports: counts.get(String(r.targetStore._id)) || 1 }
          : null,
        handoff: r.handoff
          ? { id: r.handoff._id, status: r.handoff.status, reason: r.handoff.reason, note: r.handoff.note, declineReason: r.handoff.declineReason, referralFee: r.handoff.referralFee, total: r.handoff.total, items: (r.handoff.items || []).map((i) => `${i.qty} × ${i.name}`), createdAt: r.handoff.createdAt }
          : null,
      }))
    );
  } catch (err) {
    return fail500(res, err);
  }
};

// POST /api/admin/network/reports/:id/resolve   body: { action: dismiss|warn|mute|remove, days, note }
exports.resolveReport = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid id.' });
    const { action } = req.body;
    if (!NetworkReport.REPORT_ACTIONS.includes(action)) return res.status(400).json({ message: 'Choose what to do.' });

    const report = await NetworkReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    if (report.status !== 'open') return res.status(409).json({ message: 'This report was already resolved.' });

    const adminNote = note(req.body.note);
    const target = await Store.findById(report.targetStore).populate('owner', 'name');
    if (action !== 'dismiss') {
      if (!target) return res.status(404).json({ message: 'The reported store no longer exists.' });
      const err = await applyAction(target, action, { days: req.body.days, adminNote });
      if (err) return res.status(400).json({ message: err });
      tellOwner(target, action, adminNote);
      audit(req, target, action, `Report: ${report.type}. ${adminNote}`);
    }

    report.status = action === 'dismiss' ? 'dismissed' : 'actioned';
    report.action = action;
    report.adminNote = adminNote;
    report.resolvedAt = new Date();
    await report.save();

    const reporter = await Store.findById(report.reporterStore).select('owner');
    if (reporter && reporter.owner) {
      notify(reporter.owner, { type: 'network', title: 'Your report was reviewed', message: action === 'dismiss' ? 'The admin reviewed it and took no action.' : 'The admin reviewed it and took action. Thank you for reporting.', link: '/network' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return fail500(res, err);
  }
};

// GET /api/admin/network/stores
exports.listStores = async (req, res) => {
  try {
    const stores = await Store.find({ $or: [{ 'network.joined': true }, { 'network.status': { $ne: 'active' } }, { 'network.warnings': { $gt: 0 } }] }).select('name area network status owner').populate('owner', 'name email');
    const ids = stores.map((s) => s._id);
    const [openReports, trust, handoffs] = await Promise.all([
      NetworkReport.find({ targetStore: { $in: ids }, status: 'open' }).select('targetStore').lean(),
      trustOf(ids),
      Handoff.find({ status: 'completed', $or: [{ fromStore: { $in: ids } }, { toStore: { $in: ids } }] }).select('fromStore toStore').lean(),
    ]);
    const open = new Map();
    openReports.forEach((r) => open.set(String(r.targetStore), (open.get(String(r.targetStore)) || 0) + 1));
    const done = new Map();
    handoffs.forEach((h) => [h.fromStore, h.toStore].forEach((id) => done.set(String(id), (done.get(String(id)) || 0) + 1)));

    return res.json(
      stores
        .map((s) => ({
          id: s._id,
          name: s.name,
          area: s.area,
          storeStatus: s.status,
          owner: s.owner ? { name: s.owner.name, email: s.owner.email } : null,
          network: { ...networkOf(s), joinedAt: s.network.joinedAt },
          openReports: open.get(String(s._id)) || 0,
          completedHandoffs: done.get(String(s._id)) || 0,
          trust: trustFor(trust, s._id),
        }))
        .sort((a, b) => b.openReports - a.openReports || a.name.localeCompare(b.name))
    );
  } catch (err) {
    return fail500(res, err);
  }
};

// POST /api/admin/network/stores/:id/status   body: { action: warn|mute|unmute|remove|restore, days, note }
exports.setStoreStatus = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid id.' });
    const { action } = req.body;
    if (!['warn', 'mute', 'unmute', 'remove', 'restore'].includes(action)) return res.status(400).json({ message: 'Choose what to do.' });
    const store = await Store.findById(req.params.id).populate('owner', 'name');
    if (!store) return res.status(404).json({ message: 'Store not found.' });

    const adminNote = note(req.body.note);
    const err = await applyAction(store, action, { days: req.body.days, adminNote });
    if (err) return res.status(400).json({ message: err });
    tellOwner(store, action, adminNote);
    audit(req, store, action, adminNote);
    return res.json({ ok: true });
  } catch (err) {
    return fail500(res, err);
  }
};
