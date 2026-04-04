/**
 * drawFan.js — 부채꼴 Polygon 생성 모듈 (외접선 + 원호, 검증된 공식)
 * ✅ 외부 호출 금지. index.js에서만 사용
 *
 * [v3] first-principles 외접선 공식 적용
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │  핵심 수학 (외접선 법선벡터 n)                             │
 * │                                                          │
 * │  조건: n · (C2-C1) = r2 - r1  (단위벡터 n)              │
 * │  → sinφ = (r2-r1)/d, cosφ = sqrt(1 - sinφ²)            │
 * │  → n_right = sinφ·d_hat + cosφ·d_perp                  │
 * │  → n_left  = sinφ·d_hat - cosφ·d_perp                  │
 * │  접점: P = C - r·n  (법선 반대 방향이 접점)              │
 * │                                                          │
 * │  도형 구조:                                               │
 * │    t1R ─────────────────── t2R                          │
 * │   ╱    (오른쪽 외접선)        ╲                          │
 * │  C1(r1)                      C2(r2)                     │
 * │   ╲    (왼쪽 외접선)          ╱                          │
 * │    t1L ─────────────────── t2L                          │
 * └──────────────────────────────────────────────────────────┘
 *
 * 외곽선 순서:
 *   t1L → t2L (왼쪽 직선)
 *   → C2 원호 (왼→오른, 바깥쪽)
 *   → t2R → t1R (오른쪽 직선)
 *   → C1 원호 (오른→왼, 안쪽)
 *   → 닫기
 */

// ── 상수 ─────────────────────────────────────────────────────────
const FAN_ARC_SEGMENTS = 48;
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

  if (d < 1e-6) return null;

  // ── 2. 외접선 법선벡터 계산 (검증된 공식) ───────────────────
  //
  //   d_hat = (ux, uy) : C1→C2 단위벡터
  //   d_perp = (-uy, ux) : 수직 단위벡터 (반시계 90도)
  //   sinP = (r2 - r1) / d
  //   cosP = sqrt(1 - sinP²)
  //
  //   n_right = sinP * d_hat + cosP * d_perp
  //   n_left  = sinP * d_hat - cosP * d_perp
  //
  //   접점 = 원 중심 - r * n  (법선 반대 방향)
  //
  const ux = dx / d;
  const uy = dy / d;
  const px = -uy;   // d_perp
  const py =  ux;

  const sinP = (r2 - r1) / d;
  const cosP = Math.sqrt(Math.max(0, 1 - sinP * sinP));

  // 오른쪽 법선 (C1→C2 기준 오른쪽)
  const n1x = sinP * ux + cosP * px;
  const n1y = sinP * uy + cosP * py;
  // 왼쪽 법선
  const n2x = sinP * ux - cosP * px;
  const n2y = sinP * uy - cosP * py;

  // 접점 (C - r * n)
  const t1R = { x: c1.x - r1 * n1x, y: c1.y - r1 * n1y };  // C1 오른쪽
  const t2R = { x: c2.x - r2 * n1x, y: c2.y - r2 * n1y };  // C2 오른쪽
  const t1L = { x: c1.x - r1 * n2x, y: c1.y - r1 * n2y };  // C1 왼쪽
  const t2L = { x: c2.x - r2 * n2x, y: c2.y - r2 * n2y };  // C2 왼쪽

  // ── 3. 각 접점의 각도 (원 중심 기준) ─────────────────────────
  const a1R = Math.atan2(t1R.y - c1.y, t1R.x - c1.x);  // C1 오른쪽 접점 각도
  const a1L = Math.atan2(t1L.y - c1.y, t1L.x - c1.x);  // C1 왼쪽 접점 각도
  const a2R = Math.atan2(t2R.y - c2.y, t2R.x - c2.x);  // C2 오른쪽 접점 각도
  const a2L = Math.atan2(t2L.y - c2.y, t2L.x - c2.x);  // C2 왼쪽 접점 각도

  // ── 4. 원호 생성 ─────────────────────────────────────────────
  //
  //   C1 안쪽 호: 오른쪽 접점 → 왼쪽 접점 (반시계, 부채꼴 안쪽)
  //   C2 바깥 호: 왼쪽 접점 → 오른쪽 접점 (반시계, 부채꼴 바깥)
  //
  //   방향 결정:
  //     C1 호: t1R → t1L 로 C1 뒤쪽(GPS 쪽) 원호 → 시계방향
  //     C2 호: t2L → t2R 로 C2 앞쪽(끝점 쪽) 원호 → 반시계방향
  //
  const c1Arc = _fanArc(c1, r1, a1R, a1L, true);   // 시계방향 (안쪽 호)
  const c2Arc = _fanArc(c2, r2, a2L, a2R, false);  // 반시계방향 (바깥 호)

  // ── 5. 외곽선 조합 ───────────────────────────────────────────
  //   왼쪽 직선: t1L → t2L
  //   C2 바깥 호: t2L → t2R
  //   오른쪽 직선: t2R → t1R
  //   C1 안쪽 호: t1R → t1L
  const ring = [
    t1L,
    t2L,
    ...c2Arc,   // C2 바깥 호 (왼→오른)
    t2R,
    t1R,
    ...c1Arc,   // C1 안쪽 호 (오른→왼)
  ];

  // ── 6. 평면 → 위경도 복원 ────────────────────────────────────
  const latlngs = ring.map(_fanXyToLatlng);

  // ── 7. GeoJSON Polygon ───────────────────────────────────────
  const coords = latlngs.map(p => [p.lng, p.lat]);
  coords.push(coords[0]);

  const polygon = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
  };

  // ── 8. Leaflet 레이어 ────────────────────────────────────────
  const layer = L.polygon(
    latlngs.map(p => [p.lat, p.lng]),
    { color: '#ff9f43', fillColor: '#ff9f43', fillOpacity: 0.18, weight: 2 }
  );

  return { polygon, layer };
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────

/**
 * 원호 포인트 생성 (startAngle → endAngle)
 * clockwise=true : 시계방향 (sweep < 0)
 * clockwise=false: 반시계방향 (sweep > 0)
 *
 * @param {{ x, y }} center
 * @param {number}   r
 * @param {number}   startAngle  (라디안)
 * @param {number}   endAngle    (라디안)
 * @param {boolean}  clockwise
 * @returns {{ x, y }[]}
 */
function _fanArc(center, r, startAngle, endAngle, clockwise) {
  const N   = FAN_ARC_SEGMENTS;
  const pts = [];

  let sweep = endAngle - startAngle;

  if (clockwise) {
    // 시계방향: sweep이 양수면 한 바퀴 빼서 음수로
    if (sweep > 1e-9) sweep -= 2 * Math.PI;
  } else {
    // 반시계방향: sweep이 음수면 한 바퀴 더해서 양수로
    if (sweep < -1e-9) sweep += 2 * Math.PI;
  }

  // sweep이 0에 가까우면 전체 원 방지
  if (Math.abs(sweep) < 1e-9) return [];

  for (let i = 1; i < N; i++) {  // 양 끝점은 외곽선이 포함
    const t     = i / N;
    const angle = startAngle + sweep * t;
    pts.push({
      x: center.x + r * Math.cos(angle),
      y: center.y + r * Math.sin(angle),
    });
  }
  return pts;
}

/**
 * 위경도 → 평면 km
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
