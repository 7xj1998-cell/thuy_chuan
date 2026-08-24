import { numberOf, uid, uppercaseName } from './calc';

export const STORAGE_KEYS = {
  books: 'so-thuy-chuan.books.v2',
  draft: 'so-thuy-chuan.active-draft.v2',
  legacy: 'so-thuy-chuan.books.v1',
  exports: 'so-thuy-chuan.export-names.v2'
};

export const createBenchmark = (name = '', elevation = '') => ({ id: uid(), name: uppercaseName(name).trim(), elevation: String(elevation ?? '') });
export const createStation = (point = '') => ({ id: uid(), point: uppercaseName(point).trim(), bs: '', fs: '', distance: '', bsUpper: '', bsMiddle: '', bsLower: '', fsUpper: '', fsMiddle: '', fsLower: '' });
export const createRun = (index = 1, startPoint = '') => ({ id: uid(), name: `Lượt ${index}`, startPoint: uppercaseName(startPoint).trim(), mode: 'single', stations: [createStation()] });
export const createBook = () => ({ schemaVersion: 2, id: uid(), name: `Sổ ${new Date().toLocaleDateString('vi-VN')}`, benchmarks: [createBenchmark('DG3', '2222'), createBenchmark('DG4', '1641')], runs: [createRun(1, 'DG3'), createRun(2, 'DG4')], settings: { toleranceCoefficient: '20' }, createdAt: Date.now(), updatedAt: Date.now() });

export function normalizeBook(raw = {}) {
  const base = createBook();
  const book = {
    ...base, ...raw, schemaVersion: 2, id: raw.id || uid(),
    benchmarks: (raw.benchmarks || []).map((b) => ({ ...createBenchmark(), ...b, id: b.id || uid(), name: uppercaseName(b.name).trim(), elevation: String(b.elevation ?? '') })),
    runs: (raw.runs || []).map((run, index) => ({ ...createRun(index + 1), ...run, id: run.id || uid(), startPoint: uppercaseName(run.startPoint).trim(), mode: run.mode === 'three' ? 'three' : 'single', stations: (run.stations || []).map((s) => ({ ...createStation(), ...s, id: s.id || uid(), point: uppercaseName(s.point).trim() })) })),
    settings: { ...base.settings, ...(raw.settings || {}) }, createdAt: raw.createdAt || Date.now(), updatedAt: raw.updatedAt || Date.now()
  };
  if (!book.runs.length) book.runs = [createRun(1, book.benchmarks[0]?.name || '')];
  book.runs.forEach((run) => { if (!run.stations.length) run.stations = [createStation()]; });
  return book;
}

export function migrateLegacyBook(legacy) {
  const benchmarks = [];
  if (uppercaseName(legacy.startName).trim() && numberOf(legacy.startElevation) !== null) benchmarks.push(createBenchmark(legacy.startName, legacy.startElevation));
  return normalizeBook({ id: legacy.id || uid(), name: legacy.name || 'Sổ chuyển đổi', benchmarks, runs: [
    { ...createRun(1, legacy.startName), stations: (legacy.outward || []).map((s) => ({ ...createStation(), ...s, id: uid(), point: uppercaseName(s.point).trim() })) },
    { ...createRun(2, legacy.endName), stations: (legacy.returning || []).map((s) => ({ ...createStation(), ...s, id: uid(), point: uppercaseName(s.point).trim() })) }
  ], settings: { toleranceCoefficient: String(legacy.toleranceCoefficient ?? 20) } });
}

export const staffDistance = (upper, lower) => numberOf(upper) === null || numberOf(lower) === null ? null : Math.abs(numberOf(upper) - numberOf(lower)) / 10;
export const middleError = (upper, middle, lower) => [upper, middle, lower].some((v) => numberOf(v) === null) ? null : numberOf(middle) - (numberOf(upper) + numberOf(lower)) / 2;

export function stationReadings(station, mode) {
  if (mode === 'three') {
    const bs = numberOf(station.bsMiddle), fs = numberOf(station.fsMiddle);
    const db = staffDistance(station.bsUpper, station.bsLower), df = staffDistance(station.fsUpper, station.fsLower);
    return { bs, fs, db, df, distance: db !== null && df !== null ? db + df : null, distanceDifference: db !== null && df !== null ? db - df : null, bsMiddleError: middleError(station.bsUpper, station.bsMiddle, station.bsLower), fsMiddleError: middleError(station.fsUpper, station.fsMiddle, station.fsLower) };
  }
  return { bs: numberOf(station.bs), fs: numberOf(station.fs), db: null, df: null, distance: numberOf(station.distance), distanceDifference: null, bsMiddleError: null, fsMiddleError: null };
}

export function solveRun(run, benchmarks) {
  const pointNames = [uppercaseName(run.startPoint).trim(), ...run.stations.map((s) => uppercaseName(s.point).trim())];
  const relatives = [0], readingRows = [];
  let complete = true;
  run.stations.forEach((station, index) => {
    const reading = stationReadings(station, run.mode);
    const delta = reading.bs !== null && reading.fs !== null ? reading.bs - reading.fs : null;
    if (!complete || delta === null) { relatives.push(null); complete = false; } else relatives.push(relatives[index] + delta);
    readingRows.push({ ...reading, delta });
  });
  const known = new Map();
  benchmarks.forEach((b) => { const name = uppercaseName(b.name).trim(), elevation = numberOf(b.elevation); if (name && elevation !== null) known.set(name, elevation); });
  const anchors = [];
  pointNames.forEach((name, index) => { if (name && known.has(name) && relatives[index] !== null) anchors.push({ index, name, known: known.get(name), relative: relatives[index] }); });
  const primary = anchors[0] || null;
  const offset = primary ? primary.known - primary.relative : null;
  const elevations = relatives.map((relative) => relative === null || offset === null ? null : relative + offset);
  const checks = anchors.map((anchor) => ({ ...anchor, measured: elevations[anchor.index], difference: elevations[anchor.index] - anchor.known }));
  const rows = run.stations.map((station, index) => ({ ...station, ...readingRows[index], index, fromName: pointNames[index], point: pointNames[index + 1], fromElevation: elevations[index], elevation: elevations[index + 1], hi: elevations[index] !== null && readingRows[index].bs !== null ? elevations[index] + readingRows[index].bs : null }));
  const fullDistance = rows.length > 0 && rows.every((row) => row.distance !== null && row.distance > 0);
  return { runId: run.id, runName: run.name, points: pointNames.map((name, index) => ({ name, elevation: elevations[index], index })), rows, anchors, checks, solved: offset !== null, totalDistance: fullDistance ? rows.reduce((sum, row) => sum + row.distance, 0) : null, partialDistance: rows.reduce((sum, row) => sum + (row.distance || 0), 0), sumDistanceDifference: rows.reduce((sum, row) => sum + (row.distanceDifference || 0), 0), fullDistance };
}

export function compareRuns(solvedRuns) {
  const groups = new Map();
  solvedRuns.forEach((run) => run.points.filter((p) => p.name && p.elevation !== null && /^(DG|DC)/i.test(p.name)).forEach((point) => { if (!groups.has(point.name)) groups.set(point.name, []); groups.get(point.name).push({ runId: run.runId, runName: run.runName, elevation: point.elevation }); }));
  return [...groups.entries()].map(([name, values]) => { const elevations = values.map((v) => v.elevation); return { name, values, min: Math.min(...elevations), max: Math.max(...elevations), spread: Math.max(...elevations) - Math.min(...elevations) }; }).filter((group) => group.values.length >= 2).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function adjustSolvedRun(solved, coefficient = 20) {
  if (solved.checks.length < 2 || !solved.rows.length) return { available: false, segments: [] };
  const closure = solved.checks.at(-1).difference;
  const weights = solved.fullDistance ? solved.rows.map((row) => row.distance) : solved.rows.map(() => 1);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let cumulative = 0;
  const segments = solved.rows.map((row, index) => { const correction = -closure * weights[index] / totalWeight; cumulative += correction; return { ...row, correction, adjustedDelta: row.delta + correction, cumulativeCorrection: cumulative, adjustedElevation: row.elevation === null ? null : row.elevation + cumulative }; });
  const km = solved.fullDistance ? solved.totalDistance / 1000 : null;
  const allowable = km !== null && numberOf(coefficient) !== null ? numberOf(coefficient) * Math.sqrt(km) : null;
  return { available: true, closure, method: solved.fullDistance ? 'Theo chiều dài' : 'Theo số trạm', allowable, passed: allowable === null ? null : Math.abs(closure) <= allowable, segments };
}

export function removeStation(run, index) {
  if (run.stations.length <= 1) return { removed: null, stations: run.stations };
  const stations = [...run.stations], [removed] = stations.splice(index, 1);
  return { removed: { station: structuredClone(removed), index }, stations };
}
export function restoreStation(stations, undo) { const next = [...stations]; next.splice(Math.min(undo.index, next.length), 0, structuredClone(undo.station)); return next; }
export function saveAsCopy(book, name) { return normalizeBook({ ...structuredClone(book), id: uid(), name: name.trim(), createdAt: Date.now(), updatedAt: Date.now() }); }
