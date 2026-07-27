const express = require('express');
const GmailController = require('../controllers/gmail.controller');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Secure all Gmail endpoints with JWT auth
router.use(authMiddleware);

// Connection Status
router.get('/status', GmailController.getStatus);

// Fetch recent unread inbox emails (both /unread and /inbox supported)
router.get('/unread', GmailController.getInbox);
router.get('/inbox', GmailController.getInbox);
router.get('/briefing', GmailController.getBriefing);
router.post('/triage', GmailController.autoTriage);

// Generate AI Reply using Gemini
router.post('/generate-reply', GmailController.generateReply);

// Send Email Reply via Gmail API
router.post('/send-reply', GmailController.sendReply);

module.exports = router;
