const db = require('../db');

function getDashboardStats(req, res) {
  const tenantId = req.tenant.id;

  const totalWidgets = db.prepare('SELECT COUNT(*) as count FROM widgets WHERE tenant_id = ?').get(tenantId)?.count || 0;
  const totalSubmissions = db.prepare('SELECT COUNT(*) as count FROM submissions WHERE tenant_id = ?').get(tenantId)?.count || 0;

  const perWidget = db.prepare(`
    SELECT w.id as widget_id, w.title, COUNT(s.id) as submission_count
    FROM widgets w
    LEFT JOIN submissions s ON w.id = s.widget_id
    WHERE w.tenant_id = ?
    GROUP BY w.id
  `).all(tenantId);

  const geo = db.prepare(`
    SELECT COALESCE(country, 'Unknown') as country, COUNT(id) as count
    FROM submissions
    WHERE tenant_id = ?
    GROUP BY country
    ORDER BY count DESC
  `).all(tenantId);

  const activity = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(id) as count
    FROM submissions
    WHERE tenant_id = ?
    GROUP BY DATE(created_at)
    ORDER BY date DESC
    LIMIT 7
  `).all(tenantId);

  return res.json({
    tenant: {
      id: req.tenant.id,
      name: req.tenant.name
    },
    total_widgets: totalWidgets,
    total_submissions: totalSubmissions,
    per_widget_stats: perWidget,
    geo_breakdown: geo,
    recent_activity: activity
  });
}

function getSubmissions(req, res) {
  const { widget_id } = req.query;

  let query = 'SELECT * FROM submissions WHERE tenant_id = ?';
  const params = [req.tenant.id];

  if (widget_id) {
    query += ' AND widget_id = ?';
    params.push(widget_id);
  }

  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...params);

  const list = rows.map(sub => ({
    id: sub.id,
    widget_id: sub.widget_id,
    tenant_id: sub.tenant_id,
    data: JSON.parse(sub.data_json || '{}'),
    ip_address: sub.ip_address,
    country: sub.country,
    city: sub.city,
    geo_provider: sub.geo_provider,
    created_at: sub.created_at
  }));

  return res.json(list);
}

module.exports = {
  getDashboardStats,
  getSubmissions
};

