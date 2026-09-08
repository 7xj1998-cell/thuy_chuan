import { uid } from './calc';
import { createBook, migrateLegacyBook, normalizeBook, STORAGE_KEYS } from './model';

export const LIBRARY_KEYS = {
  primary: 'so-thuy-chuan.library.v5',
  previous: 'so-thuy-chuan.library.v5.previous',
  recoveryPrefix: 'so-thuy-chuan.library.v5.recovery.',
};
export const CHECKPOINT_LIMIT = 12;
const LIBRARY_FORMAT = 'so-thuy-chuan.library';
const BACKUP_FORMAT = 'so-thuy-chuan.backup';
const clone = (value) => structuredClone(value);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (message) => { throw new Error(message); };

function checkText(value, label) {
  if (value !== undefined && value !== null && typeof value !== 'string') fail(`${label} không hợp lệ.`);
}

function checkNumericDraft(value, label) {
  if (value !== undefined && value !== null && typeof value !== 'string'
    && !(typeof value === 'number' && Number.isFinite(value))) fail(`${label} không hợp lệ.`);
}

function checkIds(items, label, required = false) {
  const ids = new Set();
  items.forEach((item) => {
    if (!isObject(item)) fail(`${label} không hợp lệ.`);
    if (item.id === undefined || item.id === null || item.id === '') {
      if (required) fail(`${label} thiếu mã nhận dạng.`);
      return;
    }
    if (typeof item.id !== 'string' || ids.has(item.id)) fail(`${label} có mã nhận dạng không hợp lệ hoặc trùng.`);
    ids.add(item.id);
  });
}

// Validation happens BEFORE normalization: an arbitrary JSON object must never
// become a seemingly valid empty book and overwrite useful field measurements.
function validateBook(raw) {
  if (!isObject(raw) || !Array.isArray(raw.benchmarks) || !Array.isArray(raw.runs)) fail('Sổ không có cấu trúc mốc chuẩn và lượt đo hợp lệ.');
  if (raw.schemaVersion !== undefined && (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 2 || raw.schemaVersion > 5)) fail('Phiên bản dữ liệu sổ chưa được hỗ trợ.');
  checkText(raw.id, 'Mã sổ');
  checkText(raw.name, 'Tên sổ');
  if (raw.settings !== undefined && !isObject(raw.settings)) fail('Thiết lập sổ không hợp lệ.');
  checkIds(raw.benchmarks, 'Mốc chuẩn');
  checkIds(raw.runs, 'Lượt đo');
  raw.benchmarks.forEach((benchmark) => {
    if (!isObject(benchmark)) fail('Mốc chuẩn không hợp lệ.');
    checkText(benchmark.name, 'Tên mốc');
    checkNumericDraft(benchmark.elevation, 'Cao độ mốc');
  });
  raw.runs.forEach((run) => {
    if (!isObject(run) || !Array.isArray(run.stations)) fail('Lượt đo không có danh sách trạm hợp lệ.');
    checkText(run.name, 'Tên lượt');
    checkText(run.startPoint, 'Điểm đầu');
    if (run.mode !== undefined && !['single', 'three'].includes(run.mode)) fail('Chế độ đo không hợp lệ.');
    checkIds(run.stations, 'Trạm đo');
    run.stations.forEach((station) => {
      if (!isObject(station)) fail('Trạm đo không hợp lệ.');
      checkText(station.point, 'Điểm tới');
      if (station.pointType !== undefined && !['turning', 'side'].includes(station.pointType)) fail('Loại điểm đo không hợp lệ.');
      ['bs', 'fs', 'distance', 'bsUpper', 'bsMiddle', 'bsLower', 'fsUpper', 'fsMiddle', 'fsLower'].forEach((field) => checkNumericDraft(station[field], 'Số đọc'));
    });
  });
  return raw;
}

function importBook(raw) {
  if (isObject(raw) && (Array.isArray(raw.outward) || Array.isArray(raw.returning))) {
    for (const field of ['outward', 'returning']) {
      if (raw[field] !== undefined && !Array.isArray(raw[field])) fail('Sổ cũ có danh sách trạm không hợp lệ.');
      (raw[field] || []).forEach((station) => {
        if (!isObject(station)) fail('Sổ cũ có trạm đo không hợp lệ.');
        checkText(station.point, 'Điểm tới');
        ['bs', 'fs', 'distance'].forEach((key) => checkNumericDraft(station[key], 'Số đọc'));
      });
    }
    checkText(raw.startName, 'Điểm đầu');
    checkNumericDraft(raw.startElevation, 'Cao độ đầu');
    return migrateLegacyBook(clone(raw));
  }
  validateBook(raw);
  return normalizeBook(clone(raw));
}

function validateLibrary(library) {
  if (!isObject(library) || library.format !== LIBRARY_FORMAT || library.schemaVersion !== 5
    || !Array.isArray(library.books) || !library.books.length
    || !Array.isArray(library.trash) || !Array.isArray(library.checkpoints)
    || !Number.isInteger(library.revision) || library.revision < 0) fail('Thư viện sổ không đúng định dạng.');
  const ids = new Set();
  library.books.forEach((book) => {
    validateBook(book);
    if (!book.runs.length || book.runs.some((run) => !run.stations.length)) fail('Sổ đang lưu thiếu lượt hoặc trạm làm việc.');
    checkIds(book.benchmarks, 'Mốc chuẩn', true);
    checkIds(book.runs, 'Lượt đo', true);
    book.runs.forEach((run) => checkIds(run.stations, 'Trạm đo', true));
    if (typeof book.id !== 'string' || !book.id || ids.has(book.id)) fail('Thư viện có mã sổ bị thiếu hoặc trùng.');
    ids.add(book.id);
  });
  if (!ids.has(library.activeBookId)) fail('Không tìm thấy sổ đang mở trong thư viện.');
  for (const [field, timeField] of [['trash', 'deletedAt'], ['checkpoints', 'createdAt']]) {
    const entryIds = new Set();
    library[field].forEach((entry) => {
      if (!isObject(entry) || typeof entry.id !== 'string' || !entry.id || entryIds.has(entry.id)
        || !Number.isFinite(entry[timeField])) fail('Dữ liệu phục hồi sổ không hợp lệ.');
      entryIds.add(entry.id);
      validateBook(entry.book);
    });
  }
  return library;
}

function envelope(books, activeBookId, checkpoints = []) {
  return { format: LIBRARY_FORMAT, schemaVersion: 5, revision: 0, books, activeBookId, trash: [], checkpoints, updatedAt: Date.now() };
}

function checkpoint(book, reason) {
  return { id: uid(), book: clone(book), createdAt: Date.now(), reason };
}

function withCheckpoint(library, book, reason) {
  return { ...library, checkpoints: [checkpoint(book, reason), ...library.checkpoints].slice(0, CHECKPOINT_LIMIT) };
}

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function storageMessage(error) {
  if (error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return 'Bộ nhớ thiết bị không đủ để lưu. Dữ liệu vừa nhập vẫn đang trên màn hình; hãy xuất sao lưu JSON trước khi đóng ứng dụng.';
  }
  return error?.message || 'Không thể lưu trên thiết bị. Hãy xuất sao lưu JSON để giữ dữ liệu vừa nhập.';
}

function loadLibrary(storage) {
  const unreadableSources = [];
  let primaryRaw = null;
  let previousRaw = null;
  const empty = () => { const book = createBook(); return envelope([book], book.id); };
  if (!storage) return { library: empty(), primaryRaw, blocked: true, error: 'Thiết bị chưa cho phép lưu dữ liệu. Hãy xuất sao lưu JSON trước khi đóng ứng dụng.', unreadableSources };
  try {
    primaryRaw = storage.getItem(LIBRARY_KEYS.primary);
    previousRaw = storage.getItem(LIBRARY_KEYS.previous);
  } catch {
    return { library: empty(), primaryRaw, blocked: true, error: 'Không thể đọc bộ nhớ thiết bị. Dữ liệu cũ chưa bị thay đổi.', unreadableSources };
  }
  if (primaryRaw !== null) {
    try { return { library: validateLibrary(JSON.parse(primaryRaw)), primaryRaw, persisted: true, unreadableSources }; }
    catch { unreadableSources.push({ key: LIBRARY_KEYS.primary, raw: primaryRaw }); }
  }
  if (previousRaw !== null) {
    try {
      const library = validateLibrary(JSON.parse(previousRaw));
      return { library, primaryRaw, recovered: true, unreadableSources,
        error: 'Đã phục hồi bản lưu tốt gần nhất. Bản dữ liệu bị lỗi được giữ riêng; hãy kiểm tra trạm cuối và xuất sao lưu.' };
    } catch { unreadableSources.push({ key: LIBRARY_KEYS.previous, raw: previousRaw }); }
  }

  const books = [];
  const checkpoints = [];
  let draft = null;
  const readLegacy = (key, isDraft = false) => {
    let raw;
    try { raw = storage.getItem(key); } catch { fail('Không thể đọc đầy đủ các sổ cũ. Dữ liệu chưa bị thay đổi.'); }
    if (raw === null) return;
    let data;
    try {
      data = JSON.parse(raw);
      if (isDraft && data === null) return;
      if (!isDraft && !Array.isArray(data)) fail('Danh sách sổ cũ không hợp lệ.');
    } catch { unreadableSources.push({ key, raw }); return; }
    (isDraft ? [data] : data).forEach((item) => {
      try {
        const converted = importBook(item);
        if (isDraft) draft = converted;
        else {
          // Different legacy snapshots sharing an ID remain separate recoverable books.
          if (books.some((book) => book.id === converted.id)) converted.id = uid();
          books.push(converted);
        }
      } catch { if (!unreadableSources.some((source) => source.key === key)) unreadableSources.push({ key, raw }); }
    });
  };
  try {
    readLegacy(STORAGE_KEYS.books);
    readLegacy(STORAGE_KEYS.legacy);
    readLegacy(STORAGE_KEYS.draft, true);
  } catch (error) {
    return { library: books.length ? envelope(books, books[0].id) : empty(), primaryRaw, blocked: true, error: error.message, unreadableSources };
  }
  if (draft) {
    const previous = books.find((book) => book.id === draft.id);
    if (previous) {
      checkpoints.push(checkpoint(previous, 'Bản lưu trước khi phục hồi nháp'));
      books.splice(books.indexOf(previous), 1, draft);
    } else books.unshift(draft);
  }
  const hasRecoveredBooks = books.length > 0;
  if (!books.length) books.push(createBook());
  const damaged = unreadableSources.length > 0;
  // A damaged primary with no valid prior envelope must not be replaced by a
  // possibly older legacy library. Keep the only copy available for recovery.
  const blocked = primaryRaw !== null || (previousRaw !== null && !hasRecoveredBooks) || (damaged && !hasRecoveredBooks);
  return { library: envelope(books, draft?.id || books[0].id, checkpoints), primaryRaw, blocked,
    recovered: damaged || hasRecoveredBooks, unreadableSources,
    error: blocked ? 'Có dữ liệu lưu bị lỗi; ứng dụng đang giữ nguyên bản gốc và chưa ghi đè. Hãy xuất sao lưu JSON để phục hồi.'
      : damaged ? 'Đã giữ các sổ đọc được. Một phần dữ liệu cũ bị lỗi và vẫn được giữ nguyên để phục hồi.' : null };
}

function parseImport(input) {
  let raw = input;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { fail('File JSON không hợp lệ. Các sổ hiện tại vẫn được giữ nguyên.'); }
  }
  if (isObject(raw) && raw.format === BACKUP_FORMAT) {
    if (raw.schemaVersion !== 5) fail('Phiên bản sao lưu chưa được hỗ trợ.');
    raw = raw.library;
  }
  if (isObject(raw) && raw.format === LIBRARY_FORMAT) {
    const library = validateLibrary(raw);
    // Normalize only at import boundaries, never while typing numeric drafts.
    return { ...clone(library), books: library.books.map(importBook),
      trash: library.trash.map((entry) => ({ ...clone(entry), book: importBook(entry.book) })),
      checkpoints: library.checkpoints.map((entry) => ({ ...clone(entry), book: importBook(entry.book) })) };
  }
  const list = Array.isArray(raw) ? raw : [raw];
  if (!list.length) fail('File không có sổ nào để nhập.');
  return { books: list.map(importBook), trash: [], checkpoints: [], activeBookId: null };
}

function hasRemovedData(before, after) {
  const missing = (a, b) => a.some((entry) => !b.some((candidate) => candidate.id === entry.id));
  return missing(before.benchmarks, after.benchmarks) || missing(before.runs, after.runs)
    || before.runs.some((run) => {
      const next = after.runs.find((candidate) => candidate.id === run.id);
      return next && missing(run.stations, next.stations);
    });
}

/** Synchronous store: one atomic primary write contains ALL books and the draft.
 * A failed write keeps the last disk copy intact. Editing stays in memory, but
 * opening/importing/deleting never changes active state until persistence works.
 */
export function createNotebookLibrary(storage = defaultStorage()) {
  const loaded = loadLibrary(storage);
  let library = loaded.library;
  let expectedRaw = loaded.primaryRaw;
  let pending = !loaded.persisted;
  const recoveryKeys = new Map();
  let error = loaded.error || null;
  let saveState = loaded.blocked ? 'error' : loaded.recovered ? 'recovered' : loaded.persisted ? 'saved' : 'unsaved';
  const listeners = new Set();
  let snapshot;
  const currentBook = () => library.books.find((book) => book.id === library.activeBookId);
  const publish = () => {
    snapshot = { book: currentBook(), books: library.books, trash: library.trash, checkpoints: library.checkpoints,
      saveState, storageError: error };
    listeners.forEach((listener) => listener());
  };
  const report = (cause) => { error = storageMessage(cause); saveState = 'error'; publish(); return false; };

  function archiveDamaged(key, raw) {
    const signature = `${key}\n${raw}`;
    if (!recoveryKeys.has(signature)) recoveryKeys.set(signature, `${LIBRARY_KEYS.recoveryPrefix}${uid()}`);
    storage.setItem(recoveryKeys.get(signature), JSON.stringify({ key, raw, archivedAt: Date.now() }));
  }

  function write(next) {
    if (loaded.blocked) fail(loaded.error);
    if (!storage) fail('Không thể truy cập bộ nhớ thiết bị. Hãy xuất sao lưu JSON.');
    const actualRaw = storage.getItem(LIBRARY_KEYS.primary);
    if (actualRaw !== expectedRaw) fail('Sổ đã thay đổi ở cửa sổ khác. Dữ liệu trên màn hình được giữ nguyên; hãy xuất sao lưu trước khi tải lại ứng dụng.');
    const committed = { ...next, revision: library.revision + 1, updatedAt: Date.now() };
    validateLibrary(committed);
    const serialized = JSON.stringify(committed);
    if (actualRaw !== null) {
      let good = false;
      try { validateLibrary(JSON.parse(actualRaw)); good = true; } catch { /* Preserve damaged bytes before recovery. */ }
      if (good) {
        const previousRaw = storage.getItem(LIBRARY_KEYS.previous);
        if (previousRaw !== null) {
          let previousGood = false;
          try { validateLibrary(JSON.parse(previousRaw)); previousGood = true; } catch { /* Keep the only bytes available. */ }
          if (!previousGood) archiveDamaged(LIBRARY_KEYS.previous, previousRaw);
        }
        storage.setItem(LIBRARY_KEYS.previous, actualRaw);
      } else archiveDamaged(LIBRARY_KEYS.primary, actualRaw);
    }
    // localStorage.setItem is atomic: if quota/security fails, primary is intact.
    storage.setItem(LIBRARY_KEYS.primary, serialized);
    expectedRaw = serialized;
    pending = false;
    error = loaded.recovered ? loaded.error || null : null;
    saveState = loaded.recovered && loaded.error ? 'recovered' : 'saved';
    return committed;
  }

  function commitTransition(makeNext) {
    try {
      const next = makeNext(library);
      library = write(next);
      publish();
      return true;
    } catch (cause) { return report(cause); }
  }

  const api = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    initialize: () => pending && !loaded.blocked ? api.saveNow() : !loaded.blocked,
    updateBook(updater, options = {}) {
      const before = currentBook();
      let nextBook;
      try {
        nextBook = typeof updater === 'function' ? updater(clone(before)) : { ...before, ...updater };
        validateBook(nextBook);
        nextBook = { ...clone(nextBook), id: before.id, updatedAt: Date.now() };
      } catch (cause) { return report(cause); }
      const reason = options.checkpoint || (hasRemovedData(before, nextBook) ? 'Trước khi xóa dữ liệu đo' : null);
      let next = { ...library, books: library.books.map((book) => book.id === before.id ? nextBook : book) };
      if (reason) next = withCheckpoint(next, before, reason);
      // Destructive changes and station completion must not advance if storage
      // fails. Ordinary typing stays visible so it can be exported/retried.
      if (reason) return commitTransition(() => next);
      library = next;
      pending = true;
      try { library = write(library); publish(); return true; } catch (cause) { return report(cause); }
    },
    saveNow() {
      try { library = write(library); publish(); return true; } catch (cause) { return report(cause); }
    },
    openBook(bookOrId) {
      const id = typeof bookOrId === 'string' ? bookOrId : bookOrId?.id;
      if (!library.books.some((book) => book.id === id)) return report(new Error('Sổ này không còn trong thư viện.'));
      if (id === library.activeBookId) return api.saveNow();
      return commitTransition((state) => ({ ...withCheckpoint(state, currentBook(), 'Trước khi chuyển sổ'), activeBookId: id }));
    },
    newBook() {
      return commitTransition((state) => {
        const book = createBook();
        return { ...withCheckpoint(state, currentBook(), 'Trước khi tạo sổ mới'), books: [book, ...state.books], activeBookId: book.id };
      });
    },
    copyBook(name) {
      if (typeof name !== 'string' || !name.trim()) return report(new Error('Nhập tên bản sao trước khi lưu.'));
      return commitTransition((state) => {
        const book = { ...clone(currentBook()), id: uid(), name: name.trim(), createdAt: Date.now(), updatedAt: Date.now() };
        return { ...withCheckpoint(state, currentBook(), 'Trước khi tạo bản sao'), books: [book, ...state.books], activeBookId: book.id };
      });
    },
    importBooks(input) {
      let imported;
      try { imported = parseImport(input); } catch (cause) { return report(cause); }
      return commitTransition((state) => {
        const mapping = new Map();
        const now = Date.now();
        const books = imported.books.map((source) => {
          const id = uid();
          mapping.set(source.id, id);
          return { ...clone(source), id, name: `${source.name || 'Sổ đo'} (nhập)`, createdAt: now, updatedAt: now };
        });
        const trash = imported.trash.map((entry) => {
          const id = uid();
          if (!mapping.has(entry.book.id)) mapping.set(entry.book.id, id);
          return { ...clone(entry), id: uid(), book: { ...clone(entry.book), id } };
        });
        const checkpoints = imported.checkpoints.map((entry) => ({ ...clone(entry), id: uid(), book: { ...clone(entry.book), id: mapping.get(entry.book.id) || uid() } }));
        return { ...withCheckpoint(state, currentBook(), 'Trước khi nhập tệp'),
          books: [...books, ...state.books], activeBookId: mapping.get(imported.activeBookId) || books[0].id,
          trash: [...trash, ...state.trash],
          checkpoints: [checkpoint(currentBook(), 'Trước khi nhập tệp'), ...state.checkpoints, ...checkpoints].slice(0, CHECKPOINT_LIMIT) };
      });
    },
    deleteBook(id) {
      const target = library.books.find((book) => book.id === id);
      if (!target) return report(new Error('Không tìm thấy sổ cần đưa vào thùng rác.'));
      return commitTransition((state) => {
        let books = state.books.filter((book) => book.id !== id);
        if (!books.length) books = [createBook()];
        return { ...withCheckpoint(state, target, 'Trước khi đưa sổ vào thùng rác'), books,
          activeBookId: state.activeBookId === id ? books[0].id : state.activeBookId,
          trash: [{ id: uid(), book: clone(target), deletedAt: Date.now() }, ...state.trash] };
      });
    },
    restoreDeleted(id) {
      const entry = library.trash.find((item) => item.id === id);
      if (!entry) return report(new Error('Không tìm thấy sổ trong thùng rác.'));
      return commitTransition((state) => {
        const book = { ...clone(entry.book), updatedAt: Date.now() };
        if (state.books.some((item) => item.id === book.id)) book.id = uid();
        return { ...withCheckpoint(state, currentBook(), 'Trước khi khôi phục sổ'),
          books: [book, ...state.books], activeBookId: book.id, trash: state.trash.filter((item) => item.id !== id) };
      });
    },
    restoreCheckpoint(id) {
      const entry = library.checkpoints.find((item) => item.id === id);
      if (!entry) return report(new Error('Không tìm thấy phiên bản cần phục hồi.'));
      return commitTransition((state) => {
        // Restore as a copy so neither the latest measurements nor trash are lost.
        const book = { ...clone(entry.book), id: uid(), name: `${entry.book.name} (phục hồi)`, createdAt: Date.now(), updatedAt: Date.now() };
        return { ...withCheckpoint(state, currentBook(), 'Trước khi phục hồi phiên bản'),
          books: [book, ...state.books], activeBookId: book.id };
      });
    },
    exportBackup() {
      try {
        return JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 5, appVersion: '2.5.0', exportedAt: new Date().toISOString(),
          library, ...(loaded.unreadableSources.length ? { unreadableSources: loaded.unreadableSources } : {}) }, null, 2);
      } catch (cause) { report(cause); return ''; }
    },
  };
  publish();
  return api;
}
