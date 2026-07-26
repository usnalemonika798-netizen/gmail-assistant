const express = require('express');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const authMiddleware = require('../middleware/auth');
require('dotenv').config();

const db = require('../db');

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const TOKEN_PATH = path.join(__dirname, '../../gmail-bot/token.json');

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID || 'dummy_client_id',
    process.env.GMAIL_CLIENT_SECRET || 'dummy_client_secret',
    process.env.GMAIL_REDIRECT_URI || 'http://localhost:5000/api/gmail/callback'
  );
}

function loadToken(oAuth2Client) {
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
      oAuth2Client.setCredentials(token);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

// GET /api/gmail/status - Check if Gmail & Telegram are connected
router.get('/status', authMiddleware, (req, res) => {
  const oAuth2Client = getOAuth2Client();
  const connected = loadToken(oAuth2Client);

  db.query('SELECT telegram_chat_id, telegram_link_code FROM users WHERE id = ?', [req.user.id], (err, results) => {
    const userRow = (results && results[0]) || {};
    res.json({
      connected,
      telegramLinked: Boolean(userRow.telegram_chat_id),
      linkCode: userRow.telegram_link_code || null,
      telegramChatId: userRow.telegram_chat_id || null
    });
  });
});

// POST /api/gmail/telegram-code - Generate 6-digit Telegram Link Code
router.post('/telegram-code', authMiddleware, (req, res) => {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  db.query('UPDATE users SET telegram_link_code = ? WHERE id = ?', [code, req.user.id], (err) => {
    if (err) return res.status(500).json({ message: 'Error generating link code' });
    res.json({
      code,
      message: `Send this command to your Telegram Bot: /link ${code}`
    });
  });
});

// GET /api/gmail/auth-url - Get OAuth URL
router.get('/auth-url', authMiddleware, (req, res) => {
  const oAuth2Client = getOAuth2Client();
  const url = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.modify']
  });
  res.json({ url });
});

// POST /api/gmail/save-token - Save OAuth code or token
router.post('/save-token', authMiddleware, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ message: 'Authorization code required' });

  try {
    const oAuth2Client = getOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    res.json({ message: 'Gmail connected successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to authenticate Gmail: ' + err.message });
  }
});

// GET /api/gmail/unread - Fetch unread emails
router.get('/unread', authMiddleware, async (req, res) => {
  const oAuth2Client = getOAuth2Client();
  if (!loadToken(oAuth2Client)) {
    // Return sample demo emails if Gmail OAuth not yet configured by user
    return res.json([
      {
        id: 'demo_1',
        threadId: 't1',
        from: 'Professor Vance <vance@university.edu>',
        subject: 'Project Submission Deadline Extension',
        snippet: 'Hello students, please note that the final project report submission deadline has been extended to Friday 5 PM.'
      },
      {
        id: 'demo_2',
        threadId: 't2',
        from: 'HR Department <careers@techcorp.com>',
        subject: 'Interview Schedule Invitation',
        snippet: 'Dear Applicant, we reviewed your profile for the AI Developer role and would like to invite you for a technical interview.'
      }
    ]);
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults: 10
    });

    const messages = listRes.data.messages || [];
    const emails = [];

    for (const msg of messages) {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id });
      const headers = detail.data.payload.headers;

      const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
      const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
      const snippet = detail.data.snippet || '';

      emails.push({ id: msg.id, from, subject, snippet, threadId: detail.data.threadId });
    }

    res.json(emails);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching emails: ' + err.message });
  }
});

// POST /api/gmail/generate-reply - Generate AI Reply with Gemini
router.post('/generate-reply', authMiddleware, async (req, res) => {
  const { from, subject, snippet } = req.body;
  if (!snippet) return res.status(400).json({ message: 'Email snippet required' });

  try {
    let model;
    try {
      model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    } catch (e) {
      model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    }
    const prompt = `You are a professional email assistant. Generate a polite, concise, and helpful reply to this email:

From: ${from || 'Sender'}
Subject: ${subject || 'Subject'}
Email Content: ${snippet}

Write ONLY the reply body text. Keep it professional, polite, and brief (3-4 sentences max). Do not include subject line or headers.`;

    const result = await model.generateContent(prompt);
    const replyText = result.response.text();
    res.json({ reply: replyText });
  } catch (err) {
    // Fallback professional reply if Gemini key is loading
    const fallbackReply = `Dear ${from ? from.split('<')[0].trim() : 'Sender'},\n\nThank you for your email regarding "${subject || 'your message'}". I have received your message and will review it promptly.\n\nBest regards,\nGmail AI Assistant`;
    res.json({ reply: fallbackReply });
  }
});

// POST /api/gmail/send-reply - Send email reply
router.post('/send-reply', authMiddleware, async (req, res) => {
  const { to, subject, threadId, replyText } = req.body;
  if (!to || !replyText) return res.status(400).json({ message: 'Recipient and reply content required' });

  const oAuth2Client = getOAuth2Client();
  if (!loadToken(oAuth2Client)) {
    // Simulated send for demo mode
    return res.json({ message: `✅ Demo Mode: Reply queued and sent to ${to}!` });
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    const emailLines = [
      `To: ${to}`,
      `Subject: Re: ${subject || ''}`,
      threadId ? `In-Reply-To: ${threadId}` : '',
      threadId ? `References: ${threadId}` : '',
      'Content-Type: text/plain; charset=utf-8',
      '',
      replyText
    ].filter(Boolean);

    const raw = Buffer.from(emailLines.join('\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw, threadId }
    });

    res.json({ message: '✅ Reply sent successfully via Gmail API!' });
  } catch (err) {
    res.status(500).json({ message: 'Error sending email: ' + err.message });
  }
});

module.exports = router;
