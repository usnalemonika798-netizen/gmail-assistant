import { useEffect, useState } from 'react'

export default function Dashboard() {
  const [status, setStatus] = useState({ connected: false, telegramLinked: false })

  const token = localStorage.getItem('token')
  const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

  useEffect(() => {
    fetch(`${API_BASE}/api/gmail/status`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setStatus(data))
      .catch(console.error)
  }, [])

  const downloadPDFReport = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/pdf/gmail-summary`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url;
      a.download = 'Gmail_AI_Activity_Report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '30px auto', padding: '0 20px', fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontSize: '28px', color: '#1e293b', margin: 0 }}>📊 Analytics & Security Audit</h1>
      <p style={{ color: '#64748b', marginTop: '6px', marginBottom: '24px' }}>
        Export official PDF evaluation reports and review security & AI metrics.
      </p>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)', borderLeft: '4px solid #4f46e5' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>⚡</div>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: '500' }}>AI Urgency Engine</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#4f46e5', marginTop: '4px' }}>Active (NLP Tagging)</div>
        </div>

        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)', borderLeft: '4px solid #059669' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>🎨</div>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: '500' }}>AI Tone Controls</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#059669', marginTop: '4px' }}>Professional / Friendly / Brief</div>
        </div>

        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)', borderLeft: '4px solid #7c3aed' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>📱</div>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: '500' }}>Telegram Bot</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#7c3aed', marginTop: '4px' }}>
            {status.telegramLinked ? '🟢 Linked' : '🟡 Ready'}
          </div>
        </div>
      </div>

      {/* Security Audit Card */}
      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', marginBottom: '30px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginTop: 0, marginBottom: '12px' }}>
          🛡️ OAuth 2.0 Security & Token Audit
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '14px', color: '#475569' }}>
          <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '8px' }}>
            <strong>🔒 Auth Protocol:</strong> Google OAuth 2.0 (PKCE + Scopes)
          </div>
          <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '8px' }}>
            <strong>🔑 Token Renewal:</strong> Automatic Refresh Token Rotation
          </div>
          <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '8px' }}>
            <strong>🛡️ Access Scopes:</strong> `mail.google.com`, `email`, `profile`
          </div>
          <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '8px' }}>
            <strong>💾 Storage Engine:</strong> Hybrid Database Engine (SQLite / MySQL)
          </div>
        </div>
      </div>

      {/* College PDF Download Card */}
      <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
        <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1e293b', margin: '0 0 8px 0' }}>
          Download Evaluation PDF Report
        </h2>
        <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '600px', margin: '0 auto 24px auto' }}>
          Generate an official PDF summary report containing email activity, Gemini AI auto-reply metrics, and Telegram bot linking status for college submission.
        </p>

        <button
          onClick={downloadPDFReport}
          style={{
            padding: '14px 28px', background: '#e11d48', color: '#fff', border: 'none',
            borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '15px',
            boxShadow: '0 4px 14px rgba(225, 29, 72, 0.3)'
          }}
        >
          ⬇️ Download Gmail AI Activity PDF Report
        </button>
      </div>
    </div>
  )
}
