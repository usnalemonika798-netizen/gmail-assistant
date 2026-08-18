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

async function fallbackAgent(message) {
  const m = String(message || '').toLowerCase();
  const steps = [];
  let table = m.includes('product') ? 'products' : 'students';
  if (m.includes('table')) {
    const result = await tools.list_tables();
    steps.push({ tool: 'list_tables', args: {}, result });
    return { reply: `Available tables: ${result.join(', ')}`, steps };
  }
  if (m.includes('add') || m.includes('insert') || m.includes('create')) {
    if (table === 'products') {
      const name = ((message.match(/named\s+([^,\n]+)/i) || [])[1] || 'New Product').trim();
      const price = Number((message.match(/price\s+([\d.]+)/i) || [])[1] || 0);
      const quantity = Number((message.match(/quantity\s+(\d+)/i) || [])[1] || 1);
      const data = { name, price, quantity };
      const result = await tools.create_record({ table, data });
      steps.push({ tool: 'create_record', args: { table, data }, result });
      return { reply: `Added product ${name}. ${result.message || ''}`, steps };
    }
    const name = ((message.match(/named\s+([^,\n]+)/i) || [])[1] || 'New Student').trim();
    const email = ((message.match(/email\s+([^\s,]+)/i) || [])[1] || `${name.replace(/\s+/g, '').toLowerCase()}@demo.com`).trim();
    const course = ((message.match(/course\s+([^,\n]+?)(?:,| marks|$)/i) || [])[1] || 'Computer Science').trim();
    const marks = Number((message.match(/marks\s+(\d+)/i) || [])[1] || 80);
    const data = { name, email, course, marks };
    const result = await tools.create_record({ table: 'students', data });
    steps.push({ tool: 'create_record', args: { table: 'students', data }, result });
    return { reply: `Added student ${name}. ${result.message || ''}`, steps };
  }
  if (m.includes('delete') && /id\s*(\d+)/.test(m)) {
    const id = Number(m.match(/id\s*(\d+)/)[1]);
    const result = await tools.delete_record({ table, id });
    steps.push({ tool: 'delete_record', args: { table, id }, result });
    return { reply: result.message, steps };
  }
  if ((m.includes('show') || m.includes('list') || m.includes('all') || m.includes('view')) && !m.includes('add')) {
    const result = await tools.read_records({ table });
    steps.push({ tool: 'read_records', args: { table }, result });
    const lines = (result || [])
      .slice(0, 10)
      .map((r) => Object.values(r).join(' | '))
      .join('\n');
    return { reply: `Records from ${table} (${result.length}):\n${lines || 'empty'}`, steps };
  }
  const result = await tools.read_records({ table });
  steps.push({ tool: 'read_records', args: { table }, result });
  return {
    reply: `Showing ${table} (${result.length} records). Try: "Show all students" or "List all tables".`,
    steps
  };
}

// POST /api/agent/chat
router.post('/chat', authMiddleware, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ message: 'Message required' });

  if (!process.env.GEMINI_API_KEY) {
    try {
      return res.json(await fallbackAgent(message));
    } catch (err) {
      return res.status(500).json({ message: 'Agent error: ' + err.message });
    }
  }

  try {
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
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
    console.warn('Gemini agent failed, using local fallback:', err.message);
    try {
      return res.json(await fallbackAgent(message));
    } catch (e) {
      res.status(500).json({ message: 'Agent error: ' + err.message });
    }
  }
});

module.exports = router;
