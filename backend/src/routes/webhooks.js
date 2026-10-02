const router = require('express').Router();
const crypto = require('crypto');
const Order = require('../models/Order');
const Session = require('../models/Session');
const Branch = require('../models/Branch');
const { handle } = require('../services/bot');
const { safeText } = require('../services/whatsapp');
const { getSettings } = require('../services/settings');
const c = require('../config');
const { confirmPaid } = require('../services/confirm');

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
  const mode = req.query['hub.mode'];
  const token = String(req.query['hub.verify_token'] || '').trim();
  const challenge = req.query['hub.challenge'];
  const fromEnv = (c.VERIFY_TOKEN || '').trim();
  console.log(`Webhook verify request: mode=${mode} tokenSent=${token ? 'yes(' + token.length + ' chars)' : 'NO'} envTokenSet=${fromEnv ? 'yes' : 'no'}`);

  if (mode !== 'subscribe' || !challenge) {
    console.warn('Webhook verify rejected: missing hub.mode=subscribe or hub.challenge (this is not a Meta verification request)');
    return res.sendStatus(403);
  }
  // 1) VERIFY_TOKEN env var: answers instantly, no database needed
  if (fromEnv && token === fromEnv) return res.status(200).type('text/plain').send(String(challenge));
  // 2) Token saved from the admin Setup page (needs MongoDB; don't hang if it is down)
  let saved = '';
  try {
    const s = await Promise.race([getSettings(), new Promise((_, rej) => setTimeout(() => rej(new Error('database timeout')), 4000))]);
    saved = (s.verifyToken || '').trim();
  } catch (e) { console.error('Webhook verify: could not read saved settings:', e.message); }
  if (saved && token === saved) return res.status(200).type('text/plain').send(String(challenge));

  console.warn(`Webhook verify rejected: token mismatch. savedTokenSet=${saved ? 'yes' : 'no'} envTokenSet=${fromEnv ? 'yes' : 'no'}`);
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

  if (event === 'payment_link.paid' && order.paymentStatus !== 'paid')
    await confirmPaid(order, payload.payment?.entity?.id);
  if ((event === 'payment_link.expired' || event === 'payment_link.cancelled') && order.paymentStatus === 'pending') {
    order.paymentStatus = 'expired'; await order.save();
  }
});
module.exports = router;