const mongoose = require('mongoose');
// One chat session per customer phone (cart + current step of the WhatsApp flow).
// Mixed types are used for cart/details/pending; the bot calls markModified() before save.
module.exports = mongoose.model('Session', new mongoose.Schema({
  phone: { type: String, required: true, unique: true, index: true },
  step: { type: String, default: 'menu' },
  cart: { type: [mongoose.Schema.Types.Mixed], default: [] },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  pending: { type: mongoose.Schema.Types.Mixed, default: null },
  updatedAt: { type: Date, default: Date.now, index: { expires: 60 * 60 * 24 * 3 } }, // idle sessions auto-delete after 3 days
}, { minimize: false }));
