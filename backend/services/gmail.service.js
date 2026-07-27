const { google } = require('googleapis');
const path = require('path');
const UserModel = require('../models/user.model');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function requireGoogleEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    process.env.GMAIL_REDIRECT_URI ||
    'http://localhost:5000/api/auth/google/callback';

  if (!clientId || !clientSecret || clientId === 'dummy_client_id') {
    throw new Error(
      'Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Set them on the backend host (Render).'
    );
  }
  return { clientId, clientSecret, redirectUri };
}

function getOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = requireGoogleEnv();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function parseTokens(tokens) {
  if (!tokens) return null;
  return typeof tokens === 'string' ? JSON.parse(tokens) : tokens;
}

const GmailService = {
  getGoogleAuthUrl: () => {
    const oAuth2Client = getOAuth2Client();
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly'
    ];

    return oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes
    });
  },

  getRedirectUri: () => requireGoogleEnv().redirectUri,

  exchangeCodeAndFetchProfile: async (code) => {
    const oAuth2Client = getOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
    const profileRes = await oauth2.userinfo.get();
    const profile = profileRes.data;

    return {
      tokens,
      profile: {
        googleId: profile.id,
        email: profile.email,
        name: profile.name,
        picture: profile.picture
      }
    };
  },

  // Token Management & Automatic Refresh (persists new access_token to DB)
  getValidGmailClient: async (userId) => {
    const user = await UserModel.findById(userId);
    if (!user || !user.google_tokens) {
      throw new Error('Google account not connected. Sign in with Google again.');
    }

    const tokens = parseTokens(user.google_tokens);
    if (!tokens.refresh_token && !tokens.access_token) {
      throw new Error('Google tokens missing. Sign in with Google again.');
    }

    const oAuth2Client = getOAuth2Client();
    oAuth2Client.setCredentials(tokens);

    oAuth2Client.on('tokens', async (newTokens) => {
      console.log('🔄 Access token refreshed for user:', userId);
      // Google omits refresh_token on refresh — keep the old one
      const updatedTokens = { ...tokens, ...newTokens };
      if (!updatedTokens.refresh_token && tokens.refresh_token) {
        updatedTokens.refresh_token = tokens.refresh_token;
      }
      try {
        await UserModel.saveGoogleTokens(userId, updatedTokens);
      } catch (e) {
        console.error('Failed to persist refreshed tokens:', e.message);
      }
    });

    return google.gmail({ version: 'v1', auth: oAuth2Client });
  },

  fetchInbox: async (userId, maxResults = 5) => {
    const gmail = await GmailService.getValidGmailClient(userId);

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults
    });

    const messages = listRes.data.messages || [];
    const emails = [];

    for (const msg of messages) {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id });
      const headers = detail.data.payload.headers || [];

      const from = headers.find((h) => h.name === 'From')?.value || 'Unknown Sender';
      const subject = headers.find((h) => h.name === 'Subject')?.value || '(No Subject)';
      const date = headers.find((h) => h.name === 'Date')?.value || new Date().toISOString();
      const snippet = detail.data.snippet || '';

      emails.push({
        id: msg.id,
        threadId: detail.data.threadId,
        from,
        subject,
        snippet,
        date
      });
    }

    return emails;
  },

  sendReply: async (userId, { to, subject, threadId, replyText }) => {
    const gmail = await GmailService.getValidGmailClient(userId);

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

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw, threadId }
    });
    return { success: true, messageId: res.data.id };
  },

  // Ensure custom labels exist; return name → id map
  ensureTriageLabels: async (userId) => {
    const gmail = await GmailService.getValidGmailClient(userId);
    const names = ['AI/Urgent', 'AI/Job', 'AI/Meeting', 'AI/College', 'AI/Noise', 'AI/Other'];
    const list = await gmail.users.labels.list({ userId: 'me' });
    const existing = list.data.labels || [];
    const byName = {};
    for (const lab of existing) byName[lab.name] = lab.id;

    for (const name of names) {
      if (byName[name]) continue;
      const created = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show'
        }
      });
      byName[name] = created.data.id;
    }
    return byName;
  },

  applyLabelToMessage: async (userId, messageId, labelId) => {
    const gmail = await GmailService.getValidGmailClient(userId);
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds: [labelId] }
    });
  },

  // Classify unread mail + apply Gmail labels
  autoTriageInbox: async (userId, maxResults = 10) => {
    const AIService = require('./ai.service');
    const emails = await GmailService.fetchInbox(userId, maxResults);
    const labelMap = await GmailService.ensureTriageLabels(userId);
    const results = [];

    for (const email of emails) {
      const triage = AIService.classifyEmail(email.subject, email.snippet, email.from);
      const labelId = labelMap[triage.gmailLabel];
      if (labelId) {
        try {
          await GmailService.applyLabelToMessage(userId, email.id, labelId);
        } catch (e) {
          console.warn('Label apply failed:', email.id, e.message);
        }
      }
      results.push({
        ...email,
        triage,
        labeled: Boolean(labelId),
        meetingHint: AIService.looksLikeMeeting(email.subject, email.snippet)
      });
    }

    return results;
  }
};

module.exports = GmailService;
