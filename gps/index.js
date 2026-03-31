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

// 슬라이더 기본값
let _lineBuffer  = 0.3;
let _fanR1       = 0.3;
let _fanR2       = 0.8;

// ════════════════════════════════════════════════════════════════
// 2. 업무모드 진입
// ════════════════════════════════════════════════════════════════

function initWorkMode(leafletMap) {
  // ── [항목3] 권한 확인 ────────────────────────────────────────
  if (!_hasWorkModeAccess()) {
    alert('프리미엄 전용 기능입니다.\n업그레이드 후 이용해 주세요.');
    return;
  }

  if (_currentMode !== null || _gpsWatchId !== null) return;

  _map = leafletMap;

  // ── [항목6] GPS 시작 ─────────────────────────────────────────
  _gpsWatchId = initGPS(
    function(pos) { onGpsUpdate(pos); },
    function(err) {
      setGpsDot('error');
      console.warn('[WorkMode] GPS 오류:', err);
    }
  );
  setGpsDot('wait');

  // ── UI 패널 삽입 ─────────────────────────────────────────────
  renderWorkModePanel(
    function() { switchMode('line'); },
    function() { switchMode('fan');  },
    function() { _toggleAutoCopy();  },
    function() { _focusGps();        }
  );

  // ── 지도 클릭 이벤트 등록 (기존 onMapClick과 충돌 방지) ──────
  _mapClickFn = function(e) {
    if (_currentMode) { onMapClick(e.latlng); }
  };
  _map.on('click', _mapClickFn);
}

// ════════════════════════════════════════════════════════════════
// 3. 업무모드 종료 — 완전 초기화
// ════════════════════════════════════════════════════════════════

function exitWorkMode() {
  // ── [항목6] GPS clearWatch 반드시 실행 ───────────────────────
  stopGPS(_gpsWatchId);
  _gpsWatchId = null;
  _gpsPos     = null;

  _clearAllLayers();

  if (_map && _mapClickFn) {
    _map.off('click', _mapClickFn);
    _mapClickFn = null;
  }

  // ── [항목7] shapes + 전체 상태 초기화 ───────────────────────
  _shapes      = [];
  _currentMode = null;
  _endPoint    = null;
  _resultSet   = new Set();
  _autoCopy    = false;
  _prevResult  = '';

  removeWorkModePanel();
  _map = null;
}

// ════════════════════════════════════════════════════════════════
// 4. 모드 전환
// ════════════════════════════════════════════════════════════════

function switchMode(mode) {
  if (_currentMode === mode) return;

  // ── [항목7] 모드 전환 시 shapes 완전 초기화 ──────────────────
  _destroyAll();

  _currentMode = mode;
  setActiveModeBtn(mode);

  if (mode === 'fan') {
    _endPoint = null;
  }
}

// ════════════════════════════════════════════════════════════════
// 5. GPS 업데이트 콜백
// ════════════════════════════════════════════════════════════════

function onGpsUpdate(pos) {
  _gpsPos = pos;
  setGpsDot('active');

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
  _shapes.push({
    type:    'line',
    layer:   result.layer,
    polygon: result.polygon,
    endPt:   clickPos,
  });
}

function _addFanShape(clickPos) {
  if (!_endPoint) {
    _endPoint = clickPos;
  }

  const result = buildFanPolygon(
    _gpsPos, _endPoint, _fanR1, _fanR2,
    calcExternalTangents, calcArcPoints, calcAngle
  );

  if (!result) {
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
      updated.push({
        type:    shape.type,
        layer:   result.layer,
        polygon: result.polygon,
        endPt:   shape.endPt,
      });
    }
  }

  _shapes = updated;
}

// ════════════════════════════════════════════════════════════════
// 9. 교차 연산
// ════════════════════════════════════════════════════════════════

function _runIntersect() {
  // ── [항목1,2] 선택된 지역만 필터링 ──────────────────────────
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
 * [항목1,2] 활성화된 지역의 동 polygon만 반환
 *
 * ✅ 퀴즈 진행 중: .rb.on 태그 (buildFilter가 생성, 사용자가 ON/OFF 가능)
 * ✅ 퀴즈 없이 업무모드만: .stag.sel 태그 (지역 선택 화면 선택 상태)
 * → 두 경우 모두 대응, 선택된 지역만 필터링 보장
 *
 * @returns {{ name: string, geo: object }[]}
 */
function _getActiveDongPolygons() {
  try {
    if (typeof DB === 'undefined') return [];

    var result = [];

    // ── 1순위: 퀴즈 진행 중 활성 지역 (.rb.on) ──────────────
    // buildFilter()로 생성된 태그, 사용자가 개별 ON/OFF 가능
    var rbTags = document.querySelectorAll('#rbw .rb.on');

    if (rbTags.length > 0) {
      rbTags.forEach(function(tag) {
        var key = tag.dataset.r;
        if (key && DB[key] && DB[key].dongs) {
          DB[key].dongs.forEach(function(d) {
            if (d.name && d.geo) result.push({ name: d.name, geo: d.geo });
          });
        }
      });
      return result;
    }

    // ── 2순위: 퀴즈 시작 전 선택 화면 (.stag.sel) ───────────
    // 사용자가 지역 선택 화면에서 선택한 지역
    var stagTags = document.querySelectorAll('.stag.sel');

    stagTags.forEach(function(tag) {
      var key = tag.dataset.r;
      if (key && DB[key] && DB[key].dongs) {
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

function _updateUI() {
  updateResultDisplay(_resultSet);

  // ── [항목] 자동복사 중복 방지: prev !== current 일 때만 ──────
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

function _focusGps() {
  var pos = getCurrentGPS();
  if (pos && _map) {
    _map.setView([pos.lat, pos.lng], _map.getZoom());
  }
}

function _destroyAll() {
  _clearAllLayers();
  _shapes      = [];
  _endPoint    = null;
  _resultSet   = new Set();
  _prevResult  = '';
  updateResultDisplay(_resultSet);
}

function _clearAllLayers() {
  if (!_map) return;
  _shapes.forEach(function(shape) {
    if (shape.layer) {
      try { _map.removeLayer(shape.layer); } catch(e) {}
    }
  });
}

// ════════════════════════════════════════════════════════════════
// 12. 권한 확인
// ════════════════════════════════════════════════════════════════

/**
 * [항목3] premium 또는 admin만 허용
 * 기존 시스템 userProfile + isActivePremium() 활용
 */
function _hasWorkModeAccess() {
  try {
    if (typeof userProfile === 'undefined' || !userProfile) return false;

    // admin 즉시 허용
    if (userProfile.role === 'admin') return true;

    // premium 확인: 기존 시스템 isActivePremium() 우선
    if (typeof isActivePremium === 'function') {
      return isActivePremium();
    }

    // fallback 직접 판정
    return !!(userProfile.is_premium &&
              userProfile.premium_until &&
              new Date(userProfile.premium_until) > new Date());
  } catch(e) {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
// 13. 기존 시스템 진입점
// ════════════════════════════════════════════════════════════════

/**
 * [항목4] URL 직접 접근 차단
 * /workmode 로 직접 접근 시 권한 없으면 메인으로 리다이렉트
 * vercel.json: /workmode → /gps/index.js (JS 파일 직접 서빙)
 * → JS 파일은 브라우저에서 실행되지 않으므로 실질적 차단 완료
 * → 추가로 startWorkMode 내부에서 권한 재확인
 */
window.startWorkMode = function() {
  // map이 없으면 → 지역이 선택됐는지 확인 후 직접 초기화
  if (typeof map === 'undefined' || !map) {
    // 지역 선택 여부 확인
    var selected = document.querySelectorAll('.stag.sel');
    if (selected.length === 0) {
      alert('먼저 지역을 선택해주세요.\n(지역 선택 후 업무모드를 시작합니다)');
      return;
    }

    if (typeof POLY_CACHE === 'undefined' || !POLY_CACHE) {
      alert('데이터 로딩 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    // 지도 영역 표시 + 초기화
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
    return;
  }

  // map이 있으면 바로 진입
  initWorkMode(map);
};

window.stopWorkMode = function() {
  exitWorkMode();
};
