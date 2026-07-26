const express = require('express');
const AuthController = require('../controllers/auth.controller');

const router = express.Router();

const authMiddleware = require('../middleware/auth');

// User Registration & Login
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/me', authMiddleware, AuthController.getMe);

// Google OAuth 2.0 Flow
router.get('/google', AuthController.getGoogleAuthUrl);
router.get('/google/url', AuthController.getGoogleAuthUrl);
router.get('/google/login-url', AuthController.getGoogleLoginUrl);
router.get('/google/connect-url', AuthController.getGoogleLoginUrl);
router.get('/google/callback', AuthController.googleCallback);

module.exports = router;
