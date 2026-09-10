import { describe, expect, it } from 'vitest';
import {
  canonicalBenchmarkElevationDraft,
  formatDistanceMeters,
  formatElevation,
  formatMeters,
  formatMillimeters,
  formatReportMeters,
  formatSignedMillimeters,
  metersToMillimeters,
  migrateMillimeterInput,
  millimetersToMeters,
  normalizeMeterInput,
  normalizeBenchmarkElevationInput,
  normalizeStaffInput,
  sanitizeBenchmarkElevationInput,
  sanitizeMeterInput,
} from './units';

describe('chuẩn hóa đơn vị trắc địa', () => {
  it('đổi dữ liệu nhập theo mét sang milimét cho lõi tính toán', () => {
    expect(metersToMillimeters('1.330')).toBe(1330);
    expect(metersToMillimeters('0,750')).toBe(750);
    expect(metersToMillimeters('1.3304')).toBe(1330);
    expect(metersToMillimeters('1,2345')).toBe(1235);
    expect(metersToMillimeters('-1,2345')).toBe(-1235);
    expect(metersToMillimeters('')).toBeNull();
  });

  it('hiển thị cao độ theo mét với đúng ba chữ số thập phân', () => {
    expect(formatElevation(1755)).toBe('1,755');
    expect(formatElevation(750)).toBe('0,750');
    expect(formatMeters(3.085)).toBe('3,085');
    expect(normalizeMeterInput('1')).toBe('1,000');
  });

  it('hiển thị tổng chiều dài theo mét không thêm ba số 0 không cần thiết', () => {
    expect(formatDistanceMeters(2426)).toBe('2426');
    expect(formatDistanceMeters(92.6)).toBe('92,6');
  });

  it('chuẩn hóa thao tác nhập mét bằng dấu phẩy và sửa số đọc mm cũ', () => {
    expect(sanitizeMeterInput('02.0009')).toBe('2,000');
    expect(sanitizeMeterInput(',75')).toBe('0,75');
    expect(normalizeStaffInput('2,000')).toBe('2,000');
    expect(normalizeStaffInput('2000.000')).toBe('2,000');
  });

  it('tự nhận biết cao độ mốc nhập theo mét hoặc milimét', () => {
    expect(normalizeBenchmarkElevationInput('2')).toBe('2,000');
    expect(normalizeBenchmarkElevationInput('12')).toBe('12,000');
    expect(normalizeBenchmarkElevationInput('0958')).toBe('0,958');
    expect(normalizeBenchmarkElevationInput('0985')).toBe('0,985');
    expect(normalizeBenchmarkElevationInput('985')).toBe('985,000');
    expect(normalizeBenchmarkElevationInput('0002')).toBe('0,002');
    expect(normalizeBenchmarkElevationInput('1234')).toBe('1,234');
    expect(normalizeBenchmarkElevationInput('1.234')).toBe('1,234');
    expect(normalizeBenchmarkElevationInput('1,234')).toBe('1,234');
  });

  it('giữ cú pháp mm có phần lẻ và làm tròn đối xứng đến milimét', () => {
    expect(sanitizeBenchmarkElevationInput('0958')).toBe('0958');
    expect(sanitizeBenchmarkElevationInput('2,134.5')).toBe('2,134.5');
    expect(normalizeBenchmarkElevationInput('2,134.4')).toBe('2,134');
    expect(normalizeBenchmarkElevationInput('2,134.5')).toBe('2,135');
    expect(normalizeBenchmarkElevationInput('2.134,5')).toBe('2,135');
    expect(normalizeBenchmarkElevationInput('-2,134.5')).toBe('-2,135');
    expect(metersToMillimeters(normalizeBenchmarkElevationInput('2,134.5'))).toBe(2135);
    expect(canonicalBenchmarkElevationDraft('1234')).toBe('1,234');
    expect(canonicalBenchmarkElevationDraft('2,134.5')).toBe('2,135');
    expect(canonicalBenchmarkElevationDraft('..')).toBeNull();
  });

  it('hiển thị chênh cao và số hiệu chỉnh theo milimét nguyên có dấu', () => {
    expect(formatSignedMillimeters(224.6)).toBe('+225');
    expect(formatSignedMillimeters(-203.6)).toBe('-204');
    expect(formatSignedMillimeters(-0.5)).toBe('-1');
    expect(formatSignedMillimeters(-1.5)).toBe('-2');
    expect(formatMillimeters(0.4)).toBe('0');
  });

  it('chuyển dữ liệu schema cũ từ milimét sang chuỗi mét', () => {
    expect(migrateMillimeterInput('1854')).toBe('1,854');
    expect(millimetersToMeters(750)).toBe(0.75);
  });

  it('báo cáo luôn giữ số 0 trước phần thập phân nhỏ hơn một mét', () => {
    expect(formatReportMeters(0.75, 'vi-VN')).toBe('0,750');
    expect(formatReportMeters(0.75, 'en-US')).toBe('0.750');
    expect(formatReportMeters(2)).toBe('2,000');
  });
});
