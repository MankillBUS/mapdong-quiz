/**
 * gps.js — GPS 관리 모듈
 * ✅ 외부 호출 금지. index.js에서만 사용
 *
 * 공개 함수:
 *   initGPS(onUpdate)   → watchId 반환, 위치 변경 시 onUpdate({ lat, lng }) 호출
 *   stopGPS(watchId)    → clearWatch 실행
 *   getCurrentGPS()     → 현재 { lat, lng } 또는 null
 */

// ── 내부 상태 ────────────────────────────────────────────────────
let _watchId = null;       // navigator.geolocation.watchPosition 핸들
let _current = null;       // 마지막으로 수신된 { lat, lng }

// ── Geolocation 옵션 ─────────────────────────────────────────────
const GPS_OPTIONS = {
  enableHighAccuracy: true,   // GPS 칩 직접 사용 (배터리 더 쓰지만 정확)
  timeout: 10000,             // 10초 내 응답 없으면 오류
  maximumAge: 0,              // 캐시 사용 금지 → 항상 최신 위치
};

// ── 공개 함수 ────────────────────────────────────────────────────

/**
 * GPS 추적 시작
 * @param {function} onUpdate  - 위치 변경 시 호출: ({ lat, lng }) => void
 * @param {function} [onError] - 오류 시 호출: (error) => void (선택)
 * @returns {number} watchId   - stopGPS()에 전달할 ID
 */
function initGPS(onUpdate, onError) {
  if (!navigator.geolocation) {
    const err = new Error('이 브라우저는 GPS를 지원하지 않습니다.');
    if (onError) onError(err);
    else console.warn('[GPS]', err.message);
    return null;
  }

  // 이미 추적 중이면 기존 watcher 먼저 해제
  if (_watchId !== null) {
    stopGPS(_watchId);
  }

  _watchId = navigator.geolocation.watchPosition(
    (position) => {
      const pos = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      _current = pos;
      onUpdate(pos);   // index.js의 onGpsUpdate 호출
    },
    (error) => {
      console.warn('[GPS] 오류:', _gpsErrorMsg(error));
      if (onError) onError(error);
    },
    GPS_OPTIONS
  );

  return _watchId;
}

/**
 * GPS 추적 완전 중지
 * @param {number} watchId - initGPS()가 반환한 ID
 */
function stopGPS(watchId) {
  if (watchId !== null && watchId !== undefined) {
    navigator.geolocation.clearWatch(watchId);
  }
  // 내부 상태도 초기화 (exitWorkMode 보안 요건)
  _watchId = null;
  _current = null;
}

/**
 * 현재 GPS 위치 반환 (동기)
 * watchPosition으로 마지막 수신된 위치를 그대로 반환
 * @returns {{ lat: number, lng: number } | null}
 */
function getCurrentGPS() {
  return _current;
}

// ── 내부 헬퍼 ───────────────────────────────────────────────────

/**
 * GeolocationPositionError 코드를 한국어 메시지로 변환
 * @param {GeolocationPositionError} error
 * @returns {string}
 */
function _gpsErrorMsg(error) {
  switch (error.code) {
    case 1: return '위치 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.';
    case 2: return 'GPS 신호를 받을 수 없습니다. 실외로 이동하거나 잠시 후 다시 시도하세요.';
    case 3: return 'GPS 응답 시간이 초과되었습니다.';
    default: return `알 수 없는 GPS 오류 (code: ${error.code})`;
  }
}
