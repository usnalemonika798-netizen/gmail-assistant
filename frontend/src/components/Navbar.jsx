import { useNavigate, useLocation } from 'react-router-dom'

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  const logout = () => {
    localStorage.clear()
    navigate('/login')
  }

  return (
    <nav className="navbar">
      <div className="nav-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
        ✉️ Gmail AI & Telegram Assistant
      </div>
      <div className="nav-links">
        <span className="nav-user">👋 {user.name}</span>
        <button
          className={`nav-btn ${location.pathname === '/' || location.pathname === '/gmail' ? 'nav-btn-active' : 'nav-btn-ghost'}`}
          onClick={() => navigate('/')}
        >
          ✉️ Gmail AI Inbox
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
