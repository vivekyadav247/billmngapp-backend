const mongoose = require('mongoose');

const udharEntrySchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      index: true,
    },
    bill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bill',
      required: true,
      index: true,
    },
    customerMobile: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    originalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    pendingAmount: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },
    settledAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    payments: {
      type: [
        {
          amount: { type: Number, required: true, min: 0 },
          mode: { type: String, enum: ['cash', 'online'], required: true },
          createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ['PENDING', 'SETTLED'],
      default: 'PENDING',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('UdharEntry', udharEntrySchema);
