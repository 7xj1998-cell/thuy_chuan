import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';

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
});
