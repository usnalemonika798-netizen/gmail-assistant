# 🤖 AI SQL Agent + Gmail Auto-Reply Bot
### College Project — MERN Stack + Gemini AI + Telegram

---

## 📁 Project Structure

```
Gmail Ai/
├── backend/        → Node.js + Express + MySQL API
├── frontend/       → React + Vite UI
└── gmail-bot/      → Telegram Bot + Gmail AI
```

---

## ⚙️ SETUP GUIDE

### Step 1 — MySQL Database
1. Open MySQL and run:
```sql
CREATE DATABASE college_db;
```

### Step 2 — Backend `.env`
Edit `backend/.env`:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=college_db
JWT_SECRET=mysecretkey123
GEMINI_API_KEY=your_gemini_api_key
```

### Step 3 — Gmail Bot `.env`
Edit `gmail-bot/.env`:
```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
GEMINI_API_KEY=your_gemini_api_key
GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_client_secret
GMAIL_REDIRECT_URI=http://localhost
```

---

## 🚀 Run the Project

Open **3 terminals**:

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 3 — Gmail Bot:**
```bash
cd gmail-bot
node bot.js
```

Then open: **http://localhost:3000**

---

## 🔑 Get API Keys

| Key | Where to get |
|-----|-------------|
| Gemini API | https://aistudio.google.com/app/apikey |
| Telegram Bot Token | Message @BotFather on Telegram → /newbot |
| Gmail API | https://console.cloud.google.com → APIs → Gmail API |

---

## 🤖 How the AI Agent works

1. You type: *"Add a student named Alice, course CS, marks 90"*
2. Gemini AI understands the intent
3. AI calls the `create_record` tool automatically
4. MySQL executes the INSERT query
5. AI responds with confirmation

---

## 📱 Telegram Bot Commands

| Command | Action |
|---------|--------|
| `/start` | Welcome message |
| `/auth` | Connect Gmail account |
| `/code XXX` | Paste OAuth code |
| `/check` | Check unread emails |
