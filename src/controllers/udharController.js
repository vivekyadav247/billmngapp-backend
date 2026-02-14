const UdharEntry = require('../models/UdharEntry');
const { roundToTwo } = require('../utils/billUtils');

const listUdharEntries = async (req, res) => {
  if (!req.user.shop) {
    return res.status(400).json({ message: 'User is not linked with any shop' });
  }

  const { customerMobile, status = 'PENDING', limit = 50 } = req.query;

  const filter = {
    shop: req.user.shop,
  };

  if (status) {
    filter.status = String(status).toUpperCase();
  }

  if (customerMobile) {
    filter.customerMobile = String(customerMobile).trim();
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const entries = await UdharEntry.find(filter)
    .populate('bill', 'billNumber total createdAt paymentSplit')
    .sort({ createdAt: -1 })
    .limit(safeLimit);

  const totalPending = entries.reduce((sum, entry) => sum + entry.pendingAmount, 0);

  return res.status(200).json({
    totalPending,
    entries,
  });
};

const getUdharByCustomer = async (req, res) => {
  if (!req.user.shop) {
    return res.status(400).json({ message: 'User is not linked with any shop' });
  }

  const customerMobile = String(req.params.customerMobile || '').trim();

  if (!customerMobile) {
    return res.status(400).json({ message: 'customerMobile path parameter is required' });
  }

  const entries = await UdharEntry.find({
    shop: req.user.shop,
    customerMobile,
    status: 'PENDING',
  })
    .populate('bill', 'billNumber total createdAt paymentSplit')
    .sort({ createdAt: -1 });

  const totalPending = entries.reduce((sum, entry) => sum + entry.pendingAmount, 0);

  return res.status(200).json({
    customerMobile,
    totalPending,
    entries,
  });
};

const getTotalPendingUdhar = async (req, res) => {
  if (!req.user.shop) {
    return res.status(400).json({ message: 'User is not linked with any shop' });
  }

  const result = await UdharEntry.aggregate([
    {
      $match: {
        shop: req.user.shop,
        status: 'PENDING',
      },
    },
    {
      $group: {
        _id: null,
        totalPending: { $sum: '$pendingAmount' },
        customers: { $addToSet: '$customerMobile' },
      },
    },
  ]);

  const summary = result[0] || { totalPending: 0, customers: [] };

  return res.status(200).json({
    totalPending: summary.totalPending,
    customerCount: summary.customers.length,
  });
};

const payUdharEntry = async (req, res) => {
  if (!req.user.shop) {
    return res.status(400).json({ message: 'User is not linked with any shop' });
  }

  const { amount, mode } = req.body;
  const paymentAmount = roundToTwo(Number(amount));
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return res.status(400).json({ message: 'amount must be greater than 0' });
  }
  if (!['cash', 'online'].includes(mode)) {
    return res.status(400).json({ message: 'mode must be cash or online' });
  }

  const entry = await UdharEntry.findOne({ _id: req.params.id, shop: req.user.shop, status: 'PENDING' });
  if (!entry) {
    return res.status(404).json({ message: 'Udhar entry not found or already settled' });
  }

  if (paymentAmount > entry.pendingAmount) {
    return res.status(400).json({ message: 'Payment exceeds pending amount' });
  }

  entry.pendingAmount = roundToTwo(entry.pendingAmount - paymentAmount);
  entry.settledAmount = roundToTwo((entry.settledAmount || 0) + paymentAmount);
  entry.payments.push({ amount: paymentAmount, mode, createdBy: req.user._id, createdAt: new Date() });
  if (entry.pendingAmount <= 0) {
    entry.status = 'SETTLED';
  }
  await entry.save();

  return res.status(200).json({
    message: 'Payment recorded',
    entry,
  });
};

module.exports = {
  listUdharEntries,
  getUdharByCustomer,
  getTotalPendingUdhar,
  payUdharEntry,
};
