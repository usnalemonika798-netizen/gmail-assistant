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
  }
};

module.exports = AIService;
