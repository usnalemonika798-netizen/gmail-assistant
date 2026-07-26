import { useState, useEffect } from 'react';

export default function GmailInbox() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ connected: false, telegramLinked: false });
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [generatingReply, setGeneratingReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [selectedTone, setSelectedTone] = useState('Professional');
  const [sendingReply, setSendingReply] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [linkCode, setLinkCode] = useState('');

  const token = localStorage.getItem('token');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      localStorage.setItem('token', urlToken);
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${urlToken}` } })
        .then(res => res.json())
        .then(data => {
          if (data.user) {
            localStorage.setItem('user', JSON.stringify(data.user));
          }
        })
        .catch(() => {})
        .finally(() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          fetchStatus();
          fetchEmails();
        });
    } else {
      fetchStatus();
      fetchEmails();
    }
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/gmail/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/gmail/unread`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setEmails(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast('❌ Error fetching emails');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGmail = () => {
    window.location.href = `${API_BASE}/api/auth/google`;
  };

  const handleGenerateTelegramCode = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/telegram/link-code`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.code) {
        setLinkCode(data.code);
        showToast('✅ Telegram Link Code generated!');
      }
    } catch (err) {
      showToast('❌ Error generating code');
    }
  };

  const handleDownloadPDF = async () => {
    try {
      showToast('📄 Generating PDF Report...');
      const res = await fetch(`${API_BASE}/api/pdf/gmail-summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Gmail_AI_Activity_Report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('✅ PDF Report Downloaded!');
    } catch (err) {
      showToast('❌ Error downloading PDF');
    }
  };

  const handleGenerateReply = async (email, tone = selectedTone) => {
    setSelectedEmail(email);
    setSelectedTone(tone);
    setGeneratingReply(true);
    setReplyText('');

    try {
      const res = await fetch(`${API_BASE}/api/gmail/generate-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          from: email.from,
          subject: email.subject,
          snippet: email.snippet,
          tone
        })
      });
      const data = await res.json();
      setReplyText(data.reply || '');
    } catch (err) {
      showToast('❌ Error generating AI reply');
    } finally {
      setGeneratingReply(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedEmail || !replyText) return;
    setSendingReply(true);
    try {
      const res = await fetch(`${API_BASE}/api/gmail/send-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          to: selectedEmail.from,
          subject: selectedEmail.subject,
          threadId: selectedEmail.threadId,
          replyText
        })
      });
      const data = await res.json();
      showToast(data.message || '✅ Email reply sent!');
      setSelectedEmail(null);
      setReplyText('');
      fetchEmails();
    } catch (err) {
      showToast('❌ Error sending reply');
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '30px auto', padding: '0 20px', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: '25px', right: '25px', backgroundColor: '#1e1e38', color: '#fff',
          padding: '14px 24px', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          borderLeft: '5px solid #6366f1', zIndex: 1000, fontWeight: '500'
        }}>
          {toastMessage}
        </div>
      )}

      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
        borderRadius: '16px', padding: '32px', color: 'white', marginBottom: '30px',
        boxShadow: '0 10px 30px rgba(79, 70, 229, 0.3)'
      }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '700' }}>✉️ Gmail AI & Telegram Assistant</h1>
        <p style={{ margin: '8px 0 0 0', opacity: 0.9, fontSize: '15px' }}>
          Autonomous Email Assistant with AI Urgency Categorization, Custom Tone Selection, and Telegram Bot Controls.
        </p>

        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          
          {/* Gmail Connect Button */}
          <button
            onClick={handleConnectGmail}
            style={{
              padding: '10px 18px', background: '#ffffff', color: '#4f46e5', border: 'none',
              borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '14px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
          >
            🔑 {status.connected ? 'Gmail Connected' : 'Connect Google Account'}
          </button>

          {/* Telegram Code Button */}
          <button
            onClick={handleGenerateTelegramCode}
            style={{
              padding: '10px 18px', background: 'rgba(255,255,255,0.2)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px'
            }}
          >
            📱 {status.telegramLinked ? '🟢 Telegram Linked' : 'Link Telegram Bot'}
          </button>

          {/* PDF Report Export Button */}
          <button
            onClick={handleDownloadPDF}
            style={{
              padding: '10px 18px', background: '#e11d48', color: '#ffffff', border: 'none',
              borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px'
            }}
          >
            📄 Export PDF Report
          </button>
        </div>

        {/* Link Code Display Banner */}
        {linkCode && (
          <div style={{
            marginTop: '20px', padding: '16px', background: 'rgba(0,0,0,0.25)',
            borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.4)'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '4px' }}>📱 Telegram Link Instructions:</div>
            Open your Telegram Bot and send command: <code style={{ background: '#fff', color: '#000', padding: '4px 8px', borderRadius: '4px', fontWeight: '700' }}>/connect {linkCode}</code>
          </div>
        )}
      </div>

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedEmail ? '1fr 1fr' : '1fr', gap: '25px' }}>
        
        {/* Left Column: Email List */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#1e293b' }}>📥 Inbox ({emails.length})</h2>
            <button
              onClick={fetchEmails}
              disabled={loading}
              style={{
                padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px',
                cursor: 'pointer', fontWeight: '600', color: '#475569'
              }}
            >
              {loading ? '🔄 Refreshing...' : '🔄 Refresh Inbox'}
            </button>
          </div>

          {emails.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
              <p style={{ fontSize: '16px' }}>🎉 No unread emails in inbox!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {emails.map((email) => (
                <div
                  key={email.id}
                  style={{
                    border: selectedEmail?.id === email.id ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    borderRadius: '10px', padding: '18px', background: selectedEmail?.id === email.id ? '#f5f3ff' : '#fff',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'center' }}>
                    <strong style={{ color: '#1e293b', fontSize: '15px' }}>{email.from}</strong>
                    
                    {/* Urgency Badge */}
                    {email.urgency && (
                      <span style={{
                        padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700',
                        color: email.urgency.color, backgroundColor: email.urgency.bg
                      }}>
                        {email.urgency.label}
                      </span>
                    )}
                  </div>

                  <div style={{ fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                    📌 {email.subject}
                  </div>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '13px', lineHeight: '1.5' }}>
                    {email.snippet}
                  </p>

                  <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleGenerateReply(email)}
                      style={{
                        padding: '8px 16px', background: '#4f46e5', color: '#fff', border: 'none',
                        borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px'
                      }}
                    >
                      🤖 Generate AI Reply
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: AI Reply Generator with Tone Selector */}
        {selectedEmail && (
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', color: '#1e293b' }}>🤖 AI Reply Assistant</h2>
            
            <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', color: '#64748b' }}>Replying to:</div>
              <strong style={{ color: '#1e293b', fontSize: '14px' }}>{selectedEmail.from}</strong>
              <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>Subject: Re: {selectedEmail.subject}</div>
            </div>

            {/* Selectable AI Tone Pills */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#334155', fontSize: '13px' }}>
                Select AI Response Tone:
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['Professional', 'Friendly', 'Brief'].map((tone) => (
                  <button
                    key={tone}
                    onClick={() => handleGenerateReply(selectedEmail, tone)}
                    style={{
                      padding: '6px 14px', borderRadius: '20px', border: '1px solid #cbd5e1',
                      cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                      background: selectedTone === tone ? '#4f46e5' : '#f8fafc',
                      color: selectedTone === tone ? '#ffffff' : '#475569'
                    }}
                  >
                    {tone === 'Professional' ? '👔 Professional' : tone === 'Friendly' ? '😊 Friendly' : '⚡ Brief'}
                  </button>
                ))}
              </div>
            </div>

            {generatingReply ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6366f1' }}>
                <p style={{ fontWeight: '600' }}>⚡ Gemini AI is generating response in {selectedTone} tone...</p>
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#334155', fontSize: '14px' }}>
                  Edit Draft Reply:
                </label>
                <textarea
                  rows="8"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  style={{
                    width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'
                  }}
                />

                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                  <button
                    onClick={handleSendReply}
                    disabled={sendingReply || !replyText}
                    style={{
                      flex: 1, padding: '12px', background: '#059669', color: '#fff', border: 'none',
                      borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px'
                    }}
                  >
                    {sendingReply ? 'Sending...' : '✅ Send Email Reply'}
                  </button>
                  <button
                    onClick={() => setSelectedEmail(null)}
                    style={{
                      padding: '12px 18px', background: '#f1f5f9', color: '#64748b', border: 'none',
                      borderRadius: '8px', cursor: 'pointer', fontWeight: '600'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
