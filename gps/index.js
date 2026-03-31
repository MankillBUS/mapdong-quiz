/**
 * index.js — 컨트롤 타워
 * ✅ 모든 상태는 여기서만 관리
 * ✅ 모듈 간 연결은 여기서만
 * ❌ 다른 모듈에서 직접 import 금지
 *
 * 의존 모듈 (단방향):
 *   index.js → gps.js
 *   index.js → drawLine.js
 *   index.js → drawFan.js  (+ tangent.js 함수 주입)
 *   index.js → spatial.js
 *   index.js → ui.js
 */

// ════════════════════════════════════════════════════════════════
// 1. 전역 상태 — 유일한 진실의 원천
// ════════════════════════════════════════════════════════════════

let _map         = null;        // Leaflet 지도 인스턴스 (기존 시스템 참조)
let _shapes      = [];          // { type, layer, polygon }[]  다중 도형
let _currentMode = null;        // 'line' | 'fan' | null
let _endPoint    = null;        // 부채꼴 고정 끝점 { lat, lng }
let _resultSet   = new Set();   // 교차 동 이름 집합
let _autoCopy    = false;       // 자동복사 ON/OFF
let _prevResult  = '';          // 중복복사 방지

let _gpsWatchId  = null;        // gps.js watchPosition ID
let _gpsPos      = null;        // 현재 GPS { lat, lng }
let _mapClickFn  = null;        // 지도 클릭 이벤트 핸들러 참조 (제거용)

// ── 슬라이더 기본값 ──────────────────────────────────────────────
let _lineBuffer  = 0.3;         // 선 버퍼 반경 (km)
let _fanR1       = 0.3;         // 부채꼴 시작 원 반경 (km)
let _fanR2       = 0.8;         // 부채꼴 끝 원 반경 (km)

// ════════════════════════════════════════════════════════════════
// 2. 업무모드 진입
// ════════════════════════════════════════════════════════════════

/**
 * 업무모드 시작
 * - 권한 확인 (premium | admin)
 * - GPS 시작
 * - UI 패널 삽입
 * - 지도 클릭 이벤트 등록
 *
 * @param {object} leafletMap  기존 시스템의 Leaflet 지도 인스턴스
 */
function initWorkMode(leafletMap) {
  // ── 권한 확인 ────────────────────────────────────────────────
  if (!_hasWorkModeAccess()) {
    alert('프리미엄 전용 기능입니다.\n업그레이드 후 이용해 주세요.');
    return;
  }

  // 이미 실행 중이면 중복 진입 방지
  if (_currentMode !== null || _gpsWatchId !== null) return;

  _map = leafletMap;

  // ── GPS 시작 ─────────────────────────────────────────────────
  _gpsWatchId = initGPS(
    function(pos) { onGpsUpdate(pos); },     // 위치 변경 콜백
    function(err) {                           // 오류 콜백
      setGpsDot('error');
      console.warn('[WorkMode] GPS 오류:', err);
    }
  );
  setGpsDot('wait');

  // ── UI 패널 삽입 ─────────────────────────────────────────────
  renderWorkModePanel(
    function() { switchMode('line'); },       // 선 모드 버튼
    function() { switchMode('fan');  },       // 부채꼴 버튼
    function() { _toggleAutoCopy();  },       // 자동복사 토글
    function() { _focusGps();        }        // GPS 이동 버튼
  );

  // ── 지도 클릭 이벤트 등록 ────────────────────────────────────
  _mapClickFn = function(e) { onMapClick(e.latlng); };
  _map.on('click', _mapClickFn);
}

// ════════════════════════════════════════════════════════════════
// 3. 업무모드 종료 — 완전 초기화 (보안 핵심)
// ════════════════════════════════════════════════════════════════

/**
 * 업무모드 완전 종료
 * 설계 명세 §12 — 반드시 모든 항목 초기화
 */
function exitWorkMode() {
  // ── GPS 완전 중지 ────────────────────────────────────────────
  stopGPS(_gpsWatchId);
  _gpsWatchId = null;
  _gpsPos     = null;

  // ── 지도 레이어 전체 제거 ────────────────────────────────────
  _clearAllLayers();

  // ── 지도 클릭 이벤트 제거 ────────────────────────────────────
  if (_map && _mapClickFn) {
    _map.off('click', _mapClickFn);
    _mapClickFn = null;
  }

  // ── 상태 완전 초기화 ─────────────────────────────────────────
  _shapes      = [];
  _currentMode = null;
  _endPoint    = null;
  _resultSet   = new Set();
  _autoCopy    = false;
  _prevResult  = '';

  // ── UI 패널 제거 ─────────────────────────────────────────────
  removeWorkModePanel();

  // ── 지도 참조 해제 ───────────────────────────────────────────
  _map = null;
}

// ════════════════════════════════════════════════════════════════
// 4. 모드 전환
// ════════════════════════════════════════════════════════════════

/**
 * 선 모드 ↔ 부채꼴 모드 전환
 * 전환 시 기존 도형/상태 완전 초기화 후 새 모드 진입
 *
 * @param {'line' | 'fan'} mode
 */
function switchMode(mode) {
  if (_currentMode === mode) return;  // 동일 모드 재클릭 무시

  // ── 기존 도형 제거 + 상태 초기화 ────────────────────────────
  _destroyAll();

  // ── 새 모드 진입 ─────────────────────────────────────────────
  _currentMode = mode;
  setActiveModeBtn(mode);

  // 부채꼴 모드: endPoint는 다음 클릭 시 확정
  if (mode === 'fan') {
    _endPoint = null;
  }
}

// ════════════════════════════════════════════════════════════════
// 5. GPS 업데이트 콜백 — gps.js → index.js
// ════════════════════════════════════════════════════════════════

/**
 * GPS 위치 변경 시 호출됨 (gps.js watchPosition 콜백)
 * 모든 도형을 현재 GPS 기준으로 재생성 → 교차 연산 → UI 갱신
 *
 * @param {{ lat: number, lng: number }} pos
 */
function onGpsUpdate(pos) {
  _gpsPos = pos;
  setGpsDot('active');

  // 도형이 없으면 위치만 갱신
  if (_shapes.length === 0) return;

  // ── 모든 도형 재생성 (GPS 시작점 갱신) ──────────────────────
  _rebuildAllShapes();

  // ── 교차 연산 → resultSet 갱신 ──────────────────────────────
  _runIntersect();

  // ── UI + 자동복사 ────────────────────────────────────────────
  _updateUI();
}

// ════════════════════════════════════════════════════════════════
// 6. 지도 클릭 처리 — 도형 생성의 진입점
// ════════════════════════════════════════════════════════════════

/**
 * 지도 클릭 시 호출
 * - 선 모드:    클릭 위치 = 끝점 → 즉시 선 생성
 * - 부채꼴 모드: 첫 클릭 = endPoint 고정 → 이후 GPS 이동마다 재생성
 *
 * @param {{ lat: number, lng: number }} latlng
 */
function onMapClick(latlng) {
  if (!_currentMode || !_gpsPos) return;

  if (_currentMode === 'line') {
    _addLineShape(latlng);
  } else if (_currentMode === 'fan') {
    _addFanShape(latlng);
  }

  _runIntersect();
  _updateUI();
}

// ════════════════════════════════════════════════════════════════
// 7. 도형 생성 내부 함수
// ════════════════════════════════════════════════════════════════

/**
 * 선 도형 추가 (클릭할 때마다 새 선 누적)
 * @param {{ lat, lng }} clickPos  클릭 끝점
 */
function _addLineShape(clickPos) {
  const result = buildLinePolygon(_gpsPos, clickPos, _lineBuffer);
  if (!result) return;

  result.layer.addTo(_map);
  _shapes.push({
    type:    'line',
    layer:   result.layer,
    polygon: result.polygon,
    endPt:   clickPos,          // GPS 갱신 시 재생성에 사용
  });
}

/**
 * 부채꼴 도형 추가/갱신
 * - endPoint 미확정: 첫 클릭으로 고정
 * - endPoint 확정:   새 부채꼴 추가 (다중 부채꼴 지원)
 *
 * @param {{ lat, lng }} clickPos
 */
function _addFanShape(clickPos) {
  if (!_endPoint) {
    // 첫 클릭: endPoint 고정
    _endPoint = clickPos;
  }

  const result = buildFanPolygon(
    _gpsPos,
    _endPoint,
    _fanR1,
    _fanR2,
    calcExternalTangents,   // tangent.js → index.js가 주입
    calcArcPoints,
    calcAngle
  );

  if (!result) {
    // 생성 불가 조건 (거리 너무 가깝거나 원이 포함됨)
    console.warn('[WorkMode] 부채꼴 생성 불가: distance <= |r2-r1|');
    return;
  }

  result.layer.addTo(_map);
  _shapes.push({
    type:    'fan',
    layer:   result.layer,
    polygon: result.polygon,
    endPt:   _endPoint,
  });
}

// ════════════════════════════════════════════════════════════════
// 8. 도형 재생성 — GPS 갱신 시
// ════════════════════════════════════════════════════════════════

/**
 * GPS 위치 변경 시 모든 도형을 새 시작점 기준으로 재생성
 * 기존 레이어 제거 → 새 레이어 생성 → shapes 배열 갱신
 */
function _rebuildAllShapes() {
  const updated = [];

  for (const shape of _shapes) {
    // 기존 레이어 제거
    if (shape.layer && _map) {
      try { _map.removeLayer(shape.layer); } catch(e) {}
    }

    let result = null;

    if (shape.type === 'line') {
      result = buildLinePolygon(_gpsPos, shape.endPt, _lineBuffer);
    } else if (shape.type === 'fan') {
      result = buildFanPolygon(
        _gpsPos, shape.endPt,
        _fanR1, _fanR2,
        calcExternalTangents, calcArcPoints, calcAngle
      );
    }

    if (result) {
      result.layer.addTo(_map);
      updated.push({
        type:    shape.type,
        layer:   result.layer,
        polygon: result.polygon,
        endPt:   shape.endPt,
      });
    }
    // result가 null이면 (부채꼴 생성 불가) 해당 도형은 shapes에서 제외
  }

  _shapes = updated;
}

// ════════════════════════════════════════════════════════════════
// 9. 교차 연산 — shapes × dong polygons
// ════════════════════════════════════════════════════════════════

/**
 * 모든 도형의 교차 동을 합산해 resultSet 갱신
 * 동 목록은 기존 시스템(index.html)의 활성 레이어에서 추출
 */
function _runIntersect() {
  const dongPolygons = _getActiveDongPolygons();
  if (!dongPolygons.length) return;

  const newSet = new Set();

  for (const shape of _shapes) {
    const names = intersectPolygon(shape.polygon, dongPolygons);
    names.forEach(function(n) { newSet.add(n); });
  }

  _resultSet = newSet;
}

/**
 * 기존 시스템에서 현재 활성화된 동 polygon 목록을 추출
 * { name: string, geo: GeoJSON }[] 형태로 반환
 *
 * @returns {{ name: string, geo: object }[]}
 */
function _getActiveDongPolygons() {
  // 기존 index.html 시스템의 DB 변수와 활성 지역(rbw) 활용
  // DB[regionKey].dongs = [{ name, geo }, ...]
  // rbw 패널의 .rb.on 태그 → 활성 지역 키 추출
  try {
    var result = [];
    var activeTags = document.querySelectorAll('.rb.on');
    activeTags.forEach(function(tag) {
      var key = tag.dataset.r;
      if (key && typeof DB !== 'undefined' && DB[key] && DB[key].dongs) {
        DB[key].dongs.forEach(function(d) {
          if (d.name && d.geo) result.push({ name: d.name, geo: d.geo });
        });
      }
    });
    return result;
  } catch(e) {
    console.warn('[WorkMode] dong polygon 추출 오류:', e);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════
// 10. UI 갱신 + 자동복사
// ════════════════════════════════════════════════════════════════

/**
 * resultSet → UI 표시 + 자동복사 처리
 */
function _updateUI() {
  // 결과 표시
  updateResultDisplay(_resultSet);

  // 자동복사
  if (_autoCopy) {
    var text = Array.from(_resultSet).join(',');
    _prevResult = autoCopyIfChanged(text, _prevResult);
  }
}

// ════════════════════════════════════════════════════════════════
// 11. 내부 유틸
// ════════════════════════════════════════════════════════════════

/**
 * 자동복사 토글 (ui.js 버튼 → index.js)
 */
function _toggleAutoCopy() {
  _autoCopy = !_autoCopy;
  setAutoCopyBtn(_autoCopy);
  // ON으로 켰을 때 현재 결과 즉시 복사
  if (_autoCopy && _resultSet.size > 0) {
    var text = Array.from(_resultSet).join(',');
    _prevResult = autoCopyIfChanged(text, '');
  }
}

/**
 * GPS 버튼: 현재 GPS 위치로 지도 중심 이동
 * GPS는 항상 추적 중, 버튼은 "이동만" (설계 §14)
 */
function _focusGps() {
  var pos = getCurrentGPS();
  if (pos && _map) {
    _map.setView([pos.lat, pos.lng], _map.getZoom());
  }
}

/**
 * 모든 레이어 제거 + shapes 초기화
 * switchMode 전환 시 호출
 */
function _destroyAll() {
  _clearAllLayers();
  _shapes      = [];
  _endPoint    = null;
  _resultSet   = new Set();
  _prevResult  = '';
  updateResultDisplay(_resultSet);
}

/**
 * Leaflet 레이어만 지도에서 제거 (shapes 배열은 그대로)
 */
function _clearAllLayers() {
  if (!_map) return;
  _shapes.forEach(function(shape) {
    if (shape.layer) {
      try { _map.removeLayer(shape.layer); } catch(e) {}
    }
  });
}

/**
 * 권한 확인: premium 또는 admin 플랜만 업무모드 허용
 * 기존 시스템의 userProfile 변수 활용
 *
 * @returns {boolean}
 */
function _hasWorkModeAccess() {
  try {
    // 기존 시스템 전역 변수 참조
    if (typeof userProfile === 'undefined' || !userProfile) return false;
    var role = userProfile.role || 'user';
    var plan = userProfile.plan || userProfile.subscription_plan || '';
    return role === 'admin' || plan === 'premium';
  } catch(e) {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
// 12. 기존 시스템 진입점 연결
//     index.html 의 "업무모드 시작" 버튼에서 호출
// ════════════════════════════════════════════════════════════════

/**
 * 기존 시스템에서 호출하는 전역 함수
 * index.html: <button onclick="startWorkMode()">업무모드</button>
 */
window.startWorkMode = function() {
  // 기존 시스템 지도 인스턴스(map) 참조
  if (typeof map === 'undefined' || !map) {
    alert('지도가 준비되지 않았습니다. 먼저 퀴즈를 시작해주세요.');
    return;
  }
  initWorkMode(map);
};

window.stopWorkMode = function() {
  exitWorkMode();
};
