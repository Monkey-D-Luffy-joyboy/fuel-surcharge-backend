const crypto = require('crypto');

// Base fares and one-way distances per route. `custom` uses the Gold Coast figures as a
// default estimate until a real distance is calculated for arbitrary custom addresses.
// Fixed routes: base fare + live fuel cost, no per-person surcharge.
const FIXED_ROUTES = {
  gc: { base: 193.50, km: 132.4 },
  bne: { base: 526.68, km: 348 },
};

// Custom route: flat $100 covers the first 40km (fuel already included in that flat rate),
// then $2.50/km for every km beyond that. No separate live-fuel-price component here.
const CUSTOM_FLAT_FEE = 1;
const CUSTOM_FLAT_RADIUS_KM = 40;
const CUSTOM_PER_KM_RATE = 2.50;

const FALLBACK_FUEL_PRICE = 2.39; // used only if the live lookup fails

// Byron Bay (regional, premium 95/98) runs well above the capital-city regular-unleaded
// figures this API reports. This offset bridges that gap — adjust it anytime in Vercel's
// environment variables (no redeploy needed) as local prices change. Starting estimate:
// ~$2.30/L locally (per PetrolSpy) vs ~$1.60–1.65/L regular unleaded in nearby capitals.
const DEFAULT_FUEL_PRICE_OFFSET = 0.85;

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

async function getDistanceKm(originAddress, destinationAddress) {
  const apiKey = process.env.GOOGLE_SERVER_MAPS_KEY;
  if (!apiKey || !originAddress || !destinationAddress) return null;

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', originAddress);
    url.searchParams.set('destinations', destinationAddress);
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

// Recalculates the authoritative price server-side, rather than trusting whatever the
// browser sent — this keeps pricing accurate to live fuel costs and prevents tampering.
// Returns the breakdown too, so it can be shown transparently in the notification email.
async function calcAuthoritativePrice(booking) {
  const extraBoard = (booking.boards || 0) * 15;
  let oneWay;
  let fuelInfo = null;
  let distanceInfo = null;

  if (booking.routeId === 'custom') {
    const distanceKm = await getDistanceKm(booking.fromCustomAddress, booking.toAddress);
    // If the distance lookup fails (missing key, bad address, API error), fall back to
    // assuming the trip is within the flat 40km radius rather than guessing high.
    const usedDistanceKm = distanceKm ?? CUSTOM_FLAT_RADIUS_KM;
    const extraKm = Math.max(0, usedDistanceKm - CUSTOM_FLAT_RADIUS_KM);
    const base = CUSTOM_FLAT_FEE + extraKm * CUSTOM_PER_KM_RATE;
    oneWay = base + extraBoard;
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
    const base = route.base + fuelCost;
    oneWay = base + extraBoard;
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

  const { price, fuelInfo, distanceInfo } = await calcAuthoritativePrice(booking);
  const ref = 'REF-' + Math.floor(100000 + Math.random() * 900000);
  const token = signToken({ ...booking, price, ref, ts: Date.now() });
  const confirmUrl = `${APP_URL}/api/confirm?token=${encodeURIComponent(token)}`;

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
      <strong>Price:</strong> A$${price}
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
    <p>
      <a href="${confirmUrl}" style="background:#16332F;color:#fff;padding:12px 22px;border-radius:24px;text-decoration:none;display:inline-block;">
        Confirm &amp; charge this booking
      </a>
    </p>
    <p style="color:#888;font-size:12px;">This link charges the client's card for A$${price}, creates the calendar event, and emails their confirmation — all in one click.</p>
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
