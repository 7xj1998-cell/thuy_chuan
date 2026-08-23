import { describe, expect, it } from 'vitest';
import { calculateRoute, compareRoutes, listRoutePoints } from './calc';

describe('tính chuyền cao độ', () => {
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
});
