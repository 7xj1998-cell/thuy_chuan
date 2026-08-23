import { describe, expect, it } from 'vitest';
import { adjustLeveling, calculateRoute, compareRoutes, listRoutePoints, uppercaseName } from './calc';

describe('tính chuyền cao độ', () => {
  it('chuẩn hóa tên mốc và tên điểm thành chữ hoa', () => {
    expect(uppercaseName('dg5')).toBe('DG5');
    expect(uppercaseName('điểm tp1')).toBe('ĐIỂM TP1');
  });

  it('tính đúng ví dụ DG5 đến DC11', () => {
    const result = calculateRoute('DG5', '2548', [{ id: '1', bs: '660', fs: '2000', point: 'DC11' }]);
    expect(result[0].hi).toBe(3208);
    expect(result[0].delta).toBe(-1340);
    expect(result[0].elevation).toBe(1208);
  });

  it('chỉ so sánh các mốc DG/DC cùng tên', () => {
    const a = [{ point: 'TP1', elevation: 10 }, { point: 'DC2', elevation: 20 }];
    const b = [{ point: 'TV1', elevation: 11 }, { point: 'DC2', elevation: 22 }];
    expect(compareRoutes(a, b)).toEqual([{ name: 'DC2', first: 20, second: 22, difference: 2 }]);
  });

  it('liệt kê cả mốc đầu và các điểm trung gian để xuất Excel', () => {
    const route = calculateRoute('DG5', 2548, [
      { id: '1', bs: 660, fs: 1000, point: 'TP1' },
      { id: '2', bs: 500, fs: 2000, point: 'DC11' }
    ]);
    expect(listRoutePoints('Lượt đi', 'DG5', 2548, route)).toEqual([
      { direction: 'Lượt đi', order: 0, type: 'Mốc DG/DC', name: 'DG5', elevation: 2548 },
      { direction: 'Lượt đi', order: 1, type: 'Điểm trung gian', name: 'TP1', elevation: 2208 },
      { direction: 'Lượt đi', order: 2, type: 'Mốc DG/DC', name: 'DC11', elevation: 708 }
    ]);
  });

  it('bình sai theo chiều dài và khép đúng về mốc đầu', () => {
    const outward = [{ point: 'TP1', delta: 100, elevation: 1100, distance: 100 }];
    const returning = [{ point: 'DG1', delta: -90, elevation: 1010, distance: 300 }];
    const result = adjustLeveling(outward, returning, 10, 20);
    expect(result.method).toBe('Theo chiều dài đoạn đo');
    expect(result.segments[0].correction).toBe(-2.5);
    expect(result.segments[1].correction).toBe(-7.5);
    expect(result.segments[1].adjustedElevation).toBe(1000);
    expect(result.allowable).toBeCloseTo(20 * Math.sqrt(0.4));
    expect(result.passed).toBe(true);
  });

  it('thiếu khoảng cách thì bình sai đều theo số trạm', () => {
    const result = adjustLeveling(
      [{ point: 'TP1', delta: 5, elevation: 5 }],
      [{ point: 'DG1', delta: 1, elevation: 6 }],
      6
    );
    expect(result.method).toBe('Theo số trạm máy');
    expect(result.segments.map((row) => row.correction)).toEqual([-3, -3]);
  });
});
