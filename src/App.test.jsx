import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { QualityCard } from './FieldUI';

describe('cấu trúc giao diện mobile', () => {
  beforeEach(() => {
    const values = new Map();
    globalThis.localStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
      clear: () => values.clear(),
    };
  });

  it('tách nhãn, select và mô tả tuyến thành các phần tử theo luồng tài liệu', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toMatch(/runselect-label[^>]*>Lượt đo đang dùng<\/span><select[\s\S]*?<\/select><small class="runselect-meta"/);
  });

  it('khởi tạo sổ trống không chứa điểm mẫu DG3 hoặc DG4', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).not.toContain('DG3');
    expect(html).not.toContain('DG4');
  });

  it('dùng đầu vào mét, khoảng cách tùy chọn và thuật ngữ H_tia', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Số đọc mia sau BS theo mét');
    expect(html).toContain('placeholder="0,000"');
    expect(html).toContain('Định dạng:');
    expect(html).toContain('2,000');
    expect(html).toContain('placeholder="Nhập khoảng cách (m)..."');
    expect(html).toContain('Cao độ tia ngắm (H');
    expect(html).not.toContain('Cao máy · HI');
  });

  it('hiển thị toggle ĐC/TP, combobox và ghost name tự động trên màn hình Đo', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Chọn loại điểm tới');
    expect(html).toContain('Điểm chuyền');
    expect(html).toContain('Tia phụ');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('placeholder="DC1"');
  });

  it('hiển thị dữ liệu cũ 2000.000 thành số đọc 2,000 m', () => {
    localStorage.setItem('so-thuy-chuan.active-draft.v2', JSON.stringify({
      schemaVersion: 3,
      name: 'Sổ nhập cũ',
      benchmarks: [{ id: 'b1', name: 'DG1', elevation: '1.980' }],
      runs: [{
        id: 'r1',
        name: 'Lượt 1',
        startPoint: 'DG1',
        mode: 'single',
        stations: [{ id: 's1', point: 'TP1', bs: '2000.000', fs: '1.585', distance: '' }],
      }],
    }));
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('value="2,000"');
    expect(html).toContain('value="1,585"');
    expect(html).not.toContain('value="2000.000"');
  });

  it('hiển thị đúng bước chọn mốc cho lượt chưa có điểm đầu', () => {
    localStorage.setItem('so-thuy-chuan.active-draft.v2', JSON.stringify({
      schemaVersion: 5,
      id: 'book-start',
      name: 'Sổ chọn mốc',
      benchmarks: [
        { id: 'b1', name: 'DG1', elevation: '1,000' },
        { id: 'b2', name: 'DG2', elevation: '0,000' },
      ],
      runs: [{ id: 'r1', name: 'Lượt 1', roundNumber: 1, startPoint: '', mode: 'single', stations: [{ id: 's1', point: '', pointType: 'turning' }] }],
    }));
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Chọn mốc xuất phát');
    expect(html).toContain('Tìm nhanh theo tên mốc');
    expect(html).toContain('DG1');
    expect(html).toContain('DG2');
    expect(html).toContain('0,000');
    expect(html).not.toContain('Cao độ gốc theo mét');
  });

  it('hiển thị thẻ mốc và nút đổi mốc ngay trên màn hình Đo', () => {
    localStorage.setItem('so-thuy-chuan.active-draft.v2', JSON.stringify({
      schemaVersion: 5,
      id: 'book-origin',
      name: 'Sổ đang đo',
      benchmarks: [{ id: 'b1', name: 'A1', elevation: '2,345' }],
      runs: [{ id: 'r1', name: 'Lượt 1', roundNumber: 1, startPoint: 'A1', mode: 'single', stations: [{ id: 's1', point: '', pointType: 'turning' }] }],
    }));
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Mốc xuất phát');
    expect(html).toContain('2,345');
    expect(html).toContain('Đổi mốc');
  });

  it('hiện thông báo lỗi rõ ràng khi số đọc không hợp lệ trước lúc lưu', () => {
    const html = renderToStaticMarkup(<QualityCard errors={[{ field: 'fs', message: 'Mia trước (FS) phải là số dương.' }]} />);
    expect(html).toContain('class="quality-card"');
    expect(html).toContain('data-level="error"');
    expect(html).toContain('Chưa thể lưu trạm');
    expect(html).toContain('Mia trước (FS) phải là số dương.');
  });
});
