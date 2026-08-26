import { uppercaseName } from './calc';

export const POINT_TYPE_TURNING = 'turning';
export const POINT_TYPE_SIDE = 'side';

export const normalizePointType = (value) => value === POINT_TYPE_SIDE ? POINT_TYPE_SIDE : POINT_TYPE_TURNING;
export const pointTypeLabel = (value) => normalizePointType(value) === POINT_TYPE_SIDE ? 'Tia phụ (TP)' : 'Điểm chuyền (ĐC)';

const cleanPointName = (value) => uppercaseName(value).trim();

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

  if (pointType === POINT_TYPE_TURNING) {
    const used = new Set();
    let greatest = 0;
    const considerName = (value) => {
      const name = cleanPointName(value);
      if (name) used.add(name);
      const match = /^DC(\d+)$/.exec(name);
      if (match) greatest = Math.max(greatest, Number(match[1]));
    };
    considerName(run.startPoint);
    (run.stations || []).forEach((station) => considerName(station.point));
    let index = greatest + 1;
    while (used.has(`DC${index}`)) index += 1;
    return `DC${index}`;
  }

  const origin = autoNamePart(stationOrigin(run, stationIndex));
  const storedRoundNumber = Number(run.roundNumber);
  const roundNumber = Number.isInteger(storedRoundNumber) && storedRoundNumber > 0 ? storedRoundNumber : runIndex + 1;
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
