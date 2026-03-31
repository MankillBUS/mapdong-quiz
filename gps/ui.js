/**
 * ui.js — UI 렌더링 + 자동복사 모듈
 * ✅ 외부 호출 금지. index.js에서만 사용
 *
 * 공개 함수:
 *   renderWorkModePanel(onLineFn, onFanFn, onAutoCopyFn, onGpsFocusFn)
 *   setActiveModeBtn(mode)
 *   setAutoCopyBtn(isOn)
 *   setGpsDot(state)
 *   updateResultDisplay(resultSet)
 *   autoCopyIfChanged(text, prevText)
 *   removeWorkModePanel()
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

// ── 공개 함수 ────────────────────────────────────────────────────

/**
 * 업무모드 패널을 생성하고 기존 시스템 헤더 아래에 삽입한다.
 * 버튼 클릭 핸들러는 모두 index.js가 주입 — ui.js는 DOM만 담당.
 *
 * @param {function} onLineFn      선 모드 버튼 클릭 → index.js
 * @param {function} onFanFn       부채꼴 모드 버튼 클릭 → index.js
 * @param {function} onAutoCopyFn  자동복사 토글 클릭 → index.js
 * @param {function} onGpsFocusFn  GPS 이동 버튼 클릭 → index.js
 */
function renderWorkModePanel(onLineFn, onFanFn, onAutoCopyFn, onGpsFocusFn) {
  // 중복 삽입 방지
  if (document.getElementById(PANEL_ID)) return;

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.innerHTML = [
    '<div class="wm-toolbar">',
    '  <div class="wm-btn-group">',
    '    <button id="' + BTN_LINE_ID + '" class="wm-btn wm-btn--mode" title="선 모드: GPS to 클릭 범위">',
    '      <span class="wm-btn-icon">📏</span>',
    '      <span class="wm-btn-label">선 모드</span>',
    '    </button>',
    '    <button id="' + BTN_FAN_ID + '" class="wm-btn wm-btn--mode" title="부채꼴 모드: 두 원 외접선 범위">',
    '      <span class="wm-btn-icon">🔔</span>',
    '      <span class="wm-btn-label">부채꼴</span>',
    '    </button>',
    '  </div>',
    '  <div class="wm-btn-group">',
    '    <button id="' + BTN_COPY_ID + '" class="wm-btn wm-btn--toggle" title="결과 변경 시 자동 클립보드 복사">',
    '      <span class="wm-btn-icon">📋</span>',
    '      <span class="wm-btn-label">자동복사</span>',
    '      <span class="wm-toggle-badge wm-toggle-badge--off">OFF</span>',
    '    </button>',
    '    <button id="' + BTN_GPS_ID + '" class="wm-btn wm-btn--gps" title="현재 GPS 위치로 지도 이동">',
    '      <span id="' + GPS_DOT_ID + '" class="wm-gps-dot wm-gps-dot--wait"></span>',
    '      <span class="wm-btn-label">GPS</span>',
    '    </button>',
    '  </div>',
    '</div>',
    '<div class="wm-result" id="' + RESULT_ID + '">',
    '  <div class="wm-result-header">',
    '    <span class="wm-result-label">📍 교차 지역</span>',
    '    <span class="wm-result-count" id="' + RESULT_CNT_ID + '">0개</span>',
    '  </div>',
    '  <div class="wm-result-text" id="' + RESULT_TEXT_ID + '">지도를 클릭해 도형을 그려주세요</div>',
    '</div>'
  ].join('\n');

  // ── 스타일 주입 (한 번만) ────────────────────────────────────
  _injectStyles();

  // ── 이벤트 연결 (index.js 핸들러 주입) ──────────────────────
  panel.querySelector('#' + BTN_LINE_ID).addEventListener('click', onLineFn);
  panel.querySelector('#' + BTN_FAN_ID).addEventListener('click', onFanFn);
  panel.querySelector('#' + BTN_COPY_ID).addEventListener('click', onAutoCopyFn);
  panel.querySelector('#' + BTN_GPS_ID).addEventListener('click', onGpsFocusFn);

  // ── 헤더 바로 아래 삽입 ─────────────────────────────────────
  const header = document.getElementById('header');
  if (header && header.parentNode) {
    header.parentNode.insertBefore(panel, header.nextSibling);
  } else {
    document.body.prepend(panel);
  }
}

/**
 * 활성 모드 버튼 강조 표시 갱신
 * @param {'line' | 'fan' | null} mode
 */
function setActiveModeBtn(mode) {
  const lineBtn = document.getElementById(BTN_LINE_ID);
  const fanBtn  = document.getElementById(BTN_FAN_ID);
  if (!lineBtn || !fanBtn) return;
  lineBtn.classList.toggle('wm-btn--active', mode === 'line');
  fanBtn.classList.toggle('wm-btn--active',  mode === 'fan');
}

/**
 * 자동복사 버튼 ON/OFF 배지 갱신
 * @param {boolean} isOn
 */
function setAutoCopyBtn(isOn) {
  const badge = document.querySelector('#' + BTN_COPY_ID + ' .wm-toggle-badge');
  if (!badge) return;
  badge.textContent = isOn ? 'ON' : 'OFF';
  badge.classList.toggle('wm-toggle-badge--on',  isOn);
  badge.classList.toggle('wm-toggle-badge--off', !isOn);
}

/**
 * GPS 상태 점(dot) 갱신
 * @param {'active' | 'wait' | 'error'} state
 */
function setGpsDot(state) {
  const dot = document.getElementById(GPS_DOT_ID);
  if (!dot) return;
  dot.className = 'wm-gps-dot wm-gps-dot--' + state;
}

/**
 * 결과 표시 영역 업데이트
 * resultSet → "서초동,방배동,신당동" 형식 (쉼표 구분, 띄어쓰기 없음)
 *
 * @param {Set<string>} resultSet
 */
function updateResultDisplay(resultSet) {
  const textEl  = document.getElementById(RESULT_TEXT_ID);
  const countEl = document.getElementById(RESULT_CNT_ID);
  if (!textEl || !countEl) return;

  if (!resultSet || resultSet.size === 0) {
    textEl.textContent = '교차하는 지역이 없습니다';
    textEl.classList.remove('wm-result-text--has-result');
    countEl.textContent = '0개';
    return;
  }

  const text = Array.from(resultSet).join(',');
  textEl.textContent = text;
  textEl.classList.add('wm-result-text--has-result');
  countEl.textContent = resultSet.size + '개';
}

/**
 * 자동복사: 결과가 변경됐을 때만 클립보드에 복사
 * 중복 복사 방지 — prevText 와 다를 때만 실행
 *
 * @param {string} text      현재 결과 문자열
 * @param {string} prevText  이전 결과 문자열
 * @returns {string}         새 prevText (항상 text 반환)
 */
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

/**
 * 업무모드 패널 DOM 완전 제거
 * exitWorkMode() 호출 시 실행
 */
function removeWorkModePanel() {
  const panel = document.getElementById(PANEL_ID);
  if (panel) panel.remove();
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────

/**
 * clipboard API 미지원 환경 fallback 복사
 * @param {string} text
 */
function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;top:0;left:0;';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
  _showCopyFeedback();
}

/**
 * 복사 완료 시 결과 영역 테두리로 짧은 피드백 표시 (800ms)
 */
function _showCopyFeedback() {
  const el = document.getElementById(RESULT_ID);
  if (!el) return;
  el.classList.add('wm-result--copied');
  setTimeout(function() { el.classList.remove('wm-result--copied'); }, 800);
}

/**
 * 업무모드 전용 CSS를 <head>에 한 번만 주입
 * 기존 index.html :root CSS 변수를 그대로 활용
 */
function _injectStyles() {
  if (document.getElementById('wm-styles')) return;
  const style = document.createElement('style');
  style.id = 'wm-styles';
  style.textContent = [
    '#work-mode-panel{',
    '  background:var(--surface,#111827);',
    '  border-bottom:2px solid var(--border,#1e3a5f);',
    '  padding:8px 14px;',
    '  display:flex;flex-direction:column;gap:8px;',
    '  z-index:900;flex-shrink:0;',
    '}',
    '.wm-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}',
    '.wm-btn-group{display:flex;gap:6px;}',
    '.wm-btn{',
    '  display:flex;align-items:center;gap:5px;',
    '  background:var(--surface2,#1a2235);',
    '  border:1px solid var(--border,#1e3a5f);',
    '  border-radius:8px;',
    '  color:var(--text-dim,#7a9bb5);',
    '  padding:5px 11px;font-size:.78rem;',
    '  font-family:"Noto Sans KR",sans-serif;',
    '  cursor:pointer;transition:all .18s;white-space:nowrap;',
    '}',
    '.wm-btn:hover{border-color:var(--accent,#00d4ff);color:var(--accent,#00d4ff);}',
    '.wm-btn-icon{font-size:.9rem;}',
    '.wm-btn--active{',
    '  border-color:var(--accent,#00d4ff)!important;',
    '  color:var(--accent,#00d4ff)!important;',
    '  background:rgba(0,212,255,.1)!important;',
    '  box-shadow:0 0 8px rgba(0,212,255,.25);',
    '}',
    '.wm-toggle-badge{font-size:.6rem;font-weight:700;padding:1px 5px;border-radius:4px;margin-left:2px;}',
    '.wm-toggle-badge--off{background:var(--surface,#111827);border:1px solid var(--text-dim,#7a9bb5);color:var(--text-dim,#7a9bb5);}',
    '.wm-toggle-badge--on{background:var(--accent3,#39ff14);color:#000;}',
    '.wm-gps-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}',
    '.wm-gps-dot--active{background:var(--accent3,#39ff14);box-shadow:0 0 5px var(--accent3,#39ff14);animation:wm-pulse 1.4s infinite;}',
    '.wm-gps-dot--wait{background:var(--gold,#ffd700);animation:wm-pulse 2s infinite;}',
    '.wm-gps-dot--error{background:var(--accent2,#ff3c6e);}',
    '@keyframes wm-pulse{0%,100%{opacity:1}50%{opacity:.35}}',
    '.wm-result{',
    '  background:var(--surface2,#1a2235);',
    '  border:1px solid var(--border,#1e3a5f);',
    '  border-radius:8px;padding:7px 12px;transition:border-color .2s;',
    '}',
    '.wm-result--copied{border-color:var(--accent3,#39ff14)!important;}',
    '.wm-result-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;}',
    '.wm-result-label{font-size:.62rem;color:var(--text-dim,#7a9bb5);text-transform:uppercase;letter-spacing:1px;}',
    '.wm-result-count{font-size:.65rem;color:var(--accent,#00d4ff);font-weight:700;}',
    '.wm-result-text{font-size:.8rem;color:var(--text-dim,#7a9bb5);word-break:break-all;line-height:1.5;}',
    '.wm-result-text--has-result{color:var(--text,#e8f4fd);font-weight:600;}',
    '@media(max-width:480px){',
    '  .wm-btn-label{display:none;}',
    '  .wm-btn{padding:6px 9px;}',
    '  .wm-btn-icon{font-size:1.05rem;}',
    '}'
  ].join('\n');
  document.head.appendChild(style);
}
