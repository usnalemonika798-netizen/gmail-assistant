import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import GmailInbox from './pages/GmailInbox'
import Navbar from './components/Navbar'

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  // Also allow access if token is in URL (Google OAuth callback)
  const urlParams = new URLSearchParams(window.location.search)
  const urlToken = urlParams.get('token')
  if (urlToken) {
    localStorage.setItem('token', urlToken)
  }
  return (token || urlToken) ? children : <Navigate to="/login" />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={
          <PrivateRoute>
            <Navbar />
            <GmailInbox />
          </PrivateRoute>
        } />
        <Route path="/gmail" element={
          <PrivateRoute>
            <Navbar />
            <GmailInbox />
          </PrivateRoute>
        } />
        <Route path="/report" element={
          <PrivateRoute>
            <Navbar />
            <Dashboard />
          </PrivateRoute>
        } />
      </Routes>
    </BrowserRouter>
  )
}

export default App
