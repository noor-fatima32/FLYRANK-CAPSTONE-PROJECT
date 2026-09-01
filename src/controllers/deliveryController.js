const db = require('../db');

function getWidgetConfig(req, res) {
  const widget = db.prepare('SELECT * FROM widgets WHERE id = ?').get(req.params.id);

  res.set('Cache-Control', 'public, max-age=60');
  res.set('Access-Control-Allow-Origin', '*');

  if (!widget) {
    return res.status(404).json({ error: 'Widget not found' });
  }

  return res.json({
    id: widget.id,
    type: widget.type,
    title: widget.title,
    description: widget.description,
    fields: JSON.parse(widget.fields_json || '[]'),
    button_text: widget.button_text,
    display_options: JSON.parse(widget.display_options_json || '{}')
  });
}

module.exports = {
  getWidgetConfig
};
