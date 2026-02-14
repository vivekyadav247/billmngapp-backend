const Shop = require('../models/Shop');

const SHOP_CODE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const generateUniqueShopCode = async () => {
  const maxAttempts = 12;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let candidate = '';
    for (let index = 0; index < 5; index += 1) {
      candidate += SHOP_CODE_CHARACTERS.charAt(
        Math.floor(Math.random() * SHOP_CODE_CHARACTERS.length),
      );
    }

    const existingShop = await Shop.findOne({ shopCode: candidate }).select('_id');
    if (!existingShop) {
      return candidate;
    }
  }

  throw new Error('Unable to generate unique shop code. Please retry.');
};

const ensureShopCode = async (shopDoc) => {
  if (!shopDoc) {
    return null;
  }

  if (shopDoc.shopCode) {
    return shopDoc;
  }

  const generatedCode = await generateUniqueShopCode();
  shopDoc.shopCode = generatedCode;
  await shopDoc.save();
  return shopDoc;
};

module.exports = {
  generateUniqueShopCode,
  ensureShopCode,
};
