/**
 * GET /api/transport-availability
 *   ?routeId=gc|bne|custom
 *   &start=YYYY-MM-DD&end=YYYY-MM-DD
 *   &fromCustomAddress=...&toAddress=...   (custom route only)
 *
 * ============================================================
 * PHASE 1 (Transport UI follow-up) — same shared-calendar, real-time-block
 * model as api/surf-availability.js, applied to the Transport booking page
 * so its calendar can finally show real free/busy times instead of a
 * hardcoded demo date list.
 *
 * gc / bne have a fixed duration (see ROUTE_DURATION_MIN in bookings.js,
 * duplicated below) so their availability can be computed immediately.
 * 'custom' depends on a LIVE Google Maps drive-time lookup between the
 * customer's own addresses — so until both addresses are given AND that
 * lookup succeeds, this deliberately returns an "unresolved" response
 * instead of guessing a duration, matching api/bookings.js's fail-closed
 * behaviour on submit (Ryu asked for this explicitly: a bad guess here
 * could falsely show — or hide — availability, or later get rejected at
 * submit after the customer already picked a date/time).
 *
 * This file's scheduling constants/helpers are duplicated from
 * bookings.js / surf-availability.js / surf-inquiry.js rather than
 * imported from a shared module — a shared _lib file previously made
 * Vercel fail with "Cannot find module" at runtime in this project, so
 * duplication here is deliberate. If you change a number, change it in
 * all four files.
 *
 * Response shape:
 *   {
 *     busyDates: [...],                 // dates with ZERO free slots — disable in the calendar grid
 *     slotsByDate: { 'YYYY-MM-DD': ['05:00','05:15',...] },
 *     addressStatus: 'ok' | 'incomplete' | 'unresolved',  // 'custom' route only; always 'ok' for gc/bne
 *     message: '...'                    // present when addressStatus !== 'ok' — show to the customer
 *   }
 *
 * Env vars required: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, BOOKINGS_CALENDAR_ID
 * (or SURF_CALENDAR_ID), GOOGLE_SERVER_MAPS_KEY (custom route only).
 */
const { google } = require('googleapis');

// ---- shared scheduling model (see file header) ----
const BOOKINGS_CALENDAR_ID = process.env.BOOKINGS_CALENDAR_ID || process.env.SURF_CALENDAR_ID;
const INTER_BOOKING_BUFFER_MIN = 30;
// Transport pickups can be very early (dawn flights) or late (red-eye arrivals) —
// wider than Surf Guide's 07:00-19:00 window. Adjust here if working hours differ;
// bookings are not allowed to run past midnight into the next calendar day.
const DAY_START_MIN = 5 * 60;   // 05:00
const DAY_END_MIN = 24 * 60;    // 24:00 (midnight) — a booking's block must fit before this
const SLOT_GRANULARITY_MIN = 15;
const TZ_OFFSET = '+10:00'; // Byron Bay / NSW — doesn't account for daylight saving (AEDT, Oct-Apr); flagged, not fixed, to stay consistent with the rest of this codebase.

// Each figure already bakes in the requested 1hr safety buffer for the round trip.
const ROUTE_DURATION_MIN = {
  gc: 180,   // ゴールドコースト空港送迎
  bne: 360,  // ブリスベン空港送迎
};
const CUSTOM_ROUTE_BUFFER_MIN = 60;

// Customers are mostly calling from Japan — directing them to phone Ryu means an
// expensive international call on their end, so every customer-facing "if this
// doesn't work, contact us" message points here instead. Duplicated across files
// per this project's convention (kept identical to bookings.js's copy).
const CONTACT_EMAIL = 'jpgbyron@gmail.com'; // customer-facing contact point — bookings@jpgbyron.com is send-only (no working inbox behind it yet)
const ADDRESS_UNRESOLVED_MESSAGE = `ご入力いただいた住所の位置を地図上で特定できませんでした。番地・建物名などを含む、より詳しいご住所でもう一度お試しください。ご不明な場合はメール（${CONTACT_EMAIL}）にてご連絡ください。`;

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
function addOneDay(dateStr) {
  return addDays(dateStr, 1);
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

// Separate from bookings.js's getDistanceKm() on purpose — that one feeds live pricing
// and is left untouched; this is only used to figure out how long the trip takes.
async function getDriveDurationMin(originAddress, destinationAddress) {
  const apiKey = process.env.GOOGLE_SERVER_MAPS_KEY;
  if (!apiKey || !originAddress || !destinationAddress) return null;
  const [pointA, pointB] = [originAddress, destinationAddress].sort();
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', pointA);
    url.searchParams.set('destinations', pointB);
    url.searchParams.set('units', 'metric');
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString());
    const data = await res.json();
    const element = data?.rows?.[0]?.elements?.[0];
    if (data?.status === 'OK' && element?.status === 'OK' && element.duration?.value != null) {
      return element.duration.value / 60; // seconds -> minutes
    }
    console.warn('Drive-duration lookup returned no usable result:', JSON.stringify(data));
  } catch (e) {
    console.warn('Drive-duration lookup failed:', e);
  }
  return null;
}

module.exports = async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const routeId = req.query.routeId || 'gc';

    // 'custom' needs both addresses AND a successful live drive-time lookup before we
    // can say anything about availability at all — fail closed rather than guess.
    let durationMin;
    if (routeId === 'custom') {
      const fromAddr = (req.query.fromCustomAddress || '').trim();
      const toAddr = (req.query.toAddress || '').trim();
      if (!fromAddr || !toAddr) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({ busyDates: [], slotsByDate: {}, addressStatus: 'incomplete' });
        return;
      }
      const oneWayMin = await getDriveDurationMin(fromAddr, toAddr);
      if (oneWayMin === null) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({ busyDates: [], slotsByDate: {}, addressStatus: 'unresolved', message: ADDRESS_UNRESOLVED_MESSAGE });
        return;
      }
      durationMin = Math.round(oneWayMin * 2) + CUSTOM_ROUTE_BUFFER_MIN;
    } else {
      durationMin = ROUTE_DURATION_MIN[routeId] || ROUTE_DURATION_MIN.gc;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Plain 'YYYY-MM-DD' strings first, pure Date.UTC arithmetic only (addDays) —
    // never round-tripping a TZ_OFFSET-based Date back through
    // toISOString().slice(0,10), since that silently shifts local midnight into
    // the previous UTC day (see surf-availability.js's identical fix — caught by
    // this file's own test before it shipped). rangeStart/rangeEnd below are ONLY
    // used as real instants (Google Calendar API bounds), never turned back into
    // a date string.
    const startParam = req.query.start;
    const endParam = req.query.end;
    const startDateStr = startParam || toDateOnly(today);
    const endDateStr = endParam || addDays(startDateStr, 180);
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

    const allDates = eachDateInRange(startDateStr, addOneDay(endDateStr));
    const busyDates = [];
    const slotsByDate = {};
    for (const dateStr of allDates) {
      if (new Date(`${dateStr}T23:59:59${TZ_OFFSET}`).getTime() < today.getTime()) continue;
      const slots = freeSlotsForDay(dateStr, durationMin, busyIntervals);
      if (slots.length === 0) {
        busyDates.push(dateStr);
      } else {
        slotsByDate[dateStr] = slots;
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ busyDates, slotsByDate, addressStatus: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
