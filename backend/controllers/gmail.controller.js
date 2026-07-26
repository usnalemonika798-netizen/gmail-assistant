const GmailService = require('../services/gmail.service');
const AIService = require('../services/ai.service');
const UserModel = require('../models/user.model');

const GmailController = {
  // Get Connection Status
  getStatus: async (req, res) => {
    try {
      const user = await UserModel.findById(req.user.id);
      const connected = Boolean(user && user.google_tokens);
      res.json({
        success: true,
        connected,
        telegramLinked: Boolean(user && user.telegram_chat_id),
        linkCode: user ? user.telegram_link_code : null
      });
    } catch (err) {
      res.json({ success: true, connected: false, telegramLinked: false });
    }
  },

  // Get Inbox Emails with Urgency Analysis
  getInbox: async (req, res) => {
    try {
      const user = await UserModel.findById(req.user.id);
      const tokens = user ? user.google_tokens : null;
      const rawEmails = await GmailService.fetchInbox(tokens, 10);

      const emails = rawEmails.map(email => ({
        ...email,
        urgency: AIService.analyzeUrgency(email.subject, email.snippet)
      }));

      res.json(emails);
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error fetching inbox: ' + err.message });
    }
  },

  // Generate AI Reply with selected tone
  generateReply: async (req, res) => {
    const { from, subject, snippet, tone } = req.body;
    if (!snippet) return res.status(400).json({ message: 'Email snippet required' });

    try {
      const reply = await AIService.generateEmailReply(from, subject, snippet, tone || 'Professional');
      res.json({ success: true, reply });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error generating AI reply: ' + err.message });
    }
  },

  // Send Email Reply
  sendReply: async (req, res) => {
    const { to, subject, threadId, replyText } = req.body;
    if (!to || !replyText) return res.status(400).json({ message: 'Recipient and reply content required' });

    try {
      const user = await UserModel.findById(req.user.id);
      const tokens = user ? user.google_tokens : null;

      const result = await GmailService.sendReply(tokens, { to, subject, threadId, replyText });
      res.json({ success: true, message: '✅ Reply sent successfully!', details: result });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error sending reply: ' + err.message });
    }
  }
};

module.exports = GmailController;
