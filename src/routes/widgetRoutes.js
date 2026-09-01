const express = require('express');
const router = express.Router();
const requireTenantAuth = require('../middleware/auth');
const widgetController = require('../controllers/widgetController');

router.use(requireTenantAuth);

router.post('/', widgetController.createWidget);
router.get('/', widgetController.getWidgets);
router.get('/:id', widgetController.getWidgetById);
router.put('/:id', widgetController.updateWidget);
router.delete('/:id', widgetController.deleteWidget);

module.exports = router;
