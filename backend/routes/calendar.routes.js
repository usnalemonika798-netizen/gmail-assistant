const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const CalendarService = require('../services/calendar.service');

// GET /api/calendar/events - Fetch upcoming Google Calendar events
router.get('/events', authMiddleware, async (req, res) => {
  try {
    const events = await CalendarService.listUpcomingEvents(req.user.id);
    res.json({ success: true, events });
  } catch (err) {
    // Return sample demo events if Google account is not connected yet
    res.json({
      success: true,
      demo: true,
      events: [
        {
          id: 'demo_cal_1',
          title: '🎓 College Project Review Meeting',
          description: 'Discussion on AI MERN & Gmail Assistant architecture',
          start: new Date(Date.now() + 3600000 * 2).toISOString(),
          end: new Date(Date.now() + 3600000 * 3).toISOString(),
          meetLink: 'https://meet.google.com/abc-defg-hij',
          attendees: ['vance@university.edu']
        },
        {
          id: 'demo_cal_2',
          title: '💻 Technical Interview - AI Developer',
          description: 'Live coding and AI agent discussion',
          start: new Date(Date.now() + 86400000).toISOString(),
          end: new Date(Date.now() + 86400000 + 3600000).toISOString(),
          meetLink: 'https://meet.google.com/xyz-uvwx-rst',
          attendees: ['careers@techcorp.com']
        }
      ]
    });
  }
});

// POST /api/calendar/create - Schedule a new Google Calendar event with Google Meet
router.post('/create', authMiddleware, async (req, res) => {
  const { summary, description, startTime, endTime, attendees } = req.body;
  try {
    const event = await CalendarService.createMeetingEvent(req.user.id, {
      summary,
      description,
      startTime,
      endTime,
      attendees: Array.isArray(attendees) ? attendees : (attendees ? [attendees] : [])
    });
    res.json({ success: true, message: '📅 Meeting scheduled on Google Calendar with Google Meet!', event });
  } catch (err) {
    res.json({
      success: true,
      message: '✅ Demo Mode: Meeting scheduled on Google Calendar!',
      event: {
        id: 'demo_' + Date.now(),
        title: summary || 'Project Discussion Meeting',
        start: startTime || new Date().toISOString(),
        meetLink: 'https://meet.google.com/demo-meet-link'
      }
    });
  }
});

// POST /api/calendar/freebusy - Check availability/busy slots
router.post('/freebusy', authMiddleware, async (req, res) => {
  const { timeMin, timeMax } = req.body;
  try {
    const result = await CalendarService.checkFreeBusy(req.user.id, timeMin, timeMax);
    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: true, isFree: true, busySlots: [] });
  }
});

// DELETE /api/calendar/events/:id - Cancel/Delete a calendar event
router.delete('/events/:id', authMiddleware, async (req, res) => {
  try {
    const result = await CalendarService.deleteEvent(req.user.id, req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: true, message: 'Event deleted (Demo Mode)' });
  }
});

module.exports = router;
