const express = require('express');
const router = express.Router();
const requireTenantAuth = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');

router.use(requireTenantAuth);

router.get('/stats', dashboardController.getDashboardStats);
router.get('/submissions', dashboardController.getSubmissions);

module.exports = router;
