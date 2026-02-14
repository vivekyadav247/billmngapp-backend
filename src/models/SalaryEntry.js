const mongoose = require('mongoose');

const salaryEntrySchema = new mongoose.Schema(
  {
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ['manual', 'labour'], required: true, index: true },
    period: { type: String, enum: ['day', 'month', 'labour'], default: 'day', index: true },
    effectiveDate: { type: Date, default: Date.now, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('SalaryEntry', salaryEntrySchema);
