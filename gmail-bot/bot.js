const TelegramBot = require('node-telegram-bot-api').TelegramBot || require('node-telegram-bot-api');
const { loadToken, getAuthUrl, saveToken, getUnreadEmails, markAsRead, sendReply } = require('./gmail');
const { generateReply } = require('./ai');
require('dotenv').config();

// Use local DB module — avoids cross-package node_modules resolution issues on Render
const db = require('./db');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN || 'dummy_token', { polling: true });

bot.on('polling_error', (error) => {
  if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
    // Expected when running multiple bot instances simultaneously
    return;
  }
  console.warn('⚠️ Telegram polling error:', error.message);
});

// Store pending emails awaiting approval { messageId: emailData }
const pendingEmails = {};

console.log('🤖 Telegram Bot started!');

// ===== COMMANDS =====

// /start or /link
bot.onText(/\/(start|link)(?:\s+(.+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const linkCode = match[2] ? match[2].trim().toUpperCase() : null;

  if (linkCode) {
    db.query('SELECT * FROM users WHERE UPPER(telegram_link_code) = ?', [linkCode], (err, results) => {
      if (err || !results || results.length === 0) {
        return bot.sendMessage(chatId, '❌ Invalid or expired Link Code. Generate a new code on your Web Dashboard under ✉️ Gmail AI.');
      }
      const userRow = results[0];
      db.query('UPDATE users SET telegram_chat_id = ?, telegram_link_code = NULL WHERE id = ?', [String(chatId), userRow.id], (err2) => {
        if (err2) return bot.sendMessage(chatId, '❌ Error linking account.');
        bot.sendMessage(chatId, `✅ *Telegram Linked Successfully!*\nWelcome *${userRow.name}* (${userRow.email}).\nNow you will receive your Gmail AI email alerts right here on Telegram! Use /check to view emails.`, { parse_mode: 'Markdown' });
      });
    });
    return;
  }

  bot.sendMessage(chatId,
    `👋 *Welcome to Gmail AI Auto-Reply Bot!*\n\n` +
    `To link your account, generate a code on your Web Dashboard and send:\n` +
    '`/link YOUR_CODE`\n\n' +
    `Commands:\n` +
    `📧 /check - Check unread emails & generate AI replies\n` +
    `🔗 /auth - Connect your Gmail account\n` +
    `❓ /help - Show help message`,
    { parse_mode: 'Markdown' }
  );
});

// /help
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `*How to use:*\n\n` +
    `1️⃣ Run /auth to connect Gmail (first time only)\n` +
    `2️⃣ Run /check to fetch unread emails\n` +
    `3️⃣ AI generates a reply draft for each email\n` +
    `4️⃣ Click ✅ Send to send the reply\n` +
    `5️⃣ Click ❌ Skip to ignore the email`,
    { parse_mode: 'Markdown' }
  );
});

// /auth - Gmail OAuth
bot.onText(/\/auth/, (msg) => {
  const chatId = msg.chat.id;
  const url = getAuthUrl();
  bot.sendMessage(chatId,
    `🔗 *Connect your Gmail:*\n\n` +
    `1. Click this link:\n${url}\n\n` +
    `2. Login and allow permissions\n` +
    `3. Copy the code from the URL\n` +
    `4. Send it here as: /code YOUR_CODE`,
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
});

// /code <oauth_code>
bot.onText(/\/code (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const code = match[1].trim();
  try {
    await saveToken(code);
    bot.sendMessage(chatId, '✅ *Gmail connected successfully!*\nNow use /check to see your emails.', { parse_mode: 'Markdown' });
  } catch (err) {
    bot.sendMessage(chatId, `❌ Auth failed: ${err.message}`);
  }
});

// /check - Fetch unread emails
bot.onText(/\/check/, async (msg) => {
  const chatId = msg.chat.id;

  if (!loadToken()) {
    return bot.sendMessage(chatId, '⚠️ Gmail not connected. Use /auth first.');
  }

  bot.sendMessage(chatId, '🔍 Checking unread emails...');

  try {
    const emails = await getUnreadEmails();

    if (emails.length === 0) {
      return bot.sendMessage(chatId, '✅ No unread emails!');
    }

    bot.sendMessage(chatId, `📧 Found *${emails.length}* unread email(s). Generating AI replies...`, { parse_mode: 'Markdown' });

    for (const email of emails) {
      try {
        const aiReply = await generateReply(email.from, email.subject, email.snippet);

        // Store for approval
        pendingEmails[email.id] = { ...email, aiReply };

        const text =
          `📩 *New Email*\n` +
          `👤 From: ${email.from}\n` +
          `📌 Subject: ${email.subject}\n\n` +
          `📄 *Preview:*\n${email.snippet.substring(0, 200)}...\n\n` +
          `🤖 *AI Draft Reply:*\n\`\`\`\n${aiReply}\n\`\`\``;

        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Send Reply', callback_data: `send_${email.id}` },
              { text: '❌ Skip', callback_data: `skip_${email.id}` }
            ]]
          }
        });
      } catch (e) {
        bot.sendMessage(chatId, `⚠️ Error processing email: ${e.message}`);
      }
    }
  } catch (err) {
    bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }
});

// ===== BUTTON CALLBACKS =====
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('send_')) {
    const emailId = data.replace('send_', '');
    const email = pendingEmails[emailId];

    if (!email) {
      return bot.answerCallbackQuery(query.id, { text: '⚠️ Email data expired. Use /check again.' });
    }

    try {
      await sendReply(email.threadId, email.from, email.subject, email.aiReply);
      await markAsRead(emailId);
      delete pendingEmails[emailId];

      bot.answerCallbackQuery(query.id, { text: '✅ Reply sent!' });
      bot.editMessageText(
        query.message.text + '\n\n✅ *Reply sent successfully!*',
        { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
      );
    } catch (err) {
      bot.answerCallbackQuery(query.id, { text: '❌ Failed to send reply' });
      bot.sendMessage(chatId, `❌ Error sending reply: ${err.message}`);
    }
  }

  if (data.startsWith('skip_')) {
    const emailId = data.replace('skip_', '');
    delete pendingEmails[emailId];
    bot.answerCallbackQuery(query.id, { text: '⏭️ Email skipped' });
    bot.editMessageText(
      query.message.text + '\n\n⏭️ *Skipped.*',
      { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
    );
  }
});

// Auto-check every 5 minutes (optional - uncomment to enable)
// setInterval(async () => {
//   YOUR_CHAT_ID = 'your_telegram_chat_id'; // Replace with your Telegram chat ID
//   bot.emit('message', { chat: { id: YOUR_CHAT_ID }, text: '/check' });
// }, 5 * 60 * 1000);
