const router = require('express').Router();
const crypto = require('crypto');
const Order = require('../models/Order');
const Session = require('../models/Session');
const Branch = require('../models/Branch');
const { handle } = require('../services/bot');
const { safeText } = require('../services/whatsapp');
const { getSettings } = require('../services/settings');

const validSig = (raw, secret, header, prefix = '') => {
  if (!secret || !header || !raw) return false;
  const expected = prefix + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
};

// Meta can deliver the same message twice; remember the last few thousand ids
const seen = new Set();
const firstTime = (id) => {
  if (!id) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > 5000) seen.delete(seen.values().next().value);
  return true;
};

/* ---- Meta (WhatsApp) ---- */
router.get('/webhook', async (req, res) => {
  const s = await getSettings();
  const token = req.query['hub.verify_token'];
  if (req.query['hub.mode'] === 'subscribe' && s.verifyToken && token === s.verifyToken)
    return res.status(200).send(req.query['hub.challenge']);
  res.sendStatus(403);
});

router.post('/webhook', async (req, res) => {
  const s = await getSettings();
  // The App Secret is optional for a first test, but once set every call must carry a valid signature
  if (s.appSecret && !validSig(req.rawBody, s.appSecret, req.get('x-hub-signature-256'), 'sha256='))
    return res.sendStatus(401);
  res.sendStatus(200); // acknowledge fast

  for (const entry of req.body.entry || []) for (const ch of entry.changes || []) {
    const v = ch.value || {};
    for (const st of v.statuses || [])   // delivery receipts — log failures so they are easy to debug
      if (st.status === 'failed') console.error('WhatsApp delivery FAILED:', st.recipient_id, JSON.stringify(st.errors || []));
    const names = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile?.name]));
    for (const m of v.messages || []) {
      if (!firstTime(m.id)) continue;
      handle(m, { profileName: names[m.from] }).catch(e => console.error('bot error:', e));
    }
  }
});

/* ---- Razorpay ---- */
router.post('/razorpay-webhook', async (req, res) => {
  const s = await getSettings();
  if (!validSig(req.rawBody, s.rzpWebhookSecret, req.get('x-razorpay-signature'))) return res.sendStatus(401);
  res.sendStatus(200);

  const { event, payload } = req.body;
  const link = payload?.payment_link?.entity;
  if (!link) return;
  const order = await Order.findOne({ orderId: link.reference_id });
  if (!order) return;

  if (event === 'payment_link.paid' && order.paymentStatus !== 'paid') {
    order.paymentStatus = 'paid';
    order.paidAt = new Date();
    order.paymentId = payload.payment?.entity?.id;
    await order.save();
    await Session.deleteOne({ phone: order.phone });

    const items = order.items.map(i => `• ${i.name}${i.variant ? ` (${i.variant})` : ''} × ${i.qty} = ₹${i.price * i.qty}`).join('\n');
    const where = order.fulfilment === 'pickup'
      ? `🏬 Pickup: ${order.branchName}${order.pickupSlot ? '\n🕒 ' + order.pickupSlot : ''}`
      : `🚚 Delivery to:\n${order.address}`;
    await safeText(order.phone, `🎉 *Order Confirmed!* Thank you, ${order.name}.\n\n*Order ${order.orderId}*\n${items}\n${order.deliveryFee ? `Delivery: ₹${order.deliveryFee}\n` : ''}*Paid: ₹${order.amount}*\n\n${where}\n\nWe'll update you here: Packed → ${order.fulfilment === 'pickup' ? 'Ready for pickup' : 'Out for delivery'} → Delivered. Send *track* anytime.`);

    const alert = `🆕 PAID ORDER ${order.orderId} — ${order.fulfilment.toUpperCase()} @ ${order.branchName}\n${items}\nTotal ₹${order.amount}\n${order.name} (+${order.phone})\n${order.address}${order.pickupSlot ? '\nSlot: ' + order.pickupSlot : ''}`;
    const branch = await Branch.findOne({ code: order.branchCode });
    const targets = new Set([s.ownerPhone, branch?.alertPhone].filter(Boolean));
    for (const t of targets) await safeText(t, alert);
  }
  if ((event === 'payment_link.expired' || event === 'payment_link.cancelled') && order.paymentStatus === 'pending') {
    order.paymentStatus = 'expired'; await order.save();
  }
});
module.exports = router;
