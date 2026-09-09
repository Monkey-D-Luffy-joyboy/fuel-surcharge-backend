/**
 * POST /api/surf-inquiry
 *
 * Receives a Surf Guide inquiry from surf-guide-flow.html, then:
 *   1. Writes one Google Calendar event PER REQUESTED DATE onto the
 *      dedicated Surf Guide calendar (SURF_CALENDAR_ID), so the owner
 *      (jpgbyron@gmail.com) sees every new inquiry appear in Google
 *      Calendar immediately — this is what makes those dates read as
 *      "unavailable" the next time surf-availability.js is queried.
 *   2. Emails the owner (OWNER_EMAIL) a summary via Resend, same pattern
 *      as bookings.js uses for Transport.
 *
 * There is no confirm/charge step here (unlike Transport's bookings.js →
 * confirm.js flow) — Surf Guide is inquiry-based with no Stripe charge
 * gating it, so the event is written and the email sent directly on
 * submission. (The separate "レンタルサーフボード" Stripe Payment Link,
 * when set up, is independent of this endpoint.)
 *
 * Env vars required:
 *   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, SURF_CALENDAR_ID  (calendar)
 *   RESEND_API_KEY, OWNER_EMAIL                                (email)
 */
const { google } = require('googleapis');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const TZ_OFFSET = '+10:00'; // see note in surf-availability.js re: NSW daylight saving

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function makeRef() {
  return 'SURF-' + Math.floor(100000 + Math.random() * 900000);
}

function rentalText(inquiry) {
  if (!inquiry.rentalRequested || !inquiry.rental) return 'なし';
  const r = inquiry.rental;
  const items = [];
  if (r.wetsuit) items.push(`ウェットスーツ（${r.wetsuitSize || 'サイズ未選択'}）`);
  if (r.board) items.push(`サーフボード（${r.boardType || 'タイプ未選択'}）`);
  if (r.bodyboard) items.push('ボディボード');
  if (r.snorkel) items.push('シュノーケルセット');
  return items.length ? items.join('、') : '希望（詳細未選択）';
}

async function createCalendarEvents(inquiry, ref) {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/calendar']
  );
  const calendar = google.calendar({ version: 'v3', auth });

  const description = [
    `参照番号: ${ref}`,
    `人数: ${inquiry.pax || '—'}名`,
    `ピックアップ: ${inquiry.pickup === 'yes' ? `有り（${inquiry.pickupAddress || '住所未入力'}）` : '無し'}`,
    `スキルレベル: ${inquiry.skillLabel || '—'}`,
    `レンタル: ${rentalText(inquiry)}`,
    `電話: ${inquiry.phone || '—'}`,
    `メール: ${inquiry.email || '—'}`,
    `質問・要望: ${inquiry.question || '—'}`,
  ].join('\n');

  for (const date of inquiry.dates) {
    const start = new Date(`${date}T${inquiry.time}:00${TZ_OFFSET}`);
    const end = new Date(start.getTime() + 3 * 60 * 60000); // assume ~3hr session

    await calendar.events.insert({
      calendarId: process.env.SURF_CALENDAR_ID,
      requestBody: {
        summary: `${inquiry.activityLabel || 'サーフガイド'} — ${inquiry.name} (${ref})`,
        description,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      },
    });
  }
}

async function sendOwnerNotification(inquiry, ref) {
  const dateList = inquiry.dates.join('、');
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'バイロンベイ サーフガイド <bookings@jpgbyron.com>',
      to: [OWNER_EMAIL],
      subject: `【サーフガイド新規お問い合わせ】${inquiry.activityLabel || ''} — ${ref}`,
      html: `
        <h2>新しいサーフガイドのお問い合わせがありました</h2>
        <p><strong>参照番号:</strong> ${ref}</p>
        <table cellpadding="6" style="border-collapse:collapse;">
          <tr><td>アクティビティ</td><td>${inquiry.activityLabel || '—'}</td></tr>
          <tr><td>目安料金</td><td>${inquiry.priceJpy || '—'}</td></tr>
          <tr><td>人数</td><td>${inquiry.pax || '—'}名</td></tr>
          <tr><td>ピックアップ</td><td>${inquiry.pickup === 'yes' ? `有り（${inquiry.pickupAddress || '住所未入力'}）` : '無し'}</td></tr>
          <tr><td>スキルレベル</td><td>${inquiry.skillLabel || '—'}</td></tr>
          <tr><td>レンタル</td><td>${rentalText(inquiry)}</td></tr>
          <tr><td>希望日</td><td>${dateList}</td></tr>
          <tr><td>開始時間</td><td>${inquiry.time || '—'}</td></tr>
          <tr><td>お名前</td><td>${inquiry.name}</td></tr>
          <tr><td>メール</td><td>${inquiry.email}</td></tr>
          <tr><td>電話</td><td>${inquiry.phone || '—'}</td></tr>
          <tr><td>ご質問・ご要望</td><td>${inquiry.question || '—'}</td></tr>
        </table>
        <p>この予約希望日は Google カレンダー（Surf Guide）に自動登録されました。</p>
      `,
    }),
  });
}

module.exports = async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const inquiry = req.body;

  if (!inquiry || !inquiry.name || !inquiry.email || !Array.isArray(inquiry.dates) || inquiry.dates.length === 0 || !inquiry.time) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const ref = makeRef();

  try {
    await createCalendarEvents(inquiry, ref);
    await sendOwnerNotification(inquiry, ref);
    res.status(200).json({ ref });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
