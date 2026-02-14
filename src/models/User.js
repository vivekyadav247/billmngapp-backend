const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    email: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['owner', 'employee'],
      default: 'owner',
      index: true,
    },
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      default: null,
    },
    employeeId: {
      type: String,
      uppercase: true,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: null,
    },
    salaryDue: {
      type: Number,
      default: 0,
      min: 0,
    },
    passwordHash: {
      type: String,
      default: null,
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('User', userSchema);
