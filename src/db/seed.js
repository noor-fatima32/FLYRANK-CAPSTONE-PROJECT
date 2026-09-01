const db = require('./index');

function seedDatabase() {
  const insertTenant = db.prepare(`
    INSERT OR IGNORE INTO tenants (id, name, api_key)
    VALUES (?, ?, ?)
  `);

  insertTenant.run('tenant-a-id', 'Acme Corp', 'key-tenant-a');
  insertTenant.run('tenant-b-id', 'Beta Inc', 'key-tenant-b');

  const insertWidget = db.prepare(`
    INSERT OR IGNORE INTO widgets (id, tenant_id, type, title, description, fields_json, button_text, display_options_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertWidget.run(
    'w_acme_1',
    'tenant-a-id',
    'signup_form',
    'Subscribe to Acme Weekly',
    'Get news and updates straight to your inbox.',
    JSON.stringify([
      { name: 'email', type: 'email', label: 'Email Address', required: true },
      { name: 'name', type: 'text', label: 'Full Name', required: false }
    ]),
    'Join Newsletter',
    JSON.stringify({ theme: 'dark', primaryColor: '#4f46e5' })
  );

  console.log('Database seeded successfully.');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
