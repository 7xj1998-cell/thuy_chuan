import { describe, expect, it } from 'vitest';
import { createBook, createRun, createStation, normalizeBook, solveRun, START_MODE_KNOWN, START_MODE_UNKNOWN } from './model';
import {
  changeRunStartPoint,
  changeRunUnknownStart,
  createUnstartedRun,
  findValidBenchmark,
  runHasReadings,
  validBenchmarks,
} from './runStart';

function surveyBook() {
  const book = createBook();
  return {
    ...book,
    benchmarks: [
      { id: 'dg1', name: 'DG1', elevation: '1,000' },
      { id: 'dg2', name: 'DG2', elevation: '2,000' },
    ],
    runs: [{ ...createRun(1, 'DG1'), id: 'run-1' }],
  };
}

describe('chọn mốc xuất phát theo từng lượt', () => {
  it('tạo mọi lượt mới với startPoint rỗng', () => {
    const book = surveyBook();
    const next = createUnstartedRun(book);
    expect(next.startPoint).toBe('');
    expect(next.roundNumber).toBe(2);
  });

  it('chọn DG2 cho lượt 2 mà không đổi lượt 1', () => {
    const book = surveyBook();
    const second = { ...createUnstartedRun(book), id: 'run-2' };
    const updated = changeRunStartPoint({ ...book, runs: [...book.runs, second] }, 'run-2', 'dg2');
    expect(updated.runs.map((run) => run.startPoint)).toEqual(['DG1', 'DG2']);
    expect(solveRun(updated.runs[1], updated.benchmarks).points[0].elevation).toBe(2000);
  });

  it('đổi mốc chỉ thay startPoint, giữ nguyên toàn bộ số đọc và thứ tự trạm', () => {
    const book = surveyBook();
    const stations = [
      { ...createStation('DC1'), id: 's1', bs: '1,234', fs: '0,958', committedAt: 1 },
      { ...createStation('TP_DG1.1', 'side'), id: 's2', bs: '1,111', fs: '1,010' },
    ];
    book.runs[0] = { ...book.runs[0], stations };
    const before = structuredClone(book.runs[0].stations);
    const updated = changeRunStartPoint(book, 'run-1', 'DG2');
    expect(updated.runs[0].startPoint).toBe('DG2');
    expect(updated.runs[0].stations).toEqual(before);
    expect(updated.runs[0].stations.map((station) => station.id)).toEqual(['s1', 's2']);
  });

  it('chấp nhận cao độ thật 0,000 và loại mốc trống hoặc sai', () => {
    const book = {
      benchmarks: [
        { id: 'zero', name: 'ZERO', elevation: '0,000' },
        { id: 'blank', name: 'BLANK', elevation: '' },
        { id: 'bad', name: 'BAD', elevation: '..' },
      ],
    };
    expect(validBenchmarks(book).map((benchmark) => benchmark.name)).toEqual(['ZERO']);
    expect(findValidBenchmark(book, 'zero')).toMatchObject({ elevation: '0,000' });
    expect(findValidBenchmark(book, 'BLANK')).toBeNull();
  });

  it('nhận biết lượt đã có BS/FS để yêu cầu xác nhận', () => {
    expect(runHasReadings(createRun(1, 'DG1'))).toBe(false);
    expect(runHasReadings({ ...createRun(1, 'DG1'), stations: [{ ...createStation(), fs: '0,000' }] })).toBe(true);
  });

  it('mở lại dữ liệu schema v5 vẫn giữ mốc riêng của từng lượt', () => {
    const book = surveyBook();
    const restored = normalizeBook({
      ...book,
      schemaVersion: 5,
      runs: [
        book.runs[0],
        { ...createRun(2, 'DG2'), id: 'run-2' },
      ],
    });
    expect(restored.schemaVersion).toBe(6);
    expect(restored.runs.map((run) => run.startPoint)).toEqual(['DG1', 'DG2']);
    expect(restored.runs.every((run) => run.startMode === START_MODE_KNOWN)).toBe(true);
  });

  it('từ chối đổi sang mốc không có cao độ', () => {
    const book = surveyBook();
    book.benchmarks.push({ id: 'bad', name: 'DG3', elevation: '' });
    expect(changeRunStartPoint(book, 'run-1', 'DG3')).toBe(book);
    expect(book.runs[0].startPoint).toBe('DG1');
  });

  it('sổ v5 thiếu lượt được phục hồi bằng một lượt chưa chọn mốc', () => {
    const restored = normalizeBook({ schemaVersion: 5, benchmarks: [{ id: 'a', name: 'A1', elevation: '1,000' }], runs: [] });
    expect(restored.runs).toHaveLength(1);
    expect(restored.runs[0].startPoint).toBe('');
  });

  it('cho phép điểm đầu chưa biết mà không cần nằm trong danh sách mốc', () => {
    const book = surveyBook();
    const changed = changeRunUnknownStart(book, 'run-1', 'mốc sứ 01');
    expect(changed.runs[0]).toMatchObject({ startPoint: 'MỐC SỨ 01', startMode: START_MODE_UNKNOWN });
    expect(solveRun(changed.runs[0], changed.benchmarks).solved).toBe(false);
  });
});
