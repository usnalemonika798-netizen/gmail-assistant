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
const morningSent = new Set();
const deadGoogleUsers = new Set();
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
    let logged409 = false;
    bot.on('polling_error', (error) => {
      const msg = error?.message || String(error);
      if (/409/.test(msg)) {
        if (!logged409) {
          logged409 = true;
          console.warn('Telegram 409: another process is polling this bot. Stop gmail-bot if it is running.');
        }
        return;
      }
      console.warn('Telegram polling:', msg);
    });
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
    if (deadGoogleUsers.has(user.id)) continue;
    try {
      const emails = await loadTaggedInbox(user.id, 8);
      const important = emails.filter(isImportant);
      for (const email of important) {
        const key = `${user.id}:${email.id}`;
        if (notifiedMailIds.has(key)) continue;
        notifiedMailIds.add(key);

        const text =
          `Heads up — this one looks ${email.triage.category.toLowerCase()}.\n\n` +
          `${email.subject}\n` +
          `From ${email.from}\n` +
          `${(email.snippet || '').substring(0, 180)}\n\n` +
          `Want me to draft a reply? Tap below, or just tell me what to say.`;

        await bot.sendMessage(user.telegram_chat_id, text, replyKeyboard(email.id));
      }
      // Cap memory
      if (notifiedMailIds.size > 2000) {
        const keep = [...notifiedMailIds].slice(-800);
        notifiedMailIds.clear();
        keep.forEach((k) => notifiedMailIds.add(k));
      }
      await maybeMorningNote(user, emails);
    } catch (err) {
      const msg = err.message || '';
      if (/invalid_grant|ENOTFOUND|invalid_client/i.test(msg)) {
        deadGoogleUsers.add(user.id);
        console.warn(`Watch user ${user.id}: ${msg} — skipped until Google reconnect`);
      } else {
        console.warn(`Watch user ${user.id}:`, msg);
      }
    }
  }
}

async function maybeMorningNote(user, emails) {
  // ponytail: in-memory "already sent today"; a restart inside 8:00–8:19 IST can send twice
  const now = istParts();
  if (now.hour !== 8 || now.minute >= 20) return;
  const key = `${user.id}:${now.day}`;
  if (morningSent.has(key)) return;

  const list = emails || [];
  const important = list.filter(isImportant);
  const lines = (important.length ? important : list)
    .slice(0, 4)
    .map((e) => `- ${e.subject} (${e.triage?.category || 'Other'})`)
    .join('\n');
  const text = important.length
    ? `Good morning, ${firstName(user)}.\n\n${list.length} in Primary, ${important.length} look important:\n${lines}\n\nTap Thanks or I'll check on a mail if you want a short reply sent.`
    : `Good morning, ${firstName(user)}.\n\n${list.length} in Primary, and nothing looks urgent.\n${lines || 'Inbox is quiet.'}`;

  try {
    await bot.sendMessage(user.telegram_chat_id, text);
    morningSent.add(key);
  } catch (err) {
    console.warn('Morning note:', err.message);
  }
}

const chatMemory = {};

function detectIntent(text) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return 'chat';
  if (/^(hi|hey|hello|yo|hii+|good (morning|evening|afternoon)|sup)\b/.test(t) && t.split(/\s+/).length <= 6) {
    return 'greet';
  }
  if (/\b(help|what can you do|how (do|does) (this|you) work|what should i say)\b/.test(t)) return 'help';
  if (/\b(triage|label|sort|organize|organise)\b/.test(t) && /\b(mail|email|inbox|these|them|it)\b/.test(t)) {
    return 'triage';
  }
  if (
    /\b(reply|replies|thank|thanks|thankyou)\b/.test(t) ||
    /\bi want (to )?(reply|say|send|write)\b/.test(t)
  ) {
    return 'reply';
  }
  if (
    /\b(brif|breif|brief|explain|summarize|summarise|tell me about)\b/.test(t) &&
    /\b(that|this|it|security|alert|last|mail|email)\b/.test(t) &&
    !/morning/.test(t)
  ) {
    return 'explain';
  }
  if (/\b(morning briefing|catch me up|what'?s going on|whats going on|brief my inbox|full briefing)\b/.test(t)) {
    return 'brief';
  }
  if (/\b(important|urgent|priority|\bimp\b|need(s)? (my )?attention|anything i should)\b/.test(t)) return 'important';
  if (/\b(inbox|unread|mailbox|check (my )?(mail|email|gmail)|show (me )?(my )?(mail|email|emails|inbox)|any (new )?mail|new (mail|email)|what'?s in my)\b/.test(t)) {
    return 'inbox';
  }
  return 'chat';
}

function cleanText(value) {
  return String(value || '')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickEmail(chatId, text, emails) {
  const stop = new Set([
    'that', 'this', 'mail', 'email', 'want', 'have', 'show', 'from', 'with', 'your', 'just',
    'say', 'thank', 'thanks', 'reply', 'brief', 'brif', 'about', 'got', 'last', 'please',
    'tell', 'what', 'does', 'the', 'and', 'for', 'you', 'me', 'send', 'write'
  ]);
  const words = String(text || '')
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3 && !stop.has(w));
  let best = null;
  let bestScore = 0;
  for (const email of emails || []) {
    const hay = `${email.subject} ${email.from} ${email.snippet}`.toLowerCase();
    let score = 0;
    for (const word of words) if (hay.includes(word)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = email;
    }
  }
  const chosen = bestScore > 0 ? best : chatMemory[chatId]?.focus || null;
  if (chosen) chatMemory[chatId] = { emails, focus: chosen };
  return chosen;
}

function replyKeyboard(emailId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'AI Reply', callback_data: `ai_reply_${emailId}` },
          { text: 'Voice Reply', callback_data: `voice_ready_${emailId}` }
        ],
        [
          { text: 'Thanks', callback_data: `qt_${emailId}` },
          { text: "I'll check", callback_data: `qc_${emailId}` },
          { text: 'Not now', callback_data: `ql_${emailId}` }
        ]
      ]
    }
  };
}

function quickReplyText(kind, subject) {
  const about = subject ? ` regarding "${subject}"` : '';
  if (kind === 'check') {
    return `Hi,\n\nThanks for the note${about}. I'll check this and get back to you.\n\nBest regards`;
  }
  return `Hi,\n\nThank you for the message${about}. I've received it.\n\nBest regards`;
}

function istParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    day: `${get('year')}-${get('month')}-${get('day')}`
  };
}

async function say(chatId, text, extra) {
  try {
    return await bot.sendMessage(chatId, text, extra);
  } catch (err) {
    if (extra && extra.parse_mode) {
      const plain = { ...extra };
      delete plain.parse_mode;
      return bot.sendMessage(chatId, text, plain);
    }
    throw err;
  }
}

async function requireLinked(chatId) {
  const user = await UserModel.findByTelegramChatId(chatId);
  if (!user) {
    await say(
      chatId,
      "Hey — I don't know this chat yet.\n\nOn the website, tap Link Telegram, then paste the code here like:\n/connect ABC123"
    );
    return null;
  }
  if (!user.google_tokens) {
    await say(
      chatId,
      "You're linked, but Gmail isn't connected yet.\n\nSign in with Google on the website, then just talk to me here."
    );
    return null;
  }
  return user;
}

function firstName(user) {
  return (user?.name || '').split(' ')[0] || 'there';
}

async function sendInbox(chatId, user) {
  await say(chatId, 'One sec — checking your Primary inbox.');
  const emails = await loadTaggedInbox(user.id, 5);
  if (!emails.length) {
    return say(chatId, "You're clear. Nothing in Primary right now.");
  }
  await say(chatId, `Here are ${emails.length} from Primary. Tap a button if you want a reply.`);
  for (const email of emails) {
    const card =
      `${email.subject}\n` +
      `From ${email.from}\n` +
      `${email.triage.category}\n` +
      `${(email.snippet || '').substring(0, 160)}`;
    chatMemory[chatId] = { emails, focus: emails[0] };
    await say(chatId, card, replyKeyboard(email.id));
  }
}

async function sendImportant(chatId, user) {
  const emails = await loadTaggedInbox(user.id, 10);
  const important = emails.filter(isImportant);
  if (!emails.length) return say(chatId, "Nothing unread. You're good.");
  if (!important.length) {
    return say(
      chatId,
      `You've got ${emails.length} unread, but none look urgent. Say "show my inbox" if you still want to skim them.`
    );
  }
  const lines = important
    .slice(0, 5)
    .map((e, i) => `${i + 1}. ${e.subject}\n   ${e.triage.category} · ${e.from}`)
    .join('\n');
  await say(
    chatId,
    `Yeah — ${important.length} look worth opening:\n\n${lines}\n\nSay "show my inbox" for the full list, or "draft a reply" after I show one.`
  );
}

async function sendBrief(chatId, user) {
  await say(chatId, `Alright ${firstName(user)}, pulling a quick briefing.`);
  const emails = await loadTaggedInbox(user.id, 8);
  const triageCounts = {};
  for (const e of emails) triageCounts[e.triage.category] = (triageCounts[e.triage.category] || 0) + 1;
  let events = [];
  try {
    events = await CalendarService.listUpcomingEvents(user.id, 4);
  } catch (_) {}
  const narrative = await AIService.buildBriefingNarrative({ emails, events, triageCounts });
  const top = emails.slice(0, 4).map((e) => `- ${e.subject} (${e.triage.category})`).join('\n');
  await say(chatId, `${narrative}\n\nWhat's waiting:\n${top || 'Nothing unread.'}`);
}

async function sendTriage(chatId, user) {
  await say(chatId, 'On it — labeling these in Gmail so they are easier to scan.');
  const results = await GmailService.autoTriageInbox(user.id, 10);
  const counts = {};
  for (const r of results) counts[r.triage.category] = (counts[r.triage.category] || 0) + 1;
  const summary = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ') || 'nothing to label';
  await say(chatId, `Done. I labeled ${results.length} email${results.length === 1 ? '' : 's'} (${summary}).`);
}

async function sendHelp(chatId, user) {
  const name = firstName(user);
  await say(
    chatId,
    `Hey ${name}. Just talk to me like a person. You can say:\n\n` +
      `"any important mail?"\n` +
      `"show my inbox"\n` +
      `"give me a morning briefing"\n` +
      `"label my mail"\n\n` +
      `I'll also ping you when something urgent, a job mail, a meeting, or college mail shows up.`
  );
}

async function sendGreet(chatId, user) {
  let extra = '';
  try {
    const emails = await loadTaggedInbox(user.id, 8);
    const important = emails.filter(isImportant);
    if (!emails.length) extra = "\n\nInbox looks quiet.";
    else if (!important.length) extra = `\n\nYou've got ${emails.length} unread, nothing urgent.`;
    else extra = `\n\nYou've got ${emails.length} unread, and ${important.length} look important.`;
  } catch (_) {}
  await say(
    chatId,
    `Hey ${firstName(user)}.${extra}\n\nAsk me anything — "what's important?", "show my inbox", or "morning briefing".`
  );
}

async function explainEmail(chatId, user, text) {
  const emails = await loadTaggedInbox(user.id, 10);
  const email = pickEmail(chatId, text, emails);
  if (!email) return say(chatId, 'Which mail? Tell me the subject, like "the security alert".');
  const preview = cleanText(email.snippet).slice(0, 420);
  await say(
    chatId,
    `${email.subject}\nFrom ${email.from}\n\n${preview}\n\nThat's the short version. If you want to answer it, say what to write — for example "say thank you".`,
    replyKeyboard(email.id)
  );
}

async function replyToEmail(chatId, user, text) {
  const emails = await loadTaggedInbox(user.id, 10);
  const email = pickEmail(chatId, text, emails);
  if (!email) return say(chatId, 'Which mail should I answer? Mention it, like "thank you for the security alert".');
  const replyText = await AIService.generateEmailReply(
    email.from,
    email.subject,
    `${cleanText(email.snippet)}\n\nWrite the reply so it does this: ${text}`,
    /thank/i.test(text) ? 'Friendly' : 'Professional'
  );
  pendingDrafts[`${chatId}_${email.id}`] = { email, replyText };
  await say(chatId, `Here's a reply for "${email.subject}":\n\n${replyText}`, {
    reply_markup: {
      inline_keyboard: [[
        { text: 'Send Reply', callback_data: `send_reply_${email.id}` },
        { text: 'Cancel', callback_data: `skip_${email.id}` }
      ]]
    }
  });
}

async function handleHuman(chatId, text) {
  const user = await requireLinked(chatId);
  if (!user) return;
  try {
    await bot.sendChatAction(chatId, 'typing');
  } catch (_) {}

  const intent = detectIntent(text);
  try {
    if (intent === 'inbox') return await sendInbox(chatId, user);
    if (intent === 'important') return await sendImportant(chatId, user);
    if (intent === 'explain') return await explainEmail(chatId, user, text);
    if (intent === 'reply') return await replyToEmail(chatId, user, text);
    if (intent === 'brief') return await sendBrief(chatId, user);
    if (intent === 'triage') return await sendTriage(chatId, user);
    if (intent === 'help') return await sendHelp(chatId, user);
    if (intent === 'greet') return await sendGreet(chatId, user);

    const emails = await loadTaggedInbox(user.id, 10);
    pickEmail(chatId, text, emails);
    const reply = await AIService.chatAboutMail(text, emails, user.name);
    await say(chatId, reply);
  } catch (err) {
    await say(chatId, "I couldn't reach Gmail just now. Try again in a moment, or say \"show my inbox\".");
    console.warn('Human chat:', err.message);
  }
}

function setupHumanChat() {
  if (!bot) return;

  bot.on('message', async (msg) => {
    if (!msg.text || msg.voice) return;
    const text = msg.text.trim();
    if (text.startsWith('/')) return;
    await handleHuman(msg.chat.id, text);
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
        return say(
          chatId,
          `You're in, ${user.name}.\n\nJust talk normally. Try "any important mail?" or "show my inbox". I'll also message you when something important lands.`
        );
      } catch (err) {
        const existing = await UserModel.findByTelegramChatId(chatId);
        if (existing) return;
        return say(chatId, `That code didn't work. ${err.message}`);
      }
    }

    say(
      chatId,
      `Hey. I'm your Gmail assistant.\n\nLink me from the website, then talk like you would to a person:\n"any important mail?"\n"show my inbox"\n"morning briefing"`
    );
  });

  bot.onText(/\/brief/, async (msg) => {
    const user = await requireLinked(msg.chat.id);
    if (!user) return;
    try {
      await sendBrief(msg.chat.id, user);
    } catch (err) {
      say(msg.chat.id, "Couldn't build the briefing just now. Try again in a moment.");
    }
  });

  bot.onText(/\/triage/, async (msg) => {
    const user = await requireLinked(msg.chat.id);
    if (!user) return;
    try {
      await sendTriage(msg.chat.id, user);
    } catch (err) {
      say(msg.chat.id, "Couldn't label mail just now. Try again in a moment.");
    }
  });

  bot.onText(/\/inbox/, async (msg) => {
    const user = await requireLinked(msg.chat.id);
    if (!user) return;
    try {
      await sendInbox(msg.chat.id, user);
    } catch (err) {
      say(msg.chat.id, "Couldn't open your inbox just now. Try again in a moment.");
    }
  });

  bot.onText(/\/help/, async (msg) => {
    const user = await UserModel.findByTelegramChatId(msg.chat.id);
    await sendHelp(msg.chat.id, user);
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
        'Tell me which email first. Say "show my inbox", tap AI Reply or Voice Reply, then send the voice note.'
      );
    }

    const user = await UserModel.findByTelegramChatId(chatId);
    if (!user?.google_tokens) return bot.sendMessage(chatId, 'Google not connected.');

    await say(chatId, 'Got it — turning that into an email.');
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

      await say(chatId, `Here's the draft:\n\n${replyText.substring(0, 3500)}`, {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Send it', callback_data: `send_reply_${emailId}` },
            { text: 'Never mind', callback_data: `skip_${emailId}` }
          ]]
        }
      });
    } catch (err) {
      say(chatId, "I couldn't turn that voice note into a reply. Try saying it again, or type what you want to send.");
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
      bot.answerCallbackQuery(query.id, { text: 'Send a voice note' });
      const user = await UserModel.findByTelegramChatId(chatId);
      if (!user?.google_tokens) return bot.sendMessage(chatId, 'Google not connected.');
      const emails = await GmailService.fetchInbox(user.id, 15);
      const email = emails.find((e) => e.id === emailId);
      if (!email) return say(chatId, 'That email is gone from the list. Say "show my inbox" and pick it again.');
      pendingVoice[chatId] = { email };
      return say(chatId, `Go ahead — send a voice note for:\n${email.subject}`);
    }

    if (data.startsWith('ai_reply_')) {
      const emailId = data.replace('ai_reply_', '');
      bot.answerCallbackQuery(query.id, { text: 'Writing a draft…' });
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
      return say(chatId, `Here's a draft. Send it, or tell me to change the tone.\n\n${aiReply}`, {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Send it', callback_data: `send_reply_${emailId}` },
            { text: 'Never mind', callback_data: `skip_${emailId}` }
          ]]
        }
      });
    }

    if (data.startsWith('send_reply_')) {
      const emailId = data.replace('send_reply_', '');
      const draft = pendingDrafts[`${chatId}_${emailId}`];
      bot.answerCallbackQuery(query.id, { text: 'Sending…' });
      if (!draft) return say(chatId, 'That draft expired. Say "show my inbox" and draft it again.');
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
        say(chatId, 'Sent. It should be in the thread now.');
      } catch (err) {
        say(chatId, "Couldn't send that. Sign in with Google again on the website if this keeps happening.");
      }
    }

    if (data.startsWith('qt_') || data.startsWith('qc_')) {
      const kind = data.startsWith('qc_') ? 'check' : 'thanks';
      const emailId = data.slice(3);
      bot.answerCallbackQuery(query.id, { text: 'Sending…' });
      const user = await UserModel.findByTelegramChatId(chatId);
      if (!user?.google_tokens) return say(chatId, 'Sign in with Google on the website first.');
      const emails = await GmailService.fetchInbox(user.id, 15);
      const email = emails.find((e) => e.id === emailId);
      if (!email) return say(chatId, 'That email is gone. Say "show my inbox" and pick it again.');
      try {
        await GmailService.sendReply(user.id, {
          to: email.from,
          subject: email.subject,
          threadId: email.threadId,
          replyText: quickReplyText(kind, email.subject)
        });
        return say(chatId, kind === 'check'
          ? `Sent. I told them you'll check "${email.subject}".`
          : `Sent. I thanked them for "${email.subject}".`);
      } catch (err) {
        return say(chatId, "Couldn't send that. Sign in with Google again if this keeps happening.");
      }
    }

    if (data.startsWith('ql_')) {
      bot.answerCallbackQuery(query.id, { text: 'Okay' });
      return say(chatId, 'Left it for later.');
    }

    if (data.startsWith('skip_')) {
      bot.answerCallbackQuery(query.id, { text: 'Okay' });
      delete pendingVoice[chatId];
      delete pendingDrafts[`${chatId}_${data.replace('skip_', '')}`];
      say(chatId, 'No problem — I dropped that draft.');
    }
  });
}

if (require.main === module && process.argv.includes('--check-intent')) {
  const cases = [
    ['any important mail?', 'important'],
    ['show my inbox', 'inbox'],
    ['hey', 'greet'],
    ['give me a morning briefing', 'brief'],
    ['please label my mail', 'triage'],
    ['what can you do', 'help'],
    ['who emailed me about the project deadline', 'chat'],
    ['brif me that mail', 'explain'],
    ['i want say thank you for this mail', 'reply'],
    ['show me imp mail', 'important']
  ];
  let failed = 0;
  for (const [text, want] of cases) {
    const got = detectIntent(text);
    if (got !== want) {
      failed += 1;
      console.error('intent fail:', JSON.stringify(text), 'got', got, 'want', want);
    }
  }
  if (failed) process.exit(1);
  console.log('intent check ok');
  process.exit(0);
}

initTelegramBot();

module.exports = {
  getBotInstance: () => bot,
  checkImportantMailForAll,
  detectIntent
};
