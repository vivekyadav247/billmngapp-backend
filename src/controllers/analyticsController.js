const mongoose = require('mongoose');
const Bill = require('../models/Bill');
const BillItem = require('../models/BillItem');
const SalaryEntry = require('../models/SalaryEntry');
const User = require('../models/User');

const getPeriodBoundaries = () => {
  const now = new Date();

  const dailyStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dailyEnd = new Date(dailyStart);
  dailyEnd.setDate(dailyEnd.getDate() + 1);

  const weekDay = dailyStart.getDay();
  const daysFromMonday = weekDay === 0 ? 6 : weekDay - 1;
  const weeklyStart = new Date(dailyStart);
  weeklyStart.setDate(weeklyStart.getDate() - daysFromMonday);
  const weeklyEnd = new Date(weeklyStart);
  weeklyEnd.setDate(weeklyEnd.getDate() + 7);

  const monthlyStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const yearlyStart = new Date(now.getFullYear(), 0, 1);
  const yearlyEnd = new Date(now.getFullYear() + 1, 0, 1);

  return {
    daily: { start: dailyStart, end: dailyEnd },
    weekly: { start: weeklyStart, end: weeklyEnd },
    monthly: { start: monthlyStart, end: monthlyEnd },
    yearly: { start: yearlyStart, end: yearlyEnd },
  };
};

const aggregateSales = async (shopId, start, end) => {
  const result = await Bill.aggregate([
    {
      $match: {
        shop: new mongoose.Types.ObjectId(shopId),
        createdAt: {
          $gte: start,
          $lt: end,
        },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$total' },
        billCount: { $sum: 1 },
      },
    },
  ]);

  return result[0] || { totalRevenue: 0, billCount: 0 };
};

const getSalesSummary = async (req, res) => {
  if (!req.user.shop) {
    return res.status(400).json({ message: 'User is not linked with any shop' });
  }

  const periods = getPeriodBoundaries();
  const [daily, weekly, monthly, yearly] = await Promise.all([
    aggregateSales(req.user.shop, periods.daily.start, periods.daily.end),
    aggregateSales(req.user.shop, periods.weekly.start, periods.weekly.end),
    aggregateSales(req.user.shop, periods.monthly.start, periods.monthly.end),
    aggregateSales(req.user.shop, periods.yearly.start, periods.yearly.end),
  ]);

  const chartRaw = [];
  for (let i = 6; i >= 0; i -= 1) {
    const start = new Date(periods.daily.start);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    // eslint-disable-next-line no-await-in-loop
    const dayData = await aggregateSales(req.user.shop, start, end);

    chartRaw.push({
      date: start.toISOString().slice(0, 10),
      revenue: dayData.totalRevenue,
      billCount: dayData.billCount,
    });
  }

  return res.status(200).json({
    cards: [
      {
        key: 'daily',
        title: 'Today',
        totalRevenue: daily.totalRevenue,
        billCount: daily.billCount,
      },
      {
        key: 'weekly',
        title: 'This Week',
        totalRevenue: weekly.totalRevenue,
        billCount: weekly.billCount,
      },
      {
        key: 'monthly',
        title: 'This Month',
        totalRevenue: monthly.totalRevenue,
        billCount: monthly.billCount,
      },
      {
        key: 'yearly',
        title: 'This Year',
        totalRevenue: yearly.totalRevenue,
        billCount: yearly.billCount,
      },
    ],
    chart: {
      labels: chartRaw.map((entry) => entry.date.slice(5)),
      datasets: [{ data: chartRaw.map((entry) => entry.revenue) }],
      raw: chartRaw,
    },
  });
};

const getRevenueBreakdown = async (req, res) => {
  if (!req.user.shop) {
    return res.status(400).json({ message: 'User is not linked with any shop' });
  }

  const periods = getPeriodBoundaries();
  const start = req.query.startDate ? new Date(req.query.startDate) : periods.monthly.start;
  const end = req.query.endDate ? new Date(req.query.endDate) : periods.monthly.end;

  const result = await Bill.aggregate([
    {
      $match: {
        shop: new mongoose.Types.ObjectId(req.user.shop),
        createdAt: {
          $gte: start,
          $lt: end,
        },
      },
    },
    {
      $group: {
        _id: null,
        cash: { $sum: '$paymentSplit.cash' },
        online: { $sum: '$paymentSplit.online' },
        udhar: { $sum: '$paymentSplit.udhar' },
        total: { $sum: '$total' },
      },
    },
  ]);

  const totals = result[0] || { cash: 0, online: 0, udhar: 0, total: 0 };

  return res.status(200).json({
    labels: ['Cash', 'Online', 'Udhar'],
    datasets: [{ data: [totals.cash, totals.online, totals.udhar] }],
    totals,
  });
};

const getTopSellingItems = async (req, res) => {
  if (!req.user.shop) {
    return res.status(400).json({ message: 'User is not linked with any shop' });
  }

  const periods = getPeriodBoundaries();
  const start = req.query.startDate ? new Date(req.query.startDate) : periods.monthly.start;
  const end = req.query.endDate ? new Date(req.query.endDate) : periods.monthly.end;
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 25);

  const items = await BillItem.aggregate([
    {
      $match: {
        shop: new mongoose.Types.ObjectId(req.user.shop),
        createdAt: {
          $gte: start,
          $lt: end,
        },
      },
    },
    {
      $group: {
        _id: '$name',
        quantitySold: { $sum: '$qty' },
        revenue: { $sum: '$subtotal' },
      },
    },
    {
      $sort: {
        quantitySold: -1,
      },
    },
    {
      $limit: limit,
    },
  ]);

  const normalized = items.map((item) => ({
    name: item._id,
    quantitySold: item.quantitySold,
    revenue: item.revenue,
  }));

  return res.status(200).json({
    labels: normalized.map((item) => item.name),
    datasets: [{ data: normalized.map((item) => item.quantitySold) }],
    items: normalized,
  });
};

const getSalarySummary = async (req, res) => {
  if (!req.user.shop) {
    return res.status(400).json({ message: 'User is not linked with any shop' });
  }

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1);

  const [employees, manualEntries, labourEntries] = await Promise.all([
    User.find({ shop: req.user.shop, role: 'employee', isActive: true }).select('salaryDue'),
    SalaryEntry.aggregate([
      {
        $match: {
          shop: new mongoose.Types.ObjectId(req.user.shop),
          type: 'manual',
          createdAt: { $gte: yearStart, $lt: yearEnd },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    SalaryEntry.aggregate([
      {
        $match: {
          shop: new mongoose.Types.ObjectId(req.user.shop),
          type: 'labour',
          createdAt: { $gte: yearStart, $lt: yearEnd },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  const salaryDue = employees.reduce((sum, emp) => sum + (emp.salaryDue || 0), 0);
  const manualSalary = manualEntries[0]?.total || 0;
  const labourAccrual = labourEntries[0]?.total || 0;
  const totalExpense = manualSalary + labourAccrual;

  return res.status(200).json({
    salaryDue,
    labourAccrual,
    manualSalary,
    totalExpense,
  });
};

module.exports = {
  getSalesSummary,
  getRevenueBreakdown,
  getTopSellingItems,
  getSalarySummary,
};
