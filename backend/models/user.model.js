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

  linkTelegramChat: (code, chatId) => {
    return new Promise(async (resolve, reject) => {
      try {
        purgeExpiredLinks();
        const normalized = String(code || '').trim().toUpperCase();
        if (!normalized) {
          return reject(new Error('Invalid or expired Link Code'));
        }

        // 1) Fast path: in-memory (same backend process that generated the code)
        const pending = pendingTelegramLinks.get(normalized);
        if (pending) {
          pendingTelegramLinks.delete(normalized);
          db.query(
            'UPDATE users SET telegram_chat_id = ?, telegram_link_code = NULL WHERE id = ?',
            [String(chatId), pending.userId],
            (err, result) => {
              if (err) return reject(err);
              if (result && result.affectedRows === 0) {
                return reject(
                  new Error(
                    'User disappeared after DB restart. Sign in on the website again, generate a NEW code, then /connect within a few minutes.'
                  )
                );
              }
              resolve({ id: pending.userId, name: pending.name, email: pending.email });
            }
          );
          return;
        }

        // 2) DB path
        db.query(
          'SELECT * FROM users WHERE UPPER(telegram_link_code) = ?',
          [normalized],
          (err, results) => {
            if (err || !results || results.length === 0) {
              return reject(
                new Error(
                  'Invalid or expired Link Code. On the website: Sign in with Google → Link Telegram → use the NEW code immediately'
                )
              );
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
