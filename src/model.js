import { numberOf, uid, uppercaseName } from './calc';
import { metersToMillimeters, migrateMillimeterInput, READING_FIELDS } from './units';

export const STORAGE_KEYS = {
  books: 'so-thuy-chuan.books.v2',
  draft: 'so-thuy-chuan.active-draft.v2',
  legacy: 'so-thuy-chuan.books.v1',
  exports: 'so-thuy-chuan.export-names.v2'
};

export const createBenchmark = (name = '', elevation = '') => ({ id: uid(), name: uppercaseName(name).trim(), elevation: String(elevation ?? '') });
export const createStation = (point = '') => ({ id: uid(), point: uppercaseName(point).trim(), bs: '', fs: '', distance: '', bsUpper: '', bsMiddle: '', bsLower: '', fsUpper: '', fsMiddle: '', fsLower: '' });
export const createRun = (index = 1, startPoint = '') => ({ id: uid(), name: `Lượt ${index}`, startPoint: uppercaseName(startPoint).trim(), mode: 'single', stations: [createStation()] });
export const createBook = () => ({ schemaVersion: 3, id: uid(), name: `Sổ ${new Date().toLocaleDateString('vi-VN')}`, benchmarks: [createBenchmark('DG3', '2.222'), createBenchmark('DG4', '1.641')], runs: [createRun(1, 'DG3'), createRun(2, 'DG4')], settings: { toleranceCoefficient: '20' }, createdAt: Date.now(), updatedAt: Date.now() });

function migrateStoredBook(raw = {}) {
  if (Number(raw.schemaVersion) >= 3) return raw;
  return {
    ...raw,
    schemaVersion: 3,
    benchmarks: (raw.benchmarks || []).map((benchmark) => ({
      ...benchmark,
      elevation: migrateMillimeterInput(benchmark.elevation),
    })),
    runs: (raw.runs || []).map((run) => ({
      ...run,
      stations: (run.stations || []).map((station) => READING_FIELDS.reduce(
        (next, field) => ({ ...next, [field]: migrateMillimeterInput(station[field]) }),
        { ...station },
      )),
    })),
  };
}

export function normalizeBook(raw = {}) {
  const source = migrateStoredBook(raw);
  const base = createBook();
  const book = {
    ...base, ...source, schemaVersion: 3, id: source.id || uid(),
    benchmarks: (source.benchmarks || []).map((b) => ({ ...createBenchmark(), ...b, id: b.id || uid(), name: uppercaseName(b.name).trim(), elevation: String(b.elevation ?? '') })),
    runs: (source.runs || []).map((run, index) => ({ ...createRun(index + 1), ...run, id: run.id || uid(), startPoint: uppercaseName(run.startPoint).trim(), mode: run.mode === 'three' ? 'three' : 'single', stations: (run.stations || []).map((s) => ({ ...createStation(), ...s, id: s.id || uid(), point: uppercaseName(s.point).trim() })) })),
    settings: { ...base.settings, ...(source.settings || {}) }, createdAt: source.createdAt || Date.now(), updatedAt: source.updatedAt || Date.now()
  };
  if (!book.runs.length) book.runs = [createRun(1, book.benchmarks[0]?.name || '')];
  book.runs.forEach((run) => { if (!run.stations.length) run.stations = [createStation()]; });
  return book;
}

export function migrateLegacyBook(legacy) {
  const benchmarks = [];
  if (uppercaseName(legacy.startName).trim() && numberOf(legacy.startElevation) !== null) benchmarks.push(createBenchmark(legacy.startName, legacy.startElevation));
  return normalizeBook({ schemaVersion: 2, id: legacy.id || uid(), name: legacy.name || 'Sổ chuyển đổi', benchmarks, runs: [
    { ...createRun(1, legacy.startName), stations: (legacy.outward || []).map((s) => ({ ...createStation(), ...s, id: uid(), point: uppercaseName(s.point).trim() })) },
    { ...createRun(2, legacy.endName), stations: (legacy.returning || []).map((s) => ({ ...createStation(), ...s, id: uid(), point: uppercaseName(s.point).trim() })) }
  ], settings: { toleranceCoefficient: String(legacy.toleranceCoefficient ?? 20) } });
}

export const staffDistance = (upper, lower) => metersToMillimeters(upper) === null || metersToMillimeters(lower) === null ? null : Math.abs(metersToMillimeters(upper) - metersToMillimeters(lower)) / 10;
export const middleError = (upper, middle, lower) => [upper, middle, lower].some((v) => metersToMillimeters(v) === null) ? null : metersToMillimeters(middle) - (metersToMillimeters(upper) + metersToMillimeters(lower)) / 2;

export function stationReadings(station, mode) {
  if (mode === 'three') {
    const bs = metersToMillimeters(station.bsMiddle), fs = metersToMillimeters(station.fsMiddle);
    const db = staffDistance(station.bsUpper, station.bsLower), df = staffDistance(station.fsUpper, station.fsLower);
    return { bs, fs, db, df, distance: db !== null && df !== null ? db + df : null, distanceDifference: db !== null && df !== null ? db - df : null, bsMiddleError: middleError(station.bsUpper, station.bsMiddle, station.bsLower), fsMiddleError: middleError(station.fsUpper, station.fsMiddle, station.fsLower) };
  }
  return { bs: metersToMillimeters(station.bs), fs: metersToMillimeters(station.fs), db: null, df: null, distance: numberOf(station.distance), distanceDifference: null, bsMiddleError: null, fsMiddleError: null };
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
  benchmarks.forEach((b) => { const name = uppercaseName(b.name).trim(), elevation = metersToMillimeters(b.elevation); if (name && elevation !== null) known.set(name, elevation); });
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

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let item = column; item <= size; item += 1) augmented[column][item] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item <= size; item += 1) augmented[row][item] -= factor * augmented[column][item];
    }
  }
  return augmented.map((row) => row[size]);
}

export function adjustLevelingNetwork(solvedRuns, benchmarks, coefficient = 20) {
  const fixed = new Map();
  benchmarks.forEach((benchmark) => {
    const name = uppercaseName(benchmark.name).trim(), elevation = metersToMillimeters(benchmark.elevation);
    if (name && elevation !== null) fixed.set(name, elevation);
  });

  const observations = [];
  solvedRuns.forEach((run) => run.rows.forEach((row) => {
    if (!row.fromName || !row.point || row.delta === null) return;
    observations.push({ ...row, runId: run.runId, runName: run.runName, measuredDelta: row.delta });
  }));
  if (!observations.length || !fixed.size) return { available: false, reason: !fixed.size ? 'Chưa có mốc cao độ chuẩn.' : 'Chưa có trị đo hoàn chỉnh.', points: [], segments: [] };

  const adjacency = new Map();
  const connect = (from, to) => { if (!adjacency.has(from)) adjacency.set(from, new Set()); adjacency.get(from).add(to); };
  observations.forEach((row) => { connect(row.fromName, row.point); connect(row.point, row.fromName); });
  const anchored = new Set(), queue = [...fixed.keys()].filter((name) => adjacency.has(name));
  queue.forEach((name) => anchored.add(name));
  while (queue.length) {
    const name = queue.shift();
    adjacency.get(name)?.forEach((next) => { if (!anchored.has(next)) { anchored.add(next); queue.push(next); } });
  }
  const usable = observations.filter((row) => anchored.has(row.fromName) && anchored.has(row.point));
  const ignored = observations.length - usable.length;
  if (!usable.length) return { available: false, reason: 'Các trị đo chưa nối với mốc cao độ chuẩn.', points: [], segments: [], ignored };

  const pointOrder = [];
  usable.forEach((row) => [row.fromName, row.point].forEach((name) => { if (!pointOrder.includes(name)) pointOrder.push(name); }));
  const unknowns = pointOrder.filter((name) => !fixed.has(name));
  const unknownIndex = new Map(unknowns.map((name, index) => [name, index]));
  const useDistanceWeights = usable.every((row) => row.distance !== null && row.distance > 0);
  const normal = Array.from({ length: unknowns.length }, () => Array(unknowns.length).fill(0));
  const right = Array(unknowns.length).fill(0);

  usable.forEach((row) => {
    const coefficients = Array(unknowns.length).fill(0);
    if (unknownIndex.has(row.fromName)) coefficients[unknownIndex.get(row.fromName)] -= 1;
    if (unknownIndex.has(row.point)) coefficients[unknownIndex.get(row.point)] += 1;
    const fixedPart = (fixed.get(row.point) || 0) - (fixed.get(row.fromName) || 0);
    const reducedObservation = row.measuredDelta - fixedPart;
    const weight = useDistanceWeights ? 1 / (row.distance / 1000) : 1;
    for (let i = 0; i < unknowns.length; i += 1) {
      right[i] += weight * coefficients[i] * reducedObservation;
      for (let j = 0; j < unknowns.length; j += 1) normal[i][j] += weight * coefficients[i] * coefficients[j];
    }
  });

  const solution = unknowns.length ? solveLinearSystem(normal, right) : [];
  if (solution === null) return { available: false, reason: 'Mạng chưa đủ điều kiện định vị cao độ.', points: [], segments: [], ignored };
  const elevations = new Map(fixed);
  unknowns.forEach((name, index) => elevations.set(name, solution[index]));
  let weightedResidualSum = 0;
  const segments = usable.map((row) => {
    const adjustedDelta = elevations.get(row.point) - elevations.get(row.fromName);
    const correction = adjustedDelta - row.measuredDelta;
    const weight = useDistanceWeights ? 1 / (row.distance / 1000) : 1;
    weightedResidualSum += weight * correction * correction;
    return { ...row, correction, adjustedDelta, adjustedFromElevation: elevations.get(row.fromName), adjustedElevation: elevations.get(row.point) };
  });
  const degreesOfFreedom = usable.length - unknowns.length;
  const sigma0 = degreesOfFreedom > 0 ? Math.sqrt(weightedResidualSum / degreesOfFreedom) : null;
  const totalDistance = useDistanceWeights ? usable.reduce((sum, row) => sum + row.distance, 0) : null;
  const allowable = totalDistance !== null && numberOf(coefficient) !== null ? numberOf(coefficient) * Math.sqrt(totalDistance / 1000) : null;
  const points = pointOrder.map((name) => ({ name, elevation: elevations.get(name), fixed: fixed.has(name), observationCount: usable.filter((row) => row.fromName === name || row.point === name).length }));
  return {
    available: true,
    method: useDistanceWeights ? 'Bình sai gián tiếp, trọng số nghịch đảo chiều dài' : 'Bình sai gián tiếp, đồng trọng số',
    points, segments, observations: usable.length, unknowns: unknowns.length, degreesOfFreedom, sigma0,
    maxCorrection: Math.max(...segments.map((row) => Math.abs(row.correction))), totalDistance, allowable, ignored
  };
}

export function removeStation(run, index) {
  if (run.stations.length <= 1) return { removed: null, stations: run.stations };
  const stations = [...run.stations], [removed] = stations.splice(index, 1);
  return { removed: { station: structuredClone(removed), index }, stations };
}
export function restoreStation(stations, undo) { const next = [...stations]; next.splice(Math.min(undo.index, next.length), 0, structuredClone(undo.station)); return next; }
export function saveAsCopy(book, name) { return normalizeBook({ ...structuredClone(book), id: uid(), name: name.trim(), createdAt: Date.now(), updatedAt: Date.now() }); }
