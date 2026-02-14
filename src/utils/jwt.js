const jwt = require('jsonwebtoken');

const signAccessToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  const resolvedShopId = user.shop
    ? user.shop._id
      ? user.shop._id.toString()
      : user.shop.toString()
    : null;

  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      shopId: resolvedShopId,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  );
};

module.exports = {
  signAccessToken,
};
