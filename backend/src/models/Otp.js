const mongoose = require('mongoose');
// Website/WhatsApp OTP login codes. Auto-deleted by Mongo when expired.
module.exports = mongoose.model('Otp', new mongoose.Schema({
  phone: { type: String, index: true },
  codeHash: String,
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, expires: 0 },
}, { timestamps: true }));
