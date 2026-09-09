/**
 * GET /api/surf-availability?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Read-only availability check for the Surf Guide booking widget.
 *
 * Availability is managed by hand in a dedicated Google Calendar ("Surf
 * Guide"), separate from the Transport calendar — the owner
 * (jpgbyron@gmail.com) never touches an admin UI on the website itself.
 *
 * There are two independent notions of "busy" here, because
 * レンタルサーフボード is an inventory item (6 boards to lend out) while
 * every other activity depends on the owner's own time (one booking = the
 * whole day is spoken for):
 *
 *   - guideBusyDates: days that already have a guide-led booking (or a
 *     manual block the owner typed in by hand) — these block every
 *     NON-rental activity from being booked that day.
 *   - rentalBoardCounts: { 'YYYY-MM-DD': boardsAlreadyReserved } — a day
 *     only becomes full for NEW rental inquiries once the count reaches 6.
 *     A manually-blocked day (e.g. the owner marks themselves fully out)
 *     is reported here pre-filled at 6, so it reads as fully booked
 *     either way, without needing a rental event to exist that day.
 *
 * Every event surf-inquiry.js creates is tagged via
 * extendedProperties.private.surfType ('guide' or 'rental', plus
 * boardCount for rentals) so this endpoint can tell bookings apart
 * without parsing event titles. Any event WITHOUT that tag — i.e.
 * something the owner typed into the calendar by hand — is treated as a
 * manual block and counts against both guide and rental availability for
 * every day it spans.
 *
 * Env vars required (reuses the same service account already set up for
 * Transport's calendar, just pointed at a different calendar):
 *   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY  (existing)
 *   SURF_CALENDAR_ID                          (new — see setup notes)
 */
const { google } = require('googleapis');

// Byron Bay / NSW currently follows the same convention as the rest of
// this codebase (confirm.js hardcodes +10:00 for Transport) — kept
// consistent here. Doesn't account for NSW daylight saving (AEDT,
// +11:00, roughly Oct-Apr) — flagged, not fixed, to stay consistent.
const TZ_OFFSET = '+10:00';

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

// Every date (as 'YYYY-MM-DD') from `startDateStr` up to but not including
// `endDateStrExclusive` — both plain 'YYYY-MM-DD' strings, e.g. straight
// from a Google all-day event's start.date/end.date. Done with pure
// calendar-day arithmetic (Date.UTC as an inert integer anchor, never
// converted through a real-world offset) so this can't drift by a day
// depending on what timezone the function happens to run in.
function eachDateInRange(startDateStr, endDateStrExclusive) {
  const dates = [];
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStrExclusive.split('-').map(Number);
  let cursor = Date.UTC(sy, sm - 1, sd);
  const endTime = Date.UTC(ey, em - 1, ed);
  while (cursor < endTime) {
    const d = new Date(cursor);
    dates.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
    cursor += 24 * 60 * 60 * 1000;
  }
  return dates;
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

    const events = [];
    let pageToken;
    do {
      const resp = await calendar.events.list({
        calendarId: process.env.SURF_CALENDAR_ID,
        timeMin: rangeStart.toISOString(),
        timeMax: rangeEnd.toISOString(),
        singleEvents: true,
        maxResults: 2500,
        pageToken,
      });
      events.push(...(resp.data.items || []));
      pageToken = resp.data.nextPageToken;
    } while (pageToken);

    const guideBusyDates = new Set();
    const rentalBoardCounts = {};

    for (const ev of events) {
      if (ev.status === 'cancelled') continue;
      const props = (ev.extendedProperties && ev.extendedProperties.private) || {};
      const surfType = props.surfType;

      // All-day events use start.date/end.date (end is exclusive); timed
      // events use start.dateTime and are treated as a single-day booking.
      let datesSpanned;
      if (ev.start.date) {
        datesSpanned = eachDateInRange(ev.start.date, ev.end.date);
      } else {
        datesSpanned = [new Date(ev.start.dateTime).toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' })];
      }

      if (surfType === 'rental') {
        const qty = Math.max(1, Math.min(6, parseInt(props.boardCount, 10) || 1));
        datesSpanned.forEach(d => { rentalBoardCounts[d] = (rentalBoardCounts[d] || 0) + qty; });
      } else if (surfType === 'guide') {
        datesSpanned.forEach(d => guideBusyDates.add(d));
      } else {
        // Untagged = something the owner added by hand (e.g. "Unavailable").
        // Treat as a hard block on both guide-led and rental availability.
        datesSpanned.forEach(d => {
          guideBusyDates.add(d);
          rentalBoardCounts[d] = 6;
        });
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      guideBusyDates: Array.from(guideBusyDates),
      rentalBoardCounts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
