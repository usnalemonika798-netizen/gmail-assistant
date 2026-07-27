import { useState, useEffect } from 'react';

const btn = (bg, extra = {}) => ({
  padding: '10px 16px',
  background: bg,
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '13px',
  ...extra
});

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
  const [schedulingId, setSchedulingId] = useState(null);
  const [lastMeet, setLastMeet] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [triageLoading, setTriageLoading] = useState(false);

  const getToken = () =>
    localStorage.getItem('token') || new URLSearchParams(window.location.search).get('token');
  const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      localStorage.setItem('token', urlToken);
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${urlToken}` } })
        .then((res) => res.json())
        .then((data) => {
          if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
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
    setTimeout(() => setToastMessage(''), 4500);
  };

  const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` });

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/gmail/status`, { headers: authHeaders() });
      setStatus(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/gmail/unread`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) {
        setEmails([]);
        showToast(data.message || 'Error fetching emails');
        if (data.reconnect) setStatus((s) => ({ ...s, connected: false }));
        return;
      }
      setEmails(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast('Error fetching emails — is the backend up?');
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
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.code) {
        showToast(data.message || 'Failed — Sign in with Google again');
        setLinkCode('');
        return;
      }
      setLinkCode(data.code);
      showToast('Telegram code ready — /connect in bot now');
    } catch (err) {
      showToast('Error generating code');
    }
  };

  const handleDownloadPDF = async () => {
    try {
      showToast('Generating PDF…');
      const res = await fetch(`${API_BASE}/api/pdf/gmail-summary`, { headers: authHeaders() });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Gmail_AI_Activity_Report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('PDF downloaded');
    } catch (err) {
      showToast('PDF download failed');
    }
  };

  const handleBriefing = async () => {
    setBriefLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/gmail/briefing`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message || 'Briefing failed');
        return;
      }
      setBriefing(data);
      showToast('Morning briefing ready');
    } catch (err) {
      showToast('Briefing failed');
    } finally {
      setBriefLoading(false);
    }
  };

  const handleTriage = async () => {
    setTriageLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/gmail/triage`, {
        method: 'POST',
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message || 'Triage failed');
        return;
      }
      if (Array.isArray(data.emails)) setEmails(data.emails);
      const summary = data.counts
        ? Object.entries(data.counts)
            .map(([k, v]) => `${k}:${v}`)
            .join(' · ')
        : '';
      showToast(data.message + (summary ? ` (${summary})` : ''));
    } catch (err) {
      showToast('Auto-triage failed');
    } finally {
      setTriageLoading(false);
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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
      showToast('AI reply failed');
    } finally {
      setGeneratingReply(false);
    }
  };

  const handleScheduleMeet = async (email) => {
    setSchedulingId(email.id);
    setSelectedEmail(email);
    try {
      const res = await fetch(`${API_BASE}/api/calendar/schedule-from-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          from: email.from,
          subject: email.subject,
          snippet: email.snippet
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.hint || data.message || 'Failed to schedule Meet');
        return;
      }
      setLastMeet(data.event);
      const link = data.event?.meetLink || data.event?.htmlLink;
      const when = data.event?.start
        ? new Date(data.event.start).toLocaleString()
        : '';
      if (link) {
        setReplyText(
          `Hi,\n\nI've scheduled a Google Meet${when ? ` for ${when}` : ''}:\n${link}\n\nLooking forward to connecting.\n`
        );
      }
      showToast(data.event?.meetLink ? 'Meet link ready — edit & send reply' : 'Added to Calendar');
    } catch (err) {
      showToast('Schedule Meet failed — enable Calendar API?');
    } finally {
      setSchedulingId(null);
    }
  };

  const handleSendReply = async () => {
    if (!selectedEmail || !replyText) return;
    setSendingReply(true);
    try {
      const res = await fetch(`${API_BASE}/api/gmail/send-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          to: selectedEmail.from,
          subject: selectedEmail.subject,
          threadId: selectedEmail.threadId,
          replyText
        })
      });
      const data = await res.json();
      showToast(data.message || 'Reply sent');
      setSelectedEmail(null);
      setReplyText('');
      fetchEmails();
    } catch (err) {
      showToast('Send failed');
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '30px auto', padding: '0 20px', fontFamily: 'Segoe UI, system-ui, sans-serif' }}>
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 25,
            right: 25,
            backgroundColor: '#0f172a',
            color: '#fff',
            padding: '14px 22px',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            borderLeft: '4px solid #14b8a6',
            zIndex: 1000,
            maxWidth: 360
          }}
        >
          {toastMessage}
        </div>
      )}

      <div
        style={{
          background: 'linear-gradient(135deg, #0f766e 0%, #134e4a 55%, #1e293b 100%)',
          borderRadius: 16,
          padding: 28,
          color: 'white',
          marginBottom: 24,
          boxShadow: '0 12px 32px rgba(15, 118, 110, 0.28)'
        }}
      >
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Gmail AI Command Center</h1>
        <p style={{ margin: '8px 0 0', opacity: 0.92, fontSize: 14, maxWidth: 640 }}>
          Morning briefing · auto-triage labels · one-tap Meet · Telegram voice replies
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button onClick={handleConnectGmail} style={btn('#fff', { color: '#0f766e' })}>
            {status.connected ? 'Google connected' : 'Connect Google'}
          </button>
          <button
            onClick={handleBriefing}
            disabled={briefLoading}
            style={btn('rgba(255,255,255,0.18)', { border: '1px solid rgba(255,255,255,0.35)' })}
          >
            {briefLoading ? 'Briefing…' : 'Morning Briefing'}
          </button>
          <button
            onClick={handleTriage}
            disabled={triageLoading}
            style={btn('rgba(255,255,255,0.18)', { border: '1px solid rgba(255,255,255,0.35)' })}
          >
            {triageLoading ? 'Labeling…' : 'Auto-triage Labels'}
          </button>
          <button
            onClick={handleGenerateTelegramCode}
            style={btn('rgba(255,255,255,0.18)', { border: '1px solid rgba(255,255,255,0.35)' })}
          >
            {status.telegramLinked ? 'Telegram linked' : 'Link Telegram'}
          </button>
          <button onClick={handleDownloadPDF} style={btn('#be123c')}>
            Export PDF
          </button>
        </div>

        {linkCode && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              background: 'rgba(0,0,0,0.25)',
              borderRadius: 10,
              border: '1px dashed rgba(255,255,255,0.35)'
            }}
          >
            Open your Telegram Bot and send command: <code style={{ background: '#fff', color: '#000', padding: '4px 8px', borderRadius: '4px', fontWeight: '700' }}>/connect {linkCode}</code>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
              Then chat like a human: &quot;any important mail?&quot; — bot also pushes alerts for Urgent/Job/Meeting mail.
            </div>
          </div>
        )}

        {lastMeet && (
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              background: 'rgba(20, 184, 166, 0.2)',
              borderRadius: 10,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'center',
              border: '1px solid rgba(45, 212, 191, 0.45)'
            }}
          >
            <strong>Meet ready</strong>
            <span>{lastMeet.title}</span>
            {lastMeet.start && (
              <span style={{ opacity: 0.9 }}>{new Date(lastMeet.start).toLocaleString()}</span>
            )}
            {lastMeet.meetLink && (
              <a href={lastMeet.meetLink} target="_blank" rel="noreferrer" style={{ color: '#99f6e4', fontWeight: 700 }}>
                Join Meet
              </a>
            )}
            {lastMeet.htmlLink && (
              <a href={lastMeet.htmlLink} target="_blank" rel="noreferrer" style={{ color: '#e2e8f0' }}>
                Calendar
              </a>
            )}
          </div>
        )}
      </div>

      {briefing && (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 22,
            marginBottom: 22,
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            border: '1px solid #e2e8f0'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Morning Briefing</h2>
            <button onClick={() => setBriefing(null)} style={btn('#f1f5f9', { color: '#64748b' })}>
              Dismiss
            </button>
          </div>
          <p style={{ whiteSpace: 'pre-wrap', color: '#334155', lineHeight: 1.55, marginTop: 12 }}>
            {briefing.narrative}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {Object.entries(briefing.triageCounts || {}).map(([k, v]) => (
              <span
                key={k}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: '#f0fdfa',
                  color: '#0f766e',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {k}: {v}
              </span>
            ))}
          </div>
          {!!briefing.actions?.length && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: '#475569' }}>
              {briefing.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          {!!briefing.events?.length && (
            <div style={{ marginTop: 14 }}>
              <strong style={{ color: '#0f172a' }}>Upcoming</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#475569' }}>
                {briefing.events.map((ev) => (
                  <li key={ev.id}>
                    {ev.title} — {new Date(ev.start).toLocaleString()}
                    {ev.meetLink ? (
                      <>
                        {' '}
                        ·{' '}
                        <a href={ev.meetLink} target="_blank" rel="noreferrer">
                          Meet
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: selectedEmail ? '1fr 1fr' : '1fr', gap: 22 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 22, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Inbox ({emails.length})</h2>
            <button onClick={fetchEmails} disabled={loading} style={btn('#f1f5f9', { color: '#475569' })}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {emails.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#64748b', padding: '36px 0' }}>No unread emails</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {emails.map((email) => {
                const meetish = email.meetingHint;
                return (
                  <div
                    key={email.id}
                    style={{
                      border: selectedEmail?.id === email.id ? '2px solid #0f766e' : '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: 16,
                      background: selectedEmail?.id === email.id ? '#f0fdfa' : '#fff',
                      boxShadow: meetish ? 'inset 3px 0 0 #0d9488' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <strong style={{ color: '#0f172a', fontSize: 14 }}>{email.from}</strong>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {email.triage && (
                          <span
                            style={{
                              padding: '3px 9px',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              color: email.triage.color,
                              background: email.triage.bg
                            }}
                          >
                            {email.triage.category}
                          </span>
                        )}
                        {email.urgency && (
                          <span
                            style={{
                              padding: '3px 9px',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              color: email.urgency.color,
                              background: email.urgency.bg
                            }}
                          >
                            {email.urgency.label.replace(/^[^\s]+\s/, '')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontWeight: 600, color: '#334155', margin: '8px 0' }}>{email.subject}</div>
                    <p style={{ margin: 0, color: '#64748b', fontSize: 13, lineHeight: 1.45 }}>{email.snippet}</p>
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => handleGenerateReply(email)} style={btn('#4f46e5')}>
                        AI Reply
                      </button>
                      <button
                        onClick={() => handleScheduleMeet(email)}
                        disabled={schedulingId === email.id}
                        style={btn(meetish ? '#0d9488' : '#115e59', {
                          boxShadow: meetish ? '0 0 0 2px rgba(13,148,136,0.35)' : 'none',
                          opacity: schedulingId === email.id ? 0.7 : 1
                        })}
                        title={meetish ? 'This email looks like a meeting — recommended' : 'Create Calendar event + Meet link'}
                      >
                        {schedulingId === email.id
                          ? 'Scheduling…'
                          : meetish
                            ? 'Schedule Meet (suggested)'
                            : 'Schedule Meet'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedEmail && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 22, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 18, color: '#0f172a' }}>Reply composer</h2>
            <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>To</div>
              <strong style={{ fontSize: 14 }}>{selectedEmail.from}</strong>
              <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>Re: {selectedEmail.subject}</div>
            </div>
            <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Professional', 'Friendly', 'Brief'].map((tone) => (
                <button
                  key={tone}
                  onClick={() => handleGenerateReply(selectedEmail, tone)}
                  style={btn(selectedTone === tone ? '#0f766e' : '#f8fafc', {
                    color: selectedTone === tone ? '#fff' : '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: 20,
                    padding: '6px 12px'
                  })}
                >
                  {tone}
                </button>
              ))}
            </div>
            {generatingReply ? (
              <p style={{ textAlign: 'center', color: '#0f766e', padding: 32, fontWeight: 600 }}>
                Gemini drafting ({selectedTone})…
              </p>
            ) : (
              <>
                <textarea
                  rows={9}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 12,
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button
                    onClick={handleSendReply}
                    disabled={sendingReply || !replyText}
                    style={btn('#059669', { flex: 1, padding: 12 })}
                  >
                    {sendingReply ? 'Sending…' : 'Send reply'}
                  </button>
                  <button onClick={() => setSelectedEmail(null)} style={btn('#f1f5f9', { color: '#64748b' })}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
