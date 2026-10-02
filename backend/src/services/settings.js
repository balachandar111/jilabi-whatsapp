const crypto = require('crypto');
const Setting = require('../models/Setting');
const c = require('../config');

const KEY = crypto.createHash('sha256').update(c.ENCRYPTION_KEY || c.JWT_SECRET).digest();
const SECRET_FIELDS = ['waToken', 'appSecret', 'rzpKeySecret', 'rzpWebhookSecret'];
const PLAIN_FIELDS = ['appId', 'graphVersion', 'phoneNumberId', 'wabaId', 'verifyToken', 'catalogId', 'rzpKeyId', 'ownerPhone', 'shopName', 'publicUrl', 'deliveryFee', 'freeDeliveryAbove', 'maxDeliveryKm'];

// .env values are used as fallback when nothing is saved from the Setup page
const ENV = {
  waToken: c.WA_TOKEN, appSecret: c.APP_SECRET, rzpKeySecret: c.RZP_KEY_SECRET, rzpWebhookSecret: c.RZP_WEBHOOK_SECRET,
  phoneNumberId: c.PHONE_NUMBER_ID, verifyToken: c.VERIFY_TOKEN, catalogId: c.CATALOG_ID,
  rzpKeyId: c.RZP_KEY_ID, ownerPhone: c.OWNER_PHONE, shopName: c.SHOP_NAME, publicUrl: c.PUBLIC_URL,
  appId: c.APP_ID, graphVersion: c.GRAPH_VERSION,
};

function enc(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}
function dec(payload) {
  try {
    const [iv, tag, data] = String(payload).split('.').map(x => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch { return ''; }
}

let cache = null, cacheAt = 0;
async function getSettings() {
  if (cache && Date.now() - cacheAt < 15000) return cache;
  const doc = (await Setting.findOne({ key: 'main' }).lean()) || {};
  const out = {};
  for (const f of PLAIN_FIELDS) out[f] = doc[f] || ENV[f] || '';
  for (const f of SECRET_FIELDS) out[f] = (doc[f] && dec(doc[f])) || ENV[f] || '';
  out.shopName = out.shopName || 'Krishna Jelabi Kadai';
  out.graphVersion = out.graphVersion || 'v25.0';
  // numeric helpers (stored as strings from the Setup form)
  out.deliveryFeeN = Number(out.deliveryFee) || 0;
  out.freeAboveN = Number(out.freeDeliveryAbove) || 0;
  out.maxKmN = Number(out.maxDeliveryKm) || 0;
  cache = out; cacheAt = Date.now();
  return out;
}

// Secrets: empty / masked value = keep existing. Plain fields: empty = clear.
async function updateSettings(patch) {
  const set = {};
  for (const f of PLAIN_FIELDS) if (typeof patch[f] === 'string') set[f] = patch[f].trim();
  for (const f of SECRET_FIELDS) {
    const v = patch[f];
    if (typeof v === 'string' && v.trim() && !v.startsWith('•')) set[f] = enc(v.trim());
  }
  await Setting.findOneAndUpdate({ key: 'main' }, { $set: set, $setOnInsert: { key: 'main' } }, { upsert: true });
  cache = null;
}

const mask = (v) => (v ? '••••••••' + String(v).slice(-4) : '');
module.exports = { getSettings, updateSettings, mask, enc, dec };
