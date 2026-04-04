/**
 * drawFan.js — 부채꼴 Polygon 생성 모듈 (Mercator 투영 공간 계산)
 * ✅ 외부 호출 금지. index.js에서만 사용
 *
 * [v4] 모든 방향 완벽 대칭
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  비대칭 원인과 해결                                            │
 * │                                                              │
 * │  기존: 위경도 → Equirectangular km → 수학 → 위경도           │
 * │  문제: 동서(x) 1km ≠ 남북(y) 1km (Mercator 픽셀 기준)       │
 * │        → 대각선에서 원이 타원처럼 보여 비대칭                  │
 * │                                                              │
 * │  수정: 위경도 → Web Mercator km → 수학 → 위경도              │
 * │        Mercator 공간에서 x/y 1단위 = 같은 픽셀 크기          │
 * │        → 모든 방향 완벽 대칭                                  │
 * │                                                              │
 * │  외접선 공식 (변경 없음):                                      │
 * │    n · (C2-C1) = r2 - r1  (단위벡터 n)                      │
 * │    sinφ = (r2-r1)/d, cosφ = sqrt(1-sinφ²)                  │
 * │    n_R = sinφ·d_hat + cosφ·d_perp                          │
 * │    n_L = sinφ·d_hat - cosφ·d_perp                          │
 * │    접점 P = C - r·n                                          │
 * └──────────────────────────────────────────────────────────────┘
 */

// ── 상수 ─────────────────────────────────────────────────────────
const FAN_ARC_SEGMENTS = 48;
const EARTH_R_KM_FAN   = 6371;  // 지구 반경 (km)

// ── 공개 함수 ────────────────────────────────────────────────────
function buildFanPolygon(start, end, r1, r2, tangentFn, arcFn, angleFn) {

  // ── 1. 위경도 → Web Mercator (km) ────────────────────────────
  //   Mercator 공간에서 x/y 1단위 = 같은 픽셀 크기
  //   → 모든 방향에서 원이 진짜 원으로 렌더링됨
  const c1 = _latlngToMercator(start);
  const c2 = _latlngToMercator(end);

  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d  = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) return null;

  // ── 2. 반경을 Mercator 스케일로 변환 ─────────────────────────
  //   실제 km → Mercator km: r_merc = r_km / cos(lat)
  //   GPS 위치의 위도 기준으로 변환
  const cosLat = Math.cos(start.lat * Math.PI / 180);
  const r1m = r1 / cosLat;
  const r2m = r2 / cosLat;

  // ── 3. 외접선 법선벡터 (검증된 first-principles 공식) ─────────
  const ux = dx / d;
  const uy = dy / d;
  const px = -uy;   // d_perp (수직)
  const py =  ux;

  const sinP = (r2m - r1m) / d;
  const cosP = Math.sqrt(Math.max(0, 1 - sinP * sinP));

  const n1x = sinP * ux + cosP * px;  // 오른쪽 법선
  const n1y = sinP * uy + cosP * py;
  const n2x = sinP * ux - cosP * px;  // 왼쪽 법선
  const n2y = sinP * uy - cosP * py;

  // 접점 (C - r * n)
  const t1R = { x: c1.x - r1m * n1x, y: c1.y - r1m * n1y };
  const t2R = { x: c2.x - r2m * n1x, y: c2.y - r2m * n1y };
  const t1L = { x: c1.x - r1m * n2x, y: c1.y - r1m * n2y };
  const t2L = { x: c2.x - r2m * n2x, y: c2.y - r2m * n2y };

  // ── 4. 각 접점의 각도 (원 중심 기준) ─────────────────────────
  const a1R = Math.atan2(t1R.y - c1.y, t1R.x - c1.x);
  const a1L = Math.atan2(t1L.y - c1.y, t1L.x - c1.x);
  const a2R = Math.atan2(t2R.y - c2.y, t2R.x - c2.x);
  const a2L = Math.atan2(t2L.y - c2.y, t2L.x - c2.x);

  // ── 5. 원호 생성 ─────────────────────────────────────────────
  //   C1 안쪽 호: t1R → t1L, 시계방향 (GPS 쪽, 좁은 원)
  //   C2 바깥 호: t2L → t2R, 시계방향 (끝점 쪽, 넓은 원, 앞쪽 볼록)
  const c1Arc = _fanArc(c1, r1m, a1R, a1L, true);
  const c2Arc = _fanArc(c2, r2m, a2L, a2R, true);

  // ── 6. 외곽선 조합 ───────────────────────────────────────────
  const ring = [
    t1L,
    t2L,
    ...c2Arc,
    t2R,
    t1R,
    ...c1Arc,
  ];

  // ── 7. Mercator → 위경도 복원 ────────────────────────────────
  const latlngs = ring.map(_mercatorToLatlng);

  // ── 8. GeoJSON Polygon ───────────────────────────────────────
  const coords = latlngs.map(p => [p.lng, p.lat]);
  coords.push(coords[0]);

  const polygon = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
  };

  // ── 9. Leaflet 레이어 ────────────────────────────────────────
  const layer = L.polygon(
    latlngs.map(p => [p.lat, p.lng]),
    { color: '#ff9f43', fillColor: '#ff9f43', fillOpacity: 0.18, weight: 2 }
  );

  return { polygon, layer };
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────

/**
 * 원호 포인트 생성
 * clockwise=true : 시계방향
 * clockwise=false: 반시계방향
 */
function _fanArc(center, r, startAngle, endAngle, clockwise) {
  const N   = FAN_ARC_SEGMENTS;
  const pts = [];

  let sweep = endAngle - startAngle;
  if (clockwise) {
    if (sweep > 1e-9) sweep -= 2 * Math.PI;
  } else {
    if (sweep < -1e-9) sweep += 2 * Math.PI;
  }
  if (Math.abs(sweep) < 1e-9) return [];

  for (let i = 1; i < N; i++) {
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
 * 위경도 → Web Mercator (km 단위)
 * x = R * lng_rad
 * y = R * ln(tan(π/4 + lat_rad/2))
 */
function _latlngToMercator(pos) {
  const latRad = pos.lat * Math.PI / 180;
  const lngRad = pos.lng * Math.PI / 180;
  return {
    x: EARTH_R_KM_FAN * lngRad,
    y: EARTH_R_KM_FAN * Math.log(Math.tan(Math.PI / 4 + latRad / 2)),
  };
}

/**
 * Web Mercator (km) → 위경도
 * lat = 2*atan(exp(y/R)) - π/2
 * lng = x/R (라디안)
 */
function _mercatorToLatlng(pt) {
  return {
    lat: (2 * Math.atan(Math.exp(pt.y / EARTH_R_KM_FAN)) - Math.PI / 2) * 180 / Math.PI,
    lng: (pt.x / EARTH_R_KM_FAN) * 180 / Math.PI,
  };
}
