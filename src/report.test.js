import { describe, expect, it } from 'vitest';
import { createBook, createStation, normalizeBook, solveRun } from './model';
import { POINT_TYPE_SIDE } from './pointNames';
import { createExcelWorkbook } from './report';

describe('báo cáo Excel kỹ thuật', () => {
  it('giữ ô số ở dạng số và chuẩn hóa H/BS/FS theo mét, Δh theo mm', async () => {
    const initial = createBook();
    const book = normalizeBook({
      ...initial,
      benchmarks: [
        { ...initial.benchmarks[0], name: 'DG1', elevation: '0,750' },
        { ...initial.benchmarks[1], name: 'DG2', elevation: '0,975' },
      ],
      runs: [{
        ...initial.runs[0],
        startPoint: 'DG1',
        stations: [{ ...createStation('DG2'), bs: '1,330', fs: '1,105', distance: '' }],
      }],
    });
    const solvedRuns = book.runs.map((run) => solveRun(run, book.benchmarks));
    const { XLSX, workbook } = await createExcelWorkbook(book, solvedRuns);

    const benchmarkSheet = workbook.Sheets['Mốc chuẩn'];
    expect(benchmarkSheet.B2).toEqual(expect.objectContaining({ t: 'n', v: 0.75, z: '0.000' }));

    const runRows = XLSX.utils.sheet_to_json(workbook.Sheets['Lượt 1']);
    expect(runRows[0]).toEqual(expect.objectContaining({
      'H sau (m)': 0.75,
      'BS (m)': 1.33,
      'FS (m)': 1.105,
      'Δh (mm)': 225,
      'H trước (m)': 0.975,
    }));
    expect(typeof runRows[0]['H trước (m)']).toBe('number');
  });

  it('xuất tia phụ riêng và không đưa tia phụ vào sheet bình sai', async () => {
    const initial = createBook();
    const book = normalizeBook({
      ...initial,
      benchmarks: [
        { ...initial.benchmarks[0], name: 'DG1', elevation: '10,000' },
        { ...initial.benchmarks[1], name: 'DG2', elevation: '12,001' },
      ],
      runs: [{
        ...initial.runs[0],
        startPoint: 'DG1',
        stations: [
          { ...createStation('DC1'), bs: '1,500', fs: '0,500' },
          { ...createStation('TP_DC1.1', POINT_TYPE_SIDE), bs: '1,000', fs: '0,800' },
          { ...createStation('DG2'), bs: '1,500', fs: '0,500' },
          createStation('', POINT_TYPE_SIDE),
        ],
      }],
    });
    const solvedRuns = book.runs.map((run) => solveRun(run, book.benchmarks));
    const { XLSX, workbook } = await createExcelWorkbook(book, solvedRuns);
    const runRows = XLSX.utils.sheet_to_json(workbook.Sheets['Lượt 1']);
    const sideRows = XLSX.utils.sheet_to_json(workbook.Sheets['Tia phụ']);
    const adjustmentRows = XLSX.utils.sheet_to_json(workbook.Sheets['Bình sai']);
    const adjustedPoints = XLSX.utils.sheet_to_json(workbook.Sheets['Cao độ bình sai']);

    expect(runRows[1]).toEqual(expect.objectContaining({ 'Loại điểm tới': 'TIA PHỤ', 'Điểm sau': 'DC1', 'Điểm trước': 'TP_DC1.1' }));
    expect(runRows).toHaveLength(3);
    expect(runRows.map((row) => row.Trạm)).toEqual([1, 2, 3]);
    expect(sideRows[0]).toEqual(expect.objectContaining({ 'Tên tia phụ': 'TP_DC1.1', 'Tham gia bình sai': 'KHÔNG' }));
    expect(sideRows).toHaveLength(1);
    expect(adjustmentRows.map((row) => row.Trạm)).toEqual([1, 3]);
    expect(adjustmentRows.some((row) => row['Điểm trước'] === 'TP_DC1.1')).toBe(false);
    expect(adjustedPoints.some((row) => row['Tên điểm'] === 'TP_DC1.1')).toBe(false);
    expect(JSON.parse(workbook.Props.Comments).runs[0].stations[1].pointType).toBe(POINT_TYPE_SIDE);
  });

  it('xuất đủ ba cặp so sánh của ba lượt với dấu và chiều chênh lệch', async () => {
    const initial = createBook();
    const deltas = [1000, 909, 1002];
    const book = normalizeBook({
      ...initial,
      benchmarks: [{ ...initial.benchmarks[0], name: 'DG1', elevation: '1,689' }],
      runs: deltas.map((delta, index) => ({
        ...initial.runs[0],
        id: `r${index + 1}`,
        name: `Lượt ${index + 1}`,
        roundNumber: index + 1,
        startPoint: 'DG1',
        stations: [{ ...createStation('DC1'), bs: (delta / 1000).toFixed(3).replace('.', ','), fs: '0,000' }],
      })),
    });
    const solvedRuns = book.runs.map((run) => solveRun(run, book.benchmarks));
    const { XLSX, workbook } = await createExcelWorkbook(book, solvedRuns);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['So sánh']).filter((row) => row['Điểm'] === 'DC1');
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row['Chênh có dấu H_sau-H_đầu (mm)'])).toEqual([-91, 2, 93]);
    expect(rows.map((row) => row['Độ lệch tuyệt đối (mm)'])).toEqual([91, 2, 93]);
    expect(rows[0]['Chiều chênh lệch']).toBe('Lượt 2 thấp hơn Lượt 1');
  });
});
