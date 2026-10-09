import { describe, expect, it } from 'vitest';
import { createRun, createStation, finalizeStation, normalizeBook, removeStation, solveRun, adjustLevelingNetwork } from './model';
import { inspectStation } from './fieldChecks';
import { stationOrigin } from './pointNames';
import { remapBacksightLinks, shareBacksight, useNewBacksight, withInheritedBacksights } from './stationSetup';

const makeRun = (mode = 'three') => ({ ...createRun(4, '4.1'), mode, stations: [
  { ...createStation('DG4L1'), id: 'source', committedAt: 1, bs: '0,900', fs: '1,538', bsUpper: '1,024', bsMiddle: '0,900', bsLower: '0,776', fsUpper: '1,632', fsMiddle: '1,538', fsLower: '1,442' },
  { ...createStation('DG4L2', 'side'), id: 'side', fs: '1,081', fsMiddle: '1,081', fsUpper: '1,181', fsLower: '0,981' },
] });
const controls = [{ name: '4.1', elevation: '3,188' }];

describe('mia sau dùng chung theo lần đặt máy', () => {
  it.each(['single', 'three'])('sửa tình huống ảnh: TP sau ĐC dùng BS và gốc trạm trước (%s)', (mode) => {
    const run = withInheritedBacksights(makeRun(mode));
    expect(run.stations[1]).toMatchObject({ backsightMode: 'shared', backsightSourceId: 'source', backsightOriginPoint: '4.1' });
    expect(stationOrigin(run, 1)).toBe('4.1');
    const solved = solveRun(run, controls);
    expect(solved.rows[0].elevation).toBe(2550);
    expect(solved.rows[1]).toMatchObject({ fromName: '4.1', fromElevation: 3188, bs: 900, hi: 4088, elevation: 3007 });
    expect(solved.endPoint).toBe('DG4L1');
    expect(inspectStation({ benchmarks: controls }, run, 1).errors).toEqual([]);
    const adjustment = adjustLevelingNetwork([solved], controls);
    expect(adjustment.sidePoints[0]).toMatchObject({ name: 'DG4L2', fromName: '4.1', elevation: 3007 });
  });

  it('lưu tia phụ tiếp tục giữ đủ ba chỉ BS, gốc và chỉ để FS trống', () => {
    const run = makeRun();
    const result = finalizeStation(run, 1);
    expect(result.stations[2]).toMatchObject({ point: '', pointType: 'side', backsightSourceId: 'source', backsightOriginPoint: '4.1', bsUpper: '1,024', bsMiddle: '0,900', bsLower: '0,776', fsUpper: '', fsMiddle: '', fsLower: '' });
    expect(result.stations[1].fsMiddle).toBe('1,081');
  });

  it('sửa BS gốc cập nhật mọi TP liên kết, không lấy FS trạm trước làm BS', () => {
    let run = withInheritedBacksights(makeRun());
    run.stations.push(shareBacksight(run, 2, { ...createStation('TP.4.2', 'side'), fsMiddle: '1,000' }));
    run.stations[0].bsMiddle = '0,910';
    run = withInheritedBacksights(run);
    expect(run.stations.slice(1).map((station) => station.bsMiddle)).toEqual(['0,910', '0,910']);
    expect(solveRun(run, controls).sideRows.map((row) => row.elevation)).toEqual([3017, 3098]);
  });

  it('không thay số BS tự nhập hoặc tia phụ cũ đã lưu', () => {
    const run = makeRun();
    run.stations[1].bsMiddle = '2,000';
    expect(withInheritedBacksights(run).stations[1].bsMiddle).toBe('2,000');
    run.stations[1] = { ...createStation('OLD', 'side'), committedAt: 1 };
    expect(withInheritedBacksights(run).stations[1].backsightMode).toBeUndefined();
    expect(solveRun(run, controls).rows[1].elevation).toBeNull();
  });

  it('xóa BS gốc không giữ số cũ trong TP liên kết và không tính cao độ giả', () => {
    const run = withInheritedBacksights(makeRun());
    run.stations[0].bsMiddle = '';
    expect(withInheritedBacksights(run).stations[1].bsMiddle).toBe('');
    expect(solveRun(run, controls).rows[1].elevation).toBeNull();
    expect(inspectStation({ benchmarks: controls }, run, 1).errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'bsMiddle', code: 'missing' })]));
  });

  it('đã chuyển máy: gỡ liên kết, giữ FS, không tự điền BS cũ khi mở lại', () => {
    const run = withInheritedBacksights(makeRun());
    run.stations[1] = useNewBacksight(run.stations[1], run.mode);
    expect(withInheritedBacksights(run).stations[1]).toMatchObject({ backsightMode: 'manual', bsMiddle: '', fsMiddle: '1,081' });
    expect(run.stations[1].backsightSourceId).toBeUndefined();
    expect(stationOrigin(run, 1)).toBe('DG4L1');
    expect(inspectStation({ benchmarks: controls }, run, 1).errors).toHaveLength(3);
  });

  it('mở lại nháp cũ được sửa, normalize lặp không đổi dữ liệu và không chia sẻ qua lượt', () => {
    const book = normalizeBook({ schemaVersion: 7, benchmarks: controls, runs: [makeRun(), { ...createRun(5, 'DG4L1'), stations: [createStation('', 'side')] }] });
    expect(book.schemaVersion).toBe(8);
    expect(book.runs[0].stations[1].bsMiddle).toBe('0,900');
    expect(book.runs[1].stations[0].backsightSourceId).toBeUndefined();
    expect(normalizeBook(book)).toEqual(book);
  });

  it('xóa trạm nguồn giữ ảnh chụp BS và gốc; nhân bản đổi ID liên kết trong cùng lượt', () => {
    const run = withInheritedBacksights(makeRun());
    const removed = { ...run, stations: removeStation(run, 0).stations };
    expect(solveRun(removed, controls).rows[0]).toMatchObject({ fromName: '4.1', elevation: 3007 });
    const stations = remapBacksightLinks(run.stations, new Map([['source', 'new-source'], ['side', 'new-side']]));
    expect(stations[1].backsightSourceId).toBe('new-source');
    stations[0].bsMiddle = '0,920';
    expect(solveRun({ ...run, stations }, controls).rows[1].elevation).toBe(3027);
  });
});
