// Razorpay Payment Links (UPI / cards / netbanking) via plain REST — no SDK needed.
const { getSettings } = require('./settings');

async function rzp(path, { method = 'GET', body } = {}) {
  const s = await getSettings();
  if (!s.rzpKeyId || !s.rzpKeySecret) throw new Error('Razorpay keys are not configured (Setup page)');
  const r = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${s.rzpKeyId}:${s.rzpKeySecret}`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.description || 'Razorpay error');
  return data;
}

// Creates a payment link for an order; reference_id = our orderId (used by the webhook to find the order)
async function createPaymentLink(order) {
  const data = await rzp('payment_links', {
    method: 'POST',
    body: {
      amount: Math.round(order.amount * 100),        // paise
      currency: 'INR',
      reference_id: order.orderId,
      description: `Order ${order.orderId}`,
      customer: { name: order.name, contact: `+${order.phone}` },
      notify: { sms: false, email: false },
      reminder_enable: false,
      expire_by: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 h (Razorpay needs >= 15 min)
    },
  });
  return data.short_url;
}

// Cheap call to validate the key pair
async function testRazorpay() { await rzp('payment_links?count=1'); return true; }

module.exports = { createPaymentLink, testRazorpay };
