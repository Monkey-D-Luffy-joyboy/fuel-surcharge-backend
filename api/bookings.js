const crypto = require('crypto');

// Base fares and one-way distances per route. `custom` uses the Gold Coast figures as a
// default estimate until a real distance is calculated for arbitrary custom addresses.
const ROUTES = {
  gc: { base: 193.50, km: 132.4 },
  bne: { base: 526.68, km: 348 },
  custom: { base: 193.50, km: 132.4 },
};

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

// Recalculates the authoritative price server-side, rather than trusting whatever the
// browser sent — this keeps pricing accurate to live fuel costs and prevents tampering.
// Returns the breakdown too, so it can be shown transparently in the notification email.
async function calcAuthoritativePrice(booking) {
  const route = ROUTES[booking.routeId] || ROUTES.custom;
  const rawFuelPrice = await getRawFuelPrice();
  const offset = getFuelPriceOffset();
  const adjustedFuelPrice = rawFuelPrice + offset;

  const fuelCost = (route.km / 100) * 10 * adjustedFuelPrice;
  const base = route.base + fuelCost;
  const extraPax = Math.max(0, (booking.adults || 0) + (booking.children || 0) - 3) * 12;
  const extraBoard = (booking.boards || 0) * 15;
  const oneWay = base + extraPax + extraBoard;
  const total = booking.returnEnabled ? oneWay * 2 : oneWay;
  return {
    price: Math.round(total * 100) / 100,
    rawFuelPrice: Math.round(rawFuelPrice * 100) / 100,
    offset,
    adjustedFuelPrice: Math.round(adjustedFuelPrice * 100) / 100,
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const booking = req.body;

  if (!booking || !booking.name || !booking.email || !booking.date || !booking.time) {
    return res.status(400).json({ error: 'Missing required booking fields' });
  }

  const { price, rawFuelPrice, offset, adjustedFuelPrice } = await calcAuthoritativePrice(booking);
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
      <strong>Price (live fuel-adjusted):</strong> A$${price}
    </p>
    <p style="color:#888;font-size:12px;">
      Fuel calc — API city price: $${rawFuelPrice}/L, regional offset: +$${offset}/L, used: $${adjustedFuelPrice}/L.
      Adjust FUEL_PRICE_OFFSET in Vercel if this drifts from what you're actually paying.
    </p>
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
