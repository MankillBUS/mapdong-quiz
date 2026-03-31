/**
 * drawLine.js — 선 → Polygon 변환 모듈
 * ✅ 외부 호출 금지. index.js에서만 사용
 *
 * 공개 함수:
 *   buildLinePolygon(start, end, bufferKm)
 *     → { polygon: GeoJSON, layer: L.Layer }
 *
 * 입력:
 *   start     : { lat, lng }  — GPS 현재 위치
 *   end       : { lat, lng }  — 클릭 끝점
 *   bufferKm  : number        — 선 버퍼 반경 (km)
 *
 * 출력:
 *   polygon   : GeoJSON Polygon (교차 연산용)
 *   layer     : Leaflet Layer  (지도 표시용)
 */

// ── 상수 ─────────────────────────────────────────────────────────
const ARC_SEGMENTS = 24;   // 선 끝 반원 분할 수 (부드러운 캡)
const EARTH_R_KM   = 6371; // 지구 반경 (km)

// ── 공개 함수 ────────────────────────────────────────────────────

/**
 * 시작점~끝점 선분에 버퍼를 적용해 둥근 모서리 직사각형(Stadium) Polygon을 만든다.
 *
 * 구조:
 *   ┌────────────────────────────────────┐
 *   │  반원 캡  │  직사각형 몸통  │  반원 캡  │
 *   └────────────────────────────────────┘
 *   start 쪽 반원 → 위쪽 직선 → end 쪽 반원 → 아래쪽 직선 → 닫기
 *
 * 좌표계 흐름:
 *   { lat, lng }  →  평면 { x, y } (km)  →  Polygon 계산  →  { lat, lng } 복원
 *
 * @param {{ lat: number, lng: number }} start    GPS 현재 위치
 * @param {{ lat: number, lng: number }} end      클릭 끝점
 * @param {number}                       bufferKm 버퍼 반경 (km)
 * @returns {{ polygon: object, layer: object }}
 *   polygon : GeoJSON Polygon  (spatial.js 교차 연산용)
 *   layer   : Leaflet L.Polygon (지도 표시용)
 */
function buildLinePolygon(start, end, bufferKm) {
  // ── 1. 위경도 → 평면 좌표 변환 (km) ─────────────────────────
  const p1 = latlngToXY(start);
  const p2 = latlngToXY(end);

  // ── 2. 선분 방향 단위벡터 ────────────────────────────────────
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  // 시작점 = 끝점이면 원으로 대체
  if (len < 1e-9) {
    return buildCirclePolygon(start, bufferKm);
  }

  const ux = dx / len;  // 선분 방향 단위벡터
  const uy = dy / len;

  // ── 3. 수직(법선) 방향 단위벡터 ─────────────────────────────
  const nx = -uy;  // 오른쪽 법선
  const ny =  ux;

  // ── 4. 4개 기준점 (직사각형 꼭짓점) ─────────────────────────
  //   p1R: start 오른쪽  p1L: start 왼쪽
  //   p2R: end 오른쪽    p2L: end 왼쪽
  const p1R = { x: p1.x + nx * bufferKm, y: p1.y + ny * bufferKm };
  const p1L = { x: p1.x - nx * bufferKm, y: p1.y - ny * bufferKm };
  const p2R = { x: p2.x + nx * bufferKm, y: p2.y + ny * bufferKm };
  const p2L = { x: p2.x - nx * bufferKm, y: p2.y - ny * bufferKm };

  // ── 5. 반원 캡 포인트 생성 ───────────────────────────────────
  //   start 쪽: 오른쪽 → 왼쪽 (선분 반대 방향 반원)
  //   end 쪽:   왼쪽 → 오른쪽 (선분 방향 반원)
  const startCapAngleR = Math.atan2(ny, nx);        // start 오른쪽 각도
  const endCapAngleL   = Math.atan2(-ny, -nx);      // end 왼쪽 각도

  const startCap = buildSemiArc(p1, bufferKm, startCapAngleR, true,  ARC_SEGMENTS);
  const endCap   = buildSemiArc(p2, bufferKm, endCapAngleL,   false, ARC_SEGMENTS);

  // ── 6. 전체 외곽선 포인트 조합 ──────────────────────────────
  //   p2R → end 반원 → p2L → p1L → start 반원 → p1R → 닫기
  const ring = [
    p2R,
    ...endCap,
    p2L,
    p1L,
    ...startCap,
    p1R,
  ];

  // ── 7. 평면 → 위경도 복원 ────────────────────────────────────
  const latlngs = ring.map(xyToLatlng);

  // ── 8. GeoJSON Polygon 생성 ──────────────────────────────────
  const polygon = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [...latlngs.map(p => [p.lng, p.lat]),
         [latlngs[0].lng, latlngs[0].lat]],  // 닫기
      ],
    },
  };

  // ── 9. Leaflet 레이어 생성 ───────────────────────────────────
  const layer = L.polygon(
    latlngs.map(p => [p.lat, p.lng]),
    {
      color:       '#00d4ff',
      fillColor:   '#00d4ff',
      fillOpacity: 0.18,
      weight:      2,
    }
  );

  return { polygon, layer };
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────

/**
 * 원 중심 기준 반원 호 포인트 배열 생성
 * @param {{ x, y }} center     원 중심 (평면 km)
 * @param {number}   radius     반경 (km)
 * @param {number}   startAngle 시작 각도 (라디안) — 오른쪽 or 왼쪽 접점 각도
 * @param {boolean}  cw         true = 시계방향 (start 캡), false = 반시계 (end 캡)
 * @param {number}   segments   분할 수
 * @returns {{ x, y }[]}
 */
function buildSemiArc(center, radius, startAngle, cw, segments) {
  const points = [];
  for (let i = 1; i < segments; i++) {       // 양 끝 꼭짓점은 ring이 포함하므로 제외
    const t     = i / segments;
    const delta = cw ? -Math.PI * t : Math.PI * t;
    const angle = startAngle + delta;
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }
  return points;
}

/**
 * 시작점이 끝점과 같을 때 원형 Polygon 반환 (엣지케이스)
 * @param {{ lat, lng }} center
 * @param {number}       radiusKm
 * @returns {{ polygon, layer }}
 */
function buildCirclePolygon(center, radiusKm) {
  const c = latlngToXY(center);
  const pts = [];
  const SEG = 48;
  for (let i = 0; i < SEG; i++) {
    const a = (2 * Math.PI * i) / SEG;
    pts.push(xyToLatlng({ x: c.x + radiusKm * Math.cos(a), y: c.y + radiusKm * Math.sin(a) }));
  }
  const polygon = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[...pts.map(p => [p.lng, p.lat]), [pts[0].lng, pts[0].lat]]],
    },
  };
  const layer = L.polygon(pts.map(p => [p.lat, p.lng]), {
    color: '#00d4ff', fillColor: '#00d4ff', fillOpacity: 0.18, weight: 2,
  });
  return { polygon, layer };
}

// ── 좌표 변환 유틸 ───────────────────────────────────────────────

/**
 * 위경도 → 평면 좌표 (km)
 * 기준점: 서울 중심 (37.5665, 126.9780)
 * Equirectangular 근사 — 수도권 범위(수십 km)에서 오차 < 0.1%
 *
 * @param {{ lat: number, lng: number }} pos
 * @returns {{ x: number, y: number }}
 */
function latlngToXY(pos) {
  const refLat = 37.5665;
  const refLng = 126.9780;
  const latRad = (refLat * Math.PI) / 180;
  return {
    x: (pos.lng - refLng) * EARTH_R_KM * (Math.PI / 180) * Math.cos(latRad),
    y: (pos.lat - refLat) * EARTH_R_KM * (Math.PI / 180),
  };
}

/**
 * 평면 좌표 (km) → 위경도
 * @param {{ x: number, y: number }} pt
 * @returns {{ lat: number, lng: number }}
 */
function xyToLatlng(pt) {
  const refLat = 37.5665;
  const refLng = 126.9780;
  const latRad = (refLat * Math.PI) / 180;
  return {
    lat: pt.y / (EARTH_R_KM * Math.PI / 180) + refLat,
    lng: pt.x / (EARTH_R_KM * (Math.PI / 180) * Math.cos(latRad)) + refLng,
  };
}
