const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateReply(from, subject, emailBody) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are a professional email assistant. Generate a polite, concise, and helpful reply to this email.

From: ${from}
Subject: ${subject}
Email Content: ${emailBody}

Write ONLY the reply body text. Keep it professional and brief (3-5 sentences max). Do not include subject line or "To:" header.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

module.exports = { generateReply };
