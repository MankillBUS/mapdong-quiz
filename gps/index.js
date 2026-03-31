/**
 * index.js — 업무모드 컨트롤 타워
 *
 * ✅ 모든 상태는 여기서만 관리
 * ✅ 모듈 간 연결은 여기서만
 * ❌ 다른 모듈에서 직접 import 금지
 *
 * ══ 확인된 버그 목록 및 수정 내역 ══════════════════════════════
 *
 * [버그1] onMapClick 함수명 충돌 (가장 심각)
 *   - index.html: function onMapClick(e) — 퀴즈 클릭 핸들러
 *   - index.js:   function onMapClick(latlng) — 업무모드 핸들러
 *   - 결과: index.js 로드 후 index.html의 퀴즈 onMapClick이 덮어써짐
 *          → LatLng(NaN,NaN) 오류, 퀴즈 클릭 불가, 도형 생성 불가
 *   - 수정: 업무모드 전용 함수명 _wmMapClick 으로 변경
 *
 * [버그2] goHome() 후 업무모드 미초기화
 *   - goHome() → map.remove() → map=null 하지만 _map은 파괴된 객체 참조
 *   - 수정: goHome()에 window.stopWorkMode() 호출 추가 (index.html 수정 필요)
 *          + _isMapAlive() 로 모든 지도 조작 전 생존 확인
 *
 * [버그3] 폴리곤 로드 불가 (선택 지역 교차 안 됨)
 *   - DB[key].dongs에 geo 필드 없음
 *   - getDongGeo(rn, gu, d) 로 POLY_CACHE에서 꺼내야 함
 *   - rn 필드: DB[key].dongs[i].rn (buildDBFromCache에서 설정)
 *   - 수정: _getActiveDongPolygons()에서 getDongGeo() 직접 호출
 *
 * [버그4] LatLng(NaN,NaN) — 좌표변환 실패
 *   - GPS pos가 있어도 tangent 계산 실패 시 arc 포인트에 undefined 혼입
 *   - 수정: buildFanPolygon/buildLinePolygon 호출 전 GPS 유효성 검증
 *          + ring 조합 시 NaN 필터링
 */

// ════════════════════════════════════════════════════════════════
// 1. 전역 상태
// ════════════════════════════════════════════════════════════════

let _map         = null;
let _shapes      = [];
let _currentMode = null;
let _endPoint    = null;
let _resultSet   = new Set();
let _autoCopy    = false;
let _prevResult  = '';

let _gpsWatchId  = null;
let _gpsPos      = null;
let _wmClickFn   = null;   // [버그1] 업무모드 전용 클릭 핸들러

let _lineBuffer  = 0.3;
let _fanR1       = 0.3;
let _fanR2       = 0.8;

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

  _gpsWatchId = initGPS(
    function(pos) { _wmOnGpsUpdate(pos); },
    function(err) {
      setGpsDot('error');
      console.warn('[WorkMode] GPS 오류:', err);
    }
  );
  setGpsDot('wait');

  renderWorkModePanel(
    function() { _wmSwitchMode('line'); },
    function() { _wmSwitchMode('fan');  },
    function() { _toggleAutoCopy();     },
    function() { _focusGps();           }
  );

  // [버그1 수정] 업무모드 전용 클릭 핸들러 — onMapClick과 다른 이름
  _wmClickFn = function(e) {
    if (_currentMode) { _wmMapClick(e.latlng); }
  };
  _map.on('click', _wmClickFn);
}

// ════════════════════════════════════════════════════════════════
// 3. 업무모드 종료 — 완전 초기화
// ════════════════════════════════════════════════════════════════

function exitWorkMode() {
  // GPS clearWatch
  stopGPS(_gpsWatchId);
  _gpsWatchId = null;
  _gpsPos     = null;

  // 레이어 제거
  _wmClearAllLayers();

  // [버그1 수정] 클릭 핸들러 제거 (퀴즈 onMapClick과 완전 분리)
  if (_map && _wmClickFn) {
    try { _map.off('click', _wmClickFn); } catch(e) {}
    _wmClickFn = null;
  }

  // 상태 초기화
  _shapes      = [];
  _currentMode = null;
  _endPoint    = null;
  _resultSet   = new Set();
  _autoCopy    = false;
  _prevResult  = '';

  // UI 패널 제거
  removeWorkModePanel();

  // [버그2 수정] 지도 참조 해제
  _map = null;
}

// ════════════════════════════════════════════════════════════════
// 4. 모드 전환
// ════════════════════════════════════════════════════════════════

function _wmSwitchMode(mode) {
  if (_currentMode === mode) return;
  _wmDestroyAll();
  _currentMode = mode;
  setActiveModeBtn(mode);
  if (mode === 'fan') _endPoint = null;
}

// ════════════════════════════════════════════════════════════════
// 5. GPS 업데이트 (업무모드 전용)
// ════════════════════════════════════════════════════════════════

function _wmOnGpsUpdate(pos) {
  _gpsPos = pos;
  setGpsDot('active');

  // [버그2 수정] goHome 후 지도 파괴 감지 → 자동 종료
  if (!_isMapAlive()) {
    console.warn('[WorkMode] 지도 파괴됨 → 업무모드 자동 종료');
    exitWorkMode();
    return;
  }

  if (_shapes.length === 0) return;

  _wmRebuildAll();
  _wmRunIntersect();
  _wmUpdateUI();
}

// ════════════════════════════════════════════════════════════════
// 6. 지도 클릭 처리 (업무모드 전용 — [버그1] onMapClick과 분리)
// ════════════════════════════════════════════════════════════════

function _wmMapClick(latlng) {
  if (!_currentMode) return;
  if (!_isMapAlive()) return;

  // [버그4 수정] GPS 유효성 검증
  if (!_gpsPos || typeof _gpsPos.lat !== 'number' || typeof _gpsPos.lng !== 'number') {
    console.warn('[WorkMode] GPS 미수신 — 클릭 무시');
    return;
  }

  if (_currentMode === 'line') {
    _wmAddLine(latlng);
  } else if (_currentMode === 'fan') {
    _wmAddFan(latlng);
  }

  _wmRunIntersect();
  _wmUpdateUI();
}

// ════════════════════════════════════════════════════════════════
// 7. 도형 생성
// ════════════════════════════════════════════════════════════════

function _wmAddLine(clickPos) {
  if (!_isValidLatLng(clickPos)) return;

  const result = buildLinePolygon(_gpsPos, clickPos, _lineBuffer);
  if (!result) return;

  // [버그4 수정] 결과 유효성 확인
  if (!_isValidPolygon(result.polygon)) {
    console.warn('[WorkMode] buildLinePolygon: 유효하지 않은 좌표 — 도형 무시');
    return;
  }

  result.layer.addTo(_map);
  _shapes.push({ type:'line', layer:result.layer, polygon:result.polygon, endPt:clickPos });
}

function _wmAddFan(clickPos) {
  if (!_isValidLatLng(clickPos)) return;
  if (!_endPoint) _endPoint = clickPos;

  const result = buildFanPolygon(
    _gpsPos, _endPoint, _fanR1, _fanR2,
    calcExternalTangents, calcArcPoints, calcAngle
  );

  if (!result) {
    console.warn('[WorkMode] 부채꼴 생성 불가: distance <= |r2-r1|');
    return;
  }

  // [버그4 수정] 유효성 확인
  if (!_isValidPolygon(result.polygon)) {
    console.warn('[WorkMode] buildFanPolygon: 유효하지 않은 좌표 — 도형 무시');
    return;
  }

  result.layer.addTo(_map);
  _shapes.push({ type:'fan', layer:result.layer, polygon:result.polygon, endPt:_endPoint });
}

// ════════════════════════════════════════════════════════════════
// 8. 도형 재생성 (GPS 갱신 시)
// ════════════════════════════════════════════════════════════════

function _wmRebuildAll() {
  const updated = [];

  for (const shape of _shapes) {
    if (shape.layer && _map) {
      try { _map.removeLayer(shape.layer); } catch(e) {}
    }

    let result = null;
    if (shape.type === 'line') {
      result = buildLinePolygon(_gpsPos, shape.endPt, _lineBuffer);
    } else if (shape.type === 'fan') {
      result = buildFanPolygon(
        _gpsPos, shape.endPt, _fanR1, _fanR2,
        calcExternalTangents, calcArcPoints, calcAngle
      );
    }

    if (result && _isValidPolygon(result.polygon)) {
      result.layer.addTo(_map);
      updated.push({ type:shape.type, layer:result.layer, polygon:result.polygon, endPt:shape.endPt });
    }
  }

  _shapes = updated;
}

// ════════════════════════════════════════════════════════════════
// 9. 교차 연산 — 선택된 지역 동 polygon
// ════════════════════════════════════════════════════════════════

function _wmRunIntersect() {
  const dongPolygons = _getActiveDongPolygons();
  if (!dongPolygons.length) {
    _resultSet = new Set();
    return;
  }

  const newSet = new Set();
  for (const shape of _shapes) {
    const names = intersectPolygon(shape.polygon, dongPolygons);
    names.forEach(function(n) { newSet.add(n); });
  }
  _resultSet = newSet;
}

/**
 * [버그3 수정] 선택된 지역의 동 GeoJSON 반환
 *
 * 핵심: DB[key].dongs에는 geo 없음
 *       → getDongGeo(dong.rn, dong.gu, dong.d) 로 POLY_CACHE에서 꺼냄
 *       → 퀴즈모드와 동일한 방식 사용
 *
 * 지역 우선순위:
 *   1순위: #rbw .rb.on  (퀴즈 진행 중 buildFilter가 생성)
 *   2순위: .stag.sel    (지역 선택 화면 선택 상태)
 */
function _getActiveDongPolygons() {
  try {
    if (typeof DB === 'undefined') return [];
    if (typeof POLY_CACHE === 'undefined' || !POLY_CACHE) return [];
    if (typeof getDongGeo !== 'function') return [];

    // ── 활성 지역 key 수집 ───────────────────────────────────
    var keys = [];

    // 1순위: 퀴즈 진행 중 활성 지역
    var rbTags = document.querySelectorAll('#rbw .rb.on');
    if (rbTags.length > 0) {
      rbTags.forEach(function(tag) {
        if (tag.dataset.r) keys.push(tag.dataset.r);
      });
    } else {
      // 2순위: 지역 선택 화면
      var stagTags = document.querySelectorAll('.stag.sel');
      stagTags.forEach(function(tag) {
        if (tag.dataset.r) keys.push(tag.dataset.r);
      });
    }

    if (!keys.length) return [];

    // ── 각 key의 dong GeoJSON 수집 ──────────────────────────
    var result = [];

    keys.forEach(function(key) {
      var city = DB[key];
      if (!city || !city.dongs) return;

      city.dongs.forEach(function(dong) {
        // [버그3 핵심 수정]
        // 퀴즈모드와 동일: getDongGeo(rn, gu, d) 로 POLY_CACHE 접근
        // dong.rn = getCityNode가 찾을 수 있는 도시명
        // dong.gu = 구/군명 (없으면 '' 또는 동명과 동일)
        // dong.d  = 동/읍/면/리 명
        var node = getDongGeo(dong.rn, dong.gu, dong.d);
        if (!node) return;

        // getDongGeo 반환: Feature 또는 raw node
        var feature = _nodeToFeature(node);
        if (feature) {
          result.push({ name: dong.d, geo: feature });
        }
      });
    });

    return result;

  } catch(e) {
    console.warn('[WorkMode] dong polygon 추출 오류:', e);
    return [];
  }
}

/**
 * getDongGeo 반환 node → GeoJSON Feature 변환
 * 기존 시스템 _geo() 함수 활용
 */
function _nodeToFeature(node) {
  if (!node) return null;

  // 이미 Feature
  if (node.type === 'Feature' && node.geometry) return node;

  // Geometry 직접
  if (node.type === 'Polygon' || node.type === 'MultiPolygon') {
    return { type:'Feature', geometry:node, properties:{} };
  }

  // 기존 시스템 _geo() 헬퍼 사용 (index.html에 있음)
  if (typeof _geo === 'function') {
    var geom = _geo(node);
    if (geom) return { type:'Feature', geometry:geom, properties:{} };
  }

  // geometry 키 직접 접근
  if (node.geometry) {
    return { type:'Feature', geometry:node.geometry, properties:{} };
  }

  return null;
}

// ════════════════════════════════════════════════════════════════
// 10. UI 갱신 + 자동복사
// ════════════════════════════════════════════════════════════════

function _wmUpdateUI() {
  updateResultDisplay(_resultSet);

  if (_autoCopy) {
    var text = Array.from(_resultSet).join(',');
    _prevResult = autoCopyIfChanged(text, _prevResult);
  }
}

// ════════════════════════════════════════════════════════════════
// 11. 내부 유틸
// ════════════════════════════════════════════════════════════════

function _toggleAutoCopy() {
  _autoCopy = !_autoCopy;
  setAutoCopyBtn(_autoCopy);
  if (_autoCopy && _resultSet.size > 0) {
    var text = Array.from(_resultSet).join(',');
    _prevResult = autoCopyIfChanged(text, '');
  }
}

/**
 * [버그2 수정] GPS 버튼 — setView 전 null + 지도 생존 이중 체크
 */
function _focusGps() {
  var pos = getCurrentGPS();
  if (!pos || typeof pos.lat !== 'number' || typeof pos.lng !== 'number') {
    console.warn('[WorkMode] GPS 미수신');
    return;
  }
  if (!_isMapAlive()) {
    console.warn('[WorkMode] 지도 없음');
    return;
  }
  try {
    _map.setView([pos.lat, pos.lng], _map.getZoom());
  } catch(e) {
    console.warn('[WorkMode] setView 오류:', e);
  }
}

function _wmDestroyAll() {
  _wmClearAllLayers();
  _shapes     = [];
  _endPoint   = null;
  _resultSet  = new Set();
  _prevResult = '';
  updateResultDisplay(_resultSet);
}

function _wmClearAllLayers() {
  if (!_isMapAlive()) return;
  _shapes.forEach(function(shape) {
    if (shape.layer) {
      try { _map.removeLayer(shape.layer); } catch(e) {}
    }
  });
}

/**
 * [버그2 수정] Leaflet 지도 생존 확인
 * map.remove() 호출 후 _loaded = false
 */
function _isMapAlive() {
  if (!_map) return false;
  try { return !!_map._loaded; } catch(e) { return false; }
}

/** LatLng 유효성 검증 */
function _isValidLatLng(pos) {
  return pos &&
         typeof pos.lat === 'number' && !isNaN(pos.lat) &&
         typeof pos.lng === 'number' && !isNaN(pos.lng);
}

/** [버그4] GeoJSON Polygon 좌표 유효성 검증 */
function _isValidPolygon(polygon) {
  try {
    var coords = polygon.geometry.coordinates[0];
    for (var i = 0; i < coords.length; i++) {
      if (isNaN(coords[i][0]) || isNaN(coords[i][1])) return false;
    }
    return coords.length >= 3;
  } catch(e) {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
// 12. 권한 확인 (기존 시스템 isActivePremium 활용)
// ════════════════════════════════════════════════════════════════

function _hasWorkModeAccess() {
  try {
    if (typeof userProfile === 'undefined' || !userProfile) return false;
    if (userProfile.role === 'admin') return true;
    if (typeof isActivePremium === 'function') return isActivePremium();
    return !!(userProfile.is_premium &&
              userProfile.premium_until &&
              new Date(userProfile.premium_until) > new Date());
  } catch(e) {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
// 13. 전역 진입점
// ════════════════════════════════════════════════════════════════

/**
 * index.html 버튼: onclick="startWorkMode()"
 * 퀴즈모드와 동일한 doStart 패턴 사용
 */
window.startWorkMode = function() {
  // 지역 선택 확인
  var selected = document.querySelectorAll('.stag.sel');
  if (!selected.length) {
    alert('먼저 지역을 선택해주세요.');
    return;
  }

  // 퀴즈와 동일: POLY_CACHE 확인 후 doStart 패턴
  var doStart = function() {
    // map이 살아있으면 바로 진입
    if (typeof map !== 'undefined' && map && _isMapAliveExternal(map)) {
      initWorkMode(map);
      return;
    }

    // map 없거나 파괴됨 → initMap() 후 진입
    var startEl = document.getElementById('start');
    if (startEl) startEl.classList.add('hidden');

    if (typeof initMap === 'function') initMap();

    setTimeout(function() {
      if (typeof map !== 'undefined' && map) {
        initWorkMode(map);
      } else {
        alert('지도 초기화 실패. 다시 시도해주세요.');
        if (startEl) startEl.classList.remove('hidden');
      }
    }, 300);
  };

  // 퀴즈와 동일: POLY_CACHE 없으면 먼저 로드
  if (typeof POLY_CACHE === 'undefined' || !POLY_CACHE) {
    if (typeof loadPolygonCache === 'function') {
      loadPolygonCache().then(doStart);
    } else {
      alert('데이터 로딩 중입니다. 잠시 후 다시 시도해주세요.');
    }
    return;
  }

  doStart();
};

window.stopWorkMode = function() {
  exitWorkMode();
};

function _isMapAliveExternal(m) {
  if (!m) return false;
  try { return !!m._loaded; } catch(e) { return false; }
}
