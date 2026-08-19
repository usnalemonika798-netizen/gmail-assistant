import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}')
    } catch {
      return {}
    }
  })

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    axios
      .get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.data?.user) {
          localStorage.setItem('user', JSON.stringify(res.data.user))
          setUser(res.data.user)
        }
      })
      .catch(() => {})
  }, [location.pathname])

  const logout = () => {
    localStorage.clear()
    navigate('/login')
  }

  const displayName = user.name || user.email || 'Signed in'

  return (
    <nav className="navbar">
      <div className="nav-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
        ✉️ Gmail AI & Telegram Assistant
      </div>
      <div className="nav-links">
        <span className="nav-user" title={user.email || ''}>
          👋 {displayName}
          {user.email ? (
            <span style={{ display: 'block', fontSize: '11px', opacity: 0.75, fontWeight: 500 }}>
              {user.email}
            </span>
          ) : null}
        </span>
        <button
          className={`nav-btn ${location.pathname === '/' || location.pathname === '/gmail' ? 'nav-btn-active' : 'nav-btn-ghost'}`}
          onClick={() => navigate('/')}
        >
          ✉️ Gmail AI Inbox
        </button>
        <button
          className={`nav-btn ${location.pathname === '/agent' ? 'nav-btn-active' : 'nav-btn-ghost'}`}
          onClick={() => navigate('/agent')}
        >
          🧠 SQL Agent
        </button>
        <button
          className={`nav-btn ${location.pathname === '/report' ? 'nav-btn-active' : 'nav-btn-ghost'}`}
          onClick={() => navigate('/report')}
        >
          📄 Activity PDF Report
        </button>
        <button className="nav-btn nav-btn-logout" onClick={logout}>
          🚪 Logout
        </button>
      </div>
    </nav>
  )
}
