const mongoose = require('mongoose');
// One document per outlet (Kodambakkam / Nungambakkam / Saligramam ...)
module.exports = mongoose.model('Branch', new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },          // shown to customers
  alertPhone: { type: String, default: '' },     // gets WhatsApp alert for this branch's paid orders (country code, digits)
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  openTime: { type: String, default: '09:00' },  // pickup slots are generated inside this window (IST)
  closeTime: { type: String, default: '21:00' },
  active: { type: Boolean, default: true },
}, { timestamps: true }));
