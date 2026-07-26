const express = require('express');
const TelegramController = require('../controllers/telegram.controller');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Secure Telegram endpoints
router.use(authMiddleware);

// Generate Link Code
router.post('/link-code', TelegramController.generateLinkCode);

// Get Link Status
router.get('/status', TelegramController.getTelegramStatus);

module.exports = router;
