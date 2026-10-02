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
// CLIENT_ORIGIN can be a comma-separated list (admin app + website)
app.use(cors({ origin: c.CLIENT_ORIGIN.split(',').map(x => x.trim()) }));
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
app.get('/health', (_req, res) => res.json({ ok: true }));

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

mongoose.connect(c.MONGO_URI)
  .then(() => app.listen(c.PORT, () => console.log(`API + bot running on :${c.PORT}`)))
  .catch(e => { console.error('MongoDB connection failed:', e.message);
    console.error('-> Start MongoDB (docker compose up -d) or put a MongoDB Atlas connection string in backend/.env as MONGO_URI.');
    process.exit(1); });
