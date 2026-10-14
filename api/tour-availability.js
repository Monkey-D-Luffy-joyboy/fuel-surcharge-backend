/**
 * GET /api/tour-availability
 *   ?tour=walking|ebike|car
 *   &start=YYYY-MM-DD&end=YYYY-MM-DD   (optional — defaults to today + 180 days)
 *
 * Availability for the three guided tours (街歩きツアー / E-バイクツアー /
 * 車で巡るバイロンベイ). Same shared-calendar, real time-block model as
 * surf-availability.js — every booking of every service lives on ONE
 * calendar (BOOKINGS_CALENDAR_ID) because Ryu is a solo operator, so a tour
 * is only offered at a time when nothing else (surf, transport, another
 * tour, a manual "day off" entry) overlaps it.
 *
 * Scheduling constants/helpers are DUPLICATED from surf-availability.js on
 * purpose (a shared _lib module previously broke Vercel bundling in this
 * project). If you change a number here, change it in surf-availability.js,
 * surf-inquiry.js, bookings.js and tour-inquiry.js too.
 *
 * Response shape (identical to surf-availability.js, minus rental counts):
 *   {
 *     guideBusyDates: [...],                                  // no free slot that day
 *     slotsByDate: { 'YYYY-MM-DD': ['07:00','07:30',...] },   // free start times
 *   }
 *
 * Env vars required: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY,
 *   BOOKINGS_CALENDAR_ID (or the legacy SURF_CALENDAR_ID)
 */
const { google } = require('googleapis');

// ---- tour durations (keep in sync with tour-inquiry.js) ----
const TOUR_DURATION_MIN = {
  walking: 120, // 所要時間2時間
  ebike: 240,   // 所要時間4時間
  car: 360,     // 所要時間6時間
};

// ---- shared scheduling model (see surf-availability.js) ----
const BOOKINGS_CALENDAR_ID = process.env.BOOKINGS_CALENDAR_ID || process.env.SURF_CALENDAR_ID;
const INTER_BOOKING_BUFFER_MIN = 30;
const DAY_START_MIN = 7 * 60;   // 07:00
const DAY_END_MIN = 19 * 60;    // 19:00
const SLOT_GRANULARITY_MIN = 30;
const TZ_OFFSET = '+10:00'; // same fixed offset as the rest of the codebase (doesn't account for AEDT)

const DEFAULT_MIN_LEAD_TIME_DAYS = 2;
function getMinLeadTimeDays() {
  const raw = process.env.MIN_LEAD_TIME_DAYS;
  const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
  return Number.isNaN(parsed) ? DEFAULT_MIN_LEAD_TIME_DAYS : parsed;
}

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + days * 24 * 60 * 60000);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}
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
function slotStartDate(dateStr, minutesFromMidnight) {
  const hh = String(Math.floor(minutesFromMidnight / 60)).padStart(2, '0');
  const mm = String(minutesFromMidnight % 60).padStart(2, '0');
  return new Date(`${dateStr}T${hh}:${mm}:00${TZ_OFFSET}`);
}
function overlapsAny(startMs, endMs, intervals) {
  return intervals.some(iv => startMs < iv.endMs && endMs > iv.startMs);
}

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
      startMs = new Date(`${ev.start.date}T00:00:00${TZ_OFFSET}`).getTime();
      endMs = new Date(`${ev.end.date}T00:00:00${TZ_OFFSET}`).getTime();
    } else {
      continue;
    }
    intervals.push({ startMs: startMs - padMs, endMs: endMs + padMs });
  }
  return intervals;
}

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

  const tour = req.query.tour;
  const durationMin = TOUR_DURATION_MIN[tour];
  if (!durationMin) {
    res.status(400).json({ error: 'Unknown tour' });
    return;
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDateStr = req.query.start || toDateOnly(today);
    const endDateStr = req.query.end || addDays(startDateStr, 180);
    const rangeStart = new Date(`${startDateStr}T00:00:00${TZ_OFFSET}`);
    const rangeEnd = new Date(`${endDateStr}T23:59:59${TZ_OFFSET}`);
    const earliestBookableDateStr = addDays(toDateOnly(today), getMinLeadTimeDays());

    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/calendar.readonly']
    );
    const calendar = google.calendar({ version: 'v3', auth });
    const busyIntervals = await fetchPaddedBusyIntervals(calendar, rangeStart, rangeEnd);

    const guideBusyDates = [];
    const slotsByDate = {};
    for (const dateStr of eachDateInRange(startDateStr, addDays(endDateStr, 1))) {
      if (new Date(`${dateStr}T23:59:59${TZ_OFFSET}`).getTime() < today.getTime()) continue;
      if (dateStr < earliestBookableDateStr) {
        guideBusyDates.push(dateStr);
        continue;
      }
      const slots = freeSlotsForDay(dateStr, durationMin, busyIntervals);
      if (slots.length === 0) guideBusyDates.push(dateStr);
      else slotsByDate[dateStr] = slots;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ guideBusyDates, slotsByDate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
