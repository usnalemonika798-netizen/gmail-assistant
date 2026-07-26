const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user.model');
const GmailService = require('../services/gmail.service');
require('dotenv').config();

const AuthController = {
  // Register User
  register: async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields required' });
    }

    try {
      const existing = await UserModel.findByEmail(email);
      if (existing) {
        return res.status(400).json({ message: 'Email already exists' });
      }

      const hashed = await bcrypt.hash(password, 10);
      const user = await UserModel.createUser({ name, email, password: hashed });

      res.status(201).json({ message: 'Registered successfully!', user });
    } catch (err) {
      res.status(500).json({ message: 'Registration failed: ' + err.message });
    }
  },

  // Login User
  login: async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'All fields required' });
    }

    try {
      const user = await UserModel.findByEmail(email);
      if (!user) {
        return res.status(400).json({ message: 'User not found' });
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(400).json({ message: 'Wrong password' });
      }

      const token = jwt.sign(
        { id: user.id, name: user.name, email: user.email },
        process.env.JWT_SECRET || 'mysecretkey123',
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email }
      });
    } catch (err) {
      res.status(500).json({ message: 'Login failed: ' + err.message });
    }
  },

  // GET /api/auth/me - Get Current Authenticated User Profile
  getMe: async (req, res) => {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          telegramLinked: Boolean(user.telegram_chat_id),
          googleConnected: Boolean(user.google_tokens)
        }
      });
    } catch (err) {
      res.status(500).json({ message: 'Error fetching profile: ' + err.message });
    }
  },

  // GET /api/auth/google - Initiate Google OAuth 2.0 Flow (Redirect)
  getGoogleAuthUrl: (req, res) => {
    const authUrl = GmailService.getGoogleAuthUrl();
    res.redirect(authUrl);
  },

  // GET /api/auth/google/login-url - Get Google OAuth 2.0 Auth URL as JSON
  getGoogleLoginUrl: (req, res) => {
    try {
      const url = GmailService.getGoogleAuthUrl();
      res.json({ success: true, url });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // GET /api/auth/google/callback - Exchange Code, Store Tokens & Issue JWT
  googleCallback: async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('Authorization code parameter missing');

    try {
      // 1. Exchange code for access & refresh tokens and fetch Google profile
      const { tokens, profile } = await GmailService.exchangeCodeAndFetchProfile(code);

      // 2. Find existing user or create user profile in Database
      let user = await UserModel.findByEmail(profile.email);
      if (!user) {
        const dummyPassword = await bcrypt.hash(Math.random().toString(36), 10);
        user = await UserModel.createUser({
          name: profile.name || 'Google User',
          email: profile.email,
          password: dummyPassword
        });
      }

      // 3. Store access_token and refresh_token in Database
      await UserModel.saveGoogleTokens(user.id, tokens);

      // 4. Issue JWT Session Token
      const token = jwt.sign(
        { id: user.id, name: user.name, email: user.email },
        process.env.JWT_SECRET || 'mysecretkey123',
        { expiresIn: '7d' }
      );

      // 5. Redirect to frontend dashboard with JWT token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/gmail?token=${token}&auth=success`);
    } catch (err) {
      console.error('Google Callback Error:', err.message);
      res.status(500).send('Google OAuth Error: ' + err.message);
    }
  }
};

module.exports = AuthController;
