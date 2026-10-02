import { useEffect, useState } from 'react';
import { api } from '../api';

const genToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');

function Copy({ text }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className="btn small secondary" onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}>{ok ? 'Copied ✓' : 'Copy'}</button>;
}

export default function Setup() {
  const [v, setV] = useState(null);           // plain values
  const [sec, setSec] = useState({});         // secret inputs (empty = unchanged)
  const [masked, setMasked] = useState({});   // masked hints from server
  const [msg, setMsg] = useState(null);
  const [out, setOut] = useState({});         // results of test buttons
  const [testTo, setTestTo] = useState('');
  const [templates, setTemplates] = useState(null);
  const [busy, setBusy] = useState('');

  const load = async () => {
    const r = await api('/settings');
    setV(r.values); setMasked(r.secrets); setSec({});
  };
  useEffect(() => { load().catch(e => setMsg({ ok: false, text: e.message })); }, []);
  if (!v) return <p>Loading…</p>;

  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const setS = (k) => (e) => setSec({ ...sec, [k]: e.target.value });
  const base = (v.publicUrl || window.location.origin).replace(/\/$/, '');

  const save = async (e) => {
    e?.preventDefault(); setMsg(null); setBusy('save');
    try { await api('/settings', { method: 'PUT', body: { ...v, ...sec } }); await load(); setMsg({ ok: true, text: 'Saved ✅ (secrets are stored encrypted)' }); }
    catch (er) { setMsg({ ok: false, text: er.message }); }
    setBusy('');
  };

  const run = (key, fn) => async () => {
    setBusy(key); setOut(o => ({ ...o, [key]: null }));
    try { const text = await fn(); setOut(o => ({ ...o, [key]: { ok: true, text } })); }
    catch (er) { setOut(o => ({ ...o, [key]: { ok: false, text: er.message } })); }
    setBusy('');
  };

  const testWA = run('wa', async () => {
    const { info } = await api('/settings/test-whatsapp', { method: 'POST' });
    return `Connected ✅  ${info.verified_name || ''} · ${info.display_phone_number || ''} · quality: ${info.quality_rating || 'n/a'} · name status: ${info.name_status || 'n/a'}`;
  });
  const testTok = run('tok', async () => {
    const { info: i } = await api('/settings/test-token', { method: 'POST' });
    return `${i.valid ? 'Token is VALID ✅' : 'Token is INVALID ❌ ' + (i.error || '')}\nType: ${i.type} · belongs to your App ID: ${i.appMatches ? 'yes ✅' : 'NO ❌'}\nExpires: ${i.expires}\nPermissions: ${i.scopes.join(', ') || '(none)'}${i.expires !== 'never (permanent)' ? '\n⚠ Temporary token — fine for testing, generate a permanent System User token before go-live.' : ''}`;
  });
  const subscribe = run('sub', async () => {
    const r = await api('/settings/subscribe-app', { method: 'POST' });
    return `App subscribed to your WhatsApp Business Account ✅\nSubscribed apps: ${r.apps.join(', ') || '(none listed)'}`;
  });
  const sendTest = (mode) => run('send', async () => {
    await api('/settings/send-test', { method: 'POST', body: { to: testTo, mode } });
    return 'Message sent ✅ — check WhatsApp';
  })();
  const testRzp = run('rzp', async () => { await api('/settings/test-razorpay', { method: 'POST' }); return 'Razorpay keys valid ✅'; });
  const loadTpl = run('tpl', async () => { const t = await api('/settings/templates'); setTemplates(t); return `${t.length} template(s) found`; });
  const createTpl = run('tpl', async () => {
    const r = await api('/settings/templates/defaults', { method: 'POST' });
    setTemplates(await api('/settings/templates').catch(() => null));
    return r.map(x => `${x.name}: ${x.ok ? 'submitted for approval ✅' : '⚠ ' + x.error}`).join('\n');
  });

  const Result = ({ k }) => out[k] ? <pre className={out[k].ok ? 'success' : 'error'}>{out[k].text}</pre> : null;
  const field = (label, k, ph, extra) => (
    <label>{label}<input value={v[k] || ''} onChange={set(k)} placeholder={ph} />{extra}</label>);
  const secret = (label, k) => (
    <label>{label}<input type="password" autoComplete="new-password" value={sec[k] || ''} onChange={setS(k)}
      placeholder={masked[k] ? `${masked[k]}  (saved — leave blank to keep)` : 'Not set'} /></label>);

  return (
    <>
      <h1>WhatsApp & Payment Setup</h1>
      <p className="muted">Enter the values from Meta and Razorpay here (see the <b>Guide</b> page for where to find each one). Secrets are encrypted in MongoDB and never shown in full again.</p>

      <form onSubmit={save}>
        <div className="card">
          <h3>1 · Shop</h3>
          <div className="grid2">
            {field('Shop name (shown in welcome message)', 'shopName', 'Krishna Jelabi Kadai')}
            {field('Owner WhatsApp alert number (optional, with country code)', 'ownerPhone', '919876543210')}
            {field('Public URL of this backend (https://…)', 'publicUrl', 'https://abc123.ngrok.app')}
            {field('Delivery charge ₹ (0 = free)', 'deliveryFee', '40')}
            {field('Free delivery above ₹ (blank = never)', 'freeDeliveryAbove', '500')}
            {field('Max delivery distance from an outlet, km (blank = no limit)', 'maxDeliveryKm', '8')}
          </div>
        </div>

        <div className="card">
          <h3>2 · Meta WhatsApp Cloud API</h3>
          <div className="grid2">
            {field('App ID', 'appId', 'App Settings → Basic')}
            {secret('App Secret', 'appSecret')}
            {field('Graph API version', 'graphVersion', 'v25.0')}
            {field('Phone Number ID', 'phoneNumberId', 'from API Setup page')}
            {field('WhatsApp Business Account ID (WABA)', 'wabaId', 'needed for templates')}
            {secret('Permanent access token (System User)', 'waToken')}
            {field('Catalog ID (optional)', 'catalogId', 'leave empty to use list menus')}
            <label>Webhook verify token
              <div className="inline">
                <input value={v.verifyToken || ''} onChange={set('verifyToken')} placeholder="any random string" />
                <button type="button" className="btn small secondary" onClick={() => setV({ ...v, verifyToken: genToken() })}>Generate</button>
              </div>
            </label>
          </div>
          <div className="webhook-box">
            <b>Paste into Meta → WhatsApp → Configuration → Webhook:</b>
            <div className="inline"><code>{base}/webhook</code><Copy text={`${base}/webhook`} /></div>
            <div className="inline"><span className="muted">Verify token:</span><code>{v.verifyToken || '(generate one & save first)'}</code>{v.verifyToken && <Copy text={v.verifyToken} />}</div>
            <span className="muted">Subscribe to the <b>messages</b> field. Save these settings BEFORE clicking “Verify and save” in Meta.</span>
          </div>
        </div>

        <div className="card">
          <h3>3 · Razorpay</h3>
          <div className="grid2">
            {field('Key ID', 'rzpKeyId', 'rzp_test_xxxxx')}
            {secret('Key Secret', 'rzpKeySecret')}
            {secret('Webhook secret', 'rzpWebhookSecret')}
          </div>
          <div className="webhook-box">
            <b>Paste into Razorpay → Settings → Webhooks:</b>
            <div className="inline"><code>{base}/razorpay-webhook</code><Copy text={`${base}/razorpay-webhook`} /></div>
            <span className="muted">Events: payment_link.paid, payment_link.expired, payment_link.cancelled</span>
          </div>
        </div>

        {msg && <div className={msg.ok ? 'success' : 'error'}>{msg.text}</div>}
        <button className="btn" disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save settings'}</button>
      </form>

      <h2 style={{ marginTop: 28 }}>Test your setup</h2>
      <div className="card">
        <h3>1 · Check access token (uses App ID + App Secret)</h3>
        <p className="muted">Shows whether the token is valid, temporary or permanent, and which permissions it has (save first).</p>
        <button className="btn secondary" onClick={testTok} disabled={busy === 'tok'}>Check token</button>
        <Result k="tok" />
        <hr />
        <h3>2 · Test WhatsApp connection</h3>
        <p className="muted">Checks the token + Phone Number ID against Meta (save first).</p>
        <button className="btn secondary" onClick={testWA} disabled={busy === 'wa'}>Test connection</button>
        <Result k="wa" />
        <hr />
        <h3>3 · Subscribe app to the WhatsApp account (needed to receive customer messages)</h3>
        <button className="btn secondary" onClick={subscribe} disabled={busy === 'sub'}>Subscribe app to WABA</button>
        <Result k="sub" />
        <hr />
        <h3>4 · Send a test message</h3>
        <div className="inline">
          <input placeholder="919876543210" value={testTo} onChange={e => setTestTo(e.target.value)} />
          <button className="btn secondary" onClick={() => sendTest('template')} disabled={busy === 'send'}>Send hello_world template</button>
          <button className="btn secondary" onClick={() => sendTest('text')} disabled={busy === 'send'}>Send text (needs open 24h window)</button>
          <button className="btn secondary" onClick={() => sendTest('otp')} disabled={busy === 'send'}>Send sample OTP (login_otp template)</button>
        </div>
        <Result k="send" />
        <hr />
        <h3>5 · Test Razorpay keys</h3>
        <button className="btn secondary" onClick={testRzp} disabled={busy === 'rzp'}>Test Razorpay</button>
        <Result k="rzp" />
      </div>

      <div className="card">
        <h3>Message templates (for order status updates after 24 hours)</h3>
        <p className="muted">The admin dashboard sends a normal message first; if the customer's 24-hour window is closed it automatically falls back to the approved <code>order_packed / order_ready / order_dispatched / order_delivered / order_cancelled</code> templates. “Create” also submits the <code>login_otp</code> authentication template used for website OTP login.</p>
        <div className="inline">
          <button className="btn secondary" onClick={loadTpl} disabled={busy === 'tpl'}>Refresh list</button>
          <button className="btn" onClick={createTpl} disabled={busy === 'tpl'}>Create the order + OTP templates</button>
        </div>
        <Result k="tpl" />
        {templates && (
          <table style={{ marginTop: 12 }}>
            <thead><tr><th>Name</th><th>Category</th><th>Language</th><th>Status</th></tr></thead>
            <tbody>{templates.map(t => (
              <tr key={t.name + t.language}><td>{t.name}</td><td>{t.category}</td><td>{t.language}</td>
                <td><span className={`badge ${t.status === 'APPROVED' ? 'green' : t.status === 'REJECTED' ? 'red' : 'orange'}`}>{t.status}</span></td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
