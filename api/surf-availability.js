/**
 * GET /api/surf-availability?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Read-only availability check for the Surf Guide booking widget.
 *
 * Design: availability is managed ENTIRELY by hand in a dedicated Google
 * Calendar ("Surf Guide"), separate from the Transport calendar. The owner
 * (jpgbyron@gmail.com) can:
 *   - add a plain "Unavailable" (or any) event on a day to block it, or
 *   - simply see days fill up automatically as surf-inquiry.js writes a
 *     calendar event for every new booking it receives.
 *
 * This endpoint treats a WHOLE DAY as unavailable if the Surf Guide
 * calendar has ANY event overlapping that day at all — there is no
 * per-time-slot logic. That matches a single-guide business: once
 * something is on the calendar for a day, that day is done.
 *
 * Env vars required (reuses the same service account already set up for
 * Transport's calendar, just pointed at a different calendar):
 *   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY  (existing)
 *   SURF_CALENDAR_ID                          (new — see setup notes)
 *
 * SURF_CALENDAR_ID must be a calendar that has been shared with
 * GOOGLE_CLIENT_EMAIL (Settings and sharing → Share with specific people →
 * add the service account email → "Make changes to events").
 */
const { google } = require('googleapis');

// Byron Bay / NSW currently follows the same convention as the rest of
// this codebase (confirm.js hardcodes +10:00 for Transport) — kept
// consistent here. Note this does not account for NSW daylight saving
// (AEDT, +11:00, roughly Oct–Apr); if that ever causes an off-by-one-hour
// mismatch against the calendar, this is the place to fix it.
const TZ_OFFSET = '+10:00';

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startParam = req.query.start;
    const endParam = req.query.end;

    const rangeStart = startParam ? new Date(`${startParam}T00:00:00${TZ_OFFSET}`) : new Date(`${toDateOnly(today)}T00:00:00${TZ_OFFSET}`);
    let rangeEnd;
    if (endParam) {
      rangeEnd = new Date(`${endParam}T23:59:59${TZ_OFFSET}`);
    } else {
      const d = new Date(rangeStart);
      d.setDate(d.getDate() + 180); // default: look 6 months ahead
      rangeEnd = d;
    }

    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/calendar.readonly']
    );
    const calendar = google.calendar({ version: 'v3', auth });

    const fb = await calendar.freebusy.query({
      requestBody: {
        timeMin: rangeStart.toISOString(),
        timeMax: rangeEnd.toISOString(),
        items: [{ id: process.env.SURF_CALENDAR_ID }],
      },
    });

    const calId = process.env.SURF_CALENDAR_ID;
    const busyRanges = (fb.data.calendars && fb.data.calendars[calId] && fb.data.calendars[calId].busy) || [];

    // Walk each day in the range; mark it busy if any busy interval overlaps it.
    const busyDates = [];
    const cursor = new Date(rangeStart);
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor <= rangeEnd) {
      const dayStart = new Date(`${toDateOnly(cursor)}T00:00:00${TZ_OFFSET}`);
      const dayEnd = new Date(`${toDateOnly(cursor)}T23:59:59${TZ_OFFSET}`);
      const overlaps = busyRanges.some(b => {
        const bStart = new Date(b.start);
        const bEnd = new Date(b.end);
        return bStart <= dayEnd && bEnd >= dayStart;
      });
      if (overlaps) busyDates.push(toDateOnly(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ busyDates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
