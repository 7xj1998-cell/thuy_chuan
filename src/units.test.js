import { describe, expect, it } from 'vitest';
import {
  formatElevation,
  formatMeters,
  formatMillimeters,
  formatReportMeters,
  formatSignedMillimeters,
  metersToMillimeters,
  migrateMillimeterInput,
  millimetersToMeters,
  normalizeMeterInput,
} from './units';

describe('chuẩn hóa đơn vị trắc địa', () => {
  it('đổi dữ liệu nhập theo mét sang milimét cho lõi tính toán', () => {
    expect(metersToMillimeters('1.330')).toBe(1330);
    expect(metersToMillimeters('0,750')).toBe(750);
    expect(metersToMillimeters('1.3304')).toBe(1330);
    expect(metersToMillimeters('')).toBeNull();
  });

  it('hiển thị cao độ theo mét với đúng ba chữ số thập phân', () => {
    expect(formatElevation(1755)).toBe('1.755');
    expect(formatElevation(750)).toBe('0.750');
    expect(formatMeters(3.085)).toBe('3.085');
    expect(normalizeMeterInput('1')).toBe('1.000');
  });

  it('hiển thị chênh cao và số hiệu chỉnh theo milimét nguyên có dấu', () => {
    expect(formatSignedMillimeters(224.6)).toBe('+225');
    expect(formatSignedMillimeters(-203.6)).toBe('-204');
    expect(formatMillimeters(0.4)).toBe('0');
  });

  it('chuyển dữ liệu schema cũ từ milimét sang chuỗi mét', () => {
    expect(migrateMillimeterInput('1854')).toBe('1.854');
    expect(millimetersToMeters(750)).toBe(0.75);
  });

  it('báo cáo luôn giữ số 0 trước phần thập phân nhỏ hơn một mét', () => {
    expect(formatReportMeters(0.75, 'vi-VN')).toBe('0,750');
    expect(formatReportMeters(0.75, 'en-US')).toBe('0.750');
  });
});
