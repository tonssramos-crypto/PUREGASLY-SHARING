const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const requireStoreAccess = require('../middleware/storeAccess');
const requireNetwork = require('../middleware/networkGate');
const validateId = require('../middleware/validateId');
const net = require('../controllers/networkController');
const h = require('../controllers/handoffController');

router.use(requireAuth);

// Anyone on the store team who can see orders or analytics can see where the store stands.
const anyTeam = requireStoreAccess(['manage_orders', 'view_analytics']);
router.get('/status', anyTeam, net.status);
router.get('/areas', anyTeam, net.areas);
router.post('/join', anyTeam, net.join); // owner-only is enforced inside
router.post('/leave', anyTeam, net.leave);

// Price benchmark, trends and demand: view_analytics
const analytics = [requireStoreAccess('view_analytics'), requireNetwork()];
router.get('/benchmark', analytics, net.benchmark);
router.get('/trends', analytics, net.trends);
router.get('/demand', analytics, net.demand);

// Handoffs: manage_orders. Sending/accepting needs a store that isn't muted.
const orders = requireStoreAccess('manage_orders');
router.get('/handoffs', orders, requireNetwork(), h.list);
router.get('/handoffs/candidates', orders, requireNetwork({ write: true }), h.candidates);
router.post('/handoffs', orders, requireNetwork({ write: true }), h.create);
router.post('/handoffs/:id/accept', validateId('id'), orders, requireNetwork({ write: true }), h.accept);
router.post('/handoffs/:id/decline', validateId('id'), orders, requireNetwork(), h.decline);
router.post('/handoffs/:id/cancel', validateId('id'), orders, requireNetwork(), h.cancel);
router.post('/handoffs/:id/fee-received', validateId('id'), orders, requireNetwork(), h.feeReceived);
router.post('/handoffs/:id/rate', validateId('id'), orders, requireNetwork(), h.rate);
router.post('/reports', orders, requireNetwork(), h.report);

module.exports = router;
