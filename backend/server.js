const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Unified Express App Server

// Initialize Database & Services
require('./config/db');
require('./services/telegram.service');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/gmail', require('./routes/gmail.routes'));
app.use('/api/telegram', require('./routes/telegram.routes'));

// Legacy compatibility routes
app.use('/api/agent', require('./routes/agent'));
app.use('/api/pdf', require('./routes/pdf'));
app.use('/api/data', require('./routes/data'));

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: '🚀 Gmail AI & Telegram Assistant Backend is Running!'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
