/**
 * GET/POST /api/confirm?token=...
 *
 * ============================================================
 * PHASE 2 — the one-click confirm/decline flow.
 * ------------------------------------------------------------
 * Every new booking's owner-notification email (bookings.js for Transport,
 * surf-inquiry.js for Surf Guide) now includes ONE link to this endpoint,
 * carrying a signed, tamper-proof token with everything needed to act on
 * that booking later, with no database:
 *
 *   GET  — shows Ryu a plain summary page (customer, price, date/time) with
 *          two buttons, "確定する" and "お断りする", each a small HTML form
 *          that POSTs back here.
 *   POST — actually performs the chosen action and shows the result.
 *
 * This is deliberately a two-step GET-then-POST flow, not a single link
 * that acts immediately on GET: some email clients and corporate mail
 * gateways "pre-fetch" or safety-scan links found in an email's HTML by
 * issuing a plain GET to them — if that GET itself charged a card or
 * deleted a calendar hold, a scanner could silently charge a customer (or
 * silently decline a real booking) before Ryu ever opened the email. Making
 * the side-effecting step a POST that only fires from an explicit button
 * click on a page a human is looking at avoids that.
 *
 * Branches on the token's `service` field:
 *   - 'transport' (from bookings.js): confirming creates a real Stripe
 *     PaymentIntent charging the payment_method_id the customer already
 *     entered in bookingflow.html Step 3 (off_session — no further action
 *     from the customer). This can legitimately fail (e.g. the card's bank
 *     requires additional authentication Stripe can't obtain off-session,
 *     or the card is simply declined) — that's surfaced clearly to Ryu
 *     rather than silently retried; the calendar hold is left in place
 *     either way so he can decide what to do next.
 *   - 'surf' (from surf-inquiry.js): confirming looks up the matching
 *     PAYMENT_LINK_<ACTIVITY> env var (one of Ryu's own hand-made Stripe
 *     Payment Links — this file never charges anything itself for Surf
 *     Guide) and emails it to the customer. An activity with no configured
 *     link (today: 初心者サーフガイド, レンタルサーフボード) falls back to a
 *     generic "payment details to follow" email instead of erroring, so
 *     adding more links later (or leaving some unset) is always safe.
 *
 * Both branches share: decline (deletes every calendar event this booking
 * created, freeing the slot, and emails the customer a polite notice), and
 * an idempotency guard via a `confirmStatus` tag written onto each event —
 * re-opening or re-submitting an already-processed link is a no-op, never
 * a double charge or double email.
 *
 * Env vars required:
 *   BOOKING_TOKEN_SECRET, APP_URL        (shared with bookings.js/surf-inquiry.js)
 *   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, BOOKINGS_CALENDAR_ID (or SURF_CALENDAR_ID)
 *   RESEND_API_KEY                        (customer-facing confirm/decline emails)
 *   STRIPE_SECRET_KEY                     (Transport charges only — from your
 *     Stripe dashboard's Developers → API keys → Secret key; add it directly
 *     in Vercel, never paste it anywhere else)
 *   PAYMENT_LINK_HALF_DAY, PAYMENT_LINK_TWO_SESSION, PAYMENT_LINK_PHOTO,
 *     PAYMENT_LINK_VIDEO   (Surf Guide only, each optional — the full URL of
 *     the matching Stripe Payment Link you already created by hand)
 */
const crypto = require('crypto');
const { google } = require('googleapis');

const SECRET = process.env.BOOKING_TOKEN_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const BOOKINGS_CALENDAR_ID = process.env.BOOKINGS_CALENDAR_ID || process.env.SURF_CALENDAR_ID;
// Customers are mostly calling from Japan — see the identical note in
// bookings.js/surf-inquiry.js/transport-availability.js.
const CONTACT_EMAIL = 'jpgbyron@gmail.com'; // customer-facing contact point — bookings@jpgbyron.com is send-only (no working inbox behind it yet)

const PAYMENT_LINKS = {
  half_day: process.env.PAYMENT_LINK_HALF_DAY,
  two_session: process.env.PAYMENT_LINK_TWO_SESSION,
  photo: process.env.PAYMENT_LINK_PHOTO,
  video: process.env.PAYMENT_LINK_VIDEO,
};

function verifyToken(token) {
  try {
    const [base, sig] = String(token || '').split('.');
    if (!base || !sig) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(base).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(base, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:-apple-system,'Hiragino Sans','Helvetica Neue',Arial,sans-serif;background:#FBF6EE;color:#1D2621;margin:0;padding:40px 16px;}
  .card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #DCD1BC;border-radius:12px;padding:32px;}
  h1{font-size:20px;margin:0 0 20px;color:#16332F;}
  table{width:100%;border-collapse:collapse;margin-bottom:24px;}
  td{padding:8px 0;font-size:14px;border-bottom:1px solid #F1E8D8;vertical-align:top;}
  td:first-child{color:#5B655F;width:40%;}
  p{font-size:14px;line-height:1.6;color:#1D2621;}
  .muted{color:#5B655F;font-size:13px;}
  .actions{display:flex;gap:10px;margin-top:24px;}
  .actions form{flex:1;}
  button{width:100%;padding:14px;border-radius:999px;font-size:14px;font-weight:600;border:none;cursor:pointer;font-family:inherit;}
  .btn-confirm{background:#16332F;color:#fff;}
  .btn-decline{background:#fff;color:#E0623A;border:1.5px solid #E0623A;}
  .badge{display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;margin-bottom:16px;}
  .badge-ok{background:#EFF5F1;color:#16332F;}
  .badge-error{background:#FBE7E0;color:#E0623A;}
</style></head><body><div class="card">${bodyHtml}</div></body></html>`;
}

function resultPage(title, message, ok) {
  return page(title, `
    <span class="badge ${ok ? 'badge-ok' : 'badge-error'}">${ok ? '完了' : '要確認'}</span>
    <h1>${escapeHtml(title)}</h1>
    <p>${message}</p>
  `);
}

async function getCalendar(scope) {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    [`https://www.googleapis.com/auth/${scope}`]
  );
  return google.calendar({ version: 'v3', auth });
}

async function sendCustomerEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'バイロンベイ <bookings@jpgbyron.com>', to: [to], subject, html }),
  });
  if (!res.ok) console.error('Resend error (customer email):', await res.text());
}

// Reads an event's CURRENT extendedProperties.private and writes it back with
// `status` merged in — never a bare {confirmStatus: status} replacement, so
// this can't silently wipe out surfType/routeId/leg/blockType tags that
// surf-availability.js and transport-availability.js depend on.
async function tagEventStatus(calendar, eventId, status) {
  try {
    const ev = await calendar.events.get({ calendarId: BOOKINGS_CALENDAR_ID, eventId });
    const existingPrivate = (ev.data.extendedProperties && ev.data.extendedProperties.private) || {};
    await calendar.events.patch({
      calendarId: BOOKINGS_CALENDAR_ID,
      eventId,
      requestBody: { extendedProperties: { private: { ...existingPrivate, confirmStatus: status } } },
    });
  } catch (e) {
    console.warn('Could not tag event', eventId, status, e.message);
  }
}

async function deleteEvents(calendar, eventIds) {
  for (const id of eventIds) {
    try {
      await calendar.events.delete({ calendarId: BOOKINGS_CALENDAR_ID, eventId: id });
    } catch (e) {
      console.warn('Could not delete event', id, e.message);
    }
  }
}

// Best-effort look at the first event's tag to see whether this booking was
// already processed — used by both the GET summary page (so Ryu sees
// "already done" immediately) and the POST handler (so a second click, or a
// scanner retry of the POST, never double-charges or double-declines).
// Returns 'confirmed' | 'declined' | null (not yet processed, or the event
// is already gone for some other reason).
async function existingStatus(calendar, eventIds) {
  if (!eventIds || !eventIds[0]) return null;
  try {
    const ev = await calendar.events.get({ calendarId: BOOKINGS_CALENDAR_ID, eventId: eventIds[0] });
    return (ev.data.extendedProperties && ev.data.extendedProperties.private && ev.data.extendedProperties.private.confirmStatus) || null;
  } catch (e) {
    return 'declined'; // event already deleted — most likely via a prior decline
  }
}

function summaryRows(payload) {
  const rows = [
    ['参照番号', payload.ref],
    ['お名前', payload.name],
    ['メール', payload.email],
  ];
  if (payload.service === 'transport') {
    rows.push(['区間', payload.routeLabel || '—']);
    rows.push(['日時', payload.pickupDateTimeLabel || '—']);
    rows.push(['金額', `A$${payload.price}${payload.paymentMethodId ? '' : '（カード情報なし）'}`]);
  } else {
    rows.push(['アクティビティ', payload.activityLabel || payload.activity || '—']);
    rows.push(['日時', payload.dateTimeLabel || '—']);
    rows.push(['目安料金', payload.priceJpy ? `¥${Number(payload.priceJpy).toLocaleString('ja-JP')}` : '—（オーナー確認要）']);
  }
  return rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('');
}

module.exports = async function handler(req, res) {
  const token = req.method === 'GET' ? req.query.token : (req.body && req.body.token);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(400).send(resultPage('リンクが無効です', 'このリンクは無効か、破損している可能性があります。お手数ですがカレンダーで直接ご確認ください。', false));
    return;
  }

  let calendar;
  try {
    calendar = await getCalendar(req.method === 'GET' ? 'calendar.readonly' : 'calendar');
  } catch (e) {
    console.error(e);
    res.status(500).send(resultPage('エラーが発生しました', 'カレンダーへの接続に失敗しました。時間をおいて再度お試しください。', false));
    return;
  }

  const status = await existingStatus(calendar, payload.eventIds);

  if (req.method === 'GET') {
    if (status === 'confirmed' || status === 'declined') {
      res.status(200).send(resultPage('処理済みです', `このご予約は既に${status === 'confirmed' ? '確定・ご案内済み' : 'お断り済み'}です。再度の操作は不要です。`, true));
      return;
    }
    const confirmLabel = payload.service === 'transport' ? '確定して決済する' : '確定する（お支払いリンクを送信）';
    res.status(200).send(page('予約内容の確認', `
      <h1>予約内容の確認</h1>
      <table>${summaryRows(payload)}</table>
      <p class="muted">${payload.service === 'transport'
        ? '「確定して決済する」を押すと、お客様が入力したカードに上記金額が請求され、確定メールが自動送信されます。'
        : '「確定する」を押すと、お客様に確定メールと該当のお支払いリンクが自動送信されます（リンク未設定のアクティビティの場合は「追ってご連絡します」という内容のメールのみ送信されます）。'}
      </p>
      <div class="actions">
        <form method="POST" action="/api/confirm">
          <input type="hidden" name="token" value="${escapeHtml(token)}">
          <input type="hidden" name="action" value="confirm">
          <button type="submit" class="btn-confirm">${escapeHtml(confirmLabel)}</button>
        </form>
        <form method="POST" action="/api/confirm">
          <input type="hidden" name="token" value="${escapeHtml(token)}">
          <input type="hidden" name="action" value="decline">
          <button type="submit" class="btn-decline">お断りする</button>
        </form>
      </div>
    `));
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send(resultPage('エラー', 'サポートされていないリクエストです。', false));
    return;
  }

  const action = req.body && req.body.action;
  if (action !== 'confirm' && action !== 'decline') {
    res.status(400).send(resultPage('エラー', '操作が指定されていません。', false));
    return;
  }
  if (status === 'confirmed' || status === 'declined') {
    res.status(200).send(resultPage('処理済みです', `このご予約は既に${status === 'confirmed' ? '確定・ご案内済み' : 'お断り済み'}です。再度の操作は不要です。`, true));
    return;
  }

  const eventIds = payload.eventIds || [];

  if (action === 'decline') {
    await deleteEvents(calendar, eventIds);
    try {
      await sendCustomerEmail(payload.email, `ご予約について — ${payload.ref}`,
        `<p>${escapeHtml(payload.name)} 様</p><p>大変申し訳ございませんが、ご予約（${escapeHtml(payload.ref)}）についてご案内できないこととなりました。詳細はメール（${CONTACT_EMAIL}）にてお問い合わせください。</p>`);
    } catch (e) {
      console.error('Failed to send decline email:', e);
    }
    res.status(200).send(resultPage('お断りしました', 'カレンダーの仮予約を削除し、お客様にお断りのメールを送信しました。', true));
    return;
  }

  // action === 'confirm'
  if (payload.service === 'transport') {
    if (!payload.paymentMethodId) {
      res.status(200).send(resultPage('カード情報がありません', 'このご予約にはお支払い情報が保存されていません（お客様のブラウザでカード入力が読み込まれなかった可能性があります）。お客様に直接ご連絡のうえお支払い方法をご案内ください。カレンダーの仮予約はそのまま残っています。', false));
      return;
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      res.status(500).send(resultPage('設定エラー', 'STRIPE_SECRET_KEY が設定されていません。Vercelの環境変数をご確認ください。カレンダーの仮予約はそのまま残っています。', false));
      return;
    }
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(payload.price * 100),
        currency: 'aud',
        payment_method: payload.paymentMethodId,
        confirm: true,
        off_session: true,
        description: `Transport booking ${payload.ref} — ${payload.name}`,
        metadata: { ref: payload.ref, service: 'transport' },
      }, { idempotencyKey: `confirm-${payload.ref}` });
    } catch (stripeErr) {
      console.error('Stripe charge failed:', stripeErr);
      const reason = stripeErr.code === 'authentication_required'
        ? 'カード発行会社が追加の本人認証（3Dセキュア等）を要求したため、自動決済できませんでした。お客様に別のお支払い方法（お電話ではなくメールでのご案内をお願いします）をご相談ください。'
        : escapeHtml(stripeErr.message || '決済処理中にエラーが発生しました。');
      res.status(200).send(resultPage('決済に失敗しました', `${reason}<br><br>カレンダーの仮予約はそのまま残っています。改めて確定するか、お断りする場合はカレンダーで直接ご対応ください。`, false));
      return;
    }
    if (paymentIntent.status !== 'succeeded') {
      res.status(200).send(resultPage('決済が完了していません', `ステータス: ${escapeHtml(paymentIntent.status)}。お客様のカード会社からの追加確認が必要な可能性があります。カレンダーの仮予約はそのまま残っています。`, false));
      return;
    }
    for (const id of eventIds) await tagEventStatus(calendar, id, 'confirmed');
    try {
      await sendCustomerEmail(payload.email, `ご予約確定のお知らせ — ${payload.ref}`, `
        <p>${escapeHtml(payload.name)} 様</p>
        <p>ご予約が確定し、A$${payload.price} のお支払いが完了いたしました。</p>
        <p>区間: ${escapeHtml(payload.routeLabel || '—')}<br>日時: ${escapeHtml(payload.pickupDateTimeLabel || '—')}</p>
        <p>当日はどうぞよろしくお願いいたします。ご不明点がございましたら ${CONTACT_EMAIL} までご連絡ください。</p>
      `);
    } catch (e) {
      console.error('Failed to send confirmation email:', e);
    }
    res.status(200).send(resultPage('決済が完了しました', `A$${payload.price} の決済が完了し、お客様に確定メールを送信しました。`, true));
    return;
  }

  if (payload.service === 'surf') {
    const link = PAYMENT_LINKS[payload.activity];
    let customerHtml;
    if (link) {
      const qtyNote = (payload.activity === 'photo' || payload.activity === 'video') && payload.durationMin
        ? `<p style="color:#888;font-size:13px;">※お支払いページで数量の指定が可能な場合は、<strong>${Math.round(payload.durationMin / 60)}</strong> に設定してください（${payload.durationMin}分のご利用のため）。ご不明な場合はそのままお進みいただき、後ほど差額をご案内いたします。</p>`
        : '';
      customerHtml = `
        <p>${escapeHtml(payload.name)} 様</p>
        <p>ご予約（${escapeHtml(payload.ref)}）が確定いたしました。以下のリンクよりお支払いをお願いいたします。</p>
        <p><a href="${link}">${link}</a></p>
        ${qtyNote}
        <p>ご不明点がございましたら ${CONTACT_EMAIL} までご連絡ください。</p>
      `;
    } else {
      customerHtml = `
        <p>${escapeHtml(payload.name)} 様</p>
        <p>ご予約（${escapeHtml(payload.ref)}）が確定いたしました。お支払い方法については追ってご連絡いたします。</p>
        <p>ご不明点がございましたら ${CONTACT_EMAIL} までご連絡ください。</p>
      `;
    }
    for (const id of eventIds) await tagEventStatus(calendar, id, 'confirmed');
    try {
      await sendCustomerEmail(payload.email, `ご予約確定のお知らせ — ${payload.ref}`, customerHtml);
    } catch (e) {
      console.error('Failed to send confirmation email:', e);
    }
    res.status(200).send(resultPage('確定しました', link
      ? 'お客様にお支払いリンクを記載した確定メールを送信しました。'
      : 'お客様に確定メールを送信しました（このアクティビティにはお支払いリンクが設定されていないため、「追ってご連絡します」という内容のみ記載されています）。', true));
    return;
  }

  res.status(400).send(resultPage('不明なリクエストです', 'このリンクのデータ形式が認識できません。', false));
};
