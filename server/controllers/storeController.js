const Store = require('../models/Store');
const { saveImage, deleteMedia } = require('../utils/media');
const { normalizeArea, networkOf } = require('../utils/network');
const { parseMoney, MAX_DELIVERY_FEE, MAX_ORDER_AMOUNT } = require('../utils/delivery');

const MAX_GALLERY = 6;
// Preset accent colors the owner can pick from (keeps the UI readable).
const ACCENT_COLORS = ['', '#3457c9', '#0e8f6e', '#d9480f', '#c2255c', '#7a2ea0', '#0b7285', '#e8590c', '#364fc7'];

const shapeStoreCustomization = (store) => ({
  id: store._id,
  name: store.name,
  status: store.status,
  address: store.address,
  phone: store.phone,
  description: store.description,
  openingHours: store.openingHours,
  area: store.area || '',
  deliveryFee: store.deliveryFee || 0,
  minOrder: store.minOrder || 0,
  freeDeliveryOver: store.freeDeliveryOver || 0,
  accentColor: store.accentColor,
  logo: store.logo ? String(store.logo) : null,
  cover: store.cover ? String(store.cover) : null,
  gallery: (store.gallery || []).map(String),
});

// POST /api/store/appeal   (owner of a banned store)
exports.appeal = async (req, res) => {
  try {
    const message = String(req.body.message || '').trim();
    if (message.length < 10) {
      return res.status(400).json({ message: 'Please explain your appeal in at least a few words.' });
    }
    if (message.length > 1000) {
      return res.status(400).json({ message: 'Appeal is too long (max 1000 characters).' });
    }

    const store = await Store.findById(req.currentUser.storeId);
    if (!store || store.status !== 'banned') {
      return res.status(400).json({ message: 'Only banned stores can send an appeal.' });
    }
    if (store.appeal && store.appeal.status === 'pending') {
      return res.status(409).json({ message: 'You already have an appeal waiting for review.' });
    }

    store.appeal = {
      status: 'pending',
      message,
      submittedAt: new Date(),
      resolvedAt: null,
      adminNote: '',
    };
    await store.save();

    return res.json({ message: 'Appeal sent. An admin will review it.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

// PATCH /api/store/profile   (owner of an active store)
exports.updateProfile = async (req, res) => {
  try {
    const { address, phone, description, openingHours, accentColor, deliveryFee, minOrder, freeDeliveryOver, area } = req.body;
    const store = req.currentStore;

    // Validate the money fields first so a bad value changes nothing at all.
    const money = {};
    for (const [key, raw, label, max] of [
      ['deliveryFee', deliveryFee, 'Delivery fee', MAX_DELIVERY_FEE],
      ['minOrder', minOrder, 'Minimum order', MAX_ORDER_AMOUNT],
      ['freeDeliveryOver', freeDeliveryOver, 'Free delivery amount', MAX_ORDER_AMOUNT],
    ]) {
      if (raw === undefined) continue;
      const r = parseMoney(raw, label, max);
      if (r.error) return res.status(400).json({ message: r.error });
      money[key] = r.value;
    }
    const nextFee = money.deliveryFee ?? store.deliveryFee ?? 0;
    const nextFree = money.freeDeliveryOver ?? store.freeDeliveryOver ?? 0;
    if (nextFree > 0 && nextFee === 0) {
      return res.status(400).json({ message: 'Set a delivery fee first, or leave "free delivery over" empty.' });
    }
    Object.assign(store, money);

    if (area !== undefined) {
      const nextArea = String(area).trim().slice(0, 60);
      const nextKey = normalizeArea(nextArea);
      if (!nextKey && networkOf(store).joined) {
        return res.status(400).json({ message: 'Your area is needed while you are in the store network.' });
      }
      store.area = nextArea;
      store.areaKey = nextKey;
    }

    if (address !== undefined) store.address = String(address).trim().slice(0, 200);
    if (phone !== undefined) store.phone = String(phone).trim().slice(0, 30);
    if (description !== undefined) store.description = String(description).trim().slice(0, 300);
    if (openingHours !== undefined) store.openingHours = String(openingHours).trim().slice(0, 120);
    if (accentColor !== undefined) {
      if (!ACCENT_COLORS.includes(String(accentColor))) {
        return res.status(400).json({ message: 'Please pick one of the available colors.' });
      }
      store.accentColor = String(accentColor);
    }
    await store.save();

    return res.json(shapeStoreCustomization(store));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

// POST /api/store/logo | /api/store/cover   (multipart "image")
function setSingle(field, kind) {
  return async (req, res) => {
    try {
      const store = req.currentStore;
      const { media, error } = await saveImage(req.file, kind, req.userId);
      if (error) return res.status(400).json({ message: error });
      const old = store[field];
      store[field] = media._id;
      await store.save();
      if (old) await deleteMedia(old);
      return res.json(shapeStoreCustomization(store));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Something went wrong.' });
    }
  };
}

function removeSingle(field) {
  return async (req, res) => {
    try {
      const store = req.currentStore;
      const old = store[field];
      store[field] = null;
      await store.save();
      if (old) await deleteMedia(old);
      return res.json(shapeStoreCustomization(store));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Something went wrong.' });
    }
  };
}

exports.setLogo = setSingle('logo', 'store_logo');
exports.setCover = setSingle('cover', 'store_cover');
exports.removeLogo = removeSingle('logo');
exports.removeCover = removeSingle('cover');

// POST /api/store/gallery   (adds one photo, up to MAX_GALLERY)
exports.addGalleryPhoto = async (req, res) => {
  try {
    const store = req.currentStore;
    if ((store.gallery || []).length >= MAX_GALLERY) {
      return res.status(400).json({ message: `You can show up to ${MAX_GALLERY} photos. Remove one first.` });
    }
    const { media, error } = await saveImage(req.file, 'store_gallery', req.userId);
    if (error) return res.status(400).json({ message: error });
    store.gallery.push(media._id);
    await store.save();
    return res.json(shapeStoreCustomization(store));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

// DELETE /api/store/gallery/:mediaId
exports.removeGalleryPhoto = async (req, res) => {
  try {
    const store = req.currentStore;
    const id = String(req.params.mediaId);
    if (!(store.gallery || []).map(String).includes(id)) {
      return res.status(404).json({ message: 'Photo not found.' });
    }
    store.gallery = store.gallery.filter((g) => String(g) !== id);
    await store.save();
    await deleteMedia(id);
    return res.json(shapeStoreCustomization(store));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

exports.ACCENT_COLORS = ACCENT_COLORS;
