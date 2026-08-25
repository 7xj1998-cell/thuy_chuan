import { numberOf, uid, uppercaseName } from './calc';
import {
  canonicalBenchmarkElevationDraft,
  metersToMillimeters,
  migrateMillimeterInput,
  normalizeMeterInput,
  normalizeStaffInput,
  READING_FIELDS,
} from './units';
import {
  normalizePointType,
  POINT_TYPE_SIDE,
  POINT_TYPE_TURNING,
} from './pointNames';

export const STORAGE_KEYS = {
  books: 'so-thuy-chuan.books.v2',
  draft: 'so-thuy-chuan.active-draft.v2',
  legacy: 'so-thuy-chuan.books.v1',
  exports: 'so-thuy-chuan.export-names.v2'
};

export const createBenchmark = (name = '', elevation = '') => ({ id: uid(), name: uppercaseName(name).trim(), elevation: String(elevation ?? '') });
export const createStation = (point = '', pointType = POINT_TYPE_TURNING) => ({ id: uid(), point: uppercaseName(point).trim(), pointType: normalizePointType(pointType), bs: '', fs: '', distance: '', bsUpper: '', bsMiddle: '', bsLower: '', fsUpper: '', fsMiddle: '', fsLower: '' });
export const createRun = (index = 1, startPoint = '') => ({ id: uid(), name: `Lượt ${index}`, roundNumber: index, startPoint: uppercaseName(startPoint).trim(), mode: 'single', stations: [createStation()] });
export const createBook = () => ({ schemaVersion: 5, id: uid(), name: `Sổ ${new Date().toLocaleDateString('vi-VN')}`, benchmarks: [createBenchmark('DG3', '2,222'), createBenchmark('DG4', '1,641')], runs: [createRun(1, 'DG3'), createRun(2, 'DG4')], settings: { toleranceCoefficient: '20' }, createdAt: Date.now(), updatedAt: Date.now() });
export const nextRunNumber = (runs = []) => Math.max(0, ...runs.map((run) => {
  const value = Number(run.roundNumber);
  return Number.isInteger(value) && value > 0 ? value : 0;
})) + 1;

function migrateStoredBook(raw = {}) {
  let source = raw;
  if (Number(source.schemaVersion) < 3) {
    source = {
      ...source,
      schemaVersion: 3,
      benchmarks: (source.benchmarks || []).map((benchmark) => ({
        ...benchmark,
        elevation: migrateMillimeterInput(benchmark.elevation),
      })),
      runs: (source.runs || []).map((run) => ({
        ...run,
        stations: (run.stations || []).map((station) => READING_FIELDS.reduce(
          (next, field) => ({ ...next, [field]: migrateMillimeterInput(station[field]) }),
          { ...station },
        )),
      })),
    };
  }
  if (Number(source.schemaVersion) < 4) {
    source = {
      ...source,
      schemaVersion: 4,
      benchmarks: (source.benchmarks || []).map((benchmark) => ({
        ...benchmark,
        elevation: normalizeMeterInput(benchmark.elevation),
      })),
      runs: (source.runs || []).map((run) => ({
        ...run,
        stations: (run.stations || []).map((station) => ({
          ...READING_FIELDS.reduce(
            (next, field) => ({ ...next, [field]: normalizeStaffInput(station[field]) }),
            { ...station },
          ),
          distance: normalizeMeterInput(station.distance),
        })),
      })),
    };
  }
  if (Number(source.schemaVersion) < 5) {
    source = {
      ...source,
      schemaVersion: 5,
      runs: (source.runs || []).map((run, index) => ({
        ...run,
        roundNumber: index + 1,
        stations: (run.stations || []).map((station) => ({ ...station, pointType: POINT_TYPE_TURNING })),
      })),
    };
  }
  return source;
}

export function normalizeBook(raw = {}) {
  const source = migrateStoredBook(raw);
  const base = createBook();
  const book = {
    ...base, ...source, schemaVersion: 5, id: source.id || uid(),
    benchmarks: (source.benchmarks || []).map((b) => {
      const canonicalElevation = canonicalBenchmarkElevationDraft(b.elevation);
      return { ...createBenchmark(), ...b, id: b.id || uid(), name: uppercaseName(b.name).trim(), elevation: canonicalElevation === null ? String(b.elevation ?? '') : canonicalElevation };
    }),
    runs: (source.runs || []).map((run, index) => {
      const storedRoundNumber = Number(run.roundNumber);
      return { ...createRun(index + 1), ...run, id: run.id || uid(), roundNumber: Number.isInteger(storedRoundNumber) && storedRoundNumber > 0 ? storedRoundNumber : index + 1, startPoint: uppercaseName(run.startPoint).trim(), mode: run.mode === 'three' ? 'three' : 'single', stations: (run.stations || []).map((s) => ({ ...createStation(), ...s, id: s.id || uid(), point: uppercaseName(s.point).trim(), pointType: normalizePointType(s.pointType) })) };
    }),
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
  const startPoint = uppercaseName(run.startPoint).trim();
  const pointStates = [{ name: startPoint, relative: 0, index: 0, pointType: POINT_TYPE_TURNING }];
  const chainStates = [pointStates[0]];
  const readingRows = [];
  let origin = { name: startPoint, relative: 0 };

  run.stations.forEach((station, index) => {
    const reading = stationReadings(station, run.mode);
    const delta = reading.bs !== null && reading.fs !== null ? reading.bs - reading.fs : null;
    const point = uppercaseName(station.point).trim();
    const pointType = normalizePointType(station.pointType);
    const relative = origin.relative === null || delta === null ? null : origin.relative + delta;
    const state = { name: point, relative, index: index + 1, pointType };
    if (point) pointStates.push(state);
    readingRows.push({ ...station, ...reading, delta, point, pointType, fromName: origin.name, fromRelative: origin.relative, relative, index });
    if (pointType === POINT_TYPE_TURNING && point) {
      chainStates.push(state);
      origin = { name: point, relative };
    }
  });

  const known = new Map();
  benchmarks.forEach((b) => { const name = uppercaseName(b.name).trim(), elevation = metersToMillimeters(b.elevation); if (name && elevation !== null) known.set(name, elevation); });
  const anchors = [];
  chainStates.forEach((state) => { if (state.name && known.has(state.name) && state.relative !== null) anchors.push({ ...state, known: known.get(state.name) }); });
  const primary = anchors[0] || null;
  const offset = primary ? primary.known - primary.relative : null;
  const elevationOf = (relative) => relative === null || offset === null ? null : relative + offset;
  const rows = readingRows.map((row) => {
    const fromElevation = elevationOf(row.fromRelative);
    return { ...row, fromElevation, elevation: elevationOf(row.relative), hi: fromElevation !== null && row.bs !== null ? fromElevation + row.bs : null };
  });
  const points = pointStates.map((state) => ({ ...state, elevation: elevationOf(state.relative) }));
  const chainPoints = chainStates.map((state) => ({ ...state, elevation: elevationOf(state.relative) }));
  const chainRows = rows.filter((row) => row.pointType === POINT_TYPE_TURNING && row.point);
  const sideRows = rows.filter((row) => row.pointType === POINT_TYPE_SIDE && row.point);
  const checks = anchors.map((anchor) => {
    const measured = elevationOf(anchor.relative);
    return { ...anchor, measured, difference: measured - anchor.known };
  });
  const fullDistance = chainRows.length > 0 && chainRows.every((row) => row.distance !== null && row.distance > 0);
  return {
    runId: run.id,
    runName: run.name,
    points,
    chainPoints,
    rows,
    chainRows,
    sideRows,
    anchors,
    checks,
    solved: offset !== null,
    endPoint: origin.name,
    endElevation: elevationOf(origin.relative),
    totalDistance: fullDistance ? chainRows.reduce((sum, row) => sum + row.distance, 0) : null,
    partialDistance: chainRows.reduce((sum, row) => sum + (row.distance || 0), 0),
    sumDistanceDifference: chainRows.reduce((sum, row) => sum + (row.distanceDifference || 0), 0),
    fullDistance,
    turningCount: chainRows.length,
    sideCount: sideRows.length,
  };
}

export function compareRuns(solvedRuns) {
  const groups = new Map();
  solvedRuns.forEach((run) => {
    const seen = new Set();
    (run.chainPoints || run.points.filter((point) => point.pointType !== POINT_TYPE_SIDE))
      .filter((point) => point.name && point.elevation !== null)
      .forEach((point) => {
        if (seen.has(point.name)) return;
        seen.add(point.name);
        if (!groups.has(point.name)) groups.set(point.name, []);
        groups.get(point.name).push({ runId: run.runId, runName: run.runName, elevation: point.elevation });
      });
  });
  return [...groups.entries()].map(([name, values]) => { const elevations = values.map((v) => v.elevation); return { name, values, min: Math.min(...elevations), max: Math.max(...elevations), spread: Math.max(...elevations) - Math.min(...elevations) }; }).filter((group) => group.values.length >= 2).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function adjustSolvedRun(solved, coefficient = 20) {
  if (solved.checks.length < 2) return { available: false, segments: [] };
  const firstCheck = solved.checks[0];
  const lastCheck = solved.checks.at(-1);
  const rows = (solved.chainRows || solved.rows.filter((row) => row.pointType !== POINT_TYPE_SIDE))
    .filter((row) => row.delta !== null && row.index >= firstCheck.index && row.index < lastCheck.index);
  if (!rows.length) return { available: false, segments: [] };
  const closure = lastCheck.difference;
  const useDistanceWeights = rows.every((row) => row.distance !== null && row.distance > 0);
  const weights = useDistanceWeights ? rows.map((row) => row.distance) : rows.map(() => 1);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let cumulative = 0;
  const segments = rows.map((row, index) => { const correction = -closure * weights[index] / totalWeight; cumulative += correction; return { ...row, correction, adjustedDelta: row.delta + correction, cumulativeCorrection: cumulative, adjustedElevation: row.elevation === null ? null : row.elevation + cumulative }; });
  const km = useDistanceWeights ? totalWeight / 1000 : null;
  const allowable = km !== null && numberOf(coefficient) !== null ? numberOf(coefficient) * Math.sqrt(km) : null;
  return { available: true, closure, method: useDistanceWeights ? 'Theo chiều dài' : 'Theo số trạm', allowable, passed: allowable === null ? null : Math.abs(closure) <= allowable, segments };
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
  const sideShots = [];
  solvedRuns.forEach((run) => run.rows.forEach((row) => {
    if (row.pointType === POINT_TYPE_SIDE) {
      if (row.point && row.delta !== null) sideShots.push({ ...row, runId: run.runId, runName: run.runName });
      return;
    }
    if (!row.fromName || !row.point || row.delta === null) return;
    observations.push({ ...row, runId: run.runId, runName: run.runName, measuredDelta: row.delta });
  }));
  const excludedSideShots = sideShots.length;
  const deriveSidePoints = (elevations) => sideShots
    .filter((row) => row.point && row.delta !== null && elevations.has(row.fromName))
    .map((row) => ({
      id: `${row.runId}-${row.id}`,
      name: row.point,
      fromName: row.fromName,
      runId: row.runId,
      runName: row.runName,
      elevation: elevations.get(row.fromName) + row.delta,
      preliminaryElevation: row.elevation,
    }));
  if (!observations.length || !fixed.size) return { available: false, reason: !fixed.size ? 'Chưa có mốc cao độ chuẩn.' : 'Chưa có trị đo điểm chuyền hoàn chỉnh.', points: [], sidePoints: deriveSidePoints(fixed), segments: [], excludedSideShots };

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
  if (!usable.length) return { available: false, reason: 'Các trị đo chưa nối với mốc cao độ chuẩn.', points: [], sidePoints: deriveSidePoints(fixed), segments: [], ignored, excludedSideShots };

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
  if (solution === null) return { available: false, reason: 'Mạng chưa đủ điều kiện định vị cao độ.', points: [], sidePoints: deriveSidePoints(fixed), segments: [], ignored, excludedSideShots };
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
  const sidePoints = deriveSidePoints(elevations);
  return {
    available: true,
    method: useDistanceWeights ? 'Bình sai gián tiếp, trọng số nghịch đảo chiều dài' : 'Bình sai gián tiếp, đồng trọng số',
    points, sidePoints, segments, observations: usable.length, unknowns: unknowns.length, degreesOfFreedom, sigma0,
    maxCorrection: Math.max(...segments.map((row) => Math.abs(row.correction))), totalDistance, allowable, ignored, excludedSideShots
  };
}

export function finalizeStation(run, stationIndex, fallbackPoint = '') {
  const station = run.stations[stationIndex];
  if (!station) return { committed: false, stations: run.stations, nextIndex: stationIndex };
  const point = uppercaseName(station.point).trim() || uppercaseName(fallbackPoint).trim();
  if (!point) return { committed: false, stations: run.stations, nextIndex: stationIndex };
  const pointType = normalizePointType(station.pointType);
  const stations = run.stations.map((item, index) => index === stationIndex ? { ...item, point, pointType } : item);
  const appended = stationIndex === stations.length - 1;
  if (appended) stations.push(createStation('', pointType));
  return { committed: true, stations, nextIndex: appended ? stations.length - 1 : stationIndex + 1, point, pointType, appended };
}

export function removeStation(run, index) {
  if (run.stations.length <= 1) return { removed: null, stations: run.stations };
  const stations = [...run.stations], [removed] = stations.splice(index, 1);
  return { removed: { station: structuredClone(removed), index }, stations };
}
export function restoreStation(stations, undo) { const next = [...stations]; next.splice(Math.min(undo.index, next.length), 0, structuredClone(undo.station)); return next; }
export function saveAsCopy(book, name) { return normalizeBook({ ...structuredClone(book), id: uid(), name: name.trim(), createdAt: Date.now(), updatedAt: Date.now() }); }
