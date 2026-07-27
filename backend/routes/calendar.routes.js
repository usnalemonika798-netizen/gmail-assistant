const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const CalendarService = require('../services/calendar.service');
const AIService = require('../services/ai.service');

// GET /api/calendar/events
router.get('/events', authMiddleware, async (req, res) => {
  try {
    const events = await CalendarService.listUpcomingEvents(req.user.id);
    res.json({ success: true, events });
  } catch (err) {
    console.error('Calendar list error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/calendar/create
router.post('/create', authMiddleware, async (req, res) => {
  const { summary, description, startTime, endTime, attendees } = req.body;
  try {
    const event = await CalendarService.createMeetingEvent(req.user.id, {
      summary,
      description,
      startTime,
      endTime,
      attendees: Array.isArray(attendees) ? attendees : attendees ? [attendees] : []
    });
    res.json({
      success: true,
      message: 'Meeting scheduled on Google Calendar with Google Meet!',
      event
    });
  } catch (err) {
    console.error('Calendar create error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/calendar/schedule-from-email — AI reads email → creates Meet event
router.post('/schedule-from-email', authMiddleware, async (req, res) => {
  const { from, subject, snippet } = req.body;
  if (!from && !subject && !snippet) {
    return res.status(400).json({ success: false, message: 'Email content required' });
  }

  try {
    const draft = await AIService.extractMeetingFromEmail(from, subject, snippet);
    const event = await CalendarService.createMeetingEvent(req.user.id, draft);
    res.json({
      success: true,
      message: 'Google Meet scheduled from this email!',
      draft,
      event
    });
  } catch (err) {
    console.error('Schedule-from-email error:', err.message);
    const needsApi =
      /Calendar API has not been used|disabled|enable it/i.test(err.message || '');
    res.status(500).json({
      success: false,
      message: err.message,
      hint: needsApi
        ? 'Enable Google Calendar API in Cloud Console for this project, wait 1–2 min, retry.'
        : undefined
    });
  }
});

router.post('/freebusy', authMiddleware, async (req, res) => {
  const { timeMin, timeMax } = req.body;
  try {
    const result = await CalendarService.checkFreeBusy(req.user.id, timeMin, timeMax);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/events/:id', authMiddleware, async (req, res) => {
  try {
    const result = await CalendarService.deleteEvent(req.user.id, req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
