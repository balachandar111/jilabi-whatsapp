// Tiny in-memory rate limiter (no extra dependency). Fine for a single Node process; use Redis if you scale out.
module.exports = (max, windowMs, keyFn = (req) => req.ip) => {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const k = keyFn(req), now = Date.now();
    const h = hits.get(k) && hits.get(k).reset > now ? hits.get(k) : { n: 0, reset: now + windowMs };
    h.n += 1; hits.set(k, h);
    if (h.n > max) return res.status(429).json({ message: 'Too many attempts, please try again later.' });
    next();
  };
};
