import * as turf from "@turf/turf";

export function createLinePolygon(start, end, widthKm = 0.1) {
  if (!start || !end) return null;

  const line = turf.lineString([
    [start.lng, start.lat],
    [end.lng, end.lat],
  ]);

  let polygon = turf.buffer(line, widthKm, {
    units: "kilometers",
    steps: 16,
  });

  // 🔥 안정화
  polygon = turf.rewind(polygon, { reverse: false });

  const fixed = turf.unkinkPolygon(polygon);

  // 멀티폴리곤이면 첫번째만 사용
  if (fixed.features.length > 0) {
    polygon = fixed.features[0];
  }

  return polygon;
}