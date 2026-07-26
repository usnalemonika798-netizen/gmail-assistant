const express = require('express');
const AuthController = require('../controllers/auth.controller');

const router = express.Router();

// User Registration & Login
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);

// Google OAuth 2.0 Flow
router.get('/google', AuthController.getGoogleAuthUrl);
router.get('/google/url', AuthController.getGoogleAuthUrl);
router.get('/google/callback', AuthController.googleCallback);

module.exports = router;
