import { describe, expect, it } from 'vitest';
import { calculateRoute, compareRoutes } from './calc';

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
});
