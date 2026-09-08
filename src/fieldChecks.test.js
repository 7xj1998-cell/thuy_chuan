import { describe, expect, it } from 'vitest';
import { FIELD_DEFAULTS, inspectStation, normalizeStationDraft } from './fieldChecks';

const fixture = (station = {}, extras = {}) => {
  const run = { startPoint: 'A1', mode: 'single', stations: [{ point: 'DC1', bs: '1,330', fs: '1,105', distance: '', ...station }], ...extras };
  const book = { benchmarks: [{ name: 'A1', elevation: '1,000' }], settings: {}, runs: [run] };
  return { book, run };
};
const inspect = (station, extras) => { const { book, run } = fixture(station, extras); return inspectStation(book, run, 0); };

describe('chuẩn hóa nháp tại hiện trường', () => {
  it('đổi số đọc thô sang m, giữ khoảng cách theo m và bảo toàn số đọc 3 chỉ chưa dùng', () => {
    const draft = { bs: '1330', fs: '0958', distance: '30', bsUpper: '1550', fsLower: '875', point: 'DC1' };
    const before = { ...draft };
    expect(normalizeStationDraft(draft)).toEqual({ ...draft, bs: '1,330', fs: '0,958', distance: '30,000' });
    expect(draft).toEqual(before);
  });

  it('không đổi số đọc 1 chỉ và khoảng cách ẩn khi đang dùng 3 chỉ', () => {
    const draft = { bs: '1330', fs: '1105', distance: '30', bsUpper: '1500', bsMiddle: '1330', bsLower: '1160', fsUpper: '1255', fsMiddle: '1105', fsLower: '0955' };
    expect(normalizeStationDraft(draft, 'three')).toEqual({ ...draft, bsUpper: '1,500', bsMiddle: '1,330', bsLower: '1,160', fsUpper: '1,255', fsMiddle: '1,105', fsLower: '0,955' });
  });

  it('không biến số lỗi, số mũ hoặc hexadecimal thành số đọc hợp lệ', () => {
    expect(normalizeStationDraft({ bs: '1,,330', fs: '0x10', distance: '1e3' })).toEqual({ bs: '1,,330', fs: '0x10', distance: '1e3' });
  });
});

describe('kiểm tra trước khi hoàn tất trạm', () => {
  it('chấp nhận số đọc 0 và khoảng cách bỏ trống trong 1 chỉ', () => {
    expect(inspect({ bs: '0', fs: 0 })).toEqual({ errors: [], warnings: [], ready: true });
  });

  it('kiểm theo giá trị sau chuẩn hóa nhưng không sửa bản nháp', () => {
    const { book, run } = fixture({ bs: '1330', fs: '1105' });
    const before = structuredClone(book);
    expect(inspectStation(book, run, 0)).toEqual({ errors: [], warnings: [], ready: true });
    expect(book).toEqual(before);
  });

  it('báo thiếu, sai định dạng và số đọc âm', () => {
    expect(inspect({ bs: ' ', fs: '1,2,3' }).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'bs', code: 'missing' }),
      expect.objectContaining({ field: 'fs', code: 'invalid' }),
    ]));
    expect(inspect({ bs: '-0,001', fs: '-1' }).errors.map((error) => error.code)).toEqual(['negative', 'negative']);
    expect(inspect({ bs: 'Infinity' }).ready).toBe(false);
  });

  it('chặn khoảng cách đã nhập bằng 0, âm hoặc sai định dạng', () => {
    for (const distance of ['0', 0, '-1', 'abc', '0x10', '1e3']) {
      const result = inspect({ distance });
      expect(result.ready).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'distance' })]));
    }
    expect(inspect({ distance: '0,001' }).ready).toBe(true);
  });

  it('yêu cầu đủ 6 số đọc của 3 chỉ, không dùng nhầm số đọc 1 chỉ', () => {
    const result = inspect({}, { mode: 'three' });
    expect(result.ready).toBe(false);
    expect(result.errors.map((error) => error.field)).toEqual(['bsUpper', 'bsMiddle', 'bsLower', 'fsUpper', 'fsMiddle', 'fsLower']);
    expect(inspect({ bsUpper: 0, bsMiddle: 0, bsLower: 0, fsUpper: 0, fsMiddle: 0, fsLower: 0, distance: '-1' }, { mode: 'three' })).toEqual({ errors: [], warnings: [], ready: true });
  });

  it('yêu cầu gốc và điểm tới nhưng chấp nhận tên gợi ý khi ô điểm tới rỗng', () => {
    expect(inspect({}, { startPoint: '' }).errors).toEqual([expect.objectContaining({ field: 'startPoint', code: 'missing' })]);
    const { book, run } = fixture({ point: '' });
    expect(inspectStation(book, run, 0).ready).toBe(false);
    expect(inspectStation(book, run, 0, 'DC1').ready).toBe(true);
  });

  it('báo mốc trùng tên khác cao độ, chấp nhận khác định dạng nhưng cùng mm', () => {
    const { book, run } = fixture();
    book.benchmarks.push({ name: 'a1 ', elevation: '1.000' });
    expect(inspectStation(book, run, 0).ready).toBe(true);
    book.benchmarks.push({ name: 'A1', elevation: '1,001' });
    expect(inspectStation(book, run, 0).errors).toEqual([expect.objectContaining({ field: 'benchmarks', code: 'benchmark_conflict' })]);
  });

  it('nhắc số đọc/chênh cao vượt ngưỡng, cho phép chỉnh hoặc tắt từng ngưỡng', () => {
    const { book, run } = fixture({ bs: '6,000', fs: '1,000' });
    expect(FIELD_DEFAULTS.staffLimit).toBe('5');
    const result = inspectStation(book, run, 0);
    expect(result.ready).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toEqual(['limit', 'delta_limit']);
    book.settings = { staffLimit: '7', deltaLimit: '6' };
    expect(inspectStation(book, run, 0).warnings).toEqual([]);
    book.settings = { staffLimit: '0', deltaLimit: '0' };
    expect(inspectStation(book, run, 0).warnings).toEqual([]);
  });

  it('nhắc sai thứ tự và lệch chỉ giữa trong 3 chỉ, không chặn lưu', () => {
    const { book, run } = fixture({ bsUpper: '1,000', bsMiddle: '1,200', bsLower: '1,400', fsUpper: '1,500', fsMiddle: '1,300', fsLower: '1,000' }, { mode: 'three' });
    const result = inspectStation(book, run, 0);
    expect(result.ready).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'bsUpper', code: 'order' }),
      expect.objectContaining({ field: 'fsMiddle', code: 'middle' }),
    ]));
    book.settings.middleErrorLimit = '100';
    expect(inspectStation(book, run, 0).warnings.map((warning) => warning.code)).toEqual(['order']);
  });

  it('nhắc tên điểm lặp trong cùng lượt, không nhắc khép về mốc chuẩn hoặc điểm ở lượt khác', () => {
    const { book, run } = fixture();
    run.stations.push({ point: 'DC2', bs: '1', fs: '1' }, { point: 'dc1', bs: '1', fs: '1' });
    expect(inspectStation(book, run, 2).warnings.map((warning) => warning.code)).toContain('duplicate');
    run.stations[2].point = 'A1';
    expect(inspectStation(book, run, 2).warnings).toEqual([]);
    run.stations[2].point = 'DC8';
    book.runs.push({ startPoint: 'A1', stations: [{ point: 'DC8' }] });
    expect(inspectStation(book, run, 2).warnings).toEqual([]);
  });

  it('nhắc điểm tới trùng đúng gốc tia phụ, bỏ qua chính trạm đang sửa', () => {
    const { book, run } = fixture();
    expect(inspectStation(book, run, 0).warnings).toEqual([]);
    run.stations.push({ point: 'TP_DC1.1', pointType: 'side', bs: '1', fs: '1' }, { point: 'DC1', pointType: 'side', bs: '1', fs: '1' });
    expect(inspectStation(book, run, 2).warnings).toEqual([expect.objectContaining({ field: 'point', code: 'same_point' })]);
  });
});
