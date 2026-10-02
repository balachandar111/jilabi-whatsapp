// Public (no admin login) endpoints for the WEBSITE: outlets, live catalogue, WhatsApp-OTP customer login, my orders.
const router = require('express').Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Branch = require('../models/Branch');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Otp = require('../models/Otp');
const { JWT_SECRET } = require('../config');
const { sendOtp } = require('../services/whatsapp');
const rateLimit = require('../middleware/rateLimit');

const CUSTOMER_SECRET = JWT_SECRET + ':customer';       // different secret -> a customer token can never open the admin API
const hash = (phone, code) => crypto.createHmac('sha256', JWT_SECRET).update(`${phone}:${code}`).digest('hex');
const normalize = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };

router.get('/branches', async (_req, res) =>
  res.json((await Branch.find({ active: true }).sort({ name: 1 }).select('code name address phone lat lng openTime closeTime -_id'))));

router.get('/products', async (_req, res) =>
  res.json(await Product.find({ available: true }).sort({ category: 1, name: 1 }).select('code name category price unit variants unavailableAt -_id')));

router.post('/otp/request', rateLimit(10, 10 * 60 * 1000), async (req, res) => {
  const phone = normalize(req.body?.phone);
  if (phone.length < 11 || phone.length > 15) return res.status(400).json({ message: 'Enter a valid mobile number' });
  const recent = await Otp.countDocuments({ phone, createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) } });
  if (recent >= 3) return res.status(429).json({ message: 'Too many codes requested. Try again in a few minutes.' });
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  try { await sendOtp(phone, code); }
  catch (e) { return res.status(502).json({ message: `Could not send the code on WhatsApp: ${e.message}` }); }
  await Otp.create({ phone, codeHash: hash(phone, code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  res.json({ ok: true });
});

router.post('/otp/verify', rateLimit(20, 10 * 60 * 1000), async (req, res) => {
  const phone = normalize(req.body?.phone), code = String(req.body?.code || '').trim();
  const rec = await Otp.findOne({ phone, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!rec || rec.attempts >= 5) return res.status(400).json({ message: 'Code expired. Request a new one.' });
  const a = Buffer.from(rec.codeHash), b = Buffer.from(hash(phone, code));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    rec.attempts += 1; await rec.save();
    return res.status(400).json({ message: 'Incorrect code' });
  }
  await Otp.deleteMany({ phone });
  res.json({ token: jwt.sign({ phone, role: 'customer' }, CUSTOMER_SECRET, { expiresIn: '30d' }), phone });
});

router.get('/me/orders', async (req, res) => {
  const h = req.get('authorization') || '';
  try {
    const { phone } = jwt.verify(h.startsWith('Bearer ') ? h.slice(7) : '', CUSTOMER_SECRET);
    res.json(await Order.find({ phone }).sort({ createdAt: -1 }).limit(50)
      .select('orderId items amount deliveryFee fulfilment branchName pickupSlot paymentStatus status rider createdAt -_id'));
  } catch { res.status(401).json({ message: 'Please verify your number again' }); }
});
module.exports = router;
