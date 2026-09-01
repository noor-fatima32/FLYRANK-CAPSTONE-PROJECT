const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.dbPath);

// Enable foreign key constraints
db.pragma('foreign_keys = ON');

// Auto-migrate idempotency_key column if upgrading existing database
try {
  const columns = db.pragma('table_info(submissions)').map(c => c.name);
  if (columns.length > 0 && !columns.includes('idempotency_key')) {
    db.exec('ALTER TABLE submissions ADD COLUMN idempotency_key TEXT;');
  }
} catch (err) {
  // Table or column may not exist yet
}

const schemaPath = path.join(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
db.exec(schemaSql);

module.exports = db;
