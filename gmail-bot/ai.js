const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

async function generateReply(from, subject, emailBody) {
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const prompt = `You are a professional email assistant. Generate a polite, concise, and helpful reply to this email.

From: ${from || 'Sender'}
Subject: ${subject || 'Subject'}
Email Content: ${emailBody}

Write ONLY the reply body text. Keep it professional and brief (3-5 sentences max). Do not include subject line or "To:" header.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text && text.trim()) return text.trim();
    } catch (err) {
      console.warn('⚠️ Gemini AI Generation note:', err.message);
    }
  }

  // Fallback Professional Smart Reply
  const senderName = from ? from.split('<')[0].replace(/"/g, '').trim() : 'Sender';
  return `Dear ${senderName},\n\nThank you for your email regarding "${subject || 'your message'}". I have received your email and will review it in detail shortly.\n\nBest regards,\nGmail AI Assistant`;
}

module.exports = { generateReply };
