/**
 * GET /api/surf-availability
 *   ?activity=half_day|two_session|photo|video|beginner_guide|rental_board
 *   &start=YYYY-MM-DD&end=YYYY-MM-DD
 *   &durationMin=60|120|180        (photo/video only — ignored otherwise)
 *
 * ============================================================
 * PHASE 1 REWRITE — shared calendar, real time-blocks.
 * ------------------------------------------------------------
 * Ryu is a solo operator: every booking, Transport or Surf Guide, draws on
 * the same person's time. The old model (this endpoint blocking whole
 * DAYS) couldn't represent a 3-hour half-day surf session leaving the rest
 * of the day free, or a 6-hour Brisbane airport run. So as of this
 * rewrite, ALL bookings (both services) are real timed events on ONE
 * shared Google Calendar (BOOKINGS_CALENDAR_ID), and a new request is only
 * blocked if its estimated time window actually overlaps something
 * already there — regardless of which service that other booking is for.
 *
 * This file's scheduling constants/helpers are duplicated in
 * surf-inquiry.js and bookings.js rather than imported from a shared
 * module — a shared _lib file previously made Vercel fail with "Cannot
 * find module" at runtime in this project (see the pricing-logic comment
 * in bookings.js/quote.js), so duplication here is deliberate. If you
 * change a number below, change it in all three files.
 *
 * Response shape:
 *   {
 *     guideBusyDates: [...],        // dates with ZERO free slots for this activity (disable in the calendar grid)
 *     slotsByDate: { 'YYYY-MM-DD': ['07:00','07:30',...] },  // free start times on partially-open dates
 *     rentalBoardCounts: {...},     // レンタルサーフボード inventory only (unrelated to time-blocking)
 *   }
 *
 * Env vars required:
 *   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY  (existing)
 *   BOOKINGS_CALENDAR_ID  (new — falls back to SURF_CALENDAR_ID so this
 *     works immediately without forcing a brand-new calendar + re-share;
 *     point BOOKINGS_CALENDAR_ID at the same calendar, or a renamed one,
 *     whenever convenient — see the setup note sent alongside this file.)
 */
const { google } = require('googleapis');

// ---- shared scheduling model (see file header) ----
const BOOKINGS_CALENDAR_ID = process.env.BOOKINGS_CALENDAR_ID || process.env.SURF_CALENDAR_ID;
const INTER_BOOKING_BUFFER_MIN = 30;
const DAY_START_MIN = 7 * 60;   // 07:00 — scheduling assumption, adjust if working hours differ
const DAY_END_MIN = 19 * 60;    // 19:00
const SLOT_GRANULARITY_MIN = 30;
const TZ_OFFSET = '+10:00'; // Byron Bay / NSW — doesn't account for daylight saving (AEDT, Oct-Apr); flagged, not fixed, to stay consistent with the rest of this codebase.

const ACTIVITY_DURATION_MIN = {
  half_day: 180,
  two_session: 360,
  beginner_guide: 180,
  // photo / video use whatever the customer picked (durationMin query param).
};
const VALID_PHOTO_VIDEO_DURATIONS = [60, 120, 180];
const RENTAL_DROPOFF_PICKUP_MIN = 60;

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

// One calendar day after `dateStr`, as a plain date string — pure
// Date.UTC arithmetic, no timezone offset involved (bare date strings
// like this aren't tied to any timezone in the first place).
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + days * 24 * 60 * 60000);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}
function addOneDay(dateStr) {
  return addDays(dateStr, 1);
}

// Every date (as 'YYYY-MM-DD') from `startDateStr` up to but not including
// `endDateStrExclusive` — pure calendar-day arithmetic (Date.UTC as an
// inert integer anchor, never converted through a real-world offset) so
// this can't drift by a day depending on what timezone the function runs in.
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

// Local wall-clock Date for a given 'YYYY-MM-DD' + minutes-since-midnight,
// using the fixed TZ_OFFSET (same approach as surf-inquiry.js's event
// creation) rather than mixing UTC math with a real-world offset.
function slotStartDate(dateStr, minutesFromMidnight) {
  const hh = String(Math.floor(minutesFromMidnight / 60)).padStart(2, '0');
  const mm = String(minutesFromMidnight % 60).padStart(2, '0');
  return new Date(`${dateStr}T${hh}:${mm}:00${TZ_OFFSET}`);
}

function overlapsAny(startMs, endMs, intervals) {
  return intervals.some(iv => startMs < iv.endMs && endMs > iv.startMs);
}

// Fetches every non-cancelled event in [rangeStart, rangeEnd) from the
// shared calendar and returns busy intervals as {startMs, endMs}, each
// already padded by INTER_BOOKING_BUFFER_MIN on both sides so a plain
// numeric overlap check enforces the buffer automatically.
async function fetchPaddedBusyIntervals(calendar, rangeStart, rangeEnd) {
  const events = [];
  let pageToken;
  do {
    const resp = await calendar.events.list({
      calendarId: BOOKINGS_CALENDAR_ID,
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
      singleEvents: true,
      maxResults: 2500,
      pageToken,
    });
    events.push(...(resp.data.items || []));
    pageToken = resp.data.nextPageToken;
  } while (pageToken);

  const padMs = INTER_BOOKING_BUFFER_MIN * 60000;
  const intervals = [];
  for (const ev of events) {
    if (ev.status === 'cancelled') continue;
    let startMs, endMs;
    if (ev.start.dateTime) {
      startMs = new Date(ev.start.dateTime).getTime();
      endMs = new Date(ev.end.dateTime).getTime();
    } else if (ev.start.date) {
      // A manually-typed all-day entry (e.g. "day off") — treat as
      // blocking the whole day rather than guessing a time within it.
      startMs = new Date(`${ev.start.date}T00:00:00${TZ_OFFSET}`).getTime();
      endMs = new Date(`${ev.end.date}T00:00:00${TZ_OFFSET}`).getTime();
    } else {
      continue;
    }
    intervals.push({ startMs: startMs - padMs, endMs: endMs + padMs });
  }
  return intervals;
}

// Every 'HH:MM' start time (stepping by SLOT_GRANULARITY_MIN within
// [DAY_START_MIN, DAY_END_MIN)) such that a durationMin-long booking
// starting then doesn't overlap any already-padded busy interval.
function freeSlotsForDay(dateStr, durationMin, busyIntervals) {
  const slots = [];
  for (let mins = DAY_START_MIN; mins + durationMin <= DAY_END_MIN; mins += SLOT_GRANULARITY_MIN) {
    const startMs = slotStartDate(dateStr, mins).getTime();
    const endMs = startMs + durationMin * 60000;
    if (!overlapsAny(startMs, endMs, busyIntervals)) {
      const hh = String(Math.floor(mins / 60)).padStart(2, '0');
      const mm = String(mins % 60).padStart(2, '0');
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
}

module.exports = async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activity = req.query.activity || 'half_day';
    const startParam = req.query.start;
    const endParam = req.query.end;

    // Work out the requested range as plain 'YYYY-MM-DD' strings FIRST, using only
    // pure Date.UTC arithmetic (addDays) — never round-tripping a TZ_OFFSET-based
    // Date back through toISOString().slice(0,10) to get a date string, since that
    // silently shifts local midnight into the previous UTC day (bit us more than
    // once already in surf-inquiry.js; caught here too by test_transport_availability.js's
    // sibling test before this endpoint's own tests happened to exercise it).
    // rangeStart/rangeEnd below are ONLY used as real instants (Google Calendar API
    // bounds), never converted back to a date string.
    const startDateStr = startParam || toDateOnly(today);
    const endDateStr = endParam || addDays(startDateStr, 180); // default: look 6 months ahead
    const rangeStart = new Date(`${startDateStr}T00:00:00${TZ_OFFSET}`);
    const rangeEnd = new Date(`${endDateStr}T23:59:59${TZ_OFFSET}`);

    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/calendar.readonly']
    );
    const calendar = google.calendar({ version: 'v3', auth });

    const busyIntervals = await fetchPaddedBusyIntervals(calendar, rangeStart, rangeEnd);

    // レンタルサーフボード inventory (board counts) is a completely separate
    // concern from time-blocking — still computed from the same event set,
    // via the boardCount tag on inventory events (see surf-inquiry.js).
    const rentalBoardCounts = {};
    if (activity === 'rental_board') {
      let pageToken;
      const events = [];
      do {
        const resp = await calendar.events.list({
          calendarId: BOOKINGS_CALENDAR_ID,
          timeMin: rangeStart.toISOString(),
          timeMax: rangeEnd.toISOString(),
          singleEvents: true,
          maxResults: 2500,
          pageToken,
        });
        events.push(...(resp.data.items || []));
        pageToken = resp.data.nextPageToken;
      } while (pageToken);

      for (const ev of events) {
        if (ev.status === 'cancelled') continue;
        const props = (ev.extendedProperties && ev.extendedProperties.private) || {};
        if (props.surfType !== 'rental' || props.blockType) continue; // blockType set = a delivery/pickup event, not an inventory-day event
        let datesSpanned;
        if (ev.start.date) {
          datesSpanned = eachDateInRange(ev.start.date, ev.end.date);
        } else {
          datesSpanned = [new Date(ev.start.dateTime).toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' })];
        }
        const qty = Math.max(1, Math.min(6, parseInt(props.boardCount, 10) || 1));
        datesSpanned.forEach(d => { rentalBoardCounts[d] = (rentalBoardCounts[d] || 0) + qty; });
      }
    }

    // Figure out this activity's duration for slot computation.
    let durationMin;
    if (activity === 'photo' || activity === 'video') {
      const requested = parseInt(req.query.durationMin, 10);
      durationMin = VALID_PHOTO_VIDEO_DURATIONS.includes(requested) ? requested : 60;
    } else if (activity === 'rental_board') {
      durationMin = RENTAL_DROPOFF_PICKUP_MIN; // slots here represent a delivery OR pickup visit, not the whole rental
    } else {
      durationMin = ACTIVITY_DURATION_MIN[activity] || 180;
    }

    // The `end` query param (and the default 180-day lookahead) are meant
    // INCLUSIVE, but eachDateInRange's second argument is exclusive — bump
    // it by one day so the last requested date is actually included.
    const allDates = eachDateInRange(startDateStr, addOneDay(endDateStr));
    const guideBusyDates = [];
    const slotsByDate = {};
    for (const dateStr of allDates) {
      // Past dates are never offered regardless of the calendar.
      if (new Date(`${dateStr}T23:59:59${TZ_OFFSET}`).getTime() < today.getTime()) continue;
      const slots = freeSlotsForDay(dateStr, durationMin, busyIntervals);
      if (slots.length === 0) {
        guideBusyDates.push(dateStr);
      } else {
        slotsByDate[dateStr] = slots;
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      guideBusyDates,
      slotsByDate,
      rentalBoardCounts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
