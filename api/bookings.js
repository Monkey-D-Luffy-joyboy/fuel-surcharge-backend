
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>空港送迎予約 — Booking</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://js.stripe.com/v3/"></script>
<style>
  :root{
    --sand: #FBF6EE;
    --sand-deep: #F1E8D8;
    --ink: #1D2621;
    --ink-soft: #5B655F;
    --teal-deep: #16332F;
    --teal: #2E6B63;
    --gold: #E3A23C;
    --coral: #E0623A;
    --green: #3F9469;
    --line: #DCD1BC;
    --white: #FFFFFF;
    --radius-s: 4px;
    --radius-m: 10px;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{
    background: var(--sand);
    color: var(--ink);
    font-family: 'Inter', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .app{
    max-width: 620px;
    margin: 0 auto;
    padding: 32px 20px 80px;
  }
  /* ---- Header / progress ---- */
  .brand{
    display:flex;
    align-items:baseline;
    justify-content:space-between;
    margin-bottom: 28px;
  }
  .brand-name{
    font-family:'Fraunces', serif;
    font-size: 20px;
    font-weight: 500;
    letter-spacing: 0.2px;
    color: var(--teal-deep);
  }
  .brand-sub{
    font-size: 12px;
    color: var(--ink-soft);
  }
  .progress{
    display:flex;
    gap: 6px;
    margin-bottom: 36px;
  }
  .progress-seg{
    height: 3px;
    flex:1;
    background: var(--line);
    border-radius: 2px;
    overflow:hidden;
  }
  .progress-seg .fill{
    height:100%;
    width:0%;
    background: var(--teal-deep);
    transition: width .35s ease;
  }
  .progress-seg.done .fill{ width:100%; }
  .progress-seg.active .fill{ width:100%; }
  .step-label{
    font-size: 12px;
    color: var(--ink-soft);
    margin-bottom: 6px;
  }
  .step-num{
    font-family:'Fraunces', serif;
    font-size: 46px;
    line-height: 1;
    color: var(--teal-deep);
    font-weight: 500;
    margin: 0 0 4px;
  }
  .step-title{
    font-family:'Fraunces', serif;
    font-size: 22px;
    font-weight: 500;
    margin: 0 0 28px;
    color: var(--ink);
  }
  /* ---- panel ---- */
  .panel{
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    padding: 24px;
    margin-bottom: 16px;
  }
  .field{
    margin-bottom: 18px;
  }
  .field:last-child{ margin-bottom:0; }
  .field label{
    display:block;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    margin-bottom: 6px;
  }
  .field .hint{
    font-size: 12px;
    color: var(--ink-soft);
    margin-top: 4px;
  }
  select, input[type=text], input[type=tel], input[type=email], input[type=date], textarea{
    width:100%;
    font-family:'Inter',sans-serif;
    font-size: 14px;
    padding: 11px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-s);
    background: var(--sand);
    color: var(--ink);
    outline:none;
  }
  select:focus, input:focus, textarea:focus{
    border-color: var(--teal);
    background: var(--white);
  }
  textarea{ resize: vertical; min-height: 72px; }
  .optional-tag{
    font-size:11px;
    font-weight:500;
    color: var(--ink-soft);
    margin-left:6px;
  }
  /* ---- From / To location fields (structural reference) ---- */
  .loc-field-wrap{ display:flex; flex-direction:column; gap:10px; }
  .loc-field{
    display:flex;
    align-items:center;
    gap:10px;
    border:1px solid var(--line);
    border-radius:8px;
    padding:12px 14px;
    background: var(--sand);
  }
  .loc-field:focus-within{ border-color: var(--teal); background: var(--white); }
  .loc-dot{ width:9px; height:9px; border-radius:50%; flex-shrink:0; }
  .dot-from{ background: var(--green); }
  .dot-to{ background: var(--coral); }
  .loc-label{ font-size:13px; font-weight:600; width:34px; flex-shrink:0; color:var(--ink); }
  .loc-divider{ width:1px; height:18px; background: var(--line); flex-shrink:0; }
  .loc-field select, .loc-field input{
    border:none; background:transparent; padding:0; flex:1; font-size:14px;
  }
  .loc-field select:focus, .loc-field input:focus{ outline:none; background:transparent; }
  .add-stop-row{ display:flex; align-items:center; gap:8px; }
  .stop-inline-input{
    flex:1;
    min-width:0;
    border:1px solid var(--line);
    border-radius:8px;
    padding:10px 12px;
    font-size:13px;
    font-family:'Inter',sans-serif;
    background: var(--sand);
    color: var(--ink);
  }
  .stop-inline-input:focus{ outline:none; border-color: var(--teal); background: var(--white); }
  .add-stop-btn{
    background: var(--sand-deep);
    border: 1px solid var(--line);
    color: var(--coral);
    font-weight:600;
    font-size:12px;
    padding:6px 14px;
    border-radius:999px;
    cursor:pointer;
    flex-shrink:0;
    margin-left:auto;
  }
  .add-stop-btn.active{ background: var(--coral); border-color: var(--coral); color:#fff; }
  .pac-container{
    z-index: 999999 !important;
    font-family:'Inter',sans-serif !important;
    position: absolute !important;
    background: #fff !important;
    border: 1px solid var(--line) !important;
    border-radius: 8px !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
    margin-top: 4px !important;
    max-height: 240px !important;
    overflow-y: auto !important;
  }
  .pac-item{
    display: block !important;
    width: auto !important;
    height: auto !important;
    padding: 8px 12px !important;
    font-size: 13px !important;
    line-height: 1.4 !important;
    border-top: 1px solid var(--sand-deep) !important;
    cursor: pointer !important;
  }
  .pac-item:first-child{ border-top: none !important; }
  .pac-icon{ display: none !important; }
  .pac-item-query{ font-size: 13px !important; color: var(--ink) !important; }
  .field-error{ border-color: var(--coral) !important; }
  .error-msg{ font-size:12px; color: var(--coral); margin-top:4px; min-height:14px; }
  .add-return-btn{
    width:100%;
    padding:14px;
    border:1.5px solid var(--teal-deep);
    background: transparent;
    color: var(--teal-deep);
    font-weight:600;
    font-size:14px;
    border-radius:999px;
    cursor:pointer;
    margin-bottom:16px;
    font-family:'Inter',sans-serif;
  }
  .add-return-btn.active{ background: var(--teal-deep); color:#fff; }
  /* ---- route cards (legacy, unused but kept for reference) ---- */
  .route-list{ display:flex; flex-direction:column; gap:10px; }
  /* ---- calendar ---- */
  .cal-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
  .cal-head button{
    background:none;border:1px solid var(--line);border-radius:6px;
    width:30px;height:30px;cursor:pointer;color:var(--teal-deep);font-size:14px;
  }
  .cal-month{ font-weight:600; font-size:14px; }
  .cal-grid{ display:grid; grid-template-columns: repeat(7,1fr); gap:4px; text-align:center; }
  .cal-dow{ font-size:11px; color:var(--ink-soft); padding-bottom:4px; }
  .cal-day{
    aspect-ratio:1; display:flex; align-items:center; justify-content:center;
    font-size:13px; border-radius:8px; cursor:pointer; color:var(--ink);
  }
  .cal-day.disabled{ color:#C9BFA9; cursor:not-allowed; }
  .cal-day.blank{ visibility:hidden; }
  .cal-day:not(.disabled):not(.blank):hover{ background: var(--sand-deep); }
  .cal-day.selected{ background: var(--teal-deep); color:#fff; }
  /* ---- stepper (pax / luggage) ---- */
  .stepper-row{
    display:flex; align-items:center; justify-content:space-between;
    padding: 10px 0; border-bottom: 1px solid var(--sand-deep);
  }
  .stepper-row:last-child{ border-bottom:none; }
  .stepper-row .s-label{ font-size:14px; font-weight:500; }
  .stepper-row .s-note{ font-size:12px; color:var(--ink-soft); margin-top:2px; }
  .stepper-ctrl{ display:flex; align-items:center; gap:12px; }
  .stepper-ctrl button{
    width:28px;height:28px;border-radius:50%;
    border:1px solid var(--line); background:#fff; cursor:pointer;
    font-size:15px; color:var(--teal-deep); line-height:1;
  }
  .stepper-ctrl button:disabled{ opacity:.35; cursor:not-allowed; }
  .stepper-ctrl .count{ width:16px; text-align:center; font-weight:600; font-size:14px; }
  .capacity-note{
    font-size:12px; margin-top:12px; padding:10px 12px;
    background: #FBF0DF; border-radius:6px; color:#8A5A16;
  }
  .capacity-note.full{ background:#FBE7E0; color:var(--coral); }
  /* ---- summary ---- */
  .summary-row{
    display:flex; justify-content:space-between; font-size:13px;
    padding: 7px 0; color: var(--ink-soft);
  }
  .summary-row span:last-child{ color: var(--ink); font-weight:500; text-align:right; }
  .summary-total{
    display:flex; justify-content:space-between; align-items:baseline;
    margin-top:10px; padding-top:14px; border-top:1px solid var(--line);
  }
  .summary-total .t-label{ font-size:14px; font-weight:600; }
  .summary-total .t-amount{ font-family:'Fraunces',serif; font-size:26px; color:var(--teal-deep); }
  #card-element{
    padding: 12px; border:1px solid var(--line); border-radius: var(--radius-s); background: var(--sand);
  }
  #card-errors{ color: var(--coral); font-size:12px; margin-top:6px; min-height:14px; }
  /* ---- buttons ---- */
  .actions{ display:flex; gap:10px; margin-top:20px; }
  .btn{
    flex:1; padding: 14px 18px; border-radius: 999px; font-size:14px; font-weight:600;
    border:none; cursor:pointer; text-align:center; font-family:'Inter',sans-serif;
  }
  .btn-primary{ background: var(--teal-deep); color:#fff; }
  .btn-primary:hover{ background:#0F2723; }
  .btn-primary:disabled{ background:#B9C4BF; cursor:not-allowed; }
  .btn-ghost{ background:none; color: var(--ink-soft); flex:0 0 auto; padding:14px 8px; }
  /* ---- confirmation ---- */
  .confirm-wrap{ text-align:center; padding: 40px 10px; }
  .confirm-mark{
    width:56px;height:56px;border-radius:50%; background:#EFF5F1; color:var(--teal-deep);
    display:flex;align-items:center;justify-content:center; margin:0 auto 20px; font-size:26px;
  }
  .confirm-wrap h2{ font-family:'Fraunces',serif; font-weight:500; font-size:24px; margin:0 0 10px; }
  .confirm-wrap p{ font-size:14px; color:var(--ink-soft); line-height:1.6; max-width:400px; margin:0 auto 22px; }
  .confirm-ref{
    display:inline-block; font-size:12px; color:var(--ink-soft);
    border:1px solid var(--line); padding:6px 12px; border-radius:6px;
  }
  .hidden{ display:none !important; }
  .inline-notice{
    background:#FBE7E0;
    color: var(--coral);
    border: 1px solid var(--coral);
    border-radius: var(--radius-s);
    padding: 12px 14px;
    font-size: 13px;
    margin-bottom: 20px;
    line-height: 1.5;
  }
  @media (max-width: 420px){
    .step-num{ font-size:36px; }
  }
</style>
</head>
<body>
<div class="app">

  <div id="inlineNotice" class="inline-notice hidden"></div>

  <div class="brand">
    <div>
      <div class="brand-name">バイロンベイ送迎サービス</div>
      <div class="brand-sub">プライベート空港送迎の予約</div>
    </div>
  </div>

  <div class="progress" id="progressBar">
    <div class="progress-seg" data-seg="1"><div class="fill"></div></div>
    <div class="progress-seg" data-seg="2"><div class="fill"></div></div>
    <div class="progress-seg" data-seg="3"><div class="fill"></div></div>
  </div>

  <!-- STEP 1 -->
  <section id="step1">
    <div class="step-label">STEP 1 / 3</div>
    <p class="step-num">01</p>
    <h2 class="step-title">ルート・日時・人数</h2>

    <div class="panel">
      <div class="loc-field-wrap">
        <div class="loc-field">
          <span class="loc-dot dot-from"></span>
          <span class="loc-label">From</span>
          <span class="loc-divider"></span>
          <select id="fromSelect">
            <option value="gc">ゴールドコースト空港（OOL）</option>
            <option value="bne">ブリスベン空港（BNE）</option>
            <option value="custom">住所を入力（カスタム）</option>
          </select>
        </div>
        <div class="add-stop-row" id="addStopRow">
          <input type="text" id="fStop" class="stop-inline-input hidden" placeholder="経由地の住所" />
          <button type="button" class="add-stop-btn" id="addStopBtn">＋ 経由地を追加</button>
        </div>
        <div class="loc-field">
          <span class="loc-dot dot-to"></span>
          <span class="loc-label">To</span>
          <span class="loc-divider"></span>
          <input type="text" id="toAddress" placeholder="住所、ホテル名など" />
        </div>
      </div>
      <div class="field hidden" id="customFromField" style="margin-top:14px;">
        <label>出発地の住所</label>
        <input type="text" id="fromCustomAddress" placeholder="住所をご入力ください" />
      </div>
    </div>

    <div class="panel">
      <div class="field">
        <label>ピックアップ</label>
        <div class="hint hidden" id="addressStatusNotice" style="margin-bottom:8px;"></div>
        <div class="cal-head">
          <button id="prevMonth" type="button">‹</button>
          <div class="cal-month" id="calMonthLabel"></div>
          <button id="nextMonth" type="button">›</button>
        </div>
        <div class="cal-grid" id="calGrid"></div>
        <div class="hint">グレー表示の日付はすでにご予約が入っており、選択できません。</div>
      </div>
      <div class="field">
        <label>時間</label>
        <select id="timeSelect" class="time-select"></select>
        <div class="hint">15分単位でお選びいただけます。表示される時間は、その日にご案内可能な時間帯のみです。</div>
      </div>
    </div>

    <button type="button" class="add-return-btn" id="addReturnBtn">＋ 帰りの便を追加</button>
    <div class="panel hidden" id="returnPanel">
      <div class="field">
        <label>帰りの日付</label>
        <div class="cal-head">
          <button id="retPrevMonth" type="button">‹</button>
          <div class="cal-month" id="retCalMonthLabel"></div>
          <button id="retNextMonth" type="button">›</button>
        </div>
        <div class="cal-grid" id="retCalGrid"></div>
        <div class="hint">グレー表示の日付はすでにご予約が入っており、選択できません。</div>
      </div>
      <div class="field">
        <label>帰りの時間</label>
        <select id="returnTimeSelect" class="time-select"></select>
      </div>
    </div>

    <div class="panel">
      <div class="stepper-row">
        <div><div class="s-label">大人</div></div>
        <div class="stepper-ctrl">
          <button type="button" id="adultsMinus">−</button>
          <div class="count" id="adultsCount">1</div>
          <button type="button" id="adultsPlus">+</button>
        </div>
      </div>
      <div class="stepper-row">
        <div><div class="s-label">子供</div></div>
        <div class="stepper-ctrl">
          <button type="button" id="childrenMinus">−</button>
          <div class="count" id="childrenCount">0</div>
          <button type="button" id="childrenPlus">+</button>
        </div>
      </div>
      <div class="capacity-note" id="paxCapNote"></div>
    </div>

    <div class="actions">
      <button class="btn btn-primary" id="toStep2">つぎへ</button>
    </div>
  </section>

  <!-- STEP 2 -->
  <section id="step2" class="hidden">
    <div class="step-label">STEP 2 / 3</div>
    <p class="step-num">02</p>
    <h2 class="step-title">お客様情報・お荷物</h2>

    <div class="panel">
      <div class="field">
        <label>お名前</label>
        <input type="text" id="fName" placeholder="山田 太郎" />
      </div>
      <div class="field">
        <label>メールアドレス</label>
        <input type="email" id="fEmail" placeholder="you@example.com" />
        <div class="error-msg" id="emailError"></div>
      </div>
      <div class="field">
        <label>オーストラリアで繋がる電話番号 <span class="optional-tag">任意</span></label>
        <input type="tel" id="fPhone" placeholder="+61 4xx xxx xxx" />
      </div>
      <div class="field">
        <label>フライト番号</label>
        <input type="text" id="fFlight" placeholder="例）JQ123" />
        <div class="hint">運行状況の確認に使用します。</div>
      </div>
    </div>

    <div class="panel">
      <div class="field" style="margin-bottom:6px;">
        <label>お荷物・サーフボード</label>
      </div>
      <div class="stepper-row">
        <div>
          <div class="s-label">スーツケース・大きな荷物</div>
        </div>
        <div class="stepper-ctrl">
          <button type="button" data-lug="bag" data-dir="-1">−</button>
          <div class="count" id="bagCount">0</div>
          <button type="button" data-lug="bag" data-dir="1">+</button>
        </div>
      </div>
      <div class="stepper-row">
        <div>
          <div class="s-label">サーフボード</div>
          <div class="s-note">最大9.5ftまでルーフラック積載可能です。</div>
        </div>
        <div class="stepper-ctrl">
          <button type="button" data-lug="board" data-dir="-1">−</button>
          <div class="count" id="boardCount">0</div>
          <button type="button" data-lug="board" data-dir="1">+</button>
        </div>
      </div>
      <div id="capacityNote" class="capacity-note"></div>
    </div>

    <div class="panel">
      <div class="field">
        <label>ご質問・ご要望 <span class="optional-tag">任意</span></label>
        <textarea id="fQuestion" placeholder="チャイルドシートが必要、など"></textarea>
        <div class="hint">4歳〜7歳までの身長が145cm以下のお子さんはチャイルドシートの使用が義務付けられておりますので、事前にお知らせください。</div>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-ghost" id="backTo1">戻る</button>
      <button class="btn btn-primary" id="toStep3">つぎへ</button>
    </div>
  </section>

  <!-- STEP 3 -->
  <section id="step3" class="hidden">
    <div class="step-label">STEP 3 / 3</div>
    <p class="step-num">03</p>
    <h2 class="step-title">内容確認・お支払い</h2>

    <div class="panel">
      <div class="summary-row"><span>区間</span><span id="sumRoute">—</span></div>
      <div class="summary-row"><span>ピックアップ日時</span><span id="sumDatetime">—</span></div>
      <div class="summary-row hidden" id="sumReturnRow"><span>帰り日時</span><span id="sumReturn">—</span></div>
      <div class="summary-row"><span>人数</span><span id="sumPax">—</span></div>
      <div class="summary-row"><span>お荷物</span><span id="sumLuggage">—</span></div>
      <div class="summary-total">
        <span class="t-label">合計金額</span>
        <span class="t-amount" id="sumTotal">¥0</span>
      </div>
      <div class="hint hidden" id="sumAudHint" style="text-align:right;margin-top:2px;">実際のお引き落とし額（Stripe / AUD）: A$0</div>
      <div class="hint hidden" id="sumLoadingHint" style="text-align:right;margin-top:4px;">少しお待ちください</div>
    </div>

    <div class="panel">
      <div class="field">
        <label>お支払い情報</label>
        <div id="card-element"></div>
        <div id="card-errors"></div>
        <div class="hint">確定前に課金されることはありません。オーナー確認後、正式なご予約確定と同時に決済処理が行われます。</div>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-ghost" id="backTo2">戻る</button>
      <button class="btn btn-primary" id="submitBooking">予約をリクエストする</button>
    </div>
  </section>

  <!-- CONFIRMATION -->
  <section id="stepDone" class="hidden">
    <div class="confirm-wrap">
      <div class="confirm-mark">✓</div>
      <h2>リクエストを受け付けました</h2>
      <p>ご予約内容を確認のうえ、通常1〜2時間以内に確定メールをお送りします。確定と同時にお支払いが処理されます。</p>
      <div class="confirm-ref" id="refNumber">REF-000000</div>
    </div>
  </section>

</div>

<script>
/* ---------------- config / mock data ---------------- */
const ROUTES = {
  gc:     { name:'ゴールドコースト空港送迎', base:193.50, capacity:5 },
  bne:    { name:'ブリスベン空港送迎', base:126.68, capacity:5 },
  // `base` here is only a last-resort display fallback if the live /api/quote estimate
  // request fails outright (see renderSummary's catch block) — the real charge always
  // comes from the server's own calcPrice() (api/bookings.js), which floors Custom Route
  // at CUSTOM_FLAT_FEE (currently A$115) + live fuel, never this value. Set to match that
  // floor so the rare fallback estimate is at least roughly right instead of showing a
  // misleading "A$1〜". (Previously carried a "テスト中：A$1" testing label in the name —
  // removed now that Custom Route is live, not a test.)
  custom: { name:'カスタムルート', base:115, capacity:7 },
};
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51U6HhCKF3SixxAEqoXIwsKnfP2Mbha9kdA19CRWs4SyPD1ajYmlt1B2dOklw9O0PrLfu5OPbRhFDg0TlOywtcEWf00mgxbhZOv';
const MAX_PAX = 4;
const ADULTS_MAX = 3;
const BAGS_MAX = 3;

// Google Places API key — add your key here to enable address autocomplete on the
// From (custom), To, and stop fields. Leave blank to keep plain text inputs.
const GOOGLE_MAPS_API_KEY = 'AIzaSyAiBECSdYloiMY-_7kSKOypmB7iiYAJvDo';

// Your deployed backend's booking endpoint, e.g. https://your-project.vercel.app/api/bookings
// Leave blank to keep working in demo mode (no email/calendar, just a fake reference number).
const BOOKING_ENDPOINT = 'https://fuel-surcharge-backend.vercel.app/api/bookings';

// Live price estimate endpoint — same pricing math the server uses for the real charge,
// so the on-screen "目安" (estimate) actually matches reality instead of a rough guess.
const ESTIMATE_ENDPOINT = 'https://fuel-surcharge-backend.vercel.app/api/quote';

/* ---------------- availability (shared calendar, real time-blocks) ----------------
   Ryu is a solo operator: every booking — Transport or Surf Guide — competes for the
   same person's time on ONE shared Google Calendar (see api/transport-availability.js).
   gc/bne have a fixed duration so their slots are known immediately; 'custom' needs a
   LIVE Google Maps drive-time lookup between the customer's own two addresses, so until
   both are filled in AND that lookup succeeds, addressStatus stays 'incomplete' or
   'unresolved' and no dates are offered — this deliberately fails CLOSED rather than
   guessing a duration and letting the customer pick a time that api/bookings.js would
   then reject anyway. */
const TRANSPORT_AVAILABILITY_ENDPOINT = 'https://fuel-surcharge-backend.vercel.app/api/transport-availability';
const busyDates = new Set();
const slotsByDate = {};
let addressStatus = 'ok';        // 'ok' | 'incomplete' | 'unresolved' — only meaningful when routeId==='custom'
let addressStatusMessage = '';
let availabilityRequestId = 0;

// Date objects on this page are always built from local Y/M/D (a calendar cell picked by
// the customer), representing local midnight. `.toISOString()` converts to UTC before
// slicing out the date — for Byron Bay (UTC+10/+11, ahead of UTC), that shifts local
// midnight back into the *previous* UTC day, so the resulting "YYYY-MM-DD" key ends up one
// day earlier than the date actually shown/selected. That silently broke both the busy-date
// lookup and, more seriously, the date actually sent to the server when submitting a
// booking. Always derive the key from local getFullYear/getMonth/getDate instead — never
// .toISOString() — for any Date representing a calendar day a customer picked.
function localDateStr(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function isBooked(dateObj){
  if(addressStatus !== 'ok') return true; // custom route: address not yet confirmed bookable
  const key = localDateStr(dateObj);
  return busyDates.has(key);
}

function updateAddressStatusNotice(){
  const el = document.getElementById('addressStatusNotice');
  if(state.routeId !== 'custom' || addressStatus === 'ok'){
    el.classList.add('hidden');
    el.textContent = '';
    el.style.color = '';
    return;
  }
  el.classList.remove('hidden');
  if(addressStatus === 'incomplete'){
    el.style.color = 'var(--ink-soft)';
    el.textContent = '出発地・到着地のご住所をご入力いただくと、空き状況を確認できます。';
  } else {
    el.style.color = 'var(--coral)';
    el.textContent = addressStatusMessage || 'ご住所の位置を確認できませんでした。より詳しいご住所でもう一度お試しください。';
  }
}

async function loadAvailability(){
  if(!TRANSPORT_AVAILABILITY_ENDPOINT) return;
  const myRequestId = ++availabilityRequestId;
  try{
    const today = new Date();
    const end = new Date(today); end.setDate(end.getDate() + 180);
    const fmtDate = localDateStr;
    const params = new URLSearchParams({ routeId: state.routeId, start: fmtDate(today), end: fmtDate(end) });
    if(state.routeId === 'custom'){
      params.set('fromCustomAddress', document.getElementById('fromCustomAddress').value.trim());
      params.set('toAddress', document.getElementById('toAddress').value.trim());
    }
    const res = await fetch(`${TRANSPORT_AVAILABILITY_ENDPOINT}?${params.toString()}`);
    if(!res.ok) throw new Error('Server responded with ' + res.status);
    const data = await res.json();
    if(myRequestId !== availabilityRequestId) return; // a newer request is already in flight/resolved
    busyDates.clear();
    (data.busyDates || []).forEach(d => busyDates.add(d));
    Object.keys(slotsByDate).forEach(k => delete slotsByDate[k]);
    Object.assign(slotsByDate, data.slotsByDate || {});
    addressStatus = data.addressStatus || 'ok';
    addressStatusMessage = data.message || '';
    updateAddressStatusNotice();
    pickupCal.render();
    returnCal.render();
    updateTimeOptionsForDate(document.getElementById('timeSelect'), state.date, 'time');
    updateTimeOptionsForDate(document.getElementById('returnTimeSelect'), state.returnDateObj, 'returnTime');
  }catch(e){
    console.error('Availability check failed — calendar may not reflect real bookings.', e);
  }
}

/* ---------------- state ---------------- */
const state = {
  routeId: 'gc',
  date: null,
  time: null,
  adults: 1,
  children: 0,
  bags: 0,
  boards: 0,
  stopRequested: false,
  returnEnabled: false,
};
let calCursor = new Date();
calCursor.setDate(1);

/* ---------------- helpers ---------------- */
function selectedRoute(){ return ROUTES[state.routeId]; }
function totalPax(){ return state.adults + state.children; }
function capacityUsed(){ return state.bags + state.boards*2; }
function capacityMax(){ return selectedRoute().capacity; }
function calcPrice(){
  let base = selectedRoute().base;
  let total = state.returnEnabled ? base * 2 : base;
  return Math.round(total * 100) / 100;
}
function fmt(n){ return 'A$' + n.toFixed(2); }

function appendPlaceholder(selectEl, text){
  const p = document.createElement('option');
  p.value = ''; p.textContent = text; p.disabled = true; p.selected = true;
  selectEl.appendChild(p);
}
// Used before any date is picked, or if the availability endpoint is unreachable —
// the full theoretical 05:00-23:45 range, same as this page's original behaviour.
function generateFallbackTimeOptions(selectEl){
  selectEl.innerHTML = '';
  appendPlaceholder(selectEl, '時間を選択');
  for(let h=5; h<=23; h++){
    for(let m=0; m<60; m+=15){
      const hh = String(h).padStart(2,'0');
      const mm = String(m).padStart(2,'0');
      const opt = document.createElement('option');
      opt.value = `${hh}:${mm}`;
      opt.textContent = `${hh}:${mm}`;
      selectEl.appendChild(opt);
    }
  }
}
// Populates a time <select> with only the real free start times for the given date
// (from slotsByDate, computed server-side against the shared calendar) — `stateKey` is
// 'time' or 'returnTime', so the previously chosen value survives a refresh if it's
// still valid.
function updateTimeOptionsForDate(selectEl, dateObj, stateKey){
  const previousValue = state[stateKey];
  selectEl.innerHTML = '';
  if(!dateObj){ generateFallbackTimeOptions(selectEl); return; }
  const key = localDateStr(dateObj);
  const times = (slotsByDate[key] || []).slice().sort();
  if(times.length === 0){
    appendPlaceholder(selectEl, 'ご希望の日程に空き時間がありません');
    state[stateKey] = null;
    return;
  }
  appendPlaceholder(selectEl, '時間を選択');
  times.forEach(t=>{
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    selectEl.appendChild(opt);
  });
  if(previousValue && times.includes(previousValue)){
    selectEl.value = previousValue;
    state[stateKey] = previousValue;
  } else {
    state[stateKey] = null;
  }
}

/* ---------------- render: From / To route select ---------------- */
const fromSelect = document.getElementById('fromSelect');
fromSelect.addEventListener('change', ()=>{
  state.routeId = fromSelect.value;
  document.getElementById('customFromField').classList.toggle('hidden', state.routeId !== 'custom');
  renderCapacityNote();
  // Each route occupies a different amount of Ryu's time (fixed for gc/bne, live
  // drive-time for custom) — refetch its own slots. Repaint immediately with
  // whatever we already have so the UI doesn't sit frozen, then again once fresh
  // data arrives.
  pickupCal.render(); returnCal.render();
  loadAvailability();
});
// For a Custom Route, availability depends on a live drive-time lookup between these
// two addresses — recheck once the customer finishes typing either one. (blur, not
// input-on-every-keystroke, to avoid hammering the Google Maps API while they type.)
['toAddress','fromCustomAddress'].forEach(id=>{
  document.getElementById(id).addEventListener('blur', ()=>{
    if(state.routeId === 'custom') loadAvailability();
  });
});

/* ---------------- add stop ---------------- */
document.getElementById('addStopBtn').addEventListener('click', ()=>{
  state.stopRequested = !state.stopRequested;
  document.getElementById('addStopBtn').classList.toggle('active', state.stopRequested);
  document.getElementById('addStopBtn').textContent = state.stopRequested ? '－ 経由地を削除' : '＋ 経由地を追加';
  const stopInput = document.getElementById('fStop');
  stopInput.classList.toggle('hidden', !state.stopRequested);
  if(!state.stopRequested){ stopInput.value = ''; }
});

/* ---------------- add return ---------------- */
document.getElementById('addReturnBtn').addEventListener('click', ()=>{
  state.returnEnabled = !state.returnEnabled;
  const btn = document.getElementById('addReturnBtn');
  btn.classList.toggle('active', state.returnEnabled);
  btn.textContent = state.returnEnabled ? '－ 帰りの便を削除' : '＋ 帰りの便を追加';
  document.getElementById('returnPanel').classList.toggle('hidden', !state.returnEnabled);
});

/* ---------------- render: calendar (reusable for pickup + return) ---------------- */
const DOW = ['日','月','火','水','木','金','土'];
function makeCalendar({ cursor, gridId, monthLabelId, getDate, setDate }){
  function render(){
    document.getElementById(monthLabelId).textContent =
      cursor.getFullYear() + '年 ' + (cursor.getMonth()+1) + '月';
    const grid = document.getElementById(gridId);
    grid.innerHTML = '';
    DOW.forEach(d=>{
      const el = document.createElement('div');
      el.className = 'cal-dow';
      el.textContent = d;
      grid.appendChild(el);
    });
    const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth()+1, 0).getDate();
    const today = new Date(); today.setHours(0,0,0,0);

    for(let i=0;i<firstDay;i++){
      const el = document.createElement('div');
      el.className = 'cal-day blank';
      grid.appendChild(el);
    }
    for(let d=1; d<=daysInMonth; d++){
      const dateObj = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      const el = document.createElement('div');
      const isPast = dateObj < today;
      const booked = isBooked(dateObj);
      el.className = 'cal-day' + ((isPast || booked) ? ' disabled':'');
      el.textContent = d;
      const sel = getDate();
      if(sel && dateObj.toDateString()===sel.toDateString()){
        el.classList.add('selected');
      }
      if(!isPast && !booked){
        el.addEventListener('click', ()=>{ setDate(dateObj); render(); });
      }
      grid.appendChild(el);
    }
  }
  return { render };
}

const pickupCal = makeCalendar({
  cursor: calCursor, gridId:'calGrid', monthLabelId:'calMonthLabel',
  getDate: ()=> state.date,
  setDate: (d)=>{ state.date = d; updateTimeOptionsForDate(document.getElementById('timeSelect'), d, 'time'); }
});
let retCalCursor = new Date(); retCalCursor.setDate(1);
const returnCal = makeCalendar({
  cursor: retCalCursor, gridId:'retCalGrid', monthLabelId:'retCalMonthLabel',
  getDate: ()=> state.returnDateObj,
  setDate: (d)=>{ state.returnDateObj = d; updateTimeOptionsForDate(document.getElementById('returnTimeSelect'), d, 'returnTime'); }
});

document.getElementById('prevMonth').addEventListener('click', ()=>{
  calCursor.setMonth(calCursor.getMonth()-1); pickupCal.render();
});
document.getElementById('nextMonth').addEventListener('click', ()=>{
  calCursor.setMonth(calCursor.getMonth()+1); pickupCal.render();
});
document.getElementById('retPrevMonth').addEventListener('click', ()=>{
  retCalCursor.setMonth(retCalCursor.getMonth()-1); returnCal.render();
});
document.getElementById('retNextMonth').addEventListener('click', ()=>{
  retCalCursor.setMonth(retCalCursor.getMonth()+1); returnCal.render();
});

/* ---------------- time selects ---------------- */
const timeSelect = document.getElementById('timeSelect');
generateFallbackTimeOptions(timeSelect); // no date picked yet — real options load once a date is selected
timeSelect.addEventListener('change', ()=>{ state.time = timeSelect.value; });

const returnTimeSelect = document.getElementById('returnTimeSelect');
generateFallbackTimeOptions(returnTimeSelect);
returnTimeSelect.addEventListener('change', ()=>{ state.returnTime = returnTimeSelect.value; });

/* ---------------- Adults / Children steppers ---------------- */
function renderPaxCap(){
  const note = document.getElementById('paxCapNote');
  const total = totalPax();
  document.getElementById('adultsPlus').disabled = total >= MAX_PAX || state.adults >= ADULTS_MAX;
  document.getElementById('childrenPlus').disabled = total >= MAX_PAX;
  document.getElementById('adultsMinus').disabled = state.adults <= 1;
  document.getElementById('childrenMinus').disabled = state.children <= 0;
  if(total >= MAX_PAX){
    note.className = 'capacity-note full';
    note.textContent = `ご乗車人数は最大${MAX_PAX}名までです（現在${total}名）。`;
  } else if(state.adults >= ADULTS_MAX){
    note.className = 'capacity-note full';
    note.textContent = `大人は最大${ADULTS_MAX}名までです。`;
  } else {
    note.className = 'capacity-note';
    note.textContent = `ご乗車人数 ${total} / ${MAX_PAX}名`;
  }
}
document.getElementById('adultsMinus').addEventListener('click', ()=>{
  state.adults = Math.max(1, state.adults-1);
  document.getElementById('adultsCount').textContent = state.adults;
  renderPaxCap();
});
document.getElementById('adultsPlus').addEventListener('click', ()=>{
  if(totalPax() < MAX_PAX && state.adults < ADULTS_MAX){
    state.adults++;
    document.getElementById('adultsCount').textContent = state.adults;
  }
  renderPaxCap();
});
document.getElementById('childrenMinus').addEventListener('click', ()=>{
  state.children = Math.max(0, state.children-1);
  document.getElementById('childrenCount').textContent = state.children;
  renderPaxCap();
});
document.getElementById('childrenPlus').addEventListener('click', ()=>{
  if(totalPax() < MAX_PAX){ state.children++; document.getElementById('childrenCount').textContent = state.children; }
  renderPaxCap();
});

/* ---------------- luggage steppers ---------------- */
document.querySelectorAll('[data-lug]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const type = btn.getAttribute('data-lug');
    const dir = parseInt(btn.getAttribute('data-dir'));
    const key = type==='bag' ? 'bags' : 'boards';
    const cost = type==='bag' ? 1 : 2;
    const nextVal = state[key] + dir;
    const nextUsed = capacityUsed() - (state[key]*cost) + (nextVal*cost);
    if(nextVal < 0) return;
    if(dir>0 && type==='bag' && nextVal > BAGS_MAX) return;
    if(dir>0 && nextUsed > capacityMax()) return;
    state[key] = nextVal;
    document.getElementById(type==='bag'?'bagCount':'boardCount').textContent = nextVal;
    renderCapacityNote();
  });
});
function updateLuggageButtons(){
  const used = capacityUsed();
  const max = capacityMax();
  document.querySelectorAll('[data-lug="bag"][data-dir="1"]').forEach(b=>{
    b.disabled = state.bags >= BAGS_MAX || used >= max;
  });
  document.querySelectorAll('[data-lug="bag"][data-dir="-1"]').forEach(b=>{
    b.disabled = state.bags <= 0;
  });
  document.querySelectorAll('[data-lug="board"][data-dir="1"]').forEach(b=>{
    b.disabled = (used + 2) > max;
  });
  document.querySelectorAll('[data-lug="board"][data-dir="-1"]').forEach(b=>{
    b.disabled = state.boards <= 0;
  });
}
function renderCapacityNote(){
  const used = capacityUsed();
  const max = capacityMax();
  const note = document.getElementById('capacityNote');
  const remaining = max - used;
  if(remaining <= 0){
    note.className = 'capacity-note full';
    note.textContent = `この車両の最大積載数に達しました（${used} / ${max}枠）。追加のお荷物がある場合はご質問欄にご記入ください。`;
  } else if(state.bags >= BAGS_MAX){
    note.className = 'capacity-note full';
    note.textContent = `スーツケース・大きな荷物は最大${BAGS_MAX}個までです。`;
  } else {
    note.className = 'capacity-note';
    note.textContent = `積載枠 ${used} / ${max}（サーフボードは2枠分としてカウントされます）`;
  }
  updateLuggageButtons();
}

/* ---------------- step navigation ---------------- */
function showNotice(message){
  const el = document.getElementById('inlineNotice');
  el.textContent = message;
  el.classList.remove('hidden');
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function clearNotice(){
  const el = document.getElementById('inlineNotice');
  el.classList.add('hidden');
  el.textContent = '';
}

function hidePacContainers(){
  document.querySelectorAll('.pac-container').forEach(el=>{
    el.style.display = 'none';
  });
}

function goTo(step){
  clearNotice();
  hidePacContainers();
  ['step1','step2','step3','stepDone'].forEach(id=>{
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(step).classList.remove('hidden');
  document.querySelectorAll('.progress-seg').forEach(seg=>{
    const n = parseInt(seg.getAttribute('data-seg'));
    seg.classList.remove('done','active');
    const stepNum = {step1:1, step2:2, step3:3, stepDone:3}[step];
    if(n < stepNum) seg.classList.add('done');
    if(n === stepNum) seg.classList.add('active');
  });
  window.scrollTo({top:0, behavior:'smooth'});
}

document.getElementById('toStep2').addEventListener('click', ()=>{
  if(!document.getElementById('toAddress').value.trim()){
    showNotice('To（目的地）をご入力ください。'); return;
  }
  if(state.routeId === 'custom' && !document.getElementById('fromCustomAddress').value.trim()){
    showNotice('出発地の住所をご入力ください。'); return;
  }
  // Custom Route's calendar only opens up once the drive-time lookup between the two
  // addresses has actually succeeded — give a specific reason rather than the generic
  // "select a date and time" message when that hasn't happened yet.
  if(state.routeId === 'custom' && addressStatus !== 'ok'){
    showNotice(addressStatus === 'incomplete'
      ? '出発地・到着地のご住所をご入力ください。'
      : (addressStatusMessage || 'ご住所の位置を確認できませんでした。より詳しいご住所でもう一度お試しください。'));
    return;
  }
  if(!state.date || !state.time){
    showNotice('日付と時間を選択してください。'); return;
  }
  if(state.returnEnabled){
    const rt = document.getElementById('returnTimeSelect').value;
    if(!state.returnDateObj || !rt){
      showNotice('帰りの日付と時間をご入力ください。'); return;
    }
    state.returnDate = localDateStr(state.returnDateObj);
    state.returnTime = rt;
  }
  goTo('step2');
});
document.getElementById('backTo1').addEventListener('click', ()=> goTo('step1'));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateEmail(){
  const inputEl = document.getElementById('fEmail');
  const errEl = document.getElementById('emailError');
  const val = inputEl.value.trim();
  if(!val || !EMAIL_RE.test(val)){
    errEl.textContent = 'メールアドレスの形式が正しくありません。';
    inputEl.classList.add('field-error');
    return false;
  }
  errEl.textContent = '';
  inputEl.classList.remove('field-error');
  return true;
}
document.getElementById('fEmail').addEventListener('blur', validateEmail);

document.getElementById('toStep3').addEventListener('click', ()=>{
  const name = document.getElementById('fName').value.trim();
  const email = document.getElementById('fEmail').value.trim();
  if(!name || !email){
    showNotice('お名前とメールアドレスをご入力ください。'); return;
  }
  if(!validateEmail()){
    return;
  }
  renderSummary();
  goTo('step3');
});
document.getElementById('backTo2').addEventListener('click', ()=> goTo('step2'));

/* ---------------- summary ---------------- */
async function renderSummary(){
  const r = selectedRoute();
  const toAddr = document.getElementById('toAddress').value.trim();
  const fromCustomAddr = document.getElementById('fromCustomAddress').value.trim();
  const routeLabel = state.routeId === 'custom' ? `カスタムルート（${fromCustomAddr}）` : r.name;
  document.getElementById('sumRoute').textContent = `${routeLabel} → ${toAddr}`;
  const dateStr = state.date ? state.date.toLocaleDateString('ja-JP', {year:'numeric',month:'long',day:'numeric',weekday:'short'}) : '—';
  document.getElementById('sumDatetime').textContent = `${dateStr} ${state.time || ''}`;
  const returnRow = document.getElementById('sumReturnRow');
  if(state.returnEnabled){
    returnRow.classList.remove('hidden');
    const rd = new Date(state.returnDate);
    const rdStr = rd.toLocaleDateString('ja-JP', {year:'numeric',month:'long',day:'numeric',weekday:'short'});
    document.getElementById('sumReturn').textContent = `${rdStr} ${state.returnTime}`;
  } else {
    returnRow.classList.add('hidden');
  }
  document.getElementById('sumPax').textContent = `大人 ${state.adults}名 / 子供 ${state.children}名`;
  document.getElementById('sumLuggage').textContent = `荷物 ${state.bags} / サーフボード ${state.boards}`;

  const totalEl = document.getElementById('sumTotal');
  const loadingHint = document.getElementById('sumLoadingHint');
  totalEl.textContent = '計算中…';
  loadingHint.classList.remove('hidden');
  state.livePrice = null;

  try{
    const params = new URLSearchParams({
      routeId: state.routeId,
      returnEnabled: String(state.returnEnabled),
    });
    if(state.routeId === 'custom'){
      params.set('fromCustomAddress', document.getElementById('fromCustomAddress').value.trim());
      params.set('toAddress', toAddr);
    }
    const res = await fetch(`${ESTIMATE_ENDPOINT}?${params.toString()}`);
    if(!res.ok){ throw new Error('Estimate request failed: ' + res.status); }
    const data = await res.json();
    state.livePrice = data.price; // AUD — this is the authoritative amount actually sent to Stripe; never derived from the displayed JPY figure.
    updateTotalDisplay(data.price, data.priceJpy);
  }catch(e){
    console.warn('Live estimate failed, showing rough fallback instead.', e);
    totalEl.textContent = fmt(calcPrice()) + '〜'; // rough fallback with a "starting from" mark, AUD only (no live rate to convert with here)
    document.getElementById('sumAudHint').classList.add('hidden');
  }finally{
    loadingHint.classList.add('hidden');
  }
}

// Customers are Japanese, so the headline number is now JPY (converted at the live
// rate, display-only) — but the card is actually charged in AUD via Stripe, and that
// AUD amount is what's authoritative everywhere else (pricing math, the calendar
// hold, the owner's notification email). Showing it here too, smaller, is
// deliberate: hiding it would mean a Japanese customer's bank statement shows a
// number they never saw on screen, since their own card issuer applies its own
// conversion rate on top of this one.
// jpyPrice comes from the backend's /api/quote response (server-computed — see quote.js).
// This used to call api.frankfurter.app directly from the browser, but that API sends no
// CORS headers, so every customer's browser silently blocked the request and this always
// fell back to AUD-only in production, even though it passed local tests (which mock the
// network call and never actually enforce CORS). Doing the conversion server-side avoids
// depending on the customer's browser being able to reach a third-party API at all.
function updateTotalDisplay(audPrice, jpyPrice){
  const totalEl = document.getElementById('sumTotal');
  const audHintEl = document.getElementById('sumAudHint');
  if(jpyPrice){
    totalEl.textContent = `¥${jpyPrice.toLocaleString('ja-JP')}`;
    audHintEl.textContent = `実際のお引き落とし額（Stripe / AUD）: ${fmt(audPrice)}`;
    audHintEl.classList.remove('hidden');
  } else {
    totalEl.textContent = fmt(audPrice);
    audHintEl.classList.add('hidden');
  }
}

/* ---------------- Stripe ---------------- */
let stripe, cardElement;
try{
  stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
  const elements = stripe.elements();
  cardElement = elements.create('card', {
    style: { base: { fontSize:'14px', color:'#1D2621', fontFamily:'Inter, sans-serif', '::placeholder': { color:'#9AA39D' } } }
  });
  cardElement.mount('#card-element');
  cardElement.on('change', (event)=>{
    document.getElementById('card-errors').textContent = event.error ? event.error.message : '';
  });
}catch(e){
  document.getElementById('card-element').innerHTML = '<div style="font-size:13px;color:#5B655F;">カード入力欄（プレビュー環境）</div>';
}

/* ---------------- submit ---------------- */
document.getElementById('submitBooking').addEventListener('click', async ()=>{
  const submitBtn = document.getElementById('submitBooking');
  submitBtn.disabled = true;
  submitBtn.textContent = '送信中…';

  let paymentMethodId = null;
  if(stripe && cardElement){
    const result = await stripe.createPaymentMethod({ type:'card', card: cardElement });
    if(result.error){
      document.getElementById('card-errors').textContent = result.error.message;
      submitBtn.disabled = false;
      submitBtn.textContent = '予約をリクエストする';
      return;
    }
    paymentMethodId = result.paymentMethod.id;
  }

  const booking = {
    routeId: state.routeId,
    route: selectedRoute().name,
    fromCustomAddress: document.getElementById('fromCustomAddress').value.trim(),
    toAddress: document.getElementById('toAddress').value.trim(),
    date: state.date ? localDateStr(state.date) : null,
    time: state.time,
    returnEnabled: state.returnEnabled,
    returnDate: state.returnDate || null,
    returnTime: state.returnTime || null,
    adults: state.adults,
    children: state.children,
    bags: state.bags,
    boards: state.boards,
    name: document.getElementById('fName').value.trim(),
    email: document.getElementById('fEmail').value.trim(),
    phone: document.getElementById('fPhone').value.trim(),
    flight: document.getElementById('fFlight').value.trim(),
    stopRequested: state.stopRequested,
    stopDetail: document.getElementById('fStop').value.trim(),
    question: document.getElementById('fQuestion').value.trim(),
    price: state.livePrice ?? calcPrice(),
    paymentMethodId,
  };

  let ref = 'REF-' + Math.floor(100000 + Math.random()*900000);

  if(BOOKING_ENDPOINT){
    try{
      const apiRes = await fetch(BOOKING_ENDPOINT, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(booking)
      });
      const data = await apiRes.json().catch(()=>null);
      // The server may reject with a specific, customer-facing reason (e.g. a
      // schedule conflict, or — for Custom Route — an address it couldn't resolve
      // to a drive time) — show that instead of a generic failure message when
      // it's available.
      if(!apiRes.ok){ throw new Error((data && data.error) || ('Server responded with ' + apiRes.status)); }
      if(data && data.ref){ ref = data.ref; }
    }catch(e){
      console.error('Booking submission failed:', e);
      const isKnownReason = e.message && !e.message.startsWith('Server responded with');
      showNotice(isKnownReason ? e.message : '送信中にエラーが発生しました。時間をおいてもう一度お試しいただくか、メール（jpgbyron@gmail.com）にてご連絡ください。');
      submitBtn.disabled = false;
      submitBtn.textContent = '予約をリクエストする';
      return;
    }
  } else {
    console.log('Booking submitted (demo mode — no BOOKING_ENDPOINT configured yet):', booking);
  }

  document.getElementById('refNumber').textContent = ref;
  goTo('stepDone');
});

/* ---------------- address autocomplete ---------------- */
function initAddressAutocomplete(){
  if(!GOOGLE_MAPS_API_KEY) return; // no key set — fields stay as plain text inputs
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&language=ja&region=AU`;
  script.onload = ()=>{
    const autocompleteContainers = {};
    ['toAddress','fromCustomAddress','fStop'].forEach(id=>{
      try{
        const el = document.getElementById(id);
        if(el && window.google && window.google.maps && window.google.maps.places){
          const autocomplete = new google.maps.places.Autocomplete(el, { fields:['formatted_address','geometry','name'] });
          // Picking a suggestion doesn't reliably fire a plain 'blur' in every
          // browser — recheck availability the moment Google itself confirms a
          // place was chosen, for the two fields that actually affect Custom
          // Route's drive-time lookup.
          if(id === 'toAddress' || id === 'fromCustomAddress'){
            autocomplete.addListener('place_changed', ()=>{
              if(state.routeId === 'custom') loadAvailability();
            });
          }
          // Google appends this field's suggestion box to <body> synchronously right after
          // construction, so the newest .pac-container at this point belongs to this field.
          const containers = document.querySelectorAll('.pac-container');
          autocompleteContainers[id] = containers[containers.length - 1];

          el.addEventListener('focus', ()=>{
            // Hide any OTHER field's leftover dropdown, but never touch this field's own —
            // Google manages that one live while it's focused.
            Object.entries(autocompleteContainers).forEach(([otherId, container])=>{
              if(otherId !== id && container){
                container.style.display = 'none';
              }
            });
          });
        }
      }catch(e){
        console.warn('Address autocomplete failed to initialise for #' + id + ' — field still works as plain text.', e);
      }
    });
  };
  script.onerror = ()=>{
    console.warn('Google Maps script failed to load — address fields will work as plain text only.');
  };
  document.head.appendChild(script);
}

/* ---------------- init ---------------- */
pickupCal.render();
returnCal.render();
renderCapacityNote();
renderPaxCap();
initAddressAutocomplete();
loadAvailability();
</script>
</body>
</html>
