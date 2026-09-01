const path = require('path');
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  dbPath: process.env.DATABASE_PATH || path.join(__dirname, '../data/app.db'),
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  geoMockState: process.env.GEO_MOCK_STATE || 'normal'
};
