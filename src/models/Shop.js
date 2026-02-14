const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema(
  {
    shopCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
      minlength: 5,
      maxlength: 5,
      match: /^[A-Z0-9]{5}$/,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    gstNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Shop', shopSchema);
