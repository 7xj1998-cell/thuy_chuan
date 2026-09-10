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
    globalThis.scrollTo = () => {};
  });

  it('đặt bộ reng lượt, trạng thái lưu và cài đặt trong một hàng gọn', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('class="measure-run-header"');
    expect(html).toContain('Chọn lượt đo');
    expect(html).toContain('Cài đặt Lượt 1');
  });

  it('khởi tạo sổ trống không chứa điểm mẫu DG3 hoặc DG4', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).not.toContain('DG3');
    expect(html).not.toContain('DG4');
  });

  it('dùng đầu vào mét, khoảng cách tùy chọn và chênh cao tích lũy', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Số đọc mia sau BS theo mét');
    expect(html).toContain('placeholder="0,000"');
    expect(html).toContain('placeholder="Nhập khoảng cách (m)..."');
    expect(html).toContain('Chênh cao tích lũy');
    expect(html).not.toContain('Cao máy · HI');
  });

  it('bỏ lựa chọn Tia phụ khỏi luồng mới, giữ combobox và ghost name theo lượt', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).not.toContain('Chọn loại điểm tới');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('placeholder="1.1"');
    expect(html).not.toContain('Chọn DC1');
  });

  it('có hoàn tác nội bộ không phụ thuộc thao tác lắc của iPhone', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Chưa có thay đổi để hoàn tác');
    expect(html).toContain('Hoàn tác');
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

  it('đo 3 chỉ dùng hai thẻ toàn chiều rộng và bảo vệ cả sáu ô số đọc', () => {
    localStorage.setItem('so-thuy-chuan.active-draft.v2', JSON.stringify({
      schemaVersion: 6,
      id: 'book-three-reading',
      name: 'Sổ đo 3 chỉ',
      benchmarks: [{ id: 'b1', name: 'DG1', elevation: '1,000' }],
      runs: [{ id: 'r1', name: 'Lượt 1', roundNumber: 1, startPoint: 'DG1', startMode: 'known', mode: 'three', stations: [{
        id: 's1', point: '', pointType: 'turning', bsUpper: '1,234', bsMiddle: '1,200', bsLower: '1,166', fsUpper: '0,998', fsMiddle: '0,965', fsLower: '0,932',
      }] }],
      settings: {},
    }));
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('readings is-three');
    expect(html).toContain('three-reading-matrix');
    expect(html).toContain('Mia sau');
    expect(html).toContain('Mia trước');
    expect(html).toContain('value="1,234"');
    expect(html).toContain('value="0,932"');
    expect(html.match(/data-confirm-clear="true"/g)).toHaveLength(6);
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
    expect(html).toContain('Điểm xuất phát');
    expect(html).toContain('Mốc đầu đã biết');
    expect(html).toContain('Mốc đầu chưa biết');
    expect(html).toContain('DG1');
    expect(html).toContain('DG2');
    expect(html).toContain('0,000');
    expect(html).not.toContain('Cao độ gốc theo mét');
  });

  it('hiển thị gọn điểm đặt mia sau, cao độ và nút cài đặt lượt', () => {
    localStorage.setItem('so-thuy-chuan.active-draft.v2', JSON.stringify({
      schemaVersion: 5,
      id: 'book-origin',
      name: 'Sổ đang đo',
      benchmarks: [{ id: 'b1', name: 'A1', elevation: '2,345' }],
      runs: [{ id: 'r1', name: 'Lượt 1', roundNumber: 1, startPoint: 'A1', mode: 'single', stations: [{ id: 's1', point: '', pointType: 'turning' }] }],
    }));
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Điểm đặt mia sau');
    expect(html).toContain('2,345');
    expect(html).toContain('Cài đặt Lượt 1');
  });

  it('hiện thông báo lỗi rõ ràng khi số đọc không hợp lệ trước lúc lưu', () => {
    const html = renderToStaticMarkup(<QualityCard errors={[{ field: 'fs', message: 'Mia trước (FS) phải là số dương.' }]} />);
    expect(html).toContain('class="quality-card"');
    expect(html).toContain('data-level="error"');
    expect(html).toContain('Chưa thể lưu trạm');
    expect(html).toContain('Mia trước (FS) phải là số dương.');
  });
});
