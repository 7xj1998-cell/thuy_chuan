import { normalizePointType, POINT_TYPE_SIDE, stationOrigin } from './pointNames';

export const backsightFields = (mode) => mode === 'three' ? ['bsUpper', 'bsMiddle', 'bsLower'] : ['bs'];
const blank = (value) => !String(value ?? '').trim();
export const hasBacksight = (station, mode) => backsightFields(mode).every((field) => !blank(station?.[field]));

export function shareBacksight(run, index, station = run.stations[index]) {
  const source = run.stations[index - 1];
  if (!source || !hasBacksight(source, run.mode)) return { ...station, pointType: POINT_TYPE_SIDE, backsightMode: 'manual' };
  const inherited = { ...station, pointType: POINT_TYPE_SIDE, backsightMode: 'shared',
    backsightSourceId: source.backsightSourceId || source.id,
    backsightOriginPoint: stationOrigin(run, index - 1),
  };
  backsightFields(run.mode).forEach((field) => { inherited[field] = source[field]; });
  return inherited;
}

export function useNewBacksight(station, mode, pointType = station.pointType) {
  const next = { ...station, pointType, backsightMode: 'manual' };
  if (station.backsightMode === 'shared') backsightFields(mode).forEach((field) => { next[field] = ''; });
  delete next.backsightSourceId;
  delete next.backsightOriginPoint;
  return next;
}

// Materialize shared readings so storage and exports keep complete observations.
// Never replace existing independent readings or infer a setup for saved old shots.
export function withInheritedBacksights(run) {
  const stations = [];
  (run.stations || []).forEach((station, index) => {
    let next = station;
    if (normalizePointType(station.pointType) === POINT_TYPE_SIDE) {
      const sourceIndex = stations.findIndex((item) => item.id === station.backsightSourceId);
      if (station.backsightMode === 'shared' && sourceIndex >= 0) {
        next = { ...station, backsightOriginPoint: stationOrigin({ ...run, stations }, sourceIndex) };
        backsightFields(run.mode).forEach((field) => { next[field] = stations[sourceIndex][field]; });
      } else if (!station.committedAt && !station.backsightMode && backsightFields(run.mode).every((field) => blank(station[field])) && hasBacksight(stations[index - 1], run.mode)) {
        next = shareBacksight({ ...run, stations }, index, station);
      }
    }
    stations.push(next);
  });
  return { ...run, stations };
}

export function remapBacksightLinks(stations, newIds) {
  return stations.map((station) => ({ ...station, id: newIds.get(station.id),
    ...(station.backsightSourceId ? { backsightSourceId: newIds.get(station.backsightSourceId) || station.backsightSourceId } : {}),
  }));
}
