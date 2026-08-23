export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export const uppercaseName = (value) => String(value ?? '').toLocaleUpperCase('vi-VN');

export const station = (point = '') => ({ id: uid(), bs: '', fs: '', point });

export function numberOf(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateRoute(startName, startElevation, rows) {
  let name = startName.trim();
  let elevation = numberOf(startElevation);
  return rows.map((row) => {
    const bs = numberOf(row.bs);
    const fs = numberOf(row.fs);
    const hi = elevation !== null && bs !== null ? elevation + bs : null;
    const delta = bs !== null && fs !== null ? bs - fs : null;
    const nextElevation = hi !== null && fs !== null ? hi - fs : null;
    const result = { ...row, fromName: name, fromElevation: elevation, bs, fs, hi, delta, elevation: nextElevation };
    name = row.point.trim();
    elevation = nextElevation;
    return result;
  });
}

export function checkpoints(route) {
  const values = new Map();
  for (const row of route) {
    if (/^(DG|DC)/i.test(row.point.trim()) && row.elevation !== null) {
      values.set(row.point.trim().toUpperCase(), row.elevation);
    }
  }
  return values;
}

export function compareRoutes(outward, returning) {
  const a = checkpoints(outward);
  const b = checkpoints(returning);
  return [...a.entries()]
    .filter(([name]) => b.has(name))
    .map(([name, first]) => ({ name, first, second: b.get(name), difference: b.get(name) - first }));
}

export function listRoutePoints(direction, startName, startElevation, route) {
  const classify = (name) => /^(TP|TV)/i.test(name.trim()) ? 'Điểm trung gian' : 'Mốc DG/DC';
  return [
    { direction, order: 0, type: classify(startName), name: startName, elevation: numberOf(startElevation) },
    ...route.map((row, index) => ({
      direction,
      order: index + 1,
      type: classify(row.point),
      name: row.point,
      elevation: row.elevation
    }))
  ];
}

export const format = (value, digits = 3) => value === null || !Number.isFinite(value)
  ? '—'
  : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(value);
