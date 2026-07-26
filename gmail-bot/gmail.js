const { google } = require('googleapis');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, 'token.json');

const oAuth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

// Load saved token if exists
function loadToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return true;
  }
  return false;
}

// Get auth URL for first-time setup
function getAuthUrl() {
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.modify']
  });
}

// Save token after OAuth
async function saveToken(code) {
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  console.log('✅ Gmail token saved!');
}

// Fetch latest unread emails
async function getUnreadEmails() {
  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
    maxResults: 5
  });

  const messages = res.data.messages || [];
  const emails = [];

  for (const msg of messages) {
    const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id });
    const headers = detail.data.payload.headers;

    const from = headers.find(h => h.name === 'From')?.value || '';
    const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
    const snippet = detail.data.snippet || '';

    emails.push({ id: msg.id, from, subject, snippet, threadId: detail.data.threadId });
  }

  return emails;
}

// Mark email as read
async function markAsRead(messageId) {
  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] }
  });
}

// Send reply to email
async function sendReply(threadId, to, subject, replyText) {
  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

  const emailLines = [
    `To: ${to}`,
    `Subject: Re: ${subject}`,
    `In-Reply-To: ${threadId}`,
    `References: ${threadId}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    replyText
  ];

  const raw = Buffer.from(emailLines.join('\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId }
  });
}

module.exports = { oAuth2Client, loadToken, getAuthUrl, saveToken, getUnreadEmails, markAsRead, sendReply };
