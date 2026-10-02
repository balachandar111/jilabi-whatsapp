const mongoose = require('mongoose');
const variant = new mongoose.Schema({
  label: { type: String, required: true, trim: true },   // e.g. 250g / 500g / 1kg
  price: { type: Number, required: true, min: 0 },
  sku: { type: String, trim: true, uppercase: true },     // Content ID in the Meta catalog (only needed if you use a catalog)
}, { _id: false });
const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true }, // = Content ID in Meta catalog (single-size items)
  name: { type: String, required: true, trim: true },
  category: { type: String, enum: ['sweet', 'kaaram', 'ghee'], required: true },
  price: { type: Number, required: true, min: 0 },        // base price (used when no variants)
  unit: { type: String, default: '250g' },
  variants: { type: [variant], default: [] },             // weight options; empty = single size (price/unit)
  unavailableAt: { type: [String], default: [] },         // branch codes where this item is out of stock
  available: { type: Boolean, default: true },            // master switch
}, { timestamps: true });
module.exports = mongoose.model('Product', schema);
