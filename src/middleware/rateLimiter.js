const requestCounts = new Map();

const WINDOW_MS = 10000;
const MAX_REQUESTS = 5;

const cleanupInterval = setInterval(() => {
  const now = Date.now();

  for (const [key, record] of requestCounts.entries()) {
    if (now - record.startTime > WINDOW_MS) {
      requestCounts.delete(key);
    }
  }
}, 60000);

// Do not keep CLI test processes alive just because of the cleanup timer.
cleanupInterval.unref();

function rateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const widgetId = req.body?.widget_id || req.query?.widget_id || 'global';
  const key = `${ip}:${widgetId}`;

  const now = Date.now();
  const record = requestCounts.get(key);

  if (!record || (now - record.startTime > WINDOW_MS)) {
    requestCounts.set(key, { startTime: now, count: 1 });
    return next();
  }

  if (record.count >= MAX_REQUESTS) {
    return res.status(429).json({
      error: 'rate limit exceeded, try later'
    });
  }

  record.count += 1;
  next();
}

function resetRateLimits() {
  requestCounts.clear();
}

module.exports = {
  rateLimiter,
  resetRateLimits
};

