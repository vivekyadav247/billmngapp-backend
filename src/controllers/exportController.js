const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const Bill = require('../models/Bill');
const BillItem = require('../models/BillItem');
const InventoryItem = require('../models/InventoryItem');
const User = require('../models/User');
const UdharEntry = require('../models/UdharEntry');
const { format } = require('../utils/dateUtils');

const ensureShop = (req) => {
  if (!req.user.shop) {
    const error = new Error('User is not linked with any shop');
    error.statusCode = 400;
    throw error;
  }
};

const sendWorkbook = async (res, workbook, filename) => {
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(buffer);
};

const billRangeQuery = (shopId, start, end) => {
  const filter = { shop: shopId };
  if (start || end) {
    filter.createdAt = {};
    if (start) filter.createdAt.$gte = start;
    if (end) filter.createdAt.$lt = end;
  }
  return filter;
};

const buildBillDetailsSheet = async ({ shopId, start, end, sheetTitle }) => {
  const bills = await Bill.find(billRangeQuery(shopId, start, end))
    .populate('items')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });

  const billIds = bills.map((b) => b._id);
  const udharEntries = await UdharEntry.find({ bill: { $in: billIds } }).lean();
  const udharMap = {};
  udharEntries.forEach((e) => {
    udharMap[e.bill.toString()] = e;
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetTitle);

  sheet.columns = [
    { header: 'Bill Number', key: 'billNumber', width: 16 },
    { header: 'Date', key: 'date', width: 18 },
    { header: 'Customer Name', key: 'customerName', width: 18 },
    { header: 'Customer Mobile', key: 'customerMobile', width: 16 },
    { header: 'Billed By', key: 'billedBy', width: 16 },
    { header: 'Payment Mode', key: 'paymentMode', width: 14 },
    { header: 'Cash', key: 'cash', width: 10 },
    { header: 'Online', key: 'online', width: 10 },
    { header: 'Udhar', key: 'udhar', width: 10 },
    { header: 'Pending Udhar', key: 'pendingUdhar', width: 14 },
    { header: 'Udhar Payments Count', key: 'udharPaymentsCount', width: 14 },
    { header: 'Udhar Payments Detail', key: 'udharPaymentsDetail', width: 30 },
    { header: 'Items', key: 'items', width: 60 },
    { header: 'Total Amount', key: 'total', width: 14 },
  ];

  let totalRevenue = 0;
  bills.forEach((bill) => {
    const udhar = udharMap[bill._id.toString()];
    const paymentsDetail = (udhar?.payments || [])
      .map((p) => `${format(p.createdAt)} | ${p.mode} | ${p.amount}`)
      .join('\n');

    const itemsString = (bill.items || [])
      .map(
        (item) =>
          `${item.name} | qty: ${item.qty} | rate: ${item.rate} | fare: ${item.fare || 0} | subtotal: ${item.subtotal}`,
      )
      .join('\n');

    totalRevenue += bill.total;

    sheet.addRow({
      billNumber: bill.billNumber,
      date: format(bill.createdAt),
      customerName: bill.customerName || '',
      customerMobile: bill.customerMobile || '',
      billedBy: bill.createdBy?.name || 'N/A',
      paymentMode: bill.paymentMode,
      cash: bill.paymentSplit.cash,
      online: bill.paymentSplit.online,
      udhar: bill.paymentSplit.udhar,
      pendingUdhar: udhar?.pendingAmount || 0,
      udharPaymentsCount: udhar?.payments?.length || 0,
      udharPaymentsDetail: paymentsDetail,
      items: itemsString,
      total: bill.total,
    });
  });

  // summary row
  sheet.addRow({});
  sheet.addRow({ billNumber: 'Total Bills', date: bills.length, total: totalRevenue });

  return workbook;
};

const exportBills = async (req, res) => {
  try {
    ensureShop(req);
    const bills = await Bill.find({ shop: req.user.shop })
      .populate('items')
      .sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Bills');

    sheet.columns = [
      { header: 'Bill ID', key: 'id', width: 24 },
      { header: 'Bill Number', key: 'billNumber', width: 18 },
      { header: 'Date', key: 'date', width: 16 },
      { header: 'Customer Mobile', key: 'customerMobile', width: 16 },
      { header: 'Payment Mode', key: 'paymentMode', width: 14 },
      { header: 'Cash', key: 'cash', width: 10 },
      { header: 'Online', key: 'online', width: 10 },
      { header: 'Udhar', key: 'udhar', width: 10 },
      { header: 'Items', key: 'items', width: 60 },
      { header: 'Total Amount', key: 'total', width: 14 },
    ];

    bills.forEach((bill) => {
      const itemsString = (bill.items || [])
        .map((item) => `${item.name} | qty: ${item.qty} | rate: ${item.rate} | fare: ${item.fare || 0} | subtotal: ${item.subtotal}`)
        .join('\n');

      sheet.addRow({
        id: bill._id.toString(),
        billNumber: bill.billNumber,
        date: format(bill.createdAt),
        customerMobile: bill.customerMobile || '',
        paymentMode: bill.paymentMode,
        cash: bill.paymentSplit.cash,
        online: bill.paymentSplit.online,
        udhar: bill.paymentSplit.udhar,
        items: itemsString,
        total: bill.total,
      });
    });

    return sendWorkbook(res, workbook, `bills-${format(new Date())}.xlsx`);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message || 'Failed to export bills' });
  }
};

const exportInventoryPerformance = async (req, res) => {
  try {
    ensureShop(req);
    const inventoryItems = await InventoryItem.find({ shopId: req.user.shop });
    const ids = inventoryItems.map((item) => item._id);

    const sales = await BillItem.aggregate([
      { $match: { shop: new mongoose.Types.ObjectId(req.user.shop), inventoryItem: { $in: ids } } },
      {
        $group: {
          _id: '$inventoryItem',
          unitsSold: { $sum: '$qty' },
          revenue: { $sum: '$subtotal' },
        },
      },
    ]);

    const salesMap = {};
    sales.forEach((row) => {
      salesMap[row._id.toString()] = row;
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inventory Performance');
    sheet.columns = [
      { header: 'Item Name', key: 'itemName', width: 24 },
      { header: 'Total Units Sold', key: 'unitsSold', width: 16 },
      { header: 'Remaining Stock', key: 'remaining', width: 16 },
      { header: 'Total Revenue', key: 'revenue', width: 16 },
      { header: 'Total Profit', key: 'profit', width: 16 },
    ];

    inventoryItems.forEach((item) => {
      const sale = salesMap[item._id.toString()] || { unitsSold: 0, revenue: 0 };
      const profitPerUnit = item.finalSellingPricePerUnit - item.costPerUnit;
      const totalProfit = profitPerUnit * sale.unitsSold;

      sheet.addRow({
        itemName: item.itemName,
        unitsSold: sale.unitsSold,
        remaining: item.totalStockUnits,
        revenue: sale.revenue,
        profit: Number(totalProfit.toFixed(2)),
      });
    });

    return sendWorkbook(res, workbook, `items-${format(new Date())}.xlsx`);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message || 'Failed to export items' });
  }
};

const exportBillsCurrentMonth = async (req, res) => {
  try {
    ensureShop(req);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const workbook = await buildBillDetailsSheet({
      shopId: req.user.shop,
      start,
      end,
      sheetTitle: 'This Month Bills',
    });
    return sendWorkbook(res, workbook, `bills-month-${start.getMonth() + 1}-${start.getFullYear()}.xlsx`);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message || 'Failed to export current month' });
  }
};

const exportBillsPreviousMonth = async (req, res) => {
  try {
    ensureShop(req);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const workbook = await buildBillDetailsSheet({
      shopId: req.user.shop,
      start,
      end,
      sheetTitle: 'Previous Month Bills',
    });
    return sendWorkbook(res, workbook, `bills-prev-month-${start.getMonth() + 1}-${start.getFullYear()}.xlsx`);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message || 'Failed to export previous month' });
  }
};

const exportBillsYear = async (req, res) => {
  try {
    ensureShop(req);
    const year = Number(req.query.year) || new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    const workbook = await buildBillDetailsSheet({
      shopId: req.user.shop,
      start,
      end,
      sheetTitle: `Year ${year} Bills`,
    });
    return sendWorkbook(res, workbook, `bills-year-${year}.xlsx`);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message || 'Failed to export year' });
  }
};

module.exports = {
  exportBills,
  exportBillsCurrentMonth,
  exportBillsPreviousMonth,
  exportBillsYear,
  exportInventoryPerformance,
};
