/**
 * drawFan.js — 부채꼴 Polygon 생성 모듈 (각도 스윕 방식)
 * ✅ 외부 호출 금지. index.js에서만 사용
 *
 * [v2] tangent 기반 → 각도 스윕(angle sweep) 방식으로 전면 재작성
 *
 * 핵심 원리:
 *   1. 시작점 → 끝점 방향각 θ = atan2(dy, dx)
 *   2. 끝점 반경 r2와 거리 d로 부채꼴 반각 α = atan2(r2, d) 계산
 *      → atan2 사용으로 모든 방향 완벽 대칭
 *      → tan 기반 발산 없음
 *   3. 시작 원 호: θ-α ~ θ+α (c1 주변, r1)
 *   4. 끝 원 호:   (θ+α) ~ (θ-α) 반대편 (c2 주변, r2)
 *   5. 두 호의 양 끝을 직선으로 연결 → 닫기
 *
 * 공개 함수:
 *   buildFanPolygon(start, end, r1, r2, tangentFn, arcFn, angleFn)
 *     tangentFn, arcFn, angleFn — index.js가 주입 (하위 호환 유지, 내부 미사용)
 *
 * @param {{ lat, lng }} start  GPS 현재 위치
 * @param {{ lat, lng }} end    최초 클릭 고정점
 * @param {number}       r1     시작 원 반경 (km)
 * @param {number}       r2     끝 원 반경   (km)
 * @param {function}     tangentFn  (하위 호환용, 미사용)
 * @param {function}     arcFn      (하위 호환용, 미사용)
 * @param {function}     angleFn    (하위 호환용, 미사용)
 * @returns {{ polygon: object, layer: object } | null}
 */

// ── 상수 ─────────────────────────────────────────────────────────
const FAN_ARC_SEGMENTS = 48;      // 호 분할 수 (많을수록 부드러움)
const EARTH_R_KM_FAN   = 6371;
const _FAN_REF_LAT     = 37.5665;
const _FAN_REF_LNG     = 126.9780;
const _FAN_LAT_RAD     = (_FAN_REF_LAT * Math.PI) / 180;

// ── 공개 함수 ────────────────────────────────────────────────────
function buildFanPolygon(start, end, r1, r2, tangentFn, arcFn, angleFn) {

  // ── 1. 위경도 → 평면 좌표 (km) ──────────────────────────────
  const c1 = _fanLatlngToXY(start);
  const c2 = _fanLatlngToXY(end);

  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d  = Math.sqrt(dx * dx + dy * dy);

  // 끝점과 너무 가까우면 그릴 수 없음
  if (d < 1e-6) return null;

  // ── 2. 중심축 방향각 θ (c1 → c2) ───────────────────────────
  const theta = Math.atan2(dy, dx);

  // ── 3. 부채꼴 반각 α 계산 ───────────────────────────────────
  // atan2(r2, d): c2까지 거리 d에서 반경 r2가 차지하는 각도
  // → r2가 클수록, d가 작을수록 넓어지는 자연스러운 시야각
  const alpha = Math.atan2(r2, d);

  // alpha가 π/2 이상이면 시각적으로 너무 넓어짐 → 클램프
  const clampedAlpha = Math.min(alpha, Math.PI * 0.72);

  // ── 4. 시작 원 호 (c1, r1): θ-α ~ θ+α ─────────────────────
  // 안쪽 호: c1 주변, 작은 반원 형태
  const c1ArcPts = _sweepArc(c1, r1, theta - clampedAlpha, theta + clampedAlpha, false);

  // ── 5. 끝 원 호 (c2, r2): θ+α 반대편 ~ θ-α 반대편 ─────────
  // 바깥 호: c2 주변, 더 큰 호
  // c2 기준으로 c1 방향은 theta + π
  // c2 호 범위: (theta + π) ± alpha  →  시계방향으로 스윕
  const c2BaseAngle = theta + Math.PI;
  const c2ArcPts = _sweepArc(c2, r2,
    c2BaseAngle + clampedAlpha,   // 오른쪽 접점 (c1 기준 오른쪽)
    c2BaseAngle - clampedAlpha,   // 왼쪽 접점
    false                          // 반시계 → c2 바깥쪽 호
  );

  // ── 6. 외곽선 조합 ───────────────────────────────────────────
  // c1 호 왼쪽 끝 → c2 호 왼쪽 끝 (직선)
  // → c2 호 (오른→왼)
  // → c2 호 오른쪽 끝 → c1 호 오른쪽 끝 (직선)
  // → c1 호 (오른→왼)
  // → 닫기
  const ring = [
    ...c1ArcPts,          // c1 호: 왼쪽 → 오른쪽 (θ-α → θ+α)
    ...c2ArcPts,          // c2 호: 오른쪽 → 왼쪽 (반대편)
  ];

  // ── 7. 평면 → 위경도 복원 ────────────────────────────────────
  const latlngs = ring.map(_fanXyToLatlng);

  // ── 8. GeoJSON Polygon 생성 ──────────────────────────────────
  const coords = latlngs.map(p => [p.lng, p.lat]);
  coords.push(coords[0]);  // 닫기

  const polygon = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords],
    },
  };

  // ── 9. Leaflet 레이어 생성 ───────────────────────────────────
  const layer = L.polygon(
    latlngs.map(p => [p.lat, p.lng]),
    {
      color:       '#ff9f43',
      fillColor:   '#ff9f43',
      fillOpacity: 0.18,
      weight:      2,
    }
  );

  return { polygon, layer };
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────

/**
 * 각도 스윕으로 원호 위의 점 배열 생성
 * startAngle → endAngle 방향으로 FAN_ARC_SEGMENTS개 분할
 *
 * @param {{ x, y }} center
 * @param {number}   radius
 * @param {number}   startAngle  (라디안)
 * @param {number}   endAngle    (라디안)
 * @param {boolean}  clockwise   true = 시계방향
 * @returns {{ x, y }[]}
 */
function _sweepArc(center, radius, startAngle, endAngle, clockwise) {
  const N = FAN_ARC_SEGMENTS;
  const pts = [];

  // 각도 범위 (항상 short path)
  let sweep = endAngle - startAngle;

  if (clockwise) {
    // 시계방향: sweep이 양수면 음수로
    if (sweep > 0) sweep -= 2 * Math.PI;
  } else {
    // 반시계방향: sweep이 음수면 양수로
    if (sweep < 0) sweep += 2 * Math.PI;
  }

  for (let i = 0; i <= N; i++) {
    const t     = i / N;
    const angle = startAngle + sweep * t;
    pts.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }

  return pts;
}

/**
 * 위경도 → 평면 km (Equirectangular)
 */
function _fanLatlngToXY(pos) {
  return {
    x: (pos.lng - _FAN_REF_LNG) * EARTH_R_KM_FAN * (Math.PI / 180) * Math.cos(_FAN_LAT_RAD),
    y: (pos.lat - _FAN_REF_LAT) * EARTH_R_KM_FAN * (Math.PI / 180),
  };
}

/**
 * 평면 km → 위경도
 */
function _fanXyToLatlng(pt) {
  return {
    lat: pt.y / (EARTH_R_KM_FAN * Math.PI / 180) + _FAN_REF_LAT,
    lng: pt.x / (EARTH_R_KM_FAN * (Math.PI / 180) * Math.cos(_FAN_LAT_RAD)) + _FAN_REF_LNG,
  };
}
