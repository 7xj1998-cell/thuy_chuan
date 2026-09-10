import { describe, expect, it } from 'vitest';
import { evaluateRunStandard, getLevelingClass, LEVELING_CLASSES, toleranceCoefficientForClass } from './levelingStandards';

describe('tiêu chuẩn hạng đo thủy chuẩn', () => {
  it('ánh xạ đúng hệ số C theo hạng đo', () => {
    expect(LEVELING_CLASSES.map(({ id, coefficient }) => [id, coefficient])).toEqual([
      ['class-i', 2], ['class-ii', 4], ['class-iii', 10], ['class-iv', 20], ['technical', 50],
    ]);
    expect(toleranceCoefficientForClass('class-iii')).toBe(10);
    expect(getLevelingClass('technical').source).toBe('TCVN 8478:2010');
  });

  it('đánh giá có dấu theo trị tuyệt đối của sai số khép và C căn L', () => {
    const solved = { checks: [{ difference: 0 }, { difference: -12 }], totalDistance: 2426 };
    const passed = evaluateRunStandard(solved, 'class-iv');
    const failed = evaluateRunStandard({ ...solved, checks: [{ difference: 0 }, { difference: -40 }] }, 'class-iv');
    expect(passed).toEqual(expect.objectContaining({ status: 'passed', closure: -12, lengthKm: 2.426, passed: true }));
    expect(passed.allowable).toBeCloseTo(20 * Math.sqrt(2.426), 10);
    expect(failed).toEqual(expect.objectContaining({ status: 'failed', closure: -40, passed: false }));
  });

  it('không kết luận khi chưa chọn hạng, chưa khép hoặc thiếu chiều dài', () => {
    expect(evaluateRunStandard({ checks: [], totalDistance: 1000 }, '')).toEqual(expect.objectContaining({ status: 'unselected' }));
    expect(evaluateRunStandard({ checks: [{ difference: 0 }], totalDistance: 1000 }, 'class-iv')).toEqual(expect.objectContaining({ status: 'incomplete' }));
    expect(evaluateRunStandard({ checks: [{ difference: 0 }, { difference: 0 }], totalDistance: null }, 'class-iv')).toEqual(expect.objectContaining({ status: 'missing-distance' }));
  });
});
