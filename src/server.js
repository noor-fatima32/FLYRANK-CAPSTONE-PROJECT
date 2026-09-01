const express = require('express');
const path = require('path');
const config = require('./config');

const widgetRoutes = require('./routes/widgetRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const testRoutes = require('./routes/testRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Enable JSON body parsing with strict 100kb payload limit
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Serve public static assets (embed JS bundle) with caching headers
app.use('/public', (req, res, next) => {
  if (req.path.endsWith('.js')) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
}, express.static(path.join(__dirname, '../public')));

// Serve customer test website
app.use('/customer-site', express.static(path.join(__dirname, '../customer-site')));

// Mount API routes
app.use('/public/widgets', deliveryRoutes);
app.use('/api/v1/widgets', widgetRoutes);
app.use('/api/v1/submissions', submissionRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
if (process.env.NODE_ENV === 'test') {
  app.use('/api/v1/test', testRoutes);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Centralized error handling
app.use(errorHandler);

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Embeddable Widget Platform backend listening on port ${config.port}`);
  });
}

module.exports = app;
