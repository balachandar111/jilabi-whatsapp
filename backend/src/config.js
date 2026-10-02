require('dotenv').config();
const e = process.env;
const cfg = {
  PORT: e.PORT || 5000,
  MONGO_URI: e.MONGO_URI || 'mongodb://127.0.0.1:27017/sweetbot',
  CLIENT_ORIGIN: e.CLIENT_ORIGIN || 'http://localhost:5173',
  JWT_SECRET: e.JWT_SECRET || 'dev_secret_change_me',
  ADMIN_USER: e.ADMIN_USER || 'admin',
  ADMIN_PASSWORD: e.ADMIN_PASSWORD || 'ChangeMe@123',
  VERIFY_TOKEN: e.VERIFY_TOKEN,
  WA_TOKEN: e.WA_TOKEN,
  PHONE_NUMBER_ID: e.PHONE_NUMBER_ID,
  APP_SECRET: e.APP_SECRET,
  CATALOG_ID: e.CATALOG_ID,
  RZP_KEY_ID: e.RZP_KEY_ID,
  RZP_KEY_SECRET: e.RZP_KEY_SECRET,
  RZP_WEBHOOK_SECRET: e.RZP_WEBHOOK_SECRET,
  OWNER_PHONE: e.OWNER_PHONE,
  PUBLIC_URL: e.PUBLIC_URL || '',
  APP_ID: e.APP_ID,
  GRAPH_VERSION: e.GRAPH_VERSION || 'v25.0',
  ENCRYPTION_KEY: e.ENCRYPTION_KEY,
  SHOP_NAME: e.SHOP_NAME || 'Krishna Jelabi Kadai',
  // TESTING ONLY: SKIP_PAYMENT=true -> "Pay Now" places the order instantly as PAID (no Razorpay). Remove/false = real payments.
  SKIP_PAYMENT: /^(1|true|yes|on)$/i.test(e.SKIP_PAYMENT || ''),
};
if (cfg.SKIP_PAYMENT) console.warn('⚠️  SKIP_PAYMENT is ON: orders are confirmed WITHOUT payment. Turn it off before going live.');

// Insecure defaults are fine on your laptop, never in production.
if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
  if (cfg.JWT_SECRET === 'dev_secret_change_me') console.warn('⚠️  SECURITY: JWT_SECRET is the default. Set a long random JWT_SECRET.');
  if (cfg.ADMIN_PASSWORD === 'ChangeMe@123') console.warn('⚠️  SECURITY: ADMIN_PASSWORD is the default. Set a strong ADMIN_PASSWORD, then run `npm run seed`.');
  if (!process.env.ENCRYPTION_KEY) console.warn('⚠️  ENCRYPTION_KEY is not set (falls back to JWT_SECRET). Set it once and never change it.');
}
module.exports = cfg;