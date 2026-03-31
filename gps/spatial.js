/**
 * spatial.js — 공간 교차(intersect) 연산 모듈
 * ✅ 외부 호출 금지. index.js에서만 사용
 *
 * 공개 함수:
 *   intersectPolygon(shapePolygon, dongPolygons)
 *     → string[]  — 교차하는 동 이름 배열
 *
 * 입력:
 *   shapePolygon  : GeoJSON Polygon  — drawLine/drawFan이 생성한 도형
 *   dongPolygons  : { name, geo }[]  — 현재 활성화된 동 polygon 목록
 *                                      (기존 시스템에서 index.js가 추출 후 주입)
 *
 * 출력:
 *   교차하는 동 이름 배열 (중복 없음)
 *
 * 알고리즘:
 *   Sutherland-Hodgman 또는 점 포함 판정 (separating axis)
 *   외부 라이브러리 없이 순수 구현
 */

// ── 공개 함수 ────────────────────────────────────────────────────

/**
 * 하나의 도형 polygon과 동 polygon 목록의 교차 여부를 판정한다.
 *
 * 알고리즘 (3단계 순차 필터 — 빠른 것부터):
 *
 *   1단계) AABB (Axis-Aligned Bounding Box) 검사
 *          → 바운딩 박스조차 겹치지 않으면 즉시 제외
 *          → O(1), 대부분 여기서 탈락
 *
 *   2단계) 꼭짓점 포함 검사 (Point-in-Polygon, Ray Casting)
 *          → 어느 한쪽 polygon의 꼭짓점이 다른 polygon 안에 있으면 교차
 *          → O(n), AABB 통과한 후보만 검사
 *
 *   3단계) 변(edge) 교차 검사 (Segment Intersection)
 *          → 두 polygon의 변이 실제로 교차하는지 확인
 *          → O(n*m), 2단계도 통과한 경우만 (얇고 긴 도형 대응)
 *
 * @param {object}              shapePolygon   GeoJSON Feature(Polygon)
 * @param {{ name, geo }[]}     dongPolygons   동 목록
 *   geo : GeoJSON Feature(Polygon) 또는 GeoJSON Geometry(Polygon)
 * @returns {string[]}  교차하는 동 이름 배열 (중복 없음)
 */
function intersectPolygon(shapePolygon, dongPolygons) {
  if (!shapePolygon || !dongPolygons?.length) return [];

  // shape의 ring 추출 (좌표 배열: [[lng,lat], ...])
  const shapeRing = _extractRing(shapePolygon);
  if (!shapeRing) return [];

  const shapeBB = _boundingBox(shapeRing);
  const result  = [];

  for (const dong of dongPolygons) {
    if (!dong?.name || !dong?.geo) continue;

    const dongRing = _extractRing(dong.geo);
    if (!dongRing) continue;

    // ── 1단계: AABB ──────────────────────────────────────────
    const dongBB = _boundingBox(dongRing);
    if (!_bbOverlap(shapeBB, dongBB)) continue;

    // ── 2단계: 꼭짓점 포함 ───────────────────────────────────
    if (_anyPointInside(shapeRing, dongRing) ||
        _anyPointInside(dongRing, shapeRing)) {
      result.push(dong.name);
      continue;
    }

    // ── 3단계: 변 교차 ───────────────────────────────────────
    if (_edgesIntersect(shapeRing, dongRing)) {
      result.push(dong.name);
    }
  }

  return result;
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────

/**
 * GeoJSON Feature(Polygon) 또는 Geometry(Polygon) 에서
 * 외곽 ring 좌표 배열 [[lng,lat], ...] 을 추출
 * @param {object} geo
 * @returns {number[][] | null}
 */
function _extractRing(geo) {
  try {
    // Feature 감싸기 처리
    const geom = geo.type === 'Feature' ? geo.geometry : geo;
    if (geom?.type !== 'Polygon') return null;
    return geom.coordinates[0];  // 외곽 ring만 사용 (구멍 무시)
  } catch {
    return null;
  }
}

/**
 * ring의 AABB (Axis-Aligned Bounding Box) 계산
 * @param {number[][]} ring  [[lng,lat], ...]
 * @returns {{ minX, maxX, minY, maxY }}
 */
function _boundingBox(ring) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * 두 AABB가 겹치는지 판정
 * @param {{ minX, maxX, minY, maxY }} a
 * @param {{ minX, maxX, minY, maxY }} b
 * @returns {boolean}
 */
function _bbOverlap(a, b) {
  return a.maxX >= b.minX && b.maxX >= a.minX &&
         a.maxY >= b.minY && b.maxY >= a.minY;
}

/**
 * ring A의 꼭짓점 중 하나라도 ring B 안에 있는지 판정
 * Ray Casting 알고리즘 사용
 * @param {number[][]} ringA  검사할 점들의 ring
 * @param {number[][]} ringB  포함 여부를 판단할 polygon ring
 * @returns {boolean}
 */
function _anyPointInside(ringA, ringB) {
  // 모든 꼭짓점을 검사하면 느리므로 샘플링 (최대 8포인트)
  const step = Math.max(1, Math.floor(ringA.length / 8));
  for (let i = 0; i < ringA.length; i += step) {
    if (_pointInRing(ringA[i], ringB)) return true;
  }
  return false;
}

/**
 * 점 [px, py] 가 ring 안에 있는지 Ray Casting으로 판정
 * @param {number[]} point  [x, y]
 * @param {number[][]} ring [[x,y], ...]
 * @returns {boolean}
 */
function _pointInRing(point, ring) {
  const [px, py] = point;
  let inside = false;
  const n = ring.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    // 수평 ray가 변 [j→i]를 지나는지 판정
    if (((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * 두 ring의 변(edge)이 하나라도 교차하는지 판정
 * (꼭짓점 포함 검사를 통과한 얇고 긴 도형 처리용)
 * @param {number[][]} ringA
 * @param {number[][]} ringB
 * @returns {boolean}
 */
function _edgesIntersect(ringA, ringB) {
  const nA = ringA.length;
  const nB = ringB.length;

  // 변 수가 많으면 샘플링 (성능 한계: O(nA * nB))
  const stepA = Math.max(1, Math.floor(nA / 20));
  const stepB = Math.max(1, Math.floor(nB / 20));

  for (let i = 0; i < nA - 1; i += stepA) {
    const a1 = ringA[i];
    const a2 = ringA[i + 1];
    for (let j = 0; j < nB - 1; j += stepB) {
      if (_segmentsIntersect(a1, a2, ringB[j], ringB[j + 1])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 두 선분 (p1→p2), (p3→p4) 의 교차 여부 판정
 * CCW(Counter-Clockwise) 방향 판정 기반
 * @param {number[]} p1
 * @param {number[]} p2
 * @param {number[]} p3
 * @param {number[]} p4
 * @returns {boolean}
 */
function _segmentsIntersect(p1, p2, p3, p4) {
  const d1 = _cross(p3, p4, p1);
  const d2 = _cross(p3, p4, p2);
  const d3 = _cross(p1, p2, p3);
  const d4 = _cross(p1, p2, p4);

  if (((_sign(d1) !== _sign(d2)) && (_sign(d3) !== _sign(d4)))) {
    return true;
  }

  // 공선(collinear) 엣지 케이스
  if (d1 === 0 && _onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && _onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && _onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && _onSegment(p1, p2, p4)) return true;

  return false;
}

/**
 * 외적(cross product)으로 방향 판정
 * > 0 : 반시계,  < 0 : 시계,  = 0 : 공선
 * @param {number[]} o 기준점
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function _cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) -
         (a[1] - o[1]) * (b[0] - o[0]);
}

/** 숫자의 부호 반환 */
function _sign(n) {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/**
 * 점 p가 선분 [a→b] 위에 있는지 판정 (공선 보조)
 * @param {number[]} a
 * @param {number[]} b
 * @param {number[]} p
 * @returns {boolean}
 */
function _onSegment(a, b, p) {
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) &&
         Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
}
