const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');

router.get('/:id/config', deliveryController.getWidgetConfig);

module.exports = router;
