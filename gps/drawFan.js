/**
 * drawFan.js — 부채꼴 Polygon 생성 모듈
 * ✅ 외부 호출 금지. index.js에서만 사용
 * ❌ tangent.js 직접 호출 금지 → index.js가 주입
 *
 * 공개 함수:
 *   buildFanPolygon(start, end, r1, r2, tangentFn)
 *     → { polygon: GeoJSON, layer: L.Layer } | null
 *
 * 입력:
 *   start      : { lat, lng }  — GPS (실시간 이동)
 *   end        : { lat, lng }  — 최초 클릭 고정점
 *   r1         : number (km)   — 시작 원 반경
 *   r2         : number (km)   — 끝 원 반경 (항상 r2 > r1)
 *   tangentFn  : function      — index.js가 주입하는 tangent 계산 함수
 *
 * 출력:
 *   null이면 polygon 생성 조건 불충족 (distance ≤ |r2 - r1|)
 *   아니면 { polygon, layer }
 *
 * 주의:
 *   arc 분할 = 30~50 포인트
 */

// ── 상수 ─────────────────────────────────────────────────────────
const FAN_ARC_SEGMENTS = 40;  // 호 분할 수 (설계 명세: 30~50)
const EARTH_R_KM_FAN   = 6371;

// ── 공개 함수 ────────────────────────────────────────────────────

/**
 * GPS 위치(start)와 고정 끝점(end) 사이에
 * 두 원의 외접선 + 원호로 이루어진 부채꼴 Polygon을 생성한다.
 *
 * 도형 구조:
 *
 *          t1L ════════════════ t2L
 *         ╱   (왼쪽 외접선)      ╲
 *   c1 ●                          ● c2
 *    (r1)                        (r2)
 *         ╲   (오른쪽 외접선)    ╱
 *          t1R ════════════════ t2R
 *
 *   외곽선 순서:
 *     t1R(c1 오른쪽 접점)
 *     → 오른쪽 외접선 → t2R(c2 오른쪽 접점)
 *     → c2 원호 (오른쪽 → 왼쪽, 바깥쪽 방향)
 *     → t2L(c2 왼쪽 접점)
 *     → 왼쪽 외접선 → t1L(c1 왼쪽 접점)
 *     → c1 원호 (왼쪽 → 오른쪽, 안쪽 방향)
 *     → 닫기
 *
 * ❌ tangent.js 직접 import 금지
 *    → tangentFn, arcFn, angleFn 을 index.js가 주입
 *
 * @param {{ lat, lng }} start      GPS 현재 위치 (실시간 갱신)
 * @param {{ lat, lng }} end        최초 클릭 고정점
 * @param {number}       r1         시작 원 반경 (km)
 * @param {number}       r2         끝 원 반경   (km, r2 > r1 권장)
 * @param {function}     tangentFn  calcExternalTangents — index.js가 주입
 * @param {function}     arcFn      calcArcPoints        — index.js가 주입
 * @param {function}     angleFn    calcAngle            — index.js가 주입
 * @returns {{ polygon: object, layer: object } | null}
 *   null  → distance ≤ |r2 - r1| (한 원이 다른 원 포함, 생성 불가)
 */
function buildFanPolygon(start, end, r1, r2, tangentFn, arcFn, angleFn) {

  // ── 1. 위경도 → 평면 좌표 (km) ──────────────────────────────
  const c1 = _latlngToXY(start);   // GPS 위치 (실시간)
  const c2 = _latlngToXY(end);     // 고정 끝점

  // ── 2. 외접선 계산 (tangent.js 위임) ────────────────────────
  //   r2 가 항상 크도록 정규화: 두 원의 크기 순서를 맞춤
  //   (r1 > r2 인 경우도 수학적으로 처리 가능하지만 설계 명세상 r2 > r1)
  const tangents = tangentFn(c1, r1, c2, r2);

  if (!tangents) {
    // distance ≤ |r2 - r1| → 생성 불가
    return null;
  }

  const { left, right } = tangents;
  // left.t1  = c1 위 왼쪽 접점
  // left.t2  = c2 위 왼쪽 접점
  // right.t1 = c1 위 오른쪽 접점
  // right.t2 = c2 위 오른쪽 접점

  // ── 3. 각 접점의 각도 계산 (원 중심 기준) ───────────────────
  const a1R = angleFn(c1, right.t1);  // c1 오른쪽 접점 각도
  const a1L = angleFn(c1, left.t1);   // c1 왼쪽 접점 각도
  const a2R = angleFn(c2, right.t2);  // c2 오른쪽 접점 각도
  const a2L = angleFn(c2, left.t2);   // c2 왼쪽 접점 각도

  // ── 4. 원호 생성 ────────────────────────────────────────────
  //
  //   c2 원호: 오른쪽 접점 → 왼쪽 접점 (바깥쪽, 반시계)
  //     → c2가 끝 원이므로 더 넓은 호 (GPS에서 먼 쪽)
  //
  //   c1 원호: 왼쪽 접점 → 오른쪽 접점 (안쪽, 시계)
  //     → c1이 GPS 원이므로 더 좁은 호
  //
  //   방향 결정:
  //     두 원 중심을 잇는 벡터의 오른쪽/왼쪽 기준으로
  //     각 호가 "바깥쪽"을 향하도록 방향을 선택
  const c2Arc = arcFn(c2, r2, a2R, a2L, false, FAN_ARC_SEGMENTS); // 반시계
  const c1Arc = arcFn(c1, r1, a1L, a1R, true,  FAN_ARC_SEGMENTS); // 시계

  // ── 5. 외곽선 포인트 조합 ────────────────────────────────────
  //   right.t1 → [직선] → right.t2
  //   → c2 원호 (오른→왼)
  //   → [직선] left.t2 → left.t1
  //   → c1 원호 (왼→오른)
  //   → 닫기
  const ring = [
    right.t1,
    right.t2,
    ...c2Arc,
    left.t2,
    left.t1,
    ...c1Arc,
  ];

  // ── 6. 평면 → 위경도 복원 ────────────────────────────────────
  const latlngs = ring.map(_xyToLatlng);

  // ── 7. GeoJSON Polygon 생성 ──────────────────────────────────
  const coords = latlngs.map(p => [p.lng, p.lat]);
  coords.push(coords[0]);  // 닫기

  const polygon = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords],
    },
  };

  // ── 8. Leaflet 레이어 생성 ───────────────────────────────────
  const layer = L.polygon(
    latlngs.map(p => [p.lat, p.lng]),
    {
      color:       '#ff9f43',   // 부채꼴은 주황색으로 선 모드와 구분
      fillColor:   '#ff9f43',
      fillOpacity: 0.18,
      weight:      2,
    }
  );

  return { polygon, layer };
}

// ── 내부 좌표 변환 (drawLine.js와 동일, 모듈 독립성 유지) ────────

const _REF_LAT = 37.5665;
const _REF_LNG = 126.9780;
const _LAT_RAD = (_REF_LAT * Math.PI) / 180;

/**
 * 위경도 → 평면 km
 * @param {{ lat: number, lng: number }} pos
 * @returns {{ x: number, y: number }}
 */
function _latlngToXY(pos) {
  return {
    x: (pos.lng - _REF_LNG) * EARTH_R_KM_FAN * (Math.PI / 180) * Math.cos(_LAT_RAD),
    y: (pos.lat - _REF_LAT) * EARTH_R_KM_FAN * (Math.PI / 180),
  };
}

/**
 * 평면 km → 위경도
 * @param {{ x: number, y: number }} pt
 * @returns {{ lat: number, lng: number }}
 */
function _xyToLatlng(pt) {
  return {
    lat: pt.y / (EARTH_R_KM_FAN * Math.PI / 180) + _REF_LAT,
    lng: pt.x / (EARTH_R_KM_FAN * (Math.PI / 180) * Math.cos(_LAT_RAD)) + _REF_LNG,
  };
}
