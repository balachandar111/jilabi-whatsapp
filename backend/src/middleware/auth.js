const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

// Protects admin API routes. Expects:  Authorization: Bearer <token>
module.exports = (req, res, next) => {
  const h = req.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  try {
    const p = jwt.verify(token, JWT_SECRET);
    if (p.role !== 'admin') throw new Error('not admin');
    req.admin = p;
    next();
  } catch {
    res.status(401).json({ message: 'Unauthorized' });
  }
};
