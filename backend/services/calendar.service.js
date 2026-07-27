const { google } = require('googleapis');
const UserModel = require('../models/user.model');
require('dotenv').config();

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || process.env.GMAIL_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback'
  );
}

const CalendarService = {
  // Get initialized Google Calendar API client for user
  getValidCalendarClient: async (userId) => {
    const user = await UserModel.findById(userId);
    if (!user || !user.google_tokens) {
      throw new Error('User has not linked Google / Gmail account yet');
    }

    const tokens = typeof user.google_tokens === 'string' ? JSON.parse(user.google_tokens) : user.google_tokens;
    const oAuth2Client = getOAuth2Client();
    oAuth2Client.setCredentials(tokens);

    oAuth2Client.on('tokens', async (newTokens) => {
      const updatedTokens = { ...tokens, ...newTokens };
      await UserModel.saveGoogleTokens(userId, updatedTokens);
    });

    return google.calendar({ version: 'v3', auth: oAuth2Client });
  },

  // Get Calendar Client using tokens directly
  getCalendarClientFromTokens: (tokens) => {
    const client = getOAuth2Client();
    if (tokens) {
      const parsed = typeof tokens === 'string' ? JSON.parse(tokens) : tokens;
      client.setCredentials(parsed);
    }
    return google.calendar({ version: 'v3', auth: client });
  },

  // List upcoming calendar events
  listUpcomingEvents: async (userId, maxResults = 10) => {
    const calendar = await CalendarService.getValidCalendarClient(userId);
    const now = new Date().toISOString();

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now,
      maxResults: maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (response.data.items || []).map(event => ({
      id: event.id,
      title: event.summary || '(No Title)',
      description: event.description || '',
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      meetLink: event.hangoutsLink || (event.conferenceData?.entryPoints?.[0]?.uri) || null,
      attendees: (event.attendees || []).map(a => a.email),
      status: event.status
    }));
  },

  // Create a new meeting event with Google Meet link
  createMeetingEvent: async (userId, { summary, description, startTime, endTime, attendees = [] }) => {
    const calendar = await CalendarService.getValidCalendarClient(userId);

    const event = {
      summary: summary || 'Project Discussion Meeting',
      description: description || 'Scheduled via AI Assistant',
      start: {
        dateTime: startTime || new Date(Date.now() + 3600000).toISOString(),
        timeZone: 'Asia/Kolkata'
      },
      end: {
        dateTime: endTime || new Date(Date.now() + 7200000).toISOString(),
        timeZone: 'Asia/Kolkata'
      },
      attendees: attendees.map(email => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: 'meet_' + Date.now(),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    };

    const res = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: 'all'
    });

    return {
      id: res.data.id,
      title: res.data.summary,
      start: res.data.start.dateTime,
      end: res.data.end.dateTime,
      meetLink: res.data.hangoutsLink || res.data.conferenceData?.entryPoints?.[0]?.uri || null,
      htmlLink: res.data.htmlLink
    };
  },

  // Check Free/Busy availability
  checkFreeBusy: async (userId, timeMin, timeMax) => {
    const calendar = await CalendarService.getValidCalendarClient(userId);

    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin || new Date().toISOString(),
        timeMax: timeMax || new Date(Date.now() + 86400000 * 7).toISOString(),
        timeZone: 'Asia/Kolkata',
        items: [{ id: 'primary' }]
      }
    });

    const busySlots = res.data.calendars?.primary?.busy || [];
    return {
      isFree: busySlots.length === 0,
      busySlots
    };
  },

  // Delete a calendar event
  deleteEvent: async (userId, eventId) => {
    const calendar = await CalendarService.getValidCalendarClient(userId);
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId
    });
    return { success: true, message: 'Event deleted successfully' };
  }
};

module.exports = CalendarService;
