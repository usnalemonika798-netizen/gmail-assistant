const mysql = require('mysql2');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

let activeDbMode = 'mysql';
let mysqlConn = null;
let sqliteDb = null;

// Proxy database object that routes queries to active engine
const dbProxy = {
  query: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    params = params || [];

    if (activeDbMode === 'mysql' && mysqlConn) {
      return mysqlConn.query(sql, params, callback);
    } else {
      return runSqliteQuery(sql, params, callback);
    }
  }
};

// Main initialization
function initDatabase() {
  mysqlConn = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'college_db',
    connectTimeout: 3000
  });

  mysqlConn.connect((err) => {
    if (err) {
      console.warn(`⚠️ MySQL unavailable (${err.code || err.message}).`);
      console.log('🔄 Switching to local SQLite database (college.db)...');
      useSqliteFallback();
    } else {
      console.log('✅ MySQL Connected successfully!');
      activeDbMode = 'mysql';
      setupTablesMysql();
    }
  });
}

function setupTablesMysql() {
  mysqlConn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100),
      email VARCHAR(100) UNIQUE,
      password VARCHAR(255),
      telegram_link_code VARCHAR(20),
      telegram_chat_id VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  mysqlConn.query(`
    CREATE TABLE IF NOT EXISTS students (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100),
      email VARCHAR(100),
      course VARCHAR(100),
      marks INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  mysqlConn.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100),
      price DECIMAL(10,2),
      quantity INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✅ MySQL Tables ready!');
}

function useSqliteFallback() {
  activeDbMode = 'sqlite';
  const dbPath = path.join(__dirname, 'college.db');
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ SQLite connection error:', err);
      return;
    }
    console.log(`✅ SQLite Database connected (${dbPath})!`);

    sqliteDb.serialize(() => {
      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          email TEXT UNIQUE,
          password TEXT,
          telegram_link_code TEXT,
          telegram_chat_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Migration for existing sqlite databases
      sqliteDb.run("ALTER TABLE users ADD COLUMN telegram_link_code TEXT", () => { });
      sqliteDb.run("ALTER TABLE users ADD COLUMN telegram_chat_id TEXT", () => { });

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

      // Seed sample data if empty
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

      console.log('✅ SQLite Tables & Sample Data ready!');
    });
  });
}

function runSqliteQuery(sql, params, callback) {
  let trimmedSql = sql.trim();

  // Convert SHOW TABLES
  if (/^SHOW\s+TABLES/i.test(trimmedSql)) {
    sqliteDb.all("SELECT name AS Tables_in_college_db FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], (err, rows) => {
      if (err) return callback(err);
      callback(null, rows);
    });
    return;
  }

  // Convert INSERT INTO table SET ?
  let setInsertMatch = trimmedSql.match(/^INSERT\s+INTO\s+(\w+)\s+SET\s+\?/i);
  if (setInsertMatch) {
    const tableName = setInsertMatch[1];
    const dataObj = params[0];
    const keys = Object.keys(dataObj);
    const values = Object.values(dataObj);
    const placeholders = keys.map(() => '?').join(', ');
    const newSql = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;

    sqliteDb.run(newSql, values, function (err) {
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

  // Convert UPDATE table SET ? WHERE id = ?
  let setUpdateMatch = trimmedSql.match(/^UPDATE\s+(\w+)\s+SET\s+\?\s+WHERE\s+(.+)$/i);
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

    sqliteDb.run(newSql, allParams, function (err) {
      if (err) return callback(err);
      callback(null, { affectedRows: this.changes });
    });
    return;
  }

  // SELECT queries
  if (/^SELECT/i.test(trimmedSql)) {
    sqliteDb.all(trimmedSql, params, (err, rows) => {
      if (err) return callback(err);
      callback(null, rows);
    });
    return;
  }

  // INSERT / UPDATE / DELETE queries standard
  sqliteDb.run(trimmedSql, params, function (err) {
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

module.exports = dbProxy;
