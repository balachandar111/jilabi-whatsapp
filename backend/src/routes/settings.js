const router = require('express').Router();
const { getSettings, updateSettings, mask } = require('../services/settings');
const { graph, wa, sendText, sendOtp } = require('../services/whatsapp');
const { testRazorpay } = require('../services/razorpay');
const { DEFS } = require('../services/templates');

const PLAIN = ['appId', 'graphVersion', 'phoneNumberId', 'wabaId', 'verifyToken', 'catalogId', 'rzpKeyId', 'ownerPhone', 'shopName', 'publicUrl', 'deliveryFee', 'freeDeliveryAbove', 'maxDeliveryKm'];

// Read (secrets are masked, never sent back in full)
router.get('/', async (_req, res) => {
  const s = await getSettings();
  res.json({
    values: Object.fromEntries(PLAIN.map(k => [k, s[k]])),
    secrets: { waToken: mask(s.waToken), appSecret: mask(s.appSecret), rzpKeySecret: mask(s.rzpKeySecret), rzpWebhookSecret: mask(s.rzpWebhookSecret) },
  });
});

router.put('/', async (req, res) => { await updateSettings(req.body || {}); res.json({ ok: true }); });

// 1) Verify token + phone number id really work with Meta
router.post('/test-whatsapp', async (_req, res) => {
  try {
    const s = await getSettings();
    if (!s.phoneNumberId) throw new Error('Enter and save the Phone Number ID first');
    const info = await graph(`${s.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,name_status,platform_type`);
    res.json({ ok: true, info });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// 2) Inspect the access token with App ID + App Secret (is it valid? temporary or permanent? which permissions?)
router.post('/test-token', async (_req, res) => {
  try {
    const s = await getSettings();
    if (!s.appId || !s.appSecret) throw new Error('Enter and save App ID and App Secret first');
    if (!s.waToken) throw new Error('Enter and save the access token first');
    const r = await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(s.waToken)}&access_token=${encodeURIComponent(`${s.appId}|${s.appSecret}`)}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error?.message || 'debug_token failed');
    const t = d.data || {};
    res.json({
      ok: true,
      info: {
        valid: t.is_valid, type: t.type, appMatches: String(t.app_id) === String(s.appId),
        expires: t.expires_at ? new Date(t.expires_at * 1000).toISOString() : 'never (permanent)',
        scopes: t.scopes || [], error: t.error?.message,
      },
    });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// 3) Subscribe THIS app to the WhatsApp Business Account so message webhooks are delivered
router.post('/subscribe-app', async (_req, res) => {
  try {
    const s = await getSettings();
    if (!s.wabaId) throw new Error('Enter and save the WhatsApp Business Account ID first');
    await graph(`${s.wabaId}/subscribed_apps`, { method: 'POST' });
    const d = await graph(`${s.wabaId}/subscribed_apps`);
    res.json({ ok: true, apps: (d.data || []).map(a => a.whatsapp_business_api_data?.name || a.name || a.id) });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// Send a real message to a number (template works even when the 24h window is closed)
router.post('/send-test', async (req, res) => {
  const phone = String(req.body?.to || '').replace(/\D/g, '');
  if (phone.length < 10) return res.status(400).json({ message: 'Enter number with country code, e.g. 919876543210' });
  try {
    if (req.body?.mode === 'text') await sendText(phone, '✅ Test message from your WhatsApp ordering bot.');
    else if (req.body?.mode === 'otp') await sendOtp(phone, '123456');
    else await wa({ to: phone, type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.post('/test-razorpay', async (_req, res) => {
  try { await testRazorpay(); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ message: e.message }); }
});

// Message templates on your WhatsApp Business Account
router.get('/templates', async (_req, res) => {
  try {
    const s = await getSettings();
    if (!s.wabaId) throw new Error('Enter and save the WhatsApp Business Account ID first');
    const d = await graph(`${s.wabaId}/message_templates?fields=name,status,category,language&limit=100`);
    res.json(d.data || []);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.post('/templates/defaults', async (_req, res) => {
  try {
    const s = await getSettings();
    if (!s.wabaId) throw new Error('Enter and save the WhatsApp Business Account ID first');
    const results = [];
    const create = async (name, body) => {
      try { await graph(`${s.wabaId}/message_templates`, { method: 'POST', body: { name, language: 'en', ...body } }); results.push({ name, ok: true }); }
      catch (e) { results.push({ name, ok: false, error: e.message }); }
    };
    for (const d of DEFS)
      await create(d.name, { category: 'UTILITY', components: [{ type: 'BODY', text: d.text, example: { body_text: [['Ravi', 'KJ1A2B3C']] } }] });
    // Login OTP (AUTHENTICATION template with a "Copy code" button)
    await create('login_otp', { category: 'AUTHENTICATION', components: [
      { type: 'BODY', add_security_recommendation: true },
      { type: 'FOOTER', code_expiration_minutes: 10 },
      { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy code' }] },
    ] });
    res.json(results);
  } catch (e) { res.status(400).json({ message: e.message }); }
});
module.exports = router;
