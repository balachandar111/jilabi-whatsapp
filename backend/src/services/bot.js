const Product = require('../models/Product');
const Order = require('../models/Order');
const Session = require('../models/Session');
const Branch = require('../models/Branch');
const BulkEnquiry = require('../models/BulkEnquiry');
const { createPaymentLink } = require('./razorpay');
const W = require('./whatsapp');
const { getSettings } = require('./settings');
const { CATS, variantsOf, resolveSku, refreshCart } = require('./catalog');
const { rank, pickupSlots } = require('./geo');

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const total = (cart) => cart.reduce((t, i) => t + i.price * i.qty, 0);
const cartText = (cart) => cart.map(i => `• ${i.name}${i.variant ? ` (${i.variant})` : ''} × ${i.qty} = ${inr(i.price * i.qty)}`).join('\n');
const newId = (p) => `${p}${Date.now().toString(36).toUpperCase()}`;
const feeFor = (cfg, fulfilment, subtotal) =>
  fulfilment !== 'delivery' ? 0 : (cfg.freeAboveN && subtotal >= cfg.freeAboveN ? 0 : cfg.deliveryFeeN);

async function save(s) {
  s.updatedAt = new Date();
  ['cart', 'details', 'pending'].forEach(k => s.markModified(k));
  await s.save();
}

// names of cart items that are switched off at this branch
async function missingAt(cart, branchCode) {
  const ps = await Product.find({ code: { $in: cart.map(i => i.code) } }).select('name unavailableAt');
  return ps.filter(p => (p.unavailableAt || []).includes(branchCode)).map(p => p.name);
}

/* ------------------------------ menus ------------------------------ */
async function sendMenu(to, s) {
  const cfg = await getSettings();
  const rows = [
    ['cat_sweet', '🍬 Sweets', 'Traditional sweets & mithai'],
    ['cat_kaaram', '🌶️ Savories', 'Mixture, murukku & snacks'],
    ['cat_ghee', '🧈 Ghee Mithai', 'Pure ghee specialities'],
    ['bulk_start', '🎁 Bulk & Gifting', 'Wedding, festival, corporate'],
    ['track', '📦 Track my order', 'Latest order status'],
    ['outlets', '📍 Our outlets', 'Address, phone & map'],
  ];
  if (s?.cart?.length) rows.unshift(['view_cart', `🛒 My cart (${s.cart.reduce((n, i) => n + i.qty, 0)})`, inr(total(s.cart))]);
  return W.safeList(to, `🙏 Welcome to *${cfg.shopName}*!\nWhat would you like to do?`, 'Open menu', rows, 'Menu');
}

async function sendOutlets(to) {
  const list = await Branch.find({ active: true }).sort({ name: 1 });
  if (!list.length) return W.safeText(to, 'Outlet details are not available right now. Please try later 🙏');
  const txt = list.map(b => `📍 *${b.name}*\n${b.address || ''}\n${b.phone ? '📞 ' + b.phone + '\n' : ''}🕘 ${b.openTime} – ${b.closeTime}`).join('\n\n');
  await W.safeText(to, `*Our outlets*\n\n${txt}`);
  for (const b of list.slice(0, 3)) await W.safeLocation(to, { lat: b.lat, lng: b.lng, name: b.name, address: b.address });
}

const STATUS_LINE = {
  new: '✅ Order confirmed — we are preparing it',
  packed: '📦 Packed',
  ready: '🏬 Ready for pickup',
  dispatched: '🚚 Out for delivery',
  delivered: '🎉 Delivered',
  cancelled: '❌ Cancelled',
};
async function sendTrack(to) {
  const o = await Order.findOne({ phone: to }).sort({ createdAt: -1 });
  if (!o) return W.safeText(to, 'No orders found for this number yet. Send "hi" to place one 🙏');
  let line;
  if (o.paymentStatus === 'expired') line = '⌛ Payment link expired — send "hi" to place the order again';
  else if (o.paymentStatus === 'pending') line = `💳 Payment pending\n${o.paymentLink || ''}`;
  else line = STATUS_LINE[o.status] || o.status;
  const where = o.fulfilment === 'pickup' ? `🏬 Pickup: ${o.branchName}${o.pickupSlot ? ' — ' + o.pickupSlot : ''}` : `🚚 Delivery from ${o.branchName || 'our outlet'}`;
  const rider = o.status === 'dispatched' && o.rider?.name ? `\n🛵 Rider: ${o.rider.name}${o.rider.phone ? ' (' + o.rider.phone + ')' : ''}${o.rider.trackingUrl ? '\n🔗 ' + o.rider.trackingUrl : ''}` : '';
  return W.safeText(to, `*Order ${o.orderId}*\n${cartText(o.items)}\n*Total: ${inr(o.amount)}*\n${where}\n\n*Status:* ${line}${rider}`);
}

/* ------------------------------ ordering ------------------------------ */
async function showCart(to, s) {
  if (!s.cart.length) return sendMenu(to, s);
  return W.safeButtons(to, `🛒 *Your cart*\n${cartText(s.cart)}\n\n*Subtotal: ${inr(total(s.cart))}*`,
    [['checkout', '🧾 Checkout'], ['add_more', '➕ Add more'], ['clear_cart', '🗑 Clear cart']]);
}

async function chooseSize(to, s, code) {
  const p = await Product.findOne({ code, available: true });
  if (!p) return sendMenu(to, s);
  const vs = variantsOf(p);
  s.pending = { code: p.code, name: p.name };
  if (vs.length === 1) return askQty(to, s, vs[0]);
  s.step = 'size'; await save(s);
  const body = `*${p.name}*\nChoose a size:`;
  if (vs.length <= 3) return W.safeButtons(to, body, vs.map((v, i) => [`var_${p.code}_${i}`, `${v.label} ${inr(v.price)}`]));
  return W.safeList(to, body, 'Choose size', vs.slice(0, 10).map((v, i) => [`var_${p.code}_${i}`, v.label, inr(v.price)]), 'Sizes');
}

async function askQty(to, s, v) {
  s.pending = { ...s.pending, variant: v.label, price: v.price, sku: v.sku || '' };
  s.step = 'qty'; await save(s);
  return W.safeButtons(to, `*${s.pending.name}* (${v.label}) — ${inr(v.price)}\nHow many? Tap a quantity or type a number (1-20).`,
    [['qty_1', '1'], ['qty_2', '2'], ['qty_5', '5']]);
}

async function addToCart(to, s, q) {
  if (!s.pending?.code) return sendMenu(to, s);
  const cart = [...s.cart];
  const at = cart.findIndex(i => i.code === s.pending.code && i.variant === s.pending.variant);
  if (at >= 0) cart[at] = { ...cart[at], qty: Math.min(cart[at].qty + q, 50) };
  else cart.push({ ...s.pending, qty: q });
  s.cart = cart; s.pending = null; s.step = 'menu'; await save(s);
  return W.safeButtons(to, `Added ✅\n\n${cartText(s.cart)}\n\n*Subtotal: ${inr(total(s.cart))}*`,
    [['add_more', '➕ Add more'], ['checkout', '🧾 Checkout'], ['cancel', '❌ Cancel']]);
}

async function askName(to, s) {
  if (!s.cart.length) return sendMenu(to, s);
  if (s.details?.name) return askFulfilment(to, s);
  s.step = 'name'; await save(s);
  return W.safeText(to, `🛒 *Your cart*\n${cartText(s.cart)}\n\n*Subtotal: ${inr(total(s.cart))}*\n\nPlease enter your *full name*:`);
}

async function askFulfilment(to, s) {
  s.step = 'fulfilment'; await save(s);
  const cfg = await getSettings();
  const sub = total(s.cart);
  const fee = feeFor(cfg, 'delivery', sub);
  const feeTxt = fee ? `Delivery charge ${inr(fee)}${cfg.freeAboveN ? ` (free above ${inr(cfg.freeAboveN)})` : ''}` : 'Delivery is free';
  return W.safeButtons(to, `Thanks ${s.details.name}! 🙏\nSubtotal: *${inr(sub)}*\n${feeTxt}\n\nHow would you like to receive your order?`,
    [['ful_delivery', '🚚 Home delivery'], ['ful_pickup', '🏬 Self pickup'], ['cancel', '❌ Cancel']]);
}

// Nearest ACTIVE branch (inside the delivery radius) that stocks every item in the cart
async function routeDelivery(to, s, lat, lng) {
  const cfg = await getSettings();
  const branches = await Branch.find({ active: true });
  if (!branches.length) { await W.safeText(to, 'Sorry, no outlet is available right now. Please try again later 🙏'); return; }
  const ranked = rank(branches, lat, lng);
  const within = cfg.maxKmN ? ranked.filter(r => r.d <= cfg.maxKmN) : ranked;
  if (!within.length) {
    return W.safeButtons(to, `Sorry, you are ${ranked[0].d.toFixed(1)} km from our nearest outlet (${ranked[0].b.name}) — outside our ${cfg.maxKmN} km delivery area.\nYou can still collect from an outlet.`,
      [['ful_pickup', '🏬 Self pickup'], ['cancel', '❌ Cancel']]);
  }
  let pick = null;
  for (const r of within) if (!(await missingAt(s.cart, r.b.code)).length) { pick = r; break; }
  if (!pick) {
    const miss = await missingAt(s.cart, within[0].b.code);
    return W.safeButtons(to, `Sorry, ${miss.join(', ')} is not available at ${within[0].b.name} right now. Please edit your cart or try later.`,
      [['view_cart', '🛒 Edit cart'], ['cancel', '❌ Cancel']]);
  }
  s.details = { ...s.details, lat, lng, branchCode: pick.b.code, branchName: pick.b.name, distanceKm: Math.round(pick.d * 10) / 10 };
  s.step = 'address'; await save(s);
  return W.safeText(to, `📍 Nearest outlet: *${pick.b.name}* (${pick.d.toFixed(1)} km)\n\nNow send your *full delivery address with landmark & pincode*:`);
}

// Customer typed an address instead of sharing a pin -> let them pick the outlet
async function askBranch(to, s, step) {
  const branches = await Branch.find({ active: true }).sort({ name: 1 });
  const ok = [];
  for (const b of branches) if (!(await missingAt(s.cart, b.code)).length) ok.push(b);
  if (!ok.length) return W.safeText(to, 'Sorry, some items in your cart are not available at any outlet right now. Send "hi" to start again 🙏');
  s.step = step; await save(s);
  return W.safeList(to, step === 'pickup_branch' ? 'Which outlet will you collect from?' : 'Which outlet is nearest to you?',
    'Choose outlet', ok.map(b => [`br_${b.code}`, b.name, b.address]), 'Outlets');
}

async function sendSlots(to, s) {
  const branch = await Branch.findOne({ code: s.details.branchCode });
  const slots = pickupSlots(branch);
  if (!slots.length) {
    s.details = { ...s.details, slot: '', address: `Self pickup — ${s.details.branchName}` };
    return sendSummary(to, s);
  }
  s.pending = { slots }; s.step = 'slot'; await save(s);
  return W.safeList(to, `🏬 *${s.details.branchName}*\nPick a pickup time:`, 'Choose time', slots.map((x, i) => [`slot_${i}`, x.label]), 'Pickup slots');
}

async function sendSummary(to, s) {
  const cfg = await getSettings();
  const sub = total(s.cart), fee = feeFor(cfg, s.details.fulfilment, sub);
  s.step = 'confirm'; await save(s);
  const where = s.details.fulfilment === 'pickup'
    ? `🏬 Pickup: ${s.details.branchName}${s.details.slot ? '\n🕒 ' + s.details.slot : ''}`
    : `📍 ${s.details.address}\n🏬 From: ${s.details.branchName}${s.details.distanceKm != null ? ` (${s.details.distanceKm} km)` : ''}`;
  return W.safeButtons(to,
    `📋 *Order Summary*\n${cartText(s.cart)}\n\nSubtotal: ${inr(sub)}\nDelivery: ${fee ? inr(fee) : 'Free'}\n*Total: ${inr(sub + fee)}*\n\n👤 ${s.details.name}\n${where}\n\nConfirm and pay?`,
    [['pay', '✅ Pay Now'], ['cancel', '❌ Cancel']]);
}

async function pay(to, s) {
  const cfg = await getSettings();
  const cart = await refreshCart(s.cart || []);
  if (!cart.length || !s.details.name || !s.details.branchCode) return sendMenu(to, s);
  const d = s.details, sub = total(cart), fee = feeFor(cfg, d.fulfilment, sub);
  const order = await Order.create({
    orderId: newId('KJ'), phone: to, name: d.name, address: d.address, items: cart,
    subtotal: sub, deliveryFee: fee, amount: sub + fee,
    fulfilment: d.fulfilment, branchCode: d.branchCode, branchName: d.branchName, distanceKm: d.distanceKm,
    location: d.lat != null ? { lat: d.lat, lng: d.lng } : undefined, pickupSlot: d.slot || '',
  });
  try {
    order.paymentLink = await createPaymentLink(order);
    await order.save();
    s.cart = cart; s.step = 'awaiting_payment'; await save(s);
    return W.safeText(to, `💳 Please pay *${inr(order.amount)}* using this secure link (UPI / cards / netbanking):\n${order.paymentLink}\n\nOrder ID: *${order.orderId}*\nWe'll confirm here as soon as payment is received ✅`);
  } catch (e) {
    console.error('Payment link error:', e.message);
    await Order.deleteOne({ _id: order._id });
    return W.safeText(to, 'Sorry, could not create the payment link. Please try again in a moment.');
  }
}

/* ------------------------------ bulk / gifting ------------------------------ */
const BULK = { bulk_wedding: 'wedding', bulk_festival: 'festival', bulk_corporate: 'corporate', bulk_other: 'other' };

async function finishBulk(to, s, neededBy, ctx) {
  const cfg = await getSettings();
  const name = s.details?.name || ctx.profileName || 'Customer';
  const q = await BulkEnquiry.create({
    enquiryId: newId('BQ'), phone: to, name, type: s.pending.type, details: s.pending.details, neededBy,
  });
  await Session.deleteOne({ phone: to });
  await W.safeText(to, `🎁 Thank you${name !== 'Customer' ? ', ' + name : ''}! Your bulk enquiry *${q.enquiryId}* is received.\nOur team will call/WhatsApp you shortly with a quote.\n\nSend "hi" anytime for the main menu 🙏`);
  if (cfg.ownerPhone)
    await W.safeText(cfg.ownerPhone, `🎁 BULK ENQUIRY ${q.enquiryId} (${q.type})\n${q.details}\nNeeded by: ${q.neededBy}\n${name} (+${to})`);
}

/* ------------------------------ main handler ------------------------------ */
async function handle(msg, ctx = {}) {
  const from = msg.from;
  const txt = (msg.text?.body || '').trim();
  const reply = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id;

  let s = await Session.findOne({ phone: from });

  // New / idle customer, or greeting -> ALWAYS show menu (fresh cart)
  if (!s || /^(hi+|hello|hey|menu|start|vanakkam|hola)$/i.test(txt)) {
    s = await Session.findOneAndUpdate(
      { phone: from },
      { phone: from, step: 'menu', cart: [], details: {}, pending: null, updatedAt: new Date() },
      { upsert: true, new: true });
    return sendMenu(from, s);
  }

  const typing = ['name', 'location', 'address', 'bulk_details', 'bulk_date', 'qty'].includes(s.step); // free-text steps: don't treat words as commands
  if (!typing && /^(track|status|my order)$/i.test(txt)) return sendTrack(from);
  if (!typing && /^(outlets?|branches|address|location)$/i.test(txt)) return sendOutlets(from);
  if (/^cart$/i.test(txt)) return showCart(from, s);

  if (reply === 'cancel') {
    await Session.deleteOne({ phone: from });
    return W.safeText(from, 'Order cancelled. Send "hi" anytime to start again 🙏');
  }
  if (reply === 'menu' || reply === 'add_more') return sendMenu(from, s);
  if (reply === 'track') return sendTrack(from);
  if (reply === 'outlets') return sendOutlets(from);
  if (reply === 'view_cart') return showCart(from, s);
  if (reply === 'clear_cart') { s.cart = []; s.details = {}; await save(s); return sendMenu(from, s); }
  if (reply === 'checkout') return askName(from, s);

  if (reply?.startsWith('cat_')) {
    const cat = reply.slice(4);
    if (!CATS[cat]) return sendMenu(from, s);
    s.step = 'browsing'; await save(s);
    return W.sendProducts(from, cat, 0, `${CATS[cat].label} ${CATS[cat].emoji}`).catch(() => {});
  }
  if (reply?.startsWith('more_')) {
    const [, cat, pg] = reply.split('_');
    if (!CATS[cat]) return sendMenu(from, s);
    return W.sendProducts(from, cat, parseInt(pg, 10) || 0, `${CATS[cat].label} ${CATS[cat].emoji}`).catch(() => {});
  }
  if (reply?.startsWith('prod_')) return chooseSize(from, s, reply.slice(5));
  if (reply?.startsWith('var_')) {
    const cut = reply.lastIndexOf('_');
    const p = await Product.findOne({ code: reply.slice(4, cut), available: true });
    const v = p && variantsOf(p)[parseInt(reply.slice(cut + 1), 10)];
    if (!v) return sendMenu(from, s);
    s.pending = { code: p.code, name: p.name };
    return askQty(from, s, v);
  }
  if (reply?.startsWith('qty_')) return addToCart(from, s, parseInt(reply.slice(4), 10) || 1);

  if (reply === 'ful_delivery') {
    s.details = { ...s.details, fulfilment: 'delivery' }; s.step = 'location'; await save(s);
    return W.safeLocationRequest(from, '📍 Please share your *delivery location* so we can route your order to the nearest outlet.\n\n(No location? Just type your area / full address.)');
  }
  if (reply === 'ful_pickup') {
    s.details = { ...s.details, fulfilment: 'pickup', address: '', lat: undefined, lng: undefined, distanceKm: undefined };
    return askBranch(from, s, 'pickup_branch');
  }
  if (reply?.startsWith('br_')) {
    const b = await Branch.findOne({ code: reply.slice(3), active: true });
    if (!b || !['pickup_branch', 'branch_pick'].includes(s.step)) return sendMenu(from, s);
    const miss = await missingAt(s.cart, b.code);
    if (miss.length) return W.safeText(from, `${miss.join(', ')} is not available at ${b.name}. Please choose another outlet.`);
    s.details = { ...s.details, branchCode: b.code, branchName: b.name };
    if (s.step === 'pickup_branch') return sendSlots(from, s);
    return sendSummary(from, s);            // manual delivery outlet pick (address already typed)
  }
  if (reply?.startsWith('slot_')) {
    const slot = s.pending?.slots?.[parseInt(reply.slice(5), 10)];
    if (!slot) return sendSlots(from, s);
    s.details = { ...s.details, slot: slot.label, address: `Self pickup — ${s.details.branchName}` };
    s.pending = null;
    return sendSummary(from, s);
  }
  if (reply === 'pay') return pay(from, s);

  if (reply === 'bulk_start') {
    s.step = 'bulk_type'; await save(s);
    return W.safeList(from, '🎁 *Bulk, gifting & catering*\nWhat is the occasion?', 'Choose occasion', [
      ['bulk_wedding', '💍 Wedding'], ['bulk_festival', '🪔 Festival gifting'], ['bulk_corporate', '🏢 Corporate'], ['bulk_other', '🎉 Other / catering'],
    ], 'Occasion');
  }
  if (BULK[reply]) {
    s.pending = { type: BULK[reply] }; s.step = 'bulk_details'; await save(s);
    return W.safeText(from, 'Please tell us *what you need* — items, approximate quantity / weight and budget (if any):');
  }

  // Cart sent from the WhatsApp catalog
  if (msg.type === 'order') {
    const cart = [];
    for (const it of msg.order?.product_items || []) {
      const hit = await resolveSku(it.product_retailer_id);
      const qty = Math.min(Math.max(parseInt(it.quantity, 10) || 0, 0), 50);
      if (hit && qty) cart.push({ code: hit.product.code, name: hit.product.name, variant: hit.variant.label, sku: hit.variant.sku || '', price: hit.variant.price, qty }); // price ALWAYS from DB
    }
    if (!cart.length) return W.safeText(from, 'Could not read your cart (items may be unavailable). Please try again.');
    s.cart = cart; await save(s);
    return askName(from, s);
  }

  // Customer shared a location pin
  if (msg.type === 'location' && s.step === 'location') {
    const { latitude, longitude } = msg.location || {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return W.safeText(from, 'Could not read that location. Please try again or type your address.');
    return routeDelivery(from, s, latitude, longitude);
  }

  switch (s.step) {
    case 'qty': {
      const q = parseInt(txt, 10);
      if (!(q >= 1 && q <= 20)) return W.safeText(from, 'Please enter a number between 1 and 20.');
      return addToCart(from, s, q);
    }
    case 'name':
      if (txt.length < 2) return W.safeText(from, 'Please enter a valid name.');
      s.details = { ...s.details, name: txt.slice(0, 60) };
      return askFulfilment(from, s);
    case 'location':                       // typed address instead of a pin
      if (txt.length < 10) return W.safeText(from, 'Please share your location pin, or type your complete address with pincode.');
      s.details = { ...s.details, address: txt.slice(0, 300) };
      return askBranch(from, s, 'branch_pick');
    case 'address':
      if (txt.length < 10) return W.safeText(from, 'Please send the complete address with pincode.');
      s.details = { ...s.details, address: txt.slice(0, 300) };
      return sendSummary(from, s);
    case 'bulk_details':
      if (txt.length < 5) return W.safeText(from, 'Please describe what you need (items, quantity, budget).');
      s.pending = { ...s.pending, details: txt.slice(0, 500) }; s.step = 'bulk_date'; await save(s);
      return W.safeText(from, 'When do you need it? (date & time, e.g. "25 Oct evening")');
    case 'bulk_date':
      if (txt.length < 2) return W.safeText(from, 'Please tell us the required date.');
      return finishBulk(from, s, txt.slice(0, 100), ctx);
    case 'awaiting_payment':
      return W.safeText(from, 'We are waiting for your payment 💳. Use the link above, or send "hi" to start a new order.');
    default:
      return sendMenu(from, s);
  }
}

module.exports = { handle };
