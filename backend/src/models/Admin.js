const mongoose = require('mongoose');
// Admin dashboard user (created/updated by `npm run seed`)
module.exports = mongoose.model('Admin', new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true }));
