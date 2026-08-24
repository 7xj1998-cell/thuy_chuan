import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBook, createStation, normalizeBook, solveRun } from './model';
import { createPdfDocument } from './report';

describe('báo cáo PDF kỹ thuật', () => {
  it('tạo PDF nhiều trang với font Inter tiếng Việt và số liệu đã chuẩn hóa', async () => {
    const initial = createBook();
    const stations = Array.from({ length: 12 }, (_, index) => ({
      ...createStation(`TP${index + 1}`),
      bs: '1.330',
      fs: '1.105',
      distance: '',
    }));
    const book = normalizeBook({
      ...initial,
      name: 'Sổ kiểm tra tiếng Việt',
      benchmarks: [{ ...initial.benchmarks[0], name: 'DG1', elevation: '0.750' }],
      runs: [{ ...initial.runs[0], name: 'Lượt kiểm tra', startPoint: 'DG1', stations }],
    });
    const solvedRuns = book.runs.map((run) => solveRun(run, book.benchmarks));
    const fontBuffer = readFileSync(new URL('./assets/InterVariable.ttf', import.meta.url));
    const doc = await createPdfDocument(book, solvedRuns, { fontBuffer, locale: 'vi-VN' });
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);

    if (process.env.PDF_SAMPLE_PATH) {
      mkdirSync(dirname(process.env.PDF_SAMPLE_PATH), { recursive: true });
      writeFileSync(process.env.PDF_SAMPLE_PATH, pdfBuffer);
    }
  }, 20_000);
});
