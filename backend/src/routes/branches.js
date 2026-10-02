const router = require('express').Router();
const Branch = require('../models/Branch');

const digits = (v) => String(v || '').replace(/\D/g, '');
const pick = (b) => {
  const o = {
    code: b.code, name: b.name, address: b.address, phone: b.phone, alertPhone: b.alertPhone === undefined ? undefined : digits(b.alertPhone),
    lat: b.lat === '' || b.lat == null ? undefined : Number(b.lat), lng: b.lng === '' || b.lng == null ? undefined : Number(b.lng),
    openTime: b.openTime, closeTime: b.closeTime, active: b.active,
  };
  Object.keys(o).forEach(k => (o[k] === undefined || Number.isNaN(o[k])) && delete o[k]);
  return o;
};
const bad = (e) => (e.code === 11000 ? 'Branch code already exists' : e.message);

router.get('/', async (_req, res) => res.json(await Branch.find().sort({ name: 1 })));
router.post('/', async (req, res) => {
  try { res.status(201).json(await Branch.create(pick(req.body))); } catch (e) { res.status(400).json({ message: bad(e) }); }
});
router.put('/:id', async (req, res) => {
  try {
    const b = await Branch.findByIdAndUpdate(req.params.id, pick(req.body), { new: true, runValidators: true });
    if (!b) return res.status(404).json({ message: 'Not found' });
    res.json(b);
  } catch (e) { res.status(400).json({ message: bad(e) }); }
});
router.delete('/:id', async (req, res) => { await Branch.findByIdAndDelete(req.params.id); res.json({ ok: true }); });
module.exports = router;
