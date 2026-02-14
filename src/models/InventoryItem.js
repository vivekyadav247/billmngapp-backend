const mongoose = require('mongoose');

const labourDetailSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    labourCost: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const inventoryItemSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      index: true,
    },
    itemName: {
      type: String,
      required: true,
      trim: true,
      index: true,
      maxlength: 80,
    },
    totalStockUnits: {
      type: Number,
      required: true,
      min: 0,
    },
    costOfProduct: {
      type: Number,
      required: true,
      min: 0,
    },
    costOfFuel: {
      type: Number,
      required: true,
      min: 0,
    },
    labourDetails: {
      type: [labourDetailSchema],
      default: [],
    },
    costOfLabour: {
      type: Number,
      required: true,
      min: 0,
    },
    totalCost: {
      type: Number,
      required: true,
      min: 0,
    },
    costPerUnit: {
      type: Number,
      required: true,
      min: 0,
    },
    profitPerUnit: {
      type: Number,
      required: true,
      min: 0,
    },
    finalSellingPricePerUnit: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
