import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ElevationProfile } from './FieldUI';

describe('mặt cắt cao độ', () => {
  it('hiện đầy đủ tên và cao độ của điểm giữa khi tuyến vượt 7 điểm', () => {
    const solved = { points: [{ name: 'MỐC ĐẦU', elevation: 1000 }], chainRows: Array.from({ length: 12 }, (_, i) => ({ point: `ĐIỂM TRUNG GIAN TÊN DÀI ${i + 1}`, elevation: 1000 + i * 100 })) };
    const html = renderToStaticMarkup(<ElevationProfile solved={solved} />);
    for (const row of solved.chainRows) expect(html).toContain(row.point);
    expect(html).toContain('2,100 m');
    expect(html.match(/class="profile-point-label"/g)).toHaveLength(13);
    expect(html).not.toContain('…');
    expect(html).toContain('không theo khoảng cách');
  });

  it('giữ tên điểm chưa có cao độ và không nối đường qua khoảng thiếu số liệu', () => {
    const solved = { points: [{ name: 'A', elevation: 1000 }], chainRows: [
      { point: 'B', elevation: 1100 }, { point: 'C', elevation: null },
      { point: 'D', elevation: 1200 }, { point: 'E', elevation: 1300 },
    ] };
    const html = renderToStaticMarkup(<ElevationProfile solved={solved} />);
    expect(html).toContain('<b>C</b>');
    expect(html).toContain('Chưa có cao độ');
    expect(html.match(/<polyline/g)).toHaveLength(2);
  });

  it('giữ cả hai lần xuất hiện của mốc khép tuyến và xử lý tuyến bằng phẳng', () => {
    const solved = { points: [{ name: 'A', elevation: 0 }], chainRows: [{ point: 'B', elevation: 0 }, { point: 'A', elevation: 0 }] };
    const html = renderToStaticMarkup(<ElevationProfile solved={solved} />);
    expect(html.match(/class="profile-point-label"/g)).toHaveLength(3);
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    expect(html).toContain('0,000 m');
  });
});
