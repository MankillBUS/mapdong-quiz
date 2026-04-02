/**
 * ui.js — UI 렌더링 + 자동복사 모듈
 * ✅ 외부 호출 금지. index.js에서만 사용
 */

// ── 내부 상수 ────────────────────────────────────────────────────
const PANEL_ID        = 'work-mode-panel';
const RESULT_ID       = 'work-mode-result';
const BTN_LINE_ID     = 'wm-btn-line';
const BTN_FAN_ID      = 'wm-btn-fan';
const BTN_COPY_ID     = 'wm-btn-autocopy';
// BTN_GPS_MOVE_ID 제거됨 (이동 버튼 삭제)
const BTN_GPS_TRK_ID  = 'wm-btn-gps-track';   // GPS 추적 ON/OFF
const GPS_DOT_ID      = 'wm-gps-dot';
const RESULT_TEXT_ID  = 'wm-result-text';
const RESULT_CNT_ID   = 'wm-result-count';

const SLIDER_BUF_ID   = 'wm-slider-buf';
const SLIDER_R1_ID    = 'wm-slider-r1';
const SLIDER_R2_ID    = 'wm-slider-r2';

const BTN_ADD_LINE_ID = 'wm-btn-add-line';
const BTN_ADD_FAN_ID  = 'wm-btn-add-fan';
const BTN_SHOW_ID     = 'wm-btn-show-dong';
const BTN_CLEAR_ID    = 'wm-btn-clear';
const BTN_COLLAPSE_ID = 'wm-btn-collapse';     // 접기/펼치기 토글
const COLLAPSIBLE_ID  = 'wm-collapsible';      // 접히는 영역
const SEARCH_INPUT_ID   = 'wm-search-input';      // 지역 검색 입력
const SEARCH_BTN_ID     = 'wm-search-btn';        // 검색 버튼
const SEARCH_LIST_ID    = 'wm-search-list';        // 검색 결과 목록
const BTN_DONG_FILTER_ID = 'wm-btn-dong-filter';  // 교차지역만 Show

// ── 공개 함수 ────────────────────────────────────────────────────

/**
 * 업무모드 패널 생성 및 삽입
 *
 * 콜백 목록 (index.js가 주입):
 *   onLineFn, onFanFn          모드 전환
 *   onAutoCopyFn               자동복사 토글
 *   onGpsMoveFn                GPS 위치로 이동 (수동)
 *   onGpsTrackFn               GPS 추적 ON/OFF 토글
 *   onAddLineFn, onAddFanFn    이어붙이기
 *   onShowDongFn               동/구 표시 토글
 *   onClearFn                  도형 초기화 (동/구 표시 제외)
 *   onBufChangeFn(v)           선 버퍼 변경
 *   onR1ChangeFn(v)            r1 변경
 *   onR2ChangeFn(v)            r2 변경
 */
function renderWorkModePanel(
  onLineFn, onFanFn, onAutoCopyFn,
  onGpsTrackFn,                           // GPS 추적 ON/OFF (이동버튼 제거)
  onAddLineFn, onAddFanFn, onShowDongFn,
  onDongFilterFn,                         // 교차지역만 Show
  onClearFn,
  onBufChangeFn, onR1ChangeFn, onR2ChangeFn
) {
  if (document.getElementById(PANEL_ID)) return;

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.innerHTML = [

    /* ══ 항상 보이는 상단 바 ══════════════════════════════════════ */
    '<div class="wm-fixed-bar">',

    '  <!-- 왼쪽: 접기/펼치기 토글 -->',
    '  <button id="' + BTN_COLLAPSE_ID + '" class="wm-collapse-btn" title="설정 접기/펼치기">',
    '    <span class="wm-collapse-icon">▲</span>',
    '    <span class="wm-collapse-lbl">설정</span>',
    '  </button>',

    '  <div class="wm-fixed-divider"></div>',

    '  <!-- 중앙: 항상 노출 버튼들 -->',
    '  <div class="wm-btn-group">',

    '    <button id="' + BTN_SHOW_ID + '" class="wm-btn wm-btn--show" title="선택 지역 동/구 폴리곤 표시">',
    '      <span class="wm-icon">🗺</span><span class="wm-lbl">동/구 표시</span>',
    '    </button>',

    '    <button id="' + BTN_COPY_ID + '" class="wm-btn wm-btn--toggle" title="자동 클립보드 복사">',
    '      <span class="wm-icon">📋</span><span class="wm-lbl">자동복사</span>',
    '      <span class="wm-badge wm-badge--off">OFF</span>',
    '    </button>',

    '    <!-- GPS 추적 ON/OFF (이동버튼 제거, 이 자리로 이동) -->',
    '    <button id="' + BTN_GPS_TRK_ID + '" class="wm-btn wm-btn--gps-track wm-btn--active" title="GPS 실시간 추적 ON/OFF">',
    '      <span id="' + GPS_DOT_ID + '" class="wm-gps-dot wm-gps-dot--wait"></span>',
    '      <span class="wm-lbl">GPS추적</span>',
    '      <span class="wm-badge wm-badge--on">ON</span>',
    '    </button>',

    '    <!-- 교차지역만 Show 필터 -->',
    '    <button id="' + BTN_DONG_FILTER_ID + '" class="wm-btn wm-btn--filter" title="교차 지역만 표시 / 전체 표시">',
    '      <span class="wm-icon">🔎</span><span class="wm-lbl">교차만</span>',
    '      <span class="wm-badge wm-badge--off">OFF</span>',
    '    </button>',

    '    <button id="' + BTN_CLEAR_ID + '" class="wm-btn wm-btn--danger" title="도형 초기화 (동/구 표시 유지)">',
    '      <span class="wm-icon">🗑</span><span class="wm-lbl">초기화</span>',
    '    </button>',

    '  </div>',
    '</div>',

    /* ══ 지역 검색창 (항상 보임) ════════════════════════════════ */
    '<div class="wm-search-bar">',
    '  <input type="text" id="' + SEARCH_INPUT_ID + '" class="wm-search-input"',
    '    placeholder="지역 검색 (동/읍/면/시/구...)" autocomplete="off">',
    '  <button id="' + SEARCH_BTN_ID + '" class="wm-search-btn">🔍</button>',
    '  <ul id="' + SEARCH_LIST_ID + '" class="wm-search-list"></ul>',
    '</div>',

    /* ══ 결과 표시 (항상 보임) ════════════════════════════════════ */
    '<div class="wm-result" id="' + RESULT_ID + '">',
    '  <div class="wm-result-header">',
    '    <span class="wm-result-label">📍 교차 지역</span>',
    '    <span class="wm-result-count" id="' + RESULT_CNT_ID + '">0개</span>',
    '  </div>',
    '  <div class="wm-result-text" id="' + RESULT_TEXT_ID + '">지도를 클릭해 도형을 그려주세요</div>',
    '</div>',

    /* ══ 접히는 영역 ══════════════════════════════════════════════ */
    '<div id="' + COLLAPSIBLE_ID + '" class="wm-collapsible">',

    '  <!-- 모드 선택 행 -->',
    '  <div class="wm-row wm-row--mode">',
    '    <div class="wm-label">모드</div>',
    '    <div class="wm-btn-group">',
    '      <button id="' + BTN_LINE_ID + '" class="wm-btn wm-btn--mode" title="선 모드">',
    '        <span class="wm-icon">📏</span><span class="wm-lbl">선 모드</span>',
    '      </button>',
    '      <button id="' + BTN_FAN_ID + '" class="wm-btn wm-btn--mode" title="부채꼴 모드">',
    '        <span class="wm-icon">🔔</span><span class="wm-lbl">부채꼴</span>',
    '      </button>',
    '      <button id="' + BTN_ADD_LINE_ID + '" class="wm-btn wm-btn--add" title="이전 끝점에서 새 선 이어붙이기" style="display:none">',
    '        <span class="wm-icon">➕📏</span><span class="wm-lbl">선 추가</span>',
    '      </button>',
    '      <button id="' + BTN_ADD_FAN_ID + '" class="wm-btn wm-btn--add" title="이전 끝점에서 새 부채꼴 이어붙이기" style="display:none">',
    '        <span class="wm-icon">➕🔔</span><span class="wm-lbl">부채꼴 추가</span>',
    '      </button>',
    '    </div>',
    '  </div>',

    '  <!-- 선 버퍼 슬라이더 -->',
    '  <div class="wm-row" id="wm-row-buf">',
    '    <div class="wm-label">선 굵기</div>',
    '    <div class="wm-slider-wrap">',
    '      <span class="wm-sl-min">0.1</span>',
    '      <input type="range" id="' + SLIDER_BUF_ID + '" min="0.1" max="3" step="0.1" value="0.3" class="wm-slider">',
    '      <span class="wm-sl-max">3km</span>',
    '      <span class="wm-sl-val" id="wm-buf-val">0.3km</span>',
    '    </div>',
    '  </div>',

    '  <!-- 부채꼴 r1 슬라이더 -->',
    '  <div class="wm-row" id="wm-row-r1">',
    '    <div class="wm-label">시작반경</div>',
    '    <div class="wm-slider-wrap">',
    '      <span class="wm-sl-min">0.1</span>',
    '      <input type="range" id="' + SLIDER_R1_ID + '" min="0.1" max="3" step="0.1" value="0.3" class="wm-slider">',
    '      <span class="wm-sl-max">3km</span>',
    '      <span class="wm-sl-val" id="wm-r1-val">0.3km</span>',
    '    </div>',
    '  </div>',

    '  <!-- 부채꼴 r2 슬라이더 -->',
    '  <div class="wm-row" id="wm-row-r2">',
    '    <div class="wm-label">도착반경</div>',
    '    <div class="wm-slider-wrap">',
    '      <span class="wm-sl-min">0.2</span>',
    '      <input type="range" id="' + SLIDER_R2_ID + '" min="0.2" max="5" step="0.1" value="0.8" class="wm-slider">',
    '      <span class="wm-sl-max">5km</span>',
    '      <span class="wm-sl-val" id="wm-r2-val">0.8km</span>',
    '    </div>',
    '  </div>',

    '</div>', // /#wm-collapsible

  ].join('\n');

  _injectStyles();

  // ── 이벤트 연결 ─────────────────────────────────────────────
  panel.querySelector('#' + BTN_LINE_ID).addEventListener('click', onLineFn);
  panel.querySelector('#' + BTN_FAN_ID).addEventListener('click', onFanFn);
  panel.querySelector('#' + BTN_COPY_ID).addEventListener('click', onAutoCopyFn);
  panel.querySelector('#' + BTN_GPS_TRK_ID).addEventListener('click', onGpsTrackFn);
  panel.querySelector('#' + BTN_ADD_LINE_ID).addEventListener('click', onAddLineFn);
  panel.querySelector('#' + BTN_ADD_FAN_ID).addEventListener('click', onAddFanFn);
  panel.querySelector('#' + BTN_SHOW_ID).addEventListener('click', onShowDongFn);
  panel.querySelector('#' + BTN_DONG_FILTER_ID).addEventListener('click', onDongFilterFn);
  panel.querySelector('#' + BTN_CLEAR_ID).addEventListener('click', onClearFn);

  // 지역 검색 이벤트
  _bindSearchEvents(panel);

  // 접기/펼치기 토글 (설정 + 검색창 + 교차결과 모두 함께)
  panel.querySelector('#' + BTN_COLLAPSE_ID).addEventListener('click', function() {
    var coll       = document.getElementById(COLLAPSIBLE_ID);
    var searchBar  = panel.querySelector('.wm-search-bar');
    var resultArea = panel.querySelector('#' + RESULT_ID);
    var icon = this.querySelector('.wm-collapse-icon');
    var lbl  = this.querySelector('.wm-collapse-lbl');
    if (!coll) return;
    var isOpen = !coll.classList.contains('wm-collapsed');
    if (isOpen) {
      // 접기: 설정 + 검색 + 교차결과 숨김
      coll.classList.add('wm-collapsed');
      if (searchBar)  searchBar.classList.add('wm-collapsed');
      if (resultArea) resultArea.classList.add('wm-collapsed');
      icon.textContent = '▼';
      lbl.textContent  = '펼치기';
      this.title = '전체 펼치기';
    } else {
      // 펼치기
      coll.classList.remove('wm-collapsed');
      if (searchBar)  searchBar.classList.remove('wm-collapsed');
      if (resultArea) resultArea.classList.remove('wm-collapsed');
      icon.textContent = '▲';
      lbl.textContent  = '접기';
      this.title = '전체 접기';
    }
    // 지도 리사이즈
    setTimeout(function() {
      if (typeof map !== 'undefined' && map && map.invalidateSize) {
        map.invalidateSize({ animate: false });
      }
    }, 250);
  });

  // 슬라이더 이벤트
  panel.querySelector('#' + SLIDER_BUF_ID).addEventListener('input', function() {
    document.getElementById('wm-buf-val').textContent = parseFloat(this.value).toFixed(1) + 'km';
    onBufChangeFn(parseFloat(this.value));
  });
  panel.querySelector('#' + SLIDER_R1_ID).addEventListener('input', function() {
    document.getElementById('wm-r1-val').textContent = parseFloat(this.value).toFixed(1) + 'km';
    onR1ChangeFn(parseFloat(this.value));
  });
  panel.querySelector('#' + SLIDER_R2_ID).addEventListener('input', function() {
    document.getElementById('wm-r2-val').textContent = parseFloat(this.value).toFixed(1) + 'km';
    onR2ChangeFn(parseFloat(this.value));
  });

  // 헤더 아래 삽입
  var header = document.getElementById('header');
  if (header && header.parentNode) {
    header.parentNode.insertBefore(panel, header.nextSibling);
  } else {
    document.body.prepend(panel);
  }

  // 초기 슬라이더 숨김
  _showSliderRows(null);
}

// ── 공개 상태 갱신 함수 ──────────────────────────────────────────

/** 모드에 따라 슬라이더/추가버튼 표시 */
function _showSliderRows(mode) {
  var rowBuf  = document.getElementById('wm-row-buf');
  var rowR1   = document.getElementById('wm-row-r1');
  var rowR2   = document.getElementById('wm-row-r2');
  var addLine = document.getElementById(BTN_ADD_LINE_ID);
  var addFan  = document.getElementById(BTN_ADD_FAN_ID);

  if (rowBuf)  rowBuf.style.display  = (mode === 'line') ? 'flex' : 'none';
  if (rowR1)   rowR1.style.display   = (mode === 'fan')  ? 'flex' : 'none';
  if (rowR2)   rowR2.style.display   = (mode === 'fan')  ? 'flex' : 'none';
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

/** GPS 추적 버튼 상태 갱신 */
function setGpsTrackBtn(isOn) {
  var btn   = document.getElementById(BTN_GPS_TRK_ID);
  var badge = btn ? btn.querySelector('.wm-badge') : null;
  if (!btn || !badge) return;
  btn.classList.toggle('wm-btn--active', isOn);
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

/** 교차필터 버튼 상태 갱신 */
function setDongFilterBtn(isOn) {
  var btn   = document.getElementById(BTN_DONG_FILTER_ID);
  var badge = btn ? btn.querySelector('.wm-badge') : null;
  if (!btn || !badge) return;
  btn.classList.toggle('wm-btn--active', isOn);
  badge.textContent = isOn ? 'ON' : 'OFF';
  badge.classList.toggle('wm-badge--on',  isOn);
  badge.classList.toggle('wm-badge--off', !isOn);
}

/** 결과 텍스트 갱신 */
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

  textEl.textContent = Array.from(resultSet).join(',');
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

/** 패널 DOM 제거 */
function removeWorkModePanel() {
  var panel = document.getElementById(PANEL_ID);
  if (panel) panel.remove();
}

// ── 검색 이벤트 바인딩 ──────────────────────────────────────────

function _bindSearchEvents(panel) {
  var input = panel.querySelector('#' + SEARCH_INPUT_ID);
  var btn   = panel.querySelector('#' + SEARCH_BTN_ID);
  var list  = panel.querySelector('#' + SEARCH_LIST_ID);
  if (!input || !btn || !list) return;

  // 검색 실행
  function doSearch() {
    var q = input.value.trim();
    if (!q) { list.innerHTML = ''; list.style.display = 'none'; return; }

    // index.js의 _wmSearch 호출
    var results = (typeof window._wmSearch === 'function') ? window._wmSearch(q) : [];

    if (!results.length) {
      list.innerHTML = '<li class="wm-search-empty">검색 결과 없음</li>';
      list.style.display = 'block';
      return;
    }

    list.innerHTML = results.map(function(r, i) {
      return '<li class="wm-search-item" data-i="' + i + '">' + _escHtml(r.label) + '</li>';
    }).join('');
    list.style.display = 'block';

    // 결과 클릭 → 지도 이동
    list.querySelectorAll('.wm-search-item').forEach(function(li, i) {
      li.addEventListener('click', function() {
        var r = results[i];
        if (typeof window._wmFlyTo === 'function') {
          window._wmFlyTo(r.lat, r.lng, r.zoom, r.nodes || []);
        }
        list.style.display = 'none';
        input.value = r.label;
      });
    });
  }

  btn.addEventListener('click', doSearch);

  // Enter 키 검색
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doSearch();
    if (e.key === 'Escape') { list.innerHTML = ''; list.style.display = 'none'; }
  });

  // 검색창 외부 클릭 시 결과 닫기
  document.addEventListener('click', function(e) {
    if (!panel.contains(e.target)) {
      list.style.display = 'none';
    }
  });
}

function _escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
    /* ── 패널 래퍼 ── */
    #work-mode-panel {
      background: var(--surface,#111827);
      border-bottom: 2px solid var(--border,#1e3a5f);
      padding: 0;
      display: flex;
      flex-direction: column;
      z-index: 900;
      flex-shrink: 0;
    }

    /* ── 항상 보이는 상단 바 ── */
    .wm-fixed-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      flex-wrap: wrap;
      min-height: 38px;
    }
    .wm-fixed-divider {
      width: 1px;
      height: 18px;
      background: var(--border,#1e3a5f);
      flex-shrink: 0;
      margin: 0 2px;
    }

    /* ── 접기/펼치기 버튼 (사이드 토글과 동일 스타일 참고) ── */
    .wm-collapse-btn {
      display: flex;
      align-items: center;
      gap: 3px;
      background: var(--surface2,#1a2235);
      border: 1px solid var(--border,#1e3a5f);
      border-radius: 6px;
      color: var(--text-dim,#7a9bb5);
      padding: 4px 8px;
      font-size: .7rem;
      font-family: 'Noto Sans KR', sans-serif;
      cursor: pointer;
      transition: all .2s;
      flex-shrink: 0;
    }
    .wm-collapse-btn:hover {
      border-color: var(--accent,#00d4ff);
      color: var(--accent,#00d4ff);
    }
    .wm-collapse-icon { font-size: .65rem; transition: transform .2s; }
    .wm-collapse-lbl  { font-size: .68rem; }

    /* ── 접히는 영역 ── */
    .wm-collapsible {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 5px 10px 7px;
      border-top: 1px solid rgba(255,255,255,.05);
      overflow: hidden;
      transition: max-height .25s ease, opacity .2s, padding .2s;
      max-height: 300px;
      opacity: 1;
    }
    .wm-collapsible.wm-collapsed {
      max-height: 0;
      opacity: 0;
      padding-top: 0;
      padding-bottom: 0;
    }

    /* ── 결과 영역 ── */
    .wm-result {
      background: var(--surface2,#1a2235);
      border-top: 1px solid var(--border,#1e3a5f);
      border-bottom: none;
      padding: 5px 10px;
      overflow: hidden;
      transition: max-height .25s ease, opacity .2s, padding .2s, border-color .2s;
      max-height: 200px;
      opacity: 1;
    }
    .wm-result.wm-collapsed {
      max-height: 0;
      opacity: 0;
      padding-top: 0;
      padding-bottom: 0;
      border-top-width: 0;
    }
    .wm-result--copied { border-color: var(--accent3,#39ff14) !important; }
    .wm-result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
    }
    .wm-result-label { font-size: .58rem; color: var(--text-dim,#7a9bb5); text-transform: uppercase; letter-spacing: 1px; }
    .wm-result-count { font-size: .62rem; color: var(--accent,#00d4ff); font-weight: 700; }
    .wm-result-text  { font-size: .76rem; color: var(--text-dim,#7a9bb5); word-break: break-all; line-height: 1.5; }
    .wm-result-text--has-result { color: var(--text,#e8f4fd); font-weight: 600; }

    /* ── 공통 행 ── */
    .wm-row {
      display: flex;
      align-items: center;
      gap: 7px;
      min-height: 28px;
    }
    .wm-row--mode {
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(255,255,255,.05);
    }
    .wm-label {
      font-size: .58rem;
      color: var(--text-dim,#7a9bb5);
      text-transform: uppercase;
      letter-spacing: 1px;
      width: 44px;
      flex-shrink: 0;
    }

    /* ── 버튼 그룹 ── */
    .wm-btn-group { display: flex; gap: 4px; flex-wrap: wrap; }

    /* ── 공통 버튼 ── */
    .wm-btn {
      display: flex; align-items: center; gap: 3px;
      background: var(--surface2,#1a2235);
      border: 1px solid var(--border,#1e3a5f);
      border-radius: 6px;
      color: var(--text-dim,#7a9bb5);
      padding: 3px 8px;
      font-size: .72rem;
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
      box-shadow: 0 0 6px rgba(0,212,255,.18);
    }
    .wm-btn--add   { border-color: #00b894; color: #00b894; }
    .wm-btn--add:hover { background: rgba(0,184,148,.1); }
    .wm-btn--show  { border-color: #a29bfe; color: #a29bfe; }
    .wm-btn--show:hover { background: rgba(162,155,254,.1); }
    .wm-btn--gps-track { }
    .wm-btn--filter { border-color: #fdcb6e; color: #fdcb6e; }
    .wm-btn--filter:hover { background: rgba(253,203,110,.1); }
    .wm-btn--filter.wm-btn--active { border-color: #fdcb6e !important; color: #fdcb6e !important; background: rgba(253,203,110,.15) !important; box-shadow: 0 0 6px rgba(253,203,110,.3); }
    .wm-btn--danger:hover { border-color: var(--accent2,#ff3c6e); color: var(--accent2,#ff3c6e); }
    .wm-icon { font-size: .82rem; }
    .wm-lbl  { font-size: .7rem; }

    /* ── 배지 ── */
    .wm-badge {
      font-size: .55rem; font-weight: 700;
      padding: 1px 3px; border-radius: 3px; margin-left: 1px;
    }
    .wm-badge--off { background: var(--surface,#111827); border: 1px solid var(--text-dim,#7a9bb5); color: var(--text-dim,#7a9bb5); }
    .wm-badge--on  { background: var(--accent3,#39ff14); color: #000; }

    /* ── GPS 상태 점 ── */
    .wm-gps-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .wm-gps-dot--active { background: var(--accent3,#39ff14); box-shadow: 0 0 4px var(--accent3,#39ff14); animation: wm-pulse 1.4s infinite; }
    .wm-gps-dot--wait   { background: var(--gold,#ffd700); animation: wm-pulse 2s infinite; }
    .wm-gps-dot--error  { background: var(--accent2,#ff3c6e); }
    @keyframes wm-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }

    /* ── 슬라이더 ── */
    .wm-slider-wrap { display: flex; align-items: center; gap: 5px; flex: 1; }
    .wm-slider      { flex: 1; height: 4px; accent-color: var(--accent,#00d4ff); cursor: pointer; }
    .wm-sl-min, .wm-sl-max { font-size: .56rem; color: var(--text-dim,#7a9bb5); white-space: nowrap; }
    .wm-sl-val { font-size: .66rem; font-weight: 700; color: var(--accent,#00d4ff); min-width: 36px; text-align: right; }

    /* ── 지역 검색 ── */
    .wm-search-bar {
      position: relative;
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-top: 1px solid var(--border,#1e3a5f);
      overflow: hidden;
      transition: max-height .25s ease, opacity .2s, padding .2s;
      max-height: 120px;
      opacity: 1;
    }
    .wm-search-bar.wm-collapsed {
      max-height: 0;
      opacity: 0;
      padding-top: 0;
      padding-bottom: 0;
      border-top-width: 0;
    }
    .wm-search-input {
      flex: 1;
      background: var(--surface2,#1a2235);
      border: 1px solid var(--border,#1e3a5f);
      border-radius: 6px;
      color: var(--text,#e8f4fd);
      padding: 4px 9px;
      font-size: .76rem;
      font-family: 'Noto Sans KR', sans-serif;
      outline: none;
      transition: border-color .15s;
    }
    .wm-search-input:focus { border-color: var(--accent,#00d4ff); }
    .wm-search-input::placeholder { color: var(--text-dim,#7a9bb5); font-size: .72rem; }
    .wm-search-btn {
      background: var(--surface2,#1a2235);
      border: 1px solid var(--border,#1e3a5f);
      border-radius: 6px;
      color: var(--accent,#00d4ff);
      padding: 4px 8px;
      font-size: .85rem;
      cursor: pointer;
      transition: all .15s;
      flex-shrink: 0;
    }
    .wm-search-btn:hover { background: rgba(0,212,255,.1); border-color: var(--accent,#00d4ff); }
    .wm-search-list {
      display: none;
      position: absolute;
      top: calc(100% - 4px);
      left: 10px;
      right: 10px;
      background: var(--surface,#111827);
      border: 1px solid var(--border,#1e3a5f);
      border-radius: 0 0 8px 8px;
      list-style: none;
      margin: 0; padding: 0;
      z-index: 9999;
      max-height: 220px;
      overflow-y: auto;
      box-shadow: 0 8px 24px rgba(0,0,0,.5);
    }
    .wm-search-item {
      padding: 7px 12px;
      font-size: .76rem;
      color: var(--text-dim,#7a9bb5);
      cursor: pointer;
      border-bottom: 1px solid rgba(255,255,255,.04);
      transition: background .1s;
    }
    .wm-search-item:hover { background: var(--surface2,#1a2235); color: var(--accent,#00d4ff); }
    .wm-search-item:last-child { border-bottom: none; }
    .wm-search-empty {
      padding: 8px 12px;
      font-size: .73rem;
      color: var(--text-dim,#7a9bb5);
      text-align: center;
    }

    /* ── 모바일 480px 이하 ── */
    @media (max-width: 480px) {
      .wm-lbl   { display: none; }
      .wm-label { display: none; }
      .wm-btn   { padding: 4px 6px; }
      .wm-fixed-bar { gap: 4px; padding: 4px 7px; }
      .wm-collapse-lbl { display: none; }
      .wm-search-input::placeholder { font-size: .65rem; }
    }
  `;
  document.head.appendChild(style);
}