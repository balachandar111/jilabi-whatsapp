require('express-async-errors');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const c = require('./config');
const auth = require('./middleware/auth');
const rateLimit = require('./middleware/rateLimit');

const app = express();
app.set('trust proxy', 1);
// CLIENT_ORIGIN can be a comma-separated list (admin app + website).
// Forgiving parsing: trims spaces/quotes, ignores a trailing "/", and supports wildcards like https://*.vercel.app
const clean = (x) => x.trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');
const allowed = c.CLIENT_ORIGIN.split(',').map(clean).filter(Boolean);
const wildcardToRegex = (p) => new RegExp('^' + p.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^.]+') + '$');
const matchers = allowed.map(a => (a.includes('*') ? wildcardToRegex(a) : a));
const originOk = (origin) => matchers.some(m => (m instanceof RegExp ? m.test(origin) : m === origin));
console.log('CORS allowed origins:', allowed.join(', ') || '(none)');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                       // server-to-server (Meta, Razorpay) and curl
    if (originOk(origin)) return cb(null, true);
    console.warn(`CORS blocked origin: ${origin}  (allowed: ${allowed.join(', ')})`);
    return cb(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));
// keep raw body: needed to verify Meta + Razorpay signatures
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

app.use('/', require('./routes/webhooks'));
app.use('/api/auth', rateLimit(10, 15 * 60 * 1000), require('./routes/auth'));
app.use('/api/public', require('./routes/public'));
app.use('/api/products', auth, require('./routes/products'));
app.use('/api/orders', auth, require('./routes/orders'));
app.use('/api/branches', auth, require('./routes/branches'));
app.use('/api/bulk', auth, require('./routes/bulk'));
app.use('/api/settings', auth, require('./routes/settings'));
app.get('/health', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'not connected' }));

// Serve built React admin in production
const dist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|webhook|razorpay-webhook|health).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

// Start listening first so Render sees the service as live (and CORS/health respond) even if MongoDB is slow or misconfigured.
app.listen(c.PORT, () => console.log(`API + bot running on :${c.PORT}`));

const connectDb = () => mongoose.connect(c.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
  .then(() => console.log('MongoDB connected'))
  .catch(e => {
    console.error('MongoDB connection failed:', e.message);
    console.error('-> Check MONGO_URI, the Atlas database user/password, and Atlas Network Access (allow 0.0.0.0/0). Retrying in 10s...');
    setTimeout(connectDb, 10000);
  });
connectDb();