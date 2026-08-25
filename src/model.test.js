import { describe, expect, it } from 'vitest';
import { adjustLevelingNetwork, adjustSolvedRun, compareRuns, createBook, createRun, createStation, finalizeStation, nextRunNumber, normalizeBook, removeStation, restoreStation, saveAsCopy, solveRun, staffDistance } from './model';
import { POINT_TYPE_SIDE } from './pointNames';

const benchmarks = [{ name: 'DG3', elevation: '2,222' }, { name: 'DG4', elevation: '1,641' }];
const makeRun = (startPoint, points, deltas) => ({ ...createRun(1, startPoint), stations: points.map((point, i) => ({ ...createStation(point), bs: '1,000', fs: (1 - deltas[i] / 1000).toFixed(3).replace('.', ',') })) });

describe('schema v5 và bộ giải tuyến', () => {
  it('giải tuyến DG3 → DC6 → DC7 → DG4', () => {
    const solved = solveRun(makeRun('DG3', ['DC6', 'DC7', 'DG4'], [-100, -200, -281]), benchmarks);
    expect(solved.points.map((p) => p.elevation)).toEqual([2222, 2122, 1922, 1641]);
    expect(solved.checks.at(-1).difference).toBe(0);
  });
  it('giải tuyến ngược DG4 → DC7 → DC6 → DG3', () => {
    const solved = solveRun(makeRun('DG4', ['DC7', 'DC6', 'DG3'], [281, 200, 100]), benchmarks);
    expect(solved.points.map((p) => p.elevation)).toEqual([1641, 1922, 2122, 2222]);
  });
  it('neo được DC7 → TP1 → DG3 từ mốc ở cuối tuyến', () => {
    const solved = solveRun(makeRun('DC7', ['TP1', 'DG3'], [100, 200]), benchmarks);
    expect(solved.solved).toBe(true);
    expect(solved.points.map((p) => p.elevation)).toEqual([1922, 2022, 2222]);
  });
  it('so sánh DC ở đầu lượt này và cuối lượt khác', () => {
    const a = solveRun(makeRun('DG3', ['DC7'], [-300]), benchmarks);
    const b = solveRun(makeRun('DC7', ['DG3'], [300]), benchmarks);
    expect(compareRuns([a, b])).toContainEqual(expect.objectContaining({ name: 'DC7', spread: 0 }));
  });
  it('tính khoảng cách 3 chỉ 1.810/1.510/1.210 bằng 60 m', () => expect(staffDistance(1.810, 1.210)).toBeCloseTo(60, 8));
  it('không bắt buộc khoảng cách ở chế độ 1 chỉ', () => {
    const solved = solveRun(makeRun('DG3', ['TP1'], [225]), benchmarks);
    expect(solved.solved).toBe(true);
    expect(solved.points.at(-1).elevation).toBe(2447);
    expect(solved.totalDistance).toBeNull();
  });
  it('tự động chuyển sổ schema v2 từ mm sang đầu vào mét', () => {
    const migrated = normalizeBook({
      schemaVersion: 2,
      benchmarks: [{ name: 'DG1', elevation: '1854' }],
      runs: [{ ...createRun(1, 'DG1'), stations: [{ ...createStation('TP1'), bs: '1330', fs: '1105' }] }],
    });
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.benchmarks[0].elevation).toBe('1,854');
    expect(migrated.runs[0].stations[0]).toEqual(expect.objectContaining({ bs: '1,330', fs: '1,105' }));
    expect(solveRun(migrated.runs[0], migrated.benchmarks).points.at(-1).elevation).toBe(2079);
  });
  it('sửa dữ liệu schema v3 từng lưu nhầm 2000.000 m thành 2,000 m', () => {
    const migrated = normalizeBook({
      schemaVersion: 3,
      benchmarks: [{ name: 'DG1', elevation: '1.980' }],
      runs: [{ ...createRun(1, 'DG1'), stations: [{ ...createStation('TP1'), bs: '2000.000', fs: '1.585', distance: '10.500' }] }],
    });
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.benchmarks[0].elevation).toBe('1,980');
    expect(migrated.runs[0].stations[0]).toEqual(expect.objectContaining({ bs: '2,000', fs: '1,585', distance: '10,500' }));
  });
  it('chuyển schema v4 sang v5 và giữ TP cũ là điểm chuyền', () => {
    const migrated = normalizeBook({
      schemaVersion: 4,
      benchmarks: [{ name: 'DG1', elevation: '1,000' }],
      runs: [{ ...createRun(1, 'DG1'), stations: [{ ...createStation('TP1'), pointType: undefined }] }],
    });
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.runs[0].stations[0].pointType).toBe('turning');
  });
  it('phục hồi cao độ schema v5 còn lưu ở dạng nhập thô', () => {
    const recovered = normalizeBook({
      schemaVersion: 5,
      benchmarks: [{ name: 'DG1', elevation: '1234' }, { name: 'DG2', elevation: '2,134.5' }],
      runs: [createRun(1, 'DG1')],
    });
    expect(recovered.benchmarks.map((benchmark) => benchmark.elevation)).toEqual(['1,234', '2,135']);
  });
  it('tia phụ giữ nguyên điểm gốc, còn điểm chuyền cập nhật gốc kế tiếp', () => {
    const run = {
      ...createRun(1, 'DG1'),
      stations: [
        { ...createStation('TP_DG1.1', POINT_TYPE_SIDE), bs: '1,000', fs: '0,800' },
        { ...createStation('TP_DG1.2', POINT_TYPE_SIDE), bs: '1,000', fs: '0,700' },
        { ...createStation('DC1'), bs: '1,000', fs: '0,500' },
        { ...createStation('TP_DC1.1', POINT_TYPE_SIDE), bs: '1,000', fs: '0,900' },
      ],
    };
    const solved = solveRun(run, [{ name: 'DG1', elevation: '10,000' }]);
    expect(solved.rows.map((row) => row.fromName)).toEqual(['DG1', 'DG1', 'DG1', 'DC1']);
    expect(solved.rows.map((row) => row.elevation)).toEqual([10200, 10300, 10500, 10600]);
    expect(solved.endPoint).toBe('DC1');
    expect(solved.chainRows).toHaveLength(1);
    expect(solved.sideRows).toHaveLength(3);
  });
  it('tia phụ thiếu số đọc không chặn tuyến, nhưng điểm chuyền thiếu số đọc thì có', () => {
    const run = {
      ...createRun(1, 'DG1'),
      stations: [
        createStation('TP_DG1.1', POINT_TYPE_SIDE),
        { ...createStation('DC1'), bs: '1,000', fs: '0,900' },
        createStation('DC2'),
        { ...createStation('DC3'), bs: '1,000', fs: '0,800' },
      ],
    };
    const solved = solveRun(run, [{ name: 'DG1', elevation: '10,000' }]);
    expect(solved.rows[0].elevation).toBeNull();
    expect(solved.rows[1].elevation).toBe(10100);
    expect(solved.rows[2].elevation).toBeNull();
    expect(solved.rows[3].elevation).toBeNull();
  });
  it('xóa rồi hoàn tác phục hồi đúng vị trí và dữ liệu', () => {
    const run = makeRun('DG3', ['TP1', 'TP2', 'DG4'], [1, 2, 3]);
    const result = removeStation(run, 1);
    expect(result.stations.map((s) => s.point)).toEqual(['TP1', 'DG4']);
    expect(restoreStation(result.stations, result.removed).map((s) => s.point)).toEqual(['TP1', 'TP2', 'DG4']);
  });
  it('không xóa khi lượt chỉ còn một trạm', () => expect(removeStation(createRun(), 0).removed).toBeNull());
  it('Save As tạo ID mới và không thay đổi sổ gốc', () => {
    const original = createBook(), copy = saveAsCopy(original, 'Sổ mới');
    expect(copy.id).not.toBe(original.id); expect(copy.name).toBe('Sổ mới'); expect(original.name).not.toBe('Sổ mới');
  });
  it('bình sai chung lượt đi-về và trả cao độ DC', () => {
    const controls = [{ name: 'DG1', elevation: '10,000' }];
    const outward = solveRun(makeRun('DG1', ['TP1', 'DC1'], [500, 500]), controls);
    const returning = solveRun(makeRun('DC1', ['TP2', 'DG1'], [-499, -499]), controls);
    const adjusted = adjustLevelingNetwork([outward, returning], controls);
    expect(adjusted.available).toBe(true);
    expect(adjusted.degreesOfFreedom).toBe(1);
    expect(adjusted.points.find((point) => point.name === 'DC1')).toEqual(expect.objectContaining({ elevation: 10999, fixed: false }));
    expect(adjusted.segments.every((segment) => Math.abs(segment.correction + 0.5) < 1e-8)).toBe(true);
  });
  it('giữ mốc chuẩn cố định nhưng vẫn bình sai DC và TP', () => {
    const controls = [{ name: 'DG1', elevation: '10,000' }, { name: 'DG2', elevation: '12,001' }];
    const run = solveRun(makeRun('DG1', ['DC1', 'DG2'], [1000, 1000]), controls);
    const adjusted = adjustLevelingNetwork([run], controls);
    expect(adjusted.points.find((point) => point.name === 'DG2').elevation).toBe(12001);
    expect(adjusted.points.find((point) => point.name === 'DC1').elevation).toBeCloseTo(11000.5, 8);
  });
  it('cam kết ghost name và giữ chế độ TP cho phép đo kế tiếp', () => {
    const run = { ...createRun(1, 'DG1'), stations: [createStation('', POINT_TYPE_SIDE)] };
    const result = finalizeStation(run, 0, 'TP_DG1.1');
    expect(result).toEqual(expect.objectContaining({ committed: true, nextIndex: 1, appended: true, point: 'TP_DG1.1', pointType: POINT_TYPE_SIDE }));
    expect(result.stations[0]).toEqual(expect.objectContaining({ point: 'TP_DG1.1', pointType: POINT_TYPE_SIDE }));
    expect(result.stations[1]).toEqual(expect.objectContaining({ point: '', pointType: POINT_TYPE_SIDE }));
  });
  it('không tính trạm nháp sau khi hoàn tất vào điểm cuối hoặc số lượng ĐC/TP', () => {
    const source = { ...createRun(1, 'DG1'), stations: [{ ...createStation(), bs: '1,000', fs: '0,900' }] };
    const turningResult = finalizeStation(source, 0, 'DC1');
    const turningSolved = solveRun({ ...source, stations: turningResult.stations }, [{ name: 'DG1', elevation: '10,000' }]);
    expect(turningSolved.endPoint).toBe('DC1');
    expect(turningSolved.turningCount).toBe(1);
    expect(turningSolved.chainRows).toHaveLength(1);

    const sideSource = { ...createRun(1, 'DG1'), stations: [{ ...createStation('', POINT_TYPE_SIDE), bs: '1,000', fs: '0,800' }] };
    const sideResult = finalizeStation(sideSource, 0, 'TP_DG1.1');
    const sideSolved = solveRun({ ...sideSource, stations: sideResult.stations }, [{ name: 'DG1', elevation: '10,000' }]);
    expect(sideSolved.endPoint).toBe('DG1');
    expect(sideSolved.sideCount).toBe(1);
    expect(sideSolved.sideRows).toHaveLength(1);
  });
  it('cấp số lượt mới theo số lớn nhất trong sổ hiện tại', () => {
    expect(nextRunNumber([{ roundNumber: 2 }, { roundNumber: 4 }])).toBe(5);
  });
  it('loại tia phụ khỏi phương trình bình sai nhưng suy ra cao độ từ gốc đã bình sai', () => {
    const controls = [{ name: 'DG1', elevation: '10,000' }, { name: 'DG2', elevation: '12,001' }];
    const base = makeRun('DG1', ['DC1', 'DG2'], [1000, 1000]);
    base.stations.forEach((station) => { station.distance = '100,000'; });
    const withSide = {
      ...base,
      stations: [
        base.stations[0],
        { ...createStation('TP_DC1.1', POINT_TYPE_SIDE), bs: '1,000', fs: '0,800', distance: '999,000' },
        base.stations[1],
      ],
    };
    const baseAdjustment = adjustLevelingNetwork([solveRun(base, controls)], controls);
    const sideSolved = solveRun(withSide, controls);
    const sideAdjustment = adjustLevelingNetwork([sideSolved], controls);
    expect(sideSolved.totalDistance).toBe(200);
    expect(sideAdjustment.observations).toBe(baseAdjustment.observations);
    expect(sideAdjustment.degreesOfFreedom).toBe(baseAdjustment.degreesOfFreedom);
    expect(sideAdjustment.segments.map((row) => row.correction)).toEqual(baseAdjustment.segments.map((row) => row.correction));
    expect(sideAdjustment.excludedSideShots).toBe(1);
    expect(sideAdjustment.sidePoints[0]).toEqual(expect.objectContaining({ name: 'TP_DC1.1', fromName: 'DC1', elevation: 11200.5 }));
  });
  it('vẫn trả cao độ tia phụ từ mốc cố định khi chưa có điểm chuyền', () => {
    const controls = [{ name: 'DG1', elevation: '10,000' }];
    const run = {
      ...createRun(1, 'DG1'),
      stations: [
        { ...createStation('TP_DG1.1', POINT_TYPE_SIDE), bs: '1,000', fs: '0,750' },
        createStation('', POINT_TYPE_SIDE),
      ],
    };
    const network = adjustLevelingNetwork([solveRun(run, controls)], controls);
    expect(network.available).toBe(false);
    expect(network.excludedSideShots).toBe(1);
    expect(network.sidePoints).toEqual([expect.objectContaining({ name: 'TP_DG1.1', elevation: 10250 })]);
  });
  it('không phân số hiệu chỉnh cho ĐC thiếu trị đo hoặc nằm ngoài hai mốc khép', () => {
    const controls = [{ name: 'DG1', elevation: '10,000' }, { name: 'DG2', elevation: '10,201' }];
    const run = {
      ...createRun(1, 'DG1'),
      stations: [
        { ...createStation('DG2'), bs: '1,000', fs: '0,800' },
        createStation('DC3'),
      ],
    };
    const adjusted = adjustSolvedRun(solveRun(run, controls));
    expect(adjusted.available).toBe(true);
    expect(adjusted.segments).toHaveLength(1);
    expect(adjusted.segments[0].point).toBe('DG2');
    expect(adjusted.segments[0].adjustedDelta).toBe(201);
  });
  it('so sánh điểm chuyền tên tùy chỉnh giữa các lượt và không tính tia phụ', () => {
    const controls = [{ name: 'DG1', elevation: '10,000' }];
    const first = solveRun({ ...createRun(1, 'DG1'), stations: [{ ...createStation('MOC_A'), bs: '1,000', fs: '0,500' }] }, controls);
    const second = solveRun({ ...createRun(2, 'DG1'), stations: [{ ...createStation('MOC_A'), bs: '1,000', fs: '0,500' }, { ...createStation('MOC_A', POINT_TYPE_SIDE), bs: '1,000', fs: '0,500' }] }, controls);
    const groups = compareRuns([first, second]);
    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.name === 'MOC_A').values).toHaveLength(2);
  });
});
