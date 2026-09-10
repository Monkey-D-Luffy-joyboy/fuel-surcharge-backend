const crypto = require('crypto');

// Pricing logic (inlined directly — a separate shared _pricing.js file caused Vercel to
// fail with "Cannot find module" at runtime, so this is duplicated in api/quote.js too;
// if you change the pricing formula, update it in both places).

// Fixed routes: base fare + live fuel cost, no per-person surcharge.
const FIXED_ROUTES = {
  gc: { base: 193.50, km: 132.4 },
  bne: { base: 526.68, km: 348 },
};

// Custom route base fare: flat $115 covers the first 40km, then ~$3.00/km beyond that.
// Calibrated so it matches the dedicated Gold Coast ($193.50 base) and Brisbane ($526.68
// base) routes at their real one-way distances (66.4km and 178.1km respectively). Live
// fuel is added on top separately below, same as the fixed routes — this is no longer a
// static fuel-included number, so it stays accurate as fuel prices change.
const CUSTOM_FLAT_FEE = 115;
const CUSTOM_FLAT_RADIUS_KM = 40;
const CUSTOM_PER_KM_RATE = 3.00;

const FALLBACK_FUEL_PRICE = 2.39; // used only if the live lookup fails

// Byron Bay (regional, premium 95/98) runs well above the capital-city regular-unleaded
// figures this API reports. This offset bridges that gap — adjust it anytime in Vercel's
// environment variables (no redeploy needed) as local prices change. Starting estimate:
// ~$2.30/L locally (per PetrolSpy) vs ~$1.60–1.65/L regular unleaded in nearby capitals.
const DEFAULT_FUEL_PRICE_OFFSET = 0.65;

async function getRawFuelPrice() {
  const apiKey = process.env.COLLECTAPI_KEY;
  if (!apiKey) return FALLBACK_FUEL_PRICE;

  try {
    const apiRes = await fetch('https://api.collectapi.com/gasPrice/australiaGasoline', {
      headers: {
        authorization: `apikey ${apiKey}`,
        'content-type': 'application/json',
      },
    });
    const data = await apiRes.json();
    if (data?.success && Array.isArray(data.results)) {
      // Brisbane is used as the reference city for both Gold Coast and Brisbane routes,
      // since they're both in South-East Queensland.
      const brisbane = data.results.find((r) => r.city === 'Brisbane');
      if (brisbane?.gasoline) {
        const parsed = parseFloat(String(brisbane.gasoline).replace('$', ''));
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
  } catch (e) {
    console.warn('Fuel price fetch failed, using fallback rate.', e);
  }
  return FALLBACK_FUEL_PRICE;
}

function getFuelPriceOffset() {
  const raw = process.env.FUEL_PRICE_OFFSET;
  const parsed = raw !== undefined ? parseFloat(raw) : NaN;
  return Number.isNaN(parsed) ? DEFAULT_FUEL_PRICE_OFFSET : parsed;
}

/* ============================================================
   PHASE 1 — shared calendar, real time-blocks.
   ------------------------------------------------------------
   Ryu is a solo operator: every booking, Transport or Surf Guide, draws on
   the same person's time. Until now this endpoint had NO calendar
   integration at all — a booking request just emailed Ryu, with nothing
   stopping two conflicting jobs both being accepted. This adds: computing
   how long each leg of a booking actually occupies him, checking that
   against the SAME shared calendar surf-inquiry.js uses, and — if clear —
   writing a real timed hold event so Surf Guide (and any other future
   service) sees this time as taken too.

   These constants/helpers are duplicated in api/surf-inquiry.js and
   api/surf-availability.js rather than imported from a shared module — a
   shared _lib file previously made Vercel fail with "Cannot find module"
   at runtime in this project (see the pricing-logic comment above), so
   duplication here is deliberate. If you change a number, change it in
   all three files.

   NOTE: the actual "confirm & charge" step (api/confirm.js) is a separate,
   currently-broken piece of this system being rebuilt in Phase 2 — see
   the note near the bottom of this file. This phase only adds the
   calendar hold + conflict check; it doesn't touch payment.
   ============================================================ */
const { google } = require('googleapis');

const BOOKINGS_CALENDAR_ID = process.env.BOOKINGS_CALENDAR_ID || process.env.SURF_CALENDAR_ID;
const INTER_BOOKING_BUFFER_MIN = 30;
const TZ_OFFSET = '+10:00'; // Byron Bay / NSW — doesn't account for daylight saving (AEDT, Oct-Apr); flagged, not fixed, to stay consistent with the rest of this codebase.
// Each figure already bakes in the requested 1hr safety buffer for the
// round trip — this is the full block, not just drive time.
const ROUTE_DURATION_MIN = {
  gc: 180,   // ゴールドコースト空港送迎
  bne: 360,  // ブリスベン空港送迎
};
const CUSTOM_ROUTE_BUFFER_MIN = 60;
// Customers are mostly calling from Japan — directing them to phone Ryu means an
// expensive international call on their end, so every customer-facing "if this
// doesn't work, contact us" message points here instead. Duplicated across files
// per this project's convention; keep it identical everywhere if it ever changes.
const CONTACT_EMAIL = 'bookings@jpgbyron.com';
// Shown to the customer (and used by transport-availability.js, kept identical there)
// when a Custom Route address can't be resolved to a live drive time. Ryu asked for this
// to fail CLOSED rather than silently guessing a duration and pre-reserving his calendar
// against it — a wrong guess could hold time he doesn't need, or under-hold time he does.
const ADDRESS_UNRESOLVED_MESSAGE = `ご入力いただいた住所の位置を地図上で特定できませんでした。番地・建物名などを含む、より詳しいご住所でもう一度お試しください。ご不明な場合はメール（${CONTACT_EMAIL}）にてご連絡ください。`;

// Separate from getDistanceKm() below on purpose — that function feeds the
// live pricing calculation and is left untouched to avoid any risk of
// changing a customer-facing price; this one is only used for scheduling.
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

// Fixed routes (gc/bne) have no live lookup to fail, so this always succeeds for them.
// 'custom' depends entirely on resolving both addresses to a real Google Maps drive
// time — if that lookup can't return one, this now REJECTS the booking outright
// (ok:false) instead of falling back to a flat-rate guess, per Ryu's explicit request.
async function routeLegDurationMin(booking) {
  if (booking.routeId === 'custom') {
    const oneWayMin = await getDriveDurationMin(booking.fromCustomAddress, booking.toAddress);
    if (oneWayMin === null) {
      return { ok: false, reason: ADDRESS_UNRESOLVED_MESSAGE };
    }
    return { ok: true, durationMin: Math.round(oneWayMin * 2) + CUSTOM_ROUTE_BUFFER_MIN };
  }
  return { ok: true, durationMin: ROUTE_DURATION_MIN[booking.routeId] || ROUTE_DURATION_MIN.gc };
}

function overlapsAny(startMs, endMs, intervals) {
  return intervals.some(iv => startMs < iv.endMs && endMs > iv.startMs);
}

// Identical logic to surf-inquiry.js / surf-availability.js (duplicated
// per the note above) — every non-cancelled event in [rangeStart,
// rangeEnd) from the shared calendar, padded by the inter-booking buffer.
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

// Builds the outbound leg (always) and return leg (if requested), checks
// both against the CURRENT shared calendar, and returns either
// {ok:true, legs} or {ok:false, reason} — nothing is written to the
// calendar until both legs (when there are two) are confirmed clear.
async function buildTransportPlan(booking, durationMin) {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/calendar']
  );
  const calendar = google.calendar({ version: 'v3', auth });

  const legRequests = [{ date: booking.date, time: booking.time, label: 'outbound' }];
  if (booking.returnEnabled && booking.returnDate && booking.returnTime) {
    legRequests.push({ date: booking.returnDate, time: booking.returnTime, label: 'return' });
  }

  const dates = legRequests.map(l => l.date).sort();
  const rangeStart = new Date(`${dates[0]}T00:00:00${TZ_OFFSET}`);
  const rangeEnd = new Date(`${dates[dates.length - 1]}T23:59:59${TZ_OFFSET}`);
  const busyIntervals = await fetchPaddedBusyIntervals(calendar, rangeStart, rangeEnd);

  const legs = [];
  for (const leg of legRequests) {
    const startMs = new Date(`${leg.date}T${leg.time}:00${TZ_OFFSET}`).getTime();
    const endMs = startMs + durationMin * 60000;
    if (overlapsAny(startMs, endMs, busyIntervals)) {
      return { ok: false, reason: `${leg.date} ${leg.time} はご予約が重なっております。別の日時をお選びください。` };
    }
    legs.push({ startMs, endMs, label: leg.label });
  }

  return { ok: true, calendar, legs };
}

async function createHoldEvents(calendar, booking, ref, legs) {
  const summaryBase = `${booking.route || 'Transport'} — ${booking.name} (${ref})`;
  for (const leg of legs) {
    await calendar.events.insert({
      calendarId: BOOKINGS_CALENDAR_ID,
      requestBody: {
        summary: leg.label === 'return' ? `${summaryBase} [Return]` : summaryBase,
        description: `Transport booking ${ref} — ${booking.name} <${booking.email}>, ${booking.phone || 'no phone given'}.`,
        start: { dateTime: new Date(leg.startMs).toISOString() },
        end: { dateTime: new Date(leg.endMs).toISOString() },
        extendedProperties: { private: { service: 'transport', routeId: booking.routeId || 'gc', leg: leg.label } },
      },
    });
  }
}

async function getDistanceKm(originAddress, destinationAddress) {
  const apiKey = process.env.GOOGLE_SERVER_MAPS_KEY;
  if (!apiKey || !originAddress || !destinationAddress) return null;

  // Always query in a fixed alphabetical order, regardless of actual pickup/drop-off
  // direction, so A→B and B→A always return the identical distance (and therefore
  // identical price) — Google's routing can otherwise differ slightly by direction
  // (one-way streets, highway ramps, etc.).
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
    if (data?.status === 'OK' && element?.status === 'OK' && element.distance?.value != null) {
      return element.distance.value / 1000; // metres -> km
    }
    console.warn('Distance Matrix returned no usable result:', JSON.stringify(data));
  } catch (e) {
    console.warn('Distance Matrix request failed:', e);
  }
  return null;
}

// Computes price for a given booking (or partial booking, for a live estimate).
// booking needs: routeId, and for 'custom': fromCustomAddress + toAddress (optional —
// falls back to the flat 40km rate if not provided), and optionally returnEnabled.
async function calcPrice(booking) {
  let oneWay;
  let fuelInfo = null;
  let distanceInfo = null;

  if (booking.routeId === 'custom') {
    const distanceKm = await getDistanceKm(booking.fromCustomAddress, booking.toAddress);
    // If the distance lookup fails (missing key, bad/incomplete address, API error), fall
    // back to assuming the trip is within the flat 40km radius rather than guessing high.
    const usedDistanceKm = distanceKm ?? CUSTOM_FLAT_RADIUS_KM;
    const extraKm = Math.max(0, usedDistanceKm - CUSTOM_FLAT_RADIUS_KM);
    const base = CUSTOM_FLAT_FEE + extraKm * CUSTOM_PER_KM_RATE;

    const rawFuelPrice = await getRawFuelPrice();
    const offset = getFuelPriceOffset();
    const adjustedFuelPrice = rawFuelPrice + offset;
    // Fixed routes' "km" figures are round-trip distances (per the business's own cost
    // sheet), so double the one-way distance here to use the identical fuel formula
    // consistently across both custom and fixed routes.
    const roundTripKm = usedDistanceKm * 2;
    const fuelCost = (roundTripKm / 100) * 10 * adjustedFuelPrice;
    oneWay = base + fuelCost;

    fuelInfo = {
      rawFuelPrice: Math.round(rawFuelPrice * 100) / 100,
      offset,
      adjustedFuelPrice: Math.round(adjustedFuelPrice * 100) / 100,
    };
    distanceInfo = {
      distanceKm: Math.round(usedDistanceKm * 10) / 10,
      wasCalculated: distanceKm !== null,
    };
  } else {
    const route = FIXED_ROUTES[booking.routeId] || FIXED_ROUTES.gc;
    const rawFuelPrice = await getRawFuelPrice();
    const offset = getFuelPriceOffset();
    const adjustedFuelPrice = rawFuelPrice + offset;
    const fuelCost = (route.km / 100) * 10 * adjustedFuelPrice;
    oneWay = route.base + fuelCost;
    fuelInfo = {
      rawFuelPrice: Math.round(rawFuelPrice * 100) / 100,
      offset,
      adjustedFuelPrice: Math.round(adjustedFuelPrice * 100) / 100,
    };
  }

  const total = booking.returnEnabled ? oneWay * 2 : oneWay;
  return {
    price: Math.round(total * 100) / 100,
    fuelInfo, // null for custom route — no live fuel component in that formula
    distanceInfo, // null for fixed routes — only set for custom route
  };
}

const SECRET = process.env.BOOKING_TOKEN_SECRET;
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.APP_URL; // e.g. https://your-project.vercel.app

function signToken(payload) {
  const json = JSON.stringify(payload);
  const base = Buffer.from(json).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(base).digest('base64url');
  return `${base}.${sig}`;
}

module.exports = async function handler(req, res) {
  // Framer's embed runs your booking form inside a cross-origin iframe, so the browser
  // sends a CORS preflight (OPTIONS) before the real POST. Without these headers, the
  // browser blocks the request before it ever reaches this function.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const booking = req.body;

  if (!booking || !booking.name || !booking.email || !booking.date || !booking.time) {
    return res.status(400).json({ error: 'Missing required booking fields' });
  }

  // Custom Route's whole schedule hold depends on resolving both addresses to a live
  // drive time. Check this FIRST, before pricing or touching the calendar at all — an
  // unresolved address means we reject with a "please clarify" message rather than
  // pre-reserving Ryu's time against a guess (see routeLegDurationMin's comment).
  const durationResult = await routeLegDurationMin(booking);
  if (!durationResult.ok) {
    return res.status(400).json({ error: durationResult.reason });
  }
  const durationMin = durationResult.durationMin;

  const { price, fuelInfo, distanceInfo } = await calcPrice(booking);
  const ref = 'REF-' + Math.floor(100000 + Math.random() * 900000);

  // Phase 1: hold the actual time this booking needs on the shared
  // calendar, and reject outright if it conflicts with something already
  // there (any service, not just Transport). This is new — previously
  // nothing checked or blocked anything.
  const plan = await buildTransportPlan(booking, durationMin);
  if (!plan.ok) {
    return res.status(409).json({ error: plan.reason });
  }
  try {
    await createHoldEvents(plan.calendar, booking, ref, plan.legs);
  } catch (e) {
    console.error('Failed to write calendar hold:', e);
    return res.status(500).json({ error: 'Could not reserve this time on the calendar. Please try again.' });
  }

  // NOTE (Phase 2, not yet built): api/confirm.js — the "予約を確定して決済する"
  // step this email used to link to — is currently non-functional (it was
  // accidentally left as a duplicate of quote.js, so it never charged
  // anyone or sent a confirmation). Until that's rebuilt with a real Stripe
  // flow, this email intentionally does NOT promise an automatic charge —
  // the calendar hold above is what actually protects this time slot in
  // the meantime; follow up with the customer manually to arrange payment.
  // signToken/SECRET are kept (still computed below, just currently unused
  // in the email) since Phase 2's confirm link will need the same signing.
  void signToken({ ...booking, price, ref, ts: Date.now() });

  const emailBody = `
    <h2>New booking request — ${ref}</h2>
    <p>
      <strong>Name:</strong> ${booking.name}<br/>
      <strong>Email:</strong> ${booking.email}<br/>
      <strong>Phone:</strong> ${booking.phone || '—'}<br/>
      <strong>Route:</strong> ${booking.route || ''} ${booking.fromCustomAddress || ''} → ${booking.toAddress || ''}<br/>
      ${booking.stopRequested ? `<strong>Stop:</strong> ${booking.stopDetail || '—'}<br/>` : ''}
      <strong>Pickup:</strong> ${booking.date} ${booking.time}<br/>
      ${booking.returnEnabled ? `<strong>Return:</strong> ${booking.returnDate} ${booking.returnTime}<br/>` : ''}
      <strong>Passengers:</strong> ${booking.adults} adults, ${booking.children} children<br/>
      <strong>Luggage:</strong> ${booking.bags} bags, ${booking.boards} surfboards<br/>
      <strong>Flight number:</strong> ${booking.flight || '—'}<br/>
      <strong>Questions/requests:</strong> ${booking.question || '—'}<br/>
      <strong>料金：</strong> A$${price}
    </p>
    ${fuelInfo ? `
    <p style="color:#888;font-size:12px;">
      Fuel calc — API city price: $${fuelInfo.rawFuelPrice}/L, regional offset: +$${fuelInfo.offset}/L, used: $${fuelInfo.adjustedFuelPrice}/L.
      Adjust FUEL_PRICE_OFFSET in Vercel if this drifts from what you're actually paying.
    </p>` : ''}
    ${distanceInfo ? `
    <p style="color:#888;font-size:12px;">
      Distance calc — ${distanceInfo.wasCalculated ? `${distanceInfo.distanceKm}km (via Google Distance Matrix)` : `Could not calculate distance — assumed ${distanceInfo.distanceKm}km (flat rate). Check the address was specific enough, and that GOOGLE_SERVER_MAPS_KEY is set correctly.`}
    </p>` : ''}
    <p style="color:#16332F;font-weight:bold;">この時間はカレンダーに仮予約として登録されました（他の予約とは重複しません）。</p>
    <p style="color:#888;font-size:12px;">
      決済のご案内はまだ自動化されていません — お客様に直接ご連絡のうえ、お支払い方法をご案内ください。
      (Payment collection isn't automated yet — reach out to the customer directly to arrange it.)
    </p>
  `;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Bookings <bookings@jpgbyron.com>',
      to: [OWNER_EMAIL],
      subject: `New booking request — ${ref}`,
      html: emailBody,
    }),
  });

  if (!emailRes.ok) {
    console.error('Resend error:', await emailRes.text());
    return res.status(502).json({ error: 'Could not send notification email' });
  }

  return res.status(200).json({ ref, price });
}
