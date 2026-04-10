/**
 * ui.js — UI 렌더링 + 자동복사 모듈
 * ✅ 외부 호출 금지. index.js에서만 사용
 *
 * ⚠️ [중요도 최고] HTML 문자열 작성 규칙
 * ─────────────────────────────────────────
 * 이 파일의 HTML은 JS 배열 문자열('...')로 작성됨.
 * onclick 속성값 안에 절대 작은따옴표(') 사용 금지!
 *   ❌ 잘못된 예: onclick="_wmSetCircleColor('#ff0000',this)"
 *   ✅ 올바른 예: onclick="_wmSetCircleColor(this.dataset.color,this)"
 *   → data-color 속성에 색상값 저장, this.dataset.color로 접근
 *
 * 이 규칙을 어기면 JS 파싱 에러 → ui.js 전체 실행 중단
 * → setGpsDot, setActiveModeBtn 등 모든 UI 함수 미정의
 * → 지도 표시 불가, GPS 작동 불가 (치명적 연쇄 오류)
 * ─────────────────────────────────────────
 */

// ── 내부 상수 (⚠️ ID 변경 시 HTML과 동시에 변경 필요) ──────────────
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
const BTN_DRAW_ID       = 'wm-btn-draw';       // 그리기 모드
const BTN_CIRCLE_ID     = 'wm-btn-circle';     // 원형 모드
const BTN_ADD_DRAW_ID   = 'wm-btn-add-draw';   // 그리기 추가
const BTN_ADD_CIR_ID    = 'wm-btn-add-cir';    // 원형 추가
const SLIDER_DRAW_ID    = 'wm-slider-draw';    // 그리기 굵기
const SLIDER_CIR_ID     = 'wm-slider-cir';     // 원형 반경
const SLIDER_DRAW_COLOR = 'wm-draw-color';     // 그리기 색상
// ── 색상 행 ID (HTML과 반드시 일치해야 함) ────────────────────
const ROW_DRAW_COLOR_ID = 'wm-row-draw-color';  // 그리기 색상 행
const ROW_CIR_COLOR_ID  = 'wm-row-cir-color';   // 원형 색상 행

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
// ⚠️ [중요] 파라미터 순서 변경 시 index.js의 호출부도 반드시 같이 변경
// 현재 순서: onLineFn, onFanFn, onDrawFn, onCircleFn, onAutoCopyFn,
//            onGpsTrackFn, onAddLineFn, onAddFanFn, onAddDrawFn, onAddCirFn,
//            onShowDongFn, onDongFilterFn, onClearFn,
//            onBufChangeFn, onR1ChangeFn, onR2ChangeFn, onDrawBufFn, onCirRadFn
function renderWorkModePanel(
  onLineFn, onFanFn, onDrawFn, onCircleFn, // 모드 전환
  onAutoCopyFn,
  onGpsTrackFn,                             // GPS 추적 ON/OFF
  onAddLineFn, onAddFanFn,
  onAddDrawFn, onAddCirFn,                  // 그리기/원형 추가
  onShowDongFn,
  onDongFilterFn,                           // 교차지역만 Show
  onClearFn,
  onBufChangeFn, onR1ChangeFn, onR2ChangeFn,
  onDrawBufFn, onCirRadFn                   // 그리기 굵기 / 원형 반경
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

    '  <div class="wm-fixed-divider"></div>',

    '  <!-- 모드 버튼 그룹 (fixed-bar 2행) -->',
    '  <div class="wm-btn-group wm-mode-group">',
    '    <button id="' + BTN_LINE_ID + '" class="wm-btn wm-btn--mode" title="선 모드">',
    '      <span class="wm-icon">📏</span><span class="wm-lbl">선 모드</span>',
    '    </button>',
    '    <button id="' + BTN_FAN_ID + '" class="wm-btn wm-btn--mode" title="부채꼴 모드">',
    '      <span class="wm-icon">🔔</span><span class="wm-lbl">부채꼴</span>',
    '    </button>',
    '    <button id="' + BTN_DRAW_ID + '" class="wm-btn wm-btn--mode" title="자유 그리기 모드 (드래그)">',
    '      <span class="wm-icon">✏️</span><span class="wm-lbl">그리기</span>',
    '    </button>',
    '    <button id="' + BTN_CIRCLE_ID + '" class="wm-btn wm-btn--mode" title="원형 모드 (클릭 위치에 원 생성)">',
    '      <span class="wm-icon">⭕</span><span class="wm-lbl">원형</span>',
    '    </button>',
    '    <button id="' + BTN_ADD_LINE_ID + '" class="wm-btn wm-btn--add" title="이전 끝점에서 새 선 이어붙이기" style="display:none">',
    '      <span class="wm-icon">➕📏</span><span class="wm-lbl">선 추가</span>',
    '    </button>',
    '    <button id="' + BTN_ADD_FAN_ID + '" class="wm-btn wm-btn--add" title="이전 끝점에서 새 부채꼴 이어붙이기" style="display:none">',
    '      <span class="wm-icon">➕🔔</span><span class="wm-lbl">부채꼴 추가</span>',
    '    </button>',
    '    <button id="' + BTN_ADD_DRAW_ID + '" class="wm-btn wm-btn--add" title="그리기 추가 (드래그 1회 더)" style="display:none">',
    '      <span class="wm-icon">➕✏️</span><span class="wm-lbl">그리기 추가</span>',
    '    </button>',
    '    <button id="' + BTN_ADD_CIR_ID + '" class="wm-btn wm-btn--add" title="원형 추가 (클릭 위치에 원 하나 더)" style="display:none">',
    '      <span class="wm-icon">➕⭕</span><span class="wm-lbl">원형 추가</span>',
    '    </button>',
    '    <!-- 완료 버튼: 모드 활성 시만 표시 -->',
    '    <button id="wm-btn-done" class="wm-btn-done" style="display:none;" title="그리기 완료">',
    '      ✅ 완료',
    '    </button>',
    '  </div>',

    '  <!-- 3행: 슬라이더 + 완료버튼 (모드 활성 시만 표시) -->',
    '  <div id="wm-slider-bar" class="wm-slider-bar" style="display:none;">',
    '    <!-- 선 버퍼 슬라이더 -->',
    '    <div class="wm-row" id="wm-row-buf">',
    '      <div class="wm-label">선 굵기</div>',
    '      <div class="wm-slider-wrap">',
    '        <span class="wm-sl-min">0.1</span>',
    '        <input type="range" id="' + SLIDER_BUF_ID + '" min="0.1" max="15" step="0.1" value="0.3" class="wm-slider">',
    '        <span class="wm-sl-max">15km</span>',
    '        <span class="wm-sl-val" id="wm-buf-val">0.3km</span>',
    '      </div>',
    '    </div>',
    '    <!-- 부채꼴 r1 슬라이더 -->',
    '    <div class="wm-row" id="wm-row-r1">',
    '      <div class="wm-label">시작반경</div>',
    '      <div class="wm-slider-wrap">',
    '        <span class="wm-sl-min">0.1</span>',
    '        <input type="range" id="' + SLIDER_R1_ID + '" min="0.1" max="10" step="0.1" value="0.3" class="wm-slider">',
    '        <span class="wm-sl-max">10km</span>',
    '        <span class="wm-sl-val" id="wm-r1-val">0.3km</span>',
    '      </div>',
    '    </div>',
    '    <!-- 부채꼴 r2 슬라이더 -->',
    '    <div class="wm-row" id="wm-row-r2">',
    '      <div class="wm-label">도착반경</div>',
    '      <div class="wm-slider-wrap">',
    '        <span class="wm-sl-min">0.2</span>',
    '        <input type="range" id="' + SLIDER_R2_ID + '" min="0.2" max="15" step="0.1" value="0.8" class="wm-slider">',
    '        <span class="wm-sl-max">15km</span>',
    '        <span class="wm-sl-val" id="wm-r2-val">0.8km</span>',
    '      </div>',
    '    </div>',
    '    <!-- 그리기 색상 선택 -->',
    '    <div class="wm-row" id="wm-row-draw-color" style="display:none">',
    '      <div class="wm-label">선 색상</div>',
    '      <div class="wm-slider-wrap" style="gap:6px;flex-wrap:wrap;">',
    '        <button class="wm-color-swatch wm-color-active" data-color="#ff6b6b" style="background:#ff6b6b" title="빨강" onclick="_wmSetDrawColor(this.dataset.color,this)"></button>',
    '        <button class="wm-color-swatch" data-color="#00d4ff" style="background:#00d4ff" title="하늘" onclick="_wmSetDrawColor(this.dataset.color,this)"></button>',
    '        <button class="wm-color-swatch" data-color="#39ff14" style="background:#39ff14" title="초록" onclick="_wmSetDrawColor(this.dataset.color,this)"></button>',
    '        <button class="wm-color-swatch" data-color="#ffd700" style="background:#ffd700" title="노랑" onclick="_wmSetDrawColor(this.dataset.color,this)"></button>',
    '        <button class="wm-color-swatch" data-color="#ff9f43" style="background:#ff9f43" title="주황" onclick="_wmSetDrawColor(this.dataset.color,this)"></button>',
    '        <button class="wm-color-swatch" data-color="#a29bfe" style="background:#a29bfe" title="보라" onclick="_wmSetDrawColor(this.dataset.color,this)"></button>',
    '        <button class="wm-color-swatch" data-color="#ffffff" style="background:#fff;border:1px solid #555" title="흰색" onclick="_wmSetDrawColor(this.dataset.color,this)"></button>',
    '      </div>',
    '    </div>',
    '    <!-- 그리기 굵기 슬라이더 -->',
    '    <div class="wm-row" id="wm-row-draw">',
    '      <div class="wm-label">선 굵기</div>',
    '      <div class="wm-slider-wrap">',
    '        <span class="wm-sl-min">0.1</span>',
    '        <input type="range" id="' + SLIDER_DRAW_ID + '" min="0.1" max="15" step="0.1" value="0.3" class="wm-slider">',
    '        <span class="wm-sl-max">15km</span>',
    '        <span class="wm-sl-val" id="wm-draw-val">0.3km</span>',
    '      </div>',
    '    </div>',
    '    <!-- 원형 색상 선택 -->',
    '    <div class="wm-row" id="wm-row-cir-color" style="display:none">',
    '      <div class="wm-label">원 색상</div>',
    '      <div class="wm-slider-wrap" style="gap:6px;flex-wrap:wrap;">',
    '        <button class="wm-color-swatch wm-cir-color-active" data-color="#ff6b6b" style="background:#ff6b6b" title="빨강" onclick="_wmSetCircleColor(this.dataset.color,this)"></button>',
    '        <button class="wm-color-swatch" data-color="#00d4ff" style="background:#00d4ff" title="하늘" onclick="_wmSetCircleColor(this.dataset.color,this)"></button>',
    '        <button class="wm-color-swatch" data-color="#39ff14" style="background:#39ff14" title="초록" onclick="_wmSetCircleColor(this.dataset.color,this)"></button>',
    '        <button class="wm-color-swatch" data-color="#ffd700" style="background:#ffd700" title="노랑" onclick="_wmSetCircleColor(this.dataset.color,this)"></button>',
    '        <button class="wm-color-swatch" data-color="#ff9f43" style="background:#ff9f43" title="주황" onclick="_wmSetCircleColor(this.dataset.color,this)"></button>',
    '        <button class="wm-color-swatch" data-color="#a29bfe" style="background:#a29bfe" title="보라" onclick="_wmSetCircleColor(this.dataset.color,this)"></button>',
    '      </div>',
    '    </div>',
    '    <!-- 원형 반경 슬라이더 -->',
    '    <div class="wm-row" id="wm-row-cir">',
    '      <div class="wm-label">반경</div>',
    '      <div class="wm-slider-wrap">',
    '        <span class="wm-sl-min">0.5</span>',
    '        <input type="range" id="' + SLIDER_CIR_ID + '" min="0.5" max="30" step="0.5" value="3" class="wm-slider">',
    '        <span class="wm-sl-max">30km</span>',
    '        <span class="wm-sl-val" id="wm-cir-val">3km</span>',
    '      </div>',
    '    </div>',
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

    '  <!-- 모드 버튼은 상단 fixed-bar로 이동됨 -->',

    '  <!-- 슬라이더는 3행(wm-slider-bar)으로 이동됨 -->',

    '  <!-- ── 모바일 유저 메뉴 (접히는 영역 내 — 데스크탑은 숨김) ──── -->',
    '  <div class="wm-user-menu">',
    '    <div style="border-top:1px solid var(--border);margin:4px 0 8px;"></div>',
    '    <div style="display:flex;gap:6px;flex-wrap:wrap;">',

    '      <!-- 알림 버튼 -->',
    '      <button class="wm-btn wm-btn--user" id="wm-btn-notif" onclick="(function(){',
    '        var uc=document.getElementById(\'user-chip\');',
    '        if(uc){ uc.style.display=\'\'; }',
    '        if(typeof toggleDropdown===\'function\') toggleDropdown();',
    '        setTimeout(function(){',
    '          var area=document.getElementById(\'index-notif-area\');',
    '          if(area){ area.style.display=\'block\'; }',
    '        },100);',
    '      })()">',
    '        <span class="wm-icon">🔔</span>',
    '        <span class="wm-lbl">알림</span>',
    '        <span id="wm-notif-badge" style="display:none;background:#ff3c6e;color:#fff;border-radius:50%;',
    '          width:14px;height:14px;font-size:.55rem;font-weight:700;align-items:center;',
    '          justify-content:center;margin-left:1px;"></span>',
    '      </button>',

    '      <button class="wm-btn wm-btn--user" onclick="goMyInfo&&goMyInfo()">',
    '        <span class="wm-icon">👤</span><span class="wm-lbl">내정보</span>',
    '      </button>',
    '      <button class="wm-btn wm-btn--user" onclick="openPlanMenu&&openPlanMenu()">',
    '        <span class="wm-icon">💳</span><span class="wm-lbl">플랜/결제</span>',
    '      </button>',
    '      <button class="wm-btn wm-btn--user wm-btn--danger" onclick="closeDropdown&&closeDropdown();signOut&&signOut()">',
    '        <span class="wm-icon">🚪</span><span class="wm-lbl">로그아웃</span>',
    '      </button>',
    '    </div>',
    '  </div>',

    '</div>', // /#wm-collapsible

  ].join('\n');

  _injectStyles();

  // ── DOM에 먼저 삽입 후 이벤트 연결 ─────────────────────────
  // (DOM 삽입 전 querySelector는 일부 환경에서 이벤트 미연결 발생)
  var header = document.getElementById('header');
  if (header && header.parentNode) {
    header.parentNode.insertBefore(panel, header.nextSibling);
  } else {
    document.body.prepend(panel);
  }

  // 이제 DOM에 있으므로 getElementById로 안전하게 접근
  function _$$(id) { return document.getElementById(id); }

  // ── 이벤트 연결 ─────────────────────────────────────────────
  _$$(BTN_LINE_ID).addEventListener('click', onLineFn);
  _$$(BTN_FAN_ID).addEventListener('click', onFanFn);
  _$$(BTN_COPY_ID).addEventListener('click', onAutoCopyFn);
  _$$(BTN_GPS_TRK_ID).addEventListener('click', onGpsTrackFn);
  _$$(BTN_ADD_LINE_ID).addEventListener('click', onAddLineFn);
  _$$(BTN_ADD_FAN_ID).addEventListener('click', onAddFanFn);
  _$$(BTN_SHOW_ID).addEventListener('click', onShowDongFn);
  _$$(BTN_DONG_FILTER_ID).addEventListener('click', onDongFilterFn);
  _$$(BTN_CLEAR_ID).addEventListener('click', onClearFn);

  // 지역 검색 이벤트
  _bindSearchEvents(panel);

  // 접기/펼치기 토글 (설정 + 검색창 + 교차결과 모두 함께)
  _$$(BTN_COLLAPSE_ID).addEventListener('click', function() {
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

  // 슬라이더 이벤트 (getElementById - DOM 삽입 후이므로 안전)
  _$$(SLIDER_BUF_ID).addEventListener('input', function() {
    document.getElementById('wm-buf-val').textContent = parseFloat(this.value).toFixed(1) + 'km';
    onBufChangeFn(parseFloat(this.value));
  });
  _$$(SLIDER_R1_ID).addEventListener('input', function() {
    document.getElementById('wm-r1-val').textContent = parseFloat(this.value).toFixed(1) + 'km';
    onR1ChangeFn(parseFloat(this.value));
  });
  _$$(SLIDER_R2_ID).addEventListener('input', function() {
    document.getElementById('wm-r2-val').textContent = parseFloat(this.value).toFixed(1) + 'km';
    onR2ChangeFn(parseFloat(this.value));
  });

  // (DOM 삽입은 이벤트 연결 전으로 이동됨 - 위 코드 참조)

  // 초기 슬라이더 숨김
  _showSliderRows(null);

  // ── 그리기 모드 버튼 ──────────────────────────────────────────
  var drawBtn = document.getElementById(BTN_DRAW_ID);
  if (drawBtn) drawBtn.addEventListener('click', function() {
    if (typeof onDrawFn === 'function') onDrawFn();
  });

  // ── 원형 모드 버튼 ────────────────────────────────────────────
  var circleBtn = document.getElementById(BTN_CIRCLE_ID);
  if (circleBtn) circleBtn.addEventListener('click', function() {
    if (typeof onCircleFn === 'function') onCircleFn();
  });

  // ── 그리기 추가 버튼 ─────────────────────────────────────────
  var addDrawBtn = document.getElementById(BTN_ADD_DRAW_ID);
  if (addDrawBtn && onAddDrawFn) addDrawBtn.addEventListener('click', onAddDrawFn);

  // ── 원형 추가 버튼 ───────────────────────────────────────────
  var addCirBtn = document.getElementById(BTN_ADD_CIR_ID);
  if (addCirBtn && onAddCirFn) addCirBtn.addEventListener('click', onAddCirFn);

  // ── 그리기 굵기 슬라이더 ─────────────────────────────────────
  var slDraw = document.getElementById(SLIDER_DRAW_ID);
  var drawVal = document.getElementById('wm-draw-val');
  if (slDraw) slDraw.addEventListener('input', function() {
    var v = parseFloat(this.value);
    if (drawVal) drawVal.textContent = v.toFixed(1) + 'km';
    if (typeof onDrawBufFn === 'function') onDrawBufFn(v);
  });

  // ── 원형 반경 슬라이더 ───────────────────────────────────────
  var slCir = document.getElementById(SLIDER_CIR_ID);
  var cirVal = document.getElementById('wm-cir-val');
  if (slCir) slCir.addEventListener('input', function() {
    var v = parseFloat(this.value);
    if (cirVal) cirVal.textContent = v.toFixed(1) + 'km';
    if (typeof onCirRadFn === 'function') onCirRadFn(v);
  });
}

// ── 공개 상태 갱신 함수 ──────────────────────────────────────────

/** 모드에 따라 슬라이더/추가버튼 표시 */
/**
 * 슬라이더/버튼 표시 제어
 * mode: 'line' | 'fan' | null(완료) | 'done-line' | 'done-fan'
 * done-*: 완료 상태 (추가버튼 유지, 슬라이더 닫힘, 완료버튼 유지)
 */
// ⚠️ [중요] _showSliderRows — 모드별 UI 표시 규칙
// 변경 시 반드시 아래 표 기준으로 전체 확인할 것
// ┌──────────────┬──────────┬──────────────┬──────────┬──────────┐
// │   mode       │슬라이더바 │  슬라이더 행  │  추가버튼 │ 완료버튼  │
// ├──────────────┼──────────┼──────────────┼──────────┼──────────┤
// │ null         │  닫힘    │    닫힘       │   숨김   │   숨김   │
// │ 'line'       │  열림    │ buf 열림      │   숨김   │   표시   │
// │ 'fan'        │  열림    │ r1,r2 열림    │   숨김   │   표시   │
// │ 'draw'       │  열림    │ 색상+굵기열림  │ 그리기추가│   표시   │  ← 추가버튼 활성 중에도 표시
// │ 'circle'     │  열림    │ 색상+반경열림  │ 원형추가  │   표시   │  ← 추가버튼 활성 중에도 표시
// │ 'done-line'  │  닫힘    │    닫힘       │ 선추가   │   표시   │
// │ 'done-fan'   │  닫힘    │    닫힘       │ 부채추가  │   표시   │
// │ 'done-draw'  │  닫힘    │    닫힘       │   숨김   │   표시   │
// │ 'done-circle'│  닫힘    │    닫힘       │   숨김   │   표시   │
// └──────────────┴──────────┴──────────────┴──────────┴──────────┘
function _showSliderRows(mode) {
  var sliderBar    = document.getElementById('wm-slider-bar');
  var rowBuf       = document.getElementById('wm-row-buf');
  var rowR1        = document.getElementById('wm-row-r1');
  var rowR2        = document.getElementById('wm-row-r2');
  var rowDraw      = document.getElementById('wm-row-draw');
  var rowCir       = document.getElementById('wm-row-cir');
  var rowDrawColor = document.getElementById(ROW_DRAW_COLOR_ID);
  var rowCirColor  = document.getElementById(ROW_CIR_COLOR_ID);
  var addLine      = document.getElementById(BTN_ADD_LINE_ID);
  var addFan       = document.getElementById(BTN_ADD_FAN_ID);
  var addDraw      = document.getElementById(BTN_ADD_DRAW_ID);
  var addCir       = document.getElementById(BTN_ADD_CIR_ID);
  var doneBtn      = document.getElementById('wm-btn-done');

  var isDone     = (mode === 'done-line' || mode === 'done-fan' ||
                    mode === 'done-draw' || mode === 'done-circle');
  var activeMode = isDone ? mode.replace('done-', '') : mode;

  // ── 슬라이더 바: 활성 중만 열림
  if (sliderBar) sliderBar.style.display = (mode && !isDone) ? 'flex' : 'none';

  // ── 슬라이더 행: 해당 모드 활성 중일 때만 표시
  if (rowBuf)       rowBuf.style.display       = (activeMode === 'line'   && !isDone) ? 'flex' : 'none';
  if (rowR1)        rowR1.style.display        = (activeMode === 'fan'    && !isDone) ? 'flex' : 'none';
  if (rowR2)        rowR2.style.display        = (activeMode === 'fan'    && !isDone) ? 'flex' : 'none';
  if (rowDraw)      rowDraw.style.display      = (activeMode === 'draw'   && !isDone) ? 'flex' : 'none';
  if (rowCir)       rowCir.style.display       = (activeMode === 'circle' && !isDone) ? 'flex' : 'none';
  if (rowDrawColor) rowDrawColor.style.display = (activeMode === 'draw'   && !isDone) ? 'flex' : 'none';
  if (rowCirColor)  rowCirColor.style.display  = (activeMode === 'circle' && !isDone) ? 'flex' : 'none';

  // ── 추가버튼 규칙 ──────────────────────────────────────────────
  // 선/부채꼴: done 상태에서만 표시
  if (addLine) addLine.style.display = (activeMode === 'line' && isDone)  ? 'flex' : 'none';
  if (addFan)  addFan.style.display  = (activeMode === 'fan'  && isDone)  ? 'flex' : 'none';
  // 그리기: 활성 중(draw)에 표시 | done-draw/null 숨김
  if (addDraw) addDraw.style.display = (mode === 'draw') ? 'flex' : 'none';
  // 원형: 활성 중(circle)에 표시 | done-circle/null 숨김
  if (addCir)  addCir.style.display  = (mode === 'circle') ? 'flex' : 'none';

  // ── 완료버튼: 모드가 있을 때 항상 표시
  if (doneBtn) doneBtn.style.display = mode ? 'flex' : 'none';
}

/** 완료 버튼 클릭 — 3행 닫기, 추가버튼 유지, 지도 클릭 비활성화 */
function _bindDoneBtn(onDoneFn) {
  var btn = document.getElementById('wm-btn-done');
  if (!btn) return;
  btn.addEventListener('click', function() {
    if (typeof onDoneFn === 'function') onDoneFn();
  });
}

/** 활성 모드 버튼 강조 (done-* 포함) */
function setActiveModeBtn(mode) {
  var lineBtn   = document.getElementById(BTN_LINE_ID);
  var fanBtn    = document.getElementById(BTN_FAN_ID);
  var drawBtn   = document.getElementById(BTN_DRAW_ID);
  var circleBtn = document.getElementById(BTN_CIRCLE_ID);
  if (!lineBtn || !fanBtn) return;

  var isDone = (mode === 'done-line' || mode === 'done-fan' ||
                mode === 'done-draw' || mode === 'done-circle');
  var activeMode = isDone ? mode.replace('done-', '') : mode;

  lineBtn.classList.toggle('wm-btn--active',   activeMode === 'line');
  fanBtn.classList.toggle('wm-btn--active',    activeMode === 'fan');
  if (drawBtn)   drawBtn.classList.toggle('wm-btn--active',   activeMode === 'draw');
  if (circleBtn) circleBtn.classList.toggle('wm-btn--active', activeMode === 'circle');
  _showSliderRows(mode);
}

/** 자동복사 배지 갱신 */
function setAutoCopyBtn(isOn) {
  var btn   = document.getElementById(BTN_COPY_ID);
  var badge = btn ? btn.querySelector('.wm-badge') : null;
  if (!btn || !badge) return;
  btn.classList.toggle('wm-btn--active', isOn);
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
// ⚠️ [중요] setGpsDot은 GPS 수신 즉시 호출됨 (initWorkMode → initGPS → onUpdate)
// ui.js 로드 실패 시 이 함수가 없어 ReferenceError 발생 → 지도 전체 먹통
// 연쇄 오류 방지: ui.js가 index.js보다 반드시 먼저 로드되어야 함
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
  // DOM에 삽입된 이후이므로 getElementById로 안전하게 접근
  var input = document.getElementById(SEARCH_INPUT_ID);
  var btn   = document.getElementById(SEARCH_BTN_ID);
  var list  = document.getElementById(SEARCH_LIST_ID);
  if (!input || !btn || !list) {
    console.warn('[WorkMode] 검색 요소 없음:', SEARCH_INPUT_ID, SEARCH_BTN_ID, SEARCH_LIST_ID);
    return;
  }

  // 결과 1건 → 즉시 이동, 2건 이상 → 리스트 표시
  function flyToResult(r) {
    if (typeof window._wmFlyTo === 'function') {
      window._wmFlyTo(r.lat, r.lng, r.zoom, r.nodes || []);
    }
    list.innerHTML = '';
    list.style.display = 'none';
    // 재검색 가능하도록: 레이블 대신 검색 가능한 핵심 지명 저장
    // "인천 서구 청라동 (3개)" → "청라동", "서울특별시 강남구" → "강남구"
    // 마지막 공백-구분 토큰에서 숫자 괄호 제거
    var searchable = r.label
      .replace(/\s*\(\d+개\)\s*$/, '')   // " (3개)" 제거
      .split(' ')
      .pop() || r.label;                 // 마지막 토큰 (가장 구체적인 지명)
    input.value = searchable;
  }

  function doSearch() {
    var q = input.value.trim();
    if (!q) { list.innerHTML = ''; list.style.display = 'none'; return; }

    var results = (typeof window._wmSearch === 'function') ? window._wmSearch(q) : [];

    if (!results.length) {
      list.innerHTML = '<li class="wm-search-empty">검색 결과 없음</li>';
      list.style.display = 'block';
      return;
    }

    // ── 결과 1건: 즉시 이동 (리스트 없이)
    if (results.length === 1) {
      flyToResult(results[0]);
      return;
    }

    // ── 결과 2건 이상: 리스트 표시
    list.innerHTML = results.map(function(r, i) {
      return '<li class="wm-search-item" data-i="' + i + '">' + _escHtml(r.label) + '</li>';
    }).join('');
    list.style.display = 'block';

    list.querySelectorAll('.wm-search-item').forEach(function(li, i) {
      li.addEventListener('click', function() {
        flyToResult(results[i]);
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
    /* 1행: 기능버튼, 2행: 모드버튼 */
    .wm-mode-group {
      width: 100%;
      flex-wrap: wrap;
    }

    /* ── 3행: 슬라이더 바 ── */
    #wm-slider-bar {
      width: 100%;
      flex-direction: column;
      gap: 4px;
      padding: 6px 10px;
      background: rgba(0,0,0,.15);
      border-top: 1px solid var(--border, #1e3a5f);
    }

    /* ── 완료 버튼 ── */
    .wm-btn-done {
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #00b894, #00916e);
      border: none;
      border-radius: 8px;
      color: #fff;
      padding: 4px 18px;
      font-size: .75rem;
      font-weight: 700;
      font-family: 'Noto Sans KR', sans-serif;
      cursor: pointer;
      min-width: 72px;
      transition: all .15s;
      flex-shrink: 0;
    }
    .wm-btn-done:hover { background: linear-gradient(135deg,#00d4a7,#00b894); }
    .wm-btn-done:active { transform: scale(.97); }
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
    .wm-btn-group { display: flex; gap: 4px; flex-wrap: nowrap; }
    .wm-btn-group.wm-mode-group { flex-wrap: wrap; }

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
    .wm-btn--user { border-color: var(--border, #1e3a5f); color: var(--text-dim, #7a9bb5); }
    .wm-btn--user:hover { border-color: var(--accent, #00d4ff); color: var(--accent, #00d4ff); }

    /* 모바일에서만 유저메뉴 표시 */
    .wm-user-menu { display: none; }
    @media (max-width: 600px) {
      .wm-user-menu { display: block; }
    }
    #wm-notif-badge { display: none; }
    #wm-notif-badge.has-notif { display: inline-flex !important; }
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
      overflow: visible;          /* 드롭다운이 부모 밖으로 나올 수 있게 */
      transition: max-height .25s ease, opacity .2s, padding .2s;
      max-height: 120px;
      opacity: 1;
    }
    .wm-search-bar.wm-collapsed {
      max-height: 0 !important;
      opacity: 0;
      padding-top: 0;
      padding-bottom: 0;
      border-top-width: 0;
      pointer-events: none;
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
    @media (max-width: 600px) {
      /* wm-lbl: 모바일에서도 표시 (터치 편의성) */
      .wm-lbl   { display: inline; font-size: .62rem; }
      .wm-label { display: none; }
      .wm-btn   { padding: 4px 6px; font-size: .65rem; flex-shrink: 1; min-width: 0; }
      .wm-icon  { font-size: .75rem; }
      .wm-fixed-bar { gap: 3px; padding: 4px 6px; }
      .wm-fixed-divider { margin: 0 1px; height: 14px; }
      .wm-collapse-btn { padding: 4px 6px; font-size: .65rem; }
      .wm-collapse-lbl { display: inline; font-size: .62rem; }
      .wm-badge { font-size: .5rem; padding: 1px 2px; }
      .wm-search-input::placeholder { font-size: .65rem; }
    }

    /* ── 색상 스와치 ── */
    .wm-color-swatch {
      width: 22px; height: 22px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      padding: 0;
      transition: transform .15s, border-color .15s;
      flex-shrink: 0;
    }
    .wm-color-swatch:hover { transform: scale(1.2); }
    .wm-color-active { border-color: #fff !important; transform: scale(1.15); }
  `;
  document.head.appendChild(style);
}

// ── 색상 스와치 공통 헬퍼 ─────────────────────────────────────────
// ⚠️ [주의] 새 색상 선택창 추가 시 이 패턴 그대로 사용
// rowId: 해당 색상 행의 ID (상수 사용 권장)
// winKey: window 전역 색상 변수명 ('_drawColor' 또는 '_circleColor')
function _wmApplyColorSwatch(rowId, winKey, color, btn) {
  window[winKey] = color;
  var row = document.getElementById(rowId);
  if (row) row.querySelectorAll('.wm-color-swatch').forEach(function(s){
    s.classList.remove('wm-color-active');
  });
  if (btn) btn.classList.add('wm-color-active');
}

/** 그리기 색상 변경 (onclick에서 this.dataset.color, this 로 호출) */
function _wmSetDrawColor(color, btn) {
  _wmApplyColorSwatch(ROW_DRAW_COLOR_ID, '_drawColor', color, btn);
}

/** 원형 색상 변경 (onclick에서 this.dataset.color, this 로 호출) */
function _wmSetCircleColor(color, btn) {
  _wmApplyColorSwatch(ROW_CIR_COLOR_ID, '_circleColor', color, btn);
}
