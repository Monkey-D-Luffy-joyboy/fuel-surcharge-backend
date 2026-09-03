import crypto from 'crypto';
import Stripe from 'stripe';
import { google } from 'googleapis';

const SECRET = process.env.BOOKING_TOKEN_SECRET;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const RESEND_API_KEY = process.env.RESEND_API_KEY;

function verifyToken(token) {
  const [base, sig] = token.split('.');
  if (!base || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(base).digest('base64url');
  if (sig !== expected) return null;
  return JSON.parse(Buffer.from(base, 'base64url').toString());
}

async function createCalendarEvent(booking) {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/calendar']
  );
  const calendar = google.calendar({ version: 'v3', auth });

  // Adjust the +10:00 offset if your business operates outside AEST/Brisbane time.
  const start = new Date(`${booking.date}T${booking.time}:00+10:00`);
  const end = new Date(start.getTime() + 90 * 60000); // assumes ~90 min per transfer

  await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    requestBody: {
      summary: `Transfer — ${booking.name} (${booking.ref})`,
      description: [
        `Phone: ${booking.phone || '—'}`,
        `Flight: ${booking.flight || '—'}`,
        `Passengers: ${booking.adults} adults, ${booking.children} children`,
        `Luggage: ${booking.bags} bags, ${booking.boards} surfboards`,
        `Notes: ${booking.question || '—'}`,
      ].join('\n'),
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });
}

async function chargeCard(booking) {
  if (!booking.paymentMethodId) return null;
  return stripe.paymentIntents.create({
    amount: Math.round(booking.price * 100),
    currency: 'aud',
    payment_method: booking.paymentMethodId,
    confirm: true,
    off_session: true,
  });
}

async function sendClientConfirmation(booking) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'バイロンベイ送迎サービス <bookings@jpgbyron.com>',
      to: [booking.email],
      subject: `ご予約確定のお知らせ — ${booking.ref}`,
      html: `
        <p>${booking.name} 様</p>
        <p>ご予約が確定しましたのでお知らせいたします。</p>
        <p>
          日時：${booking.date} ${booking.time}<br/>
          ご予約番号：${booking.ref}
        </p>
        <p>当日はどうぞよろしくお願いいたします。</p>
      `,
    }),
  });
}

export default async function handler(req, res) {
  const token = req.query.token;
  const booking = token && verifyToken(token);

  if (!booking) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send('<h1>このリンクは無効です。</h1>');
  }

  try {
    await chargeCard(booking);
    await createCalendarEvent(booking);
    await sendClientConfirmation(booking);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
        <h1>✅ 予約 ${booking.ref} を確定しました</h1>
        <p>${booking.name} 様に確認メールを送信し、カレンダーに登録しました。</p>
      </body></html>
    `);
  } catch (err) {
    console.error(err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(`<h1>エラーが発生しました</h1><pre>${err.message}</pre>`);
  }
}
