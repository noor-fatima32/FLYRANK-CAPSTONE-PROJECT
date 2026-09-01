const express = require('express');
const router = express.Router();
const cors = require('../middleware/cors');
const notifications = require('../services/notifications');
const { resetRateLimits } = require('../middleware/rateLimiter');

router.use(cors);

router.post('/geo-state', (req, res) => {
  const { state } = req.body || {};
  if (!['normal', 'mock-provider-a-down', 'mock-both-down'].includes(state)) {
    return res.status(400).json({ error: 'invalid state' });
  }
  notifications.setMockState(state);
  return res.json({ success: true, current_state: notifications.getMockState() });
});

router.post('/email-fail', (req, res) => {
  const { shouldFail } = req.body || {};
  notifications.setForceEmailFailure(Boolean(shouldFail));
  return res.json({ success: true, force_email_failure: Boolean(shouldFail) });
});

router.post('/reset-limits', (req, res) => {
  resetRateLimits();
  return res.json({ success: true, message: 'Rate limits reset' });
});

module.exports = router;

