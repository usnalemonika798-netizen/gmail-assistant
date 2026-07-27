const TelegramBot = require('node-telegram-bot-api').TelegramBot || require('node-telegram-bot-api');
const UserModel = require('../models/user.model');
const GmailService = require('./gmail.service');
const AIService = require('./ai.service');
require('dotenv').config();

let bot = null;
const pendingDrafts = {}; // { chatId_emailId: { email, replyText } }

function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'your_telegram_bot_token') {
    console.log('⚠️  TELEGRAM_BOT_TOKEN not configured. Add your token in .env to enable Telegram Bot.');
    return;
  }

  try {
    bot = new TelegramBot(token, { polling: true });
    bot.on('polling_error', (error) => {
      // Suppress temporary internet connection drops
    });
    console.log('🤖 Telegram Bot Service initialized & listening!');

    setupCommands();
    setupCallbacks();
  } catch (err) {
    console.error('❌ Telegram Bot Error:', err.message);
  }
}

function setupCommands() {
  if (!bot) return;

  // /start or /connect <code|link_code>
  bot.onText(/\/(start|connect|link)(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const linkCode = match[2] ? match[2].trim().toUpperCase() : null;

    if (linkCode) {
      try {
        const user = await UserModel.linkTelegramChat(linkCode, chatId);
        return bot.sendMessage(
          chatId,
          `✅ *Account Linked Successfully!*\n\nWelcome *${user.name}* (${user.email}).\nNow you can use:\n📥 /inbox - View recent emails\n💬 /reply <id> <message> - Reply to emails directly from Telegram!`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        return bot.sendMessage(chatId, `❌ Link Error: ${err.message}. Generate a new code on your Web Dashboard.`);
      }
    }

    bot.sendMessage(
      chatId,
      `👋 *Welcome to Gmail AI Telegram Bot!*\n\n` +
      `To link your Gmail AI Account:\n` +
      `1. Log in on Web App and click *Generate Link Code*\n` +
      `2. Send command: \`/connect YOUR_CODE\`\n\n` +
      `*Commands:*\n` +
      `📥 /inbox - View unread emails & generate AI replies\n` +
      `💬 /reply <id> <msg> - Send reply to an email\n` +
      `❓ /help - Show this guide`,
      { parse_mode: 'Markdown' }
    );
  });

  // /inbox
  bot.onText(/\/inbox/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await UserModel.findByTelegramChatId(chatId);

    if (!user) {
      return bot.sendMessage(chatId, '⚠️ Account not linked yet! Send `/connect YOUR_CODE` to link your account.', { parse_mode: 'Markdown' });
    }

    bot.sendMessage(chatId, '🔍 Fetching recent unread Gmail emails...');

    try {
      if (!user.google_tokens) {
        return bot.sendMessage(chatId, '⚠️ Google not connected. Open the web app and Sign in with Google first.');
      }
      const emails = await GmailService.fetchInbox(user.id, 5);

      if (!emails || emails.length === 0) {
        return bot.sendMessage(chatId, '🎉 No unread emails in your inbox!');
      }

      for (const email of emails) {
        const emailCard =
          `📩 *Email ID:* \`${email.id}\`\n` +
          `👤 *From:* ${email.from}\n` +
          `📌 *Subject:* ${email.subject}\n` +
          `📅 *Date:* ${email.date}\n\n` +
          `📄 *Preview:*\n${email.snippet.substring(0, 200)}...`;

        await bot.sendMessage(chatId, emailCard, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🤖 Generate AI Reply', callback_data: `ai_reply_${email.id}` },
                { text: '❌ Skip', callback_data: `skip_${email.id}` }
              ]
            ]
          }
        });
      }
    } catch (err) {
      bot.sendMessage(chatId, `❌ Error fetching emails: ${err.message}`);
    }
  });

  // /reply <email_id> <message>
  bot.onText(/\/reply\s+([^\s]+)\s+(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const emailId = match[1].trim();
    const replyMessage = match[2].trim();

    const user = await UserModel.findByTelegramChatId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '⚠️ Please connect your account first using `/connect YOUR_CODE`.', { parse_mode: 'Markdown' });
    }

    bot.sendMessage(chatId, `⏳ Sending reply to email \`${emailId}\`...`, { parse_mode: 'Markdown' });

    try {
      const result = await GmailService.sendReply(user.id, {
        to: emailId,
        subject: 'Re: Email',
        threadId: emailId,
        replyText: replyMessage
      });

      bot.sendMessage(chatId, `✅ *Email Reply Sent Successfully!*`, { parse_mode: 'Markdown' });
    } catch (err) {
      bot.sendMessage(chatId, `❌ Error sending email: ${err.message}`);
    }
  });

  // /help
  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      `*Gmail AI Telegram Bot Guide:*\n\n` +
      `1️⃣ \`/connect CODE\` — Link Telegram to Web App\n` +
      `2️⃣ \`/inbox\` — View recent unread emails\n` +
      `3️⃣ Click *🤖 Generate AI Reply* on any email card\n` +
      `4️⃣ Tap *✅ Send Reply* to send email`,
      { parse_mode: 'Markdown' }
    );
  });
}

function setupCallbacks() {
  if (!bot) return;

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('ai_reply_')) {
      const emailId = data.replace('ai_reply_', '');
      bot.answerCallbackQuery(query.id, { text: '⚡ Generating AI reply...' });

      const user = await UserModel.findByTelegramChatId(chatId);
      if (!user || !user.google_tokens) {
        return bot.sendMessage(chatId, '⚠️ Google not connected. Sign in with Google on the web app first.');
      }
      const emails = await GmailService.fetchInbox(user.id, 10);
      const email = emails.find(e => e.id === emailId) || { from: 'Sender', subject: 'Subject', snippet: 'Content' };

      const aiReply = await AIService.generateEmailReply(email.from, email.subject, email.snippet);

      pendingDrafts[`${chatId}_${emailId}`] = { email, replyText: aiReply };

      const text =
        `🤖 *AI Generated Reply Draft:*\n\n` +
        `\`\`\`\n${aiReply}\n\`\`\``;

      bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Send Reply', callback_data: `send_reply_${emailId}` },
              { text: '❌ Cancel', callback_data: `skip_${emailId}` }
            ]
          ]
        }
      });
    }

    if (data.startsWith('send_reply_')) {
      const emailId = data.replace('send_reply_', '');
      const draft = pendingDrafts[`${chatId}_${emailId}`];

      bot.answerCallbackQuery(query.id, { text: 'Sending email...' });

      const user = await UserModel.findByTelegramChatId(chatId);
      if (!user || !user.google_tokens) {
        return bot.sendMessage(chatId, '⚠️ Google not connected.');
      }

      try {
        await GmailService.sendReply(user.id, {
          to: draft ? draft.email.from : 'recipient',
          subject: draft ? draft.email.subject : 'Subject',
          threadId: emailId,
          replyText: draft ? draft.replyText : 'Thank you.'
        });

        bot.sendMessage(chatId, '✅ *Email reply sent successfully via Gmail API!*', { parse_mode: 'Markdown' });
      } catch (err) {
        bot.sendMessage(chatId, `❌ Error sending email: ${err.message}`);
      }
    }

    if (data.startsWith('skip_')) {
      bot.answerCallbackQuery(query.id, { text: 'Skipped' });
      bot.sendMessage(chatId, '⏭️ Email skipped.');
    }
  });
}

initTelegramBot();

module.exports = {
  getBotInstance: () => bot
};
