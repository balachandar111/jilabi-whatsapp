const mongoose = require('mongoose');
// Festival gifting / wedding / corporate / catering requests collected in the WhatsApp chat
module.exports = mongoose.model('BulkEnquiry', new mongoose.Schema({
  enquiryId: { type: String, unique: true, index: true },
  phone: String,
  name: String,
  type: { type: String, default: 'other' },      // wedding | festival | corporate | other
  details: String,
  neededBy: String,
  status: { type: String, enum: ['new', 'contacted', 'quoted', 'confirmed', 'closed'], default: 'new', index: true },
  note: { type: String, default: '' },
}, { timestamps: true }));
