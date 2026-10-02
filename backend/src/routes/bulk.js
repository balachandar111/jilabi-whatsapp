const router = require('express').Router();
const BulkEnquiry = require('../models/BulkEnquiry');

router.get('/', async (req, res) => {
  const filter = req.query.status ? { status: String(req.query.status) } : {};
  res.json(await BulkEnquiry.find(filter).sort({ createdAt: -1 }).limit(200));
});
router.patch('/:id', async (req, res) => {
  const { status, note } = req.body || {};
  const set = {};
  if (status) {
    if (!['new', 'contacted', 'quoted', 'confirmed', 'closed'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
    set.status = status;
  }
  if (typeof note === 'string') set.note = note.slice(0, 1000);
  const q = await BulkEnquiry.findByIdAndUpdate(req.params.id, set, { new: true });
  if (!q) return res.status(404).json({ message: 'Not found' });
  res.json(q);
});
module.exports = router;
