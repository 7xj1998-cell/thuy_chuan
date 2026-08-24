import { describe, expect, it } from 'vitest';
import { createBook, createStation, normalizeBook, solveRun } from './model';
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
});
