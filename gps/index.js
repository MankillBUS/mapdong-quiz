/**
 * index.js — 업무모드 컨트롤 타워 (최종)
 */

// ════════════════════════════════════════════════════════════════
// 1. 전역 상태
// ════════════════════════════════════════════════════════════════

let _map         = null;
let _shapes      = [];          // { type, layer, polygon, endPt }[]
let _currentMode = null;        // 'line' | 'fan' | null
let _endPoint    = null;        // 부채꼴 고정 끝점
let _resultSet   = new Set();
let _autoCopy    = false;
let _prevResult  = '';

let _gpsWatchId  = null;
let _gpsPos      = null;
let _wmClickFn   = null;        // 업무모드 전용 클릭핸들러 (퀴즈 onMapClick과 완전 분리)

let _gpsTracking = true;        // GPS 실시간 추적 ON/OFF
let _gpsAutoTimer = null;       // 5초 자동 이동 타이머
let _wmVisibilityFn = null;     // 탭 전환 자동복사 핸들러

// 슬라이더 값
let _lineBuffer  = 0.3;
let _fanR1       = 0.3;
let _fanR2       = 0.8;

// 동/구 폴리곤 표시 레이어
let _dongLayers     = [];
let _dongVisible    = false;

// dong이름 → utype 매핑 (정규식 정리용)
// { "서초1동": "동", "화전읍": "읍", ... }
let _dongNameMap    = {};

// 내 위치 마커 레이어 (GPS 실시간 표시용)
let _gpsMarkerDot   = null;   // 내 위치 원형 마커
let _gpsMarkerRing  = null;   // 정확도 표시 반경 원

// 교차 지역만 Show 필터 모드
// true = 동/구표시 중 교차된 것만 보이고 나머지 숨김
// false = 전체 표시 (기본)
let _dongFilterMode = false;

// Leaflet 커스텀 pane 이름 (선/부채꼴 항상 최상단)
const _SHAPE_PANE = 'wm-shape-pane';

// 검색 결과 폴리곤 임시 표시 (5초 후 자동 제거)
let _searchPolyLayers = [];  // 현재 표시 중인 검색 폴리곤 레이어
let _searchPolyTimer  = null; // 5초 타이머

// ── 그리기 모드 상태 ──────────────────────────────────────────────
let _drawColor     = '#ff6b6b'; // 그리기 선 색상 (기본: 빨강)
window._drawColor  = _drawColor; // ui.js의 _wmSetDrawColor에서 접근
let _drawDoneOnce  = false;  // 드래그 1회 완료 여부 (추가버튼 눌러야 재활성화)
let _drawBuffer    = 0.3;   // 그리기 선 굵기 (km)
let _isDrawing     = false; // 드래그 중 여부
let _drawRawPts    = [];    // 드래그로 수집된 원시 latlng 점들
let _drawLayer     = null;  // 현재 드래그 중 표시 레이어 (Polyline 프리뷰)
let _drawShapeLayers = [];  // 그리기 구간별 폴리곤 레이어 목록

// ── 원형 모드 상태 ────────────────────────────────────────────────
let _circleRadius   = 3.0;        // 원형 반경 (km)
let _circleLayer    = null;       // 현재 원형 레이어
let _circleDoneOnce = false;      // 원 1개 생성 후 추가버튼 눌러야 재활성화
window._circleColor = '#ff6b6b'; // 원형 기본 색상 (빨강)

// ════════════════════════════════════════════════════════════════
// 2. 업무모드 진입
// ════════════════════════════════════════════════════════════════

function initWorkMode(leafletMap) {
  if (!_hasWorkModeAccess()) {
    alert('프리미엄 전용 기능입니다.\n업그레이드 후 이용해 주세요.');
    return;
  }
  if (_currentMode !== null || _gpsWatchId !== null) return;

  _map = leafletMap;

  // ── 선/부채꼴 전용 pane 생성 (동/구 레이어보다 항상 위) ──────
  if (!_map.getPane(_SHAPE_PANE)) {
    _map.createPane(_SHAPE_PANE);
    _map.getPane(_SHAPE_PANE).style.zIndex = 450;
    // 클릭 이벤트는 지도로 투과 (클릭 차단 방지)
    _map.getPane(_SHAPE_PANE).style.pointerEvents = 'none';
  }

  _gpsWatchId = initGPS(
    function(pos) { _wmOnGpsUpdate(pos); },
    function(err) { setGpsDot('error'); console.warn('[WorkMode] GPS 오류:', err); }
  );
  setGpsDot('wait');

  // ui.js의 renderWorkModePanel 호출 (12개 콜백, GPS이동버튼 제거)
  renderWorkModePanel(
    function() { _wmSwitchMode('line'); },   // 선 모드
    function() { _wmSwitchMode('fan'); },    // 부채꼴 모드
    function() { _wmSwitchMode('draw'); },   // 그리기 모드
    function() { _wmSwitchMode('circle'); }, // 원형 모드
    function() { _toggleAutoCopy(); },              // 자동복사
    function() { _toggleGpsTracking(); },           // GPS 추적 ON/OFF
    function() { _wmAddLineChain(); },       // 선 이어붙이기
    function() { _wmAddFanChain(); },        // 부채꼴 이어붙이기
    function() { _wmAddDrawChain(); },       // 그리기 추가
    function() { _wmAddCircleChain(); },     // 원형 추가
    function() { _wmToggleShowDong(); },            // 동/구 표시
    function() { _wmToggleDongFilter(); },          // 교차지역만 Show
    function() { _wmClearShapesOnly(); },           // 도형만 초기화
    function(v) { _lineBuffer = v; _wmRebuildAll(); _wmRunIntersect(); _wmUpdateUI(); },
    function(v) { _fanR1 = v; _wmRebuildAll(); _wmRunIntersect(); _wmUpdateUI(); },
    function(v) { _fanR2 = v; _wmRebuildAll(); _wmRunIntersect(); _wmUpdateUI(); },
    function(v) { _drawBuffer = v; _wmUpdateUI(); },   // 그리기 굵기
    function(v) { _circleRadius = v; _wmUpdateUI(); }  // 원형 반경
  );

  // 완료 버튼 바인딩
  if (typeof _bindDoneBtn === 'function') {
    _bindDoneBtn(function() {
      _wmDone();
    });
  }

  // 업무모드 진입 시 퀴즈 전용 UI 숨기기
  document.body.classList.add('work-mode');
  var moEl = document.getElementById('mo');
  if (moEl) moEl.style.display = 'none';
  var rcEl = document.getElementById('range-control');
  if (rcEl) rcEl.style.display = 'none';
  var sbEl = document.getElementById('stats-bar');
  if (sbEl) sbEl.style.display = 'none';

  // 양쪽 사이드바 기본 접힘
  var mainEl = document.getElementById('main');
  if (mainEl) {
    mainEl.classList.add('side-collapsed');
    mainEl.classList.add('right-collapsed');
    var sideToggle = document.getElementById('side-toggle');
    if (sideToggle) sideToggle.textContent = '▶';
    var rightToggle = document.getElementById('right-side-toggle');
    if (rightToggle) rightToggle.textContent = '◀';
    // 지도 크기 재계산
    setTimeout(function() {
      if (typeof map !== 'undefined' && map) {
        try { map.invalidateSize({ animate: false, pan: false }); } catch(e) {}
      }
    }, 300);
  }

  // ── 기본값 설정: GPS OFF, 동/구 ON, 자동복사 ON, 교차만 ON ──
  // GPS 추적 OFF
  _gpsTracking = false;
  setGpsTrackBtn(false);
  setGpsDot('wait');

  // ── 이전 업무모드 상태 복원 (처음으로 → 재진입 시) ─────────
  if (_wmSavedState) {
    // ── 저장된 업무모드 상태 복원 ──────────────────────────────
    var s = _wmSavedState;
    _wmSavedState = null;  // 복원 완료 즉시 클리어

    _lineBuffer  = s.lineBuffer;
    _fanR1       = s.fanR1;
    _fanR2       = s.fanR2;
    _endPoint    = s.endPoint;
    _lastMode    = s.lastMode;
    _autoCopy    = s.autoCopy;
    if (s.resultSet) _resultSet = new Set(s.resultSet);

    // 슬라이더 UI 값 동기화
    var slBuf = document.getElementById('wm-slider-buf');
    var slR1  = document.getElementById('wm-slider-r1');
    var slR2  = document.getElementById('wm-slider-r2');
    if (slBuf) slBuf.value = _lineBuffer;
    if (slR1)  slR1.value  = _fanR1;
    if (slR2)  slR2.value  = _fanR2;

    if (s.autoCopy) setAutoCopyBtn(true);

    // GPS 수신 후 도형 재생성 + 동구/교차 복원
    _wmNeedDefaultFan = false;
    _wmRestoreAfterGps = {
      dongVisible:  s.dongVisible,
      dongFilter:   s.dongFilter,
      hadShapes:    s.hadShapes,
    };
  } else {
    // 첫 진입: GPS 수신 후 기본 부채꼴 생성
    _wmNeedDefaultFan = true;
    _wmRestoreAfterGps = null;
  }

  // 자동복사 ON
  if (!_autoCopy) {
    _autoCopy = true;
    setAutoCopyBtn(true);
  }

  // 교차만 ON은 기본 부채꼴 생성 후 _wmInitDefaultFan에서 활성화

  // GPS 5초 자동이동 타이머 시작
  _startGpsAutoTimer();

  // 업무모드 전용 클릭핸들러 (퀴즈 onMapClick 덮어쓰기 방지)
  _wmClickFn = function(e) {
    // draw 모드는 드래그 이벤트로 처리 → 클릭 무시
    if (_currentMode === 'draw') return;
    if (_currentMode) { _wmMapClick(e.latlng); }
  };
  _map.on('click', _wmClickFn);

  // ── 그리기 모드: 지도 컨테이너에 마우스/터치 이벤트 바인딩 ──────
  _wmBindDrawEvents();

  // 탭 복귀 시 자동복사 갱신 (다른 탭 갔다 올 때)
  _wmVisibilityFn = function() {
    if (document.visibilityState === 'visible' && _autoCopy && _resultSet.size > 0) {
      var clipText = _normalizeForClipboard(_resultSet);
      _prevResult = autoCopyIfChanged(clipText, ''); // 강제 재복사
    }
  };
  document.addEventListener('visibilitychange', _wmVisibilityFn);
}

// ════════════════════════════════════════════════════════════════
// 3. 업무모드 종료
// ════════════════════════════════════════════════════════════════

function exitWorkMode() {
  // GPS 자동이동 타이머 정리
  _stopGpsAutoTimer();

  stopGPS(_gpsWatchId);
  _gpsWatchId  = null;
  _gpsPos      = null;
  _gpsTracking = true;

  _wmClearDongLayers();
  _wmClearAllLayers();
  _wmClearGpsMarker();

  if (_map && _wmClickFn) {
    try { _map.off('click', _wmClickFn); } catch(e) {}
    _wmClickFn = null;
  }

  // 탭 전환 핸들러 제거
  if (_wmVisibilityFn) {
    document.removeEventListener('visibilitychange', _wmVisibilityFn);
    _wmVisibilityFn = null;
  }

  _shapes       = [];
  _currentMode  = null;
  _lastMode     = null;
  _endPoint     = null;
  _resultSet    = new Set();
  _autoCopy     = false;
  _prevResult   = '';
  _dongLayers    = [];
  _dongVisible   = false;
  _dongNameMap   = {};
  _dongFilterMode = false;
  _gpsMarkerDot  = null;
  _gpsMarkerRing = null;
  _wmClearSearchPolygons();
  _gpsTracking  = true;
  _gpsAutoTimer = null;

  // 그리기/원형 모드 상태 정리 + 이벤트 언바인딩
  _wmClearDrawState();
  _wmUnbindDrawEvents();
  _wmUnlockScroll();   // 스크롤 잠금 해제 (드래그 중 종료 대비)
  _wmShowResult();     // 교차지역 텍스트창 복원 (드래그 중 종료 대비)

  removeWorkModePanel();

  // 업무모드 종료 시 퀴즈 전용 UI 복원
  document.body.classList.remove('work-mode');
  var moEl = document.getElementById('mo');
  if (moEl) moEl.style.display = '';
  var sbEl2 = document.getElementById('stats-bar');
  if (sbEl2) sbEl2.style.display = '';

  // 사이드바 원복
  var mainEl2 = document.getElementById('main');
  if (mainEl2) {
    mainEl2.classList.remove('side-collapsed');
    mainEl2.classList.remove('right-collapsed');
    var sideToggle2 = document.getElementById('side-toggle');
    if (sideToggle2) sideToggle2.textContent = '◀';
    var rightToggle2 = document.getElementById('right-side-toggle');
    if (rightToggle2) rightToggle2.textContent = '▶';
    setTimeout(function() {
      if (typeof map !== 'undefined' && map) {
        try { map.invalidateSize({ animate: false, pan: false }); } catch(e) {}
      }
    }, 300);
  }

  // #rbw 초기화 (다음 퀴즈/업무모드 진입 시 stag.sel 기준으로 참조)
  var rbwEl = document.getElementById('rbw');
  if (rbwEl) rbwEl.innerHTML = '';

  _map = null;
}

// ════════════════════════════════════════════════════════════════
// 4. 모드 전환
// ════════════════════════════════════════════════════════════════

// 마지막 사용 모드 기억 (완료 후 추가버튼 사용 시 참조)
let _lastMode = null;
let _wmNeedDefaultFan     = false;  // 업무모드 시작 시 기본 부채꼴 생성 대기
let _wmRestoreAfterGps    = null;   // GPS 수신 후 복원할 동구/교차 상태

// ── 업무모드 이전 상태 저장 (처음으로 → 재진입 시 복원) ─────────
var _wmSavedState = null;  // { shapes, endPoint, mode, lineBuffer, fanR1, fanR2 }

/**
 * 현재 업무모드 상태 전체 저장 (goHome 직전 호출)
 * index.html goHome()에서 호출
 */
window.saveWorkModeState = function() {
  if (typeof _map === 'undefined' || !_map) return;  // 업무모드 아님
  _wmSavedState = {
    shapes:       _shapes.slice(),
    endPoint:     _endPoint,
    lastMode:     _lastMode,
    currentMode:  _currentMode,
    lineBuffer:   _lineBuffer,
    fanR1:        _fanR1,
    fanR2:        _fanR2,
    dongVisible:  _dongVisible,
    dongFilter:   _dongFilterMode,
    autoCopy:     _autoCopy,
    resultSet:    new Set(_resultSet),
    hadShapes:    _shapes.length > 0,
  };
};

/** 저장된 상태 유효한지 확인 */
window.hasWorkModeSavedState = function() {
  return !!_wmSavedState;
};

/** 저장된 상태 클리어 (퀴즈/랭킹 시작 시) */
window.clearWorkModeSavedState = function() {
  _wmSavedState = null;
};

function _wmSwitchMode(mode) {
  // ── draw/circle: 활성 중 재클릭 → 기존 도형 초기화 + 처음부터 재시작
  // 슬라이더(색상/굵기/반경)는 닫히지 않음
  if (_currentMode === mode && (mode === 'draw' || mode === 'circle')) {
    _wmResetModeShapes(mode);
    return;
  }

  // ── 선/부채꼴: 활성 중 재클릭 → 완료 처리 (기존 동작 유지)
  if (_currentMode === mode) {
    _wmDone();
    return;
  }

  // ── done 상태(currentMode=null)에서 같은 모드 재클릭 → 전체 초기화 후 재시작
  if (_currentMode === null && _lastMode === mode) {
    _wmResetModeShapes(mode);
    return;
  }

  // ── 다른 모드로 전환 시 전체 초기화
  _wmClearDrawState();
  _drawDoneOnce   = false;
  _circleDoneOnce = false;
  _wmDestroyShapes();
  _currentMode = mode;
  _lastMode    = mode;
  setActiveModeBtn(mode);

  if (mode === 'fan')    _endPoint = null;
  if (mode === 'circle') _circleLayer = null;

  // draw 버튼 클릭 순간부터 결과창 고정 (드래그 시작 전부터 레이아웃 변화 차단)
  if (mode === 'draw') _wmHideResult();
}

/**
 * 해당 타입 shape 전부 삭제 후 처음부터 재시작
 * draw/circle 재클릭 시 슬라이더 닫히지 않고 초기화
 */
function _wmResetModeShapes(mode) {
  // 해당 타입 레이어 전부 지도에서 제거
  _shapes.filter(function(s){ return s.type === mode; }).forEach(function(s){
    if (s.layer) { try { _map.removeLayer(s.layer); } catch(x) {} }
  });
  _shapes = _shapes.filter(function(s){ return s.type !== mode; });

  // draw 상태 초기화
  _wmClearDrawState();
  _drawDoneOnce   = false;
  _circleDoneOnce = false;

  _currentMode = mode;
  _lastMode    = mode;

  if (mode === 'fan')    _endPoint = null;
  if (mode === 'circle') _circleLayer = null;

  // 슬라이더 유지 (setActiveModeBtn('draw'/'circle') → 슬라이더 열린 상태 유지)
  setActiveModeBtn(mode);

  // draw 재클릭(초기화) 시도 결과창 즉시 고정
  if (mode === 'draw') _wmHideResult();
}

/** 완료 처리 — 3행 닫기, _currentMode null, 추가버튼/완료버튼 유지 */
function _wmDone() {
  // 그리기 모드 완료 시 드래그 상태 강제 종료
  if (_currentMode === 'draw' && _isDrawing) {
    _isDrawing = false;
    if (_map && _map.dragging) try { _map.dragging.enable(); } catch(x) {}
    if (_drawLayer) { try { _map.removeLayer(_drawLayer); } catch(x) {} _drawLayer = null; }
    _drawRawPts = [];
  }
  var lastMode = _currentMode || _lastMode;
  _currentMode = null;
  setActiveModeBtn(lastMode ? 'done-' + lastMode : null);
  // draw 완료 시 결과창 복원 (버튼 클릭 ~ 완료까지 고정됐던 창 해제)
  if (lastMode === 'draw') _wmShowResult();
}



function _wmDoneReset() {
  // 추가버튼/모드버튼 클릭 시 완료 상태 리셋 → 정상 동작으로 복귀
  // _currentMode는 호출부에서 설정
}

// ════════════════════════════════════════════════════════════════
// 5. GPS 업데이트
// ════════════════════════════════════════════════════════════════

function _wmOnGpsUpdate(pos) {
  _gpsPos = pos;
  setGpsDot('active');

  if (!_isMapAlive()) {
    console.warn('[WorkMode] 지도 파괴됨 → 자동 종료');
    exitWorkMode();
    return;
  }

  // ── 내 위치 마커 갱신 ────────────────────────────────────────
  _wmUpdateGpsMarker(pos);

  // ── 최초 GPS 수신 시 처리 ────────────────────────────────────
  if (_wmNeedDefaultFan && _isValidLatLng(pos)) {
    _wmNeedDefaultFan = false;
    _wmInitDefaultFan(pos);
    return;
  }

  // ── 저장 상태 복원 후 첫 GPS 수신 ───────────────────────────
  if (_wmRestoreAfterGps && _isValidLatLng(pos)) {
    var r = _wmRestoreAfterGps;
    _wmRestoreAfterGps = null;

    // 도형 재생성
    if (r.hadShapes) {
      _wmRebuildAll();
      _wmRunIntersect();
    }
    // 동/구 표시 복원
    if (r.dongVisible && !_dongVisible) {
      _wmToggleShowDong();
    }
    // 교차만 복원
    if (r.dongFilter) {
      _dongFilterMode = true;
      setDongFilterBtn(true);
      if (_dongVisible) _wmApplyDongFilter();
    }
    _wmUpdateUI();
    return;
  }

  if (_shapes.length === 0) return;

  _wmRebuildAll();
  _wmRunIntersect();
  _wmUpdateUI();

  // 4번: GPS 위치 변경 시 자동복사 갱신
  if (_autoCopy && _resultSet.size > 0) {
    var clipText = _normalizeForClipboard(_resultSet);
    _prevResult = autoCopyIfChanged(clipText, _prevResult);
  }
}

/**
 * 업무모드 시작 시 GPS 기준 북쪽 1km 기본 부채꼴 자동 생성
 * → 동/구 레이어 전체 표시 방지, 교차 필터 즉시 작동
 */
function _wmInitDefaultFan(pos) {
  // 북쪽 1km 끝점 (경도는 같고 위도만 약 0.009도 증가)
  var defaultEnd = {
    lat: pos.lat + 0.009,  // ~1km 북쪽
    lng: pos.lng
  };
  _endPoint   = L.latLng(defaultEnd.lat, defaultEnd.lng);
  _currentMode = 'fan';
  _lastMode    = 'fan';
  setActiveModeBtn('fan');

  // 부채꼴 생성
  _wmRebuildAll();

  // 동/구 표시 ON
  if (!_dongVisible) {
    _wmToggleShowDong();
  }
  // 교차만 ON
  if (!_dongFilterMode) {
    _dongFilterMode = true;
    setDongFilterBtn(true);
    _wmApplyDongFilter();
  }

  _wmRunIntersect();
  _wmUpdateUI();
}

// ════════════════════════════════════════════════════════════════
// 6. 지도 클릭 (업무모드 전용)
// ════════════════════════════════════════════════════════════════

function _wmMapClick(latlng) {
  if (!_currentMode || !_isMapAlive()) return;
  if (!_isValidLatLng(_gpsPos)) {
    console.warn('[WorkMode] GPS 미수신');
    return;
  }

  if (_currentMode === 'line') {
    // [문제5 수정] 첫 클릭만 직접 처리. 이후 추가는 "선 추가" 버튼으로
    if (_shapes.filter(s => s.type === 'line').length === 0) {
      _wmAddLine(latlng);
    } else {
      // 이미 선이 있으면 마지막 선 교체 (끝점만 변경)
      _wmReplaceLastLine(latlng);
    }
  } else if (_currentMode === 'fan') {
    // 선모드와 동일한 방식
    _endPoint = latlng;
    _wmReplaceLastFan();
  } else if (_currentMode === 'circle') {
    // 원형 1회 제한 — 추가버튼 눌러야 재생성 가능
    if (_circleDoneOnce) return;
    _wmAddCircle(latlng);
    return; // 아래 runIntersect/updateUI 중복 방지
  }
  // draw 모드는 드래그 이벤트로 처리 → 여기서 처리 안 함

  _wmRunIntersect();
  _wmUpdateUI();
}

// ════════════════════════════════════════════════════════════════
// 7. 도형 생성 — 직접 추가
// ════════════════════════════════════════════════════════════════

function _wmAddLine(clickPos) {
  if (!_isValidLatLng(clickPos)) return;
  var result = buildLinePolygon(_gpsPos, clickPos, _lineBuffer);
  if (!result || !_isValidPolygon(result.polygon)) return;
  // 커스텀 pane에 추가 → 동/구 레이어보다 항상 위
  result.layer.options.pane = _SHAPE_PANE;
  result.layer.addTo(_map);
  _shapes.push({ type:'line', layer:result.layer, polygon:result.polygon, endPt:clickPos });
}

function _wmAddFan(clickPos) {
  if (!_isValidLatLng(clickPos)) return;
  if (!_endPoint) _endPoint = clickPos;
  var result = buildFanPolygon(_gpsPos, _endPoint, _fanR1, _fanR2,
    calcExternalTangents, calcArcPoints, calcAngle);
  if (!result || !_isValidPolygon(result.polygon)) {
    console.warn('[WorkMode] 부채꼴 생성 불가');
    return;
  }
  result.layer.options.pane = _SHAPE_PANE;
  result.layer.addTo(_map);
  _shapes.push({ type:'fan', layer:result.layer, polygon:result.polygon, endPt:_endPoint });
}

// ════════════════════════════════════════════════════════════════
// 8. [문제5,6] 이어붙이기 — PUBG 동선핑 방식
// ════════════════════════════════════════════════════════════════

/**
 * [문제5] 선 이어붙이기
 * 마지막 선의 endPt → 새 선의 startPt (GPS 대신)
 * → 새 도착지점은 다음 지도 클릭으로 결정
 */
function _wmAddLineChain() {
  // 완료 상태(null)에서도 이전 선 작업이 있으면 추가 가능
  if (_currentMode !== 'line' && _lastMode !== 'line') return;
  if (_currentMode === null) {
    // 완료 → 추가: 모드 재활성화
    _currentMode = 'line';
    setActiveModeBtn('line');
  }
  var lineShapes = _shapes.filter(function(s) { return s.type === 'line'; });
  if (!lineShapes.length) {
    alert('먼저 선 모드에서 지도를 클릭해 첫 선을 만드세요.');
    return;
  }

  var lastLine = lineShapes[lineShapes.length - 1];
  var chainStart = lastLine.endPt;  // 이전 선의 끝점 = 새 선의 시작점

  // 새 선의 끝점: GPS 현재 위치 방향으로 임시 미리보기
  // 다음 클릭 시 확정됨
  _shapes.push({
    type:       'line',
    layer:      null,     // 아직 그리지 않음
    polygon:    null,
    endPt:      null,
    chainFrom:  chainStart,  // 이전 끝점에서 시작
    pending:    true         // 다음 클릭 대기
  });

  // 클릭 시 pending 선 처리
  var origClickFn = _wmClickFn;
  _map.off('click', _wmClickFn);
  _wmClickFn = function(e) {
    _shapes = _shapes.filter(function(s) { return !s.pending; });
    _map.off('click', _wmClickFn);
    _wmClickFn = origClickFn;
    _map.on('click', _wmClickFn);

    // chainFrom → clickPos 선 생성
    var result = buildLinePolygon(chainStart, e.latlng, _lineBuffer);
    if (result && _isValidPolygon(result.polygon)) {
      result.layer.options.pane = _SHAPE_PANE;
      result.layer.addTo(_map);
      _shapes.push({ type:'line', layer:result.layer, polygon:result.polygon,
                     endPt:e.latlng, chainFrom:chainStart });
      _wmRunIntersect();
      _wmUpdateUI();
    }
  };
  _map.on('click', _wmClickFn);
}

/**
 * [문제6] 부채꼴 이어붙이기
 * 마지막 부채꼴의 endPt → 새 부채꼴의 시작 기준점
 * GPS 위치에서 새 끝점으로 부채꼴 생성 (다음 클릭으로 끝점 확정)
 */
function _wmAddFanChain() {
  // 완료 상태(null)에서도 이전 부채꼴 작업이 있으면 추가 가능
  if (_currentMode !== 'fan' && _lastMode !== 'fan') return;
  if (_currentMode === null) {
    // 완료 → 추가: 모드 재활성화
    _currentMode = 'fan';
    setActiveModeBtn('fan');
  }

  // 현재 부채꼴이 있어야 추가 가능
  var fanShapes = _shapes.filter(function(s) { return s.type === 'fan' && !s.pending; });
  if (!fanShapes.length) {
    alert('먼저 부채꼴 모드에서 지도를 클릭해 첫 부채꼴을 만드세요.');
    return;
  }

  // 현재 _endPoint(마지막 부채꼴 끝점)를 새 부채꼴의 chainFrom으로 고정
  var chainFrom = _endPoint;

  // pending 마커 추가 (다음 클릭 대기 중임을 표시)
  _shapes.push({ type:'fan', layer:null, polygon:null, endPt:null,
                 chainFrom:chainFrom, pending:true });

  // 원래 클릭 핸들러 보관 후 1회용 핸들러로 교체
  var origClickFn = _wmClickFn;
  _map.off('click', _wmClickFn);

  _wmClickFn = function(e) {
    // pending 제거
    _shapes = _shapes.filter(function(s) { return !s.pending; });

    // 핸들러 복원
    _map.off('click', _wmClickFn);
    _wmClickFn = origClickFn;
    _map.on('click', _wmClickFn);

    // 새 끝점 설정
    _endPoint = e.latlng;

    // chainFrom → 새끝점 부채꼴 생성
    var result = buildFanPolygon(
      chainFrom, e.latlng, _fanR1, _fanR2,
      calcExternalTangents, calcArcPoints, calcAngle
    );
    if (result && _isValidPolygon(result.polygon)) {
      result.layer.options.pane = _SHAPE_PANE;
      result.layer.addTo(_map);
      _shapes.push({ type:'fan', layer:result.layer, polygon:result.polygon,
                     endPt:e.latlng, chainFrom:chainFrom });
      _wmRunIntersect();
      _wmUpdateUI();
    } else {
      console.warn('[WorkMode] 부채꼴 추가 생성 불가: 두 점이 너무 가깝습니다.');
    }
  };
  _map.on('click', _wmClickFn);
}

// ════════════════════════════════════════════════════════════════
// 9. 마지막 도형 교체 (클릭 시 재조정)
// ════════════════════════════════════════════════════════════════

function _wmReplaceLastLine(clickPos) {
  // pending 아닌 마지막 선 (chainFrom 유무 무관 — 부채꼴과 동일 방식)
  var lineShapes = _shapes.filter(function(s) { return s.type === 'line' && !s.pending; });
  if (!lineShapes.length) { _wmAddLine(clickPos); return; }

  var last = lineShapes[lineShapes.length - 1];
  var idx  = _shapes.indexOf(last);

  // 기존 레이어 제거
  if (last.layer) { try { _map.removeLayer(last.layer); } catch(e) {} }

  // chainFrom 있으면 체인 시작점 유지, 없으면 GPS
  var startPt = last.chainFrom || _gpsPos;

  var result = buildLinePolygon(startPt, clickPos, _lineBuffer);
  if (!result || !_isValidPolygon(result.polygon)) return;

  result.layer.options.pane = _SHAPE_PANE;
  result.layer.addTo(_map);
  _shapes[idx] = { type:'line', layer:result.layer, polygon:result.polygon,
                   endPt:clickPos, chainFrom:last.chainFrom };
}

function _wmReplaceLastFan() {
  var fanShapes = _shapes.filter(function(s) { return s.type === 'fan' && !s.pending; });

  // 부채꼴이 없으면 새로 추가
  if (!fanShapes.length) {
    if (!_endPoint) return;
    _wmAddFan(_endPoint);
    return;
  }

  var last = fanShapes[fanShapes.length - 1];
  var idx  = _shapes.indexOf(last);

  if (last.layer) { try { _map.removeLayer(last.layer); } catch(e) {} }

  // chainFrom이 있으면 그 점에서 시작, 없으면 GPS에서 시작
  var startPt = last.chainFrom || _gpsPos;

  var result = buildFanPolygon(startPt, _endPoint, _fanR1, _fanR2,
    calcExternalTangents, calcArcPoints, calcAngle);
  if (!result || !_isValidPolygon(result.polygon)) {
    // 같은 점 클릭 등으로 생성 불가 시 이전 shape 유지
    console.warn('[WorkMode] _wmReplaceLastFan: 생성 불가');
    // 레이어 제거했으므로 이전 shape 제거
    _shapes.splice(idx, 1);
    return;
  }

  result.layer.options.pane = _SHAPE_PANE;
  result.layer.addTo(_map);
  _shapes[idx] = { type:'fan', layer:result.layer, polygon:result.polygon,
                   endPt:_endPoint, chainFrom:last.chainFrom };
}

// ════════════════════════════════════════════════════════════════
// 10. GPS 갱신 시 전체 재생성
// ════════════════════════════════════════════════════════════════

function _wmRebuildAll() {
  var updated = [];
  _shapes.forEach(function(shape) {
    // pending(클릭 대기) 상태는 건너뜀
    if (shape.pending) { updated.push(shape); return; }
    // layer 없고 pending도 아닌 건 잘못된 state → 제거
    if (!shape.layer) return;

    try { _map.removeLayer(shape.layer); } catch(e) {}

    // chainFrom: 이어붙이기 체인의 고정 시작점 → GPS와 무관하게 유지
    var startPt = shape.chainFrom || _gpsPos;
    var result = null;

    if (shape.type === 'line') {
      result = buildLinePolygon(startPt, shape.endPt, _lineBuffer);
    } else if (shape.type === 'fan') {
      result = buildFanPolygon(startPt, shape.endPt, _fanR1, _fanR2,
        calcExternalTangents, calcArcPoints, calcAngle);
    } else if (shape.type === 'circle') {
      // 원형: GPS 무관, 클릭 위치 고정 (endPt = 원 중심)
      result = buildCirclePolygon(shape.endPt, shape.radius || _circleRadius);
    } else if (shape.type === 'draw') {
      // ⚠️ [중요] draw는 Polyline으로 재생성 — pts/color/bufferKm 반드시 유지
      // GPS 갱신·탭 전환 시 이 정보 없으면 그린 선이 사라짐
      if (!shape.pts || shape.pts.length < 2) return;
      var drawColor = shape.color || window._drawColor || '#ff6b6b';
      var drawBuf   = shape.bufferKm || _drawBuffer;
      var newLine   = L.polyline(shape.pts, {
        color:   drawColor,
        weight:  Math.max(3, drawBuf * 25),
        opacity: 0.85,
        pane:    _SHAPE_PANE
      });
      newLine.addTo(_map);
      // 교차 연산용 폴리곤 재생성
      var dp = _buildDrawSegmentPolygon(shape.pts, drawBuf);
      updated.push({
        type:     'draw',
        layer:    newLine,
        polygon:  dp ? dp.polygon  : shape.polygon,
        segments: dp ? dp.segments : shape.segments,
        pts:      shape.pts,
        bufferKm: drawBuf,
        color:    drawColor
      });
      return; // draw는 아래 공통 처리 사용 안 함 (forEach → return)
    }

    if (result && _isValidPolygon(result.polygon)) {
      // 재생성 시에도 커스텀 pane 유지
      result.layer.options.pane = _SHAPE_PANE;
      result.layer.addTo(_map);
      // ⚠️ circle: color 반드시 유지
      if (result.layer.setStyle && shape.color) {
        result.layer.setStyle({ color: shape.color, fillColor: shape.color, fillOpacity: 0.18, weight: 2 });
      }
      updated.push({
        type:      shape.type,
        layer:     result.layer,
        polygon:   result.polygon,
        endPt:     shape.endPt,
        chainFrom: shape.chainFrom,
        radius:    shape.radius,
        color:     shape.color
      });
    }
  });
  _shapes = updated;
}

// ════════════════════════════════════════════════════════════════
// 11. [문제1,2] 동/구 폴리곤 표시 — 퀴즈모드 toggleShowAll 메커니즘 그대로
// ════════════════════════════════════════════════════════════════

function _wmToggleShowDong() {
  if (_dongVisible) {
    _wmClearDongLayers();
    _dongVisible = false;
    setShowDongBtn(false);
    return;
  }

  if (!_map || !_isMapAlive()) return;
  if (typeof POLY_CACHE === 'undefined' || !POLY_CACHE) return;
  if (typeof getDongGeo !== 'function') return;

  // 활성 지역 dongs 수집 (startWorkMode와 동일 방식)
  var dongs = _getActiveDongs();
  if (!dongs.length) { alert('선택된 지역이 없습니다.'); return; }

  // [문제1,2] 퀴즈모드 toggleShowAll과 동일한 렌더링 로직
  if (typeof isGuQuizMode !== 'undefined' && isGuQuizMode) {
    // ── 구 모드: 구 폴리곤 + 구 이름 ──────────────────────────
    var done = new Set();
    dongs.forEach(function(dong) {
      var isNoGu = !dong.gu || dong.gu === dong.rn;

      if (isNoGu) {
        // 구 없는 도시 → 동 폴리곤
        var node = getDongGeo(dong.rn, dong.gu, dong.d);
        if (!node) return;
        var geo = (typeof _geo === 'function') ? _geo(node) : null;
        if (!geo && node.geometry) geo = node.geometry;
        if (geo) {
          var lyr = _wmDrawPolygon(geo, '#a29bfe', 0.18);
          if (lyr) {
            lyr._wmDongName = dong.rn + '|' + (dong.gu && dong.gu !== dong.rn ? dong.gu : '') + '|' + dong.d;
            _dongLayers.push(lyr);
          }
        }
        var mk = L.marker([dong.lat, dong.lng], { icon: L.divIcon({
          className: '',
          iconAnchor: [0, 0],
          html: '<div style="display:inline-block;background:rgba(162,155,254,.92);color:#000;padding:3px 6px;border-radius:4px;font-size:10px;font-weight:600;white-space:nowrap;">' + dong.d + '</div>'
        })}).addTo(_map);
        mk._wmDongName = dong.rn + '|' + (dong.gu && dong.gu !== dong.rn ? dong.gu : '') + '|' + dong.d;
        _dongLayers.push(mk);

      } else {
        // 구 있는 도시 → 구 폴리곤 (중복 제거)
        var gk = dong.rn + '|' + dong.gu;
        if (done.has(gk)) return;
        done.add(gk);
        var guGeo = (typeof getGuGeo === 'function') ? getGuGeo(dong.rn, dong.gu) : null;
        if (!guGeo) return;
        var lyr2 = _wmDrawPolygon(guGeo, '#a29bfe', 0.18);
        if (lyr2) {
          lyr2._wmDongName = dong.rn + '|' + dong.gu + '|';
          _dongLayers.push(lyr2);
        }
        var ctr = (typeof getCenter === 'function') ? getCenter(guGeo) : null;
        if (ctr) {
          var mk2 = L.marker([ctr[0], ctr[1]], { icon: L.divIcon({
            className: '',
            iconAnchor: [0, 0],
            html: '<div style="display:inline-block;background:rgba(162,155,254,.92);color:#000;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap;">' + dong.gu + '</div>'
          })}).addTo(_map);
          mk2._wmDongName = dong.rn + '|' + dong.gu + '|';
          _dongLayers.push(mk2);
        }
      }
    });

  } else {
    // ── 동 모드: 동 폴리곤 + 동 이름 ──────────────────────────
    dongs.forEach(function(dong) {
      var node = getDongGeo(dong.rn, dong.gu, dong.d);
      if (!node) return;
      var geo = (typeof _geo === 'function') ? _geo(node) : null;
      if (!geo && node.geometry) geo = node.geometry;
      if (geo) {
        var lyr = _wmDrawPolygon(geo, '#a29bfe', 0.18);
        if (lyr) {
          lyr._wmDongName = dong.rn + '|' + (dong.gu && dong.gu !== dong.rn ? dong.gu : '') + '|' + dong.d;
          _dongLayers.push(lyr);
        }
      }
      var mk = L.marker([dong.lat, dong.lng], { icon: L.divIcon({
        className: '',
        iconAnchor: [0, 0],
        html: '<div style="display:inline-block;background:rgba(162,155,254,.92);color:#000;padding:3px 6px;border-radius:4px;font-size:10px;font-weight:600;white-space:nowrap;">' + dong.d + '</div>'
      })}).addTo(_map);
      mk._wmDongName = dong.rn + '|' + (dong.gu && dong.gu !== dong.rn ? dong.gu : '') + '|' + dong.d;
      _dongLayers.push(mk);
    });
  }

  _dongVisible = true;
  setShowDongBtn(true);

  // 재표시 시 교차필터 모드였으면 자동 적용
  if (_dongFilterMode) {
    _wmApplyDongFilter();
  }
}

function _wmClearDongLayers() {
  _dongLayers.forEach(function(l) {
    try { _map.removeLayer(l); } catch(e) {}
  });
  _dongLayers = [];
}

// ════════════════════════════════════════════════════════════════
// 12. 교차 연산
// ════════════════════════════════════════════════════════════════

function _wmRunIntersect() {
  var dongPolygons = _getActiveDongPolygons();
  if (!dongPolygons.length) { _resultSet = new Set(); return; }

  var newSet = new Set();
  _shapes.forEach(function(shape) {
    if (shape.pending) return;

    if (shape.type === 'draw' && shape.segments && shape.segments.length) {
      // 그리기 모드: 구간별 폴리곤 각각 교차 판정
      shape.segments.forEach(function(seg) {
        if (!_isValidPolygon(seg)) return;
        var names = intersectPolygon(seg, dongPolygons);
        names.forEach(function(n) { newSet.add(n); });
      });
      return;
    }

    if (!shape.polygon) return;
    // intersectPolygon은 name(=uniqueName)을 반환
    var names = intersectPolygon(shape.polygon, dongPolygons);
    names.forEach(function(n) { newSet.add(n); });
  });
  _resultSet = newSet;
}

/**
 * 활성 dongs 배열 반환 (표시용 — lat/lng 포함)
 */
function _getActiveDongs() {
  try {
    if (typeof DB === 'undefined') return [];
    var keys = _getActiveKeys();
    var result = [];
    keys.forEach(function(key) {
      var city = DB[key];
      if (!city || !city.dongs) return;
      city.dongs.forEach(function(d) { result.push(d); });
    });
    return result;
  } catch(e) { return []; }
}

/**
 * 활성 지역 key 목록 반환 (교차 연산용 GeoJSON 포함)
 */
function _getActiveDongPolygons() {
  try {
    if (typeof DB === 'undefined' || typeof POLY_CACHE === 'undefined' || !POLY_CACHE) return [];
    if (typeof getDongGeo !== 'function') return [];

    var keys = _getActiveKeys();
    var result = [];
    // _dongNameMap도 동시에 갱신 (정규식 정리용)
    _dongNameMap = {};

    keys.forEach(function(key) {
      var city = DB[key];
      if (!city || !city.dongs) return;
      city.dongs.forEach(function(dong) {
        var node = getDongGeo(dong.rn, dong.gu, dong.d);
        if (!node) return;
        var feature = _nodeToFeature(node);
        if (feature) {
          // 고유명: "도시명|구명|동명" 형태로 동 이름 중복 방지
          // 예: "이천시||신촌동", "서울특별시|서초구|서초1동"
          var uniqueName = dong.rn + '|' + (dong.gu && dong.gu !== dong.rn ? dong.gu : '') + '|' + dong.d;
          result.push({ name: uniqueName, displayName: dong.d, geo: feature });
          // utype 매핑: uniqueName 기준으로 저장
          _dongNameMap[uniqueName] = dong.utype || '동';
          // displayName 기준도 저장 (정규식용 보조)
          if (!_dongNameMap[dong.d]) _dongNameMap[dong.d] = dong.utype || '동';
        }
      });
    });
    return result;
  } catch(e) {
    console.warn('[WorkMode] dong polygon 추출 오류:', e);
    return [];
  }
}

/** 활성 지역 key 목록 (rb.on → stag.sel 순) */
function _getActiveKeys() {
  var keys = [];
  var rbTags = document.querySelectorAll('#rbw .rb.on');
  if (rbTags.length > 0) {
    rbTags.forEach(function(t) { if (t.dataset.r) keys.push(t.dataset.r); });
  } else {
    var stagTags = document.querySelectorAll('.stag.sel');
    stagTags.forEach(function(t) { if (t.dataset.r) keys.push(t.dataset.r); });
  }
  return keys;
}

function _nodeToFeature(node) {
  if (!node) return null;
  if (node.type === 'Feature' && node.geometry) return node;
  if (node.type === 'Polygon' || node.type === 'MultiPolygon') return { type:'Feature', geometry:node, properties:{} };
  if (typeof _geo === 'function') { var g = _geo(node); if (g) return { type:'Feature', geometry:g, properties:{} }; }
  if (node.geometry) return { type:'Feature', geometry:node.geometry, properties:{} };
  return null;
}

// ════════════════════════════════════════════════════════════════
// 13. UI 갱신
// ════════════════════════════════════════════════════════════════

function _wmUpdateUI() {
  // ── 화면 표시: 클립보드 정규화 결과와 동기화
  // _extractDisplayNames: 동명 그대로 표시 (서초1동, 서초2동...)
  // _normalizeForClipboard: 숫자 제거 + 중복 제거 후 표시 (서초, 잠실...)
  // → 클립보드에 복사되는 최종 내용과 화면 표시를 일치시킴
  var clipText = _normalizeForClipboard(_resultSet);
  updateResultDisplay(_buildNormalizedDisplaySet(clipText));

  // 동/구 교차필터 모드 활성 시 교차 결과 변경마다 자동 갱신
  if (_dongFilterMode && _dongVisible) {
    _wmApplyDongFilter();
  }

  if (_autoCopy) {
    _prevResult = autoCopyIfChanged(clipText, _prevResult);
  }
}

/**
 * _normalizeForClipboard 결과 문자열을 Set으로 변환 (화면 표시용)
 * "서초,잠실,상계" → Set {"서초", "잠실", "상계"}
 * @param {string} clipText  _normalizeForClipboard 반환값
 * @returns {Set<string>}
 */
function _buildNormalizedDisplaySet(clipText) {
  if (!clipText) return new Set();
  var parts = clipText.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  return new Set(parts);
}

/**
 * 클립보드 저장 전 정규식 정리
 *
 * 처리 방식:
 *   1. _dongNameMap[name] → utype 조회 (정확한 접미어 파악)
 *   2. 숫자 제거: "서초1동" → "서초동"
 *   3. 해당 utype 접미어만 정확히 제거: "서초동" → "서초"
 *   4. 중복 제거 후 쉼표 결합
 *
 * 예시:
 *   서초1동(동), 서초2동(동), 잠실1동(동), 잠실2동(동) → 서초,잠실
 *   상계1동,상계2동,상계3동 → 상계
 *   화전읍,화전1리 → 화전
 *   신당동,황학동 → 신당,황학
 *   가락본동,가락1동 → 가락본,가락
 *
 * @param {Set<string>} resultSet
 * @returns {string}
 */
/**
 * uniqueName("이천시||신촌동")에서 동명만 추출한 Set 반환 (화면 표시용)
 * @param {Set<string>} resultSet  uniqueName Set
 * @returns {Set<string>}          동명 Set
 */
/**
 * uniqueName → 화면 표시용 이름 변환
 * "이천시||신촌동" → "이천시 신촌동"
 * "서울특별시|서초구|서초1동" → "서초구 서초1동"
 * 도시명을 포함해 사용자가 어느 도시 동인지 식별 가능하게 함
 */
function _extractDisplayNames(resultSet) {
  var out = new Set();
  resultSet.forEach(function(uniqueName) {
    var parts = uniqueName.split('|');
    // 화면 표시는 동명만 (도시명 불필요)
    out.add(parts[2] || uniqueName);
  });
  return out;
}

function _normalizeForClipboard(resultSet) {
  var seen = new Set();
  var out  = [];

  resultSet.forEach(function(uniqueName) {
    // uniqueName → 동명 추출
    var parts = uniqueName.split('|');
    var name = parts[2] || uniqueName;

    // 1. _dongNameMap에서 utype 조회
    var utype = _dongNameMap[uniqueName] || _dongNameMap[name] || '';

    // 2. 숫자 제거 (아라비아 숫자)
    var base = name.replace(/[0-9]+/g, '');

    // 3. utype 접미어 제거
    //    - utype이 있으면 정확히 그 글자만 제거
    //    - utype 없으면 동/읍/면/리 중 맞는 것 제거
    if (utype && ['동','읍','면','리'].includes(utype)) {
      base = base.replace(new RegExp(utype + '$'), '');
    } else {
      base = base.replace(/(동|읍|면|리)$/, '');
    }

    // 4. 접미어 제거 후 1글자만 남으면 접미어를 다시 붙임
    //    예: "제1동" → "제동" (숫자만 제거, 접미어 유지)
    //        "서초1동" → "서초" (2글자 이상 → 접미어 제거 유지)
    //    빈 문자열이면 원본 유지
    if (!base || base.length === 0) {
      base = name;
    } else if (base.length === 1 && utype && ['동','읍','면','리'].includes(utype)) {
      base = base + utype;
    }

    // 5. 중복 제거
    if (!seen.has(base)) {
      seen.add(base);
      out.push(base);
    }
  });

  return out.join(',');
}

// ════════════════════════════════════════════════════════════════
// 14. 내부 유틸
// ════════════════════════════════════════════════════════════════

function _toggleAutoCopy() {
  _autoCopy = !_autoCopy;
  setAutoCopyBtn(_autoCopy);
  if (_autoCopy && _resultSet.size > 0) {
    // ON으로 켤 때 즉시 복사 — 정규식 적용
    _prevResult = autoCopyIfChanged(_normalizeForClipboard(_resultSet), '');
  }
}

/**
 * GPS 위치로 지도 이동 (수동 + 자동 공용)
 * 확대/축소 레벨은 변경하지 않고 center만 이동
 */
function _focusGps() {
  if (!_gpsTracking) return;
  var pos = getCurrentGPS();
  if (!pos || isNaN(pos.lat) || isNaN(pos.lng)) return;
  if (!_isMapAlive()) return;
  try {
    // setView 대신 panTo — 줌 레벨 절대 변경하지 않음
    _map.panTo([pos.lat, pos.lng], { animate: true, duration: 0.5 });
  } catch(e) {}
}

/**
 * GPS 5초 자동이동 타이머 시작
 * GPS 추적이 ON일 때 5초마다 panTo 실행
 * 지도 확대/축소와 완전히 독립 (줌 변경 없음)
 */
function _startGpsAutoTimer() {
  _stopGpsAutoTimer();
  _gpsAutoTimer = setInterval(function() {
    if (_gpsTracking) _focusGps();
  }, 5000);
}

function _stopGpsAutoTimer() {
  if (_gpsAutoTimer) {
    clearInterval(_gpsAutoTimer);
    _gpsAutoTimer = null;
  }
}

/**
 * GPS 추적 ON/OFF 토글
 * OFF: 자동이동 중단 + GPS 수신은 계속 (교차 연산용)
 * ON: 자동이동 재개
 */
function _toggleGpsTracking() {
  _gpsTracking = !_gpsTracking;
  setGpsTrackBtn(_gpsTracking);
  if (_gpsTracking) {
    setGpsDot('active');
    _focusGps();  // 즉시 한 번 이동
  } else {
    setGpsDot('wait');  // 추적 OFF 표시
  }
}

/**
 * 도형만 초기화 — 동/구 폴리곤 표시는 유지
 * 초기화 버튼 클릭 시 호출
 */
function _wmClearShapesOnly() {
  _wmDestroyShapes();

  // 그리기/원형 상태도 정리
  _wmClearDrawState();

  // 교차 결과 초기화
  _resultSet = new Set();

  // 교차 필터 해제 → 모든 동/구 레이어 숨기기
  if (_dongVisible) {
    _dongLayers.forEach(function(layer) {
      try { layer.setStyle({ opacity: 0, fillOpacity: 0 }); } catch(e) {}
    });
  }

  // ── 모드 상태 완전 기본값 복귀 (선모드/부채꼴/그리기/원형 추가버튼 전부 숨김)
  _currentMode = null;
  _lastMode    = null;
  _drawDoneOnce = false;
  setActiveModeBtn(null); // mode=null → 모든 추가버튼/완료버튼 숨김

  // UI 초기화
  _wmUpdateUI();
}

// ════════════════════════════════════════════════════════════════
// 교차필터 — 겹치는 동/구만 Show, 나머지 Hide
// ════════════════════════════════════════════════════════════════

/**
 * 교차필터 ON/OFF 토글
 * ON: _resultSet에 있는 동/구 레이어만 표시, 나머지 숨김
 * OFF: 모든 동/구 레이어 다시 표시
 *
 * 충돌 방지 설계:
 *   - _dongFilterMode 상태는 _wmToggleShowDong()에서 재표시할 때 참조
 *   - 동/구 표시 OFF → ON 시: _dongFilterMode=true면 필터 재적용 (전체 표시 안 됨)
 *   - 동/구 표시 OFF → ON 시: _dongFilterMode=false면 전체 표시 (필터 없음)
 *   - 도형 초기화 시: _dongFilterMode 자동 OFF + 전체 표시 복원
 */
function _wmToggleDongFilter() {
  // 동/구 표시가 꺼져있으면 안내
  if (!_dongVisible) {
    alert('먼저 [동/구 표시] 버튼을 켜주세요.');
    return;
  }

  _dongFilterMode = !_dongFilterMode;
  setDongFilterBtn(_dongFilterMode);

  if (_dongFilterMode) {
    _wmApplyDongFilter();
  } else {
    _wmShowAllDongLayers();
  }
}

/**
 * 교차된 동/구만 표시, 나머지 숨김
 * _dongLayers 각 레이어에 dong 이름 태그(_wmDongName)가 있어야 함
 */
/**
 * 교차된 동/구만 표시, 나머지 숨김
 *
 * drawPolygon = L.geoJSON() 반환 → L.GeoJSON(레이어그룹)
 * L.Marker(네임태그) = getElement()로 DOM 접근
 *
 * 필터 대상: _wmDongName 태그가 붙은 레이어
 *   - 폴리곤(L.GeoJSON): eachLayer → _path.style.display
 *   - 마커(L.Marker):    getElement().style.display
 */
function _wmApplyDongFilter() {
  if (!_dongVisible || !_dongLayers.length) return;

  // 폴리곤과 마커 모두 _wmDongName(uniqueName)이 있으므로 직접 비교
  // uniqueName = "도시명|구명|동명" → 도시별 정확한 교차 판정
  _dongLayers.forEach(function(layer) {
    var name = layer._wmDongName;
    if (!name) return;  // 이름 없는 레이어는 건너뜀
    var show = _resultSet.has(name);
    _wmSetLayerVisible(layer, show);
  });
}

/**
 * 레이어 종류에 따라 show/hide 처리
 * @param {object} layer  Leaflet 레이어 (L.GeoJSON 또는 L.Marker)
 * @param {boolean} show
 */
/**
 * 레이어 종류에 따라 show/hide + z-order 처리
 *
 * 마커(네임태그):
 *   show=true  → zIndex 높게 (선/부채꼴 위, 교차 라벨 앞)
 *   show=false → zIndex 낮게 (선/부채꼴 아래로)
 *
 * @param {object}  layer  Leaflet 레이어
 * @param {boolean} show
 * @param {boolean} [isMarker] 마커 여부
 */
function _wmSetLayerVisible(layer, show, isMarker) {
  try {
    var disp = show ? '' : 'none';

    // ── L.Marker (네임태그 마커) ─────────────────────────────
    if (layer.getElement && typeof layer.getElement === 'function') {
      var el = layer.getElement();
      if (el) {
        el.style.display = disp;
        // 교차 마커: z-index 높여서 선/부채꼴 위에 표시
        // 비교차 마커: z-index 낮춰서 선/부채꼴 아래로
        var wrapper = el.parentElement; // Leaflet marker div wrapper
        if (wrapper) {
          wrapper.style.zIndex = show ? '610' : '390';
        }
        return;
      }
    }

    // ── L.GeoJSON (drawPolygon 반환값) ───────────────────────
    if (layer.eachLayer && typeof layer.eachLayer === 'function') {
      layer.eachLayer(function(subLayer) {
        if (subLayer._path) subLayer._path.style.display = disp;
      });
      return;
    }

    // ── L.Path 직접 (fallback) ───────────────────────────────
    if (layer._path) {
      layer._path.style.display = disp;
    }
  } catch(e) {}
}

/**
 * 모든 동/구 레이어 다시 표시 (필터 해제)
 */
function _wmShowAllDongLayers() {
  _dongLayers.forEach(function(layer) {
    _wmSetLayerVisible(layer, true);
  });
}

/**
 * 전체 초기화 — 도형 + 동/구 표시 모두 제거
 * 처음으로 가기(goHome) + exitWorkMode 에서만 호출
 */
function _wmClearAll() {
  _wmClearDongLayers();
  _wmDestroyShapes();
  _dongVisible = false;
  setShowDongBtn(false);
}

function _wmDestroyShapes() {
  _wmClearAllLayers();
  _shapes    = [];
  _endPoint  = null;
  _resultSet = new Set();
  _prevResult = '';
  updateResultDisplay(_resultSet);
}

function _wmClearAllLayers() {
  if (!_isMapAlive()) return;
  _shapes.forEach(function(s) {
    if (s.layer) { try { _map.removeLayer(s.layer); } catch(e) {} }
  });
}

/**
 * 내 위치 마커 갱신
 * - 파란 원: 현재 GPS 위치
 * - 흰 테두리 + 그림자로 지도 위에서 잘 보이게
 * - 기존 퀴즈 마커와 시각 구분 (청록색 대신 파란색)
 *
 * @param {{ lat, lng }} pos
 */
function _wmUpdateGpsMarker(pos) {
  if (!_isMapAlive() || !pos) return;

  // ── 기존 마커 제거 ──────────────────────────────────────────
  _wmClearGpsMarker();

  // ── 내 위치 원형 마커 (파란 점) ─────────────────────────────
  _gpsMarkerDot = L.circleMarker([pos.lat, pos.lng], {
    radius:      10,
    fillColor:   '#2979ff',     // 구글 지도 스타일 파란색
    fillOpacity: 1,
    color:       '#ffffff',     // 흰 테두리
    weight:      3,
    interactive: false,         // 클릭 이벤트 차단 (지도 클릭과 분리)
  }).addTo(_map);

  // ── 내 위치 라벨 (내 위치) ───────────────────────────────────
  var icon = L.divIcon({
    className: '',
    iconAnchor: [-14, 8],
    html: '<div style="'
      + 'display:inline-block;'
      + 'background:rgba(41,121,255,.92);'
      + 'color:#fff;'
      + 'padding:2px 6px;'
      + 'border-radius:4px;'
      + 'font-size:10px;'
      + 'font-weight:700;'
      + 'white-space:nowrap;'
      + 'box-shadow:0 1px 4px rgba(0,0,0,.4);'
      + 'pointer-events:none;'
      + '">📍 내 위치</div>',
  });

  _gpsMarkerRing = L.marker([pos.lat, pos.lng], {
    icon:        icon,
    interactive: false,
  }).addTo(_map);
}

/**
 * 내 위치 마커 제거
 */
function _wmClearGpsMarker() {
  if (_gpsMarkerDot) {
    try { _map.removeLayer(_gpsMarkerDot); } catch(e) {}
    _gpsMarkerDot = null;
  }
  if (_gpsMarkerRing) {
    try { _map.removeLayer(_gpsMarkerRing); } catch(e) {}
    _gpsMarkerRing = null;
  }
}

function _isMapAlive() {
  if (!_map) return false;
  try { return !!_map._loaded; } catch(e) { return false; }
}

function _isValidLatLng(pos) {
  return pos && typeof pos.lat === 'number' && !isNaN(pos.lat) &&
                typeof pos.lng === 'number' && !isNaN(pos.lng);
}

// ── 업무모드 전용 폴리곤 그리기 ─────────────────────────────────
// drawPolygon은 퀴즈용 map에 addTo하므로 업무모드에서는 직접 사용
function _wmNormalizeGeo(geo) {
  // geometry 또는 node → 렌더 가능한 GeoJSON Feature 반환
  // MultiPolygon 전부 2점 이하이면 가장 긴 링으로 Polygon 변환
  var g;
  if (!geo) return null;
  if (geo.type === 'Feature')            { g = geo.geometry; }
  else if (geo.type === 'FeatureCollection') { g = (geo.features||[])[0]&&(geo.features[0].geometry); }
  else if (geo.type === 'Polygon' || geo.type === 'MultiPolygon') { g = geo; }
  else if (geo.geometry)                 { g = geo.geometry; }
  else return null;

  if (!g) return null;

  if (g.type === 'MultiPolygon') {
    var coords = g.coordinates || [];
    var allTiny = coords.every(function(poly) { return !poly[0] || poly[0].length <= 2; });
    if (allTiny) {
      // 가장 긴 링 선택
      var longest = coords.reduce(function(best, poly) {
        return (poly[0] && poly[0].length > best.length) ? poly[0] : best;
      }, []);
      if (longest.length < 3) return null;
      g = { type: 'Polygon', coordinates: [longest] };
    }
  }
  return { type: 'Feature', geometry: g, properties: {} };
}

function _wmDrawPolygon(geo, color, fillOpacity) {
  if (!geo || !_map) return null;
  var geoInput = _wmNormalizeGeo(geo);
  if (!geoInput) return null;
  try {
    return L.geoJSON(geoInput, {
      style: { color: color, weight: 2, fillColor: color, fillOpacity: fillOpacity }
    }).addTo(_map);
  } catch(e) { return null; }
}

function _isValidPolygon(polygon) {
  try {
    var geo   = polygon.geometry || polygon;
    var type  = geo.type;
    var ring;
    if (type === 'Polygon') {
      ring = geo.coordinates[0];
    } else if (type === 'MultiPolygon') {
      // MultiPolygon: 가장 긴 링 선택
      ring = geo.coordinates.reduce(function(best, poly) {
        return poly[0].length > best.length ? poly[0] : best;
      }, []);
    } else {
      return false;
    }
    if (!ring || ring.length < 3) return false;
    for (var i = 0; i < ring.length; i++) {
      if (isNaN(ring[i][0]) || isNaN(ring[i][1])) return false;
    }
    return true;
  } catch(e) { return false; }
}

// ════════════════════════════════════════════════════════════════
// 15. 권한 확인
// ════════════════════════════════════════════════════════════════

function _hasWorkModeAccess() {
  try {
    if (typeof userProfile === 'undefined' || !userProfile) return false;
    if (userProfile.role === 'admin') return true;
    if (typeof isActivePremium === 'function') return isActivePremium();
    return !!(userProfile.is_premium && userProfile.premium_until &&
              new Date(userProfile.premium_until) > new Date());
  } catch(e) { return false; }
}

// ════════════════════════════════════════════════════════════════
// 16. 전역 진입점
// ════════════════════════════════════════════════════════════════

window.startWorkMode = function() {
  var selected = document.querySelectorAll('.stag.sel');
  if (!selected.length) { alert('먼저 지역을 선택해주세요.'); return; }

  // ── 퀴즈/랭킹 상태 초기화 (업무모드 전용 — showOnly/map.remove 제외) ─
  if (typeof canAns !== 'undefined') canAns = false;
  if (typeof cur    !== 'undefined') cur    = null;
  if (typeof queue  !== 'undefined') queue  = [];
  var _mov = document.getElementById('moverlay');
  if (_mov) _mov.classList.remove('show', 'no-mode');
  var _ab  = document.getElementById('ans-bar');
  if (_ab)  _ab.classList.remove('show');
  var _rc  = document.getElementById('range-control');
  if (_rc)  _rc.style.display = 'none';
  if (typeof updateMobileQCard === 'function') updateMobileQCard(null);
  var _mqc = document.getElementById('mobile-qcard-overlay');
  if (_mqc) _mqc.classList.remove('visible');
  // 랭킹 헤더 제거
  var _rh = document.getElementById('ranking-mode-header');
  if (_rh) _rh.remove();
  document.body.style.paddingTop = '';
  if (typeof isRankingMode !== 'undefined') isRankingMode = false;

  // 좌측 사이드패널 퀴즈 UI 초기화
  var _qR = document.getElementById('qR'); if (_qR) _qR.textContent = '';
  var _qD = document.getElementById('qD'); if (_qD) _qD.textContent = '-';
  var _qH = document.getElementById('qH'); if (_qH) _qH.textContent = '';
  var _rl = document.getElementById('rl'); if (_rl) _rl.innerHTML = '';
  var _pT = document.getElementById('pT'); if (_pT) _pT.textContent = '0/0';
  var _pF = document.getElementById('pF'); if (_pF) _pF.style.width = '0%';
  var _sQ = document.getElementById('sQ'); if (_sQ) _sQ.textContent = '0';
  var _sC = document.getElementById('sC'); if (_sC) _sC.textContent = '0';
  var _sW = document.getElementById('sW'); if (_sW) _sW.textContent = '0';
  var _sR = document.getElementById('sR'); if (_sR) _sR.textContent = '-';
  var _sS = document.getElementById('sS'); if (_sS) _sS.textContent = '0';

  // 퀴즈 모드의 #rbw 버튼 초기화
  // → _getActiveKeys()가 .stag.sel만 참조하도록 강제
  var rbw = document.getElementById('rbw');
  if (rbw) rbw.innerHTML = '';

  var doStart = function() {
    if (typeof map !== 'undefined' && map && _isMapAliveExternal(map)) {
      initWorkMode(map);
      return;
    }
    var startEl = document.getElementById('start');
    if (startEl) startEl.classList.add('hidden');
    if (typeof initMap === 'function') initMap();

    // 폴링: map 생성 대기 (최대 3초, 100ms 간격)
    var attempts = 0;
    var maxAttempts = 30;
    var poll = setInterval(function() {
      attempts++;
      if (typeof map !== 'undefined' && map && _isMapAliveExternal(map)) {
        clearInterval(poll);
        initWorkMode(map);
      } else if (attempts >= maxAttempts) {
        clearInterval(poll);
        alert('지도 초기화 실패. 다시 시도해주세요.');
        if (startEl) startEl.classList.remove('hidden');
      }
    }, 100);
  };

  if (typeof POLY_CACHE === 'undefined' || !POLY_CACHE) {
    if (typeof loadPolygonCache === 'function') {
      loadPolygonCache().then(doStart);
    } else {
      alert('데이터 로딩 중입니다.');
    }
    return;
  }
  doStart();
};

window.stopWorkMode = function() { exitWorkMode(); };

// ════════════════════════════════════════════════════════════════
// 지역 검색 — DB + CITY_META_V4 통합 검색
// ════════════════════════════════════════════════════════════════

/**
 * 지역명(도/시/군/구/동/읍/면/리) 검색
 * ui.js의 검색 입력창에서 호출됨
 *
 * 검색 대상:
 *   1. CITY_META_V4 — 시/군 단위 (center 좌표 있음)
 *   2. DB[key].dongs — 동/읍/면/리 단위 (lat/lng 있음)
 *
 * @param {string} query  검색어
 * @returns {{ label:string, lat:number, lng:number, zoom:number }[]}
 */
/**
 * 지역 통합 검색
 *
 * 검색 대상 (3단계):
 *   1. CITY_META_V4 — 시/군 (도시 레벨)
 *   2. DB[*].dongs  — 구/동 (선택 지역만, 빠름)
 *   3. POLY_CACHE   — 전체 동/읍/면/리 (선택 무관, 정확)
 *      DB에서 못 찾은 동은 POLY_CACHE에서 직접 탐색
 *
 * 문제 원인: DB는 선택된 지역만 포함
 * 해결: POLY_CACHE 전체를 getCityNode + _all_list로 탐색
 */
function _searchRegion(query) {
  if (!query || query.trim().length < 1) return [];

  var q = query.trim();
  var results = [];
  var seen = new Set();

  function add(label, lat, lng, zoom) {
    var key = label + '|' + lat.toFixed(4) + '|' + lng.toFixed(4);
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ label: label, lat: lat, lng: lng, zoom: zoom || 13 });
  }

  // ── 1. 시/군 단위 검색 (CITY_META_V4) ──────────────────────
  if (typeof CITY_META_V4 !== 'undefined') {
    CITY_META_V4.forEach(function(meta) {
      if (!meta.center) return;
      if (meta.name.includes(q) || (meta.do_ && meta.do_.includes(q))) {
        add(
          (meta.do_ ? meta.do_ + ' ' : '') + meta.name,
          meta.center[0], meta.center[1],
          meta.zoom || 12
        );
      }
    });
  }

  // ── 2. 구 단위 검색 (CITY_META_V4에서 구 이름 추출) ─────────
  if (typeof DB !== 'undefined') {
    Object.keys(DB).forEach(function(key) {
      var city = DB[key];
      if (!city || !city.dongs) return;
      var guSeen = new Set();
      city.dongs.forEach(function(dong) {
        var guMatch = dong.gu && dong.gu !== dong.rn && dong.gu.includes(q);
        if (guMatch && !guSeen.has(dong.gu)) {
          guSeen.add(dong.gu);
          add(city.name + ' ' + dong.gu, dong.lat, dong.lng, 13);
        }
      });
    });
  }

  // ── 3. 동/읍/면/리 전체 검색 (POLY_CACHE 직접 탐색) ─────────
  // DB는 선택된 지역만 → POLY_CACHE 전체에서 탐색
  // 핵심: _m(node, key) 사용 — 메타 필드가 node._meta 안에 있을 수 있음
  if (typeof POLY_CACHE !== 'undefined' && POLY_CACHE &&
      typeof CITY_META_V4 !== 'undefined' &&
      typeof _m === 'function') {

    // POLY_CACHE node에서 center 좌표 추출
    function _getNodeCenter(node) {
      if (!node) return null;
      // 1. node.center 직접
      var c = node.center || _m(node, 'center');
      if (c && Array.isArray(c) && c.length >= 2) return c;
      // 2. geometry에서 계산
      var geo = (typeof _geo === 'function') ? _geo(node) : null;
      if (!geo || !geo.coordinates) return null;
      try {
        var ring = (geo.type === 'Polygon') ? geo.coordinates[0] : geo.coordinates[0][0];
        if (!ring || !ring.length) return null;
        var sumLat = 0, sumLng = 0;
        ring.forEach(function(c) { sumLng += c[0]; sumLat += c[1]; });
        return [sumLat / ring.length, sumLng / ring.length];
      } catch(e) { return null; }
    }

    CITY_META_V4.forEach(function(meta) {
      if (results.length >= 30) return;
      try {
        var cn = (typeof getCityNode === 'function') ? getCityNode(meta.name) : null;
        if (!cn) return;

        var hasGu = meta.hasGu;
        if (hasGu) {
          // 구 있는 도시: cn[구명]._all_list
          // _m() 으로 메타 필드 안전하게 접근
          var guTypes = new Set(['구', '군']);
          Object.keys(cn).forEach(function(guKey) {
            if (guKey.startsWith('_')) return;
            var guNode = cn[guKey];
            if (!guNode || typeof guNode !== 'object') return;
            var guType = _m(guNode, '_type') || '';
            if (!guTypes.has(guType)) return;
            var list = _m(guNode, '_all_list') || [];
            list.forEach(function(unitName) {
              if (results.length >= 30) return;
              if (!unitName.includes(q)) return;
              var unitNode = guNode[unitName];
              if (!unitNode) return;
              var ctr = _getNodeCenter(unitNode);
              if (!ctr) return;
              add(meta.name + ' ' + guKey + ' ' + unitName, ctr[0], ctr[1], 15);
            });
          });
        } else {
          // 구 없는 도시: cn._all_list
          var list2 = _m(cn, '_all_list') || [];
          list2.forEach(function(unitName) {
            if (results.length >= 30) return;
            if (!unitName.includes(q)) return;
            var unitNode = cn[unitName];
            if (!unitNode) return;
            var ctr = _getNodeCenter(unitNode);
            if (!ctr) return;
            add(meta.name + ' ' + unitName, ctr[0], ctr[1], 15);
          });
        }
      } catch(e) {}
    });
  }

  // 최대 20개로 제한
  return results.slice(0, 20);
}

/**
 * 검색 결과 위치로 지도 이동
 * @param {number} lat
 * @param {number} lng
 * @param {number} zoom
 */
function _flyToRegion(lat, lng, zoom) {
  if (!_isMapAlive()) return;
  try {
    // zoom 유지 — 중심만 이동
    _map.panTo([lat, lng], { animate: true, duration: 0.8 });
  } catch(e) {
    console.warn('[WorkMode] panTo 오류:', e);
  }
}

// ── 검색 폴리곤 임시 표시 헬퍼 ──────────────────────────────────

/**
 * 현재 표시 중인 검색 폴리곤 모두 제거
 */
function _wmClearSearchPolygons() {
  if (_searchPolyTimer) { clearTimeout(_searchPolyTimer); _searchPolyTimer = null; }
  _searchPolyLayers.forEach(function(lyr) {
    if (_isMapAlive()) {
      try { _map.removeLayer(lyr); } catch(e) {}
    }
  });
  _searchPolyLayers = [];
}

/**
 * 검색된 동 노드들의 폴리곤을 5초간 지도에 표시
 * @param {object[]} nodes  POLY_CACHE 동 노드 배열
 */
/**
 * GeoJSON geometry 안전 추출
 * Feature 타입이면 .geometry 꺼냄 → L.geoJSON에 넣을 수 있는 형태 반환
 */
function _extractGeometry(raw) {
  if (!raw) return null;
  // Feature 타입이면 내부 geometry 꺼내기
  if (raw.type === 'Feature') return raw.geometry || null;
  // FeatureCollection
  if (raw.type === 'FeatureCollection' && raw.features && raw.features.length) {
    return raw.features[0].geometry || null;
  }
  // 이미 geometry 객체 (Polygon, MultiPolygon 등)
  if (raw.type === 'Polygon' || raw.type === 'MultiPolygon' || raw.type === 'GeometryCollection') {
    return raw;
  }
  return null;
}

function _wmShowSearchPolygons(nodes) {
  _wmClearSearchPolygons();
  if (!_isMapAlive() || !nodes || !nodes.length) return;

  var successCount = 0;

  nodes.forEach(function(node) {
    if (!node) return;
    try {
      var geo = null;

      // 경로 1: _directGeo 플래그 — _geometry 원본을 그대로 전달한 경우
      //         _meta._geometry가 Feature 타입일 수 있으므로 _extractGeometry로 안전하게 꺼냄
      if (node._directGeo) {
        geo = _extractGeometry(node.geometry);
      }

      // 경로 2: 동 노드 — _geo(node) 사용 (index.html 함수)
      if (!geo && typeof _geo === 'function') {
        try {
          var geoRaw = _geo(node);
          geo = _extractGeometry(geoRaw) || geoRaw;
        } catch(e2) {}
      }

      // 경로 3: node.geometry 직접
      if (!geo && node.geometry) {
        geo = _extractGeometry(node.geometry) || node.geometry;
      }

      if (!geo) return;

      // L.geoJSON은 GeoJSON 객체를 직접 받을 수 있음
      // geometry 타입이면 Feature로 감싸기, Feature/Collection이면 그대로
      var geoInput = (geo.type === 'Feature' || geo.type === 'FeatureCollection')
        ? geo
        : { type: 'Feature', geometry: geo };

      var lyr = L.geoJSON(geoInput, {
        style: {
          color:       '#00d4ff',
          fillColor:   '#00d4ff',
          fillOpacity: 0.22,
          weight:      2,
          dashArray:   '6 4',
        }
      });
      lyr.addTo(_map);
      _searchPolyLayers.push(lyr);
      successCount++;
    } catch(e) {
      console.debug('[SearchPoly] 렌더 오류:', e.message);
    }
  });

  if (successCount === 0) {
    console.warn('[SearchPoly] 폴리곤 표시 실패: nodes=' + nodes.length + '개 중 0개 성공');
  }

  // 5초 후 자동 제거
  _searchPolyTimer = setTimeout(function() {
    _wmClearSearchPolygons();
  }, 5000);
}

// ── 스마트 그룹 검색 (베이스명 기반) ─────────────────────────────

/**
 * 동 이름에서 숫자·접미어를 제거한 베이스명 반환
 * "잠실1동" → "잠실", "서초2동" → "서초", "화전읍" → "화전"
 * 숫자 없는 경우: "신촌동" → "신촌", "오포면" → "오포"
 */
function _getBaseName(dongName) {
  return dongName
    .replace(/[0-9]+/g, '')
    .replace(/(동|읍|면|리)$/, '');
}

/**
 * 스마트 검색: 베이스명 기준 그룹화
 * - '잠실동' → 잠실1~7동 묶음
 * - '서초동' → 서초1~4동 묶음
 * - '서초' → 서초1~4동 묶음
 * - _m 의존성 없음 (직접 fallback 내장)
 * - 고성군 분리: getCityNode(name, do_) 로 도별 정확 탐색
 */
function _searchRegionSmart(query) {
  if (!query || query.trim().length < 1) return [];
  var q = query.trim();

  // ── 내부 헬퍼: _m 없어도 작동하는 meta 접근 ──────────────
  function _mLocal(node, key) {
    if (!node || typeof node !== 'object') return undefined;
    if (key in node) return node[key];
    var meta = node._meta;
    if (meta && key in meta) return meta[key];
    var meta2 = meta && meta._meta;
    if (meta2 && key in meta2) return meta2[key];
    return undefined;
  }

  // ── 내부 헬퍼: 동 노드 center 추출 ────────────────────────
  function _getCenter(node) {
    if (!node) return null;
    var c = node.center || _mLocal(node, 'center');
    if (c && Array.isArray(c) && c.length >= 2) return c;
    try {
      var geoFn = (typeof _geo === 'function') ? _geo : null;
      var geo = geoFn ? geoFn(node) : (node.geometry || null);
      if (!geo || !geo.coordinates) return null;
      var ring = (geo.type === 'Polygon') ? geo.coordinates[0] : geo.coordinates[0][0];
      if (!ring || !ring.length) return null;
      var sLat = 0, sLng = 0;
      ring.forEach(function(p) { sLng += p[0]; sLat += p[1]; });
      return [sLat / ring.length, sLng / ring.length];
    } catch(e) { return null; }
  }

  // ── 내부 헬퍼: getCityNode safe wrapper ─────────────────────
  // doName 있으면 해당 도에서 직접(고성군 분리), 없으면 기존 탐색
  function _getCN(meta) {
    if (typeof getCityNode !== 'function') return null;
    try {
      return getCityNode(meta.name, meta.do_ || undefined);
    } catch(e) { return null; }
  }

  // ── 내부 헬퍼: 시/군/구 노드의 모든 하위 동 nodes 수집 ───────
  function _collectCityNodes(cityName, doName) {
    if (typeof POLY_CACHE === 'undefined' || !POLY_CACHE) return [];
    var nodes = [];
    try {
      var cn = (typeof getCityNode === 'function')
        ? getCityNode(cityName, doName || undefined) : null;
      if (!cn) return [];

      // 구 있는 도시: 각 구의 _geometry + 하위 동 노드
      var GU_TYPES = new Set(['구','군']);
      var hasGu = false;
      Object.keys(cn).forEach(function(guKey) {
        if (guKey.startsWith('_')) return;
        var guNode = cn[guKey];
        if (!guNode || typeof guNode !== 'object') return;
        var guType = guNode._type || _mLocal(guNode,'_type') || '';
        if (!GU_TYPES.has(guType)) return;
        hasGu = true;
        // 구 폴리곤 (_geometry)
        var guGeo = guNode._geometry || _mLocal(guNode,'_geometry');
        if (guGeo) {
          nodes.push({ _directGeo: true, geometry: guGeo });
        } else {
          // 구 폴리곤 없으면 하위 동 모두 추가
          var list = guNode._all_list || _mLocal(guNode,'_all_list') || [];
          list.forEach(function(unitName) {
            var unitNode = guNode[unitName];
            if (unitNode) nodes.push(unitNode);
          });
        }
      });

      if (!hasGu) {
        // 구 없는 도시: _all_list 하위 동 모두
        var list2 = cn._all_list || _mLocal(cn,'_all_list') || [];
        list2.forEach(function(unitName) {
          var unitNode = cn[unitName];
          if (unitNode) nodes.push(unitNode);
        });
      }
    } catch(e) {}
    return nodes;
  }

  // ── 내부 헬퍼: 특정 구의 하위 동 nodes 수집 ────────────────────
  function _collectGuNodes(cityName, doName, guName) {
    if (typeof POLY_CACHE === 'undefined' || !POLY_CACHE) return [];
    try {
      var cn = (typeof getCityNode === 'function')
        ? getCityNode(cityName, doName || undefined) : null;
      if (!cn) return [];
      var guNode = cn[guName];
      if (!guNode) return [];
      // 구 전체 폴리곤 있으면 우선 사용
      var guGeo = guNode._geometry || _mLocal(guNode,'_geometry');
      if (guGeo) return [{ _directGeo: true, geometry: guGeo }];
      // 없으면 하위 동 모두
      var nodes = [];
      var list = guNode._all_list || _mLocal(guNode,'_all_list') || [];
      list.forEach(function(unitName) {
        var unitNode = guNode[unitName];
        if (unitNode) nodes.push(unitNode);
      });
      return nodes;
    } catch(e) { return []; }
  }

  // ── 1. 시/군 단위 검색 ──────────────────────────────────────
  var baseResults = [];
  if (typeof CITY_META_V4 !== 'undefined' && CITY_META_V4.length) {
    CITY_META_V4.forEach(function(meta) {
      if (!meta.center) return;
      if (meta.name.includes(q) || (meta.do_ && meta.do_.includes(q))) {
        var cityNodes = _collectCityNodes(meta.name, meta.do_);
        baseResults.push({
          label: (meta.do_ ? meta.do_ + ' ' : '') + meta.name,
          lat: meta.center[0], lng: meta.center[1],
          zoom: meta.zoom || 12,
          nodes: cityNodes
        });
      }
    });
  }

  // ── 2. 구 단위 검색 ─────────────────────────────────────────
  if (typeof DB !== 'undefined') {
    var guSeen = new Set();
    Object.keys(DB).forEach(function(key) {
      var city = DB[key];
      if (!city || !city.dongs) return;
      city.dongs.forEach(function(dong) {
        var guMatch = dong.gu && dong.gu !== dong.rn && dong.gu.includes(q);
        var guKey2  = city.name + '|' + dong.gu;
        if (guMatch && !guSeen.has(guKey2)) {
          guSeen.add(guKey2);
          var guNodes = _collectGuNodes(city.name, city.do_, dong.gu);
          baseResults.push({
            label: city.name + ' ' + dong.gu,
            lat: dong.lat, lng: dong.lng,
            zoom: 13,
            nodes: guNodes
          });
        }
      });
    });
  }

  if (baseResults.length > 0) return baseResults.slice(0, 20);

  // ── 3. 동/읍/면/리 스마트 그룹 검색 (POLY_CACHE 전체) ───────
  if (typeof POLY_CACHE === 'undefined' || !POLY_CACHE) return [];
  if (typeof CITY_META_V4 === 'undefined' || !CITY_META_V4.length) return [];

  // 검색어에서 접미어 제거 → qbase ('잠실동'→'잠실', '서초'→'서초')
  var qbase = q.replace(/(동|읍|면|리)$/, '');

  var groups = {};

  function addUnit(meta, guLabel, unitName, unitNode) {
    if (!unitNode || typeof unitNode !== 'object') return;

    var base = _getBaseName(unitName);
    // 베이스 일치 OR 직접 포함
    var matched = (base === qbase)
               || (qbase.length >= 2 && base.includes(qbase))
               || (unitName.includes(q));
    if (!matched) return;

    var ctr = _getCenter(unitNode);
    if (!ctr) return;  // center 없으면 skip

    var groupKey = meta.name + '|' + (guLabel || '') + '|' + base;
    if (!groups[groupKey]) {
      groups[groupKey] = {
        cityName: meta.name, guLabel: guLabel || '',
        base: base, units: [], nodes: [], centers: []
      };
    }
    groups[groupKey].units.push(unitName);
    groups[groupKey].nodes.push(unitNode);
    groups[groupKey].centers.push(ctr);
  }

  CITY_META_V4.forEach(function(meta) {
    try {
      var cn = _getCN(meta);
      if (!cn) return;

      if (meta.hasGu) {
        // 구 있는 도시: 구 노드 순회
        var GU_TYPES = new Set(['구', '군']);
        Object.keys(cn).forEach(function(guKey) {
          if (guKey.startsWith('_')) return;
          var guNode = cn[guKey];
          if (!guNode || typeof guNode !== 'object') return;
          // _type 접근: 직접 or _meta
          var guType = guNode._type || _mLocal(guNode, '_type') || '';
          if (!GU_TYPES.has(guType)) return;
          // _all_list 접근: 직접 or _meta
          var list = guNode._all_list || _mLocal(guNode, '_all_list') || [];
          list.forEach(function(unitName) {
            addUnit(meta, guKey, unitName, guNode[unitName]);
          });
        });
      } else {
        // 구 없는 도시: 직접 탐색
        var list2 = cn._all_list || _mLocal(cn, '_all_list') || [];
        list2.forEach(function(unitName) {
          addUnit(meta, '', unitName, cn[unitName]);
        });
      }
    } catch(e) {}
  });

  // 그룹 → 결과 변환
  var results = [];
  Object.keys(groups).forEach(function(gk) {
    var g = groups[gk];
    if (!g.centers.length) return;

    var sumLat = 0, sumLng = 0;
    g.centers.forEach(function(c) { sumLat += c[0]; sumLng += c[1]; });

    // 레이블: units=1개면 그대로, 복수면 '베이스동 (N개)'
    var dongLabel = g.units.length > 1
      ? (g.base + '동 (' + g.units.length + '개)')
      : (g.units[0] || g.base + '동');
    var label = [g.cityName, g.guLabel, dongLabel].filter(Boolean).join(' ');

    results.push({
      label:  label,
      lat:    sumLat / g.centers.length,
      lng:    sumLng / g.centers.length,
      zoom:   15,
      nodes:  g.nodes
    });
  });

  results.sort(function(a, b) { return b.nodes.length - a.nodes.length; });
  return results.slice(0, 20);
}


// ════════════════════════════════════════════════════════════════
// 그리기 모드 — 브러쉬(연필) 드래그 도형 생성
// ════════════════════════════════════════════════════════════════

/**
 * 드래그 이벤트 바인딩 (지도 컨테이너 DOM 기반)
 * Leaflet 이벤트가 아닌 DOM 이벤트 사용 → 드래그 중 지도 이동 차단
 */
function _wmBindDrawEvents() {
  var container = _map.getContainer();
  if (!container) return;

  // 마우스
  container.addEventListener('mousedown', _wmDrawStart, { passive: false });
  container.addEventListener('mousemove', _wmDrawMove,  { passive: false });
  container.addEventListener('mouseup',   _wmDrawEnd,   { passive: false });
  container.addEventListener('mouseleave',_wmDrawEnd,   { passive: false });

  // 터치 (모바일)
  container.addEventListener('touchstart', _wmDrawStartTouch, { passive: false });
  container.addEventListener('touchmove',  _wmDrawMoveTouch,  { passive: false });
  container.addEventListener('touchend',   _wmDrawEnd,        { passive: false });
}

function _wmUnbindDrawEvents() {
  var container = _map && _map.getContainer ? _map.getContainer() : null;
  if (!container) return;
  container.removeEventListener('mousedown', _wmDrawStart);
  container.removeEventListener('mousemove', _wmDrawMove);
  container.removeEventListener('mouseup',   _wmDrawEnd);
  container.removeEventListener('mouseleave',_wmDrawEnd);
  container.removeEventListener('touchstart', _wmDrawStartTouch);
  container.removeEventListener('touchmove',  _wmDrawMoveTouch);
  container.removeEventListener('touchend',   _wmDrawEnd);
}

function _wmDrawStart(e) {
  if (_currentMode !== 'draw') return;
  // 드래그 1회 완료 후 추가버튼 누르지 않으면 새 드래그 차단
  if (_drawDoneOnce) return;
  e.preventDefault();
  _isDrawing = true;
  _drawRawPts = [];
  // 기존 프리뷰 레이어 제거
  if (_drawLayer) { try { _map.removeLayer(_drawLayer); } catch(x) {} _drawLayer = null; }
  var latlng = _map.mouseEventToLatLng(e);
  _drawRawPts.push(latlng);
  // 지도 드래그 비활성화 (그리기 중)
  _map.dragging.disable();
  // 결과창은 버튼 클릭 시 이미 고정됨 — 드래그 시작 시 재호출은 안전장치
  _wmHideResult();
  // ⚠️ [모바일] 스크롤 잠금
  _wmLockScroll();
}

function _wmDrawStartTouch(e) {
  if (_currentMode !== 'draw') return;
  if (_drawDoneOnce) return;
  e.preventDefault();
  _isDrawing = true;
  _drawRawPts = [];
  if (_drawLayer) { try { _map.removeLayer(_drawLayer); } catch(x) {} _drawLayer = null; }
  var touch = e.touches[0];
  var latlng = _map.mouseEventToLatLng(touch);
  _drawRawPts.push(latlng);
  _map.dragging.disable();
  // 결과창은 버튼 클릭 시 이미 고정됨 — 안전장치로 재호출
  _wmHideResult();
  // ⚠️ [모바일] 스크롤 잠금
  _wmLockScroll();
}

function _wmDrawMove(e) {
  if (!_isDrawing || _currentMode !== 'draw') return;
  e.preventDefault();
  var latlng = _map.mouseEventToLatLng(e);
  _wmDrawAddPoint(latlng);
}

function _wmDrawMoveTouch(e) {
  if (!_isDrawing || _currentMode !== 'draw') return;
  e.preventDefault();
  var touch = e.touches[0];
  var latlng = _map.mouseEventToLatLng(touch);
  _wmDrawAddPoint(latlng);
}

function _wmDrawAddPoint(latlng) {
  _drawRawPts.push(latlng);

  // 프리뷰: 실시간 Polyline 표시
  if (_drawLayer) { try { _map.removeLayer(_drawLayer); } catch(x) {} }
  var previewColor = window._drawColor || '#ff6b6b';
  _drawLayer = L.polyline(_drawRawPts, {
    color:   previewColor,
    weight:  Math.max(3, _drawBuffer * 25),
    opacity: 0.85,
    pane:    _SHAPE_PANE
  }).addTo(_map);

  // 실시간 교차 계산 (10포인트마다 — 성능)
  if (_drawRawPts.length % 10 === 0) {
    _wmDrawRunIntersectRealtime();
  }
}

function _wmDrawEnd(e) {
  if (!_isDrawing || _currentMode !== 'draw') return;
  _isDrawing = false;
  _map.dragging.enable();
  // 교차지역 텍스트창 다시 표시
  _wmShowResult();
  // ⚠️ [모바일] 스크롤 해제
  _wmUnlockScroll();

  if (_drawRawPts.length < 2) {
    _drawRawPts = [];
    return;
  }

  // ── 프리뷰 Polyline을 고정 레이어로 전환 (제거하지 않고 유지)
  // 선모드의 파란 폴리곤처럼 유저가 그린 선이 지도에 영구 표시됨
  var fixedLayer = _drawLayer;
  _drawLayer = null; // 참조만 해제 (지도에서 제거 안 함)

  // ── 교차 연산용 폴리곤 생성 (내부 계산 전용 — 지도 표시 안 함)
  var poly = _buildDrawSegmentPolygon(_drawRawPts, _drawBuffer);
  var polygon = poly ? poly.polygon : null;
  var segments = poly ? poly.segments : [];

  if (fixedLayer) {
    fixedLayer.options.pane = _SHAPE_PANE;
    _shapes.push({
      type:     'draw',
      layer:    fixedLayer,  // 고정된 선 레이어 (지도에 이미 표시 중)
      polygon:  polygon,
      segments: segments,
      pts:      _drawRawPts.slice(),
      bufferKm: _drawBuffer,
      color:    window._drawColor || '#ff6b6b'
    });
  }

  _drawRawPts = [];
  _drawDoneOnce = true; // 1회 완료 → 추가버튼으로만 재활성화
  _wmRunIntersect();
  _wmUpdateUI();
  // ⚠️ 드래그 완료 후에도 'draw' 활성 상태 유지
  // → 색상/굵기 슬라이더 계속 열림, 그리기추가 버튼 표시
  // → 완료버튼 눌러야만 done-draw로 전환되어 닫힘
  setActiveModeBtn('draw'); // UI 갱신 (addDraw 표시 + 슬라이더 유지)
}

/**
 * 드래그 경로(점 배열) → 구간별 폴리곤 합집합
 * 실제 교차 연산 정확도를 위해 각 구간을 별도 GeoJSON으로 만들고
 * 하나의 MultiPolygon처럼 intersectPolygon에 개별 전달
 */
function _buildDrawSegmentPolygon(pts, bufferKm) {
  if (!pts || pts.length < 2) return null;

  // 점이 너무 많으면 다운샘플 (성능)
  var sampled = _downsamplePts(pts, 60);
  var segments = [];
  var allLayers = [];

  for (var i = 0; i < sampled.length - 1; i++) {
    var s = sampled[i];
    var e = sampled[i + 1];
    var start = { lat: s.lat, lng: s.lng };
    var end   = { lat: e.lat, lng: e.lng };
    var res = buildLinePolygon(start, end, bufferKm);
    if (res && _isValidPolygon(res.polygon)) {
      segments.push(res.polygon);
      // 색상 적용
      var col = window._drawColor || '#ff6b6b';
      res.layer.setStyle({ color: col, fillColor: col, fillOpacity: 0.25, weight: 2 });
      allLayers.push(res.layer);
    }
  }
  if (!segments.length) return null;

  // 여러 레이어를 하나의 LayerGroup으로 묶어 지도에 표시
  var group = L.layerGroup(allLayers);

  // 교차 연산용: 첫 번째 세그먼트를 대표 polygon으로 (실제는 _wmRunIntersect에서 개별 처리)
  // → _shapes에 segments 배열도 저장해 교차 연산 시 모두 사용
  return {
    polygon:  segments[0],         // 대표 (AABB 필터용)
    segments: segments,            // 전체 세그먼트 배열
    layer:    group
  };
}

/**
 * 드래그 중 실시간 교차 계산 (완성 전 미리보기)
 */
function _wmDrawRunIntersectRealtime() {
  var dongPolygons = _getActiveDongPolygons();
  if (!dongPolygons.length) return;

  // ★ 기존 shapes(_shapes)의 결과는 유지하고, 드래그 실시간 결과만 추가
  // _resultSet을 완전히 덮지 않고, 기존 교차 결과 위에 누적
  var baseSet = new Set();

  // 기존 완성된 shapes 결과 먼저 계산
  _shapes.forEach(function(shape) {
    if (shape.pending) return;
    if (shape.type === 'draw' && shape.segments && shape.segments.length) {
      shape.segments.forEach(function(seg) {
        if (!_isValidPolygon(seg)) return;
        intersectPolygon(seg, dongPolygons).forEach(function(n) { baseSet.add(n); });
      });
      return;
    }
    if (!shape.polygon) return;
    intersectPolygon(shape.polygon, dongPolygons).forEach(function(n) { baseSet.add(n); });
  });

  // 드래그 중 실시간 구간 추가
  var sampled = _downsamplePts(_drawRawPts, 30);
  for (var i = 0; i < sampled.length - 1; i++) {
    var start = { lat: sampled[i].lat,   lng: sampled[i].lng };
    var end   = { lat: sampled[i+1].lat, lng: sampled[i+1].lng };
    var res = buildLinePolygon(start, end, _drawBuffer);
    if (res && _isValidPolygon(res.polygon)) {
      intersectPolygon(res.polygon, dongPolygons).forEach(function(n) { baseSet.add(n); });
    }
  }

  _resultSet = baseSet;

  // 교차 필터 실시간 갱신 (폴리곤 사라지지 않도록)
  if (_dongFilterMode && _dongVisible) {
    _wmApplyDongFilter();
  }
  updateResultDisplay(_extractDisplayNames(_resultSet));
  if (_autoCopy) {
    var clipText = _normalizeForClipboard(_resultSet);
    _prevResult = autoCopyIfChanged(clipText, _prevResult);
  }
}

/**
 * 포인트 배열 다운샘플 (최대 maxPts개)
 */
function _downsamplePts(pts, maxPts) {
  if (pts.length <= maxPts) return pts;
  var result = [];
  var step = pts.length / maxPts;
  for (var i = 0; i < maxPts; i++) {
    result.push(pts[Math.floor(i * step)]);
  }
  result.push(pts[pts.length - 1]); // 끝점 항상 포함
  return result;
}

/**
 * 그리기 상태 전체 초기화
 */
// ════════════════════════════════════════════════════════════════
// 교차지역 텍스트창 숨김/표시 — 드래그 중 줄바꿈 화면 흔들림 방지
// ════════════════════════════════════════════════════════════════

/**
 * 드래그 시작 시 교차지역 결과창 완전 고정 (공간 포함)
 *
 * ⚠️ visibility:hidden 사용 금지 — 공간은 유지되므로
 *    교차지역 늘어날 때 빈 공간도 늘어나 스크롤 영향 발생
 *
 * → wm-result--drawing 클래스: max-height:0 + padding:0 으로
 *   공간 자체를 0으로 고정. 교차지역이 아무리 늘어나도 화면 변화 없음
 * ⚠️ 반드시 _wmShowResult와 쌍으로 사용
 */
function _wmHideResult() {
  var el = document.getElementById('work-mode-result');
  if (el) el.classList.add('wm-result--drawing');
}

/**
 * 드래그 종료 시 교차지역 결과창 복원
 * 클래스 제거 → 원래 max-height/padding으로 자연스럽게 펼쳐짐
 */
function _wmShowResult() {
  var el = document.getElementById('work-mode-result');
  if (el) el.classList.remove('wm-result--drawing');
}

// ════════════════════════════════════════════════════════════════
// 모바일 스크롤 잠금/해제 — 그리기 드래그 중 화면 흔들림 방지
// ════════════════════════════════════════════════════════════════

/**
 * 스크롤 잠금: 그리기 드래그 시작 시 호출
 * 교차지역 줄바꿈으로 인한 스크롤 자동개입 방지
 * ⚠️ 반드시 _wmUnlockScroll과 쌍으로 사용할 것
 */
function _wmLockScroll() {
  document.body.style.overflow   = 'hidden';
  document.body.style.position   = 'fixed';
  document.body.style.width      = '100%';
  // 현재 스크롤 위치 저장 (fixed 전환 후 복원용)
  var scrollY = window.scrollY || window.pageYOffset || 0;
  document.body.style.top = '-' + scrollY + 'px';
  document.body.dataset.wmScrollY = scrollY;
}

/**
 * 스크롤 해제: 드래그 종료 시 호출
 * fixed 해제 후 스크롤 위치 복원
 */
function _wmUnlockScroll() {
  var savedY = parseInt(document.body.dataset.wmScrollY || '0', 10);
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.width    = '';
  document.body.style.top      = '';
  delete document.body.dataset.wmScrollY;
  window.scrollTo(0, savedY);
}

function _wmClearDrawState() {
  _isDrawing      = false;
  _drawDoneOnce   = false; // 드래그 1회 제한 리셋
  _circleDoneOnce = false; // 원형 1회 제한 리셋
  _drawRawPts     = [];
  if (_drawLayer && _map) {
    try { _map.removeLayer(_drawLayer); } catch(x) {}
    _drawLayer = null;
  }
  // 원형 레이어 정리
  if (_circleLayer && _map) {
    try { _map.removeLayer(_circleLayer); } catch(x) {}
    _circleLayer = null;
  }
  // 드래그 활성화 복원
  if (_map && _map.dragging) {
    try { _map.dragging.enable(); } catch(x) {}
  }
}

// ════════════════════════════════════════════════════════════════
// 원형 모드 — 클릭 위치에 원 생성
// ════════════════════════════════════════════════════════════════

/**
 * 클릭 위치에 원형 폴리곤 생성 (기존 원 교체)
 */
function _wmAddCircle(latlng) {
  var center = { lat: latlng.lat, lng: latlng.lng };
  var res = buildCirclePolygon(center, _circleRadius);
  if (!res || !_isValidPolygon(res.polygon)) return;

  // 기존 원 유지 + 새 원 추가 (선모드/부채꼴처럼 계속 추가)
  var col = window._circleColor || '#ff6b6b';
  res.layer.options.pane = _SHAPE_PANE;
  res.layer.setStyle({ color: col, fillColor: col, fillOpacity: 0.18, weight: 2 });
  res.layer.addTo(_map);

  _shapes.push({
    type:    'circle',
    layer:   res.layer,
    polygon: res.polygon,
    endPt:   center,
    radius:  _circleRadius,
    color:   col
  });

  _circleDoneOnce = true; // 1회 완료 → 원형추가버튼 눌러야 재활성화
  _wmRunIntersect();
  _wmUpdateUI();
  // ⚠️ 원 생성 후에도 'circle' 활성 상태 유지
  // → 색상/반경 슬라이더 계속 열림, 원형추가 버튼 표시
  // → 완료버튼 눌러야만 done-circle로 전환되어 닫힘
  setActiveModeBtn('circle'); // UI 갱신 (addCir 표시 + 슬라이더 유지)
}

// ════════════════════════════════════════════════════════════════
// 그리기 추가 / 원형 추가 — 완료 후 재활성화
// ════════════════════════════════════════════════════════════════

/**
 * 그리기 추가 버튼
 * done-draw 상태에서 _drawDoneOnce를 리셋해 드래그 1회 더 허용
 */
function _wmAddDrawChain() {
  if (_currentMode !== 'draw' && _lastMode !== 'draw') return;
  var drawShapes = _shapes.filter(function(s){ return s.type === 'draw'; });
  if (!drawShapes.length) return;
  // done-draw → 'draw' 활성 상태로 전환 → 슬라이더(색상/굵기) 다시 열림
  _drawDoneOnce = false;
  _currentMode  = 'draw';
  setActiveModeBtn('draw');
  // 추가버튼 클릭 순간부터 결과창 고정 (다음 드래그 시작 전부터 차단)
  _wmHideResult();
}

/**
 * 원형 추가 버튼
 * done-circle 상태에서 클릭 한 번 더 허용
 * (원형은 클릭마다 기존 원을 교체하므로 상태 전환만 하면 됨)
 */
function _wmAddCircleChain() {
  if (_currentMode !== 'circle' && _lastMode !== 'circle') return;
  // 원형추가 버튼 → 1회 제한 해제 → 다음 클릭으로 원 1개 추가 생성
  _circleDoneOnce = false;
  _currentMode    = 'circle';
  setActiveModeBtn('circle');
}

window._wmSearch = function(query) {
  return _searchRegionSmart(query);
};
window._wmFlyTo = function(lat, lng, zoom, nodes) {
  _flyToRegion(lat, lng, zoom);
  // 검색 결과 폴리곤 5초 표시
  if (nodes && nodes.length) {
    _wmShowSearchPolygons(nodes);
  }
};

function _isMapAliveExternal(m) {
  if (!m) return false;
  try { return !!m._loaded; } catch(e) { return false; }
}