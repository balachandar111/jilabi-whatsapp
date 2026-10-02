const mongoose = require('mongoose');
// Single document (key = 'main'). Secret fields are stored AES-256-GCM encrypted.
module.exports = mongoose.model('Setting', new mongoose.Schema({
  key: { type: String, unique: true, default: 'main' },
  // WhatsApp / Meta
  appId: String, graphVersion: String,
  phoneNumberId: String, wabaId: String, verifyToken: String, catalogId: String,
  waToken: String, appSecret: String,            // encrypted
  // Razorpay
  rzpKeyId: String, rzpKeySecret: String, rzpWebhookSecret: String, // last two encrypted
  // Shop + delivery
  shopName: String, ownerPhone: String, publicUrl: String,
  deliveryFee: String, freeDeliveryAbove: String, maxDeliveryKm: String,
}, { timestamps: true }));
