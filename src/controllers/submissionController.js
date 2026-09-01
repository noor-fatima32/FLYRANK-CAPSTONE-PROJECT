const crypto = require('crypto');
const db = require('../db');
const notifications = require('../services/notifications');
const jobQueue = require('../services/jobQueue');
const { validateSubmissionData } = require('../validation/submissionValidation');

async function handleSubmission(req, res) {
  const { widget_id, data, _gotcha, idempotency_key } = req.body || {};

  // honeypot bot trap
  if (_gotcha && typeof _gotcha === 'string' && _gotcha.trim().length > 0) {
    console.log(`[Honeypot] Spam bot caught on widget ${widget_id}. Dropping submission silently.`);
    return res.status(200).json({ success: true, message: 'Submission processed' });
  }

  if (!widget_id) {
    return res.status(400).json({ error: 'widget_id missing' });
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'missing data object' });
  }

  const widget = db.prepare('SELECT * FROM widgets WHERE id = ?').get(widget_id);
  if (!widget) {
    return res.status(400).json({ error: 'invalid widget_id' });
  }

  const validationErrors = validateSubmissionData(widget, data);

if (validationErrors.length > 0) {
  return res.status(400).json({
    error: 'validation error',
    details: validationErrors
  });
}

  let requiredFields = [];
  try {
    const fields = JSON.parse(widget.fields_json || '[]');
    requiredFields = fields.filter(f => f.required).map(f => f.name);
  } catch (err) {
    requiredFields = [];
  }

  const missingFields = [];
  for (const fieldName of requiredFields) {
    if (data[fieldName] === undefined || data[fieldName] === null || String(data[fieldName]).trim() === '') {
      missingFields.push(`${fieldName} is required`);
    }
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      error: 'validation error',
      details: missingFields
    });
  }

  const cleanIdempKey = (typeof idempotency_key === 'string' && idempotency_key.trim().length > 0)
    ? idempotency_key.trim()
    : null;

  if (cleanIdempKey) {
    const existing = db.prepare(`
      SELECT * FROM submissions WHERE widget_id = ? AND idempotency_key = ?
    `).get(widget.id, cleanIdempKey);

    if (existing) {
      console.log(`[Idempotency] Duplicate submission detected for key '${cleanIdempKey}'. Returning original submission ${existing.id}.`);
      return res.status(200).json({
        success: true,
        submission_id: existing.id,
        geo_enriched: existing.geo_provider !== 'none',
        deduplicated: true
      });
    }
  }

  const rawIp = req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '127.0.0.1';
  const clientIp = rawIp.split(',')[0].trim();
  const geo = await notifications.enrichIp(clientIp);

  const submissionId = `sub_${crypto.randomBytes(6).toString('hex')}`;
  const dataJson = JSON.stringify(data);

  try {
  db.prepare(`
    INSERT INTO submissions (
      id,
      widget_id,
      tenant_id,
      data_json,
      ip_address,
      country,
      city,
      geo_provider,
      idempotency_key
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    submissionId,
    widget.id,
    widget.tenant_id,
    dataJson,
    clientIp,
    geo.country,
    geo.city,
    geo.provider,
    cleanIdempKey
  );
} catch (err) {
  if (
    cleanIdempKey &&
    err.code &&
    err.code.startsWith('SQLITE_CONSTRAINT')
  ) {
    const existing = db.prepare(`
      SELECT *
      FROM submissions
      WHERE widget_id = ?
        AND idempotency_key = ?
    `).get(widget.id, cleanIdempKey);

    if (existing) {
      return res.status(200).json({
        success: true,
        submission_id: existing.id,
        geo_enriched: existing.geo_provider !== 'none',
        deduplicated: true
      });
    }
  }

  throw err;
}

  const savedSubmission = {
    id: submissionId,
    widget_id: widget.id,
    tenant_id: widget.tenant_id,
    data,
    ip_address: clientIp,
    country: geo.country,
    city: geo.city,
    geo_provider: geo.provider,
    idempotency_key: cleanIdempKey
  };

  // Enqueue notification as a background job (off request/response cycle)
  jobQueue.enqueue(async () => {
    await notifications.sendEmail(savedSubmission);
  });

  return res.status(201).json({
    success: true,
    submission_id: submissionId,
    geo_enriched: geo.provider !== 'none'
  });
}

module.exports = {
  handleSubmission
};

