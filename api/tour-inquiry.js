/**
 * POST /api/tour-inquiry
 *
 * Receives a guided-tour inquiry (街歩きツアー / E-バイクツアー / 車で巡る
 * バイロンベイ) from the tour booking forms embedded on /appointment-walking,
 * /appointment-ebike and /appointment-car, then — exactly like
 * surf-inquiry.js:
 *   1. Re-checks the requested date/time against the SHARED calendar (the
 *      availability endpoint's view may be stale by the time someone submits).
 *   2. Writes one real timed event onto BOOKINGS_CALENDAR_ID, so it shows up
 *      in Ryu's Google Calendar and blocks every other service's availability.
 *   3. Emails the owner (OWNER_EMAIL) a summary via Resend, with a signed
 *      confirm/decline link handled by api/confirm.js (service: 'tour').
 *
 * Tour/course names, durations, capacity and prices are defined HERE, not
 * taken from the client, so a tampered request can't change what lands in
 * the calendar or what the customer is later asked to pay. Keep the TOURS
 * table in sync with the tour pages in Framer and with tour-availability.js.
 *
 * Scheduling helpers are duplicated from surf-inquiry.js on purpose (see the
 * note there about shared modules breaking Vercel bundling in this project).
 *
 * Env vars required (all already set for Surf Guide):
 *   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, BOOKINGS_CALENDAR_ID (or SURF_CALENDAR_ID)
 *   RESEND_API_KEY, OWNER_EMAIL, BOOKING_TOKEN_SECRET, APP_URL
 */
const crypto = require('crypto');
const { google } = require('googleapis');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const BOOKING_TOKEN_SECRET = process.env.BOOKING_TOKEN_SECRET;
const APP_URL = process.env.APP_URL;
const CONTACT_EMAIL = 'jpgbyron@gmail.com'; // keep identical to the other files

// ---- tour catalogue (source of truth for labels / durations / prices) ----
// pricing.type: 'group' = flat price per booking, 'per_person' = × pax,
// null = no fixed online price (Ryu quotes after reviewing the request).
const TOURS = {
  walking: {
    label: '街歩きツアー',
    durationMin: 120,
    maxPax: 4,
    pricing: { type: 'group', jpy: 11200 },
    courses: {
      history: '歴史・雑学コース',
      market: 'マーケット探訪コース',
      cafe: 'カフェ・ショッピングコース',
    },
  },
  ebike: {
    label: 'E-バイクツアー',
    durationMin: 240,
    maxPax: 4,
    pricing: { type: 'per_person', jpy: 20000 },
    courses: {
      sunrise: 'サンライズコース',
      lighthouse: 'ライトハウスコース',
    },
  },
  car: {
    label: '車で巡るバイロンベイ',
    durationMin: 360,
    maxPax: 4,
    pricing: null,
    // The car tour has no fixed courses — the customer ticks the areas
    // they're interested in and finalises the route with the guide.
    areas: {
      mullumbimby: 'マラムビンビー',
      crystal_castle: 'クリスタルキャッスル',
      ballina: 'バリーナ',
      brunswick_heads: 'ブランズウィックヘッズ',
      lennox_head: 'レノックスヘッド',
      bangalow: 'バンガロー',
      broken_head: 'ブロークンヘッド',
    },
  },
};

function computeTourPriceJpy(tour, pax) {
  if (!tour.pricing) return null;
  return tour.pricing.type === 'per_person' ? tour.pricing.jpy * pax : tour.pricing.jpy;
}

// ---- shared scheduling model (see surf-availability.js) ----
const BOOKINGS_CALENDAR_ID = process.env.BOOKINGS_CALENDAR_ID || process.env.SURF_CALENDAR_ID;
const INTER_BOOKING_BUFFER_MIN = 30;
const DAY_START_MIN = 7 * 60;
const DAY_END_MIN = 19 * 60;
const TZ_OFFSET = '+10:00';
const DEFAULT_MIN_LEAD_TIME_DAYS = 2;
function getMinLeadTimeDays() {
  const raw = process.env.MIN_LEAD_TIME_DAYS;
  const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
  return Number.isNaN(parsed) ? DEFAULT_MIN_LEAD_TIME_DAYS : parsed;
}
function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + days * 24 * 60 * 60000);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
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

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function signToken(payload) {
  const base = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', BOOKING_TOKEN_SECRET).update(base).digest('base64url');
  return `${base}.${sig}`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const REF_PREFIX = { walking: 'WALK', ebike: 'EBIKE', car: 'CAR' };
function makeRef(tourKey) {
  return `${REF_PREFIX[tourKey]}-${Math.floor(100000 + Math.random() * 900000)}`;
}

function clean(s, max) {
  return String(s == null ? '' : s).trim().slice(0, max);
}

// Validates and normalises the raw request body. Returns {ok:true, inquiry}
// or {ok:false, status, error}.
function normaliseInquiry(body) {
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'Missing required fields' };
  const tourKey = body.tour;
  const tour = TOURS[tourKey];
  if (!tour) return { ok: false, status: 400, error: '不明なツアーです。ページを再読み込みしてください。' };

  const name = clean(body.name, 100);
  const email = clean(body.email, 200);
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, error: 'お名前とメールアドレスをご確認ください。' };
  }

  const date = clean(body.date, 10);
  const time = clean(body.time, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return { ok: false, status: 400, error: '日付と開始時間をお選びください。' };
  }
  const [hh, mm] = time.split(':').map(Number);
  const startMin = hh * 60 + mm;
  if (mm % 30 !== 0 || startMin < DAY_START_MIN || startMin + tour.durationMin > DAY_END_MIN) {
    return { ok: false, status: 400, error: 'ご指定の開始時間はお選びいただけません。' };
  }

  const pax = parseInt(body.pax, 10);
  if (!Number.isInteger(pax) || pax < 1 || pax > tour.maxPax) {
    return { ok: false, status: 400, error: `人数は1〜${tour.maxPax}名でお選びください。` };
  }

  let course = null;
  let courseLabel = '';
  let areas = [];
  if (tour.courses) {
    course = body.course;
    if (!tour.courses[course]) return { ok: false, status: 400, error: 'コースをお選びください。' };
    courseLabel = tour.courses[course];
  } else {
    areas = Array.isArray(body.areas) ? [...new Set(body.areas.filter(a => tour.areas[a]))] : [];
    courseLabel = areas.length ? areas.map(a => tour.areas[a]).join('・') : 'ガイドと相談して決める';
  }

  const meetingPlace = clean(body.meetingPlace, 300);
  if (tourKey === 'car' && !meetingPlace) {
    return { ok: false, status: 400, error: 'お迎え先（ホテル名・住所）をご入力ください。' };
  }

  return {
    ok: true,
    inquiry: {
      tourKey,
      tour,
      tourLabel: tour.label,
      course,
      areas,
      courseLabel,
      pax,
      date,
      time,
      startMin,
      name,
      email,
      phone: clean(body.phone, 50),
      meetingPlace,
      language: body.language === 'en' ? '英語' : '日本語',
      question: clean(body.question, 2000),
      priceJpy: computeTourPriceJpy(tour, pax),
    },
  };
}

function priceText(inq) {
  if (inq.priceJpy == null) return 'オーナー確認後にご案内';
  const yen = `¥${inq.priceJpy.toLocaleString('ja-JP')}`;
  if (inq.tour.pricing.type === 'per_person') return `${yen}（¥${inq.tour.pricing.jpy.toLocaleString('ja-JP')} × ${inq.pax}名）`;
  return `${yen}（1グループ）`;
}

function detailRows(inq, ref) {
  return [
    ['参照番号', ref],
    ['ツアー', inq.tourLabel],
    [inq.tour.courses ? 'コース' : '希望エリア', inq.courseLabel],
    ['人数', `${inq.pax}名`],
    ['希望日', inq.date],
    ['開始時間', `${inq.time}（約${inq.tour.durationMin / 60}時間）`],
    ['目安料金', priceText(inq)],
    [inq.tourKey === 'car' ? 'お迎え先' : '待ち合わせ希望', inq.meetingPlace || '—'],
    ['ガイド言語', inq.language],
    ['お名前', inq.name],
    ['メール', inq.email],
    ['電話', inq.phone || '—'],
    ['ご質問・ご要望', inq.question || '—'],
  ];
}

async function sendOwnerNotification(inq, ref, reviewUrl) {
  const rows = detailRows(inq, ref)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
    .join('');
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'バイロンベイ ツアーガイド <bookings@jpgbyron.com>',
      to: [OWNER_EMAIL],
      reply_to: inq.email,
      subject: `【${inq.tourLabel}新規お問い合わせ】${inq.courseLabel} — ${ref}`,
      html: `
        <h2>新しい${escapeHtml(inq.tourLabel)}のお問い合わせがありました</h2>
        <table cellpadding="6" style="border-collapse:collapse;">${rows}</table>
        <p>この予約希望日は Google カレンダーに自動登録されました。</p>
        <div style="margin:24px 0;">
          <a href="${reviewUrl}" style="display:inline-block;background:#16332F;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">内容を確認する（確定 / お断り）</a>
        </div>
        <p style="color:#888;font-size:12px;">上のボタンから内容をご確認のうえ、確定するか、お断りするかを選択してください。</p>
      `,
    }),
  });
  if (!resp.ok) console.error('Resend error (owner email):', await resp.text());
}

module.exports = async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const parsed = normaliseInquiry(req.body);
  if (!parsed.ok) {
    res.status(parsed.status).json({ error: parsed.error });
    return;
  }
  const inq = parsed.inquiry;

  // Minimum lead time — same rule as every other service.
  const minLeadDays = getMinLeadTimeDays();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (inq.date < addDays(toDateOnly(today), minLeadDays)) {
    res.status(400).json({ error: `恐れ入りますが、ご予約は${minLeadDays}日以上前までにお願いしております。別の日付をお選びください。` });
    return;
  }

  const ref = makeRef(inq.tourKey);

  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/calendar']
    );
    const calendar = google.calendar({ version: 'v3', auth });

    const startMs = slotStartDate(inq.date, inq.startMin).getTime();
    const endMs = startMs + inq.tour.durationMin * 60000;
    const busy = await fetchPaddedBusyIntervals(
      calendar,
      new Date(`${inq.date}T00:00:00${TZ_OFFSET}`),
      new Date(`${inq.date}T23:59:59${TZ_OFFSET}`)
    );
    if (overlapsAny(startMs, endMs, busy)) {
      res.status(409).json({ error: `${inq.date} ${inq.time} はご予約が重なっております。別の日時をお選びください。` });
      return;
    }

    const description = detailRows(inq, ref).map(([k, v]) => `${k}: ${v}`).join('\n');
    const inserted = await calendar.events.insert({
      calendarId: BOOKINGS_CALENDAR_ID,
      requestBody: {
        summary: `${inq.tourLabel}（${inq.courseLabel}）— ${inq.name} (${ref})`,
        description,
        start: { dateTime: new Date(startMs).toISOString() },
        end: { dateTime: new Date(endMs).toISOString() },
        extendedProperties: { private: { serviceType: 'tour', tour: inq.tourKey } },
      },
    });

    const token = signToken({
      service: 'tour',
      ref,
      ts: Date.now(),
      name: inq.name,
      email: inq.email,
      tour: inq.tourKey,
      activityLabel: `${inq.tourLabel}（${inq.courseLabel}）`,
      pax: inq.pax,
      priceJpy: inq.priceJpy,
      dateTimeLabel: `${inq.date} ${inq.time}`,
      eventIds: [inserted.data.id],
    });
    const reviewUrl = `${APP_URL}/api/confirm?token=${encodeURIComponent(token)}`;

    await sendOwnerNotification(inq, ref, reviewUrl);
    res.status(200).json({ ref });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '送信中にエラーが発生しました。時間をおいて再度お試しいただくか、メールにてご連絡ください。' });
  }
};

// Exported for tests.
module.exports.TOURS = TOURS;
module.exports.normaliseInquiry = normaliseInquiry;
