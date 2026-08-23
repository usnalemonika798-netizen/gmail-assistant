# PROJECT GUIDE - AI-Powered Gmail Assistant and SQL Agent
## Complete College Review Preparation Guide

> IMPORTANT FOR STUDENT: This guide covers EVERYTHING you need to know before your review.
> Read sections 17-21 tonight. Do NOT skip the Cheat Sheet at the end.

---

## 1. PROJECT OVERVIEW

### Project Title
AI-Powered Gmail Assistant and SQL Agent
(Full title from synopsis: AI-Powered MERN SQL Agent Gmail Bot)

### Main Purpose
This project is an AI-powered web application that:
1. Lets users read their Gmail inbox and get AI-generated email replies using Google Gemini AI
2. Provides a Telegram bot that pushes important email alerts and lets users reply via voice messages
3. Has an AI SQL Agent that can do database operations using plain English sentences
4. Can schedule Google Meet meetings automatically from email content
5. Exports a PDF activity report of email interactions

### Problem It Solves
- People miss important emails because their inbox is too crowded
- Writing professional replies takes time
- Checking email constantly is distracting
- Scheduling meetings from email conversations requires manual work

### Why This Project Is Useful
- Saves time by auto-generating email replies with AI
- Pushes important email alerts to your phone via Telegram
- You can reply to emails from Telegram using just a voice message
- The AI Agent lets non-technical users manage a database using plain English

### Target Users
- College students and professionals who use Gmail
- Anyone who wants AI to manage their email workflow
- Developers wanting to see how AI agents work with databases

### Main Features
1. Google OAuth Login - Sign in with your Google account
2. Gmail Inbox Viewer - See unread emails with AI urgency tags
3. AI Auto-Reply Generator - Gemini AI writes email replies in 3 tones (Professional / Friendly / Brief)
4. Email Triage - Auto-labels Gmail emails (Urgent / Job / Meeting / College / Noise / Other)
5. Morning Briefing - AI summary of your inbox + upcoming calendar events
6. Google Meet Scheduler - Schedule meetings directly from an email
7. Telegram Bot Integration - Get email alerts on Telegram, reply via text or voice
8. AI SQL Agent - Chat interface to manage database tables using natural language
9. PDF Report Export - Download a formatted activity report
10. Hybrid Database - Works with both MySQL and SQLite (auto-fallback)

---

## 2. HOW THE PROJECT WORKS

### Complete Flow (Simple Explanation)

USER (Browser)
    Opens http://localhost:3000 (or Vercel URL)
FRONTEND (React + Vite)
    Sends API requests with JWT token in Authorization header
BACKEND (Node.js + Express) running on port 5000
    Validates JWT -> Calls appropriate service
GOOGLE APIs (Gmail, Calendar, OAuth2)  <->  GEMINI AI API
    Returns data
DATABASE (SQLite locally / MySQL in production)
    Stores/retrieves user data, tokens
RESPONSE
    Backend sends JSON response
FRONTEND displays result to user
    (Separately)
TELEGRAM BOT (runs inside backend server)
    Polls Gmail every 90 seconds
    Sends push alerts to users Telegram if important mail found
USER can reply via Telegram (text or voice note)

### External Services Used

| Service              | What It Does                                          |
|----------------------|-------------------------------------------------------|
| Google OAuth 2.0     | Lets users log in with their Google account securely  |
| Gmail API            | Reads emails, applies labels, sends replies           |
| Google Calendar API  | Creates meeting events with Google Meet links         |
| Google Gemini AI     | Generates email replies, briefings, meeting extraction|
| Telegram Bot API     | Sends push notifications, receives user commands      |
| Vercel               | Hosts the frontend (free deployment)                  |
| Render               | Hosts the backend server (free deployment)            |

---

## 3. TECHNOLOGIES USED

| Technology            | Where Used         | Why Used               | Simple Explanation                              |
|-----------------------|--------------------|------------------------|-------------------------------------------------|
| React 18              | Frontend           | UI library             | Builds the web interface with reusable components|
| Vite                  | Frontend           | Build tool             | Fast development server for React apps          |
| React Router DOM v6   | Frontend           | Navigation             | Handles page navigation (Login -> Gmail -> Agent)|
| Axios                 | Frontend           | HTTP requests          | Sends API requests to the backend               |
| Node.js               | Backend            | Runtime                | Runs JavaScript on the server                   |
| Express.js            | Backend            | Web framework          | Creates API endpoints (routes)                  |
| JWT (jsonwebtoken)    | Backend + Frontend | Authentication         | Keeps users logged in securely                  |
| bcryptjs              | Backend            | Security               | Hashes passwords before saving to database      |
| googleapis            | Backend            | Gmail + Calendar       | Official Google library to access Gmail/Calendar|
| @google/generative-ai | Backend            | AI features            | Official Gemini AI library                      |
| node-telegram-bot-api | Backend            | Telegram bot           | Sends/receives Telegram messages                |
| PDFKit                | Backend            | PDF generation         | Creates PDF reports programmatically            |
| MySQL2                | Backend            | Database (production)  | Connects to MySQL database                      |
| SQLite3               | Backend            | Database (local)       | File-based database for local development       |
| dotenv                | Backend            | Configuration          | Loads secret keys from .env file                |
| CORS                  | Backend            | Security               | Allows frontend to call backend API             |
| Nodemon               | Backend            | Development tool       | Auto-restarts server on code changes            |
| Vercel                | Deployment         | Frontend hosting       | Free hosting for React apps                     |
| Render                | Deployment         | Backend hosting        | Free hosting for Node.js servers                |
| Git/GitHub            | Version control    | Code management        | Tracks code changes and allows deployment       |

