/**
 * POST /api/surf-inquiry
 *
 * Receives a Surf Guide inquiry from surf-guide-flow.html, then:
 *   1. Re-validates every requested date/time against the SHARED calendar
 *      (see the scheduling-model note below) — the availability endpoint's
 *      view can be a few seconds to minutes stale by the time someone
 *      submits, so this is the authoritative check, not just a courtesy.
 *   2. Writes real timed calendar event(s) — not whole-day blocks — onto
 *      BOOKINGS_CALENDAR_ID, so the owner sees every new inquiry appear in
 *      Google Calendar immediately, and so it counts against every other
 *      service's (Transport included) availability too.
 *   3. Emails the owner (OWNER_EMAIL) a summary via Resend, same pattern
 *      as bookings.js uses for Transport.
 *
 *   4. Signs a Phase 2 confirm/decline token (same shared design as
 *      bookings.js's) and includes a review link in the owner email —
 *      clicking it lets Ryu confirm (which, for the four priced
 *      activities, auto-emails the customer the matching Stripe Payment
 *      Link) or decline (frees the calendar hold) the inquiry. See
 *      api/confirm.js for the full flow.
 *
 * ============================================================
 * PHASE 1 REWRITE — shared calendar, real time-blocks.
 * ------------------------------------------------------------
 * See the matching header comment in surf-availability.js for the full
 * rationale. Scheduling constants/helpers below are duplicated there and
 * in bookings.js rather than imported from a shared module (a shared _lib
 * file previously broke Vercel's bundling in this project) — if you
 * change a number here, change it in both other files too.
 *
 * Env vars required:
 *   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, BOOKINGS_CALENDAR_ID (or the
 *     legacy SURF_CALENDAR_ID, used as a fallback)
 *   GOOGLE_SERVER_MAPS_KEY   (rental delivery-radius check — already set
 *     for Transport's Custom Route pricing, reused here)
 *   RESEND_API_KEY, OWNER_EMAIL
 *   BOOKING_TOKEN_SECRET, APP_URL   (Phase 2 — same as bookings.js, needed
 *     to sign/link the confirm/decline token)
 */
const crypto = require('crypto');
const { google } = require('googleapis');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const OWNER_EMAIL = process.env.OWNER_EMAIL;
// Phase 2: same signing secret/URL as bookings.js — both feed the same
// api/confirm.js endpoint. See that file's header comment for the full design.
const BOOKING_TOKEN_SECRET = process.env.BOOKING_TOKEN_SECRET;
const APP_URL = process.env.APP_URL;
function signToken(payload) {
  const json = JSON.stringify(payload);
  const base = Buffer.from(json).toString('base64url');
  const sig = crypto.createHmac('sha256', BOOKING_TOKEN_SECRET).update(base).digest('base64url');
  return `${base}.${sig}`;
}
// サーフフォト／サーフィンビデオは時間制（¥5,000/時間）、それ以外は固定額 —
// Payment Link 1本あたりの数量指示（confirm.js が客へのメールに書く「数量を◯に」）
// を出すために、クライアントが送ってきた priceJpy 表示文字列は信用せず、
// ここで独自に金額を計算しておく。半日/2セッションは pax に依存しない固定額。
const SURF_PRICE_JPY = { half_day: 15000, two_session: 30000, photo: 5000, video: 5000 };
function computeSurfPriceJpy(inquiry) {
  const base = SURF_PRICE_JPY[inquiry.activity];
  if (base === undefined) return null; // beginner_guide / rental_board — no fixed online price today
  if (inquiry.activity === 'photo' || inquiry.activity === 'video') {
    const mins = parseInt(inquiry.pax, 10);
    if (!VALID_PHOTO_VIDEO_DURATIONS.includes(mins)) return null;
    return Math.round(base * (mins / 60));
  }
  return base;
}
const TZ_OFFSET = '+10:00'; // see note in surf-availability.js re: NSW daylight saving
// Customers are mostly calling from Japan — directing them to phone Ryu means an
// expensive international call on their end, so every customer-facing "if this
// doesn't work, contact us" message points here instead. Duplicated across files
// per this project's convention; keep it identical everywhere if it ever changes.
const CONTACT_EMAIL = 'bookings@jpgbyron.com';

// ---- shared scheduling model (see surf-availability.js) ----
const BOOKINGS_CALENDAR_ID = process.env.BOOKINGS_CALENDAR_ID || process.env.SURF_CALENDAR_ID;
const INTER_BOOKING_BUFFER_MIN = 30;
const ACTIVITY_DURATION_MIN = {
  half_day: 180,
  two_session: 360,
  beginner_guide: 180,
};
const VALID_PHOTO_VIDEO_DURATIONS = [60, 120, 180];
const RENTAL_DROPOFF_PICKUP_MIN = 60;
const RENTAL_SERVICE_RADIUS_KM = 20;
const RENTAL_BASE_ADDRESS = 'Byron Bay NSW, Australia';
// Same-day rental: if pickup isn't possible at this default evening time
// (or after it), the nearest earlier free slot that day is used instead —
// see pickCollectionTime() below.
const RENTAL_DEFAULT_COLLECTION_MIN = 17 * 60; // 17:00

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function makeRef() {
  return 'SURF-' + Math.floor(100000 + Math.random() * 900000);
}

function overlapsAny(startMs, endMs, intervals) {
  return intervals.some(iv => startMs < iv.endMs && endMs > iv.startMs);
}

// Fetches every non-cancelled event in [rangeStart, rangeEnd) from the
// shared calendar and returns busy intervals as {startMs, endMs}, each
// already padded by INTER_BOOKING_BUFFER_MIN on both sides — identical
// logic to surf-availability.js (duplicated per the file-header note).
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

function slotStartDate(dateStr, minutesFromMidnight) {
  const hh = String(Math.floor(minutesFromMidnight / 60)).padStart(2, '0');
  const mm = String(minutesFromMidnight % 60).padStart(2, '0');
  return new Date(`${dateStr}T${hh}:${mm}:00${TZ_OFFSET}`);
}
function minutesFromTimeStr(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Plain calendar-date arithmetic (Date.UTC as an inert integer anchor, no
// timezone offset involved) — used for all-day event end.date fields,
// which are bare date strings with no timezone attached. Routing this
// through TZ_OFFSET/toISOString the way event dateTimes are built
// elsewhere in this file produced an off-by-one (see eachDateInRange's
// history in surf-availability.js for the same class of bug).
function addOneDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + 24 * 60 * 60000);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

// Picks a collection (pickup) time on `dateStr`: the default evening slot
// if it's free, otherwise the latest free RENTAL_DROPOFF_PICKUP_MIN slot
// that day at/after 07:00, so a same-day rental still gets a real,
// non-conflicting pickup time rather than failing outright. Returns null
// if literally nothing fits that day. Callers pass in whatever busy
// intervals should count for this check — e.g. buildPlan() adds the same
// day's delivery block explicitly for a one-day rental.
function pickCollectionTime(dateStr, busyIntervals) {
  const tryMin = (mins) => {
    const startMs = slotStartDate(dateStr, mins).getTime();
    const endMs = startMs + RENTAL_DROPOFF_PICKUP_MIN * 60000;
    return !overlapsAny(startMs, endMs, busyIntervals) ? { startMs, endMs, mins } : null;
  };
  const preferred = tryMin(RENTAL_DEFAULT_COLLECTION_MIN);
  if (preferred) return preferred;
  // Walk backwards from the default time in 30-min steps looking for a fit,
  // down to 07:00.
  for (let mins = RENTAL_DEFAULT_COLLECTION_MIN - 30; mins >= 7 * 60; mins -= 30) {
    const hit = tryMin(mins);
    if (hit) return hit;
  }
  // Then forwards from the default time up to 19:00.
  for (let mins = RENTAL_DEFAULT_COLLECTION_MIN + 30; mins + RENTAL_DROPOFF_PICKUP_MIN <= 19 * 60; mins += 30) {
    const hit = tryMin(mins);
    if (hit) return hit;
  }
  return null;
}

// Straight-line fallback aside, this uses the same Google Distance Matrix
// API Transport's Custom Route pricing already calls (GOOGLE_SERVER_MAPS_KEY),
// so no new credentials are needed. Unlike the availability calendar (which
// fails OPEN if a lookup breaks), this fails CLOSED — if we can't verify an
// address is within range, we don't want to promise a delivery there.
async function distanceFromBaseKm(address) {
  const apiKey = process.env.GOOGLE_SERVER_MAPS_KEY;
  if (!apiKey || !address) return null;
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', RENTAL_BASE_ADDRESS);
    url.searchParams.set('destinations', address);
    url.searchParams.set('units', 'metric');
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString());
    const data = await res.json();
    const element = data?.rows?.[0]?.elements?.[0];
    if (data?.status === 'OK' && element?.status === 'OK' && element.distance?.value != null) {
      return element.distance.value / 1000;
    }
    console.warn('Rental distance check returned no usable result:', JSON.stringify(data));
  } catch (e) {
    console.warn('Rental distance check request failed:', e);
  }
  return null;
}

const BOARD_TYPE_LABELS_JA = { short: 'ショート', long: 'ロング', soft: 'ソフトボード' };

function countsToText(counts, labelFor) {
  if (!counts) return '';
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${labelFor ? labelFor(k) : k}×${v}`)
    .join('・');
}

function rentalText(inquiry) {
  if (!inquiry.rentalRequested || !inquiry.rental) return 'なし';
  const r = inquiry.rental;
  const items = [];
  const hasQuantities = ['wetsuitQty', 'boardQty', 'bodyboardQty', 'snorkelQty'].some(k => typeof r[k] === 'number');
  if (hasQuantities) {
    if (r.wetsuitQty > 0) {
      const sizes = countsToText(r.wetsuitSizeCounts);
      items.push(`ウェットスーツ ×${r.wetsuitQty}（${sizes || 'サイズ未選択'}）`);
    }
    if (r.boardQty > 0) {
      const types = countsToText(r.boardTypeCounts, k => BOARD_TYPE_LABELS_JA[k] || k);
      items.push(`サーフボード ×${r.boardQty}（${types || 'タイプ未選択'}）`);
    }
    if (r.bodyboardQty > 0) items.push(`ボディボード ×${r.bodyboardQty}`);
    if (r.snorkelQty > 0) items.push(`シュノーケルセット ×${r.snorkelQty}`);
  } else {
    if (r.wetsuit) items.push(`ウェットスーツ（${r.wetsuitSize || 'サイズ未選択'}）`);
    if (r.board) items.push(`サーフボード（${r.boardType || 'タイプ未選択'}）`);
    if (r.bodyboard) items.push('ボディボード');
    if (r.snorkel) items.push('シュノーケルセット');
  }
  return items.length ? items.join('、') : '希望（詳細未選択）';
}

// Pre-validates every timed block this inquiry would need against the
// CURRENT shared calendar, returning either {ok:true, plan} or
// {ok:false, reason} — nothing is written to the calendar until every
// block in the plan is confirmed clear, so a multi-date request can't
// partially succeed and then fail halfway through.
async function buildPlan(calendar, inquiry) {
  const isRental = inquiry.activity === 'rental_board';
  const boardCount = Math.max(1, Math.min(6, parseInt(inquiry.pax, 10) || 1));

  let durationMin;
  if (inquiry.activity === 'photo' || inquiry.activity === 'video') {
    const requested = parseInt(inquiry.pax, 10);
    if (!VALID_PHOTO_VIDEO_DURATIONS.includes(requested)) {
      return { ok: false, reason: '撮影時間の指定が正しくありません。ページを再読み込みしてもう一度お試しください。' };
    }
    durationMin = requested;
  } else if (!isRental) {
    durationMin = ACTIVITY_DURATION_MIN[inquiry.activity] || 180;
  }

  // Look a little wider than the requested dates so pickCollectionTime()
  // can see same-day context correctly.
  const allDates = inquiry.dates.slice().sort();
  const rangeStart = new Date(`${allDates[0]}T00:00:00${TZ_OFFSET}`);
  const rangeEnd = new Date(`${allDates[allDates.length - 1]}T23:59:59${TZ_OFFSET}`);
  const busyIntervals = await fetchPaddedBusyIntervals(calendar, rangeStart, rangeEnd);

  const blocks = []; // { startMs, endMs, summarySuffix, extendedProperties }

  if (isRental) {
    if (inquiry.pickup === 'yes') {
      const km = await distanceFromBaseKm(inquiry.pickupAddress);
      if (km === null) {
        return { ok: false, reason: `ご指定の配達先住所を確認できませんでした。住所をご確認のうえ再度お試しいただくか、メール（${CONTACT_EMAIL}）にてご連絡ください。` };
      }
      if (km > RENTAL_SERVICE_RADIUS_KM) {
        return { ok: false, reason: `大変申し訳ございませんが、配達サービスはバイロンベイから${RENTAL_SERVICE_RADIUS_KM}km圏内（バイロンベイ／バランガリー／レノックスヘッド周辺）に限らせていただいております。ご希望の場合はメール（${CONTACT_EMAIL}）にてご相談ください。` };
      }
    }

    const first = allDates[0];
    const last = allDates[allDates.length - 1];

    // Delivery: use the customer's chosen start time on the first day.
    const deliveryStartMs = slotStartDate(first, minutesFromTimeStr(inquiry.time)).getTime();
    const deliveryEndMs = deliveryStartMs + RENTAL_DROPOFF_PICKUP_MIN * 60000;
    if (overlapsAny(deliveryStartMs, deliveryEndMs, busyIntervals)) {
      return { ok: false, reason: 'ご指定の受け渡し日時は既にご予約が入っております。別の日時をお選びください。' };
    }
    blocks.push({
      startMs: deliveryStartMs, endMs: deliveryEndMs,
      summarySuffix: '（受け渡し）',
      extendedProperties: { private: { surfType: 'rental', boardCount: String(boardCount), blockType: 'delivery' } },
    });

    // Collection: same day as delivery, or the last day of a multi-day
    // rental — either way computed independently via pickCollectionTime(),
    // which also accounts for the delivery block itself if it's the same day.
    const busyForCollection = first === last
      ? busyIntervals.concat([{ startMs: deliveryStartMs - INTER_BOOKING_BUFFER_MIN * 60000, endMs: deliveryEndMs + INTER_BOOKING_BUFFER_MIN * 60000 }])
      : busyIntervals;
    const collection = pickCollectionTime(last, busyForCollection);
    if (!collection) {
      return { ok: false, reason: `ご希望の返却日はすでにご予約でいっぱいです。別の日程をお選びいただくか、メール（${CONTACT_EMAIL}）にてご相談ください。` };
    }
    blocks.push({
      startMs: collection.startMs, endMs: collection.endMs,
      summarySuffix: '（返却）',
      extendedProperties: { private: { surfType: 'rental', boardCount: String(boardCount), blockType: 'pickup' } },
    });

    // Per-day inventory events (unchanged concept — one per day the boards
    // are out, used only for the 6-board cap, not for time-blocking).
    // Re-check the cap here server-side (previously only enforced client-side).
    const inventoryDates = [];
    let cursor = first;
    while (cursor <= last) {
      inventoryDates.push(cursor);
      cursor = addOneDay(cursor);
    }
    // NOTE: existing per-day board counts aren't re-derived here (that's
    // surf-availability.js's job); this just guards against the obvious
    // case of a request whose own quantity already exceeds the cap.
    if (boardCount > 6) {
      return { ok: false, reason: '在庫数の都合上、1回のご注文につき最大6枚までとなります。' };
    }

    return { ok: true, isRental: true, boardCount, inventoryDates, blocks };
  }

  // Non-rental: one block per requested date, all at the same time-of-day.
  for (const date of allDates) {
    const startMs = slotStartDate(date, minutesFromTimeStr(inquiry.time)).getTime();
    const endMs = startMs + durationMin * 60000;
    if (overlapsAny(startMs, endMs, busyIntervals)) {
      return { ok: false, reason: `${date} ${inquiry.time} はご予約が重なっております。別の日時をお選びください。` };
    }
    blocks.push({
      startMs, endMs, summarySuffix: '',
      extendedProperties: { private: { surfType: 'guide' } },
    });
  }

  return { ok: true, isRental: false, blocks };
}

// Returns every inserted event's ID — Phase 2's confirm/decline flow
// (api/confirm.js) needs the full set (time-blocks AND, for rentals, the
// inventory-day events) so a decline fully frees everything this inquiry
// reserved, not just the customer-facing time slots.
async function createCalendarEvents(calendar, inquiry, ref, plan) {
  const secondaryLine = inquiry.secondaryFieldLabel
    ? `${inquiry.secondaryFieldLabel}: ${inquiry.secondaryFieldValueLabel || inquiry.pax || '—'}`
    : `人数: ${inquiry.pax || '—'}名`;

  const description = [
    `参照番号: ${ref}`,
    secondaryLine,
    `ピックアップ: ${inquiry.pickup === 'yes' ? `有り（${inquiry.pickupAddress || '住所未入力'}）` : '無し'}`,
    `スキルレベル: ${inquiry.skillLabel || '—'}`,
    `レンタル: ${rentalText(inquiry)}`,
    inquiry.rentalAddonJpy ? `レンタル料金: ¥${Number(inquiry.rentalAddonJpy).toLocaleString('ja-JP')}` : null,
    `電話: ${inquiry.phone || '—'}`,
    `メール: ${inquiry.email || '—'}`,
    `質問・要望: ${inquiry.question || '—'}`,
  ].filter(Boolean).join('\n');

  const eventIds = [];

  for (const block of plan.blocks) {
    const inserted = await calendar.events.insert({
      calendarId: BOOKINGS_CALENDAR_ID,
      requestBody: {
        summary: `${inquiry.activityLabel || 'サーフガイド'}${block.summarySuffix} — ${inquiry.name} (${ref})`,
        description,
        start: { dateTime: new Date(block.startMs).toISOString() },
        end: { dateTime: new Date(block.endMs).toISOString() },
        extendedProperties: block.extendedProperties,
      },
    });
    eventIds.push(inserted.data.id);
  }

  // Rental inventory-day events — kept separate from the delivery/pickup
  // time-blocks above so surf-availability.js's board-count logic (which
  // ignores anything with a blockType tag) stays simple.
  if (plan.isRental) {
    for (const date of plan.inventoryDates) {
      const inserted = await calendar.events.insert({
        calendarId: BOOKINGS_CALENDAR_ID,
        requestBody: {
          summary: `レンタルサーフボード在庫 — ${inquiry.name} (${ref})`,
          description,
          start: { date },
          end: { date: addOneDay(date) },
          extendedProperties: { private: { surfType: 'rental', boardCount: String(plan.boardCount) } },
        },
      });
      eventIds.push(inserted.data.id);
    }
  }

  return eventIds;
}

async function sendOwnerNotification(inquiry, ref, reviewUrl) {
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
          <tr><td>${inquiry.secondaryFieldLabel || '人数'}</td><td>${inquiry.secondaryFieldValueLabel || (inquiry.pax ? inquiry.pax + '名' : '—')}</td></tr>
          <tr><td>ピックアップ</td><td>${inquiry.pickup === 'yes' ? `有り（${inquiry.pickupAddress || '住所未入力'}）` : '無し'}</td></tr>
          <tr><td>スキルレベル</td><td>${inquiry.skillLabel || '—'}</td></tr>
          <tr><td>レンタル</td><td>${rentalText(inquiry)}</td></tr>
          ${inquiry.rentalAddonJpy ? `<tr><td>レンタル料金</td><td>¥${Number(inquiry.rentalAddonJpy).toLocaleString('ja-JP')}</td></tr>` : ''}
          <tr><td>希望日</td><td>${dateList}</td></tr>
          <tr><td>開始時間</td><td>${inquiry.time || '—'}</td></tr>
          <tr><td>お名前</td><td>${inquiry.name}</td></tr>
          <tr><td>メール</td><td>${inquiry.email}</td></tr>
          <tr><td>電話</td><td>${inquiry.phone || '—'}</td></tr>
          <tr><td>ご質問・ご要望</td><td>${inquiry.question || '—'}</td></tr>
        </table>
        <p>この予約希望日は Google カレンダーに自動登録されました。</p>
        <div style="margin:24px 0;">
          <a href="${reviewUrl}" style="display:inline-block;background:#16332F;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">内容を確認する（確定 / お断り）</a>
        </div>
        <p style="color:#888;font-size:12px;">
          上のボタンから内容をご確認のうえ、確定するか、お断りするかを選択してください。
        </p>
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
    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/calendar']
    );
    const calendar = google.calendar({ version: 'v3', auth });

    const plan = await buildPlan(calendar, inquiry);
    if (!plan.ok) {
      res.status(409).json({ error: plan.reason });
      return;
    }

    const eventIds = await createCalendarEvents(calendar, inquiry, ref, plan);

    // Phase 2: signed payload for api/confirm.js — same shape/secret as
    // bookings.js's token, branched there by `service`. No paymentMethodId
    // here (Surf Guide never collects a card); confirming instead looks up
    // and emails one of Ryu's hand-made Stripe Payment Links, matched by
    // `activity` (see PAYMENT_LINK_* env vars documented in confirm.js).
    const token = signToken({
      service: 'surf',
      ref,
      ts: Date.now(),
      name: inquiry.name,
      email: inquiry.email,
      activity: inquiry.activity,
      activityLabel: inquiry.activityLabel || '',
      durationMin: (inquiry.activity === 'photo' || inquiry.activity === 'video') ? parseInt(inquiry.pax, 10) : null,
      priceJpy: computeSurfPriceJpy(inquiry), // server-computed, independent of the client-supplied display string
      dateTimeLabel: `${inquiry.dates.join('、')} ${inquiry.time || ''}`,
      eventIds,
    });
    const reviewUrl = `${APP_URL}/api/confirm?token=${encodeURIComponent(token)}`;

    await sendOwnerNotification(inquiry, ref, reviewUrl);
    res.status(200).json({ ref });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
