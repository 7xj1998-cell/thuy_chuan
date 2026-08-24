import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { numberOf } from './calc';
import { adjustLevelingNetwork, compareRuns, STORAGE_KEYS } from './model';
import interFontUrl from './assets/InterVariable.ttf?url';
import { OPEN_ROUTE_WARNING } from './terminology';
import {
  formatReportElevation,
  formatReportMeters,
  formatReportMillimeters,
  millimetersToMeters,
  roundMillimeters,
} from './units';

const EXCEL_METER_FORMAT = '0.000';
const EXCEL_MM_FORMAT = '0';
const EXCEL_SIGNED_MM_FORMAT = '+0;-0;0';

const finiteOrBlank = (value) => typeof value === 'number' && Number.isFinite(value) ? value : '';
const metersFromMillimetersOrBlank = (value) => finiteOrBlank(millimetersToMeters(value));
const millimetersOrBlank = (value) => finiteOrBlank(roundMillimeters(value));
const inputMetersOrBlank = (value) => finiteOrBlank(numberOf(value));

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function nextExportName(base, extension) {
  const clean = String(base || 'so-thuy-chuan')
    .replace(/\.(xlsx|pdf)$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_') || 'so-thuy-chuan';
  const used = readStorage(STORAGE_KEYS.exports, {});
  const key = `${clean}.${extension}`;
  const count = (used[key] || 0) + 1;
  used[key] = count;
  localStorage.setItem(STORAGE_KEYS.exports, JSON.stringify(used));
  return `${clean}${count === 1 ? '' : `_${String(count).padStart(2, '0')}`}.${extension}`;
}

function applyColumnFormats(XLSX, worksheet, rows, formats) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  Object.entries(formats).forEach(([header, formatCode]) => {
    const column = headers.indexOf(header);
    if (column < 0) return;
    for (let row = 1; row <= rows.length; row += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = worksheet[address];
      if (cell?.t === 'n') cell.z = formatCode;
    }
  });
  worksheet['!cols'] = headers.map((header) => ({
    wch: Math.min(34, Math.max(10, header.length + 2, ...rows.map((row) => String(row[header] ?? '').length + 2))),
  }));
}

function appendSheet(XLSX, workbook, name, rows, formats = {}) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  applyColumnFormats(XLSX, worksheet, rows, formats);
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}

export async function createExcelWorkbook(book, solvedRuns) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const comparisons = compareRuns(solvedRuns);
  const network = adjustLevelingNetwork(solvedRuns, book.benchmarks, book.settings.toleranceCoefficient);

  appendSheet(XLSX, workbook, 'Thông tin', [{
    'Tên sổ': book.name,
    'Số lượt': book.runs.length,
    'Ngày cập nhật': new Date().toLocaleString(),
    'Đơn vị cao độ và số đọc': 'm',
    'Đơn vị chênh cao và số hiệu chỉnh': 'mm',
  }]);

  const benchmarkRows = book.benchmarks.map((benchmark) => ({
    'Tên mốc': benchmark.name,
    'Cao độ chuẩn H (m)': inputMetersOrBlank(benchmark.elevation),
  }));
  appendSheet(XLSX, workbook, 'Mốc chuẩn', benchmarkRows, { 'Cao độ chuẩn H (m)': EXCEL_METER_FORMAT });

  const pointRows = [];
  solvedRuns.forEach((run) => run.points.forEach((point) => pointRows.push({
    'Lượt đo': run.runName,
    'Thứ tự': point.index,
    'Tên điểm': point.name,
    'Cao độ H (m)': metersFromMillimetersOrBlank(point.elevation),
  })));
  appendSheet(XLSX, workbook, 'Tất cả điểm', pointRows, { 'Cao độ H (m)': EXCEL_METER_FORMAT });

  const comparisonRows = [];
  comparisons.forEach((group) => group.values.forEach((value) => comparisonRows.push({
    Điểm: group.name,
    'Lượt đo': value.runName,
    'Cao độ H (m)': metersFromMillimetersOrBlank(value.elevation),
    'Max-Min (mm)': millimetersOrBlank(group.spread),
  })));
  appendSheet(XLSX, workbook, 'So sánh', comparisonRows, {
    'Cao độ H (m)': EXCEL_METER_FORMAT,
    'Max-Min (mm)': EXCEL_MM_FORMAT,
  });

  const adjustmentRows = network.segments.map((row, index) => ({
    'Lượt đo': row.runName,
    Trạm: index + 1,
    'Điểm sau': row.fromName,
    'Điểm trước': row.point,
    'Khoảng cách (m)': finiteOrBlank(row.distance),
    'Δh đo (mm)': millimetersOrBlank(row.measuredDelta),
    'Số hiệu chỉnh chênh cao v (mm)': millimetersOrBlank(row.correction),
    'Δh bình sai (mm)': millimetersOrBlank(row.adjustedDelta),
    'H điểm sau bình sai (m)': metersFromMillimetersOrBlank(row.adjustedFromElevation),
    'H điểm trước bình sai (m)': metersFromMillimetersOrBlank(row.adjustedElevation),
  }));
  appendSheet(XLSX, workbook, 'Bình sai', adjustmentRows, {
    'Khoảng cách (m)': EXCEL_METER_FORMAT,
    'Δh đo (mm)': EXCEL_SIGNED_MM_FORMAT,
    'Số hiệu chỉnh chênh cao v (mm)': EXCEL_SIGNED_MM_FORMAT,
    'Δh bình sai (mm)': EXCEL_SIGNED_MM_FORMAT,
    'H điểm sau bình sai (m)': EXCEL_METER_FORMAT,
    'H điểm trước bình sai (m)': EXCEL_METER_FORMAT,
  });

  const adjustedPointRows = network.points.map((point) => ({
    'Tên điểm': point.name,
    'Vai trò': point.fixed ? 'MỐC CỐ ĐỊNH' : 'ĐIỂM BÌNH SAI',
    'Cao độ bình sai H (m)': metersFromMillimetersOrBlank(point.elevation),
    'Số trị đo liên quan': point.observationCount,
  }));
  appendSheet(XLSX, workbook, 'Cao độ bình sai', adjustedPointRows, { 'Cao độ bình sai H (m)': EXCEL_METER_FORMAT });

  solvedRuns.forEach((solved, index) => {
    const run = book.runs[index];
    const rows = solved.rows.map((row, stationIndex) => ({
      Trạm: stationIndex + 1,
      'Điểm sau': row.fromName,
      'H sau (m)': metersFromMillimetersOrBlank(row.fromElevation),
      'BS trên (m)': run.mode === 'three' ? inputMetersOrBlank(row.bsUpper) : '',
      'BS giữa (m)': run.mode === 'three' ? inputMetersOrBlank(row.bsMiddle) : '',
      'BS dưới (m)': run.mode === 'three' ? inputMetersOrBlank(row.bsLower) : '',
      'BS (m)': metersFromMillimetersOrBlank(row.bs),
      'D sau (m)': finiteOrBlank(row.db),
      'FS trên (m)': run.mode === 'three' ? inputMetersOrBlank(row.fsUpper) : '',
      'FS giữa (m)': run.mode === 'three' ? inputMetersOrBlank(row.fsMiddle) : '',
      'FS dưới (m)': run.mode === 'three' ? inputMetersOrBlank(row.fsLower) : '',
      'FS (m)': metersFromMillimetersOrBlank(row.fs),
      'D trước (m)': finiteOrBlank(row.df),
      'D trạm (m)': finiteOrBlank(row.distance),
      'ΔD (m)': finiteOrBlank(row.distanceDifference),
      'Δh (mm)': millimetersOrBlank(row.delta),
      'Cao độ tia ngắm H_tia (m)': metersFromMillimetersOrBlank(row.hi),
      'Điểm trước': row.point,
      'H trước (m)': metersFromMillimetersOrBlank(row.elevation),
    }));
    const meterHeaders = [
      'H sau (m)', 'BS trên (m)', 'BS giữa (m)', 'BS dưới (m)', 'BS (m)', 'D sau (m)',
      'FS trên (m)', 'FS giữa (m)', 'FS dưới (m)', 'FS (m)', 'D trước (m)', 'D trạm (m)',
      'ΔD (m)', 'Cao độ tia ngắm H_tia (m)', 'H trước (m)',
    ];
    appendSheet(XLSX, workbook, (run.name || `Lượt ${index + 1}`).replace(/[\\/?*[\]:]/g, '_').slice(0, 31), rows, {
      ...Object.fromEntries(meterHeaders.map((header) => [header, EXCEL_METER_FORMAT])),
      'Δh (mm)': EXCEL_SIGNED_MM_FORMAT,
    });
  });

  workbook.Props = { Comments: JSON.stringify(book) };
  return { XLSX, workbook };
}

async function writeNativeFile(filename, data, title) {
  const result = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
  await Share.share({ title, url: result.uri, dialogTitle: `Lưu hoặc chia sẻ ${filename.endsWith('.pdf') ? 'PDF' : 'Excel'}` });
}

export async function exportExcelReport(book, solvedRuns, desiredName) {
  const filename = nextExportName(desiredName, 'xlsx');
  const { XLSX, workbook } = await createExcelWorkbook(book, solvedRuns);
  if (Capacitor.isNativePlatform()) {
    const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    await writeNativeFile(filename, base64, book.name);
  } else {
    XLSX.writeFile(workbook, filename);
  }
  return filename;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function registerPdfFont(doc, suppliedFontBuffer) {
  let fontBuffer = suppliedFontBuffer;
  if (!fontBuffer) {
    const response = await fetch(interFontUrl);
    if (!response.ok) throw new Error('Không tải được font Inter cho PDF.');
    fontBuffer = await response.arrayBuffer();
  }
  const base64 = arrayBufferToBase64(fontBuffer);
  doc.addFileToVFS('InterVariable.ttf', base64);
  doc.addFont('InterVariable.ttf', 'Inter', 'normal');
  doc.addFont('InterVariable.ttf', 'Inter', 'bold');
  doc.setFont('Inter', 'normal');
}

function pdfMeters(value, locale) {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${formatReportMeters(value, locale)} m`;
}

function pdfElevation(value, locale) {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${formatReportElevation(value, locale)} m`;
}

function pdfMillimeters(value, locale, signed = false) {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${formatReportMillimeters(value, { locale, signed })} mm`;
}

export async function createPdfDocument(book, solvedRuns, options = {}) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  await registerPdfFont(doc, options.fontBuffer);
  const locale = options.locale || 'vi-VN';
  const network = adjustLevelingNetwork(solvedRuns, book.benchmarks, book.settings.toleranceCoefficient);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const tableStyles = {
    theme: 'grid',
    margin: { left: margin, right: margin },
    styles: { font: 'Inter', fontStyle: 'normal', fontSize: 7.2, cellPadding: 2.2, textColor: [30, 41, 59], lineColor: [216, 226, 222], lineWidth: 0.2 },
    headStyles: { font: 'Inter', fontStyle: 'bold', fillColor: [8, 122, 104], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  };

  const ensureSpace = (y, needed = 18) => {
    if (y + needed <= pageHeight - 14) return y;
    doc.addPage();
    return 16;
  };
  const sectionTitle = (title, y) => {
    const nextY = ensureSpace(y, 16);
    doc.setFont('Inter', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(7, 95, 82);
    doc.text(title, margin, nextY);
    doc.setFont('Inter', 'normal');
    return nextY + 4;
  };
  const paragraph = (text, y, color = [71, 85, 105]) => {
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    const nextY = ensureSpace(y, lines.length * 4 + 4);
    doc.setFont('Inter', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...color);
    doc.text(lines, margin, nextY);
    return nextY + lines.length * 4 + 2;
  };

  doc.setFont('Inter', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('SỔ ĐO THỦY CHUẨN HIỆN TRƯỜNG', margin, 18);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(book.name, margin, 25);
  doc.text(`Ngày xuất: ${new Date().toLocaleString(locale)}`, pageWidth - margin, 25, { align: 'right' });

  autoTable(doc, {
    ...tableStyles,
    startY: 31,
    head: [['Mốc chuẩn', 'Cao độ H (m)']],
    body: book.benchmarks.map((benchmark) => [benchmark.name || '—', numberOf(benchmark.elevation) === null ? '—' : `${formatReportMeters(numberOf(benchmark.elevation), locale)} m`]),
    tableWidth: 100,
  });
  let y = (doc.lastAutoTable?.finalY || 31) + 9;

  solvedRuns.forEach((solved, runIndex) => {
    const run = book.runs[runIndex];
    const endPoint = solved.points.at(-1)?.name || '—';
    y = sectionTitle(`${run.name} · ${run.startPoint || '—'} → ${endPoint} · ${run.stations.length} trạm`, y);
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [['Trạm', 'Điểm sau', 'H sau (m)', 'BS (m)', 'FS (m)', 'Δh (mm)', 'H_tia (m)', 'Điểm trước', 'H trước (m)', 'D (m)']],
      body: solved.rows.map((row, index) => [
        String(index + 1),
        row.fromName || '—',
        pdfElevation(row.fromElevation, locale),
        pdfElevation(row.bs, locale),
        pdfElevation(row.fs, locale),
        pdfMillimeters(row.delta, locale, true),
        pdfElevation(row.hi, locale),
        row.point || '—',
        pdfElevation(row.elevation, locale),
        pdfMeters(row.distance, locale),
      ]),
    });
    y = (doc.lastAutoTable?.finalY || y) + 9;
  });

  y = sectionTitle('Bình sai lưới độ cao', y);
  if (!network.available) {
    y = paragraph(network.reason, y + 2, [138, 91, 0]);
  } else {
    y = paragraph(`${network.method}. Mốc chuẩn được giữ cố định; các điểm chưa biết được bình sai từ toàn bộ trị đo liên kết.`, y + 2);
    if (network.degreesOfFreedom === 0) y = paragraph(OPEN_ROUTE_WARNING, y, [138, 91, 0]);
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [['Điểm', 'Vai trò', 'H bình sai (m)', 'Số trị đo']],
      body: network.points.map((point) => [
        point.name,
        point.fixed ? 'Mốc cố định' : 'Điểm bình sai',
        pdfElevation(point.elevation, locale),
        String(point.observationCount),
      ]),
    });
    y = (doc.lastAutoTable?.finalY || y) + 9;
    y = sectionTitle('Số hiệu chỉnh chênh cao (v)', y);
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [['Lượt đo', 'Đoạn', 'v (mm)', 'Δh đo (mm)', 'Δh bình sai (mm)', 'Khoảng cách (m)']],
      body: network.segments.map((row) => [
        row.runName,
        `${row.fromName} → ${row.point}`,
        pdfMillimeters(row.correction, locale, true),
        pdfMillimeters(row.measuredDelta, locale, true),
        pdfMillimeters(row.adjustedDelta, locale, true),
        pdfMeters(row.distance, locale),
      ]),
    });
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(220, 228, 224);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
    doc.setFont('Inter', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Đơn vị: cao độ và số đọc mia = m; chênh cao, sai số khép và số hiệu chỉnh = mm.', margin, pageHeight - 6);
    doc.text(`Trang ${page}/${pages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
  }

  doc.setProperties({ title: book.name, subject: 'Sổ đo thủy chuẩn hiện trường', creator: 'Thủy Chuẩn Hiện Trường' });
  return doc;
}

export async function exportPdfReport(book, solvedRuns, desiredName) {
  const filename = nextExportName(desiredName, 'pdf');
  const doc = await createPdfDocument(book, solvedRuns);
  if (Capacitor.isNativePlatform()) {
    const base64 = doc.output('datauristring').split(',')[1];
    await writeNativeFile(filename, base64, book.name);
  } else {
    doc.save(filename);
  }
  return filename;
}
