
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>サーフガイド予約 — Inquiry</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  /* ============================================================
     Same design system as booking-flow.html (Transport) so this
     page feels like the same site. Colors/fonts copied 1:1.
     ============================================================ */
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
  .brand{ display:flex; align-items:baseline; justify-content:space-between; margin-bottom: 28px; }
  .brand-name{ font-family:'Fraunces', serif; font-size: 20px; font-weight: 500; letter-spacing: 0.2px; color: var(--teal-deep); }
  .brand-sub{ font-size: 12px; color: var(--ink-soft); }
  .progress{ display:flex; gap: 6px; margin-bottom: 36px; }
  .progress-seg{ height: 3px; flex:1; background: var(--line); border-radius: 2px; overflow:hidden; }
  .progress-seg .fill{ height:100%; width:0%; background: var(--teal-deep); transition: width .35s ease; }
  .progress-seg.done .fill{ width:100%; }
  .progress-seg.active .fill{ width:100%; }
  .step-label{ font-size: 12px; color: var(--ink-soft); margin-bottom: 6px; }
  .step-num{ font-family:'Fraunces', serif; font-size: 46px; line-height: 1; color: var(--teal-deep); font-weight: 500; margin: 0 0 4px; }
  .step-title{ font-family:'Fraunces', serif; font-size: 22px; font-weight: 500; margin: 0 0 28px; color: var(--ink); }
  .panel{ background: var(--white); border: 1px solid var(--line); border-radius: var(--radius-m); padding: 24px; margin-bottom: 16px; }
  .field{ margin-bottom: 18px; }
  .field:last-child{ margin-bottom:0; }
  .field label{ display:block; font-size: 13px; font-weight: 600; color: var(--ink); margin-bottom: 6px; }
  .field .hint{ font-size: 12px; color: var(--ink-soft); margin-top: 4px; }
  select, input[type=text], input[type=tel], input[type=email], textarea{
    width:100%; font-family:'Inter',sans-serif; font-size: 14px; padding: 11px 12px;
    border: 1px solid var(--line); border-radius: var(--radius-s); background: var(--sand);
    color: var(--ink); outline:none;
  }
  select:focus, input:focus, textarea:focus{ border-color: var(--teal); background: var(--white); }
  textarea{ resize: vertical; min-height: 72px; }
  .optional-tag{ font-size:11px; font-weight:500; color: var(--ink-soft); margin-left:6px; }
  /* ---- pill choice group (pickup Yes/No, skill level) ---- */
  .pill-group{ display:flex; flex-wrap:wrap; gap:8px; }
  .pill{
    padding:10px 16px; border:1px solid var(--line); border-radius:999px; background: var(--sand);
    font-size:13px; font-weight:600; cursor:pointer; color: var(--ink); font-family:'Inter',sans-serif;
    transition: background .15s ease, color .15s ease, border-color .15s ease;
  }
  .pill:hover{ border-color: var(--teal); }
  .pill.selected{ background: var(--teal-deep); border-color: var(--teal-deep); color:#fff; }
  /* ---- rental toggle button (same shape as Transport's add-stop/add-return buttons) ---- */
  .toggle-btn{
    width:100%; padding:14px; border:1.5px solid var(--teal-deep); background: transparent;
    color: var(--teal-deep); font-weight:600; font-size:14px; border-radius:999px; cursor:pointer;
    margin-bottom:16px; font-family:'Inter',sans-serif;
  }
  .toggle-btn.active{ background: var(--teal-deep); color:#fff; }
  /* ---- rental gear checklist ---- */
  .check-row{ display:flex; align-items:center; justify-content:space-between; padding: 12px 0; border-bottom: 1px solid var(--sand-deep); }
  .check-row:last-child{ border-bottom:none; }
  .check-row .c-label{ font-size:14px; font-weight:500; }
  .check-row .c-note{ font-size:12px; color:var(--ink-soft); margin-top:2px; }
  .check-row input[type=checkbox]{ width:20px; height:20px; accent-color: var(--teal-deep); cursor:pointer; flex-shrink:0; }
  /* ---- people count stepper ---- */
  .stepper-row{ display:flex; align-items:center; justify-content:space-between; padding: 10px 0; border-bottom: 1px solid var(--sand-deep); }
  .stepper-row:last-child{ border-bottom:none; }
  .stepper-row .s-label{ font-size:14px; font-weight:500; }
  .stepper-row .s-note{ font-size:12px; color:var(--ink-soft); margin-top:2px; }
  .stepper-ctrl{ display:flex; align-items:center; gap:12px; }
  .stepper-ctrl button{ width:28px;height:28px;border-radius:50%; border:1px solid var(--line); background:#fff; cursor:pointer; font-size:15px; color:var(--teal-deep); line-height:1; }
  .stepper-ctrl button:disabled{ opacity:.35; cursor:not-allowed; }
  .stepper-ctrl .count{ width:16px; text-align:center; font-weight:600; font-size:14px; }
  .capacity-note{ font-size:12px; margin-top:12px; padding:10px 12px; background: #FBF0DF; border-radius:6px; color:#8A5A16; }
  /* ---- calendar (copied 1:1 from Transport) ---- */
  .cal-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
  .cal-head button{ background:none;border:1px solid var(--line);border-radius:6px; width:30px;height:30px;cursor:pointer;color:var(--teal-deep);font-size:14px; }
  .cal-month{ font-weight:600; font-size:14px; }
  .cal-grid{ display:grid; grid-template-columns: repeat(7,1fr); gap:4px; text-align:center; }
  .cal-dow{ font-size:11px; color:var(--ink-soft); padding-bottom:4px; }
  .cal-day{ aspect-ratio:1; display:flex; align-items:center; justify-content:center; font-size:13px; border-radius:8px; cursor:pointer; color:var(--ink); }
  .cal-day.disabled{ color:#C9BFA9; cursor:not-allowed; }
  .cal-day.blank{ visibility:hidden; }
  .cal-day:not(.disabled):not(.blank):not(.selected):hover{ background: var(--sand-deep); }
  .cal-day.selected{ background: var(--teal-deep); color:#fff; }
  /* ---- summary ---- */
  .summary-row{ display:flex; justify-content:space-between; gap:16px; font-size:13px; padding: 7px 0; color: var(--ink-soft); }
  .summary-row span:first-child{ flex-shrink:0; white-space:nowrap; }
  .summary-row span:last-child{ color: var(--ink); font-weight:500; text-align:right; }
  .summary-total{ display:flex; justify-content:space-between; align-items:baseline; margin-top:10px; padding-top:14px; border-top:1px solid var(--line); }
  .summary-total .t-label{ font-size:14px; font-weight:600; }
  .summary-total .t-amount{ font-family:'Fraunces',serif; font-size:26px; color:var(--teal-deep); }
  .summary-total .t-amount.quote-badge{
    font-family:'Inter',sans-serif; font-size:13px; font-weight:700; color: var(--teal-deep);
    background:#FBF0DF; padding:8px 16px; border-radius:999px; display:inline-block;
  }
  /* ---- buttons ---- */
  .actions{ display:flex; gap:10px; margin-top:20px; }
  .btn{ flex:1; padding: 14px 18px; border-radius: 999px; font-size:14px; font-weight:600; border:none; cursor:pointer; text-align:center; font-family:'Inter',sans-serif; }
  .btn-primary{ background: var(--teal-deep); color:#fff; }
  .btn-primary:hover{ background:#0F2723; }
  .btn-primary:disabled{ background:#B9C4BF; cursor:not-allowed; }
  .btn-ghost{ background:none; color: var(--ink-soft); flex:0 0 auto; padding:14px 8px; }
  /* ---- confirmation ---- */
  .confirm-wrap{ text-align:center; padding: 40px 10px; }
  .confirm-mark{ width:56px;height:56px;border-radius:50%; background:#EFF5F1; color:var(--teal-deep); display:flex;align-items:center;justify-content:center; margin:0 auto 20px; font-size:26px; }
  .confirm-wrap h2{ font-family:'Fraunces',serif; font-weight:500; font-size:24px; margin:0 0 10px; }
  .confirm-wrap p{ font-size:14px; color:var(--ink-soft); line-height:1.6; max-width:400px; margin:0 auto 22px; }
  .confirm-ref{ display:inline-block; font-size:12px; color:var(--ink-soft); border:1px solid var(--line); padding:6px 12px; border-radius:6px; }
  .hidden{ display:none !important; }
  .inline-notice{ background:#FBE7E0; color: var(--coral); border: 1px solid var(--coral); border-radius: var(--radius-s); padding: 12px 14px; font-size: 13px; margin-bottom: 20px; line-height: 1.5; }
  @media (max-width: 420px){ .step-num{ font-size:36px; } }
</style>
</head>
<body>
<div class="app">

  <div id="inlineNotice" class="inline-notice hidden"></div>

  <div class="brand">
    <div>
      <div class="brand-name">バイロンベイ サーフガイド</div>
      <div class="brand-sub">サーフレッスン・ツアーのお問い合わせ</div>
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
    <h2 class="step-title">ご希望内容</h2>

    <div class="panel">
      <div class="field">
        <label>興味のあるアクティビティ</label>
        <select id="activitySelect">
          <option value="" disabled selected>選択してください</option>
          <option value="half_day">半日サーフ送迎</option>
          <option value="two_session">2セッションサーフ送迎</option>
          <option value="photo">サーフフォト</option>
          <option value="beginner_guide">初心者サーフガイド</option>
          <option value="rental_board">レンタルサーフボード</option>
          <option value="video">サーフィンビデオ</option>
        </select>
      </div>
      <div class="field">
        <label id="paxFieldLabel">人数</label>
        <select id="paxSelect">
          <option value="" disabled selected>選択してください</option>
          <option value="1">1名</option>
          <option value="2">2名</option>
          <option value="3">3名</option>
          <option value="4">4名</option>
          <option value="5">5名</option>
          <option value="6">6名</option>
          <option value="7+">7名以上</option>
        </select>
        <div class="hint hidden" id="paxRentalHint">レンタルサーフボードは在庫数の都合上、1回のご注文につき最大6枚までとなります。</div>
      </div>
      <div class="field">
        <label>ピックアップ</label>
        <div class="pill-group" id="pickupGroup">
          <div class="pill" data-val="yes">有り</div>
          <div class="pill" data-val="no">無し</div>
        </div>
      </div>
      <div class="field hidden" id="pickupAddressField">
        <label>送迎先の住所</label>
        <input type="text" id="pickupAddress" placeholder="ホテル名、住所など" />
      </div>
      <div class="field" id="skillSingleField">
        <label>スキルレベル</label>
        <div class="pill-group" id="skillGroup">
          <div class="pill" data-val="first">初めて</div>
          <div class="pill" data-val="beginner">初心者</div>
          <div class="pill" data-val="intermediate">中級</div>
          <div class="pill" data-val="expert">エキスパート</div>
        </div>
      </div>
      <div class="field hidden" id="skillBreakdownField">
        <label>スキルレベル（人数内訳）</label>
        <div class="stepper-row">
          <div class="s-label">初めて</div>
          <div class="stepper-ctrl">
            <button type="button" class="skill-dec" data-skill="first">−</button>
            <span class="count" data-skill-count="first">0</span>
            <button type="button" class="skill-inc" data-skill="first">＋</button>
          </div>
        </div>
        <div class="stepper-row">
          <div class="s-label">初心者</div>
          <div class="stepper-ctrl">
            <button type="button" class="skill-dec" data-skill="beginner">−</button>
            <span class="count" data-skill-count="beginner">0</span>
            <button type="button" class="skill-inc" data-skill="beginner">＋</button>
          </div>
        </div>
        <div class="stepper-row">
          <div class="s-label">中級</div>
          <div class="stepper-ctrl">
            <button type="button" class="skill-dec" data-skill="intermediate">−</button>
            <span class="count" data-skill-count="intermediate">0</span>
            <button type="button" class="skill-inc" data-skill="intermediate">＋</button>
          </div>
        </div>
        <div class="stepper-row">
          <div class="s-label">エキスパート</div>
          <div class="stepper-ctrl">
            <button type="button" class="skill-dec" data-skill="expert">−</button>
            <span class="count" data-skill-count="expert">0</span>
            <button type="button" class="skill-inc" data-skill="expert">＋</button>
          </div>
        </div>
        <div class="capacity-note" id="skillCapacityNote">先に人数を選択してください。</div>
      </div>
    </div>

    <button type="button" class="toggle-btn" id="rentalToggleBtn">＋ レンタルを希望する</button>
    <div class="panel hidden" id="rentalPanel">
      <div class="field" id="wetsuitYesNoField">
        <label>ウェットスーツ</label>
        <div class="pill-group rental-yn" data-item="wetsuit">
          <div class="pill" data-val="yes">有り</div>
          <div class="pill" data-val="no">無し</div>
        </div>
      </div>
      <div class="field hidden" id="wetsuitQtyField">
        <div class="stepper-row">
          <div class="s-label">ウェットスーツ</div>
          <div class="stepper-ctrl">
            <button type="button" class="rental-dec" data-item="wetsuit">−</button>
            <span class="count" data-rental-count="wetsuit">0</span>
            <button type="button" class="rental-inc" data-item="wetsuit">＋</button>
          </div>
        </div>
      </div>
      <div class="field hidden" id="wetsuitSizeField">
        <label>サイズ</label>
        <div class="pill-group" id="wetsuitSizeGroup">
          <div class="pill" data-val="S">S</div>
          <div class="pill" data-val="M">M</div>
          <div class="pill" data-val="L">L</div>
        </div>
      </div>
      <div class="field hidden" id="wetsuitSizeBreakdownField">
        <label>サイズ内訳</label>
        <div class="stepper-row">
          <div class="s-label">S</div>
          <div class="stepper-ctrl">
            <button type="button" class="wetsuitsize-dec" data-size="S">−</button>
            <span class="count" data-wetsuitsize-count="S">0</span>
            <button type="button" class="wetsuitsize-inc" data-size="S">＋</button>
          </div>
        </div>
        <div class="stepper-row">
          <div class="s-label">M</div>
          <div class="stepper-ctrl">
            <button type="button" class="wetsuitsize-dec" data-size="M">−</button>
            <span class="count" data-wetsuitsize-count="M">0</span>
            <button type="button" class="wetsuitsize-inc" data-size="M">＋</button>
          </div>
        </div>
        <div class="stepper-row">
          <div class="s-label">L</div>
          <div class="stepper-ctrl">
            <button type="button" class="wetsuitsize-dec" data-size="L">−</button>
            <span class="count" data-wetsuitsize-count="L">0</span>
            <button type="button" class="wetsuitsize-inc" data-size="L">＋</button>
          </div>
        </div>
        <div class="capacity-note" id="wetsuitSizeCapacityNote">本数を選択してください。</div>
      </div>

      <div class="field" id="boardYesNoField" style="margin-top:22px;">
        <label>サーフボード</label>
        <div class="pill-group rental-yn" data-item="board">
          <div class="pill" data-val="yes">有り</div>
          <div class="pill" data-val="no">無し</div>
        </div>
      </div>
      <div class="field hidden" id="boardQtyField" style="margin-top:22px;">
        <div class="stepper-row">
          <div class="s-label">サーフボード</div>
          <div class="stepper-ctrl">
            <button type="button" class="rental-dec" data-item="board">−</button>
            <span class="count" data-rental-count="board">0</span>
            <button type="button" class="rental-inc" data-item="board">＋</button>
          </div>
        </div>
      </div>
      <div class="field hidden" id="boardTypeField">
        <label>サイズ</label>
        <div class="pill-group" id="boardTypeGroup">
          <div class="pill" data-val="short">ショート</div>
          <div class="pill" data-val="long">ロング</div>
          <div class="pill" data-val="soft">ソフトボード</div>
        </div>
      </div>
      <div class="field hidden" id="boardTypeBreakdownField">
        <label>タイプ内訳</label>
        <div class="stepper-row">
          <div class="s-label">ショート</div>
          <div class="stepper-ctrl">
            <button type="button" class="boardtype-dec" data-type="short">−</button>
            <span class="count" data-boardtype-count="short">0</span>
            <button type="button" class="boardtype-inc" data-type="short">＋</button>
          </div>
        </div>
        <div class="stepper-row">
          <div class="s-label">ロング</div>
          <div class="stepper-ctrl">
            <button type="button" class="boardtype-dec" data-type="long">−</button>
            <span class="count" data-boardtype-count="long">0</span>
            <button type="button" class="boardtype-inc" data-type="long">＋</button>
          </div>
        </div>
        <div class="stepper-row">
          <div class="s-label">ソフトボード</div>
          <div class="stepper-ctrl">
            <button type="button" class="boardtype-dec" data-type="soft">−</button>
            <span class="count" data-boardtype-count="soft">0</span>
            <button type="button" class="boardtype-inc" data-type="soft">＋</button>
          </div>
        </div>
        <div class="capacity-note" id="boardTypeCapacityNote">本数を選択してください。</div>
      </div>

      <div class="field" id="bodyboardYesNoField" style="margin-top:22px;">
        <label>ボディボード</label>
        <div class="pill-group rental-yn" data-item="bodyboard">
          <div class="pill" data-val="yes">有り</div>
          <div class="pill" data-val="no">無し</div>
        </div>
      </div>
      <div class="field hidden" id="bodyboardQtyField" style="margin-top:22px;">
        <div class="stepper-row">
          <div class="s-label">ボディボード</div>
          <div class="stepper-ctrl">
            <button type="button" class="rental-dec" data-item="bodyboard">−</button>
            <span class="count" data-rental-count="bodyboard">0</span>
            <button type="button" class="rental-inc" data-item="bodyboard">＋</button>
          </div>
        </div>
      </div>

      <div class="field" id="snorkelYesNoField" style="margin-top:22px;margin-bottom:0;">
        <label>シュノーケルセット</label>
        <div class="pill-group rental-yn" data-item="snorkel">
          <div class="pill" data-val="yes">有り</div>
          <div class="pill" data-val="no">無し</div>
        </div>
      </div>
      <div class="field hidden" id="snorkelQtyField" style="margin-top:22px;margin-bottom:0;">
        <div class="stepper-row">
          <div class="s-label">シュノーケルセット</div>
          <div class="stepper-ctrl">
            <button type="button" class="rental-dec" data-item="snorkel">−</button>
            <span class="count" data-rental-count="snorkel">0</span>
            <button type="button" class="rental-inc" data-item="snorkel">＋</button>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="field">
        <label>ご希望日</label>
        <div class="cal-head">
          <button id="prevMonth" type="button">‹</button>
          <div class="cal-month" id="calMonthLabel"></div>
          <button id="nextMonth" type="button">›</button>
        </div>
        <div class="cal-grid" id="calGrid"></div>
        <div class="hint">複数日をご希望の場合は、日付を続けてクリックして選択できます。波・天候によりご希望に添えない場合があります。</div>
      </div>
      <div class="field">
        <label>開始時間</label>
        <select id="timeSelect" class="time-select"></select>
        <div class="hint">当日の潮位・コンディションにより開始時間の調整をお願いする場合があります。</div>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-primary" id="toStep2">つぎへ</button>
    </div>
  </section>

  <!-- STEP 2 -->
  <section id="step2" class="hidden">
    <div class="step-label">STEP 2 / 3</div>
    <p class="step-num">02</p>
    <h2 class="step-title">お客様情報</h2>

    <div class="panel">
      <div class="field">
        <label>お名前</label>
        <input type="text" id="fName" placeholder="山田 太郎" />
      </div>
      <div class="field">
        <label>メールアドレス</label>
        <input type="email" id="fEmail" placeholder="you@example.com" />
        <div class="error-msg" id="emailError" style="font-size:12px;color:var(--coral);margin-top:4px;min-height:14px;"></div>
      </div>
      <div class="field">
        <label>オーストラリアで繋がる電話番号 <span class="optional-tag">任意</span></label>
        <input type="tel" id="fPhone" placeholder="+61 4xx xxx xxx" />
      </div>
    </div>

    <div class="panel">
      <div class="field">
        <label>ご質問・ご要望 <span class="optional-tag">任意</span></label>
        <textarea id="fQuestion" placeholder="持病、泳力、その他ご相談したいことなど"></textarea>
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
    <h2 class="step-title">内容確認</h2>

    <div class="panel">
      <div class="summary-row"><span>アクティビティ</span><span id="sumActivity">—</span></div>
      <div class="summary-row"><span id="sumPaxLabel">人数</span><span id="sumPax">—</span></div>
      <div class="summary-row"><span>ピックアップ</span><span id="sumPickup">—</span></div>
      <div class="summary-row"><span>スキルレベル</span><span id="sumSkill">—</span></div>
      <div class="summary-row"><span>レンタル</span><span id="sumRental">—</span></div>
      <div class="summary-row hidden" id="sumRentalCostRow"><span>レンタル料金</span><span id="sumRentalCost">—</span></div>
      <div class="summary-row"><span>ご希望日</span><span id="sumDatetime">—</span></div>
      <div class="summary-row"><span>開始時間</span><span id="sumTime">—</span></div>
      <div class="summary-row"><span>お名前</span><span id="sumName">—</span></div>
      <div class="summary-row"><span>メール</span><span id="sumEmail">—</span></div>
      <div class="summary-total">
        <span class="t-label">料金</span>
        <span class="t-amount" id="sumPrice">—</span>
      </div>
    </div>

    <div class="panel">
      <div class="hint">内容確認後、通常1〜2営業日以内に折り返しご連絡いたします。</div>
    </div>

    <div class="actions">
      <button class="btn btn-ghost" id="backTo2">戻る</button>
      <button class="btn btn-primary" id="submitInquiry">問い合わせを送信する</button>
    </div>
  </section>

  <!-- CONFIRMATION -->
  <section id="stepDone" class="hidden">
    <div class="confirm-wrap">
      <div class="confirm-mark">✓</div>
      <h2>お問い合わせを受け付けました</h2>
      <p>内容を確認のうえ、通常1〜2営業日以内にメールにてご連絡いたします。</p>
      <div class="confirm-ref" id="refNumber">REF-000000</div>
    </div>
  </section>

</div>

<script>
/* ============================================================
   Surf Guide inquiry form.
   Mirrors booking-flow.html (Transport)'s structure/style, but
   this is an INQUIRY form, not a paid booking — Step 3 shows a
   starting-from JPY price per activity (see PRICE_JPY below) for
   reference only, there is no Stripe step or card charge here.
   Wire SURF_ENDPOINT below to a real backend once one exists
   (see note near the bottom of this script for what that
   backend endpoint needs to do).
   ============================================================ */

// These point at the two new endpoints (api/surf-inquiry.js and
// api/surf-availability.js) once they're added to the fuel-surcharge-backend
// Vercel project and deployed. Until then this form still works in demo
// mode (no email sent, no real availability check, just a fake reference
// number) — leave both blank to stay in demo mode.
const SURF_ENDPOINT = 'https://fuel-surcharge-backend.vercel.app/api/surf-inquiry';
const SURF_AVAILABILITY_ENDPOINT = 'https://fuel-surcharge-backend.vercel.app/api/surf-availability';

const ACTIVITY_LABELS = {
  half_day: '半日サーフ送迎',
  two_session: '2セッションサーフ送迎',
  photo: 'サーフフォト',
  beginner_guide: '初心者サーフガイド',
  rental_board: 'レンタルサーフボード',
  video: 'サーフィンビデオ',
};
// Fixed prices in JPY (plain numbers, so rental add-ons can be added on
// top and the total re-formatted) — shown on the Step 3 review as a plain
// ¥ amount, no 〜 mark. beginner_guide is `null` on purpose: it's run by
// an affiliate surf school at a price you don't set, so Step 3 shows an
// "お見積り希望" badge there instead of a number (see renderSummary below).
const PRICE_JPY = {
  half_day: 15000,
  two_session: 30000,
  photo: 5000,
  beginner_guide: null,
  rental_board: 6000,
  video: 5000,
};

// ⚠️ PLACEHOLDER PRICES — replace with your real per-item, per-day rates
// before this goes live. These only apply to the "＋レンタルを希望する"
// add-on panel (renting gear alongside a guided activity); the standalone
// レンタルサーフボード product still uses its own Stripe Payment Link and
// isn't affected by this table. Assumed to be charged per day (multiplied
// by however many dates are selected) — tell me if any of these should
// instead be a flat one-time fee regardless of day count.
const RENTAL_ADDON_PRICES_JPY = {
  wetsuit: 2000,   // per day
  board: 3500,     // per day (same regardless of ショート/ロング/ソフトボード)
  bodyboard: 1500, // per day
  snorkel: 1000,   // per day
};

function formatJpy(n){ return '¥' + n.toLocaleString('ja-JP'); }

// サーフフォト and サーフィンビデオ are billed per hour — PRICE_JPY holds
// their HOURLY rate (¥5,000), not a flat total, unlike every other activity
// in that table. state.pax holds the chosen duration in minutes as a string
// ('60'/'120'/'180') when this activity's field mode is 'duration' (see
// FIELD_MODE_CONFIG), so scale the hourly rate by that here instead of
// always showing the flat ¥5,000 no matter which duration was picked.
const DURATION_BILLED_ACTIVITIES = ['photo', 'video'];
function basePriceFor(activity){
  const price = PRICE_JPY[activity];
  if(price === null || price === undefined) return price;
  if(DURATION_BILLED_ACTIVITIES.includes(activity) && state.pax){
    const hours = parseInt(state.pax, 10) / 60;
    return Math.round(price * hours);
  }
  return price;
}

// レンタルサーフボード IS the rental (its own Stripe product), so the
// add-on panel only ever applies to every other activity.
function rentalAddonPerDay(){
  if(!state.rentalRequested) return 0;
  let total = 0;
  if(currentFieldMode === 'pax'){
    const q = state.rentalQty;
    total += q.wetsuit * RENTAL_ADDON_PRICES_JPY.wetsuit;
    total += q.board * RENTAL_ADDON_PRICES_JPY.board;
    total += q.bodyboard * RENTAL_ADDON_PRICES_JPY.bodyboard;
    total += q.snorkel * RENTAL_ADDON_PRICES_JPY.snorkel;
  } else {
    const r = state.rental;
    if(r.wetsuit === 'yes') total += RENTAL_ADDON_PRICES_JPY.wetsuit;
    if(r.board === 'yes') total += RENTAL_ADDON_PRICES_JPY.board;
    if(r.bodyboard === 'yes') total += RENTAL_ADDON_PRICES_JPY.bodyboard;
    if(r.snorkel === 'yes') total += RENTAL_ADDON_PRICES_JPY.snorkel;
  }
  return total;
}
function rentalAddonTotal(){
  const days = Math.max(1, state.dates.length);
  return rentalAddonPerDay() * days;
}

const SKILL_LABELS = {
  first: '初めて', beginner: '初心者', intermediate: '中級', expert: 'エキスパート',
};
const WETSUIT_SIZE_LABELS = { S:'S', M:'M', L:'L' };
const BOARD_TYPE_LABELS = { short:'ショート', long:'ロング', soft:'ソフトボード' };

// Which "second field" mode each activity uses — see rebuildSecondaryField()
// below. Anything not listed here defaults to plain headcount ('pax').
const ACTIVITY_FIELD_MODE = {
  rental_board: 'boards',
  photo: 'duration',
  video: 'duration',
};
const FIELD_MODE_CONFIG = {
  pax: {
    label: '人数',
    options: [['1','1名'],['2','2名'],['3','3名'],['4','4名'],['5','5名'],['6','6名'],['7+','7名以上']],
    hint: null,
    errorMessage: '人数を選択してください。',
  },
  boards: {
    label: '必要な本数',
    options: [['1','1枚'],['2','2枚'],['3','3枚'],['4','4枚'],['5','5枚'],['6','6枚']],
    hint: 'レンタルサーフボードは在庫数の都合上、1回のご注文につき最大6枚までとなります。',
    errorMessage: '本数を選択してください。',
  },
  duration: {
    label: '撮影時間',
    options: [['60','1時間'],['120','2時間'],['180','3時間以上（ご相談）']],
    hint: '当日の天候・混雑状況により前後する場合がございます。',
    errorMessage: '撮影時間を選択してください。',
  },
};
function fieldModeFor(activity){ return ACTIVITY_FIELD_MODE[activity] || 'pax'; }

const state = {
  activity: null,
  pax: null,
  pickup: null,
  // Single-value skill level, used when the activity has no real headcount
  // to break a group down by (レンタルサーフボード / サーフフォト / サーフィンビデオ).
  skill: null,
  // Per-level headcount breakdown, used instead of `skill` for headcount
  // activities (半日サーフ送迎, 2セッションサーフ送迎, 初心者サーフガイド) — see
  // rebuildSecondaryField / updateFieldModeVisibility below. Must sum to `pax`.
  skillCounts: { first: 0, beginner: 0, intermediate: 0, expert: 0 },
  rentalRequested: false,
  // Single yes/no + size/type, used in non-headcount modes.
  rental: {
    wetsuit: null, wetsuitSize: null,
    board: null, boardType: null,
    bodyboard: null,
    snorkel: null,
    // Per-size/type breakdowns, used in headcount modes so a group renting
    // 3 wetsuits can say "1 x S, 2 x M" instead of one size for all of them.
    // Each must sum to the matching rentalQty (wetsuit / board) below.
    wetsuitSizeCounts: { S: 0, M: 0, L: 0 },
    boardTypeCounts: { short: 0, long: 0, soft: 0 },
  },
  // Per-item quantities (0..pax), used in headcount modes so a group can
  // rent, say, 2 wetsuits and 3 boards rather than one flat yes/no.
  rentalQty: { wetsuit: 0, board: 0, bodyboard: 0, snorkel: 0 },
  dates: [], // multiple dates can be selected — see makeCalendar below
  time: null,
};
let calCursor = new Date();
calCursor.setDate(1);

/* ---------------- booked-out dates / free time slots ----------------
   PHASE 1 (shared calendar, real time-blocks): Ryu is a solo operator, so
   every booking — Transport included — now competes for the same person's
   time on ONE shared Google Calendar. A day is no longer simply "open" or
   "fully booked": api/surf-availability.js returns, PER ACTIVITY (since
   each one occupies a different amount of time), which dates have NO
   valid start time left (guideBusyDates) and which start times remain
   free on the rest (slotsByDate). This is why availability is now fetched
   per-activity (and re-fetched whenever the activity, or a photo/video
   duration choice, changes) rather than once for the whole page:
     - guideBusyDates: dates with zero free slots for the CURRENTLY
       selected activity/duration — disables that date in the calendar.
     - slotsByDate: { 'YYYY-MM-DD': ['07:00','07:30',...] } — free start
       times on every other date, used to populate the time dropdown.
     - rentalBoardCounts: { 'YYYY-MM-DD': boardsAlreadyReserved } —
       レンタルサーフボード's separate inventory cap (6 boards/day), layered
       on top of (not instead of) the delivery/pickup time-slot check.
   If the endpoint is blank or a fetch fails, everything stays open (fails
   open, not closed) rather than blocking the whole form. */
const guideBusyDates = new Set();
const slotsByDate = {};
const rentalBoardCounts = {};
let availabilityRequestId = 0; // guards a slow, now-stale fetch from clobbering a newer one

function requestedBoardCount(){
  const n = parseInt(state.pax, 10);
  if(!n || isNaN(n)) return 1;
  return Math.max(1, Math.min(6, n));
}

function isDateDisabled(dateObj){
  const key = dateObj.toISOString().slice(0,10);
  if(guideBusyDates.has(key)) return true; // no free start time at all for this activity/duration
  if(state.activity === 'rental_board'){
    const already = rentalBoardCounts[key] || 0;
    if((already + requestedBoardCount()) > 6) return true;
  }
  return false;
}

// Mirrors the server-side lookup in api/surf-availability.js, just to ask
// for the right slots — the server remains authoritative on the actual
// duration used when the inquiry is submitted.
const CLIENT_ACTIVITY_DURATION_MIN = { half_day: 180, two_session: 360, beginner_guide: 180 };
function currentDurationMinForAvailability(){
  if(state.activity === 'photo' || state.activity === 'video'){
    const n = parseInt(state.pax, 10);
    return [60,120,180].includes(n) ? n : 60;
  }
  if(state.activity === 'rental_board') return 60;
  return CLIENT_ACTIVITY_DURATION_MIN[state.activity] || 180;
}

async function loadAvailability(){
  if(!SURF_AVAILABILITY_ENDPOINT || !state.activity) return;
  const myRequestId = ++availabilityRequestId;
  try{
    const today = new Date();
    const end = new Date(today); end.setDate(end.getDate() + 180);
    const fmt = d => d.toISOString().slice(0,10);
    const durationMin = currentDurationMinForAvailability();
    const url = `${SURF_AVAILABILITY_ENDPOINT}?activity=${encodeURIComponent(state.activity)}&start=${fmt(today)}&end=${fmt(end)}&durationMin=${durationMin}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('Server responded with ' + res.status);
    const data = await res.json();
    if(myRequestId !== availabilityRequestId) return; // superseded by a newer request (e.g. activity changed again while this was in flight)
    guideBusyDates.clear();
    Object.keys(slotsByDate).forEach(k => delete slotsByDate[k]);
    (data.guideBusyDates || []).forEach(d => guideBusyDates.add(d));
    Object.assign(slotsByDate, data.slotsByDate || {});
    Object.keys(rentalBoardCounts).forEach(k => delete rentalBoardCounts[k]);
    Object.assign(rentalBoardCounts, data.rentalBoardCounts || {});
    surfCal.render();
    updateTimeOptionsForSelectedDates();
  }catch(e){
    console.error('Availability check failed (calendar will show all future dates as open):', e);
  }
}

/* ---------------- activity / pax selects ---------------- */
let currentFieldMode = 'pax';

// The second field in Step 1 means something different depending on the
// activity: headcount ('pax') for guide-led activities, board quantity
// ('boards') for レンタルサーフボード, or session length ('duration') for
// サーフフォト/サーフィンビデオ. This rebuilds its label + option list to
// match whichever mode the current activity uses (see ACTIVITY_FIELD_MODE /
// FIELD_MODE_CONFIG above).
function rebuildSecondaryField(){
  const mode = fieldModeFor(state.activity);
  const modeChanged = mode !== currentFieldMode;
  currentFieldMode = mode;
  const cfg = FIELD_MODE_CONFIG[mode];

  document.getElementById('paxFieldLabel').textContent = cfg.label;
  document.getElementById('sumPaxLabel').textContent = cfg.label;

  if(modeChanged){
    const sel = document.getElementById('paxSelect');
    sel.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = ''; placeholder.disabled = true; placeholder.selected = true;
    placeholder.textContent = '選択してください';
    sel.appendChild(placeholder);
    cfg.options.forEach(([value, label])=>{
      const opt = document.createElement('option');
      opt.value = value; opt.textContent = label;
      sel.appendChild(opt);
    });
    state.pax = null; // the field's meaning just changed — start fresh rather than keep a stale value
    // Headcount breakdowns (skill level / rental quantities) only make
    // sense tied to a real headcount — clear them on every mode switch so
    // stale numbers from a different activity don't resurface later.
    state.skillCounts = { first: 0, beginner: 0, intermediate: 0, expert: 0 };
    state.rentalQty = { wetsuit: 0, board: 0, bodyboard: 0, snorkel: 0 };
    state.rental.wetsuitSizeCounts = { S: 0, M: 0, L: 0 };
    state.rental.boardTypeCounts = { short: 0, long: 0, soft: 0 };
  }

  const hintEl = document.getElementById('paxRentalHint');
  if(cfg.hint){ hintEl.textContent = cfg.hint; hintEl.classList.remove('hidden'); }
  else { hintEl.classList.add('hidden'); }

  updateFieldModeVisibility();
}

// How many units (people / boards / etc.) the current "pax" value allows —
// used as the cap for both the skill-level breakdown and rental quantity
// steppers. '7+' is treated as 7 for this purpose.
function paxCapacity(){
  const n = parseInt(state.pax, 10);
  return (n && !isNaN(n)) ? n : 0;
}
function skillTotal(){
  return Object.values(state.skillCounts).reduce((a, b) => a + b, 0);
}
function updateSkillCapacityNote(){
  const cap = paxCapacity();
  const total = skillTotal();
  const note = document.getElementById('skillCapacityNote');
  if(cap === 0){ note.textContent = '先に人数を選択してください。'; return; }
  note.textContent = total === cap
    ? `合計 ${total} / ${cap} 名 ✓`
    : `人数に合わせて内訳を入力してください（合計 ${total} / ${cap} 名）。`;
}
function renderSkillSteppers(){
  const cap = paxCapacity();
  const total = skillTotal();
  Object.keys(state.skillCounts).forEach(key=>{
    document.querySelector(`[data-skill-count="${key}"]`).textContent = state.skillCounts[key];
  });
  document.querySelectorAll('.skill-inc').forEach(btn=>{ btn.disabled = total >= cap; });
  document.querySelectorAll('.skill-dec').forEach(btn=>{
    const key = btn.getAttribute('data-skill');
    btn.disabled = state.skillCounts[key] <= 0;
  });
  updateSkillCapacityNote();
}
// Generic helper: trim a {key: count} breakdown down to `cap` by removing
// from whichever bucket currently holds the most, until the total fits —
// used when a quantity shrinks out from under an existing size/type split.
function clampBreakdown(counts, cap){
  while(Object.values(counts).reduce((a,b)=>a+b,0) > cap){
    const key = Object.keys(counts).sort((a,b)=> counts[b]-counts[a])[0];
    counts[key]--;
  }
}
function breakdownTotal(counts){
  return Object.values(counts).reduce((a,b)=>a+b,0);
}
function renderSizeBreakdown({ counts, cap, countAttr, incClass, decClass, noteId, unit }){
  const total = breakdownTotal(counts);
  Object.keys(counts).forEach(key=>{
    const el = document.querySelector(`[${countAttr}="${key}"]`);
    if(el) el.textContent = counts[key];
  });
  document.querySelectorAll(`.${incClass}`).forEach(btn=>{ btn.disabled = total >= cap; });
  document.querySelectorAll(`.${decClass}`).forEach(btn=>{
    const key = btn.getAttribute('data-size') || btn.getAttribute('data-type');
    btn.disabled = counts[key] <= 0;
  });
  const note = document.getElementById(noteId);
  if(cap === 0){ note.textContent = '本数を選択してください。'; return; }
  note.textContent = total === cap
    ? `合計 ${total} / ${cap} ${unit} ✓`
    : `本数に合わせて内訳を入力してください（合計 ${total} / ${cap} ${unit}）。`;
}
function renderWetsuitSizeBreakdown(){
  renderSizeBreakdown({
    counts: state.rental.wetsuitSizeCounts, cap: state.rentalQty.wetsuit,
    countAttr: 'data-wetsuitsize-count', incClass: 'wetsuitsize-inc', decClass: 'wetsuitsize-dec',
    noteId: 'wetsuitSizeCapacityNote', unit: '着',
  });
}
function renderBoardTypeBreakdown(){
  renderSizeBreakdown({
    counts: state.rental.boardTypeCounts, cap: state.rentalQty.board,
    countAttr: 'data-boardtype-count', incClass: 'boardtype-inc', decClass: 'boardtype-dec',
    noteId: 'boardTypeCapacityNote', unit: '枚',
  });
}

// Wetsuit size / board type only need asking about once gear is actually
// being rented — in either mode ("有り" pill, or a stepper count above 0).
// In headcount mode this is the size/type BREAKDOWN (must sum to the
// quantity rented); otherwise it's the original single pill.
function updateGearDetailVisibility(){
  const isPax = currentFieldMode === 'pax';
  const wetsuitActive = isPax ? state.rentalQty.wetsuit > 0 : state.rental.wetsuit === 'yes';
  const boardActive = isPax ? state.rentalQty.board > 0 : state.rental.board === 'yes';
  document.getElementById('wetsuitSizeField').classList.toggle('hidden', !(wetsuitActive && !isPax));
  document.getElementById('wetsuitSizeBreakdownField').classList.toggle('hidden', !(wetsuitActive && isPax));
  document.getElementById('boardTypeField').classList.toggle('hidden', !(boardActive && !isPax));
  document.getElementById('boardTypeBreakdownField').classList.toggle('hidden', !(boardActive && isPax));
  if(isPax){ renderWetsuitSizeBreakdown(); renderBoardTypeBreakdown(); }
}
function renderRentalSteppers(){
  const cap = paxCapacity();
  Object.keys(state.rentalQty).forEach(key=>{
    const el = document.querySelector(`[data-rental-count="${key}"]`);
    if(el) el.textContent = state.rentalQty[key];
  });
  document.querySelectorAll('.rental-inc').forEach(btn=>{
    const key = btn.getAttribute('data-item');
    btn.disabled = state.rentalQty[key] >= cap;
  });
  document.querySelectorAll('.rental-dec').forEach(btn=>{
    const key = btn.getAttribute('data-item');
    btn.disabled = state.rentalQty[key] <= 0;
  });
  // The item quantity may have just shrunk below an existing size/type
  // split — trim it down to fit rather than leaving it silently over-cap.
  clampBreakdown(state.rental.wetsuitSizeCounts, state.rentalQty.wetsuit);
  clampBreakdown(state.rental.boardTypeCounts, state.rentalQty.board);
  updateGearDetailVisibility();
}

// Switches between the single-value skill pill / yes-no rental pills
// (レンタルサーフボード, サーフフォト, サーフィンビデオ — no tracked headcount to
// break a group down by) and the per-person breakdown steppers (半日サーフ送迎,
// 2セッションサーフ送迎, 初心者サーフガイド — real headcount activities).
function updateFieldModeVisibility(){
  const isPax = currentFieldMode === 'pax';
  document.getElementById('skillSingleField').classList.toggle('hidden', isPax);
  document.getElementById('skillBreakdownField').classList.toggle('hidden', !isPax);
  ['wetsuit','board','bodyboard','snorkel'].forEach(item=>{
    document.getElementById(`${item}YesNoField`).classList.toggle('hidden', isPax);
    document.getElementById(`${item}QtyField`).classList.toggle('hidden', !isPax);
  });
  updateGearDetailVisibility();
  if(isPax){ renderSkillSteppers(); renderRentalSteppers(); }
}

function onActivityChange(){
  const isRental = state.activity === 'rental_board';

  // レンタルサーフボード IS the rental — the separate "add rental gear to my
  // guided session" panel doesn't apply, so hide it and clear any selection.
  const toggleBtn = document.getElementById('rentalToggleBtn');
  const panel = document.getElementById('rentalPanel');
  toggleBtn.classList.toggle('hidden', isRental);
  if(isRental && state.rentalRequested){
    state.rentalRequested = false;
    toggleBtn.classList.remove('active');
    toggleBtn.textContent = '＋ レンタルを希望する';
    panel.classList.add('hidden');
  } else if(!isRental){
    panel.classList.toggle('hidden', !state.rentalRequested);
  }

  rebuildSecondaryField();
  surfCal.render(); // immediate repaint with whatever data we have; loadAvailability() repaints again once the fresh, activity-specific data arrives
  loadAvailability(); // each activity occupies a different amount of time — refetch its own slots
}
document.getElementById('activitySelect').addEventListener('change', (e)=>{ state.activity = e.target.value; onActivityChange(); });
document.getElementById('paxSelect').addEventListener('change', (e)=>{
  state.pax = e.target.value;
  if(state.activity === 'rental_board') surfCal.render(); // board-count cap only, no duration change
  if(currentFieldMode === 'duration') loadAvailability(); // 撮影時間 just changed how long each slot needs to be
  if(currentFieldMode === 'pax'){
    // Headcount just changed — if it went down, trim any breakdown/quantities
    // that no longer fit rather than leaving them silently over-cap.
    const cap = paxCapacity();
    while(skillTotal() > cap){
      const key = Object.keys(state.skillCounts).sort((a,b)=> state.skillCounts[b]-state.skillCounts[a])[0];
      state.skillCounts[key]--;
    }
    Object.keys(state.rentalQty).forEach(k=>{ if(state.rentalQty[k] > cap) state.rentalQty[k] = cap; });
    renderSkillSteppers();
    renderRentalSteppers();
  }
});
rebuildSecondaryField(); // set the initial label/options to match the 'pax' default

/* ---------------- pickup pill group ---------------- */
document.querySelectorAll('#pickupGroup .pill').forEach(pill=>{
  pill.addEventListener('click', ()=>{
    document.querySelectorAll('#pickupGroup .pill').forEach(p=>p.classList.remove('selected'));
    pill.classList.add('selected');
    state.pickup = pill.getAttribute('data-val');
    document.getElementById('pickupAddressField').classList.toggle('hidden', state.pickup !== 'yes');
  });
});

/* ---------------- skill level pill group ---------------- */
document.querySelectorAll('#skillGroup .pill').forEach(pill=>{
  pill.addEventListener('click', ()=>{
    document.querySelectorAll('#skillGroup .pill').forEach(p=>p.classList.remove('selected'));
    pill.classList.add('selected');
    state.skill = pill.getAttribute('data-val');
  });
});

/* ---------------- rental toggle ---------------- */
document.getElementById('rentalToggleBtn').addEventListener('click', ()=>{
  state.rentalRequested = !state.rentalRequested;
  const btn = document.getElementById('rentalToggleBtn');
  btn.classList.toggle('active', state.rentalRequested);
  btn.textContent = state.rentalRequested ? '－ レンタルを削除' : '＋ レンタルを希望する';
  document.getElementById('rentalPanel').classList.toggle('hidden', !state.rentalRequested);
});

/* ---------------- rental item yes/no pills (wetsuit / board / bodyboard / snorkel) ----------------
   Only used in non-headcount modes (レンタルサーフボード never shows this panel
   at all; サーフフォト/サーフィンビデオ keep this simple yes/no). Headcount
   activities use the quantity steppers wired further down instead. ---------------- */
document.querySelectorAll('.rental-yn').forEach(group=>{
  const item = group.getAttribute('data-item');
  group.querySelectorAll('.pill').forEach(pill=>{
    pill.addEventListener('click', ()=>{
      group.querySelectorAll('.pill').forEach(p=>p.classList.remove('selected'));
      pill.classList.add('selected');
      state.rental[item] = pill.getAttribute('data-val');
      updateGearDetailVisibility();
    });
  });
});

/* ---------------- skill-level breakdown steppers (headcount activities only) ---------------- */
document.querySelectorAll('.skill-inc').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const key = btn.getAttribute('data-skill');
    if(skillTotal() < paxCapacity()){ state.skillCounts[key]++; renderSkillSteppers(); }
  });
});
document.querySelectorAll('.skill-dec').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const key = btn.getAttribute('data-skill');
    if(state.skillCounts[key] > 0){ state.skillCounts[key]--; renderSkillSteppers(); }
  });
});

/* ---------------- rental quantity steppers (headcount activities only) ---------------- */
document.querySelectorAll('.rental-inc').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const item = btn.getAttribute('data-item');
    if(state.rentalQty[item] < paxCapacity()){ state.rentalQty[item]++; renderRentalSteppers(); }
  });
});
document.querySelectorAll('.rental-dec').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const item = btn.getAttribute('data-item');
    if(state.rentalQty[item] > 0){ state.rentalQty[item]--; renderRentalSteppers(); }
  });
});

/* ---------------- wetsuit size / board type breakdown steppers (headcount activities only) ---------------- */
document.querySelectorAll('.wetsuitsize-inc').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const key = btn.getAttribute('data-size');
    if(breakdownTotal(state.rental.wetsuitSizeCounts) < state.rentalQty.wetsuit){
      state.rental.wetsuitSizeCounts[key]++; renderWetsuitSizeBreakdown();
    }
  });
});
document.querySelectorAll('.wetsuitsize-dec').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const key = btn.getAttribute('data-size');
    if(state.rental.wetsuitSizeCounts[key] > 0){ state.rental.wetsuitSizeCounts[key]--; renderWetsuitSizeBreakdown(); }
  });
});
document.querySelectorAll('.boardtype-inc').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const key = btn.getAttribute('data-type');
    if(breakdownTotal(state.rental.boardTypeCounts) < state.rentalQty.board){
      state.rental.boardTypeCounts[key]++; renderBoardTypeBreakdown();
    }
  });
});
document.querySelectorAll('.boardtype-dec').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const key = btn.getAttribute('data-type');
    if(state.rental.boardTypeCounts[key] > 0){ state.rental.boardTypeCounts[key]--; renderBoardTypeBreakdown(); }
  });
});
document.querySelectorAll('#wetsuitSizeGroup .pill').forEach(pill=>{
  pill.addEventListener('click', ()=>{
    document.querySelectorAll('#wetsuitSizeGroup .pill').forEach(p=>p.classList.remove('selected'));
    pill.classList.add('selected');
    state.rental.wetsuitSize = pill.getAttribute('data-val');
  });
});
document.querySelectorAll('#boardTypeGroup .pill').forEach(pill=>{
  pill.addEventListener('click', ()=>{
    document.querySelectorAll('#boardTypeGroup .pill').forEach(p=>p.classList.remove('selected'));
    pill.classList.add('selected');
    state.rental.boardType = pill.getAttribute('data-val');
  });
});

/* ---------------- calendar (multi-select — click to toggle each date on/off) ---------------- */
const DOW = ['日','月','火','水','木','金','土'];
function makeCalendar({ cursor, gridId, monthLabelId, isSelected, toggleDate }){
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
      const booked = isDateDisabled(dateObj);
      el.className = 'cal-day' + ((isPast || booked) ? ' disabled':'');
      el.textContent = d;
      if(isSelected(dateObj)){ el.classList.add('selected'); }
      if(!isPast && !booked){ el.addEventListener('click', ()=>{ toggleDate(dateObj); render(); }); }
      grid.appendChild(el);
    }
  }
  return { render };
}
function isDateSelected(dateObj){
  const key = dateObj.toDateString();
  return state.dates.some(d => d.toDateString() === key);
}
function toggleSelectedDate(dateObj){
  const key = dateObj.toDateString();
  const idx = state.dates.findIndex(d => d.toDateString() === key);
  if(idx >= 0){ state.dates.splice(idx,1); } else { state.dates.push(dateObj); }
  state.dates.sort((a,b)=> a-b);
  updateTimeOptionsForSelectedDates(); // which times are free can differ per date — recompute the intersection
}
const surfCal = makeCalendar({
  cursor: calCursor, gridId:'calGrid', monthLabelId:'calMonthLabel',
  isSelected: isDateSelected, toggleDate: toggleSelectedDate
});
document.getElementById('prevMonth').addEventListener('click', ()=>{ calCursor.setMonth(calCursor.getMonth()-1); surfCal.render(); });
document.getElementById('nextMonth').addEventListener('click', ()=>{ calCursor.setMonth(calCursor.getMonth()+1); surfCal.render(); });

/* ---------------- time select ----------------
   PHASE 1: the dropdown now shows only start times that are ACTUALLY free
   — the intersection of every currently-selected date's free slots (from
   slotsByDate, populated by loadAvailability() per the current activity/
   duration), so a customer can never pick a time that's already taken on
   one of their chosen dates. Before any date is picked, it falls back to
   a generic 07:00–18:30 range just so the field isn't empty/confusing. */
function appendPlaceholder(selectEl, text){
  const placeholder = document.createElement('option');
  placeholder.value = ''; placeholder.textContent = text; placeholder.disabled = true; placeholder.selected = true;
  selectEl.appendChild(placeholder);
}
function generateFallbackTimeOptions(selectEl){
  selectEl.innerHTML = '';
  appendPlaceholder(selectEl, '日付を選択すると空き時間が表示されます');
  for(let h=7; h<=18; h++){
    for(let m=0; m<60; m+=30){
      if(h===18 && m>30) continue;
      const hh = String(h).padStart(2,'0'); const mm = String(m).padStart(2,'0');
      const opt = document.createElement('option');
      opt.value = `${hh}:${mm}`; opt.textContent = `${hh}:${mm}`;
      selectEl.appendChild(opt);
    }
  }
}
function updateTimeOptionsForSelectedDates(){
  const sel = timeSelect;
  const previousValue = state.time;
  sel.innerHTML = '';

  if(state.dates.length === 0){
    generateFallbackTimeOptions(sel);
    return;
  }

  let common = null;
  for(const d of state.dates){
    const key = d.toISOString().slice(0,10);
    const slots = slotsByDate[key] || [];
    common = common === null ? new Set(slots) : new Set(slots.filter(s => common.has(s)));
  }
  const times = common ? Array.from(common).sort() : [];

  if(times.length === 0){
    appendPlaceholder(sel, 'ご希望の日程に空き時間がありません');
    state.time = null;
    return;
  }

  appendPlaceholder(sel, '時間を選択');
  times.forEach(t=>{
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    sel.appendChild(opt);
  });
  if(previousValue && times.includes(previousValue)){
    sel.value = previousValue;
    state.time = previousValue;
  } else {
    state.time = null;
  }
}
const timeSelect = document.getElementById('timeSelect');
generateFallbackTimeOptions(timeSelect);
timeSelect.addEventListener('change', ()=>{ state.time = timeSelect.value; });

/* ---------------- notices ---------------- */
function showNotice(message){
  const el = document.getElementById('inlineNotice');
  el.textContent = message; el.classList.remove('hidden');
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function clearNotice(){
  const el = document.getElementById('inlineNotice');
  el.classList.add('hidden'); el.textContent = '';
}

/* ---------------- step navigation ---------------- */
function goTo(step){
  clearNotice();
  ['step1','step2','step3','stepDone'].forEach(id=>{ document.getElementById(id).classList.add('hidden'); });
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
  if(!state.activity){ showNotice('興味のあるアクティビティを選択してください。'); return; }
  if(!state.pax){ showNotice(FIELD_MODE_CONFIG[fieldModeFor(state.activity)].errorMessage); return; }
  if(!state.pickup){ showNotice('ピックアップの有無を選択してください。'); return; }
  if(state.pickup === 'yes' && !document.getElementById('pickupAddress').value.trim()){
    showNotice('送迎先の住所をご入力ください。'); return;
  }
  if(currentFieldMode === 'pax'){
    if(skillTotal() === 0){ showNotice('スキルレベルの人数内訳を入力してください。'); return; }
    if(skillTotal() !== paxCapacity()){ showNotice('スキルレベルの人数内訳が人数と一致していません。'); return; }
    if(state.rentalRequested){
      if(state.rentalQty.wetsuit > 0 && breakdownTotal(state.rental.wetsuitSizeCounts) !== state.rentalQty.wetsuit){
        showNotice('ウェットスーツのサイズ内訳が本数と一致していません。'); return;
      }
      if(state.rentalQty.board > 0 && breakdownTotal(state.rental.boardTypeCounts) !== state.rentalQty.board){
        showNotice('サーフボードのタイプ内訳が本数と一致していません。'); return;
      }
    }
  } else if(!state.skill){
    showNotice('スキルレベルを選択してください。'); return;
  }
  if(state.dates.length === 0 || !state.time){ showNotice('ご希望日と開始時間を選択してください。'); return; }
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
  errEl.textContent = ''; inputEl.classList.remove('field-error');
  return true;
}
document.getElementById('fEmail').addEventListener('blur', validateEmail);

document.getElementById('toStep3').addEventListener('click', ()=>{
  const name = document.getElementById('fName').value.trim();
  const email = document.getElementById('fEmail').value.trim();
  if(!name || !email){ showNotice('お名前とメールアドレスをご入力ください。'); return; }
  if(!validateEmail()){ return; }
  renderSummary();
  goTo('step3');
});
document.getElementById('backTo2').addEventListener('click', ()=> goTo('step2'));

/* ---------------- summary ---------------- */
function rentalSummary(){
  if(!state.rentalRequested) return 'なし';
  const items = [];
  if(currentFieldMode === 'pax'){
    const q = state.rentalQty;
    if(q.wetsuit > 0){
      const sizes = Object.entries(state.rental.wetsuitSizeCounts).filter(([,v])=>v>0).map(([k,v])=>`${k}×${v}`).join('・');
      items.push(`ウェットスーツ ×${q.wetsuit}（${sizes || 'サイズ未選択'}）`);
    }
    if(q.board > 0){
      const types = Object.entries(state.rental.boardTypeCounts).filter(([,v])=>v>0).map(([k,v])=>`${BOARD_TYPE_LABELS[k]}×${v}`).join('・');
      items.push(`サーフボード ×${q.board}（${types || 'タイプ未選択'}）`);
    }
    if(q.bodyboard > 0) items.push(`ボディボード ×${q.bodyboard}`);
    if(q.snorkel > 0) items.push(`シュノーケルセット ×${q.snorkel}`);
  } else {
    const r = state.rental;
    if(r.wetsuit === 'yes') items.push(`ウェットスーツ（${r.wetsuitSize ? WETSUIT_SIZE_LABELS[r.wetsuitSize] : 'サイズ未選択'}）`);
    if(r.board === 'yes') items.push(`サーフボード（${r.boardType ? BOARD_TYPE_LABELS[r.boardType] : 'タイプ未選択'}）`);
    if(r.bodyboard === 'yes') items.push('ボディボード');
    if(r.snorkel === 'yes') items.push('シュノーケルセット');
  }
  return items.length ? items.join('、') : '希望（詳細未選択）';
}
// "初めて2名、中級1名" in headcount modes, or the plain single label otherwise.
function skillSummaryDisplay(){
  if(currentFieldMode === 'pax'){
    const parts = Object.entries(state.skillCounts).filter(([,v]) => v > 0).map(([k,v]) => `${SKILL_LABELS[k]}${v}名`);
    return parts.length ? parts.join('、') : '—';
  }
  return SKILL_LABELS[state.skill] || '—';
}
// Human-readable value for whichever mode the secondary field is in right
// now — "3名" for headcount, "4枚" for board quantity, "1時間30分" for a
// duration pick (looked up from its label rather than showing raw minutes).
function secondaryFieldDisplay(){
  if(!state.pax) return '—';
  const mode = fieldModeFor(state.activity);
  if(mode === 'duration'){
    const match = FIELD_MODE_CONFIG.duration.options.find(([value]) => value === state.pax);
    return match ? match[1] : state.pax;
  }
  if(mode === 'boards') return `${state.pax}枚`;
  return `${state.pax}名`;
}

function renderSummary(){
  document.getElementById('sumActivity').textContent = ACTIVITY_LABELS[state.activity] || '—';
  document.getElementById('sumPax').textContent = secondaryFieldDisplay();
  const pickupAddr = document.getElementById('pickupAddress').value.trim();
  document.getElementById('sumPickup').textContent = state.pickup === 'yes'
    ? `有り（${pickupAddr || '住所未入力'}）` : '無し';
  document.getElementById('sumSkill').textContent = skillSummaryDisplay();
  document.getElementById('sumRental').textContent = rentalSummary();
  const dateStr = state.dates.length
    ? state.dates.map(d => d.toLocaleDateString('ja-JP', {month:'long',day:'numeric',weekday:'short'})).join('、')
    : '—';
  document.getElementById('sumDatetime').textContent = dateStr;
  document.getElementById('sumTime').textContent = state.time || '—';
  document.getElementById('sumName').textContent = document.getElementById('fName').value.trim();
  document.getElementById('sumEmail').textContent = document.getElementById('fEmail').value.trim();

  // Price: a real number + rental add-on for most activities, or the
  // "お見積り希望" badge for 初心者サーフガイド (affiliate-run, no fixed price).
  const base = basePriceFor(state.activity);
  const addon = rentalAddonTotal();
  const priceEl = document.getElementById('sumPrice');
  const rentalCostRow = document.getElementById('sumRentalCostRow');
  if(base === null || base === undefined){
    priceEl.textContent = 'お見積り希望';
    priceEl.classList.add('quote-badge');
    rentalCostRow.classList.add('hidden');
  } else {
    priceEl.classList.remove('quote-badge');
    if(addon > 0){
      rentalCostRow.classList.remove('hidden');
      const days = Math.max(1, state.dates.length);
      document.getElementById('sumRentalCost').textContent = days > 1
        ? `${formatJpy(addon)}（${formatJpy(rentalAddonPerDay())}×${days}日）`
        : formatJpy(addon);
      priceEl.textContent = formatJpy(base + addon);
    } else {
      rentalCostRow.classList.add('hidden');
      priceEl.textContent = formatJpy(base);
    }
  }
}

/* ---------------- submit ---------------- */
document.getElementById('submitInquiry').addEventListener('click', async ()=>{
  const submitBtn = document.getElementById('submitInquiry');
  submitBtn.disabled = true;
  submitBtn.textContent = '送信中…';

  const basePrice = basePriceFor(state.activity);
  const addonTotal = rentalAddonTotal();
  const priceJpyDisplay = (basePrice === null || basePrice === undefined)
    ? 'お見積り希望'
    : formatJpy(basePrice + addonTotal);

  const inquiry = {
    activity: state.activity,
    activityLabel: ACTIVITY_LABELS[state.activity] || '',
    priceJpy: priceJpyDisplay,
    rentalAddonJpy: addonTotal, // 0 if no add-on requested or activity has no fixed price
    pax: state.pax,
    // What the "pax" value actually means for this activity, so the backend
    // (surf-inquiry.js) doesn't have to guess — see FIELD_MODE_CONFIG above.
    secondaryFieldLabel: FIELD_MODE_CONFIG[fieldModeFor(state.activity)].label,
    secondaryFieldValueLabel: secondaryFieldDisplay(),
    pickup: state.pickup,
    pickupAddress: document.getElementById('pickupAddress').value.trim(),
    skill: state.skill,
    // Per-level headcount breakdown when this activity tracks headcount
    // (null otherwise) — see state.skillCounts above.
    skillBreakdown: currentFieldMode === 'pax' ? { ...state.skillCounts } : null,
    skillLabel: skillSummaryDisplay(),
    rentalRequested: state.rentalRequested,
    rental: state.rentalRequested ? (currentFieldMode === 'pax' ? {
      wetsuitQty: state.rentalQty.wetsuit, wetsuitSizeCounts: { ...state.rental.wetsuitSizeCounts },
      boardQty: state.rentalQty.board, boardTypeCounts: { ...state.rental.boardTypeCounts },
      bodyboardQty: state.rentalQty.bodyboard,
      snorkelQty: state.rentalQty.snorkel,
    } : {
      wetsuit: state.rental.wetsuit === 'yes', wetsuitSize: state.rental.wetsuitSize,
      board: state.rental.board === 'yes', boardType: state.rental.boardType,
      bodyboard: state.rental.bodyboard === 'yes',
      snorkel: state.rental.snorkel === 'yes',
    }) : null,
    dates: state.dates.map(d => d.toISOString().slice(0,10)),
    time: state.time,
    name: document.getElementById('fName').value.trim(),
    email: document.getElementById('fEmail').value.trim(),
    phone: document.getElementById('fPhone').value.trim(),
    question: document.getElementById('fQuestion').value.trim(),
  };

  let ref = 'SURF-' + Math.floor(100000 + Math.random()*900000);

  if(SURF_ENDPOINT){
    try{
      const apiRes = await fetch(SURF_ENDPOINT, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(inquiry)
      });
      const data = await apiRes.json().catch(()=>null);
      if(!apiRes.ok){
        // A 409 here means the server's authoritative, up-to-the-second
        // calendar check caught a scheduling conflict — surface ITS actual
        // message (e.g. "that date/time is now taken", or a rental
        // delivery-radius rejection) rather than a generic error, since
        // it's specific and actionable for the customer.
        throw new Error((data && data.error) || ('Server responded with ' + apiRes.status));
      }
      if(data && data.ref){ ref = data.ref; }
    }catch(e){
      console.error('Inquiry submission failed:', e);
      const isKnownReason = e.message && !e.message.startsWith('Server responded with');
      showNotice(isKnownReason ? e.message : '送信中にエラーが発生しました。時間をおいてもう一度お試しいただくか、メール（bookings@jpgbyron.com）にてご連絡ください。');
      submitBtn.disabled = false;
      submitBtn.textContent = '問い合わせを送信する';
      return;
    }
  } else {
    console.log('Inquiry submitted (demo mode — no SURF_ENDPOINT configured yet):', inquiry);
  }

  document.getElementById('refNumber').textContent = ref;
  goTo('stepDone');
});

/* ---------------- init ---------------- */
surfCal.render();
loadAvailability();
</script>
</body>
</html>
