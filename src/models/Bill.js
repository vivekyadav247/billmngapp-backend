const mongoose = require('mongoose');

const paymentSplitSchema = new mongoose.Schema(
  {
    cash: { type: Number, default: 0, min: 0 },
    online: { type: Number, default: 0, min: 0 },
    udhar: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const billSchema = new mongoose.Schema(
  {
    billNumber: {
      type: String,
      required: true,
      index: true,
    },
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BillItem',
      },
    ],
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMode: {
      type: String,
      enum: ['FULL_CASH', 'FULL_ONLINE', 'FULL_UDHAR', 'HYBRID'],
      required: true,
      index: true,
    },
    paymentSplit: {
      type: paymentSplitSchema,
      required: true,
    },
    customerMobile: {
      type: String,
      default: null,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Bill', billSchema);
