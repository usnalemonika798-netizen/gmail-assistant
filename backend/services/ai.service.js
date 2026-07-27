const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const AIService = {
  // Analyze Email Urgency & Priority Category
  analyzeUrgency: (subject = '', snippet = '') => {
    const text = (subject + ' ' + snippet).toLowerCase();

    if (
      text.includes('urgent') || text.includes('asap') || text.includes('deadline') ||
      text.includes('interview') || text.includes('exam') || text.includes('important') ||
      text.includes('action required') || text.includes('immediately')
    ) {
      return { level: 'HIGH', label: '🔴 URGENT', color: '#ef4444', bg: '#fef2f2' };
    }

    if (
      text.includes('project') || text.includes('submission') || text.includes('update') ||
      text.includes('meeting') || text.includes('review') || text.includes('assignment')
    ) {
      return { level: 'MEDIUM', label: '🟡 NORMAL', color: '#d97706', bg: '#fffbeb' };
    }

    return { level: 'LOW', label: '🟢 INFO', color: '#059669', bg: '#f0fdf4' };
  },

  // Generate smart AI email reply with selectable Tone (Professional, Friendly, Brief)
  generateEmailReply: async (from, subject, snippet, tone = 'Professional') => {
    const senderName = from ? from.split('<')[0].replace(/"/g, '').trim() : 'Sender';
    const cleanSubject = subject || 'your inquiry';

    const toneInstructions = {
      Professional: 'Write a formal, highly professional corporate response.',
      Friendly: 'Write a warm, polite, and friendly colleague-style response.',
      Brief: 'Write an extremely concise 1-2 sentence direct response.'
    };

    const instruction = toneInstructions[tone] || toneInstructions.Professional;

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const prompt = `You are an AI email assistant. ${instruction}

From: ${from || 'Sender'}
Subject: ${cleanSubject}
Email Content: ${snippet}

Write ONLY the email reply text. Do not include subject line or headers.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text && text.trim()) return text.trim();
    } catch (err) {
      console.warn(`ℹ️ Gemini API note (${err.message.includes('429') ? 'Quota Rate Limited' : err.message}). Using Smart Reply Template.`);
    }

    // Smart fallback templates matching selected tone
    if (tone === 'Brief') {
      return `Dear ${senderName},\n\nThank you for the message regarding "${cleanSubject}". I have received it and will follow up shortly.\n\nBest regards,\nGmail AI Assistant`;
    }

    if (tone === 'Friendly') {
      return `Hi ${senderName}!\n\nThanks for reaching out about "${cleanSubject}". I've received your note and will get back to you soon!\n\nBest,\nGmail AI Assistant`;
    }

    return `Dear ${senderName},\n\nThank you for your email regarding "${cleanSubject}". I have received your message and will review it in detail shortly.\n\nBest regards,\nGmail AI Assistant`;
  },

  // Extract meeting intent from an email → Calendar + Google Meet fields
  extractMeetingFromEmail: async (from, subject, snippet) => {
    const fallback = () => {
      const emailMatch = (from || '').match(/<([^>]+)>/);
      const attendee = emailMatch ? emailMatch[1] : (from || '').includes('@') ? from.trim() : null;
      const start = new Date(Date.now() + 24 * 3600000);
      start.setMinutes(0, 0, 0);
      if (start.getHours() < 10) start.setHours(11);
      else if (start.getHours() > 17) {
        start.setDate(start.getDate() + 1);
        start.setHours(11);
      }
      const end = new Date(start.getTime() + 3600000);
      return {
        summary: subject ? `Meeting: ${subject}` : 'Project Discussion Meeting',
        description: `Auto-scheduled from email.\n\nFrom: ${from}\nSubject: ${subject}\n\n${snippet || ''}`,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        attendees: attendee ? [attendee] : []
      };
    };

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const nowIso = new Date().toISOString();
      const prompt = `Extract a calendar meeting from this email. Reply with ONLY valid JSON (no markdown).
Now (ISO): ${nowIso}
Timezone: Asia/Kolkata

Email From: ${from || ''}
Subject: ${subject || ''}
Body: ${snippet || ''}

JSON shape:
{"summary":"string","description":"string","startTime":"ISO8601","endTime":"ISO8601","attendees":["email@x.com"]}

Rules:
- If no clear time, schedule tomorrow 11:00 Asia/Kolkata for 1 hour
- Put sender email in attendees when possible
- description should briefly note it was scheduled from this email`;

      const result = await model.generateContent(prompt);
      let text = (result.response.text() || '').trim();
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
      const parsed = JSON.parse(text);
      const fb = fallback();
      return {
        summary: parsed.summary || fb.summary,
        description: parsed.description || fb.description,
        startTime: parsed.startTime || fb.startTime,
        endTime: parsed.endTime || fb.endTime,
        attendees: Array.isArray(parsed.attendees) && parsed.attendees.length
          ? parsed.attendees.filter(Boolean)
          : fb.attendees
      };
    } catch (err) {
      console.warn('Meeting extract fallback:', err.message);
      return fallback();
    }
  },

  // Classify into Gmail triage bucket
  classifyEmail: (subject = '', snippet = '', from = '') => {
    const text = `${from} ${subject} ${snippet}`.toLowerCase();
    if (
      /urgent|asap|deadline|immediately|action required|overdue/.test(text)
    ) {
      return { category: 'Urgent', gmailLabel: 'AI/Urgent', color: '#b91c1c', bg: '#fef2f2' };
    }
    if (/interview|internship|job|career|hr@|recruit|offer letter|hiring/.test(text)) {
      return { category: 'Job', gmailLabel: 'AI/Job', color: '#1d4ed8', bg: '#eff6ff' };
    }
    if (
      /meet|meeting|call|zoom|google meet|calendar|schedule|availability/.test(text)
    ) {
      return { category: 'Meeting', gmailLabel: 'AI/Meeting', color: '#0f766e', bg: '#f0fdfa' };
    }
    if (
      /professor|assignment|exam|college|university|submission|semester|project review/.test(text)
    ) {
      return { category: 'College', gmailLabel: 'AI/College', color: '#7c3aed', bg: '#f5f3ff' };
    }
    if (/unsubscribe|newsletter|promo|sale|% off|no-reply|noreply/.test(text)) {
      return { category: 'Noise', gmailLabel: 'AI/Noise', color: '#64748b', bg: '#f1f5f9' };
    }
    return { category: 'Other', gmailLabel: 'AI/Other', color: '#475569', bg: '#f8fafc' };
  },

  looksLikeMeeting: (subject = '', snippet = '') =>
    /meet|meeting|call|interview|zoom|schedule|availability|discuss/i.test(
      `${subject} ${snippet}`
    ),

  // Morning briefing summary text (Gemini + structured fallback)
  buildBriefingNarrative: async ({ emails, events, triageCounts }) => {
    const lines = emails.slice(0, 5).map(
      (e, i) =>
        `${i + 1}. [${e.triage?.category || 'Other'}] ${e.from} — ${e.subject}`
    );
    const eventLines = (events || []).slice(0, 5).map(
      (ev) => `- ${ev.title} @ ${ev.start}${ev.meetLink ? ' (Meet)' : ''}`
    );

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const prompt = `Write a crisp morning briefing (max 120 words) for a student/professional.
Unread emails:
${lines.join('\n') || 'None'}
Today's calendar:
${eventLines.join('\n') || 'None'}
Triage counts: ${JSON.stringify(triageCounts)}
Include 3 bullet "Suggested actions". Plain text only.`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text && text.trim()) return text.trim();
    } catch (err) {
      console.warn('Briefing narrative fallback:', err.message);
    }

    return [
      `You have ${emails.length} unread email(s).`,
      `Urgent: ${triageCounts.Urgent || 0} · Job: ${triageCounts.Job || 0} · Meeting: ${triageCounts.Meeting || 0} · College: ${triageCounts.College || 0}`,
      events?.length ? `Next on calendar: ${events[0].title}` : 'No upcoming calendar events loaded.',
      'Suggested actions:',
      '• Reply to Urgent items first',
      '• Schedule Meet for meeting-like emails',
      '• Run Auto-triage to label the rest in Gmail'
    ].join('\n');
  },

  // Voice note → email reply (Gemini multimodal audio)
  voiceToEmailReply: async (audioBase64, mimeType, email) => {
    const from = email?.from || 'Sender';
    const subject = email?.subject || 'your email';
    const snippet = email?.snippet || '';

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: mimeType || 'audio/ogg',
            data: audioBase64
          }
        },
        {
          text: `Transcribe this voice note, then rewrite it as a polished professional email reply.
Target email From: ${from}
Subject: ${subject}
Context: ${snippet}

Return ONLY the reply body text (no "Subject:", no transcript dump).`
        }
      ]);
      const text = result.response.text();
      if (text && text.trim()) return text.trim();
    } catch (err) {
      console.warn('Voice reply Gemini error:', err.message);
      throw new Error(
        'Voice transcription failed. Check GEMINI_API_KEY supports audio, or type a reply instead. ' +
          err.message
      );
    }

    throw new Error('Empty voice transcription');
  },

  // Human-style chat about inbox (Telegram free-text)
  chatAboutMail: async (userMessage, emails) => {
    const catalog = (emails || []).slice(0, 12).map((e, i) => {
      const triage = e.triage || AIService.classifyEmail(e.subject, e.snippet, e.from);
      return `${i + 1}. [${triage.category}] From: ${e.from} | Subject: ${e.subject} | Preview: ${(e.snippet || '').slice(0, 120)}`;
    });

    const important = (emails || []).filter((e) => {
      const c = (e.triage || AIService.classifyEmail(e.subject, e.snippet, e.from)).category;
      return c === 'Urgent' || c === 'Job' || c === 'Meeting' || c === 'College';
    });

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const prompt = `You are a friendly personal email assistant chatting on Telegram.
User said: "${userMessage}"

Unread emails (${emails.length}):
${catalog.join('\n') || 'None'}

Important/actionable count: ${important.length}

Reply like a helpful human friend (short, natural, WhatsApp/Telegram style).
- If they ask about important mail, clearly say yes/no and list the important ones briefly.
- If inbox empty, say so casually.
- Suggest /inbox, /brief, or Voice Reply when useful.
- No markdown tables. Max ~120 words.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text && text.trim()) return text.trim();
    } catch (err) {
      console.warn('chatAboutMail fallback:', err.message);
    }

    if (!emails.length) {
      return "Hey — your unread looks empty right now. Nothing important waiting. I'll ping you here if something urgent lands.";
    }
    if (!important.length) {
      return `You've got ${emails.length} unread, but nothing screaming urgent/job/meeting. Want me to run through them? Say "show inbox" or use /inbox.`;
    }
    const lines = important
      .slice(0, 5)
      .map((e) => {
        const c = (e.triage || AIService.classifyEmail(e.subject, e.snippet, e.from)).category;
        return `• [${c}] ${e.subject} — ${e.from}`;
      })
      .join('\n');
    return `Yeah — ${important.length} look important:\n${lines}\n\nTap /inbox to reply, or ask me anything else.`;
  }
};

module.exports = AIService;
