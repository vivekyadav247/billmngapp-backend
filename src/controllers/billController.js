const Bill = require('../models/Bill');
const BillItem = require('../models/BillItem');
const InventoryItem = require('../models/InventoryItem');
const UdharEntry = require('../models/UdharEntry');
const {
  roundToTwo,
  validatePaymentSplit,
  generateBillNumber,
} = require('../utils/billUtils');

const formatBill = (billDoc) => ({
  id: billDoc._id,
  billNumber: billDoc.billNumber,
  total: billDoc.total,
  paymentMode: billDoc.paymentMode,
  paymentSplit: billDoc.paymentSplit,
  customerMobile: billDoc.customerMobile,
  customerName: billDoc.customerName,
  createdAt: billDoc.createdAt,
  items: (billDoc.items || []).map((item) => ({
    id: item._id,
    inventoryItem: item.inventoryItem,
    manualItem: item.manualItem,
    fare: item.fare,
    name: item.name,
    qty: item.qty,
    rate: item.rate,
    subtotal: item.subtotal,
  })),
});

const normalizeIncomingItems = async (items, shopId) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one billing item is required');
  }

  const inventoryItemIds = [...new Set(items.filter((item) => item.inventoryItemId).map((item) => item.inventoryItemId))];

  const inventoryMap = {};
  if (inventoryItemIds.length > 0) {
    const inventoryDocs = await InventoryItem.find({
      _id: { $in: inventoryItemIds },
      shopId: shopId,
    });
    inventoryDocs.forEach((doc) => {
      inventoryMap[doc._id.toString()] = doc;
    });
  }

  const normalized = [];
  const stockDeductions = {};

  items.forEach((rawItem, index) => {
    const isInventory = rawItem.inventoryItemId && rawItem.manualItem !== true;
    const isManual = !isInventory;
    const qty = Number(rawItem.qty);
    const fare = roundToTwo(Number(rawItem.fare || 0));

    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`Item ${index + 1}: qty must be greater than 0`);
    }

    if (isManual) {
      const name = String(rawItem.name || '').trim();
      const rate = Number(rawItem.rate);

      if (!name) {
        throw new Error(`Item ${index + 1}: name is required`);
      }
      if (!/[a-zA-Z]/.test(name)) {
        throw new Error(`Item ${index + 1}: name must contain at least one letter`);
      }
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(`Item ${index + 1}: rate must be greater than 0`);
      }

      const subtotal = roundToTwo(qty * rate + fare);
      normalized.push({
        manualItem: true,
        inventoryItem: null,
        name,
        qty,
        rate,
        fare,
        subtotal,
      });
      return;
    }

    const inventoryId = rawItem.inventoryItemId;
    const inventoryDoc = inventoryMap[inventoryId];
    if (!inventoryDoc) {
      throw new Error(`Item ${index + 1}: inventory item not found for this shop`);
    }
    if (qty > inventoryDoc.totalStockUnits) {
      throw new Error(`Item ${index + 1}: quantity exceeds available stock (${inventoryDoc.totalStockUnits})`);
    }

    const rate = inventoryDoc.finalSellingPricePerUnit;
    const subtotal = roundToTwo(qty * rate + fare);
    normalized.push({
      manualItem: false,
      inventoryItem: inventoryDoc._id,
      name: inventoryDoc.itemName,
      qty,
      rate,
      fare,
      subtotal,
    });

    const key = inventoryDoc._id.toString();
    stockDeductions[key] = (stockDeductions[key] || 0) + qty;
  });

  const total = roundToTwo(normalized.reduce((sum, item) => sum + item.subtotal, 0));
  return { normalized, stockDeductions, total };
};

const createBill = async (req, res) => {
  try {
    if (!req.user.shop) {
      return res.status(400).json({ message: 'User is not linked with any shop' });
    }

    const { items, payment, customerMobile, customerName } = req.body;

    const normalizedCustomerName = String(customerName || '').trim();
    if (!normalizedCustomerName) {
      return res.status(400).json({ message: 'customerName is required' });
    }
    const { normalized, stockDeductions, total } = await normalizeIncomingItems(items, req.user.shop);
    const paymentSplit = validatePaymentSplit(total, payment);

    if (paymentSplit.udhar > 0 && !customerMobile) {
      return res.status(400).json({ message: 'customerMobile is required when udhar amount is greater than 0' });
    }

    const session = await Bill.startSession();
    session.startTransaction();
    try {
      const bill = await Bill.create(
        [
          {
            billNumber: generateBillNumber(),
            shop: req.user.shop,
            createdBy: req.user._id,
            total,
            paymentMode: paymentSplit.mode,
            paymentSplit: {
              cash: paymentSplit.cash,
              online: paymentSplit.online,
              udhar: paymentSplit.udhar,
            },
            customerName: normalizedCustomerName,
            customerMobile: paymentSplit.udhar > 0 ? String(customerMobile).trim() : null,
            items: [],
          },
        ],
        { session },
      );

      const itemDocs = normalized.map((item) => ({
        bill: bill[0]._id,
        shop: req.user.shop,
        createdBy: req.user._id,
        ...item,
      }));

      const savedItems = await BillItem.insertMany(itemDocs, { session });

      bill[0].items = savedItems.map((savedItem) => savedItem._id);
      await bill[0].save({ session });

      // Deduct inventory stock
      const deductionEntries = Object.entries(stockDeductions);
      for (const [inventoryId, deductionQty] of deductionEntries) {
        const updateResult = await InventoryItem.updateOne(
          { _id: inventoryId, shopId: req.user.shop, totalStockUnits: { $gte: deductionQty } },
          { $inc: { totalStockUnits: -deductionQty } },
          { session },
        );
        if (updateResult.matchedCount === 0) {
          throw new Error('Insufficient stock while finalizing bill. Please retry.');
        }
      }

      if (paymentSplit.udhar > 0) {
        await UdharEntry.create(
          [
            {
              shop: req.user.shop,
              bill: bill[0]._id,
              customerMobile: String(customerMobile).trim(),
              originalAmount: paymentSplit.udhar,
              pendingAmount: paymentSplit.udhar,
              createdBy: req.user._id,
            },
          ],
          { session },
        );
      }

      await session.commitTransaction();
      session.endSession();

      const hydratedBill = await Bill.findById(bill[0]._id).populate('items');

    return res.status(201).json({
      message: 'Bill created successfully',
      bill: formatBill(hydratedBill),
    });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (error) {
    return res.status(400).json({
      message: error.message || 'Failed to create bill',
    });
  }
};

const listBills = async (req, res) => {
  if (!req.user.shop) {
    return res.status(400).json({ message: 'User is not linked with any shop' });
  }

  const { startDate, endDate, limit = 20 } = req.query;
  const filter = {
    shop: req.user.shop,
  };

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const bills = await Bill.find(filter)
    .populate('items')
    .sort({ createdAt: -1 })
    .limit(safeLimit);

  return res.status(200).json({
    bills: bills.map((bill) => formatBill(bill)),
  });
};

const getBillById = async (req, res) => {
  if (!req.user.shop) {
    return res.status(400).json({ message: 'User is not linked with any shop' });
  }

  const bill = await Bill.findOne({
    _id: req.params.billId,
    shop: req.user.shop,
  }).populate('items');

  if (!bill) {
    return res.status(404).json({ message: 'Bill not found' });
  }

  return res.status(200).json({ bill: formatBill(bill) });
};

module.exports = {
  createBill,
  listBills,
  getBillById,
};
