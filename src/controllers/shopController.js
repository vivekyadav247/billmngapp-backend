const Shop = require('../models/Shop');
const User = require('../models/User');

const generateShopCode = async () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const maxAttempts = 12;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let candidate = '';
    for (let index = 0; index < 5; index += 1) {
      candidate += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    const existingShop = await Shop.findOne({ shopCode: candidate }).select('_id');
    if (!existingShop) {
      return candidate;
    }
  }

  throw new Error('Unable to generate unique shop code. Please retry.');
};

const serializeShop = (shopDoc) => ({
  id: shopDoc.shopCode,
  shopCode: shopDoc.shopCode,
  name: shopDoc.name,
  type: shopDoc.type,
  gstNumber: shopDoc.gstNumber,
  owner: shopDoc.owner
    ? {
        id: shopDoc.owner._id || shopDoc.owner,
        name: shopDoc.owner.name || null,
        email: shopDoc.owner.email || null,
        phoneNumber: shopDoc.owner.phoneNumber || null,
      }
    : null,
  createdAt: shopDoc.createdAt,
});

const registerShop = async (req, res) => {
  const { name, type, gstNumber, ownerMobile } = req.body;
  const normalizedName = String(name || '').trim();
  const normalizedType = String(type || '').trim();
  const normalizedGstNumber = String(gstNumber || '').toUpperCase().trim();
  const normalizedOwnerMobile = String(ownerMobile || '').trim();

  if (!normalizedName || !normalizedType || !normalizedGstNumber || !normalizedOwnerMobile) {
    return res.status(400).json({
      message: 'name, type, gstNumber and ownerMobile are required',
    });
  }

  if (req.user.role !== 'owner') {
    return res.status(403).json({ message: 'Only shop owners can register shops' });
  }

  if (req.user.shop) {
    return res.status(400).json({ message: 'Owner already has a registered shop' });
  }

  const existingShop = await Shop.findOne({ gstNumber: normalizedGstNumber }).select('_id');
  if (existingShop) {
    return res.status(409).json({ message: 'A shop with this GST number already exists' });
  }

  const shopCode = await generateShopCode();
  const shop = await Shop.create({
    shopCode,
    name: normalizedName,
    type: normalizedType,
    gstNumber: normalizedGstNumber,
    owner: req.user._id,
  });

  await User.findByIdAndUpdate(req.user._id, {
    shop: shop._id,
    phoneNumber: normalizedOwnerMobile,
  });

  const hydratedShop = await Shop.findById(shop._id).populate('owner', '_id name email phoneNumber');

  return res.status(201).json({
    message: 'Shop registered successfully',
    shop: serializeShop(hydratedShop),
  });
};

const getMyShop = async (req, res) => {
  if (!req.user.shop) {
    return res.status(404).json({ message: 'No shop linked to this user' });
  }

  const shop = await Shop.findById(req.user.shop).populate('owner', '_id name email phoneNumber');

  if (!shop) {
    return res.status(404).json({ message: 'Shop not found' });
  }

  return res.status(200).json({ shop: serializeShop(shop) });
};

const updateMyShop = async (req, res) => {
  if (!req.user.shop) {
    return res.status(404).json({ message: 'No shop linked to this user' });
  }

  const { name, type, ownerMobile } = req.body;
  const shop = await Shop.findById(req.user.shop);

  if (!shop) {
    return res.status(404).json({ message: 'Shop not found' });
  }

  if (name) shop.name = String(name).trim();
  if (type) shop.type = String(type).trim();

  await shop.save();
  if (ownerMobile !== undefined) {
    const normalizedOwnerMobile = String(ownerMobile || '').trim();
    await User.findByIdAndUpdate(req.user._id, { phoneNumber: normalizedOwnerMobile || null });
  }

  const hydratedShop = await Shop.findById(shop._id).populate('owner', '_id name email phoneNumber');

  return res.status(200).json({
    message: 'Shop updated successfully',
    shop: serializeShop(hydratedShop),
  });
};

module.exports = {
  registerShop,
  getMyShop,
  updateMyShop,
};
