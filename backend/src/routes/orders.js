const router = require('express').Router();
const Order = require('../models/Order');
const BulkEnquiry = require('../models/BulkEnquiry');
const { sendText, sendTemplate } = require('../services/whatsapp');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Dashboard numbers
router.get('/stats', async (req, res) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const b = req.query.branch ? { branchCode: String(req.query.branch) } : {};
  const sum = (match) => Order.aggregate([{ $match: { ...b, ...match } }, { $group: { _id: null, v: { $sum: '$amount' } } }]);
  const [todayOrders, todayRev, pendingPayments, toPack, totalRev, totalOrders, newBulk, byBranch] = await Promise.all([
    Order.countDocuments({ ...b, createdAt: { $gte: start } }),
    sum({ paymentStatus: 'paid', paidAt: { $gte: start } }),
    Order.countDocuments({ ...b, paymentStatus: 'pending' }),
    Order.countDocuments({ ...b, paymentStatus: 'paid', status: 'new' }),
    sum({ paymentStatus: 'paid' }),
    Order.countDocuments(b),
    BulkEnquiry.countDocuments({ status: 'new' }),
    Order.aggregate([{ $match: { paymentStatus: 'paid', paidAt: { $gte: start } } },
      { $group: { _id: '$branchName', orders: { $sum: 1 }, revenue: { $sum: '$amount' } } }, { $sort: { revenue: -1 } }]),
  ]);
  res.json({
    todayOrders, pendingPayments, toPack, totalOrders, newBulk,
    todayRevenue: todayRev[0]?.v || 0, totalRevenue: totalRev[0]?.v || 0,
    byBranch: byBranch.map(x => ({ branch: x._id || '—', orders: x.orders, revenue: x.revenue })),
  });
});

// List with filters + pagination
router.get('/', async (req, res) => {
  const { status, paymentStatus, q, from, to, branch, fulfilment } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const filter = {};
  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (branch) filter.branchCode = String(branch);
  if (fulfilment) filter.fulfilment = String(fulfilment);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); filter.createdAt.$lte = d; }
  }
  if (q) {
    const r = new RegExp(esc(String(q).trim()), 'i');
    filter.$or = [{ orderId: r }, { name: r }, { phone: r }];
  }
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);
  res.json({ orders, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
});

router.get('/:id', async (req, res) => {
  const o = await Order.findById(req.params.id);
  if (!o) return res.status(404).json({ message: 'Not found' });
  res.json(o);
});

const riderLine = (o) => (o.rider?.name
  ? `\n🛵 Rider: ${o.rider.name}${o.rider.phone ? ' (' + o.rider.phone + ')' : ''}${o.rider.trackingUrl ? '\n🔗 Track: ' + o.rider.trackingUrl : ''}` : '');
const MESSAGES = {
  packed: (o) => `📦 Good news ${o.name}! Your order *${o.orderId}* is packed${o.fulfilment === 'pickup' ? ' and will be ready for pickup shortly.' : ' and will be dispatched soon.'}`,
  ready: (o) => `🏬 ${o.name}, your order *${o.orderId}* is *ready for pickup* at ${o.branchName}${o.pickupSlot ? ' (' + o.pickupSlot + ')' : ''}. Please show this message at the counter.`,
  dispatched: (o) => `🚚 Your order *${o.orderId}* is *out for delivery*! It will reach you shortly.${riderLine(o)}`,
  delivered: (o) => `✅ Your order *${o.orderId}* has been ${o.fulfilment === 'pickup' ? 'collected' : 'delivered'}. Thank you for shopping with us! 🙏`,
  cancelled: (o) => `❌ Your order *${o.orderId}* has been cancelled. Our team will contact you if any refund is needed.`,
};
const STATUSES = ['new', 'packed', 'ready', 'dispatched', 'delivered', 'cancelled'];

// Update fulfilment status (+ optional WhatsApp notification to customer)
router.patch('/:id/status', async (req, res) => {
  const { status, notify = true } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });
  const o = await Order.findById(req.params.id);
  if (!o) return res.status(404).json({ message: 'Not found' });
  if (['packed', 'ready', 'dispatched', 'delivered'].includes(status) && o.paymentStatus !== 'paid')
    return res.status(400).json({ message: 'Order is not paid yet' });
  if (status === 'ready' && o.fulfilment !== 'pickup') return res.status(400).json({ message: '"Ready" is only for self-pickup orders' });
  if (status === 'dispatched' && o.fulfilment === 'pickup') return res.status(400).json({ message: 'Pickup orders are not dispatched — use "Ready"' });

  o.status = status; await o.save();

  let notified = false, notifyError = null, via = null;
  if (notify && MESSAGES[status]) {
    try { await sendText(o.phone, MESSAGES[status](o)); notified = true; via = 'text'; }
    catch {
      // 24-hour window closed -> fall back to approved utility template
      try { await sendTemplate(o.phone, `order_${status}`, [o.name, o.orderId]); notified = true; via = 'template'; }
      catch (e2) { notifyError = `Customer not notified: ${e2.message}. Create/approve the order_${status} template in Setup → Templates.`; }
    }
  }
  res.json({ order: o, notified, notifyError, via });
});

// Assign a delivery partner / rider (shown to the customer in the "out for delivery" message and on "track")
router.patch('/:id/rider', async (req, res) => {
  const { name = '', phone = '', trackingUrl = '' } = req.body || {};
  if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) return res.status(400).json({ message: 'Tracking link must start with http(s)://' });
  const o = await Order.findByIdAndUpdate(req.params.id, { rider: { name: String(name).slice(0, 60), phone: String(phone).slice(0, 20), trackingUrl: String(trackingUrl).slice(0, 300) } }, { new: true });
  if (!o) return res.status(404).json({ message: 'Not found' });
  res.json(o);
});

module.exports = router;
