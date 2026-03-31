/**
 * index.js — 컨트롤 타워
 * ✅ 모든 상태는 여기서만 관리
 * ✅ 모듈 간 연결은 여기서만
 * ❌ 다른 모듈에서 직접 import 금지
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
let _mapClickFn  = null;

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
    function(pos) { onGpsUpdate(pos); },
    function(err) {
      setGpsDot('error');
      console.warn('[WorkMode] GPS 오류:', err);
    }
  );
  setGpsDot('wait');

  renderWorkModePanel(
    function() { switchMode('line'); },
    function() { switchMode('fan');  },
    function() { _toggleAutoCopy();  },
    function() { _focusGps();        }
  );

  _mapClickFn = function(e) {
    if (_currentMode) { onMapClick(e.latlng); }
  };
  _map.on('click', _mapClickFn);
}

// ════════════════════════════════════════════════════════════════
// 3. 업무모드 종료
// ════════════════════════════════════════════════════════════════

function exitWorkMode() {
  stopGPS(_gpsWatchId);
  _gpsWatchId = null;
  _gpsPos     = null;

  _clearAllLayers();

  if (_map && _mapClickFn) {
    try { _map.off('click', _mapClickFn); } catch(e) {}
    _mapClickFn = null;
  }

  _shapes      = [];
  _currentMode = null;
  _endPoint    = null;
  _resultSet   = new Set();
  _autoCopy    = false;
  _prevResult  = '';

  removeWorkModePanel();
  _map = null;  // 지도 참조 해제 (goHome 후 파괴된 지도 참조 방지)
}

// ════════════════════════════════════════════════════════════════
// 4. 모드 전환
// ════════════════════════════════════════════════════════════════

function switchMode(mode) {
  if (_currentMode === mode) return;
  _destroyAll();
  _currentMode = mode;
  setActiveModeBtn(mode);
  if (mode === 'fan') _endPoint = null;
}

// ════════════════════════════════════════════════════════════════
// 5. GPS 업데이트
// ════════════════════════════════════════════════════════════════

function onGpsUpdate(pos) {
  _gpsPos = pos;
  setGpsDot('active');

  // ── [버그1] 지도가 파괴된 경우 안전 처리 ─────────────────────
  if (!_isMapAlive()) {
    console.warn('[WorkMode] 지도가 파괴됨. 업무모드 자동 종료.');
    exitWorkMode();
    return;
  }

  if (_shapes.length === 0) return;

  _rebuildAllShapes();
  _runIntersect();
  _updateUI();
}

// ════════════════════════════════════════════════════════════════
// 6. 지도 클릭 처리
// ════════════════════════════════════════════════════════════════

function onMapClick(latlng) {
  if (!_currentMode || !_gpsPos) return;
  if (!_isMapAlive()) return;

  if (_currentMode === 'line') {
    _addLineShape(latlng);
  } else if (_currentMode === 'fan') {
    _addFanShape(latlng);
  }

  _runIntersect();
  _updateUI();
}

// ════════════════════════════════════════════════════════════════
// 7. 도형 생성
// ════════════════════════════════════════════════════════════════

function _addLineShape(clickPos) {
  const result = buildLinePolygon(_gpsPos, clickPos, _lineBuffer);
  if (!result) return;
  result.layer.addTo(_map);
  _shapes.push({ type:'line', layer:result.layer, polygon:result.polygon, endPt:clickPos });
}

function _addFanShape(clickPos) {
  if (!_endPoint) _endPoint = clickPos;

  const result = buildFanPolygon(
    _gpsPos, _endPoint, _fanR1, _fanR2,
    calcExternalTangents, calcArcPoints, calcAngle
  );

  if (!result) {
    console.warn('[WorkMode] 부채꼴 생성 불가: distance <= |r2-r1|');
    return;
  }
  result.layer.addTo(_map);
  _shapes.push({ type:'fan', layer:result.layer, polygon:result.polygon, endPt:_endPoint });
}

// ════════════════════════════════════════════════════════════════
// 8. 도형 재생성 (GPS 갱신 시)
// ════════════════════════════════════════════════════════════════

function _rebuildAllShapes() {
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

    if (result) {
      result.layer.addTo(_map);
      updated.push({ type:shape.type, layer:result.layer, polygon:result.polygon, endPt:shape.endPt });
    }
  }

  _shapes = updated;
}

// ════════════════════════════════════════════════════════════════
// 9. 교차 연산 — 선택된 지역 동 polygon
// ════════════════════════════════════════════════════════════════

function _runIntersect() {
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
 * 선택된 지역의 동 polygon 목록 반환
 *
 * ✅ DB[key].dongs 에는 geo 없음 → getDongGeo(rn,gu,d) 로 POLY_CACHE에서 꺼냄
 * ✅ 퀴즈 진행 중: #rbw .rb.on (buildFilter 생성)
 * ✅ 퀴즈 전 업무모드: .stag.sel (지역 선택 화면)
 */
function _getActiveDongPolygons() {
  try {
    if (typeof DB === 'undefined' || typeof POLY_CACHE === 'undefined' || !POLY_CACHE) return [];
    if (typeof getDongGeo !== 'function') return [];

    var result = [];

    // ── 활성 지역 키 목록 수집 ────────────────────────────────
    var keys = [];

    // 1순위: 퀴즈 진행 중 활성 지역 (.rb.on)
    var rbTags = document.querySelectorAll('#rbw .rb.on');
    if (rbTags.length > 0) {
      rbTags.forEach(function(tag) {
        if (tag.dataset.r) keys.push(tag.dataset.r);
      });
    } else {
      // 2순위: 지역 선택 화면 (.stag.sel)
      var stagTags = document.querySelectorAll('.stag.sel');
      stagTags.forEach(function(tag) {
        if (tag.dataset.r) keys.push(tag.dataset.r);
      });
    }

    if (!keys.length) return [];

    // ── 각 지역의 동 GeoJSON 수집 ─────────────────────────────
    keys.forEach(function(key) {
      var city = DB[key];
      if (!city || !city.dongs) return;

      city.dongs.forEach(function(dong) {
        // ✅ 핵심: getDongGeo(rn, gu, d) 로 POLY_CACHE에서 GeoJSON 꺼냄
        var geo = getDongGeo(dong.rn, dong.gu, dong.d);
        if (!geo) return;

        // getDongGeo는 raw node 반환 → GeoJSON Feature로 래핑
        var feature = _toGeoJsonFeature(geo);
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
 * getDongGeo 반환값(raw node)을 GeoJSON Feature로 변환
 * POLY_CACHE 구조: node = { type, coordinates, ... } 또는 GeoJSON
 */
function _toGeoJsonFeature(node) {
  if (!node) return null;

  // 이미 GeoJSON Feature 형태
  if (node.type === 'Feature') return node;

  // GeoJSON Geometry 형태 (type = Polygon / MultiPolygon)
  if (node.type === 'Polygon' || node.type === 'MultiPolygon') {
    return { type: 'Feature', geometry: node, properties: {} };
  }

  // raw node에 geometry 키가 있는 경우
  if (node.geometry) {
    return { type: 'Feature', geometry: node.geometry, properties: {} };
  }

  // _geo() 헬퍼가 있으면 사용 (기존 시스템 함수)
  if (typeof _geo === 'function') {
    var geom = _geo(node);
    if (geom) return { type: 'Feature', geometry: geom, properties: {} };
  }

  // coordinates 직접 있는 경우
  if (node.coordinates) {
    var type = Array.isArray(node.coordinates[0][0][0]) ? 'MultiPolygon' : 'Polygon';
    return { type: 'Feature', geometry: { type: type, coordinates: node.coordinates }, properties: {} };
  }

  return null;
}

// ════════════════════════════════════════════════════════════════
// 10. UI 갱신 + 자동복사
// ════════════════════════════════════════════════════════════════

function _updateUI() {
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
 * [버그2 수정] GPS 위치로 지도 이동
 * - GPS null 체크 (첫 수신 전)
 * - 지도 파괴 여부 체크 (goHome 후)
 */
function _focusGps() {
  // GPS 아직 없으면 무시
  var pos = getCurrentGPS();
  if (!pos) {
    console.warn('[WorkMode] GPS 아직 수신 안 됨');
    return;
  }

  // 지도 파괴 여부 확인
  if (!_isMapAlive()) {
    console.warn('[WorkMode] 지도 없음 — 업무모드 재시작 필요');
    return;
  }

  try {
    _map.setView([pos.lat, pos.lng], _map.getZoom());
  } catch(e) {
    console.warn('[WorkMode] setView 오류:', e);
  }
}

/**
 * [버그1,2 공통] 지도 인스턴스가 살아있는지 확인
 * goHome() 후 map.remove() 호출 시 _map이 파괴된 상태 감지
 */
function _isMapAlive() {
  if (!_map) return false;
  try {
    // Leaflet 내부 상태 확인: _loaded가 false면 제거된 지도
    return !!_map._loaded;
  } catch(e) {
    return false;
  }
}

function _destroyAll() {
  _clearAllLayers();
  _shapes     = [];
  _endPoint   = null;
  _resultSet  = new Set();
  _prevResult = '';
  updateResultDisplay(_resultSet);
}

function _clearAllLayers() {
  if (!_isMapAlive()) return;
  _shapes.forEach(function(shape) {
    if (shape.layer) {
      try { _map.removeLayer(shape.layer); } catch(e) {}
    }
  });
}

// ════════════════════════════════════════════════════════════════
// 12. 권한 확인
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

window.startWorkMode = function() {
  // ── 지역 선택 확인 ───────────────────────────────────────────
  var selected = document.querySelectorAll('.stag.sel');
  if (selected.length === 0) {
    alert('먼저 지역을 선택해주세요.');
    return;
  }

  if (typeof POLY_CACHE === 'undefined' || !POLY_CACHE) {
    alert('데이터 로딩 중입니다. 잠시 후 다시 시도해주세요.');
    return;
  }

  // ── map이 있고 살아있으면 바로 진입 ─────────────────────────
  if (typeof map !== 'undefined' && map && _isMapAliveExternal(map)) {
    initWorkMode(map);
    return;
  }

  // ── map 없거나 파괴됨 → 새로 초기화 ────────────────────────
  var startEl = document.getElementById('start');
  if (startEl) startEl.classList.add('hidden');

  if (typeof initMap === 'function') initMap();

  setTimeout(function() {
    if (typeof map !== 'undefined' && map) {
      initWorkMode(map);
    } else {
      alert('지도 초기화 실패. 퀴즈 시작 후 이용해주세요.');
      if (startEl) startEl.classList.remove('hidden');
    }
  }, 300);
};

window.stopWorkMode = function() {
  exitWorkMode();
};

/** 외부 map 인스턴스 생존 확인 */
function _isMapAliveExternal(m) {
  if (!m) return false;
  try { return !!m._loaded; } catch(e) { return false; }
}
