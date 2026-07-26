/**
 * Standalone DB module for gmail-bot.
 * Uses its own dotenv / mysql2 / sqlite3 from gmail-bot/node_modules.
 * Does NOT import anything from ../backend to avoid cross-package dependency issues on Render.
 */

require('dotenv').config();
const path = require('path');

let mysql = null;
try {
  mysql = require('mysql2');
} catch (e) {
  console.warn('⚠️ mysql2 not available in gmail-bot:', e.message);
}

let sqlite3 = null;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  console.warn('⚠️ sqlite3 not available in gmail-bot:', e.message);
}

let activeMode = 'none';
let mysqlPool = null;
let sqliteDb = null;

function init() {
  if (mysql) {
    const cfg = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'college_db',
      connectTimeout: 3000
    };
    try {
      const conn = mysql.createConnection(cfg);
      conn.connect((err) => {
        if (err) {
          console.warn('⚠️ gmail-bot MySQL connect failed, falling back to SQLite:', err.message);
          useSqlite();
        } else {
          console.log('✅ gmail-bot connected to MySQL');
          activeMode = 'mysql';
          conn.end();
          mysqlPool = mysql.createPool(cfg);
          ensureUserTable();
        }
      });
    } catch (e) {
      console.warn('⚠️ gmail-bot MySQL init error:', e.message);
      useSqlite();
    }
  } else if (sqlite3) {
    useSqlite();
  } else {
    console.warn('⚠️ gmail-bot: No DB driver available. DB queries will be no-ops.');
  }
}

function useSqlite() {
  if (!sqlite3) {
    console.warn('⚠️ gmail-bot: sqlite3 not available, running without DB.');
    activeMode = 'none';
    return;
  }
  const dbPath = path.join(__dirname, 'bot.db');
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ gmail-bot SQLite error:', err.message);
      return;
    }
    console.log(`✅ gmail-bot connected to SQLite (${dbPath})`);
    activeMode = 'sqlite';
    ensureUserTable();
  });
}

function ensureUserTable() {
  const createSql = activeMode === 'mysql'
    ? `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100), email VARCHAR(100) UNIQUE,
        password VARCHAR(255), google_tokens TEXT,
        telegram_chat_id VARCHAR(50), telegram_link_code VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`
    : `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, email TEXT UNIQUE,
        password TEXT, google_tokens TEXT,
        telegram_chat_id TEXT, telegram_link_code TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
       )`;

  if (activeMode === 'mysql' && mysqlPool) {
    mysqlPool.query(createSql);
  } else if (activeMode === 'sqlite' && sqliteDb) {
    sqliteDb.run(createSql);
  }
}

function query(sql, params = [], callback) {
  if (typeof params === 'function') { callback = params; params = []; }

  if (activeMode === 'none') {
    return typeof callback === 'function' ? callback(null, []) : undefined;
  }

  if (activeMode === 'mysql' && mysqlPool) {
    return mysqlPool.query(sql, params, callback);
  }

  // SQLite fallback
  if (!sqliteDb) return typeof callback === 'function' ? callback(null, []) : undefined;
  const trimmed = sql.trim();

  // INSERT INTO table SET ? → convert object syntax
  const setInsertMatch = trimmed.match(/^INSERT\s+INTO\s+(\w+)\s+SET\s+\?/i);
  if (setInsertMatch) {
    const tableName = setInsertMatch[1];
    const dataObj = params[0];
    const keys = Object.keys(dataObj);
    const vals = Object.values(dataObj);
    const ph = keys.map(() => '?').join(', ');
    const newSql = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${ph})`;
    return sqliteDb.run(newSql, vals, function(err) {
      if (err && err.message && err.message.includes('UNIQUE constraint')) err.code = 'ER_DUP_ENTRY';
      callback(err, { insertId: this && this.lastID, affectedRows: this && this.changes });
    });
  }

  // UPDATE table SET ? WHERE …
  const setUpdateMatch = trimmed.match(/^UPDATE\s+(\w+)\s+SET\s+\?\s+WHERE\s+(.+)$/i);
  if (setUpdateMatch) {
    const tableName = setUpdateMatch[1];
    const whereClause = setUpdateMatch[2];
    const dataObj = params[0];
    const rest = params.slice(1);
    const keys = Object.keys(dataObj);
    const vals = Object.values(dataObj);
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const newSql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
    return sqliteDb.run(newSql, [...vals, ...rest], function(err) {
      callback(err, { affectedRows: this && this.changes });
    });
  }

  if (/^SELECT/i.test(trimmed)) {
    return sqliteDb.all(trimmed, params, (err, rows) => callback(err, rows || []));
  }

  return sqliteDb.run(trimmed, params, function(err) {
    if (err && err.message && err.message.includes('UNIQUE constraint')) err.code = 'ER_DUP_ENTRY';
    callback(err, { insertId: this && this.lastID, affectedRows: this && this.changes });
  });
}

init();
module.exports = { query };
