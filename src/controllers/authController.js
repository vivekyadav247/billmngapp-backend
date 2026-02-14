const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const Shop = require('../models/Shop');
const User = require('../models/User');
const { signAccessToken } = require('../utils/jwt');

const oauthClient = new OAuth2Client();

const getAllowedGoogleAudiences = () => {
  const rawAudienceValues = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_ALLOWED_CLIENT_IDS,
  ];

  const parsedAudiences = rawAudienceValues
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(parsedAudiences)];
};

const serializeUser = (userDoc) => ({
  id: userDoc._id,
  name: userDoc.name,
  email: userDoc.email,
  phoneNumber: userDoc.phoneNumber || null,
  role: userDoc.role,
  employeeId: userDoc.employeeId || null,
  shop: userDoc.shop
    ? {
        id: userDoc.shop.shopCode || userDoc.shop._id || userDoc.shop,
        shopCode: userDoc.shop.shopCode || null,
        name: userDoc.shop.name,
        type: userDoc.shop.type,
      }
    : null,
});

const issueAuthResponse = async (userId, message) => {
  const hydratedUser = await User.findById(userId).populate('shop');
  const token = signAccessToken(hydratedUser);

  return {
    message,
    token,
    user: serializeUser(hydratedUser),
  };
};

const upsertOwnerFromGoogle = async ({ email, googleId, name }) => {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const normalizedName = String(name || normalizedEmail.split('@')[0] || 'Owner').trim();

  const identityFilter = {
    $or: [{ email: normalizedEmail }, { googleId }],
  };

  let user = await User.findOne(identityFilter);

  if (!user) {
    user = await User.create({
      googleId,
      email: normalizedEmail,
      name: normalizedName,
      role: 'owner',
    });
    return user;
  }

  if (user.role !== 'owner') {
    const error = new Error('This account is registered as employee. Please use employee login.');
    error.statusCode = 403;
    throw error;
  }

  user.googleId = googleId;
  user.name = normalizedName || user.name;
  await user.save();

  return user;
};

const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;
    const allowedAudiences = getAllowedGoogleAudiences();

    if (!allowedAudiences.length) {
      return res.status(500).json({
        message:
          'Google OAuth is not configured. Set GOOGLE_CLIENT_ID (Web client ID) in backend environment.',
      });
    }

    if (!idToken) {
      return res.status(400).json({ message: 'idToken is required' });
    }

    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: allowedAudiences,
    });

    const payload = ticket.getPayload();
    const email = String(payload?.email || '').toLowerCase().trim();
    const googleId = String(payload?.sub || '').trim();
    const tokenAudience = String(payload?.aud || '').trim();

    if (!email || !googleId) {
      return res.status(401).json({ message: 'Google account email not found' });
    }

    if (tokenAudience && !allowedAudiences.includes(tokenAudience)) {
      return res.status(401).json({
        message: 'Google authentication failed',
        details: `Invalid token audience: ${tokenAudience}`,
      });
    }

    const owner = await upsertOwnerFromGoogle({
      email,
      googleId,
      name: payload?.name || email.split('@')[0],
    });

    const authResponse = await issueAuthResponse(owner._id, 'Authentication successful');
    return res.status(200).json(authResponse);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    const details = String(error.message || 'Unknown error');
    const audienceHint = details.includes('Wrong recipient') || details.includes('audience')
      ? ' Ensure backend GOOGLE_CLIENT_ID matches the app Web client ID.'
      : '';

    return res.status(401).json({
      message: 'Google authentication failed',
      details: `${details}${audienceHint}`,
    });
  }
};

const employeeLogin = async (req, res) => {
  const { shopId, employeeId, password } = req.body;
  const normalizedShopId = String(shopId || '').trim().toUpperCase();
  const normalizedEmployeeId = String(employeeId || '').trim().toUpperCase();
  const normalizedPassword = String(password || '');

  if (!normalizedShopId) {
    return res.status(400).json({ message: 'shopId is required' });
  }

  if (!normalizedEmployeeId) {
    return res.status(400).json({ message: 'employeeId is required' });
  }

  if (!normalizedPassword) {
    return res.status(400).json({ message: 'password is required' });
  }

  let shop = null;
  if (mongoose.Types.ObjectId.isValid(normalizedShopId)) {
    shop = await Shop.findById(normalizedShopId).select('_id');
  }

  if (!shop) {
    shop = await Shop.findOne({ shopCode: normalizedShopId }).select('_id');
  }

  if (!shop) {
    return res.status(401).json({ message: 'Invalid employee credentials' });
  }

  const employee = await User.findOne({
    role: 'employee',
    shop: shop._id,
    employeeId: normalizedEmployeeId,
    isActive: true,
  }).select('+passwordHash');

  if (!employee || !employee.passwordHash) {
    return res.status(401).json({ message: 'Invalid employee credentials' });
  }

  const passwordMatches = await bcrypt.compare(normalizedPassword, employee.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ message: 'Invalid employee credentials' });
  }

  const authResponse = await issueAuthResponse(employee._id, 'Employee login successful');
  return res.status(200).json(authResponse);
};

module.exports = {
  googleAuth,
  employeeLogin,
};
