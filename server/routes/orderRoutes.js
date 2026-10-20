const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const validateId = require('../middleware/validateId');
const { create, mine, markReceived, cancel, receipt } = require('../controllers/orderController');
const { customerAccept, customerDecline } = require('../controllers/handoffController');

router.use(requireAuth, requireRole('customer'));

router.post('/', create);
router.get('/mine', mine);
router.get('/:id/receipt', validateId('id'), receipt);
router.patch('/:id/received', validateId('id'), markReceived);
router.patch('/:id/cancel', validateId('id'), cancel);
router.post('/:id/handoff/accept', validateId('id'), customerAccept);
router.post('/:id/handoff/decline', validateId('id'), customerDecline);

module.exports = router;
