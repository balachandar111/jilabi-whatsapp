const Product = require('../models/Product');
const { getSettings } = require('./settings');
const { variantsOf } = require('./catalog');

async function graph(path, { method = 'GET', body } = {}) {
  const s = await getSettings();
  if (!s.waToken) throw new Error('WhatsApp access token is not configured (Setup page)');
  const r = await fetch(`https://graph.facebook.com/${s.graphVersion}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${s.waToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error?.error_user_msg || data.error?.message || 'Graph API error');
    err.code = data.error?.code;
    console.error('Graph API error:', JSON.stringify(data.error || data));
    throw err;
  }
  return data;
}

async function wa(payload) {
  const s = await getSettings();
  if (!s.phoneNumberId) throw new Error('Phone Number ID is not configured (Setup page)');
  return graph(`${s.phoneNumberId}/messages`, { method: 'POST', body: { messaging_product: 'whatsapp', ...payload } });
}

const safe = (fn) => (...a) => fn(...a).catch(() => {}); // bot never crashes on send errors
const cut = (v, n) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

const sendText = (to, body) => wa({ to, type: 'text', text: { body: String(body).slice(0, 4000), preview_url: true } });

// max 3 buttons, title <= 20 chars
const sendButtons = (to, body, buttons) => wa({
  to, type: 'interactive',
  interactive: {
    type: 'button', body: { text: cut(body, 1024) },
    action: { buttons: buttons.slice(0, 3).map(([id, title]) => ({ type: 'reply', reply: { id, title: cut(title, 20) } })) },
  },
});

// rows: [id, title(24), description(72)?]  — WhatsApp allows max 10 rows in total
const sendList = (to, body, button, rows, sectionTitle = 'Options') => wa({
  to, type: 'interactive',
  interactive: {
    type: 'list', body: { text: cut(body, 1024) },
    action: {
      button: cut(button, 20),
      sections: [{ title: cut(sectionTitle, 24), rows: rows.slice(0, 10).map(([id, title, description]) => ({ id, title: cut(title, 24), ...(description ? { description: cut(description, 72) } : {}) })) }],
    },
  },
});

// Asks the customer to tap "Send location" (used to route to the nearest outlet)
const sendLocationRequest = (to, body) => wa({
  to, type: 'interactive',
  interactive: { type: 'location_request_message', body: { text: cut(body, 1024) }, action: { name: 'send_location' } },
});

const sendLocation = (to, { lat, lng, name, address }) => wa({
  to, type: 'location', location: { latitude: lat, longitude: lng, name: cut(name, 100), address: cut(address, 200) },
});

const clean = (v) => String(v).replace(/\s+/g, ' ').trim().slice(0, 60) || '-';
const sendTemplate = (to, name, params = [], lang = 'en') => wa({
  to, type: 'template',
  template: {
    name, language: { code: lang },
    components: params.length ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: clean(p) })) }] : undefined,
  },
});

// OTP: approved AUTHENTICATION template first (works any time); plain text fallback (only inside the 24h window)
async function sendOtp(to, code, lang = 'en') {
  try {
    return await wa({
      to, type: 'template',
      template: {
        name: 'login_otp', language: { code: lang },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ],
      },
    });
  } catch (e) {
    return sendText(to, `🔐 Your verification code is *${code}*. It is valid for 10 minutes. Do not share it with anyone.`);
  }
}

// Category -> WhatsApp catalog list (if Catalog ID set) or a paged list menu (9 items/page + "More")
const PAGE = 9;
async function sendProducts(to, category, page = 0, label = category) {
  const s = await getSettings();
  const list = await Product.find({ category, available: true }).sort({ name: 1 });
  if (!list.length) return sendText(to, `Sorry, no ${label} items are available right now. Send "hi" to go back.`);

  if (s.catalogId) {
    const items = list.flatMap(p => variantsOf(p).map(v => ({ product_retailer_id: v.sku || p.code }))).slice(0, 30);
    return wa({
      to, type: 'interactive',
      interactive: {
        type: 'product_list',
        header: { type: 'text', text: cut(label, 60) },
        body: { text: 'Select items, add to cart and tap *Send* 🛒' },
        action: { catalog_id: s.catalogId, sections: [{ title: cut(label, 24), product_items: items }] },
      },
    });
  }
  const slice = list.slice(page * PAGE, page * PAGE + PAGE);
  const rows = slice.map(p => {
    const vs = variantsOf(p);
    const price = vs.length > 1 ? `From ₹${Math.min(...vs.map(v => v.price))} · ${vs.map(v => v.label).join(' / ')}` : `₹${vs[0].price} / ${vs[0].label}`;
    return [`prod_${p.code}`, p.name, price];
  });
  if (list.length > (page + 1) * PAGE) rows.push([`more_${category}_${page + 1}`, 'More items ➡️', `Page ${page + 2}`]);
  return sendList(to, `Our ${label} — choose one:`, 'View items', rows, label);
}

module.exports = {
  graph, wa, sendText, sendButtons, sendList, sendLocationRequest, sendLocation, sendTemplate, sendOtp, sendProducts,
  safeText: safe(sendText), safeButtons: safe(sendButtons), safeList: safe(sendList),
  safeLocationRequest: safe(sendLocationRequest), safeLocation: safe(sendLocation),
};
