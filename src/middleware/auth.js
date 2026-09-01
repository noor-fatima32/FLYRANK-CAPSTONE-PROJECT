const db = require('../db');

function requireTenantAuth(req, res, next) {
  let apiKey = req.headers['x-api-key'];

  if (!apiKey && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      apiKey = parts[1];
    }
  }

  if (!apiKey) {
    return res.status(401).json({ error: 'missing api key' });
  }

  const tenant = db.prepare('SELECT id, name, api_key FROM tenants WHERE api_key = ?').get(apiKey);

  if (!tenant) {
    return res.status(401).json({ error: 'invalid api key' });
  }

  req.tenant = tenant;
  next();
}

module.exports = requireTenantAuth;

