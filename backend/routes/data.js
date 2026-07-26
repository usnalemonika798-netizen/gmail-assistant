const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// GET /api/data/students
router.get('/students', authMiddleware, (req, res) => {
  db.query('SELECT * FROM students', (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json(results);
  });
});

// GET /api/data/products
router.get('/products', authMiddleware, (req, res) => {
  db.query('SELECT * FROM products', (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json(results);
  });
});

module.exports = router;
