// Offline end-to-end test of the WhatsApp bot flow: no MongoDB, no Meta, no Razorpay needed.
// Models are replaced by in-memory fakes and fetch() is stubbed, so the REAL bot/whatsapp/geo code runs
// and every outgoing WhatsApp payload is checked against Meta's size limits.   Run: npm test
const Module = require('module');
const assert = require('assert');
process.env.WA_TOKEN = 'tok'; process.env.PHONE_NUMBER_ID = 'PID'; process.env.RZP_KEY_ID = 'k'; process.env.RZP_KEY_SECRET = 's';
process.env.JWT_SECRET = 'test'; process.env.APP_SECRET = '';

/* ---------- tiny in-memory model fake ---------- */
const get = (o, path) => path.split('.').reduce((a, k) => (Array.isArray(a) ? a.flatMap(x => x?.[k]) : a?.[k]), o);
const match = (doc, q = {}) => Object.entries(q).every(([k, cond]) => {
  const v = get(doc, k);
  if (cond && typeof cond === 'object' && cond.$in) return cond.$in.some(x => (Array.isArray(v) ? v.includes(x) : v === x));
  return Array.isArray(v) ? v.includes(cond) : v === cond;
});
function makeModel(name, defaults = () => ({})) {
  const rows = [];
  const wrap = (d) => { if (!d) return d; d.save = async () => d; d.markModified = () => {}; return d; };
  const chain = (arr) => { const p = Promise.resolve(arr); p.sort = () => chain(arr); p.select = () => chain(arr); p.limit = () => chain(arr); p.lean = () => p; return p; };
  return {
    name, rows,
    find: (q) => chain(rows.filter(r => match(r, q))),
    findOne: (q) => chain(wrap(rows.find(r => match(r, q)) || null)),
    create: async (d) => { const r = wrap({ ...defaults(), ...d }); rows.push(r); return r; },
    insertMany: async (a) => a.forEach(d => rows.push(wrap({ ...defaults(), ...d }))),
    findOneAndUpdate: async (q, set, o) => { let r = rows.find(x => match(x, q)); if (!r && o?.upsert) { r = wrap({ ...defaults() }); rows.push(r); } if (r) Object.assign(r, set); return r; },
    deleteOne: async (q) => { const i = rows.findIndex(r => match(r, q)); if (i >= 0) rows.splice(i, 1); },
    deleteMany: async () => { rows.length = 0; },
    countDocuments: async () => rows.length,
  };
}
const M = {
  Session: makeModel('Session', () => ({ step: 'menu', cart: [], details: {}, pending: null })),
  Product: makeModel('Product'), Branch: makeModel('Branch'), Order: makeModel('Order', () => ({ paymentStatus: 'pending', status: 'new', createdAt: new Date() })),
  BulkEnquiry: makeModel('BulkEnquiry'), Setting: makeModel('Setting'),
};
M.Setting.findOne = () => { const p = Promise.resolve({ deliveryFee: '40', freeDeliveryAbove: '500', maxDeliveryKm: '10', ownerPhone: '919999999999', shopName: 'Krishna Jelabi Kadai' }); p.lean = () => p; return p; };
const orig = Module._load;
Module._load = function (req, parent, ...r) {
  const m = /models\/(\w+)$/.exec(req);
  return m && M[m[1]] ? M[m[1]] : orig.call(this, req, parent, ...r);
};

/* ---------- capture every outgoing call ---------- */
let out = [];
global.fetch = async (url, opts) => {
  const body = opts?.body ? JSON.parse(opts.body) : {};
  if (String(url).includes('razorpay')) return { ok: true, json: async () => ({ short_url: 'https://rzp.io/i/TEST', id: 'plink_1' }) };
  out.push(body);
  return { ok: true, json: async () => ({ messages: [{ id: 'wamid.X' }] }) };
};

const { handle } = require('../src/services/bot');
const { pickupSlots, km } = require('../src/services/geo');

/* ---------- helpers ---------- */
const P = '919876543210';
let n = 0;
const lens = (msg) => {                       // Meta hard limits
  const i = msg.interactive; if (!i) return;
  const chk = (t, max, what) => assert(String(t).length <= max, `${what} too long (${String(t).length}>${max}): ${t}`);
  chk(i.body?.text || '', 1024, 'body');
  if (i.type === 'button') { assert(i.action.buttons.length <= 3, '>3 buttons'); i.action.buttons.forEach(b => chk(b.reply.title, 20, 'button title')); }
  if (i.type === 'list') {
    chk(i.action.button, 20, 'list button');
    const rows = i.action.sections.flatMap(s => s.rows); assert(rows.length <= 10, '>10 rows');
    i.action.sections.forEach(s => chk(s.title, 24, 'section title'));
    rows.forEach(r => { chk(r.title, 24, 'row title'); if (r.description) chk(r.description, 72, 'row desc'); });
  }
};
const send = async (m) => { out = []; await handle({ from: P, id: 'm' + ++n, ...m }, { profileName: 'Ravi' }); out.forEach(lens); return out; };
const say = (t) => send({ type: 'text', text: { body: t } });
const tap = (id) => send({ type: 'interactive', interactive: { button_reply: { id, title: id } } });
const pick = (id) => send({ type: 'interactive', interactive: { list_reply: { id, title: id } } });
const pin = (lat, lng) => send({ type: 'location', location: { latitude: lat, longitude: lng } });
const text = (o) => o.map(x => x.text?.body || x.interactive?.body?.text || '').join('\n---\n');
const ids = (o) => o.flatMap(x => x.interactive?.action?.buttons?.map(b => b.reply.id) || x.interactive?.action?.sections?.flatMap(s => s.rows.map(r => r.id)) || []);

(async () => {
  // seed
  M.Branch.rows.push(...[
    { code: 'KDB', name: 'Kodambakkam', address: 'Kodambakkam', lat: 13.0512, lng: 80.2246, active: true, openTime: '09:00', closeTime: '21:00' },
    { code: 'NGB', name: 'Nungambakkam', address: 'Nungambakkam', lat: 13.0604, lng: 80.2426, active: true, openTime: '09:00', closeTime: '21:00' },
    { code: 'SLG', name: 'Saligramam', address: 'Saligramam', lat: 13.0508, lng: 80.2027, active: true, openTime: '09:00', closeTime: '21:00' },
  ]);
  const sz = [{ label: '250g', price: 120 }, { label: '500g', price: 230 }, { label: '1kg', price: 450 }];
  M.Product.rows.push(
    { code: 'SW001', name: 'Mysore Pak', category: 'sweet', price: 120, unit: '250g', variants: sz, unavailableAt: ['NGB'], available: true },
    { code: 'SW002', name: 'Jalebi', category: 'sweet', price: 90, unit: '250g', variants: [], unavailableAt: [], available: true },
    ...Array.from({ length: 12 }, (_, i) => ({ code: 'KA' + String(i + 1).padStart(3, '0'), name: 'Savory item number ' + (i + 1) + ' long name', category: 'kaaram', price: 80, unit: '250g', variants: [], unavailableAt: [], available: true })),
  );

  // 1. geo
  assert(Math.abs(km(13.0512, 80.2246, 13.0604, 80.2426) - 2.2) < 0.4, 'haversine');
  const sl = pickupSlots(M.Branch.rows[0], new Date('2026-09-30T08:00:00Z'));   // 13:30 IST
  assert.strictEqual(sl[0].label, 'Today 3 PM-4 PM'); assert(sl.length <= 9);
  assert(pickupSlots(M.Branch.rows[0], new Date('2026-09-30T17:00:00Z'))[0].label.startsWith('Tomorrow'), 'after closing -> tomorrow');

  // 2. greeting -> menu
  let o = await say('hi');
  assert(ids(o).includes('cat_sweet') && ids(o).includes('bulk_start') && ids(o).includes('outlets'), 'menu rows');

  // 3. category + paging (12 savories -> 9 + More)
  o = await pick('cat_kaaram'); assert(ids(o).includes('more_kaaram_1'), 'page 1 has More');
  o = await pick('more_kaaram_1'); assert(!ids(o).some(i => i.startsWith('more_')), 'last page has no More');

  // 4. variants + qty + merge
  o = await pick('cat_sweet'); assert(ids(o).includes('prod_SW001'));
  o = await pick('prod_SW001'); assert.deepStrictEqual(ids(o), ['var_SW001_0', 'var_SW001_1', 'var_SW001_2']);
  o = await tap('var_SW001_1'); assert(text(o).includes('500g'));
  o = await tap('qty_2'); assert(text(o).includes('Mysore Pak (500g) × 2 = ₹460'), text(o));
  o = await tap('add_more'); assert(ids(o).includes('view_cart'), 'cart row in menu');
  o = await pick('prod_SW002');                     // single-size product skips size step
  assert(text(o).includes('How many'), 'single size goes to qty');
  o = await say('3'); assert(text(o).includes('Jalebi (250g) × 3 = ₹270'));
  o = await tap('checkout'); assert(text(o).includes('Subtotal: ₹730'), text(o));
  o = await say('Ravi Kumar'); assert.deepStrictEqual(ids(o), ['ful_delivery', 'ful_pickup', 'cancel']); assert(/delivery is free/i.test(text(o)));

  // 5. delivery -> location pin near Nungambakkam: Mysore Pak is OUT at NGB -> must fall to next nearest (KDB)
  o = await tap('ful_delivery'); assert.strictEqual(o[0].interactive.type, 'location_request_message');
  o = await pin(13.0600, 80.2420);
  assert(text(o).includes('Kodambakkam'), 'stock-aware routing should skip NGB: ' + text(o));
  o = await say('12 South Usman Road, T Nagar, Chennai 600017'); assert(text(o).includes('Order Summary') && text(o).includes('From: Kodambakkam'), text(o));
  assert(text(o).includes('Delivery: Free'), 'free delivery above 500');

  // 6. pay -> order + payment link
  o = await tap('pay'); const order = M.Order.rows[0];
  assert(text(o).includes('https://rzp.io/i/TEST') && order.amount === 730 && order.branchCode === 'KDB' && order.fulfilment === 'delivery', JSON.stringify(order));

  // 7. track
  o = await say('track'); assert(text(o).includes('Payment pending') && text(o).includes('Delivery from Kodambakkam'), text(o));

  // 8. far away pin -> outside radius
  await say('hi'); await pick('cat_sweet'); await pick('prod_SW002'); await say('1'); await tap('checkout'); await say('Ravi'); await tap('ful_delivery');
  o = await pin(12.9, 80.0); assert(text(o).includes('outside our 10 km'), text(o)); assert(ids(o).includes('ful_pickup'));

  // 9. typed address instead of pin -> choose outlet, then delivery fee applies (subtotal 90 < 500)
  await say('hi'); await pick('cat_sweet'); await pick('prod_SW002'); await say('1'); await tap('checkout'); await say('Ravi'); await tap('ful_delivery');
  o = await say('Near Vadapalani temple, Chennai 600026'); assert(ids(o).includes('br_SLG'), 'outlet chooser');
  o = await pick('br_SLG'); assert(text(o).includes('Delivery: ₹40') && text(o).includes('*Total: ₹130*'), text(o));

  // 10. pickup with slots; item out of stock at NGB must hide NGB
  await say('hi'); await pick('cat_sweet'); await pick('prod_SW001'); await tap('var_SW001_0'); await tap('qty_1'); await tap('checkout'); await say('Ravi'); 
  o = await tap('ful_pickup'); assert(!ids(o).includes('br_NGB') && ids(o).includes('br_KDB'), 'NGB hidden: ' + ids(o));
  o = await pick('br_KDB'); assert(ids(o).some(i => i.startsWith('slot_')), 'slots offered');
  o = await pick('slot_0'); assert(text(o).includes('Pickup: Kodambakkam') && text(o).includes('Delivery: Free'), text(o));
  o = await tap('pay'); const po = M.Order.rows[M.Order.rows.length - 1];
  assert(po.fulfilment === 'pickup' && po.deliveryFee === 0 && po.pickupSlot, JSON.stringify(po));

  // 11. bulk enquiry
  await say('hi'); o = await pick('bulk_start'); assert(ids(o).includes('bulk_wedding'));
  await pick('bulk_wedding'); await say('500 assorted sweet boxes, budget 2 lakh'); o = await say('25 Oct evening');
  const bq = M.BulkEnquiry.rows[0]; assert(bq && bq.type === 'wedding' && bq.name === 'Ravi' && /BQ/.test(bq.enquiryId), JSON.stringify(bq));
  assert(out.some(x => x.to === '919999999999'), 'owner alerted');

  // 12. outlets: text + 3 location pins
  o = await say('hi'); o = await pick('outlets'); assert.strictEqual(o.filter(x => x.type === 'location').length, 3);

  // 13. cancel
  await say('hi'); o = await pick('cat_sweet'); o = await tap('cancel'); assert(text(o).includes('cancelled'));

  console.log('ALL BOT FLOW TESTS PASSED ✅  (' + n + ' simulated WhatsApp messages)');
})().catch(e => { console.error('TEST FAILED ❌\n', e.stack || e); process.exit(1); });
