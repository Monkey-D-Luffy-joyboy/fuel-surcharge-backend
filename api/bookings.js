const crypto = require('crypto');

const { calcPrice } = require('./_pricing');
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

  const { price, fuelInfo, distanceInfo } = await calcPrice(booking);
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
