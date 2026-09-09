import { describe, expect, it } from 'vitest';
import {
  collectPointNames,
  collectSelectableControlPoints,
  filterPointNames,
  POINT_TYPE_SIDE,
  POINT_TYPE_TURNING,
  remapGeneratedSidePointNames,
  stationOrigin,
  suggestTargetPointName,
} from './pointNames';
import { createBook } from './model';

const station = (point, pointType = POINT_TYPE_TURNING) => ({ id: point || crypto.randomUUID(), point, pointType });
const run = (id, startPoint, stations) => ({ id, startPoint, stations });

describe('tên điểm và gợi ý thông minh', () => {
  it('không tạo gợi ý ảo trong sổ mới', () => {
    expect(collectPointNames(createBook())).toEqual([]);
  });

  it('sổ chỉ có mốc A1 không gợi ý DG4 từ lượt nháp cũ', () => {
    const book = { benchmarks: [{ name: 'A1' }], runs: [run('r1', 'DG4', [station('')])] };
    expect(collectPointNames(book)).toEqual(['A1']);
    expect(collectSelectableControlPoints(book)).toEqual(['A1']);
  });

  it('chỉ lấy mốc và điểm trạm thuộc đúng sổ đang truyền vào', () => {
    const currentBook = {
      benchmarks: [{ name: 'A1' }],
      runs: [
        run('r1', 'A1', [station('DC1')]),
        run('r2', 'DIEM_NHAP_CU', [station('')]),
      ],
    };
    const otherBook = {
      benchmarks: [{ name: 'B1' }],
      runs: [run('r3', 'B1', [station('DC9')])],
    };

    expect(collectPointNames(currentBook)).toEqual(['A1', 'DC1']);
    expect(collectPointNames(otherBook)).toEqual(['B1', 'DC9']);
  });

  it('hỗ trợ station.fromPoint/toPoint khi đọc dữ liệu trạm đã ghi', () => {
    const book = {
      benchmarks: [{ name: 'A1' }],
      runs: [{ id: 'r1', startPoint: 'DIEM_NHAP_CU', stations: [{ fromPoint: 'A1', toPoint: 'MOC_A' }] }],
    };
    expect(collectPointNames(book)).toEqual(['A1', 'MOC_A']);
  });

  it('thu thập và lọc tên điểm trong sổ hiện tại, ưu tiên tiền tố', () => {
    const book = {
      benchmarks: [{ name: 'DG3' }, { name: 'MOC_A' }],
      runs: [run('r1', 'DG1', [station('DC1'), station('DG2')])],
    };
    expect(collectPointNames(book)).toEqual(['DG3', 'MOC_A', 'DG1', 'DC1', 'DG2']);
    expect(filterPointNames(collectPointNames(book), 'G')).toEqual(['DG1', 'DG2', 'DG3']);
    expect(filterPointNames(collectPointNames(book), 'D')).toEqual(['DC1', 'DG1', 'DG2', 'DG3']);
  });

  it('giữ nguyên gốc qua tia phụ và chỉ chuyển gốc sau điểm chuyền', () => {
    const active = run('r1', 'DG1', [
      station('TP_DG1.1', POINT_TYPE_SIDE),
      station('TP_DG1.2', POINT_TYPE_SIDE),
      station('DC1'),
      station('', POINT_TYPE_SIDE),
    ]);
    expect(stationOrigin(active, 1)).toBe('DG1');
    expect(stationOrigin(active, 2)).toBe('DG1');
    expect(stationOrigin(active, 3)).toBe('DC1');
  });

  it('đánh số điểm trung gian theo số lượt ổn định, không tăng vì tên DC', () => {
    const first = run('r1', 'MOC_A', [
      station('DC1'),
      station('TP_DC1.1', POINT_TYPE_SIDE),
      station('TP_DC1.2', POINT_TYPE_SIDE),
      station('', POINT_TYPE_SIDE),
    ]);
    const second = run('r2', 'MOC_A', [station('DC1'), station('', POINT_TYPE_SIDE)]);
    const book = { benchmarks: [{ name: 'MOC_A' }], runs: [first, second] };
    expect(suggestTargetPointName(book, 'r1', 3, POINT_TYPE_SIDE)).toBe('TP_DC1.3');
    first.roundNumber = 1;
    second.roundNumber = 2;
    expect(suggestTargetPointName(book, 'r1', 3, POINT_TYPE_TURNING)).toBe('1.1');
    expect(suggestTargetPointName(book, 'r2', 1, POINT_TYPE_SIDE)).toBe('TP_DC1_L2.1');
    expect(suggestTargetPointName(book, 'r2', 1, POINT_TYPE_TURNING)).toBe('2.1');
  });

  it('không dùng tên điểm đầu để thay chuỗi tên trung gian', () => {
    const active = { ...run('r1', 'DC1', [station('')]), roundNumber: 1 };
    expect(suggestTargetPointName({ benchmarks: [], runs: [active] }, 'r1', 0, POINT_TYPE_TURNING)).toBe('1.1');
  });

  it('tiếp tục 1.3 sau 1.1, 1.2 và một điểm DC5; xóa trạm không đổi tên đã lưu', () => {
    const active = { ...run('r1', 'DG5', [station('1.1'), station('1.2'), station('DC5'), station('')]), roundNumber: 1 };
    const book = { benchmarks: [{ name: 'DG5' }], runs: [active] };
    expect(suggestTargetPointName(book, 'r1', 3, POINT_TYPE_TURNING)).toBe('1.3');
    const afterDelete = { ...active, stations: [active.stations[1], active.stations[2], active.stations[3]] };
    expect(afterDelete.stations.slice(0, 2).map((item) => item.point)).toEqual(['1.2', 'DC5']);
    expect(suggestTargetPointName({ ...book, runs: [afterDelete] }, 'r1', 2, POINT_TYPE_TURNING)).toBe('1.3');
  });

  it('chỉ gợi ý mốc/DC/DG/GPS và sắp xếp DC tự nhiên', () => {
    const book = { benchmarks: [{ name: 'A1' }], runs: [{ ...run('r1', 'DG1', [station('DC10'), station('1.1'), station('DC2'), station('GPS_1'), station('DC1')]), roundNumber: 1 }] };
    expect(collectSelectableControlPoints(book)).toEqual(['A1', 'DC1', 'DC2', 'DC10', 'GPS_1']);
  });

  it('giữ namespace lượt đo sau khi xóa một lượt đứng trước', () => {
    const second = {
      ...run('r2', 'DG1', [station('TP_DG1_L2.1', POINT_TYPE_SIDE), station('', POINT_TYPE_SIDE)]),
      roundNumber: 2,
    };
    const bookAfterDeletion = { benchmarks: [{ name: 'DG1' }], runs: [second] };
    expect(suggestTargetPointName(bookAfterDeletion, 'r2', 1, POINT_TYPE_SIDE)).toBe('TP_DG1_L2.2');
  });

  it('trả về toàn bộ điểm khớp thay vì cắt ở tám gợi ý', () => {
    const options = Array.from({ length: 12 }, (_, index) => `DG${index + 1}`);
    expect(filterPointNames(options, 'DG')).toHaveLength(12);
  });

  it('đổi namespace tên TP tự sinh khi nhân bản lượt nhưng giữ tên tùy chỉnh', () => {
    const source = {
      ...run('r1', 'DG1', [
        station('TP_DG1.1', POINT_TYPE_SIDE),
        station('TP_DG1.2', POINT_TYPE_SIDE),
        station('TIM_DUONG', POINT_TYPE_SIDE),
        station('DC1'),
        station('TP_DC1.1', POINT_TYPE_SIDE),
      ]),
      roundNumber: 1,
    };
    const names = remapGeneratedSidePointNames({ benchmarks: [], runs: [source] }, source, 'r2', 2).map((item) => item.point);
    expect(names).toEqual(['TP_DG1_L2.1', 'TP_DG1_L2.2', 'TIM_DUONG', 'DC1', 'TP_DC1_L2.1']);
  });
});
