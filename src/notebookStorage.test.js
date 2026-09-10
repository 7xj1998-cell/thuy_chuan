import { describe, expect, it } from 'vitest';
import { createBook, createStation, STORAGE_KEYS } from './model';
import { CHECKPOINT_LIMIT, createNotebookLibrary, LIBRARY_KEYS } from './notebookStorage';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  let rejected = null;
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      if (rejected === '*' || rejected === key) {
        const error = new Error('Storage quota exceeded');
        error.name = 'QuotaExceededError';
        throw error;
      }
      values.set(key, String(value));
    },
    removeItem: (key) => values.delete(key),
    reject: (key = '*') => { rejected = key; },
    allow: () => { rejected = null; },
  };
}

function measuredBook(name = 'Sổ hiện trường') {
  const book = createBook();
  return { ...book, name, benchmarks: [{ id: 'a1', name: 'A1', elevation: '2,000' }],
    runs: [{ ...book.runs[0], startPoint: 'A1', stations: [
      { ...createStation('DC1'), bs: '1,234', fs: '0,958', committedAt: 123456,
        acknowledgedWarnings: ['large-delta'] },
    ] }] };
}

const saved = (storage) => JSON.parse(storage.getItem(LIBRARY_KEYS.primary));
const active = (storage) => { const library = saved(storage); return library.books.find((book) => book.id === library.activeBookId); };

describe('thư viện tự lưu và nhập tệp an toàn', () => {
  it('tự lưu từng lần nhập và giữ nguyên số đọc đang nhập dở cùng metadata', () => {
    const storage = memoryStorage();
    const store = createNotebookLibrary(storage);
    store.initialize();
    const book = measuredBook();
    expect(store.updateBook(() => ({ ...book, runs: [{ ...book.runs[0], stations: [{ ...book.runs[0].stations[0], fs: '0,' }] }] }))).toBe(true);
    expect(active(storage).runs[0].stations[0]).toMatchObject({ fs: '0,', committedAt: 123456, acknowledgedWarnings: ['large-delta'] });
    expect(createNotebookLibrary(storage).getSnapshot().book.runs[0].stations[0].fs).toBe('0,');
  });

  it('chuyển sổ, tạo mới và sao chép không làm mất nháp của bất kỳ sổ nào', () => {
    const storage = memoryStorage();
    const store = createNotebookLibrary(storage);
    store.initialize();
    store.updateBook({ name: 'Công trình A' });
    const first = store.getSnapshot().book.id;
    store.newBook();
    store.updateBook({ name: 'Công trình B' });
    const second = store.getSnapshot().book.id;
    store.copyBook('B bản sao');
    expect(store.getSnapshot().books).toHaveLength(3);
    store.openBook(first);
    expect(store.getSnapshot().book.name).toBe('Công trình A');
    store.openBook({ id: second, name: 'Snapshot lỗi thời' });
    expect(store.getSnapshot().book.name).toBe('Công trình B');
    expect(createNotebookLibrary(storage).getSnapshot().books.map((book) => book.name).sort()).toEqual(['B bản sao', 'Công trình A', 'Công trình B']);
  });

  it('chuyển đổi toàn bộ sổ v2, sổ v1 và bản nháp; không xóa khóa cũ', () => {
    const v2 = measuredBook('Sổ đã lưu');
    const draft = { ...v2, name: 'Sổ đang nhập', updatedAt: v2.updatedAt + 1000 };
    const legacy = { id: 'legacy', name: 'Sổ 2024', startName: 'A1', startElevation: '2000', outward: [{ point: 'DC1', bs: '1234', fs: '958' }], returning: [] };
    const old = { [STORAGE_KEYS.books]: JSON.stringify([v2]), [STORAGE_KEYS.legacy]: JSON.stringify([legacy]), [STORAGE_KEYS.draft]: JSON.stringify(draft) };
    const storage = memoryStorage(old);
    const store = createNotebookLibrary(storage);
    expect(store.initialize()).toBe(true);
    expect(store.getSnapshot().book.name).toBe('Sổ đang nhập');
    expect(store.getSnapshot().books.map((book) => book.name).sort()).toEqual(['Sổ 2024', 'Sổ đang nhập']);
    expect(store.getSnapshot().checkpoints[0].book.name).toBe('Sổ đã lưu');
    for (const [key, value] of Object.entries(old)) expect(storage.getItem(key)).toBe(value);
    expect(createNotebookLibrary(storage).getSnapshot().book.name).toBe('Sổ đang nhập');
  });

  it('nâng thư viện v5 lên v7 an toàn và có thể chạy migration nhiều lần', () => {
    const storage = memoryStorage();
    const initial = createNotebookLibrary(storage);
    initial.initialize();
    const old = saved(storage);
    old.schemaVersion = 5;
    old.books = old.books.map((book) => ({ ...book, schemaVersion: 5, runs: book.runs.map(({ startMode: _removed, ...run }) => run) }));
    storage.setItem(LIBRARY_KEYS.primary, JSON.stringify(old));
    const migrated = createNotebookLibrary(storage);
    expect(migrated.initialize()).toBe(true);
    expect(saved(storage).schemaVersion).toBe(7);
    expect(active(storage).schemaVersion).toBe(7);
    expect(active(storage).runs.every((run) => run.startMode === 'known')).toBe(true);
    const once = storage.getItem(LIBRARY_KEYS.primary);
    expect(createNotebookLibrary(storage).initialize()).toBe(true);
    expect(storage.getItem(LIBRARY_KEYS.primary)).toBe(once);
  });

  it('không bỏ sót hai sổ cũ có ID trùng nhau và một nháp độc lập', () => {
    const first = measuredBook('Đo buổi sáng');
    const second = { ...first, name: 'Đo buổi chiều' };
    const draft = measuredBook('Nháp chưa từng bấm lưu');
    const storage = memoryStorage({ [STORAGE_KEYS.books]: JSON.stringify([first, second]), [STORAGE_KEYS.draft]: JSON.stringify(draft) });
    const store = createNotebookLibrary(storage);
    expect(store.initialize()).toBe(true);
    expect(store.getSnapshot().books).toHaveLength(3);
    expect(new Set(store.getSnapshot().books.map((book) => book.id)).size).toBe(3);
    expect(store.getSnapshot().book.name).toBe(draft.name);
  });

  it('nhập nhiều sổ cùng ID luôn cấp ID mới và giữ nguyên sổ hiện tại đã nhập', () => {
    const storage = memoryStorage();
    const store = createNotebookLibrary(storage);
    store.initialize();
    store.updateBook({ name: 'Nháp gốc' });
    const original = store.getSnapshot().book;
    const incoming = { ...measuredBook('Sổ nhập'), id: original.id };
    expect(store.importBooks([incoming, incoming])).toBe(true);
    expect(store.getSnapshot().books).toHaveLength(3);
    expect(new Set(store.getSnapshot().books.map((book) => book.id)).size).toBe(3);
    expect(store.getSnapshot().books.find((book) => book.id === original.id)).toEqual(original);
    expect(createNotebookLibrary(storage).getSnapshot().books).toHaveLength(3);
  });

  it.each([
    '{ broken JSON', {}, { schemaVersion: 5, benchmarks: [], runs: [{ stations: 'bad' }] },
    [measuredBook(), { runs: [] }], [],
    { ...measuredBook(), benchmarks: [{ name: 'A1', elevation: { value: 2 } }] },
  ])('file hỏng hoặc một sổ sai trong lô nhập không thay đổi thư viện: %#', (input) => {
    const storage = memoryStorage();
    const store = createNotebookLibrary(storage);
    store.initialize();
    const before = storage.getItem(LIBRARY_KEYS.primary);
    const book = store.getSnapshot().book;
    expect(store.importBooks(input)).toBe(false);
    expect(storage.getItem(LIBRARY_KEYS.primary)).toBe(before);
    expect(store.getSnapshot().book).toEqual(book);
    expect(store.getSnapshot().storageError).toBeTruthy();
  });

  it('quota thất bại giữ số vừa nhập trong RAM và JSON, chặn tạo/mở/nhập/xóa sổ', () => {
    const storage = memoryStorage();
    const store = createNotebookLibrary(storage);
    store.initialize();
    const first = store.getSnapshot().book.id;
    store.newBook();
    const lastDisk = storage.getItem(LIBRARY_KEYS.primary);
    storage.reject(LIBRARY_KEYS.primary);
    expect(store.updateBook({ name: 'Dữ liệu mới chưa ghi được' })).toBe(false);
    expect(store.getSnapshot().book.name).toBe('Dữ liệu mới chưa ghi được');
    expect(store.getSnapshot().storageError).toContain('Bộ nhớ thiết bị không đủ');
    const pendingId = store.getSnapshot().book.id;
    expect(store.newBook()).toBe(false);
    expect(store.openBook(first)).toBe(false);
    expect(store.copyBook('Bản sao')).toBe(false);
    expect(store.importBooks(measuredBook())).toBe(false);
    expect(store.deleteBook(pendingId)).toBe(false);
    expect(store.getSnapshot().book.id).toBe(pendingId);
    expect(store.getSnapshot().books).toHaveLength(2);
    expect(storage.getItem(LIBRARY_KEYS.primary)).toBe(lastDisk);
    expect(JSON.parse(store.exportBackup()).library.books.find((book) => book.id === pendingId).name).toBe('Dữ liệu mới chưa ghi được');
    storage.allow();
    expect(store.saveNow()).toBe(true);
    expect(active(storage).name).toBe('Dữ liệu mới chưa ghi được');
    expect(store.getSnapshot().saveState).toBe('saved');
  });

  it('lỗi ghi bản dự phòng chặn primary; bản cũ không bị thay thế', () => {
    const storage = memoryStorage();
    const store = createNotebookLibrary(storage);
    store.initialize();
    const before = storage.getItem(LIBRARY_KEYS.primary);
    storage.reject(LIBRARY_KEYS.previous);
    expect(store.newBook()).toBe(false);
    expect(storage.getItem(LIBRARY_KEYS.primary)).toBe(before);
    expect(store.getSnapshot().books).toHaveLength(1);
  });

  it('phục hồi từ bản tốt trước đó và lưu riêng nguyên văn primary bị hỏng', () => {
    const storage = memoryStorage();
    const store = createNotebookLibrary(storage);
    store.initialize();
    store.updateBook({ name: 'Bản tốt gần nhất' });
    store.updateBook({ name: 'Bản vừa ghi' });
    const good = storage.getItem(LIBRARY_KEYS.previous);
    const damaged = '{ "books": [ truncated';
    storage.setItem(LIBRARY_KEYS.primary, damaged);
    const recovered = createNotebookLibrary(storage);
    expect(recovered.getSnapshot().book.name).toBe('Bản tốt gần nhất');
    expect(recovered.getSnapshot().saveState).toBe('recovered');
    expect(recovered.initialize()).toBe(true);
    expect(storage.getItem(LIBRARY_KEYS.previous)).toBe(good);
    const archives = [...storage.values].filter(([key]) => key.startsWith(LIBRARY_KEYS.recoveryPrefix));
    expect(archives).toHaveLength(1);
    expect(JSON.parse(archives[0][1]).raw).toBe(damaged);
    expect(active(storage).name).toBe('Bản tốt gần nhất');
  });

  it('không ghi đè primary lỗi khi không có bản tốt, kể cả còn sổ legacy cũ', () => {
    const damaged = '{ "current": "only copy';
    const storage = memoryStorage({ [LIBRARY_KEYS.primary]: damaged, [STORAGE_KEYS.books]: JSON.stringify([measuredBook('Sổ rất cũ')]) });
    const store = createNotebookLibrary(storage);
    expect(store.initialize()).toBe(false);
    expect(store.updateBook({ name: 'Thử sửa' })).toBe(false);
    expect(store.newBook()).toBe(false);
    expect(storage.getItem(LIBRARY_KEYS.primary)).toBe(damaged);
    expect(JSON.parse(store.exportBackup()).unreadableSources).toContainEqual({ key: LIBRARY_KEYS.primary, raw: damaged });
  });

  it('không ghi đè dữ liệu legacy duy nhất bị hỏng bằng một sổ trống', () => {
    const storage = memoryStorage({ [STORAGE_KEYS.draft]: '{ bad' });
    const store = createNotebookLibrary(storage);
    expect(store.initialize()).toBe(false);
    expect(store.saveNow()).toBe(false);
    expect(storage.getItem(LIBRARY_KEYS.primary)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.draft)).toBe('{ bad');
  });

  it('lưu riêng previous bị hỏng trước khi thay bằng primary tốt', () => {
    const storage = memoryStorage();
    const store = createNotebookLibrary(storage);
    store.initialize();
    storage.setItem(LIBRARY_KEYS.previous, 'broken previous');
    expect(store.updateBook({ name: 'Mới' })).toBe(true);
    const archive = [...storage.values].find(([key]) => key.startsWith(LIBRARY_KEYS.recoveryPrefix));
    expect(JSON.parse(archive[1])).toMatchObject({ key: LIBRARY_KEYS.previous, raw: 'broken previous' });
  });

  it('xóa vào thùng rác và phục hồi giữ đủ số đọc; lỗi quota không làm mất bản trong thùng rác', () => {
    const storage = memoryStorage();
    const store = createNotebookLibrary(storage);
    store.initialize();
    store.updateBook(() => measuredBook());
    const original = cloneBook(store.getSnapshot().book);
    expect(store.deleteBook(original.id)).toBe(true);
    const entry = store.getSnapshot().trash[0];
    expect(store.getSnapshot().books).toHaveLength(1);
    expect(store.getSnapshot().book.id).not.toBe(original.id);
    storage.reject();
    expect(store.restoreDeleted(entry.id)).toBe(false);
    expect(store.getSnapshot().trash).toHaveLength(1);
    storage.allow();
    expect(store.restoreDeleted(entry.id)).toBe(true);
    expect(store.getSnapshot().book.runs).toEqual(original.runs);
    expect(store.getSnapshot().trash).toHaveLength(0);
  });

  it('checkpoint giới hạn, phục hồi thành bản sao giữ nguyên dữ liệu mới nhất', () => {
    const storage = memoryStorage();
    const store = createNotebookLibrary(storage);
    store.initialize();
    for (let index = 0; index < CHECKPOINT_LIMIT + 5; index += 1) {
      store.updateBook({ name: `Trạm ${index}` }, { checkpoint: 'Hoàn tất trạm' });
    }
    expect(store.getSnapshot().checkpoints).toHaveLength(CHECKPOINT_LIMIT);
    const original = store.getSnapshot().book;
    const entry = store.getSnapshot().checkpoints[0];
    expect(store.restoreCheckpoint(entry.id)).toBe(true);
    expect(store.getSnapshot().book.name).toBe(`${entry.book.name} (phục hồi)`);
    expect(store.getSnapshot().book.id).not.toBe(original.id);
    expect(store.getSnapshot().books.find((book) => book.id === original.id)).toEqual(original);
  });

  it('hoàn tác tại chỗ giữ bản dữ liệu hiện tại để có thể phục hồi', () => {
    const storage = memoryStorage();
    const store = createNotebookLibrary(storage);
    store.initialize();
    store.updateBook({ name: 'Trước khi lưu trạm' });
    store.updateBook({ name: 'Sau khi lưu trạm' }, { checkpoint: 'Hoàn tất trạm' });
    const currentId = store.getSnapshot().book.id;
    const entry = store.getSnapshot().checkpoints.find((item) => item.reason === 'Hoàn tất trạm');

    expect(store.undoCheckpoint(entry.id)).toBe(true);
    expect(store.getSnapshot().book.id).toBe(currentId);
    expect(store.getSnapshot().book.name).toBe('Trước khi lưu trạm');
    expect(store.getSnapshot().checkpoints[0]).toMatchObject({ reason: 'Bản trước khi hoàn tác', kind: 'undo-backup' });
    expect(store.getSnapshot().checkpoints[0].book.name).toBe('Sau khi lưu trạm');
    expect(createNotebookLibrary(storage).getSnapshot().book.name).toBe('Trước khi lưu trạm');
  });

  it('xóa trạm hoặc hoàn tất trạm chỉ được áp dụng khi lưu thành công', () => {
    const storage = memoryStorage();
    const store = createNotebookLibrary(storage);
    store.initialize();
    store.updateBook(() => measuredBook());
    const before = cloneBook(store.getSnapshot().book);
    storage.reject();
    expect(store.updateBook((book) => ({ ...book, runs: [] }))).toBe(false);
    expect(store.updateBook({ name: 'Hoàn tất' }, { checkpoint: 'Hoàn tất trạm' })).toBe(false);
    expect(store.getSnapshot().book).toEqual(before);
    storage.allow();
    expect(store.updateBook((book) => ({ ...book, runs: [...book.runs, { ...book.runs[0], id: 'run-2' }] }))).toBe(true);
    expect(store.updateBook((book) => ({ ...book, runs: book.runs.slice(0, 1) }))).toBe(true);
    expect(store.getSnapshot().checkpoints[0].book.runs).toHaveLength(2);
  });

  it('backup JSON chứa mọi sổ/nháp/thùng rác/phiên bản và nhập không ghi đè', () => {
    const source = createNotebookLibrary(memoryStorage());
    source.initialize();
    source.updateBook({ name: 'A' });
    source.newBook();
    source.updateBook({ name: 'B' });
    source.newBook();
    source.updateBook({ name: 'C' });
    source.deleteBook(source.getSnapshot().book.id);
    const backup = source.exportBackup();
    const targetStorage = memoryStorage();
    const target = createNotebookLibrary(targetStorage);
    target.initialize();
    target.updateBook({ name: 'Sổ đang dùng trên máy mới' });
    const id = target.getSnapshot().book.id;
    expect(target.importBooks(backup)).toBe(true);
    expect(target.getSnapshot().books).toHaveLength(3);
    expect(target.getSnapshot().books.find((book) => book.id === id).name).toBe('Sổ đang dùng trên máy mới');
    expect(target.getSnapshot().trash).toHaveLength(1);
    expect(target.getSnapshot().trash[0].book.name).toBe('C');
    expect(target.getSnapshot().checkpoints.length).toBeGreaterThan(1);
    expect(new Set(target.getSnapshot().books.map((book) => book.id)).size).toBe(3);
  });

  it('không ghi đè cập nhật từ cửa sổ khác; nháp xung đột vẫn xuất được', () => {
    const storage = memoryStorage();
    const first = createNotebookLibrary(storage);
    first.initialize();
    const second = createNotebookLibrary(storage);
    first.updateBook({ name: 'Cửa sổ 1' });
    expect(second.updateBook({ name: 'Cửa sổ 2' })).toBe(false);
    expect(second.getSnapshot().storageError).toContain('cửa sổ khác');
    expect(active(storage).name).toBe('Cửa sổ 1');
    expect(JSON.parse(second.exportBackup()).library.books[0].name).toBe('Cửa sổ 2');
  });

  it('bộ nhớ không khả dụng vẫn cho nhập và xuất JSON, nhưng không báo đã lưu', () => {
    const store = createNotebookLibrary(null);
    expect(store.initialize()).toBe(false);
    expect(store.updateBook({ name: 'Nháp an toàn' })).toBe(false);
    expect(store.getSnapshot().saveState).toBe('error');
    expect(JSON.parse(store.exportBackup()).library.books[0].name).toBe('Nháp an toàn');
  });
});

const cloneBook = (book) => structuredClone(book);
