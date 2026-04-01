import * as turf from "@turf/turf";

export function createFanPolygon(start, end, r1 = 0.05, r2 = 0.3, angleDeg = 60) {
  if (!start || !end) return null;

  const center = [start.lng, start.lat];
  const target = [end.lng, end.lat];

  // 🔥 방향 각도 계산
  const bearing = turf.bearing(center, target);

  const left = bearing - angleDeg / 2;
  const right = bearing + angleDeg / 2;

  const points = [];

  const steps = 30;

  // 🔵 outer arc (큰 원)
  for (let i = 0; i <= steps; i++) {
    const angle = left + (i / steps) * (right - left);

    const pt = turf.destination(center, r2, angle, {
      units: "kilometers",
    });

    points.push(pt.geometry.coordinates);
  }

  // 🔵 inner arc (작은 원, 반대로)
  for (let i = steps; i >= 0; i--) {
    const angle = left + (i / steps) * (right - left);

    const pt = turf.destination(center, r1, angle, {
      units: "kilometers",
    });

    points.push(pt.geometry.coordinates);
  }

  // polygon 닫기
  points.push(points[0]);

  let polygon = turf.polygon([points]);

  // 🔥 안정화
  polygon = turf.rewind(polygon, { reverse: false });

  const fixed = turf.unkinkPolygon(polygon);
  if (fixed.features.length > 0) {
    polygon = fixed.features[0];
  }

  return polygon;
}