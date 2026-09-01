const express = require('express');
const router = express.Router();
const cors = require('../middleware/cors');
const { rateLimiter } = require('../middleware/rateLimiter');
const submissionController = require('../controllers/submissionController');

router.use(cors);

router.post('/', rateLimiter, submissionController.handleSubmission);

module.exports = router;
