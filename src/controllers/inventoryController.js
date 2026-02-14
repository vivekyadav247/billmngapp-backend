const mongoose = require('mongoose');
const InventoryItem = require('../models/InventoryItem');
const User = require('../models/User');
const { roundToTwo } = require('../utils/billUtils');
const SalaryEntry = require('../models/SalaryEntry');

const MAX_ITEMS_PER_SHOP = 5;

const validateShopLink = (req) => {
  if (!req.user.shop) {
    const error = new Error('User is not linked with any shop');
    error.statusCode = 400;
    throw error;
  }
};

const fetchEmployeesMap = async (shopId, employeeIds = []) => {
  if (!employeeIds.length) return {};
  const employees = await User.find({ _id: { $in: employeeIds }, shop: shopId, role: 'employee', isActive: true });
  const map = {};
  employees.forEach((emp) => {
    map[emp._id.toString()] = emp;
  });
  return map;
};

const computeCostBreakdown = async ({ shopId, payload, existingItemId = null }) => {
  const {
    itemName,
    totalStockUnits,
    costOfProduct,
    costOfFuel,
    labourDetails = [],
    profitPerUnit,
  } = payload;

  if (!itemName || typeof itemName !== 'string') {
    throw new Error('itemName is required');
  }

  const totalUnits = Number(totalStockUnits);
  if (!Number.isFinite(totalUnits) || totalUnits <= 0) {
    throw new Error('totalStockUnits must be greater than 0');
  }

  const materialCost = Number(costOfProduct);
  const fuelCost = Number(costOfFuel);
  if ([materialCost, fuelCost].some((v) => !Number.isFinite(v) || v < 0)) {
    throw new Error('Cost inputs must be non-negative numbers');
  }

  const profit = Number(profitPerUnit);
  if (!Number.isFinite(profit) || profit < 0) {
    throw new Error('profitPerUnit must be non-negative');
  }

  const labourIds = labourDetails.map((l) => l.employeeId).filter(Boolean);
  const employeesMap = await fetchEmployeesMap(shopId, labourIds);
  const normalizedLabour = labourDetails.map((entry, index) => {
    const employeeId = entry.employeeId;
    const cost = Number(entry.labourCost);
    if (!employeeId || !employeesMap[employeeId]) {
      throw new Error(`Labour item ${index + 1}: employee not found in this shop`);
    }
    if (!Number.isFinite(cost) || cost < 0) {
      throw new Error(`Labour item ${index + 1}: labourCost must be >= 0`);
    }
    return { employeeId, labourCost: roundToTwo(cost) };
  });

  const totalLabourCost = normalizedLabour.reduce((sum, l) => sum + l.labourCost, 0);
  const totalCost = roundToTwo(materialCost + fuelCost + totalLabourCost);
  const costPerUnit = roundToTwo(totalCost / totalUnits);
  const finalSellingPricePerUnit = roundToTwo(costPerUnit + profit);

  return {
    itemName: itemName.trim(),
    totalStockUnits: totalUnits,
    costOfProduct: roundToTwo(materialCost),
    costOfFuel: roundToTwo(fuelCost),
    labourDetails: normalizedLabour,
    costOfLabour: roundToTwo(totalLabourCost),
    costOfLabour: roundToTwo(totalLabourCost),
    totalCost,
    costPerUnit,
    profitPerUnit: roundToTwo(profit),
    finalSellingPricePerUnit,
  };
};

const applyLabourAccrual = async (labourList, multiplier = 1, shopId, createdBy) => {
  // multiplier can be -1 to reverse
  if (!labourList.length) return;
  const bulk = labourList.map((entry) => ({
    updateOne: {
      filter: { _id: entry.employeeId },
      update: { $inc: { salaryDue: roundToTwo(entry.labourCost * multiplier) } },
    },
  }));
  await User.bulkWrite(bulk, { ordered: false });

  // log salary entries for labour accrual (only positive accruals)
  if (multiplier > 0) {
    const docs = labourList.map((entry) => ({
      shop: shopId,
      employee: entry.employeeId,
      amount: roundToTwo(entry.labourCost),
      type: 'labour',
      period: 'labour',
      effectiveDate: new Date(),
      createdBy,
    }));
    if (docs.length) {
      await SalaryEntry.insertMany(docs);
    }
  }
};

const createInventoryItem = async (req, res) => {
  try {
    validateShopLink(req);

    const existingCount = await InventoryItem.countDocuments({ shopId: req.user.shop });
    if (existingCount >= MAX_ITEMS_PER_SHOP) {
      return res.status(400).json({ message: `Maximum ${MAX_ITEMS_PER_SHOP} inventory items reached for this shop` });
    }

    const computed = await computeCostBreakdown({ shopId: req.user.shop, payload: req.body });
    const item = await InventoryItem.create({ shopId: req.user.shop, ...computed });
    await applyLabourAccrual(computed.labourDetails, 1, req.user.shop, req.user._id);

    return res.status(201).json({ message: 'Inventory item created', item });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message || 'Failed to create inventory item' });
  }
};

const listInventory = async (req, res) => {
  try {
    validateShopLink(req);
    const items = await InventoryItem.find({ shopId: req.user.shop }).sort({ createdAt: -1 });
    return res.status(200).json({ items });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message || 'Failed to load inventory' });
  }
};

const updateInventoryItem = async (req, res) => {
  try {
    validateShopLink(req);
    const item = await InventoryItem.findOne({ _id: req.params.id, shopId: req.user.shop });
    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    const oldLabour = item.labourDetails || [];
    const computed = await computeCostBreakdown({ shopId: req.user.shop, payload: req.body, existingItemId: item._id });
    Object.assign(item, computed);
    await item.save();

    // adjust salary accrual delta per employee
    const deltaMap = {};
    oldLabour.forEach((l) => {
      deltaMap[l.employeeId.toString()] = (deltaMap[l.employeeId.toString()] || 0) - l.labourCost;
    });
    computed.labourDetails.forEach((l) => {
      deltaMap[l.employeeId.toString()] = (deltaMap[l.employeeId.toString()] || 0) + l.labourCost;
    });

    const deltas = Object.entries(deltaMap)
      .filter(([, val]) => val !== 0)
      .map(([employeeId, labourCost]) => ({ employeeId, labourCost }));
    await applyLabourAccrual(deltas, 1, req.user.shop, req.user._id);

    return res.status(200).json({ message: 'Inventory item updated', item });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message || 'Failed to update inventory item' });
  }
};

const deleteInventoryItem = async (req, res) => {
  try {
    validateShopLink(req);
    const item = await InventoryItem.findOne({ _id: req.params.id, shopId: req.user.shop });
    if (!item) return res.status(404).json({ message: 'Inventory item not found' });

    // reverse accrued labour for this item
    await applyLabourAccrual(item.labourDetails || [], -1, req.user.shop, req.user._id);

    await InventoryItem.deleteOne({ _id: item._id });
    return res.status(200).json({ message: 'Inventory item deleted' });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message || 'Failed to delete inventory item' });
  }
};

module.exports = {
  createInventoryItem,
  listInventory,
  updateInventoryItem,
  deleteInventoryItem,
};
