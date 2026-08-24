import { describe, expect, it } from 'vitest';
import { adjustLevelingNetwork, compareRuns, createBook, createRun, createStation, removeStation, restoreStation, saveAsCopy, solveRun, staffDistance } from './model';

const benchmarks = [{ name: 'DG3', elevation: 2222 }, { name: 'DG4', elevation: 1641 }];
const makeRun = (startPoint, points, deltas) => ({ ...createRun(1, startPoint), stations: points.map((point, i) => ({ ...createStation(point), bs: '1000', fs: String(1000 - deltas[i]) })) });

describe('schema v2 và bộ giải tuyến', () => {
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
  it('tính khoảng cách 3 chỉ 1810/1510/1210 bằng 60 m', () => expect(staffDistance(1810, 1210)).toBe(60));
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
    const controls = [{ name: 'DG1', elevation: 10000 }];
    const outward = solveRun(makeRun('DG1', ['TP1', 'DC1'], [500, 500]), controls);
    const returning = solveRun(makeRun('DC1', ['TP2', 'DG1'], [-499, -499]), controls);
    const adjusted = adjustLevelingNetwork([outward, returning], controls);
    expect(adjusted.available).toBe(true);
    expect(adjusted.degreesOfFreedom).toBe(1);
    expect(adjusted.points.find((point) => point.name === 'DC1')).toEqual(expect.objectContaining({ elevation: 10999, fixed: false }));
    expect(adjusted.segments.every((segment) => Math.abs(segment.correction + 0.5) < 1e-8)).toBe(true);
  });
  it('giữ mốc chuẩn cố định nhưng vẫn bình sai DC và TP', () => {
    const controls = [{ name: 'DG1', elevation: 10000 }, { name: 'DG2', elevation: 12001 }];
    const run = solveRun(makeRun('DG1', ['DC1', 'DG2'], [1000, 1000]), controls);
    const adjusted = adjustLevelingNetwork([run], controls);
    expect(adjusted.points.find((point) => point.name === 'DG2').elevation).toBe(12001);
    expect(adjusted.points.find((point) => point.name === 'DC1').elevation).toBeCloseTo(11000.5, 8);
  });
});
