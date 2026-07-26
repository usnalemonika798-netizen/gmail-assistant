const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// SQL Tool functions
const tools = {
  list_tables: () => {
    return new Promise((resolve, reject) => {
      db.query('SHOW TABLES', (err, results) => {
        if (err) reject(err);
        else resolve(results.map(r => Object.values(r)[0]));
      });
    });
  },

  read_records: ({ table }) => {
    return new Promise((resolve, reject) => {
      const allowed = ['students', 'products', 'users'];
      if (!allowed.includes(table)) return reject(new Error('Table not allowed'));
      db.query(`SELECT * FROM ${table} LIMIT 50`, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  },

  create_record: ({ table, data }) => {
    return new Promise((resolve, reject) => {
      const allowed = ['students', 'products'];
      if (!allowed.includes(table)) return reject(new Error('Table not allowed'));
      db.query(`INSERT INTO ${table} SET ?`, data, (err, result) => {
        if (err) reject(err);
        else resolve({ inserted_id: result.insertId, message: 'Record created!' });
      });
    });
  },

  update_record: ({ table, id, data }) => {
    return new Promise((resolve, reject) => {
      const allowed = ['students', 'products'];
      if (!allowed.includes(table)) return reject(new Error('Table not allowed'));
      db.query(`UPDATE ${table} SET ? WHERE id = ?`, [data, id], (err) => {
        if (err) reject(err);
        else resolve({ message: `Record ${id} updated!` });
      });
    });
  },

  delete_record: ({ table, id }) => {
    return new Promise((resolve, reject) => {
      const allowed = ['students', 'products'];
      if (!allowed.includes(table)) return reject(new Error('Table not allowed'));
      db.query(`DELETE FROM ${table} WHERE id = ?`, [id], (err) => {
        if (err) reject(err);
        else resolve({ message: `Record ${id} deleted!` });
      });
    });
  }
};

// Gemini tool declarations
const toolDeclarations = [
  {
    name: 'list_tables',
    description: 'List all available database tables',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'read_records',
    description: 'Read all records from a table',
    parameters: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name: students or products' }
      },
      required: ['table']
    }
  },
  {
    name: 'create_record',
    description: 'Insert a new record into a table',
    parameters: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name: students or products' },
        data: { type: 'object', description: 'Key-value pairs for the new record' }
      },
      required: ['table', 'data']
    }
  },
  {
    name: 'update_record',
    description: 'Update a record by id',
    parameters: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        id: { type: 'number' },
        data: { type: 'object' }
      },
      required: ['table', 'id', 'data']
    }
  },
  {
    name: 'delete_record',
    description: 'Delete a record by id',
    parameters: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        id: { type: 'number' }
      },
      required: ['table', 'id']
    }
  }
];

// POST /api/agent/chat
router.post('/chat', authMiddleware, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ message: 'Message required' });

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      tools: [{ functionDeclarations: toolDeclarations }]
    });

    const chat = model.startChat();
    let result = await chat.sendMessage(message);
    let response = result.response;

    const steps = [];

    // Agentic loop - keep calling tools until AI gives final text
    while (response.functionCalls() && response.functionCalls().length > 0) {
      const calls = response.functionCalls();
      const toolResults = [];

      for (const call of calls) {
        const { name, args } = call;
        steps.push({ tool: name, args });

        let toolResult;
        try {
          toolResult = await tools[name](args);
        } catch (e) {
          toolResult = { error: e.message };
        }

        steps[steps.length - 1].result = toolResult;
        toolResults.push({ functionResponse: { name, response: { result: toolResult } } });
      }

      result = await chat.sendMessage(toolResults);
      response = result.response;
    }

    const finalText = response.text();
    res.json({ reply: finalText, steps });

  } catch (err) {
    console.error('Agent error:', err.message);
    res.status(500).json({ message: 'Agent error: ' + err.message });
  }
});

module.exports = router;
