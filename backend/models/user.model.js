const db = require('../config/db');

// In-memory link codes — survives SQLite flake within the same Render process
// (Render free tier wipes disk on restart; JWT can outlive the users table)
const pendingTelegramLinks = new Map(); // CODE -> { userId, name, email, expiresAt }

function purgeExpiredLinks() {
  const now = Date.now();
  for (const [code, row] of pendingTelegramLinks.entries()) {
    if (row.expiresAt < now) pendingTelegramLinks.delete(code);
  }
}

const UserModel = {
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

  findByEmail: (email) => {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return reject(err);
        resolve(results[0] || null);
      });
    });
  },

  findById: (id) => {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM users WHERE id = ?', [id], (err, results) => {
        if (err) return reject(err);
        resolve(results[0] || null);
      });
    });
  },

  saveGoogleTokens: (userId, tokens) => {
    return new Promise((resolve, reject) => {
      const tokenStr = typeof tokens === 'string' ? tokens : JSON.stringify(tokens);
      db.query(
        'UPDATE users SET google_tokens = ? WHERE id = ?',
        [tokenStr, userId],
        (err, result) => {
          if (err) return reject(err);
          if (result && result.affectedRows === 0) {
            return reject(new Error('User not found. Sign in with Google again.'));
          }
          resolve(true);
        }
      );
    });
  },

  updateName: (userId, name) => {
    return new Promise((resolve, reject) => {
      if (!name) return resolve(false);
      db.query('UPDATE users SET name = ? WHERE id = ?', [name, userId], (err) => {
        if (err) return reject(err);
        resolve(true);
      });
    });
  },

  generateLinkCode: async (userId) => {
    purgeExpiredLinks();
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new Error(
        'Your session is stale (database restarted). Sign out, Sign in with Google again, then generate a new code.'
      );
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    await new Promise((resolve, reject) => {
      db.query(
        'UPDATE users SET telegram_link_code = ? WHERE id = ?',
        [code, userId],
        (err, result) => {
          if (err) return reject(err);
          if (result && result.affectedRows === 0) {
            return reject(
              new Error(
                'Could not save link code. Sign in with Google again, then retry.'
              )
            );
          }
          resolve(true);
        }
      );
    });

    pendingTelegramLinks.set(code, {
      userId: user.id,
      name: user.name,
      email: user.email,
      expiresAt: Date.now() + 30 * 60 * 1000 // 30 min
    });

    return code;
  },

  unlinkTelegram: (userId) => {
    return new Promise((resolve, reject) => {
      db.query(
        'UPDATE users SET telegram_chat_id = NULL, telegram_link_code = NULL WHERE id = ?',
        [userId],
        (err) => {
          if (err) return reject(err);
          resolve(true);
        }
      );
    });
  },

  linkTelegramChat: (code, chatId) => {
    return new Promise(async (resolve, reject) => {
      try {
        purgeExpiredLinks();
        const normalized = String(code || '').trim().toUpperCase();
        const chat = String(chatId);

        if (!normalized) {
          return reject(new Error('Invalid or empty Link Code'));
        }

        const finishLink = (userId, name, email) => {
          // Clear any stale assignment of this chat ID from other users first
          db.query(
            'UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = ? AND id != ?',
            [chat, userId],
            () => {
              db.query(
                'UPDATE users SET telegram_chat_id = ?, telegram_link_code = NULL WHERE id = ?',
                [chat, userId],
                (err, result) => {
                  if (err) return reject(err);
                  resolve({ id: userId, name, email, alreadyLinked: false });
                }
              );
            }
          );
        };

        // 1) In-memory pending check (fast path)
        const pending = pendingTelegramLinks.get(normalized);
        if (pending) {
          pendingTelegramLinks.delete(normalized);
          return finishLink(pending.userId, pending.name, pending.email);
        }

        // 2) Database check
        db.query(
          'SELECT * FROM users WHERE UPPER(telegram_link_code) = ?',
          [normalized],
          async (err, results) => {
            if (err) return reject(err);
            if (results && results.length > 0) {
              const user = results[0];
              return finishLink(user.id, user.name, user.email);
            }

            // 3) If code already used or invalid, check if this chat is already linked
            const already = await UserModel.findByTelegramChatId(chat);
            if (already) {
              return resolve({ ...already, alreadyLinked: true });
            }

            reject(
              new Error(
                'Invalid or expired Link Code. On the website: Click "Link Telegram" to generate a fresh code, then try again.'
              )
            );
          }
        );
      } catch (e) {
        reject(e);
      }
    });
  },

  findByTelegramChatId: (chatId) => {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM users WHERE telegram_chat_id = ?', [String(chatId)], (err, results) => {
        if (err) return reject(err);
        resolve(results[0] || null);
      });
    });
  },

  // Users with Telegram linked + Google tokens (for push alerts)
  findTelegramLinkedWithGoogle: () => {
    return new Promise((resolve, reject) => {
      db.query(
        `SELECT * FROM users
         WHERE telegram_chat_id IS NOT NULL
           AND telegram_chat_id != ''
           AND google_tokens IS NOT NULL
           AND google_tokens != ''`,
        [],
        (err, results) => {
          if (err) return reject(err);
          resolve(results || []);
        }
      );
    });
  }
};

module.exports = UserModel;
