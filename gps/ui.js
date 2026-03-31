/**
 * ui.js — UI 렌더링 + 자동복사 모듈
 * ✅ 외부 호출 금지. index.js에서만 사용
 */

// ── 내부 상수 ────────────────────────────────────────────────────
const PANEL_ID       = 'work-mode-panel';
const RESULT_ID      = 'work-mode-result';
const BTN_LINE_ID    = 'wm-btn-line';
const BTN_FAN_ID     = 'wm-btn-fan';
const BTN_COPY_ID    = 'wm-btn-autocopy';
const BTN_GPS_ID     = 'wm-btn-gps';
const GPS_DOT_ID     = 'wm-gps-dot';
const RESULT_TEXT_ID = 'wm-result-text';
const RESULT_CNT_ID  = 'wm-result-count';

// 슬라이더 ID
const SLIDER_BUF_ID  = 'wm-slider-buf';   // 선 버퍼
const SLIDER_R1_ID   = 'wm-slider-r1';    // 부채꼴 r1
const SLIDER_R2_ID   = 'wm-slider-r2';    // 부채꼴 r2

// 추가 버튼 ID
const BTN_ADD_LINE_ID = 'wm-btn-add-line';   // 선 이어붙이기
const BTN_ADD_FAN_ID  = 'wm-btn-add-fan';    // 부채꼴 이어붙이기
const BTN_SHOW_ID     = 'wm-btn-show-dong';  // 동/구 표시 토글
const BTN_CLEAR_ID    = 'wm-btn-clear';      // 전체 초기화

// ── 공개 함수 ────────────────────────────────────────────────────

/**
 * 업무모드 패널 생성 및 삽입
 *
 * @param {function} onLineFn       선 모드 버튼
 * @param {function} onFanFn        부채꼴 모드 버튼
 * @param {function} onAutoCopyFn   자동복사 토글
 * @param {function} onGpsFocusFn   GPS 이동
 * @param {function} onAddLineFn    선 이어붙이기
 * @param {function} onAddFanFn     부채꼴 이어붙이기
 * @param {function} onShowDongFn   동/구 표시 토글
 * @param {function} onClearFn      전체 초기화
 * @param {function} onBufChangeFn  선 버퍼 변경 (value)
 * @param {function} onR1ChangeFn   r1 변경 (value)
 * @param {function} onR2ChangeFn   r2 변경 (value)
 */
function renderWorkModePanel(
  onLineFn, onFanFn, onAutoCopyFn, onGpsFocusFn,
  onAddLineFn, onAddFanFn, onShowDongFn, onClearFn,
  onBufChangeFn, onR1ChangeFn, onR2ChangeFn
) {
  if (document.getElementById(PANEL_ID)) return;

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.innerHTML = [
    /* ── 1행: 모드 버튼 ── */
    '<div class="wm-row wm-row--mode">',
    '  <div class="wm-label">모드</div>',
    '  <div class="wm-btn-group">',
    '    <button id="' + BTN_LINE_ID + '" class="wm-btn wm-btn--mode" title="선 모드">',
    '      <span class="wm-icon">📏</span><span class="wm-lbl">선 모드</span>',
    '    </button>',
    '    <button id="' + BTN_FAN_ID + '" class="wm-btn wm-btn--mode" title="부채꼴 모드">',
    '      <span class="wm-icon">🔔</span><span class="wm-lbl">부채꼴</span>',
    '    </button>',
    '  </div>',
    '</div>',

    /* ── 2행: 선 버퍼 슬라이더 (선 모드에서만 표시) ── */
    '<div class="wm-row" id="wm-row-buf">',
    '  <div class="wm-label">선 굵기</div>',
    '  <div class="wm-slider-wrap">',
    '    <span class="wm-sl-min">0.1km</span>',
    '    <input type="range" id="' + SLIDER_BUF_ID + '" min="0.1" max="3" step="0.1" value="0.3" class="wm-slider">',
    '    <span class="wm-sl-max">3km</span>',
    '    <span class="wm-sl-val" id="wm-buf-val">0.3km</span>',
    '  </div>',
    '</div>',

    /* ── 3행: 부채꼴 r1 슬라이더 (부채꼴 모드에서만 표시) ── */
    '<div class="wm-row" id="wm-row-r1">',
    '  <div class="wm-label">시작 반경</div>',
    '  <div class="wm-slider-wrap">',
    '    <span class="wm-sl-min">0.1km</span>',
    '    <input type="range" id="' + SLIDER_R1_ID + '" min="0.1" max="3" step="0.1" value="0.3" class="wm-slider">',
    '    <span class="wm-sl-max">3km</span>',
    '    <span class="wm-sl-val" id="wm-r1-val">0.3km</span>',
    '  </div>',
    '</div>',

    /* ── 4행: 부채꼴 r2 슬라이더 (부채꼴 모드에서만 표시) ── */
    '<div class="wm-row" id="wm-row-r2">',
    '  <div class="wm-label">도착 반경</div>',
    '  <div class="wm-slider-wrap">',
    '    <span class="wm-sl-min">0.2km</span>',
    '    <input type="range" id="' + SLIDER_R2_ID + '" min="0.2" max="5" step="0.1" value="0.8" class="wm-slider">',
    '    <span class="wm-sl-max">5km</span>',
    '    <span class="wm-sl-val" id="wm-r2-val">0.8km</span>',
    '  </div>',
    '</div>',

    /* ── 5행: 액션 버튼 ── */
    '<div class="wm-row">',
    '  <div class="wm-label">액션</div>',
    '  <div class="wm-btn-group wm-btn-group--wrap">',
    '    <button id="' + BTN_ADD_LINE_ID + '" class="wm-btn wm-btn--add" title="이전 끝점에서 새 선 이어붙이기" style="display:none">',
    '      <span class="wm-icon">➕📏</span><span class="wm-lbl">선 추가</span>',
    '    </button>',
    '    <button id="' + BTN_ADD_FAN_ID + '" class="wm-btn wm-btn--add" title="이전 끝점에서 새 부채꼴 이어붙이기" style="display:none">',
    '      <span class="wm-icon">➕🔔</span><span class="wm-lbl">부채꼴 추가</span>',
    '    </button>',
    '    <button id="' + BTN_SHOW_ID + '" class="wm-btn wm-btn--show" title="선택 지역 동/구 폴리곤 표시">',
    '      <span class="wm-icon">🗺</span><span class="wm-lbl">동/구 표시</span>',
    '    </button>',
    '    <button id="' + BTN_COPY_ID + '" class="wm-btn wm-btn--toggle" title="자동 클립보드 복사">',
    '      <span class="wm-icon">📋</span><span class="wm-lbl">자동복사</span>',
    '      <span class="wm-badge wm-badge--off">OFF</span>',
    '    </button>',
    '    <button id="' + BTN_GPS_ID + '" class="wm-btn" title="GPS 위치로 이동">',
    '      <span id="' + GPS_DOT_ID + '" class="wm-gps-dot wm-gps-dot--wait"></span>',
    '      <span class="wm-lbl">GPS</span>',
    '    </button>',
    '    <button id="' + BTN_CLEAR_ID + '" class="wm-btn wm-btn--danger" title="모든 도형 초기화">',
    '      <span class="wm-icon">🗑</span><span class="wm-lbl">초기화</span>',
    '    </button>',
    '  </div>',
    '</div>',

    /* ── 6행: 결과 표시 ── */
    '<div class="wm-result" id="' + RESULT_ID + '">',
    '  <div class="wm-result-header">',
    '    <span class="wm-result-label">📍 교차 지역</span>',
    '    <span class="wm-result-count" id="' + RESULT_CNT_ID + '">0개</span>',
    '  </div>',
    '  <div class="wm-result-text" id="' + RESULT_TEXT_ID + '">지도를 클릭해 도형을 그려주세요</div>',
    '</div>',
  ].join('\n');

  _injectStyles();

  // ── 이벤트 연결 ─────────────────────────────────────────────
  panel.querySelector('#' + BTN_LINE_ID).addEventListener('click', onLineFn);
  panel.querySelector('#' + BTN_FAN_ID).addEventListener('click', onFanFn);
  panel.querySelector('#' + BTN_COPY_ID).addEventListener('click', onAutoCopyFn);
  panel.querySelector('#' + BTN_GPS_ID).addEventListener('click', onGpsFocusFn);
  panel.querySelector('#' + BTN_ADD_LINE_ID).addEventListener('click', onAddLineFn);
  panel.querySelector('#' + BTN_ADD_FAN_ID).addEventListener('click', onAddFanFn);
  panel.querySelector('#' + BTN_SHOW_ID).addEventListener('click', onShowDongFn);
  panel.querySelector('#' + BTN_CLEAR_ID).addEventListener('click', onClearFn);

  // 슬라이더 이벤트
  var bufSlider = panel.querySelector('#' + SLIDER_BUF_ID);
  bufSlider.addEventListener('input', function() {
    panel.querySelector('#wm-buf-val').textContent = parseFloat(this.value).toFixed(1) + 'km';
    onBufChangeFn(parseFloat(this.value));
  });

  var r1Slider = panel.querySelector('#' + SLIDER_R1_ID);
  r1Slider.addEventListener('input', function() {
    panel.querySelector('#wm-r1-val').textContent = parseFloat(this.value).toFixed(1) + 'km';
    onR1ChangeFn(parseFloat(this.value));
  });

  var r2Slider = panel.querySelector('#' + SLIDER_R2_ID);
  r2Slider.addEventListener('input', function() {
    panel.querySelector('#wm-r2-val').textContent = parseFloat(this.value).toFixed(1) + 'km';
    onR2ChangeFn(parseFloat(this.value));
  });

  // 헤더 아래 삽입
  const header = document.getElementById('header');
  if (header && header.parentNode) {
    header.parentNode.insertBefore(panel, header.nextSibling);
  } else {
    document.body.prepend(panel);
  }

  // 초기 슬라이더 행 숨김 (모드 선택 전)
  _showSliderRows(null);
}

/** 모드에 따라 슬라이더 행 표시/숨김 */
function _showSliderRows(mode) {
  var rowBuf = document.getElementById('wm-row-buf');
  var rowR1  = document.getElementById('wm-row-r1');
  var rowR2  = document.getElementById('wm-row-r2');
  var addLine = document.getElementById(BTN_ADD_LINE_ID);
  var addFan  = document.getElementById(BTN_ADD_FAN_ID);

  if (rowBuf) rowBuf.style.display = (mode === 'line') ? 'flex' : 'none';
  if (rowR1)  rowR1.style.display  = (mode === 'fan')  ? 'flex' : 'none';
  if (rowR2)  rowR2.style.display  = (mode === 'fan')  ? 'flex' : 'none';
  if (addLine) addLine.style.display = (mode === 'line') ? 'flex' : 'none';
  if (addFan)  addFan.style.display  = (mode === 'fan')  ? 'flex' : 'none';
}

/** 활성 모드 버튼 강조 */
function setActiveModeBtn(mode) {
  var lineBtn = document.getElementById(BTN_LINE_ID);
  var fanBtn  = document.getElementById(BTN_FAN_ID);
  if (!lineBtn || !fanBtn) return;
  lineBtn.classList.toggle('wm-btn--active', mode === 'line');
  fanBtn.classList.toggle('wm-btn--active',  mode === 'fan');
  _showSliderRows(mode);
}

/** 자동복사 배지 갱신 */
function setAutoCopyBtn(isOn) {
  var badge = document.querySelector('#' + BTN_COPY_ID + ' .wm-badge');
  if (!badge) return;
  badge.textContent = isOn ? 'ON' : 'OFF';
  badge.classList.toggle('wm-badge--on',  isOn);
  badge.classList.toggle('wm-badge--off', !isOn);
}

/** GPS 상태 점 갱신 */
function setGpsDot(state) {
  var dot = document.getElementById(GPS_DOT_ID);
  if (!dot) return;
  dot.className = 'wm-gps-dot wm-gps-dot--' + state;
}

/** 동/구 표시 버튼 상태 갱신 */
function setShowDongBtn(isOn) {
  var btn = document.getElementById(BTN_SHOW_ID);
  if (!btn) return;
  btn.classList.toggle('wm-btn--active', isOn);
  btn.querySelector('.wm-lbl').textContent = isOn ? '동/구 숨기기' : '동/구 표시';
}

/** 결과 표시 */
function updateResultDisplay(resultSet) {
  var textEl  = document.getElementById(RESULT_TEXT_ID);
  var countEl = document.getElementById(RESULT_CNT_ID);
  if (!textEl || !countEl) return;

  if (!resultSet || resultSet.size === 0) {
    textEl.textContent = '교차하는 지역이 없습니다';
    textEl.classList.remove('wm-result-text--has-result');
    countEl.textContent = '0개';
    return;
  }

  var text = Array.from(resultSet).join(',');
  textEl.textContent = text;
  textEl.classList.add('wm-result-text--has-result');
  countEl.textContent = resultSet.size + '개';
}

/** 자동복사 — 변경 시만 실행 */
function autoCopyIfChanged(text, prevText) {
  if (text !== prevText && text.length > 0) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function() { _showCopyFeedback(); })
        .catch(function() { _fallbackCopy(text); });
    } else {
      _fallbackCopy(text);
    }
  }
  return text;
}

/** 업무모드 패널 제거 */
function removeWorkModePanel() {
  var panel = document.getElementById(PANEL_ID);
  if (panel) panel.remove();
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────

function _fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;top:0;left:0;';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
  _showCopyFeedback();
}

function _showCopyFeedback() {
  var el = document.getElementById(RESULT_ID);
  if (!el) return;
  el.classList.add('wm-result--copied');
  setTimeout(function() { el.classList.remove('wm-result--copied'); }, 800);
}

function _injectStyles() {
  if (document.getElementById('wm-styles')) return;
  var style = document.createElement('style');
  style.id = 'wm-styles';
  style.textContent = `
    #work-mode-panel {
      background: var(--surface,#111827);
      border-bottom: 2px solid var(--border,#1e3a5f);
      padding: 6px 14px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      z-index: 900;
      flex-shrink: 0;
    }
    .wm-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 32px;
    }
    .wm-row--mode { border-bottom: 1px solid rgba(255,255,255,.06); padding-bottom: 5px; }
    .wm-label {
      font-size: .6rem;
      color: var(--text-dim,#7a9bb5);
      text-transform: uppercase;
      letter-spacing: 1px;
      width: 48px;
      flex-shrink: 0;
    }
    .wm-btn-group { display: flex; gap: 5px; flex-wrap: wrap; }
    .wm-btn-group--wrap { flex-wrap: wrap; }
    .wm-btn {
      display: flex; align-items: center; gap: 4px;
      background: var(--surface2,#1a2235);
      border: 1px solid var(--border,#1e3a5f);
      border-radius: 7px;
      color: var(--text-dim,#7a9bb5);
      padding: 4px 9px;
      font-size: .74rem;
      font-family: 'Noto Sans KR', sans-serif;
      cursor: pointer;
      transition: all .15s;
      white-space: nowrap;
    }
    .wm-btn:hover { border-color: var(--accent,#00d4ff); color: var(--accent,#00d4ff); }
    .wm-btn--active {
      border-color: var(--accent,#00d4ff) !important;
      color: var(--accent,#00d4ff) !important;
      background: rgba(0,212,255,.1) !important;
      box-shadow: 0 0 7px rgba(0,212,255,.2);
    }
    .wm-btn--add { border-color: #00b894; color: #00b894; }
    .wm-btn--add:hover { background: rgba(0,184,148,.1); }
    .wm-btn--show { border-color: #a29bfe; color: #a29bfe; }
    .wm-btn--show:hover { background: rgba(162,155,254,.1); }
    .wm-btn--danger:hover { border-color: var(--accent2,#ff3c6e); color: var(--accent2,#ff3c6e); }
    .wm-icon { font-size: .85rem; }
    .wm-lbl { font-size: .72rem; }
    .wm-badge {
      font-size: .58rem; font-weight: 700;
      padding: 1px 4px; border-radius: 3px; margin-left: 2px;
    }
    .wm-badge--off { background: var(--surface,#111827); border: 1px solid var(--text-dim,#7a9bb5); color: var(--text-dim,#7a9bb5); }
    .wm-badge--on  { background: var(--accent3,#39ff14); color: #000; }
    .wm-gps-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .wm-gps-dot--active { background: var(--accent3,#39ff14); box-shadow: 0 0 4px var(--accent3,#39ff14); animation: wm-pulse 1.4s infinite; }
    .wm-gps-dot--wait   { background: var(--gold,#ffd700); animation: wm-pulse 2s infinite; }
    .wm-gps-dot--error  { background: var(--accent2,#ff3c6e); }
    @keyframes wm-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
    .wm-slider-wrap {
      display: flex; align-items: center; gap: 6px; flex: 1;
    }
    .wm-slider {
      flex: 1; height: 4px;
      accent-color: var(--accent,#00d4ff);
    }
    .wm-sl-min, .wm-sl-max { font-size: .58rem; color: var(--text-dim,#7a9bb5); white-space: nowrap; }
    .wm-sl-val {
      font-size: .68rem; font-weight: 700; color: var(--accent,#00d4ff);
      min-width: 38px; text-align: right;
    }
    .wm-result {
      background: var(--surface2,#1a2235);
      border: 1px solid var(--border,#1e3a5f);
      border-radius: 7px; padding: 6px 11px;
      transition: border-color .2s;
    }
    .wm-result--copied { border-color: var(--accent3,#39ff14) !important; }
    .wm-result-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; }
    .wm-result-label { font-size: .6rem; color: var(--text-dim,#7a9bb5); text-transform: uppercase; letter-spacing: 1px; }
    .wm-result-count { font-size: .63rem; color: var(--accent,#00d4ff); font-weight: 700; }
    .wm-result-text { font-size: .78rem; color: var(--text-dim,#7a9bb5); word-break: break-all; line-height: 1.5; }
    .wm-result-text--has-result { color: var(--text,#e8f4fd); font-weight: 600; }
    @media (max-width: 480px) {
      .wm-lbl { display: none; }
      .wm-btn { padding: 5px 7px; }
      .wm-label { display: none; }
    }
  `;
  document.head.appendChild(style);
}
