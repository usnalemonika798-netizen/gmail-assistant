const GmailService = require('../services/gmail.service');
const AIService = require('../services/ai.service');
const CalendarService = require('../services/calendar.service');
const UserModel = require('../models/user.model');

async function requireGoogleUser(req, res) {
  const user = await UserModel.findById(req.user.id);
  if (!user || !user.google_tokens) {
    res.status(401).json({
      success: false,
      message: 'Google not connected. Sign in with Google again.'
    });
    return null;
  }
  return user;
}

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
      if (!(await requireGoogleUser(req, res))) return;

      const rawEmails = await GmailService.fetchInbox(req.user.id, 10);
      const emails = rawEmails.map((email) => {
        const triage = AIService.classifyEmail(email.subject, email.snippet, email.from);
        return {
          ...email,
          urgency: AIService.analyzeUrgency(email.subject, email.snippet),
          triage,
          meetingHint: AIService.looksLikeMeeting(email.subject, email.snippet)
        };
      });

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

  getBriefing: async (req, res) => {
    try {
      if (!(await requireGoogleUser(req, res))) return;

      const emailsRaw = await GmailService.fetchInbox(req.user.id, 10);
      const emails = emailsRaw.map((email) => ({
        ...email,
        triage: AIService.classifyEmail(email.subject, email.snippet, email.from),
        urgency: AIService.analyzeUrgency(email.subject, email.snippet),
        meetingHint: AIService.looksLikeMeeting(email.subject, email.snippet)
      }));

      const triageCounts = {};
      for (const e of emails) {
        const c = e.triage.category;
        triageCounts[c] = (triageCounts[c] || 0) + 1;
      }

      let events = [];
      try {
        events = await CalendarService.listUpcomingEvents(req.user.id, 5);
      } catch (e) {
        console.warn('Briefing calendar skip:', e.message);
      }

      const narrative = await AIService.buildBriefingNarrative({
        emails,
        events,
        triageCounts
      });

      const actions = [];
      if ((triageCounts.Urgent || 0) > 0) actions.push('Reply to Urgent emails first');
      if (emails.some((e) => e.meetingHint)) actions.push('Schedule Google Meet for meeting-like mail');
      if ((triageCounts.Noise || 0) > 0) actions.push('Run Auto-triage to label Noise in Gmail');
      if (!actions.length) actions.push('Inbox looks calm — review Other items when free');

      res.json({
        success: true,
        generatedAt: new Date().toISOString(),
        narrative,
        triageCounts,
        unreadCount: emails.length,
        emails: emails.slice(0, 5),
        events,
        actions
      });
    } catch (err) {
      console.error('Briefing error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  autoTriage: async (req, res) => {
    try {
      if (!(await requireGoogleUser(req, res))) return;
      const results = await GmailService.autoTriageInbox(req.user.id, 10);
      const counts = {};
      for (const r of results) {
        const c = r.triage.category;
        counts[c] = (counts[c] || 0) + 1;
      }
      res.json({
        success: true,
        message: `Labeled ${results.length} unread email(s) in Gmail (AI/* labels).`,
        counts,
        emails: results
      });
    } catch (err) {
      console.error('Triage error:', err.message);
      res.status(500).json({ success: false, message: err.message });
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
      if (!(await requireGoogleUser(req, res))) return;
      const result = await GmailService.sendReply(req.user.id, { to, subject, threadId, replyText });
      res.json({ success: true, message: 'Reply sent successfully!', details: result });
    } catch (err) {
      console.error('Send reply error:', err.message);
      res.status(500).json({ success: false, message: 'Error sending reply: ' + err.message });
    }
  }
};

module.exports = GmailController;
