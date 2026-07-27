const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Initialize Database & Services
require('./config/db');
require('./services/telegram.service');

const app = express();

const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const allowedOrigins = [frontendUrl, 'http://localhost:3000', 'http://localhost:5173'].filter(
  Boolean
);

app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / server-to-server / Vercel rewrites (no Origin)
      if (!origin || allowedOrigins.some((o) => origin === o || origin.endsWith('.vercel.app'))) {
        return cb(null, true);
      }
      return cb(null, true); // ponytail: keep permissive; tighten when frontend domain is stable
    },
    credentials: true
  })
);
app.use(express.json());

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/gmail', require('./routes/gmail.routes'));
app.use('/api/telegram', require('./routes/telegram.routes'));
app.use('/api/calendar', require('./routes/calendar.routes'));

app.use('/api/agent', require('./routes/agent'));
app.use('/api/pdf', require('./routes/pdf'));
app.use('/api/data', require('./routes/data'));

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Gmail AI & Telegram Assistant Backend is Running!'
  });
});

// Diagnostic — no secrets, shows what production is actually using
app.get('/api/health/config', (req, res) => {
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    process.env.GMAIL_REDIRECT_URI ||
    '(default localhost — BROKEN in production)';
  const hasGoogleId = Boolean(process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID);
  const hasGoogleSecret = Boolean(
    process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET
  );
  const db = require('./config/db');
  const dbHost = process.env.DB_HOST || 'localhost';
  const likelySqlite =
    !process.env.DB_HOST ||
    process.env.DB_HOST === 'localhost' ||
    process.env.DB_HOST === '127.0.0.1';

  res.json({
    ok: hasGoogleId && hasGoogleSecret && !String(redirectUri).includes('localhost'),
    google: {
      clientIdSet: hasGoogleId,
      clientSecretSet: hasGoogleSecret,
      redirectUri,
      redirectLooksLocal: String(redirectUri).includes('localhost')
    },
    frontendUrl: process.env.FRONTEND_URL || '(missing — defaults to localhost:3000)',
    frontendLooksLocal: !(process.env.FRONTEND_URL || '').includes('http') ||
      String(process.env.FRONTEND_URL || '').includes('localhost'),
    database: {
      host: dbHost,
      mode: db.getDbMode ? db.getDbMode() : 'unknown',
      name: process.env.DB_NAME || null,
      warning: likelySqlite
        ? 'DB_HOST is localhost/missing — Render will use ephemeral SQLite and WIPE users/tokens on every restart'
        : db.getDbMode && db.getDbMode() === 'sqlite'
          ? 'Remote DB_HOST set but still on SQLite — check DB_USER/PASSWORD/NAME and Render logs'
          : null
    },
    jwtSecretSet: Boolean(process.env.JWT_SECRET)
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`FRONTEND_URL=${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(
    `GOOGLE_REDIRECT_URI=${process.env.GOOGLE_REDIRECT_URI || process.env.GMAIL_REDIRECT_URI || 'localhost default'}`
  );
});
