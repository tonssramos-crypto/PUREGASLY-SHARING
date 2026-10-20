const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const requireActiveStore = require('../middleware/activeStore');
const validateId = require('../middleware/validateId');
const { singleImage } = require('../middleware/imageUpload');
const c = require('../controllers/storeController');
const { appeal, updateProfile } = c;

router.use(requireAuth, requireRole('owner'));

// Works while the store is banned (that's the whole point of it).
router.post('/appeal', appeal);

router.patch('/profile', requireActiveStore, updateProfile);

// Store customization - only while the store is approved.
router.post('/logo', requireActiveStore, singleImage, c.setLogo);
router.delete('/logo', requireActiveStore, c.removeLogo);
router.post('/cover', requireActiveStore, singleImage, c.setCover);
router.delete('/cover', requireActiveStore, c.removeCover);
router.post('/gallery', requireActiveStore, singleImage, c.addGalleryPhoto);
router.delete('/gallery/:mediaId', requireActiveStore, validateId('mediaId'), c.removeGalleryPhoto);

module.exports = router;
