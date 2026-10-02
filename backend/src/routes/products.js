const router = require('express').Router();
const Product = require('../models/Product');

const cleanVariants = (v) => (Array.isArray(v) ? v : [])
  .map(x => ({ label: String(x.label || '').trim(), price: Number(x.price), sku: String(x.sku || '').trim().toUpperCase() || undefined }))
  .filter(x => x.label && Number.isFinite(x.price) && x.price >= 0);

const pick = (b) => {
  const variants = b.variants === undefined ? undefined : cleanVariants(b.variants);
  const out = { code: b.code, name: b.name, category: b.category, price: Number(b.price), unit: b.unit, available: b.available, variants };
  if (Array.isArray(b.unavailableAt)) out.unavailableAt = b.unavailableAt.map(String);
  // with variants, the base price/unit mirror the first size (keeps old screens + exports meaningful)
  if (variants?.length) { out.price = variants[0].price; out.unit = variants[0].label; }
  return out;
};

router.get('/', async (_req, res) => res.json(await Product.find().sort({ category: 1, name: 1 })));

router.post('/', async (req, res) => {
  try { res.status(201).json(await Product.create(pick(req.body))); }
  catch (e) { res.status(400).json({ message: e.code === 11000 ? 'Product code already exists' : e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const body = pick(req.body);
    Object.keys(body).forEach(k => (body[k] === undefined || Number.isNaN(body[k])) && delete body[k]);
    const p = await Product.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    if (!p) return res.status(404).json({ message: 'Not found' });
    res.json(p);
  } catch (e) { res.status(400).json({ message: e.code === 11000 ? 'Product code already exists' : e.message }); }
});

router.delete('/:id', async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});
module.exports = router;
