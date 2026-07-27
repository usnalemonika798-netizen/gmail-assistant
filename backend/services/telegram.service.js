const https = require('https');
const http = require('http');
const TelegramBot = require('node-telegram-bot-api').TelegramBot || require('node-telegram-bot-api');
const UserModel = require('../models/user.model');
const GmailService = require('./gmail.service');
const AIService = require('./ai.service');
const CalendarService = require('./calendar.service');
require('dotenv').config();

let bot = null;
const pendingDrafts = {};
const pendingVoice = {};
// ponytail: in-memory dedupe; resets on redeploy (fine for notifications)
const notifiedMailIds = new Set();
let watchTimer = null;

const WATCH_MS = Number(process.env.MAIL_WATCH_INTERVAL_MS) || 90 * 1000; // ~90s

function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return downloadUrl(res.headers.location).then(resolve).catch(reject);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'your_telegram_bot_token') {
    console.log('TELEGRAM_BOT_TOKEN not configured — Telegram bot disabled.');
    return;
  }

  try {
    bot = new TelegramBot(token, { polling: true });
    bot.on('polling_error', () => {});
    console.log('Telegram Bot Service initialized & listening!');
    setupCommands();
    setupCallbacks();
    setupVoice();
    setupHumanChat();
    startImportantMailWatcher();
  } catch (err) {
    console.error('Telegram Bot Error:', err.message);
  }
}

async function loadTaggedInbox(userId, max = 10) {
  const emails = await GmailService.fetchInbox(userId, max);
  return emails.map((e) => ({
    ...e,
    triage: AIService.classifyEmail(e.subject, e.snippet, e.from),
    meetingHint: AIService.looksLikeMeeting(e.subject, e.snippet)
  }));
}

function isImportant(email) {
  const c = email.triage?.category;
  return c === 'Urgent' || c === 'Job' || c === 'Meeting' || c === 'College';
}

function startImportantMailWatcher() {
  if (watchTimer) clearInterval(watchTimer);
  console.log(`Important-mail Telegram watcher every ${WATCH_MS / 1000}s`);
  // First run after short delay so DB is ready
  setTimeout(() => {
    checkImportantMailForAll().catch(() => {});
  }, 15000);
  watchTimer = setInterval(() => {
    checkImportantMailForAll().catch((e) => console.warn('Mail watch:', e.message));
  }, WATCH_MS);
}

async function checkImportantMailForAll() {
  if (!bot) return;
  let users = [];
  try {
    users = await UserModel.findTelegramLinkedWithGoogle();
  } catch (e) {
    return;
  }

  for (const user of users) {
    try {
      const emails = await loadTaggedInbox(user.id, 8);
      const important = emails.filter(isImportant);
      for (const email of important) {
        const key = `${user.id}:${email.id}`;
        if (notifiedMailIds.has(key)) continue;
        notifiedMailIds.add(key);

        const text =
          `*Important mail*\n` +
          `[${email.triage.category}] ${email.subject}\n` +
          `From: ${email.from}\n` +
          `${(email.snippet || '').substring(0, 180)}\n\n` +
          `Reply here casually, or /inbox · Voice Reply`;

        await bot.sendMessage(user.telegram_chat_id, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'AI Reply', callback_data: `ai_reply_${email.id}` },
                { text: 'Voice Reply', callback_data: `voice_ready_${email.id}` }
              ]
            ]
          }
        });
      }
      // Cap memory
      if (notifiedMailIds.size > 2000) {
        const keep = [...notifiedMailIds].slice(-800);
        notifiedMailIds.clear();
        keep.forEach((k) => notifiedMailIds.add(k));
      }
    } catch (err) {
      console.warn(`Watch user ${user.id}:`, err.message);
    }
  }
}

function setupHumanChat() {
  if (!bot) return;

  bot.on('message', async (msg) => {
    if (!msg.text || msg.voice) return;
    const text = msg.text.trim();
    if (text.startsWith('/')) return; // commands handled elsewhere

    const chatId = msg.chat.id;
    const user = await UserModel.findByTelegramChatId(chatId);
    if (!user) {
      return bot.sendMessage(
        chatId,
        "Hey! Link your account first — generate a code on the website, then send /connect YOURCODE"
      );
    }
    if (!user.google_tokens) {
      return bot.sendMessage(chatId, 'Sign in with Google on the website first, then chat with me here.');
    }

    // Typing indicator
    try {
      await bot.sendChatAction(chatId, 'typing');
    } catch (_) {}

    try {
      const emails = await loadTaggedInbox(user.id, 10);
      const reply = await AIService.chatAboutMail(text, emails);
      await bot.sendMessage(chatId, reply);
    } catch (err) {
      bot.sendMessage(chatId, `Couldn't check mail right now: ${err.message}`);
    }
  });
}

function setupCommands() {
  if (!bot) return;

  bot.onText(/\/(start|connect|link)(?:\s+(.+))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const linkCode = match[2] ? match[2].trim().toUpperCase() : null;

    if (linkCode) {
      try {
        const user = await UserModel.linkTelegramChat(linkCode, chatId);
        if (user.alreadyLinked) {
          // Silent on duplicate — first message already welcomed them
          return;
        }
        return bot.sendMessage(
          chatId,
          `*Linked!* Hey ${user.name} 👋\n\nChat like a human — e.g.\n"any important mail?"\n"what's urgent?"\n\nI'll also *push* you when important mail arrives.\n\n/brief /inbox /triage`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        // If somehow already linked, don't scare the user
        const existing = await UserModel.findByTelegramChatId(chatId);
        if (existing) return;
        return bot.sendMessage(chatId, `Link Error: ${err.message}`);
      }
    }

    bot.sendMessage(
      chatId,
      `*Gmail AI Bot*\n\nTalk normally:\n• "hey any important mail?"\n• "show urgent emails"\n\nOr commands: /connect /brief /inbox /triage\nI'll notify you when important mail lands.`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.onText(/\/brief/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await UserModel.findByTelegramChatId(chatId);
    if (!user) return bot.sendMessage(chatId, 'Link first: `/connect CODE`', { parse_mode: 'Markdown' });
    if (!user.google_tokens) return bot.sendMessage(chatId, 'Sign in with Google on the website first.');

    await bot.sendMessage(chatId, 'Building your morning briefing…');
    try {
      const emails = await loadTaggedInbox(user.id, 8);
      const triageCounts = {};
      for (const e of emails) triageCounts[e.triage.category] = (triageCounts[e.triage.category] || 0) + 1;

      let events = [];
      try {
        events = await CalendarService.listUpcomingEvents(user.id, 4);
      } catch (_) {}

      const narrative = await AIService.buildBriefingNarrative({ emails, events, triageCounts });
      const top = emails
        .slice(0, 4)
        .map((e) => `• [${e.triage.category}] ${e.subject}`)
        .join('\n');

      await bot.sendMessage(
        chatId,
        `*Morning Briefing*\nUnread: ${emails.length}\n${Object.entries(triageCounts)
          .map(([k, v]) => `${k}:${v}`)
          .join(' · ')}\n\n${narrative}\n\n*Top mail*\n${top || 'None'}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      bot.sendMessage(chatId, `Briefing failed: ${err.message}`);
    }
  });

  bot.onText(/\/triage/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await UserModel.findByTelegramChatId(chatId);
    if (!user?.google_tokens) return bot.sendMessage(chatId, 'Link account + Google first.');
    await bot.sendMessage(chatId, 'Auto-triaging unread mail into Gmail labels…');
    try {
      const results = await GmailService.autoTriageInbox(user.id, 10);
      const counts = {};
      for (const r of results) counts[r.triage.category] = (counts[r.triage.category] || 0) + 1;
      bot.sendMessage(
        chatId,
        `Labeled *${results.length}* messages.\n${Object.entries(counts)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      bot.sendMessage(chatId, `Triage failed: ${err.message}`);
    }
  });

  bot.onText(/\/inbox/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await UserModel.findByTelegramChatId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, 'Link first: `/connect YOUR_CODE`', { parse_mode: 'Markdown' });
    }
    if (!user.google_tokens) return bot.sendMessage(chatId, 'Google not connected on the website.');

    bot.sendMessage(chatId, 'Fetching unread…');
    try {
      const emails = await loadTaggedInbox(user.id, 5);
      if (!emails.length) return bot.sendMessage(chatId, 'No unread emails.');

      for (const email of emails) {
        const card =
          `*[${email.triage.category}]* \`${email.id}\`\n` +
          `From: ${email.from}\n` +
          `*${email.subject}*\n` +
          `${(email.snippet || '').substring(0, 160)}`;

        const row = [
          { text: 'AI Reply', callback_data: `ai_reply_${email.id}` },
          { text: 'Voice Reply', callback_data: `voice_ready_${email.id}` }
        ];

        await bot.sendMessage(chatId, card, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [row] }
        });
      }
    } catch (err) {
      bot.sendMessage(chatId, `Error: ${err.message}`);
    }
  });

  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      `*Chat naturally*\n"any important mail?"\n"what's urgent?"\n\n*Commands*\n/connect /brief /inbox /triage\n\n*Alerts*\nI push you when Urgent / Job / Meeting / College mail arrives.`,
      { parse_mode: 'Markdown' }
    );
  });
}

function setupVoice() {
  if (!bot) return;

  bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;
    const target = pendingVoice[chatId];
    if (!target?.email) {
      return bot.sendMessage(
        chatId,
        'No email selected for voice reply. Run /inbox → tap Voice Reply, then send a voice note.'
      );
    }

    const user = await UserModel.findByTelegramChatId(chatId);
    if (!user?.google_tokens) return bot.sendMessage(chatId, 'Google not connected.');

    await bot.sendMessage(chatId, 'Transcribing voice → drafting reply…');
    try {
      const file = await bot.getFile(msg.voice.file_id);
      const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const buf = await downloadUrl(url);
      const replyText = await AIService.voiceToEmailReply(
        buf.toString('base64'),
        'audio/ogg',
        target.email
      );

      const emailId = target.email.id;
      pendingDrafts[`${chatId}_${emailId}`] = { email: target.email, replyText };
      delete pendingVoice[chatId];

      await bot.sendMessage(
        chatId,
        `*Voice → email draft*\n\`\`\`\n${replyText.substring(0, 3500)}\n\`\`\``,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Send Reply', callback_data: `send_reply_${emailId}` },
                { text: 'Cancel', callback_data: `skip_${emailId}` }
              ]
            ]
          }
        }
      );
    } catch (err) {
      bot.sendMessage(chatId, `Voice reply failed: ${err.message}`);
    }
  });
}

function setupCallbacks() {
  if (!bot) return;

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('voice_ready_')) {
      const emailId = data.replace('voice_ready_', '');
      bot.answerCallbackQuery(query.id, { text: 'Send a voice note now' });
      const user = await UserModel.findByTelegramChatId(chatId);
      if (!user?.google_tokens) return bot.sendMessage(chatId, 'Google not connected.');
      const emails = await GmailService.fetchInbox(user.id, 15);
      const email = emails.find((e) => e.id === emailId);
      if (!email) return bot.sendMessage(chatId, 'Email not found — try /inbox again.');
      pendingVoice[chatId] = { email };
      return bot.sendMessage(
        chatId,
        `Ready for voice reply to:\n*${email.subject}*\n\nSend a voice message now.`,
        { parse_mode: 'Markdown' }
      );
    }

    if (data.startsWith('ai_reply_')) {
      const emailId = data.replace('ai_reply_', '');
      bot.answerCallbackQuery(query.id, { text: 'Generating…' });
      const user = await UserModel.findByTelegramChatId(chatId);
      if (!user?.google_tokens) return bot.sendMessage(chatId, 'Google not connected.');
      const emails = await GmailService.fetchInbox(user.id, 10);
      const email =
        emails.find((e) => e.id === emailId) || {
          id: emailId,
          from: 'Sender',
          subject: 'Subject',
          snippet: ''
        };
      const aiReply = await AIService.generateEmailReply(email.from, email.subject, email.snippet);
      pendingDrafts[`${chatId}_${emailId}`] = { email, replyText: aiReply };
      return bot.sendMessage(chatId, `*AI draft*\n\`\`\`\n${aiReply}\n\`\`\``, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Send Reply', callback_data: `send_reply_${emailId}` },
              { text: 'Cancel', callback_data: `skip_${emailId}` }
            ]
          ]
        }
      });
    }

    if (data.startsWith('send_reply_')) {
      const emailId = data.replace('send_reply_', '');
      const draft = pendingDrafts[`${chatId}_${emailId}`];
      bot.answerCallbackQuery(query.id, { text: 'Sending…' });
      const user = await UserModel.findByTelegramChatId(chatId);
      if (!user?.google_tokens) return bot.sendMessage(chatId, 'Google not connected.');
      try {
        await GmailService.sendReply(user.id, {
          to: draft ? draft.email.from : 'recipient',
          subject: draft ? draft.email.subject : 'Subject',
          threadId: draft?.email?.threadId || emailId,
          replyText: draft ? draft.replyText : 'Thank you.'
        });
        delete pendingDrafts[`${chatId}_${emailId}`];
        bot.sendMessage(chatId, 'Email reply sent via Gmail API.');
      } catch (err) {
        bot.sendMessage(chatId, `Send failed: ${err.message}`);
      }
    }

    if (data.startsWith('skip_')) {
      bot.answerCallbackQuery(query.id, { text: 'Skipped' });
      delete pendingVoice[chatId];
      bot.sendMessage(chatId, 'Skipped.');
    }
  });
}

initTelegramBot();

module.exports = {
  getBotInstance: () => bot,
  checkImportantMailForAll
};
