// Marks an order as paid and sends the customer confirmation + owner/branch alerts.
// Used by the Razorpay webhook (real payment) and by the bot when SKIP_PAYMENT=true (testing).
const Session = require('../models/Session');
const Branch = require('../models/Branch');
const { safeText } = require('./whatsapp');
const { getSettings } = require('./settings');

async function confirmPaid(order, paymentId) {
  const s = await getSettings();
  order.paymentStatus = 'paid';
  order.paidAt = new Date();
  order.paymentId = paymentId;
  await order.save();
  await Session.deleteOne({ phone: order.phone });

  const items = order.items.map(i => `• ${i.name}${i.variant ? ` (${i.variant})` : ''} × ${i.qty} = ₹${i.price * i.qty}`).join('\n');
  const where = order.fulfilment === 'pickup'
    ? `🏬 Pickup: ${order.branchName}${order.pickupSlot ? '\n🕒 ' + order.pickupSlot : ''}`
    : `🚚 Delivery to:\n${order.address}`;
  await safeText(order.phone, `🎉 *Order Confirmed!* Thank you, ${order.name}.\n\n*Order ${order.orderId}*\n${items}\n${order.deliveryFee ? `Delivery: ₹${order.deliveryFee}\n` : ''}*${paymentId === 'TEST-NO-PAYMENT' ? 'Total' : 'Paid'}: ₹${order.amount}*\n\n${where}\n\nWe'll update you here: Packed → ${order.fulfilment === 'pickup' ? 'Ready for pickup' : 'Out for delivery'} → Delivered. Send *track* anytime.`);

  const alert = `🆕 ${paymentId === 'TEST-NO-PAYMENT' ? 'TEST ORDER (no payment)' : 'PAID ORDER'} ${order.orderId} — ${order.fulfilment.toUpperCase()} @ ${order.branchName}\n${items}\nTotal ₹${order.amount}\n${order.name} (+${order.phone})\n${order.address}${order.pickupSlot ? '\nSlot: ' + order.pickupSlot : ''}`;
  const branch = await Branch.findOne({ code: order.branchCode });
  const targets = new Set([s.ownerPhone, branch?.alertPhone].filter(Boolean));
  for (const t of targets) await safeText(t, alert);
}
module.exports = { confirmPaid };