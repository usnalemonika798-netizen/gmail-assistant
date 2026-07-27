let mysql = null;
try {
  mysql = require('mysql2');
} catch (e) {
  console.warn('⚠️ mysql2 module not loaded:', e.message);
}

let sqlite3 = null;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  console.warn('⚠️ sqlite3 module not loaded:', e.message);
}

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

let activeMode = 'pending';
let mysqlPool = null;
let sqliteDb = null;

function isLocalHost(host) {
  return !host || host === 'localhost' || host === '127.0.0.1';
}

function buildMysqlConfig() {
  const host = process.env.DB_HOST || 'localhost';
  const config = {
    host,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'college_db',
    // db4free / free hosts are slow
    connectTimeout: process.env.DB_CONNECT_TIMEOUT
      ? Number(process.env.DB_CONNECT_TIMEOUT)
      : isLocalHost(host)
        ? 5000
        : 20000,
    waitForConnections: true,
    connectionLimit: 5
  };

  // Some free MySQL hosts want SSL; Workbench "Use SSL" ≈ this
  if (process.env.DB_SSL === '1' || process.env.DB_SSL === 'true') {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

// Initialize Database Connection
function initDatabase() {
  const onRender = Boolean(process.env.RENDER);
  const host = process.env.DB_HOST || 'localhost';
  const forceSqlite = process.env.FORCE_SQLITE === '1';
  const wantRemoteMysql = mysql && !forceSqlite && !isLocalHost(host);
  const wantLocalMysql = mysql && !forceSqlite && !onRender && isLocalHost(host);

  if (!mysql || forceSqlite || (onRender && isLocalHost(host))) {
    if (onRender && isLocalHost(host)) {
      console.warn(
        'Render + DB_HOST=localhost → SQLite (data resets). Set DB_HOST=db4free.net (or other remote MySQL).'
      );
    }
    useSqliteFallback();
    return;
  }

  if (!wantRemoteMysql && !wantLocalMysql) {
    useSqliteFallback();
    return;
  }

  const connectionConfig = buildMysqlConfig();

  try {
    activeMode = 'pending';
    const conn = mysql.createConnection(connectionConfig);

    conn.connect((err) => {
      if (err) {
        console.warn(`MySQL connection failed: ${err.message}`);
        console.log('Falling back to SQLite (college.db)...');
        useSqliteFallback();
      } else {
        console.log(`MySQL connected → ${connectionConfig.host}/${connectionConfig.database}`);
        activeMode = 'mysql';
        conn.end();
        mysqlPool = mysql.createPool(connectionConfig);
        setupTablesMysql();
      }
    });
  } catch (err) {
    console.warn(`MySQL init error: ${err.message}`);
    useSqliteFallback();
  }
}

function setupTablesMysql() {
  mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100),
      email VARCHAR(100) UNIQUE,
      password VARCHAR(255),
      google_tokens TEXT,
      telegram_chat_id VARCHAR(50),
      telegram_link_code VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100),
      email VARCHAR(100),
      course VARCHAR(100),
      marks INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100),
      price DECIMAL(10,2),
      quantity INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function useSqliteFallback() {
  activeMode = 'sqlite';
  if (!sqlite3) {
    console.warn('⚠️ SQLite module is unavailable in this environment.');
    return;
  }
  const dbPath = path.join(__dirname, '../college.db');
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ SQLite error:', err.message);
      return;
    }
    console.log(`✅ SQLite Database connected (${dbPath})`);

    sqliteDb.serialize(() => {
      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          email TEXT UNIQUE,
          password TEXT,
          google_tokens TEXT,
          telegram_chat_id TEXT,
          telegram_link_code TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Migrations for existing databases
      sqliteDb.run("ALTER TABLE users ADD COLUMN google_tokens TEXT", () => {});
      sqliteDb.run("ALTER TABLE users ADD COLUMN telegram_chat_id TEXT", () => {});
      sqliteDb.run("ALTER TABLE users ADD COLUMN telegram_link_code TEXT", () => {});

      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS students (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          email TEXT,
          course TEXT,
          marks INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          price REAL,
          quantity INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Seed sample data
      sqliteDb.get("SELECT COUNT(*) AS count FROM students", (err, row) => {
        if (!err && row && row.count === 0) {
          sqliteDb.run("INSERT INTO students (name, email, course, marks) VALUES ('Rahul Sharma', 'rahul@gmail.com', 'Computer Science', 88)");
          sqliteDb.run("INSERT INTO students (name, email, course, marks) VALUES ('Priya Patel', 'priya@gmail.com', 'Information Technology', 92)");
          sqliteDb.run("INSERT INTO students (name, email, course, marks) VALUES ('Amit Kumar', 'amit@gmail.com', 'Electronics', 79)");
        }
      });

      sqliteDb.get("SELECT COUNT(*) AS count FROM products", (err, row) => {
        if (!err && row && row.count === 0) {
          sqliteDb.run("INSERT INTO products (name, price, quantity) VALUES ('Laptop', 55000.00, 10)");
          sqliteDb.run("INSERT INTO products (name, price, quantity) VALUES ('Wireless Mouse', 850.00, 50)");
          sqliteDb.run("INSERT INTO products (name, price, quantity) VALUES ('Mechanical Keyboard', 2500.00, 25)");
        }
      });
    });
  });
}

// Unified query adapter supporting MySQL & SQLite
function query(sql, params = [], callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  if (activeMode === 'mysql' && mysqlPool) {
    return mysqlPool.query(sql, params, callback);
  }
  if (activeMode === 'pending') {
    // MySQL still connecting — retry shortly instead of writing to the wrong DB
    return setTimeout(() => query(sql, params, callback), 200);
  }
  return runSqlite(sql, params, callback);
}

function runSqlite(sql, params, callback) {
  if (!sqliteDb) {
    console.warn('⚠️ No database handle available for query.');
    return callback(null, []);
  }
  const trimmed = sql.trim();

  // SHOW TABLES
  if (/^SHOW\s+TABLES/i.test(trimmed)) {
    sqliteDb.all("SELECT name AS Tables_in_college_db FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], (err, rows) => {
      if (err) return callback(err);
      callback(null, rows);
    });
    return;
  }

  // INSERT INTO table SET ?
  const setInsertMatch = trimmed.match(/^INSERT\s+INTO\s+(\w+)\s+SET\s+\?/i);
  if (setInsertMatch) {
    const tableName = setInsertMatch[1];
    const dataObj = params[0];
    const keys = Object.keys(dataObj);
    const values = Object.values(dataObj);
    const placeholders = keys.map(() => '?').join(', ');
    const newSql = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;

    sqliteDb.run(newSql, values, function(err) {
      if (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          err.code = 'ER_DUP_ENTRY';
        }
        return callback(err);
      }
      callback(null, { insertId: this.lastID, affectedRows: this.changes });
    });
    return;
  }

  // UPDATE table SET ? WHERE id = ?
  const setUpdateMatch = trimmed.match(/^UPDATE\s+(\w+)\s+SET\s+\?\s+WHERE\s+(.+)$/i);
  if (setUpdateMatch) {
    const tableName = setUpdateMatch[1];
    const whereClause = setUpdateMatch[2];
    const dataObj = params[0];
    const remainingParams = params.slice(1);
    const keys = Object.keys(dataObj);
    const values = Object.values(dataObj);
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const newSql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
    const allParams = [...values, ...remainingParams];

    sqliteDb.run(newSql, allParams, function(err) {
      if (err) return callback(err);
      callback(null, { affectedRows: this.changes });
    });
    return;
  }

  // SELECT
  if (/^SELECT/i.test(trimmed)) {
    sqliteDb.all(trimmed, params, (err, rows) => {
      if (err) return callback(err);
      callback(null, rows);
    });
    return;
  }

  // INSERT / UPDATE / DELETE standard
  sqliteDb.run(trimmed, params, function(err) {
    if (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        err.code = 'ER_DUP_ENTRY';
      }
      return callback(err);
    }
    callback(null, { insertId: this.lastID, affectedRows: this.changes });
  });
}

initDatabase();

function getDbMode() {
  return activeMode; // mysql | sqlite | pending
}

module.exports = { query, getDbMode };
