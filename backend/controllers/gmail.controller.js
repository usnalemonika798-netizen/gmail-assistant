const GmailService = require('../services/gmail.service');
const AIService = require('../services/ai.service');
const UserModel = require('../models/user.model');

const GmailController = {
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
      res.status(500).json({ success: false, connected: false, message: err.message });
    }
  },

  getInbox: async (req, res) => {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user || !user.google_tokens) {
        return res.status(401).json({
          success: false,
          message: 'Google not connected. Click Connect Google / Sign in with Google.'
        });
      }

      const rawEmails = await GmailService.fetchInbox(req.user.id, 10);
      const emails = rawEmails.map((email) => ({
        ...email,
        urgency: AIService.analyzeUrgency(email.subject, email.snippet)
      }));

      res.json(emails);
    } catch (err) {
      console.error('Inbox error:', err.message);
      const msg = err.message || 'Error fetching inbox';
      const needsReconnect =
        /invalid_grant|invalid_client|insufficient|not connected|tokens missing|Sign in with Google/i.test(
          msg
        );
      res.status(needsReconnect ? 401 : 500).json({
        success: false,
        message: msg,
        reconnect: needsReconnect
      });
    }
  },

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

  sendReply: async (req, res) => {
    const { to, subject, threadId, replyText } = req.body;
    if (!to || !replyText) {
      return res.status(400).json({ message: 'Recipient and reply content required' });
    }

    try {
      const user = await UserModel.findById(req.user.id);
      if (!user || !user.google_tokens) {
        return res.status(401).json({
          success: false,
          message: 'Google not connected. Sign in with Google again.'
        });
      }

      const result = await GmailService.sendReply(req.user.id, { to, subject, threadId, replyText });
      res.json({ success: true, message: 'Reply sent successfully!', details: result });
    } catch (err) {
      console.error('Send reply error:', err.message);
      res.status(500).json({ success: false, message: 'Error sending reply: ' + err.message });
    }
  }
};

module.exports = GmailController;
