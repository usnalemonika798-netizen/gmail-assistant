const db = require('../config/db');

const UserModel = {
  // Create a new user
  createUser: (userData) => {
    return new Promise((resolve, reject) => {
      const { name, email, password } = userData;
      db.query(
        'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
        [name, email, password],
        (err, result) => {
          if (err) return reject(err);
          resolve({ id: result.insertId, name, email });
        }
      );
    });
  },

  // Find user by email
  findByEmail: (email) => {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return reject(err);
        resolve(results[0] || null);
      });
    });
  },

  // Find user by ID
  findById: (id) => {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM users WHERE id = ?', [id], (err, results) => {
        if (err) return reject(err);
        resolve(results[0] || null);
      });
    });
  },

  // Save Google OAuth tokens
  saveGoogleTokens: (userId, tokens) => {
    return new Promise((resolve, reject) => {
      const tokenStr = typeof tokens === 'string' ? tokens : JSON.stringify(tokens);
      db.query('UPDATE users SET google_tokens = ? WHERE id = ?', [tokenStr, userId], (err) => {
        if (err) return reject(err);
        resolve(true);
      });
    });
  },

  // Generate Telegram Link Code
  generateLinkCode: (userId) => {
    return new Promise((resolve, reject) => {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      db.query('UPDATE users SET telegram_link_code = ? WHERE id = ?', [code, userId], (err) => {
        if (err) return reject(err);
        resolve(code);
      });
    });
  },

  // Link Telegram Chat ID using Link Code
  linkTelegramChat: (code, chatId) => {
    return new Promise((resolve, reject) => {
      db.query(
        'SELECT * FROM users WHERE UPPER(telegram_link_code) = ?',
        [code.toUpperCase()],
        (err, results) => {
          if (err || !results || results.length === 0) {
            return reject(new Error('Invalid or expired Link Code'));
          }

          const user = results[0];
          db.query(
            'UPDATE users SET telegram_chat_id = ?, telegram_link_code = NULL WHERE id = ?',
            [String(chatId), user.id],
            (err2) => {
              if (err2) return reject(err2);
              resolve(user);
            }
          );
        }
      );
    });
  },

  // Find user by Telegram Chat ID
  findByTelegramChatId: (chatId) => {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM users WHERE telegram_chat_id = ?', [String(chatId)], (err, results) => {
        if (err) return reject(err);
        resolve(results[0] || null);
      });
    });
  }
};

module.exports = UserModel;
