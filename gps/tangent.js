/**
 * tangent.js — 외접선(탄젠트) 계산 모듈
 * ✅ 외부 호출 금지. index.js에서만 사용
 *
 * 공개 함수:
 *   calcExternalTangents(c1, r1, c2, r2)
 *     → { left, right } | null
 *
 * 입력:
 *   c1 : { x, y }  — 시작 원 중심 (평면 좌표, km 단위)
 *   r1 : number    — 시작 원 반경 (km)
 *   c2 : { x, y }  — 끝 원 중심
 *   r2 : number    — 끝 원 반경 (km, r2 > r1)
 *
 * 출력:
 *   null이면 distance ≤ |r2 - r1| → 생성 불가
 *   아니면:
 *     left  : { t1: {x,y}, t2: {x,y} }  — 왼쪽 접선 (c1 접점, c2 접점)
 *     right : { t1: {x,y}, t2: {x,y} }  — 오른쪽 접선
 *
 * 좌표계:
 *   위경도 → 평면 변환은 index.js가 처리 후 주입
 *   이 모듈은 순수 평면 수학만 담당
 */

// ── 공개 함수 ────────────────────────────────────────────────────

/**
 * 두 원의 외접선(external tangent) 2개를 계산한다.
 *
 * 원리:
 *   외접선은 두 원의 반경 차이(r2 - r1)를 이용해 구한다.
 *   두 원 중심을 잇는 선 위에 "상사점(external homothety center)" P를 구하고,
 *   P에서 각 원에 접하는 직선의 접점을 삼각함수로 계산한다.
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  P ──────────── c1(r1) ──────────── c2(r2)             │
 *   │  상사점         시작 원              끝 원               │
 *   │                                                         │
 *   │  상사점 P:  P = c1 - r1/(r2-r1) * (c2-c1) 방향으로     │
 *   │             c1에서 r1/(r2-r1) * d 만큼 바깥쪽           │
 *   └─────────────────────────────────────────────────────────┘
 *
 * @param {{ x: number, y: number }} c1  시작 원 중심 (평면 km)
 * @param {number}                   r1  시작 원 반경 (km)
 * @param {{ x: number, y: number }} c2  끝 원 중심   (평면 km)
 * @param {number}                   r2  끝 원 반경   (km, r2 > r1)
 * @returns {{
 *   left:  { t1: {x,y}, t2: {x,y} },
 *   right: { t1: {x,y}, t2: {x,y} }
 * } | null}
 *   t1 = c1 위의 접점, t2 = c2 위의 접점
 *   null = 생성 불가 (distance ≤ |r2 - r1|)
 */
function calcExternalTangents(c1, r1, c2, r2) {
  // ── 0. 사전 조건 검사 ────────────────────────────────────────
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d  = Math.sqrt(dx * dx + dy * dy);  // 두 원 중심 거리

  const rDiff = Math.abs(r2 - r1);

  // 한 원이 다른 원 안에 포함되면 외접선 없음
  if (d <= rDiff + 1e-9) {
    return null;
  }

  // ── 1. 두 원 중심을 잇는 방향 벡터 (단위) ───────────────────
  const ux = dx / d;  // unit vector c1 → c2
  const uy = dy / d;

  // ── 2. 외접선 접선 각도 계산 ────────────────────────────────
  //   외접선: sin(α) = (r2 - r1) / d
  //   α = 두 원 중심선과 접선이 이루는 각도
  const sinA = (r2 - r1) / d;
  const cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));  // max(0,...) = 수치 오차 방지

  // ── 3. 접점 계산 ─────────────────────────────────────────────
  //   c1 위 접점: 중심에서 반경 r1만큼, 접선 수직 방향으로
  //   c2 위 접점: 중심에서 반경 r2만큼, 같은 방향으로
  //
  //   접선 수직 방향 (법선 벡터) 2가지:
  //     right: ( cosA*ux + sinA*uy,  cosA*uy - sinA*ux )  →  회전 +α
  //     left:  ( cosA*ux - sinA*uy,  cosA*uy + sinA*ux )  →  회전 -α
  //
  //   각 원의 접점 = 원 중심 + r * 법선벡터

  // 오른쪽 외접선
  const nRx =  cosA * uy - sinA * ux;  // c1→c2 방향을 α만큼 오른쪽 회전한 법선
  const nRy = -cosA * ux - sinA * uy;

  const right = {
    t1: { x: c1.x + r1 * nRx, y: c1.y + r1 * nRy },   // c1 접점
    t2: { x: c2.x + r2 * nRx, y: c2.y + r2 * nRy },   // c2 접점
  };

  // 왼쪽 외접선 (법선 벡터 반전)
  const nLx = -nRx;
  const nLy = -nRy;

  const left = {
    t1: { x: c1.x + r1 * nLx, y: c1.y + r1 * nLy },   // c1 접점
    t2: { x: c2.x + r2 * nLx, y: c2.y + r2 * nLy },   // c2 접점
  };

  return { left, right };
}

// ── 내부 헬퍼 (drawFan.js에서 index.js 경유로 사용) ─────────────

/**
 * 원 위의 두 점 사이 호(arc)를 분할 포인트 배열로 반환
 *
 * @param {{ x: number, y: number }} center  원 중심
 * @param {number}                   radius  반경 (km)
 * @param {number}                   startAngle  시작 각도 (라디안)
 * @param {number}                   endAngle    끝 각도   (라디안)
 * @param {boolean}                  clockwise   시계 방향 여부
 * @param {number}                   [segments=40]  분할 수 (30~50 권장)
 * @returns {{ x: number, y: number }[]}
 */
function calcArcPoints(center, radius, startAngle, endAngle, clockwise, segments = 40) {
  const points = [];

  // 각도 범위 정규화: 항상 clockwise 방향으로 진행
  let sweep = clockwise
    ? (startAngle - endAngle + 2 * Math.PI) % (2 * Math.PI)
    : (endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI);

  if (sweep < 1e-9) sweep = 2 * Math.PI;  // 0이면 전체 원

  for (let i = 0; i <= segments; i++) {
    const t     = i / segments;
    const angle = clockwise
      ? startAngle - sweep * t
      : startAngle + sweep * t;

    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }

  return points;
}

/**
 * 접점의 각도를 원 중심 기준으로 계산 (라디안)
 * @param {{ x: number, y: number }} center
 * @param {{ x: number, y: number }} point
 * @returns {number}
 */
function calcAngle(center, point) {
  return Math.atan2(point.y - center.y, point.x - center.x);
}
