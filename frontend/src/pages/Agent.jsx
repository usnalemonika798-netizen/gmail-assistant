import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

const EXAMPLES = [
  'Show all students',
  'Add a student named Alice, email alice@test.com, course Computer Science, marks 85',
  'Show all products',
  'Add a product named Laptop, price 999.99, quantity 10',
  'Delete student with id 1',
  'Update product id 1 set quantity to 20',
  'List all tables'
]

export default function Agent() {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: '👋 Hi! I\'m your AI SQL Agent powered by Gemini.\n\nI can perform database operations using natural language. Try asking me to:\n• Show all students or products\n• Add, update, or delete records\n• List all tables',
      steps: []
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async (text) => {
    const msg = text || input.trim()
    if (!msg) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: msg }])
    setLoading(true)

    try {
      const res = await axios.post(
        '/api/agent/chat',
        { message: msg },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      )
      setMessages(prev => [...prev, {
        role: 'ai',
        text: res.data.reply,
        steps: res.data.steps || []
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'ai',
        text: '❌ Error: ' + (err.response?.data?.message || 'Something went wrong'),
        steps: []
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="agent-page">
      <h1 className="page-title">🧠 AI SQL Agent</h1>
      <p className="page-subtitle">
        Chat with AI to perform database CRUD operations using natural language
      </p>

      {/* Example prompts */}
      <div className="example-prompts">
        {EXAMPLES.map((ex, i) => (
          <button key={i} className="prompt-chip" onClick={() => sendMessage(ex)}>
            {ex}
          </button>
        ))}
      </div>

      {/* Chat window */}
      <div className="chat-window">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role === 'user' ? 'chat-msg-user' : ''}`}>
            <div className={`chat-avatar ${msg.role === 'ai' ? 'avatar-ai' : 'avatar-user'}`}>
              {msg.role === 'ai' ? '🤖' : '👤'}
            </div>
            <div>
              <div className={`chat-bubble ${msg.role === 'ai' ? 'bubble-ai' : 'bubble-user'}`}>
                {msg.text}
              </div>
              {msg.steps && msg.steps.length > 0 && (
                <div className="tool-steps">
                  <div style={{ marginBottom: '4px', fontWeight: '600' }}>🔧 Tools used:</div>
                  {msg.steps.map((s, j) => (
                    <div key={j} className="tool-step">
                      <span>⚡</span>
                      <span><strong>{s.tool}</strong>({JSON.stringify(s.args)}) → {
                        typeof s.result === 'object'
                          ? Array.isArray(s.result)
                            ? `${s.result.length} records`
                            : JSON.stringify(s.result)
                          : String(s.result)
                      }</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-msg">
            <div className="chat-avatar avatar-ai">🤖</div>
            <div className="chat-bubble bubble-ai">
              <div className="typing">
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder="e.g. Add a student named John with marks 90..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading}
        />
        <button className="btn-send" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
          {loading ? '...' : 'Send ➤'}
        </button>
      </div>
    </div>
  )
}
