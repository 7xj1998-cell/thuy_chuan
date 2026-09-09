import { uppercaseName } from './calc';

export const POINT_TYPE_TURNING = 'turning';
export const POINT_TYPE_SIDE = 'side';

export const normalizePointType = (value) => value === POINT_TYPE_SIDE ? POINT_TYPE_SIDE : POINT_TYPE_TURNING;
export const pointTypeLabel = (value) => normalizePointType(value) === POINT_TYPE_SIDE ? 'Tia phụ (TP)' : 'Điểm chuyền (ĐC)';

const cleanPointName = (value) => uppercaseName(value).trim();
export const isNamedControlPoint = (value) => /^(?:DC|DG|GPS)(?:\d|[_\s.-])/i.test(cleanPointName(value));

export function collectPointNames(book) {
  const names = [];
  const seen = new Set();
  const add = (value) => {
    const name = cleanPointName(value);
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };

  (book?.benchmarks || []).forEach((benchmark) => add(benchmark.name));
  (book?.runs || []).forEach((run) => {
    let origin = cleanPointName(run.startPoint);
    (run.stations || []).forEach((station) => {
      const explicitFrom = cleanPointName(station.fromPoint);
      const toPoint = cleanPointName(station.toPoint) || cleanPointName(station.point);
      if (!explicitFrom && !toPoint) return;

      add(explicitFrom || origin);
      add(toPoint);
      if (normalizePointType(station.pointType) === POINT_TYPE_TURNING && toPoint) origin = toPoint;
    });
  });
  return names;
}

// Generated intermediate names such as 1.1 or 2.3 are deliberately excluded
// from the point picker. They identify a single run and are not controls to
// match across measurement rounds.
export function collectSelectableControlPoints(book) {
  const names = [];
  const seen = new Set();
  const add = (value, benchmark = false) => {
    const name = cleanPointName(value);
    if (!name || seen.has(name) || (!benchmark && !isNamedControlPoint(name))) return;
    seen.add(name);
    names.push(name);
  };
  (book?.benchmarks || []).forEach((benchmark) => add(benchmark.name, true));
  (book?.runs || []).forEach((run) => {
    (run.stations || []).forEach((station) => {
      add(station.fromPoint);
      add(station.toPoint || station.point);
    });
  });
  return names.sort((left, right) => left.localeCompare(right, 'vi', { numeric: true, sensitivity: 'base' }));
}

export function stationOrigin(run, stationIndex) {
  let origin = cleanPointName(run?.startPoint);
  const stations = run?.stations || [];
  for (let index = 0; index < Math.min(stationIndex, stations.length); index += 1) {
    const station = stations[index];
    if (normalizePointType(station.pointType) === POINT_TYPE_TURNING && cleanPointName(station.point)) {
      origin = cleanPointName(station.point);
    }
  }
  return origin;
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const autoNamePart = (value) => cleanPointName(value || 'DIEM_GOC').replace(/\s+/g, '_').replace(/\.+/g, '_');
const isGeneratedSidePointName = (run, stationIndex, value) => {
  const origin = autoNamePart(stationOrigin(run, stationIndex));
  return new RegExp(`^TP_${escapeRegExp(origin)}(?:_L\\d+)?\\.\\d+$`).test(cleanPointName(value));
};

export function suggestTargetPointName(book, runId, stationIndex, requestedType) {
  const runs = book?.runs || [];
  const runIndex = Math.max(0, runs.findIndex((run) => run.id === runId));
  const run = runs[runIndex];
  if (!run) return '';
  const pointType = normalizePointType(requestedType);
  const storedRoundNumber = Number(run.roundNumber);
  const roundNumber = Number.isInteger(storedRoundNumber) && storedRoundNumber > 0 ? storedRoundNumber : runIndex + 1;

  if (pointType === POINT_TYPE_TURNING) {
    let greatest = 0;
    const pattern = new RegExp(`^${roundNumber}\\.(\\d+)$`);
    (run.stations || []).forEach((station) => {
      const match = pattern.exec(cleanPointName(station.point));
      if (match) greatest = Math.max(greatest, Number(match[1]));
    });
    return `${roundNumber}.${greatest + 1}`;
  }

  const origin = autoNamePart(stationOrigin(run, stationIndex));
  const roundTag = roundNumber > 1 ? `_L${roundNumber}` : '';
  const base = `TP_${origin}${roundTag}`;
  const pattern = new RegExp(`^${escapeRegExp(base)}\\.(\\d+)$`);
  const used = new Set(collectPointNames(book));
  let greatest = 0;
  used.forEach((name) => {
    const match = pattern.exec(name);
    if (match) greatest = Math.max(greatest, Number(match[1]));
  });
  let index = greatest + 1;
  while (used.has(`${base}.${index}`)) index += 1;
  return `${base}.${index}`;
}

export function filterPointNames(options, query, limit = Infinity) {
  const needle = cleanPointName(query);
  return [...new Set((options || []).map(cleanPointName).filter(Boolean))]
    .filter((name) => !needle || name.includes(needle))
    .sort((first, second) => {
      const firstStarts = needle && first.startsWith(needle) ? 0 : 1;
      const secondStarts = needle && second.startsWith(needle) ? 0 : 1;
      return firstStarts - secondStarts || first.localeCompare(second, 'vi', { numeric: true });
    })
    .slice(0, limit);
}

export function remapGeneratedSidePointNames(book, run, newRunId, targetRoundNumber) {
  const duplicate = { ...run, id: newRunId, roundNumber: targetRoundNumber, stations: [] };
  const stations = [];
  (run.stations || []).forEach((station, stationIndex) => {
    const nextStation = { ...station };
    if (normalizePointType(station.pointType) === POINT_TYPE_SIDE && isGeneratedSidePointName(run, stationIndex, station.point)) {
      duplicate.stations = [...stations, { ...nextStation, point: '' }];
      const duplicateBook = { ...book, runs: [...(book?.runs || []), duplicate] };
      nextStation.point = suggestTargetPointName(duplicateBook, newRunId, stationIndex, POINT_TYPE_SIDE);
    }
    stations.push(nextStation);
    duplicate.stations = stations;
  });
  return stations;
}
