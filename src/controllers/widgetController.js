const { validateWidgetInput } = require('../validation/widgetValidation');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');

function formatWidget(widget) {
  return {
    id: widget.id,
    tenant_id: widget.tenant_id,
    type: widget.type,
    title: widget.title,
    description: widget.description,
    fields: JSON.parse(widget.fields_json || '[]'),
    button_text: widget.button_text,
    display_options: JSON.parse(widget.display_options_json || '{}'),
    embed_snippet: `<script src="${config.baseUrl}/public/widget.v1.js?id=${widget.id}"></script>`,
    created_at: widget.created_at,
    updated_at: widget.updated_at
  };
}

function createWidget(req, res) {
  const { type, title, description, fields, button_text, display_options } = req.body;

  const errors = validateWidgetInput(req.body || {});

if (errors.length > 0) {
  return res.status(400).json({
    error: 'validation error',
    details: errors
  });
}

  const id = `w_${crypto.randomBytes(6).toString('hex')}`;
  const fieldsJson = JSON.stringify(fields);
  const displayOptionsJson = JSON.stringify(display_options || {});
  const btnText = button_text || 'Submit';

  db.prepare(`
    INSERT INTO widgets (id, tenant_id, type, title, description, fields_json, button_text, display_options_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.tenant.id, type, title, description || null, fieldsJson, btnText, displayOptionsJson);

  const newWidget = db.prepare('SELECT * FROM widgets WHERE id = ? AND tenant_id = ?').get(id, req.tenant.id);
  return res.status(201).json(formatWidget(newWidget));
}

function getWidgets(req, res) {
  const rows = db.prepare('SELECT * FROM widgets WHERE tenant_id = ? ORDER BY created_at DESC').all(req.tenant.id);
  return res.json(rows.map(formatWidget));
}

function getWidgetById(req, res) {
  const widget = db.prepare('SELECT * FROM widgets WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);

  // Return 404 not 403 to avoid leaking widget IDs across tenants
  if (!widget) {
    return res.status(404).json({ error: 'Widget not found' });
  }

  return res.json(formatWidget(widget));
}

function updateWidget(req, res) {
  const existing = db.prepare('SELECT * FROM widgets WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);

  if (!existing) {
    return res.status(404).json({ error: 'Widget not found' });
  }

  const { type, title, description, fields, button_text, display_options } = req.body;
  
  const errors = validateWidgetInput(req.body || {}, { partial: true });

if (errors.length > 0) {
  return res.status(400).json({
    error: 'validation error',
    details: errors
  });
}

  const updatedType = type || existing.type;
  const updatedTitle = title || existing.title;
  const updatedDesc = description !== undefined ? description : existing.description;
  const updatedFields = fields ? JSON.stringify(fields) : existing.fields_json;
  const updatedBtn = button_text || existing.button_text;
  const updatedDisplay = display_options ? JSON.stringify(display_options) : existing.display_options_json;

  db.prepare(`
    UPDATE widgets
    SET type = ?, title = ?, description = ?, fields_json = ?, button_text = ?, display_options_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(updatedType, updatedTitle, updatedDesc, updatedFields, updatedBtn, updatedDisplay, req.params.id, req.tenant.id);

  const updated = db.prepare('SELECT * FROM widgets WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.id);
  return res.json(formatWidget(updated));
}

function deleteWidget(req, res) {
  const resDel = db.prepare('DELETE FROM widgets WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenant.id);

  if (resDel.changes === 0) {
    return res.status(404).json({ error: 'Widget not found' });
  }

  return res.json({ success: true, message: 'Widget deleted' });
}

module.exports = {
  createWidget,
  getWidgets,
  getWidgetById,
  updateWidget,
  deleteWidget
};

