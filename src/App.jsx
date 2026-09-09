import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BarChart2,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crosshair,
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  PencilLine,
  Plus,
  Route as RouteIcon,
  Save,
  Settings2,
  ShieldCheck,
  ArchiveRestore,
  Search,
  ArrowRight,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import {
  adjustLevelingNetwork,
  compareRuns,
  createBenchmark,
  createBook,
  createStation,
  finalizeStation,
  nextRunNumber,
  removeStation,
  solveRun,
} from './model';
import { uid, uppercaseName } from './calc';
import {
  collectPointNames,
  filterPointNames,
  normalizePointType,
  POINT_TYPE_SIDE,
  POINT_TYPE_TURNING,
  pointTypeLabel,
  remapGeneratedSidePointNames,
  suggestTargetPointName,
} from './pointNames';
import { exportExcelReport, exportPdfReport, exportLibraryBackup } from './report';
import { useNotebookLibrary } from './useNotebookLibrary';
import { inspectStation, normalizeStationDraft, FIELD_DEFAULTS } from './fieldChecks';
import { ConfirmDialog, ElevationProfile, QualityCard, SheetDialog, SurveyIllustration } from './FieldUI';
import {
  changeRunStartPoint,
  createUnstartedRun,
  findValidBenchmark,
  runHasReadings,
  validBenchmarks,
} from './runStart';
import { OPEN_ROUTE_WARNING } from './terminology';
import {
  canonicalBenchmarkElevationDraft,
  formatElevation,
  formatMeters,
  formatMillimeters,
  formatSignedMillimeters,
  formatStaffReading,
  normalizeMeterInput,
  normalizeStaffInput,
  sanitizeBenchmarkElevationInput,
  sanitizeMeterInput,
  READING_FIELDS,
} from './units';

const NAV_ITEMS = [
  { id: 'measure', label: 'Đo', Icon: Crosshair },
  { id: 'route', label: 'Tuyến', Icon: RouteIcon },
  { id: 'result', label: 'Kết quả', Icon: BarChart2 },
  { id: 'files', label: 'Sổ & tệp', Icon: FolderOpen },
];

const SWIPE_REVEAL_PX = 80;
const OUTDOOR_STORAGE_KEY = 'so-thuy-chuan.outdoor-mode.v1';

function pulse(pattern) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch { /* haptics are optional on iOS/WebView */ }
}

function MeterInput({ value, onValueChange, staffReading = false, sanitizer = sanitizeMeterInput, normalizer, className = '', placeholder = '0,000', onKeyDown, onComplete, ...props }) {
  const normalize = normalizer || (staffReading ? normalizeStaffInput : normalizeMeterInput);
  return (
    <input
      {...props}
      className={`${className} numeric meter-input`.trim()}
      inputMode="decimal"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(sanitizer(event.target.value))}
      onBlur={(event) => onValueChange(normalize(event.currentTarget.value))}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!event.defaultPrevented && event.key === 'Enter') {
          event.preventDefault();
          const fields = Array.from(event.currentTarget.closest('.measure-shell')?.querySelectorAll('[data-reading]') || []);
          const next = fields[fields.indexOf(event.currentTarget) + 1];
          if (next) next.focus();
          else {
            event.currentTarget.blur();
            if (onComplete) window.setTimeout(onComplete, 0);
          }
        }
      }}
    />
  );
}

function BenchmarkElevationInput({ value, onValueChange, ariaLabel }) {
  const [draft, setDraft] = useState(value || '');
  const focusedRef = useRef(false);
  const canonicalRef = useRef(value || '');

  useEffect(() => {
    canonicalRef.current = value || '';
    if (!focusedRef.current) setDraft(value || '');
  }, [value]);

  const updateDraft = (nextValue) => {
    const next = sanitizeBenchmarkElevationInput(nextValue);
    setDraft(next);
    const canonical = canonicalBenchmarkElevationDraft(next);
    if (canonical !== null) onValueChange(canonical);
  };

  const finishEditing = () => {
    focusedRef.current = false;
    const canonical = canonicalBenchmarkElevationDraft(draft);
    if (canonical === null) {
      setDraft(canonicalRef.current);
      return;
    }
    setDraft(canonical);
    onValueChange(canonical);
  };

  return (
    <input
      className="numeric meter-input"
      aria-label={ariaLabel}
      inputMode="decimal"
      enterKeyHint="done"
      placeholder="0,000"
      value={draft}
      onFocus={() => { focusedRef.current = true; }}
      onChange={(event) => updateDraft(event.target.value)}
      onBlur={finishEditing}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    />
  );
}

function PointCombobox({ value, onValueChange, options = [], placeholder = '', ariaLabel, className = '', scopeKey = '' }) {
  const [draft, setDraft] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const optionRefs = useRef([]);
  const optionSnapshotRef = useRef(options);
  const optionInteractingRef = useRef(false);
  const blurTimerRef = useRef(null);
  const listId = useId().replace(/:/g, '');
  const helpId = `${listId}-help`;

  useEffect(() => setDraft(value || ''), [value]);
  useEffect(() => {
    optionSnapshotRef.current = options;
    setDraft(value || '');
    setOpen(false);
    setActiveIndex(-1);
  }, [scopeKey]);

  const query = uppercaseName(draft).trim();
  const searchOptions = open ? optionSnapshotRef.current : options;
  const matches = useMemo(() => filterPointNames(searchOptions, query), [searchOptions, query]);
  const exactMatch = searchOptions.some((name) => uppercaseName(name).trim() === query);
  const items = useMemo(() => [
    ...matches.map((name) => ({ name, create: false })),
    ...(query && !exactMatch ? [{ name: query, create: true }] : []),
  ], [exactMatch, matches, query]);
  const popupOpen = open && items.length > 0;

  useEffect(() => setActiveIndex(-1), [query]);
  useEffect(() => {
    if (popupOpen && activeIndex >= 0) optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, popupOpen]);
  useEffect(() => () => { if (blurTimerRef.current) globalThis.clearTimeout(blurTimerRef.current); }, []);

  const clearBlurTimer = () => {
    if (!blurTimerRef.current) return;
    globalThis.clearTimeout(blurTimerRef.current);
    blurTimerRef.current = null;
  };

  const commit = (nextValue = draft) => {
    clearBlurTimer();
    const next = uppercaseName(nextValue).trim();
    setDraft(next);
    if (next !== uppercaseName(value).trim()) onValueChange(next);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.nativeEvent?.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => items.length ? (current + 1) % items.length : -1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => items.length ? (current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length) : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      optionInteractingRef.current = true;
      commit(!query && placeholder ? placeholder : open && items[activeIndex] ? items[activeIndex].name : draft);
      event.currentTarget.blur();
      optionInteractingRef.current = false;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(value || '');
      optionSnapshotRef.current = options;
      setOpen(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`point-combobox ${open ? 'open' : ''} ${className}`.trim()}
      onBlurCapture={(event) => {
        if (rootRef.current?.contains(event.relatedTarget) || optionInteractingRef.current) return;
        clearBlurTimer();
        blurTimerRef.current = globalThis.setTimeout(() => {
          blurTimerRef.current = null;
          if (!rootRef.current?.contains(document.activeElement)) commit(draft);
        }, 0);
      }}
    >
      <input
        aria-label={ariaLabel}
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={popupOpen}
        aria-controls={popupOpen ? listId : undefined}
        aria-activedescendant={popupOpen && activeIndex >= 0 && items[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        aria-describedby={placeholder ? helpId : undefined}
        autoComplete="off"
        autoCapitalize="characters"
        enterKeyHint="done"
        spellCheck={false}
        placeholder={placeholder}
        value={draft}
        onFocus={() => { optionSnapshotRef.current = options; setOpen(true); }}
        onChange={(event) => {
          const next = uppercaseName(event.target.value).trimStart();
          if (!open) optionSnapshotRef.current = options;
          setDraft(next);
          onValueChange(next);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {placeholder && <span id={helpId} className="sr-only">Để trống rồi hoàn tất để dùng tên tự động {placeholder}.</span>}
      {popupOpen && (
        <div className="point-options" id={listId} role="listbox" aria-label={`Gợi ý cho ${ariaLabel}`}>
          {items.map((item, index) => (
            <button
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              id={`${listId}-${index}`}
              key={`${item.create ? 'create' : 'point'}-${item.name}`}
              className={index === activeIndex ? 'active' : ''}
              data-create={item.create}
              role="option"
              tabIndex={-1}
              aria-selected={index === activeIndex}
              onPointerDown={() => {
                clearBlurTimer();
                optionInteractingRef.current = true;
              }}
              onPointerUp={() => globalThis.setTimeout(() => {
                optionInteractingRef.current = false;
                if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
              }, 0)}
              onPointerCancel={() => {
                optionInteractingRef.current = false;
                if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => { optionInteractingRef.current = false; commit(item.name); }}
            >
              <span>{item.create ? 'Dùng tên mới' : 'Điểm đã có'}</span>
              <b className="numeric">{item.name}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useAvailablePoints(currentBook) {
  return useMemo(() => collectPointNames(currentBook), [currentBook]);
}

export default function App() {
  const library = useNotebookLibrary();
  const { book, books, updateBook } = library;
  const [tab, setTab] = useState('measure');
  const [runId, setRunId] = useState(() => book.runs[0].id);
  const [stationIndex, setStationIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [checksRequested, setChecksRequested] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [originPickerOpen, setOriginPickerOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [outdoor, setOutdoor] = useState(() => {
    try { return localStorage.getItem(OUTDOOR_STORAGE_KEY) === 'true'; } catch { return false; }
  });
  const fileRef = useRef(null);
  const measureRef = useRef(null);
  const finishLock = useRef(false);

  const activeRunIndex = Math.max(0, book.runs.findIndex((run) => run.id === runId));
  const activeRun = book.runs[activeRunIndex];
  // Preview uses the same normalized readings that will be committed.
  const solvedRuns = useMemo(() => book.runs.map((run) => solveRun({
    ...run, stations: run.stations.map((station) => normalizeStationDraft(station, run.mode)),
  }, book.benchmarks)), [book]);
  const activeSolved = solvedRuns[activeRunIndex];
  const availablePoints = useAvailablePoints(book);

  useEffect(() => {
    setRunId(book.runs[0].id);
    setStationIndex(0);
    setChecksRequested(false);
    setSettingsOpen(false);
    setDialog(null);
    setOriginPickerOpen(false);
  }, [book.id]);

  useEffect(() => {
    finishLock.current = false;
    setChecksRequested(false);
  }, [book.id, runId, stationIndex]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), toast.action ? 6000 : 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    document.documentElement.dataset.outdoor = outdoor ? 'true' : 'false';
    try { localStorage.setItem(OUTDOOR_STORAGE_KEY, String(outdoor)); } catch { /* preference is optional */ }
  }, [outdoor]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateKeyboard = () => {
      const editing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
      document.body.classList.toggle('keyboard-open', Boolean(editing && viewport && window.innerHeight - viewport.height > 130));
    };
    viewport?.addEventListener('resize', updateKeyboard);
    document.addEventListener('focusin', updateKeyboard);
    document.addEventListener('focusout', updateKeyboard);
    return () => {
      viewport?.removeEventListener('resize', updateKeyboard);
      document.removeEventListener('focusin', updateKeyboard);
      document.removeEventListener('focusout', updateKeyboard);
      document.body.classList.remove('keyboard-open');
    };
  }, []);

  const updateRun = (id, patch) => updateBook((previous) => ({
    ...previous, runs: previous.runs.map((run) => run.id === id ? { ...run, ...patch } : run),
  }));
  const updateStation = (run, stationId, field, value) => updateBook((previous) => ({
    ...previous, runs: previous.runs.map((item) => item.id === run.id ? {
      ...item, stations: item.stations.map((station) => station.id === stationId
        ? { ...station, [field]: field === 'point' ? uppercaseName(value).trimStart() : value, committedAt: undefined }
        : station),
    } : item),
  }));
  function selectRun(id) {
    setRunId(id); setStationIndex(0); setSettingsOpen(false);
  }
  function addRun(mode = 'single') {
    const next = createUnstartedRun(book, mode);
    if (updateBook((previous) => ({ ...previous, runs: [...previous.runs, next] }))) {
      selectRun(next.id);
      setTab('measure');
    }
  }
  function goToBenchmarks() {
    setOriginPickerOpen(false);
    setSettingsOpen(false);
    setTab('files');
    window.setTimeout(() => {
      const section = document.getElementById('benchmark-section');
      section?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      section?.querySelector('input, button')?.focus({ preventScroll: true });
    }, 50);
  }
  function setRunOrigin(run, benchmarkName, { confirm = true, initial = false } = {}) {
    const benchmark = findValidBenchmark(book, benchmarkName);
    if (!benchmark || benchmark.name === run.startPoint) return;
    const applyChange = () => {
      const saved = updateBook((previous) => changeRunStartPoint(previous, run.id, benchmark.name), { checkpoint: 'Đổi mốc xuất phát' });
      if (saved) setToast({ text: initial ? `Đã bắt đầu ${run.name} từ ${benchmark.name}` : `Đã đổi mốc ${run.name} sang ${benchmark.name} · Kết quả đã tính lại` });
    };
    if (confirm && runHasReadings(run)) {
      setDialog({
        title: `Đổi mốc xuất phát của ${run.name}?`,
        description: `Số đọc, tên điểm, loại ĐC/TP và thứ tự trạm được giữ nguyên. Cao độ và kết quả của riêng ${run.name} sẽ được tính lại từ ${benchmark.name}.`,
        confirmLabel: 'Đổi mốc & tính lại',
        onConfirm: () => { applyChange(); setDialog(null); },
      });
    } else applyChange();
  }
  function changeMode(mode) {
    if (mode === activeRun.mode) return;
    const hasReadings = activeRun.stations.some((station) => READING_FIELDS.some((field) => String(station[field] ?? '').trim()));
    if (hasReadings) {
      setDialog({
        title: 'Đổi phương pháp đo',
        description: 'Lượt này đã có số đọc. Tạo lượt mới để đo ' + (mode === 'three' ? '3 chỉ' : '1 chỉ') + ' và giữ đúng số liệu của lượt hiện tại.',
        confirmLabel: 'Tạo lượt mới',
        onConfirm: () => { addRun(mode); setDialog(null); },
      });
    } else updateRun(activeRun.id, { mode });
  }
  function addStation() {
    const last = activeRun.stations.at(-1);
    if (!last.point && !READING_FIELDS.some((field) => String(last[field] ?? '').trim())) {
      setStationIndex(activeRun.stations.length - 1);
    } else {
      if (!updateRun(activeRun.id, { stations: [...activeRun.stations, createStation('', last?.pointType || POINT_TYPE_TURNING)] })) return;
      setStationIndex(activeRun.stations.length);
    }
    setTab('measure');
  }
  function finishStation(acknowledged = false) {
    if (finishLock.current) return;
    const station = activeRun.stations[stationIndex];
    if (!station) return;
    const pointType = normalizePointType(station.pointType);
    const autoName = suggestTargetPointName(book, activeRun.id, stationIndex, pointType);
    const inspection = inspectStation(book, activeRun, stationIndex, autoName);
    setChecksRequested(true);
    if (inspection.errors.length) {
      pulse([15, 45, 15]);
      requestAnimationFrame(() => measureRef.current?.querySelector('.quality-card')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return;
    }
    if (inspection.warnings.length && !acknowledged) {
      setDialog({
        title: 'Kiểm tra lại trước khi lưu',
        description: 'Một số dữ liệu cần anh xác nhận. Các ngưỡng này là nhắc nhập liệu, không thay cho tiêu chuẩn nghiệm thu.',
        messages: inspection.warnings.map((item) => item.message),
        confirmLabel: 'Đã kiểm tra · Lưu trạm',
        onConfirm: () => { setDialog(null); finishStation(true); },
      });
      return;
    }
    const normalized = {
      ...activeRun,
      stations: activeRun.stations.map((item, i) => i === stationIndex ? {
        ...normalizeStationDraft(item, activeRun.mode),
        committedAt: Date.now(),
        reviewNotes: acknowledged ? inspection.warnings.map((entry) => entry.message) : [],
      } : item),
    };
    const result = finalizeStation(normalized, stationIndex, autoName);
    if (!result.committed) { pulse([15, 45, 15]); return; }
    finishLock.current = true;
    const saved = updateBook((previous) => ({
      ...previous, runs: previous.runs.map((run) => run.id === activeRun.id ? { ...run, stations: result.stations } : run),
    }), { checkpoint: 'Hoàn tất trạm' });
    if (!saved) { finishLock.current = false; pulse([15, 45, 15]); return; }
    pulse(15);
    setStationIndex(result.nextIndex);
    setToast({ text: 'Đã lưu ' + result.point + ' · ' + (pointType === POINT_TYPE_SIDE ? 'Giữ nguyên mia sau' : 'Sẵn sàng trạm tiếp theo') });
    requestAnimationFrame(() => {
      const field = measureRef.current?.querySelector('[data-reading="bs"], [data-reading="bsUpper"]');
      field?.focus({ preventScroll: true });
      field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }
  function deleteStation(index) {
    const result = removeStation(activeRun, index);
    if (!result.removed) { setToast({ text: 'Lượt đo cần ít nhất một trạm.' }); return; }
    const before = structuredClone(activeRun.stations);
    if (!updateBook((previous) => ({ ...previous, runs: previous.runs.map((run) => run.id === activeRun.id ? { ...run, stations: result.stations } : run) }), { checkpoint: 'Xóa trạm' })) return;
    setStationIndex(Math.min(stationIndex, result.stations.length - 1));
    setToast({ text: 'Đã xóa trạm ' + (index + 1), action: { label: 'Hoàn tác', fn: () => {
      updateRun(activeRun.id, { stations: before }); setStationIndex(index);
    } } });
  }
  function save() {
    if (library.saveNow()) setToast({ text: 'Đã lưu sổ trên thiết bị' });
  }
  function saveAs() {
    const name = prompt('Tên bản sao:', book.name + ' - bản sao');
    if (name?.trim() && library.copyBook(name.trim())) setToast({ text: 'Đã tạo bản sao trong thư viện' });
  }
  function renameBook() {
    const name = prompt('Tên sổ:', book.name);
    if (name?.trim()) updateBook({ name: name.trim() });
  }
  function newBook() {
    if (library.newBook()) { setTab('measure'); setToast({ text: 'Đã cất sổ trước vào thư viện' }); }
  }
  function duplicateRun() {
    const id = uid(), roundNumber = nextRunNumber(book.runs);
    const copy = { ...structuredClone(activeRun), id, roundNumber, name: activeRun.name + ' - bản sao',
      stations: remapGeneratedSidePointNames(book, activeRun, id, roundNumber).map((station) => ({ ...station, id: uid() })),
    };
    if (updateBook((previous) => ({ ...previous, runs: [...previous.runs, copy] }))) selectRun(copy.id);
  }
  function deleteRun() {
    if (book.runs.length <= 1) { setToast({ text: 'Sổ cần ít nhất một lượt.' }); return; }
    setDialog({ title: 'Xóa ' + activeRun.name + '?', description: 'Bản trước khi xóa sẽ được giữ trong lịch sử khôi phục của sổ.', confirmLabel: 'Xóa lượt', onConfirm: () => {
      const runs = book.runs.filter((run) => run.id !== activeRun.id);
      if (updateBook((previous) => ({ ...previous, runs }), { checkpoint: 'Xóa lượt' })) selectRun(runs[0].id);
      setDialog(null);
    } });
  }
  async function exportReport(type) {
    if (exporting) return;
    setExporting(type);
    try {
      const filename = type === 'pdf' ? await exportPdfReport(book, solvedRuns, book.name) : await exportExcelReport(book, solvedRuns, book.name);
      setToast({ text: 'Đã xuất ' + filename });
    } catch { setToast({ text: 'Chưa xuất được tệp. Kiểm tra dung lượng rồi thử lại.' }); }
    finally { setExporting(null); }
  }
  async function backupAll() {
    if (exporting) return;
    setExporting('backup');
    try {
      const json = library.exportBackup();
      if (!json) throw new Error('empty');
      await exportLibraryBackup(json);
      setToast({ text: 'Đã tạo tệp sao lưu toàn bộ thư viện' });
    } catch { setToast({ text: 'Chưa tạo được sao lưu. Hãy thử lại.' }); }
    finally { setExporting(null); }
  }
  async function importFile(file) {
    if (exporting) return;
    setExporting('import');
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Tệp vượt 20 MB. Hãy chia nhỏ sổ trước khi nhập.');
      let raw;
      if (/\.json$/i.test(file.name)) raw = JSON.parse(await file.text());
      else {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        if (!workbook.Props?.Comments) throw new Error('Hãy chọn Excel được xuất từ ứng dụng hoặc tệp sao lưu JSON.');
        raw = JSON.parse(workbook.Props.Comments);
      }
      setPendingImport({ raw, filename: file.name });
    } catch (error) { setToast({ text: error.message || 'Tệp không hợp lệ. Sổ hiện tại vẫn được giữ nguyên.' }); }
    finally { setExporting(null); }
  }
  function confirmImport() {
    if (!pendingImport) return;
    if (library.importBooks(pendingImport.raw)) {
      setPendingImport(null);
      setToast({ text: 'Đã nhập thành bản riêng · Các sổ cũ vẫn được giữ' });
      setTab('files');
    }
  }
  const saveLabel = library.saveState === 'error' ? 'Chưa lưu được' : library.saveState === 'unsaved' ? 'Đang lưu' : 'Đã lưu trên máy';

  return (
    <div className="app-v3 app-v25 app-v27" data-outdoor={outdoor ? 'true' : 'false'}>
      <header className="workspace-header">
        <div className="brand-mark" aria-hidden="true"><img src="/level-mark.svg" alt="" /></div>
        <div className="brand-copy"><div className="eyebrow">THỦY CHUẨN <span className="version-badge">2.7.1</span></div><h1>{book.name}</h1></div>
        <div className="workspace-status"><button className="iconbtn" onClick={renameBook} aria-label="Đổi tên sổ"><PencilLine /></button></div>
      </header>
      <main id="main-content" data-tab={tab}>
        <div className="field-toolbar"><span><span className="status-dot" />Sổ đo hiện trường · m / mm</span><span className="save-indicator" data-state={library.saveState}><ShieldCheck size={14} />{saveLabel}</span></div>
        {library.storageError && <div className="storage-banner" role="alert"><TriangleAlert /><div><b>Cần bảo vệ dữ liệu</b><p>{library.storageError}</p><button onClick={backupAll} disabled={Boolean(exporting)}>Tải sao lưu ngay</button><button onClick={save}>Thử lưu lại</button></div></div>}
        {library.saveState === 'recovered' && !library.storageError && <p className="storage-banner" role="status">Đã khôi phục thư viện từ bản lưu an toàn gần nhất.</p>}
        {tab !== 'files' && <RunPicker runs={book.runs} solvedRuns={solvedRuns} runId={activeRun.id} onSelect={selectRun} onAdd={() => addRun()} />}
        {tab === 'measure' && <div ref={measureRef}><Measure book={book} availablePoints={availablePoints} run={activeRun} solved={activeSolved} index={stationIndex} setIndex={setStationIndex} updateStation={updateStation} finish={() => finishStation()} changeMode={changeMode} checksRequested={checksRequested} onStart={(name) => setRunOrigin(activeRun, name, { confirm: false, initial: true })} onChangeOrigin={() => setOriginPickerOpen(true)} onManageBenchmarks={goToBenchmarks} /></div>}
        {tab === 'route' && <><ElevationProfile solved={activeSolved} /><Route run={activeRun} solved={activeSolved} settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen} updateRun={updateRun} addStation={addStation} edit={(index) => { setStationIndex(index); setTab('measure'); }} remove={deleteStation} duplicate={duplicateRun} deleteRun={deleteRun} onChangeOrigin={() => { setSettingsOpen(false); setOriginPickerOpen(true); }} /></>}
        {tab === 'result' && <Results book={book} solvedRuns={solvedRuns} updateBook={updateBook} />}
        {tab === 'files' && <Files book={book} books={books} library={library} updateBook={updateBook} newBook={newBook} save={save} saveAs={saveAs} exportExcel={() => exportReport('xlsx')} exportPdf={() => exportReport('pdf')} backupAll={backupAll} exporting={exporting} fileRef={fileRef} importFile={importFile} availablePoints={availablePoints} setDialog={setDialog} outdoor={outdoor} setOutdoor={setOutdoor} />}
      </main>
      {tab === 'measure' && activeRun.startPoint && <CaptureDock book={book} run={activeRun} solved={activeSolved} index={stationIndex} setIndex={setStationIndex} finish={() => finishStation()} />}
      <nav className="bottom" aria-label="Điều hướng chính">
        {NAV_ITEMS.map(({ id, label, Icon }) => <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><span className="nav-icon" aria-hidden="true"><Icon /></span><span className="nav-label">{label}</span></button>)}
      </nav>
      {toast && <div className="toast" role="status" aria-live="polite"><span>{toast.text}</span>{toast.action && <button onClick={() => { toast.action.fn(); setToast(null); }}>{toast.action.label}</button>}</div>}
      {originPickerOpen && <BenchmarkPickerDialog book={book} run={activeRun} onSelect={(name) => { setOriginPickerOpen(false); setRunOrigin(activeRun, name); }} onManage={goToBenchmarks} onClose={() => setOriginPickerOpen(false)} />}
      {dialog && <ConfirmDialog {...dialog} onClose={() => setDialog(null)} />}
      {pendingImport && <ConfirmDialog title="Nhập sổ vào thư viện" description={pendingImport.filename} messages={['Sổ đang làm sẽ được lưu trước khi nhập.', 'Tệp được thêm thành bản riêng; tên trùng không ghi đè sổ cũ.', 'Tệp sai định dạng sẽ bị từ chối.']} confirmLabel="Nhập bản riêng" onConfirm={confirmImport} onClose={() => setPendingImport(null)} />}
    </div>
  );
}
function RunPicker({ runs, solvedRuns, runId, onSelect, onAdd }) {
  const selectedRun = runs.find((run) => run.id === runId) || runs[0];
  const selectedSolved = solvedRuns.find((solved) => solved.runId === selectedRun.id);
  const endPoint = selectedSolved?.endPoint || selectedRun.startPoint || '—';
  return (
    <div className="runbar">
      <label className="runselect">
        <span className="runselect-label">Lượt đo đang dùng</span>
        <select aria-label="Chọn lượt đo" value={runId} onChange={(event) => onSelect(event.target.value)}>
          {runs.map((run) => <option key={run.id} value={run.id}>{run.name}</option>)}
        </select>
        <small className="runselect-meta">
          <span className="runselect-route"><b>{selectedRun.startPoint || '—'}</b><span aria-hidden="true">→</span><b>{endPoint}</b></span>
          <span className="runselect-count">{selectedRun.stations.length} trạm</span>
        </small>
      </label>
      <button className="primary addrun" onClick={onAdd} aria-label="Thêm lượt đo" title="Thêm lượt đo"><Plus /><span className="sr-only">Thêm lượt đo</span></button>
    </div>
  );
}

function BenchmarkChoiceList({ book, selectedName, onSelect, onManage, autoFocus = false }) {
  const benchmarks = validBenchmarks(book);
  const [query, setQuery] = useState('');
  const normalizedQuery = uppercaseName(query).trim();
  const filtered = benchmarks.filter((benchmark) => !normalizedQuery || benchmark.name.includes(normalizedQuery));
  return <div className="benchmark-picker">
    {benchmarks.length > 0 && <label className="benchmark-search"><Search aria-hidden="true" /><input autoFocus={autoFocus} type="search" aria-label="Tìm mốc chuẩn" placeholder="Tìm nhanh theo tên mốc…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>}
    <div className="benchmark-options" role="listbox" aria-label="Mốc chuẩn hợp lệ trong sổ hiện tại">
      {filtered.map((benchmark) => <button type="button" role="option" aria-selected={selectedName === benchmark.name} className={selectedName === benchmark.name ? 'selected' : ''} key={benchmark.id || benchmark.name} onClick={() => onSelect(benchmark.name)}>
        <span className="benchmark-valid" aria-hidden="true"><Check /></span>
        <span><b>{benchmark.name}</b><small>Mốc chuẩn đã lưu</small></span>
        <strong className="numeric">{benchmark.elevation} <small>m</small></strong>
      </button>)}
    </div>
    {benchmarks.length > 0 && filtered.length === 0 && <p className="empty">Không có mốc nào khớp “{query}”.</p>}
    {benchmarks.length === 0 && <div className="benchmark-empty"><TriangleAlert aria-hidden="true" /><div><b>Chưa có mốc chuẩn hợp lệ</b><p>Thêm tên mốc và cao độ theo mét trong Sổ & tệp trước khi bắt đầu lượt.</p></div></div>}
    <button type="button" className="benchmark-manage" onClick={onManage}><PencilLine />{benchmarks.length ? 'Quản lý mốc chuẩn' : 'Thêm mốc chuẩn'}</button>
  </div>;
}

function BenchmarkPickerDialog({ book, run, onSelect, onManage, onClose }) {
  const [selectedName, setSelectedName] = useState('');
  const selected = findValidBenchmark(book, selectedName);
  return <SheetDialog title="Đổi mốc xuất phát" description={`${run.name} · chọn một mốc chuẩn đã lưu trong sổ hiện tại.`} onClose={onClose} className="benchmark-dialog">
    <BenchmarkChoiceList book={book} selectedName={selectedName} onSelect={setSelectedName} onManage={onManage} autoFocus />
    <div className="modal-actions"><button type="button" onClick={onClose}>Hủy</button><button type="button" className="primary" disabled={!selected || selected.name === run.startPoint} onClick={() => onSelect(selected.name)}><Check />Dùng mốc {selected?.name || ''}</button></div>
  </SheetDialog>;
}

function StartSession({ book, run, onStart, onManageBenchmarks }) {
  const [name, setName] = useState('');
  const selected = findValidBenchmark(book, name);
  const recent = [...book.runs].reverse().find((item) => item.id !== run.id && findValidBenchmark(book, item.startPoint))?.startPoint;
  function start(event) {
    event.preventDefault();
    if (selected) onStart(selected.name);
  }
  return <form className="start-session card" onSubmit={start}>
    <div className="start-session-heading">
      <div className="card-heading"><span>Thiết lập lượt đo</span><h2>Chọn mốc xuất phát</h2><p>Mỗi lượt dùng mốc riêng. Cao độ lấy từ danh mục mốc chuẩn và không chỉnh tại đây.</p></div>
      <SurveyIllustration />
    </div>
    {recent && <button type="button" className="recent-benchmark" onClick={() => setName(recent)}><span>Dùng gần nhất</span><b>{recent}</b><ArrowRight /></button>}
    <BenchmarkChoiceList book={book} selectedName={name} onSelect={setName} onManage={onManageBenchmarks} autoFocus />
    <button className="primary start-measurement" type="submit" disabled={!selected}><Crosshair />Bắt đầu đo{selected ? ` từ ${selected.name}` : ''}<ArrowRight /></button>
  </form>;
}

function Measure({ book, availablePoints, run, solved, index, setIndex, updateStation, finish, changeMode, checksRequested, onStart, onChangeOrigin, onManageBenchmarks }) {
  const station = run.stations[index];
  const row = solved.rows[index];
  if (!station) return null;
  const pointType = normalizePointType(station.pointType);
  const autoName = suggestTargetPointName(book, run.id, index, pointType);
  const displayPoint = station.point || autoName;
  const inspection = inspectStation(book, run, index, autoName);
  const savedCount = solved.rows.filter((item) => item.point && item.delta !== null).length;
  const update = (field, value) => updateStation(run, station.id, field, value);

  return (
    <section className="measure-shell">
      {run.startPoint && <div className="measure-intro"><div><span className="section-kicker">ĐO HIỆN TRƯỜNG</span><h2>Trạm {String(index + 1).padStart(2, '0')}<span className="session-pill">{run.mode === 'single' ? '1 chỉ' : '3 chỉ'}</span></h2></div><span className="session-pill"><Check size={14} />{savedCount} trạm có số đọc</span></div>}
      {!run.startPoint && <StartSession key={run.id} book={book} run={run} onStart={onStart} onManageBenchmarks={onManageBenchmarks} />}
      <div className={`measure-layout measure-only${run.startPoint ? '' : ' is-locked'}`} aria-hidden={!run.startPoint}>
        <div className="measure-primary">
          <div className="origin-card">
            <span className="origin-icon" aria-hidden="true"><Crosshair /></span>
            <span><small>Mốc xuất phát</small><b>{run.startPoint || 'Chưa chọn'}</b></span>
            <strong className="numeric">{findValidBenchmark(book, run.startPoint)?.elevation || '—'} <small>m</small></strong>
            <button type="button" onClick={onChangeOrigin}><PencilLine />Đổi mốc</button>
          </div>
          <div className="survey-console">
            <div className="console-top">
              <div><span className="section-kicker">ĐIỂM ĐẶT MIA SAU</span><strong>{row?.fromName || run.startPoint || 'Chọn mốc gốc'}</strong><small className="numeric">H = {formatElevation(row?.fromElevation)} m</small></div>
              <div className="seg" aria-label="Phương pháp đọc mia">
                <button type="button" aria-pressed={run.mode === 'single'} className={run.mode === 'single' ? 'active' : ''} onClick={() => changeMode('single')}>1 chỉ</button>
                <button type="button" aria-pressed={run.mode === 'three'} className={run.mode === 'three' ? 'active' : ''} onClick={() => changeMode('three')}>3 chỉ</button>
              </div>
            </div>
            <div className="reading-grid readings">
              {run.mode === 'single' ? <>
                <div className="reading reading-bs"><div className="reading-title"><span>Mia sau<small>Số đọc theo mét</small></span><em>BS</em></div>
                  <MeterInput className="hero-input" data-reading="bs" staffReading aria-label="Số đọc mia sau BS theo mét" aria-invalid={checksRequested && inspection.errors.some((item) => item.field === 'bs')} enterKeyHint="next" value={station.bs} onValueChange={(value) => update('bs', value)} onFocus={(event) => event.target.select()} />
                  <small className="reading-example">Định dạng: <b className="numeric">2,000</b> m</small></div>
                <div className="reading reading-fs"><div className="reading-title"><span>Mia trước<small>Số đọc theo mét</small></span><em>FS</em></div>
                  <MeterInput className="hero-input" data-reading="fs" staffReading aria-label="Số đọc mia trước FS theo mét" aria-invalid={checksRequested && inspection.errors.some((item) => item.field === 'fs')} enterKeyHint="done" value={station.fs} onValueChange={(value) => update('fs', value)} onComplete={finish} onFocus={(event) => event.target.select()} />
                  <small className="reading-example">Định dạng: <b className="numeric">1,585</b> m</small></div>
              </> : <>
                <Staff title="Mia sau" prefix="bs" station={station} row={row} update={update} />
                <Staff title="Mia trước" prefix="fs" station={station} row={row} update={update} finish={finish} />
              </>}
            </div>
            <div className="result-strip" aria-label="Kết quả tính tức thời">
              <div><span>H tới · {displayPoint}</span><strong className="numeric">{formatElevation(row?.elevation)} <small>m</small></strong></div>
              <div><span>Chênh cao · Δh</span><b className="numeric">{formatSignedMillimeters(row?.delta)} <small>mm</small></b></div>
              <div><span>Cao độ tia ngắm (H<sub>tia</sub>)</span><b className="numeric">{formatElevation(row?.hi)} <small>m</small></b></div>
            </div>
          </div>
          <div className="pointbox">
            <div className="point-type-toggle" role="group" aria-label="Chọn loại điểm tới">
              <button type="button" className={pointType === POINT_TYPE_TURNING ? 'active' : ''} aria-pressed={pointType === POINT_TYPE_TURNING} onClick={() => update('pointType', POINT_TYPE_TURNING)}>Điểm chuyền <small>ĐC</small></button>
              <button type="button" className={pointType === POINT_TYPE_SIDE ? 'active' : ''} aria-pressed={pointType === POINT_TYPE_SIDE} onClick={() => update('pointType', POINT_TYPE_SIDE)}>Tia phụ <small>TP</small></button>
            </div>
            <div className="point-entry"><span>Điểm tới</span><PointCombobox key={station.id} ariaLabel="Điểm tới" options={availablePoints} scopeKey={book.id} placeholder={autoName} value={station.point} onValueChange={(value) => update('point', value)} /></div>
            <p className="point-guidance">{pointType === POINT_TYPE_SIDE ? 'Giữ nguyên mia sau · Tia phụ không tham gia bình sai.' : 'Để trống tên: dùng ' + autoName + ' và tự nối sang trạm tiếp theo.'}</p>
          </div>
          <details className="quick-options" key={run.mode}>
            <summary><span>Khoảng cách & ghi chú</span><span>{station.distance ? formatMeters(Number(String(station.distance).replace(',', '.'))) + ' m' : 'Tùy chọn'}</span></summary>
            {run.mode === 'single' ? <label className="distance-manual distance-input"><span>Khoảng cách đoạn <small>Không bắt buộc · m</small></span><MeterInput aria-label="Khoảng cách đoạn theo mét, không bắt buộc" placeholder="Nhập khoảng cách (m)..." value={station.distance} onValueChange={(value) => update('distance', value)} /></label> : <div className="distance-manual distance-stats"><span>Chênh cự ly <b className="numeric">{formatMeters(row?.distanceDifference)} m</b></span><span>Cự ly trạm <b className="numeric">{formatMeters(row?.distance)} m</b></span></div>}
            <label className="field-label"><span>Ghi chú trạm</span><input aria-label="Ghi chú trạm" placeholder="Vị trí, thời tiết, điều kiện đo…" value={station.note || ''} onChange={(event) => update('note', event.target.value)} /></label>
          </details>
        </div>
      </div>
      <QualityCard errors={checksRequested ? inspection.errors : []} warnings={checksRequested ? inspection.warnings : []} />
    </section>
  );
}

function CaptureDock({ book, run, solved, index, setIndex, finish }) {
  const station = run.stations[index];
  const row = solved.rows[index];
  if (!station) return null;
  const pointType = normalizePointType(station.pointType);
  const displayPoint = station.point || suggestTargetPointName(book, run.id, index, pointType);
  return <div className="capture-dock" aria-label="Điều khiển lưu trạm">
    <div className="capture-dock-summary"><span>Điểm tới <b className="numeric">{displayPoint}</b></span><strong className="numeric">{formatElevation(row?.elevation)} m</strong></div>
    <div className="field-actions"><button className="step-button" aria-label="Trạm trước" title="Trạm trước" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}><ChevronLeft /></button><button type="button" className="primary finish" onClick={finish}><Check />{station.committedAt ? 'Cập nhật trạm' : 'Lưu & tiếp tục'}</button><button className="step-button" aria-label="Trạm tiếp theo" title="Trạm tiếp theo" onClick={() => setIndex(Math.min(run.stations.length - 1, index + 1))} disabled={index === run.stations.length - 1}><ChevronRight /></button></div>
  </div>;
}
function Staff({ title, prefix, station, row, update, finish }) {
  return (
    <div className={`reading reading-${prefix}`}>
      <div className="reading-title"><span>{title}<small>Ba chỉ · mét</small></span><em>{prefix.toUpperCase()} · m</em></div>
      <div className="threegrid">
        {[['Upper', 'Trên'], ['Middle', 'Giữa'], ['Lower', 'Dưới']].map(([suffix, label]) => (
          <label key={suffix}>{label}<MeterInput data-reading={`${prefix}${suffix}`} staffReading aria-label={`${title} chỉ ${label.toLowerCase()} theo mét`} enterKeyHint="next" value={station[`${prefix}${suffix}`]} onValueChange={(value) => update(`${prefix}${suffix}`, value)} onComplete={prefix === 'fs' && suffix === 'Lower' ? finish : undefined} onFocus={(event) => event.target.select()} /></label>
        ))}
      </div>
      <div className="staffmeta">
        <span>Cự ly <b className="numeric">{formatMeters(prefix === 'bs' ? row?.db : row?.df)} m</b></span>
        <span>Sai số giữa <b className="numeric">{formatSignedMillimeters(prefix === 'bs' ? row?.bsMiddleError : row?.fsMiddleError)} mm</b></span>
      </div>
    </div>
  );
}

function Route({ run, solved, settingsOpen, setSettingsOpen, updateRun, addStation, edit, remove, duplicate, deleteRun, onChangeOrigin }) {
  return (
    <section className="route-shell">
      <div className="card runsummary">
        <div className="runsummary-top">
          <div className="runsummary-badge" aria-hidden="true"><RouteIcon /></div>
          <div className="runsummary-main"><small>Tuyến đang chọn</small><h2>{run.name}</h2><p><b>{run.startPoint || '—'}</b><span aria-hidden="true">→</span><b>{solved.endPoint || run.startPoint || '—'}</b><span>· {solved.turningCount} ĐC · {solved.sideCount} TP</span></p></div>
          <button className="settings-btn" aria-label="Cài đặt lượt đo" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}><Settings2 /></button>
        </div>
      </div>
      {settingsOpen && <SheetDialog title="Cài đặt lượt đo" description="Đổi tên, mốc xuất phát hoặc quản lý bản sao của lượt hiện tại." onClose={() => setSettingsOpen(false)} className="run-settings-sheet">
        <label className="field-label"><span>Tên lượt</span><input value={run.name} onChange={(event) => updateRun(run.id, { name: event.target.value })} /></label>
        <div className="settings-origin"><span><small>Mốc xuất phát</small><b>{run.startPoint || 'Chưa chọn'}</b></span><button type="button" onClick={onChangeOrigin}><PencilLine />Đổi mốc</button></div>
        <div className="runactions"><button type="button" onClick={() => { setSettingsOpen(false); duplicate(); }}><Copy />Nhân bản</button><button type="button" className="danger" onClick={() => { setSettingsOpen(false); deleteRun(); }}><Trash2 />Xóa lượt</button></div>
      </SheetDialog>}
      {!solved.solved && <p className="warning">Lượt này chưa chứa mốc chuẩn có cao độ biết trước.</p>}
      <div className="route-list-head"><div><span>Hành trình đo</span><b className="numeric">{solved.rows.length} trạm</b></div><small>Chạm để sửa · vuốt trái để xóa</small></div>
      <div className="route-list">{solved.rows.map((row, index) => <SwipeStation key={row.id} row={row} index={index} edit={edit} remove={remove} />)}</div>
      <button className="primary addstation" onClick={addStation}><Plus />Thêm trạm</button>
    </section>
  );
}

function SwipeStation({ row, index, edit, remove }) {
  const [open, setOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(null);
  const gesture = useRef(null);
  const suppressClick = useRef(false);

  const pointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const origin = open ? -SWIPE_REVEAL_PX : 0;
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, horizontal: null, offset: origin, origin };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = (event) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - current.x;
    const deltaY = event.clientY - current.y;
    if (current.horizontal === null && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) current.horizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.15;
    if (!current.horizontal) return;
    event.preventDefault();
    current.offset = Math.max(-SWIPE_REVEAL_PX, Math.min(0, current.origin + deltaX));
    if (Math.abs(deltaX) > 10) suppressClick.current = true;
    setDragOffset(current.offset);
  };
  const pointerEnd = (event) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.horizontal) setOpen(current.offset <= -SWIPE_REVEAL_PX / 2);
    setDragOffset(null);
    gesture.current = null;
  };
  const revealing = dragOffset !== null && dragOffset < 0;

  return (
    <div className={`swipe-row ${open ? 'open' : ''} ${revealing ? 'revealing' : ''}`}>
      <button
        className="swipe-delete"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        aria-label={`Xóa trạm ${index + 1}`}
        onClick={(event) => { event.stopPropagation(); setOpen(false); remove(index); }}
      >
        <Trash2 /><span>Xóa</span>
      </button>
      <button
        className="routecard"
        style={dragOffset === null ? undefined : { transform: `translateX(${dragOffset}px)` }}
        aria-label={`Sửa trạm ${index + 1}, ${row.fromName || 'chưa có điểm sau'} đến ${row.point || 'chưa có điểm trước'}`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          if (open) setOpen(false); else edit(index);
        }}
      >
        <span className="route-num numeric">{index + 1}</span>
        <span className="route-body">
          <b><em className={`route-kind route-kind-${row.pointType}`}>{row.pointType === POINT_TYPE_SIDE ? 'TP' : 'ĐC'}</em>{row.fromName || '—'} <span aria-hidden="true">→</span> {row.point || '—'}</b>
          <small className="numeric"><span>BS {formatStaffReading(row.bs)} m</span><span>FS {formatStaffReading(row.fs)} m</span><span>Δh {formatSignedMillimeters(row.delta)} mm</span></small>
          <small className="route-elevation"><span>H tới: <strong className="numeric">{formatElevation(row.elevation)} m</strong></span>{row.distance !== null && <span className="route-distance numeric">D {formatMeters(row.distance)} m</span>}</small>
        </span>
        <span className="route-chevron" aria-hidden="true"><ChevronRight /></span>
      </button>
      <button
        type="button"
        className="route-delete-alt"
        aria-label={`Xóa nhanh trạm ${index + 1}`}
        title="Xóa nhanh"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); setOpen(false); remove(index); }}
      >
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  );
}

function SectionHeading({ Icon, eyebrow, title, description }) {
  return <div className="section-heading"><span className="section-heading-icon" aria-hidden="true"><Icon /></span><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div></div>;
}

function Results({ book, solvedRuns, updateBook }) {
  const comparisons = compareRuns(solvedRuns);
  const coefficient = book.settings.toleranceCoefficient;
  const network = adjustLevelingNetwork(solvedRuns, book.benchmarks, coefficient);
  return (
    <section className="result-shell">
      <SectionHeading Icon={BarChart2} eyebrow="Kết quả kỹ thuật" title="Kiểm tra & bình sai" description="Theo dõi sai số, độ chính xác và cao độ sau bình sai." />
      <div className="result-area" data-result-area="closure">
        <div className="result-area-heading"><ShieldCheck aria-hidden="true" /><div><span>01</span><h3>Kiểm tra khép</h3></div></div>
        {solvedRuns.map((solved) => (
          <div className="card result-card" key={solved.runId}>
            <div className="card-heading"><span>Lượt đo</span><h3>{solved.runName}</h3></div>
            <div className="metric">
              <div><span>ĐC / TP</span><b className="numeric">{solved.turningCount} / {solved.sideCount}</b></div>
              <div><span>Chiều dài</span><b className="numeric">{solved.totalDistance === null ? '—' : `${formatMeters(solved.totalDistance)} m`}</b></div>
              <div><span>ΣΔD</span><b className="numeric">{formatMeters(solved.sumDistanceDifference)} m</b></div>
            </div>
            {solved.checks.length ? solved.checks.map((check) => (
              <div className="check benchmark-summary" key={`${solved.runId}-${check.index}`}><b>{check.name}</b><span className="numeric">Chuẩn {formatElevation(check.known)} m · Đo {formatElevation(check.measured)} m · Lệch {formatSignedMillimeters(check.difference)} mm</span></div>
            )) : <p className="warning">Lượt này chưa chứa mốc chuẩn.</p>}
          </div>
        ))}
      </div>
      <div className="result-area" data-result-area="comparison">
        <div className="result-area-heading"><RouteIcon aria-hidden="true" /><div><span>02</span><h3>So sánh điểm chung</h3></div></div>
        <div className="card">
          <div className="card-heading"><span>Đối chiếu theo tên điểm</span><h3>Điểm chuyền giữa các lượt</h3></div>
          {comparisons.length ? comparisons.map((group) => (
            <div className="compare" key={group.name}>
              <div className="compareHead"><b>{group.name}</b><span className="numeric">Max - Min: {formatMillimeters(group.spread)} mm</span></div>
              {group.values.map((value) => <div className="compareLine" key={value.runId}><span>{value.runName}</span><b className="numeric">{formatElevation(value.elevation)} m</b></div>)}
            </div>
          )) : <p className="empty">Chưa có điểm chuyền cùng tên ở ít nhất 2 lượt.</p>}
        </div>
      </div>
      <div className="result-area" data-result-area="adjustment">
        <div className="result-area-heading"><BarChart2 aria-hidden="true" /><div><span>03</span><h3>Bình sai lưới</h3></div></div>
        <NetworkAdjustment network={network} />
        <div className="card tolerance-card">
          <label>Hệ số C <span>mm/√km</span><input className="numeric" inputMode="decimal" value={coefficient} onChange={(event) => updateBook((previous) => ({ ...previous, settings: { ...previous.settings, toleranceCoefficient: event.target.value } }))} /></label>
          <p className="note">C là tham số kiểm tra sai số khép; bình sai lưới chỉ dùng các trị đo điểm chuyền liên kết.</p>
        </div>
      </div>
    </section>
  );
}

function NetworkAdjustment({ network }) {
  return (
    <div className="card network-adjustment">
      <h3>Bình sai lưới độ cao</h3>
      {!network.available ? (
        <>
          <div className="warning warning-card" role="status"><span className="warning-icon" aria-hidden="true"><TriangleAlert /></span><span>{network.reason}</span></div>
          <SidePointTable points={network.sidePoints} />
        </>
      ) : (
        <>
          <p className="note">{network.method}. Mốc chuẩn được giữ cố định; chỉ điểm chuyền tham gia phương trình. Tia phụ nhận cao độ suy ra từ điểm gốc sau bình sai.</p>
          <div className="metric"><div><span>Trị đo</span><b className="numeric">{network.observations}</b></div><div><span>Điểm cần tìm</span><b className="numeric">{network.unknowns}</b></div><div><span>Bậc tự do</span><b className="numeric">{network.degreesOfFreedom}</b></div></div>
          {network.degreesOfFreedom === 0 && <p className="warning">{OPEN_ROUTE_WARNING}</p>}
          {network.degreesOfFreedom > 0 && <div className="check"><b>Độ chính xác sau bình sai</b><span className="numeric">σ₀ = {formatMillimeters(network.sigma0)} {network.totalDistance === null ? 'mm' : 'mm/√km'} · |v|max = {formatMillimeters(network.maxCorrection)} mm</span></div>}
          <div className="network-table">
            <div className="network-point-row heading"><b>Điểm</b><b>Vai trò</b><b>H bình sai</b></div>
            {network.points.map((point) => <div className="network-point-row" key={point.name}><b>{point.name}</b><span>{point.fixed ? 'Mốc cố định' : 'Điểm bình sai'}</span><b className="numeric">{formatElevation(point.elevation)} m</b></div>)}
          </div>
          <SidePointTable points={network.sidePoints} />
          <details>
            <summary>Số hiệu chỉnh chênh cao (v) · {network.segments.length} đoạn</summary>
            <div className="network-table">
              <div className="network-segment-row heading"><b>Đoạn</b><b>v</b><b>Δh bình sai</b></div>
              {network.segments.map((row, index) => <div className="network-segment-row" key={`${row.runId}-${row.id}-${index}`}><span><b>{row.fromName} → {row.point}</b><small>{row.runName}</small></span><span className="numeric">{formatSignedMillimeters(row.correction)} mm</span><b className="numeric">{formatSignedMillimeters(row.adjustedDelta)} mm</b></div>)}
            </div>
          </details>
          {network.ignored > 0 && <p className="warning">Có {network.ignored} trị đo chưa nối với mốc chuẩn nên chưa được bình sai.</p>}
        </>
      )}
    </div>
  );
}

function SidePointTable({ points = [] }) {
  if (!points.length) return null;
  return (
    <div className="side-point-section">
      <h4>Tia phụ · không tham gia bình sai</h4>
      <div className="network-table">
        <div className="network-point-row heading"><b>Điểm</b><b>Điểm gốc</b><b>H suy ra</b></div>
        {points.map((point) => <div className="network-point-row" key={point.id}><b>{point.name}</b><span>{point.fromName}</span><b className="numeric">{formatElevation(point.elevation)} m</b></div>)}
      </div>
    </div>
  );
}

function Files({ book, books, library, updateBook, newBook, save, saveAs, exportExcel, exportPdf, backupAll, exporting, fileRef, importFile, availablePoints, setDialog, outdoor, setOutdoor }) {
  const [query, setQuery] = useState('');
  const filtered = books.filter((item) => item.name.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
  const totalStations = books.reduce((count, item) => count + item.runs.reduce((sum, run) => sum + run.stations.filter((station) => station.point).length, 0), 0);
  const fileActions = [
    { label: 'Sổ mới', hint: 'Cất sổ hiện tại, bắt đầu mới', Icon: FilePlus2, onClick: newBook, primary: true },
    { label: 'Nhập sổ', hint: 'Excel hoặc sao lưu JSON', Icon: Upload, onClick: () => fileRef.current.click() },
    { label: 'Xuất Excel', hint: 'Số liệu & dữ liệu gốc', Icon: FileText, onClick: exportExcel },
    { label: 'Xuất PDF', hint: 'Báo cáo để đối chiếu', Icon: Download, onClick: exportPdf },
    { label: 'Lưu bản sao', hint: 'Giữ thêm một phiên bản', Icon: Copy, onClick: saveAs },
    { label: 'Lưu ngay', hint: 'Ghi vào thiết bị', Icon: Save, onClick: save },
  ];
  const activeHistory = library.checkpoints.filter((entry) => entry.book.id === book.id);
  return (
    <section className="files-shell">
      <SectionHeading Icon={FolderOpen} eyebrow="Thư viện hiện trường" title="Sổ đo của bạn" description="Tự lưu trên thiết bị. Nhập sổ mới luôn giữ nguyên các sổ đã có." />
      <div className="data-health"><div><span>Sổ trong thư viện</span><b className="numeric">{books.length}</b></div><div><span>Điểm đã ghi</span><b className="numeric">{totalStations}</b></div><div><span>Có thể khôi phục</span><b className="numeric">{library.trash.length}</b></div></div>
      <div className="file-group-heading"><ShieldCheck aria-hidden="true" /><div><span>An toàn dữ liệu</span><h3>Sao lưu & phục hồi</h3></div></div>
      <div className="card backup-card"><ShieldCheck /><div><h3>Mang theo một bản sao an toàn.</h3><p>Sao lưu toàn bộ sổ vào Tệp, Drive hoặc máy tính. Dữ liệu cục bộ có thể mất nếu gỡ ứng dụng hoặc xóa dữ liệu trình duyệt.</p></div><button className="primary" onClick={backupAll} disabled={Boolean(exporting)}><Download />Sao lưu tất cả</button></div>
      <div className="file-group-heading"><BookOpen aria-hidden="true" /><div><span>Sổ hiện tại</span><h3>Quản lý & nhập xuất</h3></div></div>
      <div className="card current-book">
        <div className="card-heading"><span>Sổ đang mở</span><h3>{book.name}</h3></div>
        <div className="file-actions">{fileActions.map(({ label, hint, Icon, onClick, primary }) => <button key={label} className={primary ? 'action-tile primary-tile' : 'action-tile'} onClick={onClick} disabled={Boolean(exporting)}><span className="action-icon" aria-hidden="true"><Icon /></span><span><b>{label}</b><small>{hint}</small></span></button>)}</div>
        {exporting && <p role="status" className="note">Đang xử lý tệp…</p>}
        <input ref={fileRef} aria-label="Chọn tệp nhập sổ" hidden type="file" accept=".xlsx,.xls,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) importFile(file); event.target.value = ''; }} />
      </div>
      <div className="file-group-heading"><Crosshair aria-hidden="true" /><div><span>Điểm khống chế</span><h3>Mốc chuẩn</h3></div></div>
      <div className="card benchmark-section" id="benchmark-section" tabIndex={-1}>
        <div className="card-title"><div className="card-heading"><span>Điểm gốc của sổ</span><h3>Mốc chuẩn</h3></div><button className="compact-button" onClick={() => updateBook((previous) => ({ ...previous, benchmarks: [...previous.benchmarks, createBenchmark()] }))}><Plus />Thêm mốc</button></div>
        <div className="bench-labels" aria-hidden="true"><span>Tên mốc</span><span>Cao độ H (m)</span></div>
        {book.benchmarks.map((benchmark) => <div className="benchrow" key={benchmark.id}>
          <PointCombobox ariaLabel="Tên mốc" className="benchmark-point-combobox" options={availablePoints} scopeKey={book.id} value={benchmark.name} onValueChange={(value) => updateBook((previous) => ({ ...previous, benchmarks: previous.benchmarks.map((item) => item.id === benchmark.id ? { ...item, name: value } : item) }))} />
          <label><BenchmarkElevationInput ariaLabel={'Cao độ mốc ' + (benchmark.name || '') + ' theo mét'} value={benchmark.elevation} onValueChange={(value) => updateBook((previous) => ({ ...previous, benchmarks: previous.benchmarks.map((item) => item.id === benchmark.id ? { ...item, elevation: value } : item) }))} /><span>m</span></label>
          <button className="danger icon-danger" aria-label={'Xóa mốc ' + benchmark.name} onClick={() => setDialog({ title: 'Xóa mốc ' + (benchmark.name || 'trống') + '?', description: 'Các tuyến dùng mốc này có thể không còn tính được cao độ. Bản trước khi xóa được giữ trong lịch sử khôi phục.', confirmLabel: 'Xóa mốc', onConfirm: () => {
            updateBook((previous) => ({ ...previous, benchmarks: previous.benchmarks.filter((item) => item.id !== benchmark.id) }), { checkpoint: 'Xóa mốc chuẩn' }); setDialog(null);
          } })}><Trash2 /></button>
        </div>)}
        {!book.benchmarks.length && <p className="empty">Thêm mốc có cao độ biết trước để tính cao độ của tuyến.</p>}
      </div>
      <div className="file-group-heading"><FolderOpen aria-hidden="true" /><div><span>Trên thiết bị</span><h3>Quản lý sổ</h3></div></div>
      <div className="card">
        <div className="card-title"><div className="card-heading"><span>Tất cả sổ đo</span><h3>Thư viện thiết bị</h3></div><span className="session-pill">{books.length} sổ</span></div>
        <label className="library-tools"><Search /><input type="search" aria-label="Tìm sổ" placeholder="Tìm theo tên sổ…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="saved-list">{filtered.map((saved) => <div className="saved" key={saved.id} data-active={saved.id === book.id}>
          <span className="saved-icon" aria-hidden="true"><BookOpen /></span><div><b>{saved.name}</b><small>{saved.id === book.id ? 'Đang mở · ' : ''}{new Date(saved.updatedAt).toLocaleString('vi-VN')}</small><small className="numeric">{saved.runs.length} lượt · {saved.runs.reduce((sum, run) => sum + run.stations.filter((station) => station.point).length, 0)} điểm</small></div>
          <div className="saved-actions"><button onClick={() => library.openBook(saved)} disabled={saved.id === book.id}>Mở</button><button className="danger icon-danger" aria-label={'Chuyển ' + saved.name + ' vào thùng rác'} onClick={() => setDialog({ title: 'Chuyển sổ vào thùng rác?', description: saved.name + ' có thể khôi phục từ mục Thùng rác.', confirmLabel: 'Chuyển vào thùng rác', onConfirm: () => { library.deleteBook(saved.id); setDialog(null); } })}><Trash2 /></button></div>
        </div>)}</div>
        {!filtered.length && <p className="empty">Không có sổ khớp tên đang tìm.</p>}
      </div>
      <details className="card"><summary><ArchiveRestore />Lịch sử khôi phục · {activeHistory.length} bản</summary>
        <p className="note">Giữ các mốc lưu gần nhất. Khôi phục tạo một bản riêng để đối chiếu với sổ hiện tại.</p>
        <div className="history-list">{activeHistory.map((entry) => <div className="saved" key={entry.id}><div><b>{entry.reason}</b><small>{new Date(entry.createdAt).toLocaleString('vi-VN')}</small></div><button onClick={() => library.restoreCheckpoint(entry.id)}>Khôi phục bản</button></div>)}</div>
        {!activeHistory.length && <p className="empty">Lưu trạm hoặc chuyển sổ để tạo mốc khôi phục.</p>}
      </details>
      <details className="card"><summary><Trash2 />Thùng rác · {library.trash.length} sổ</summary><div className="trash-list">
        {library.trash.map((entry) => <div className="saved" key={entry.id}><div><b>{entry.book.name}</b><small>{new Date(entry.deletedAt).toLocaleString('vi-VN')}</small></div><button onClick={() => library.restoreDeleted(entry.id)}>Khôi phục sổ</button></div>)}
        {!library.trash.length && <p className="empty">Chưa có sổ nào trong thùng rác.</p>}
      </div></details>
      <div className="file-group-heading"><Settings2 aria-hidden="true" /><div><span>Khả năng đọc</span><h3>Cài đặt hiển thị</h3></div></div>
      <details className="card field-settings"><summary><Settings2 />Ngưỡng nhắc nhập liệu</summary>
        <label className="setting-row outdoor-setting"><span><b>Chế độ ngoài trời</b><small>Tăng cỡ số và tương phản để đọc dưới nắng</small></span><input type="checkbox" aria-label="Bật chế độ ngoài trời" checked={outdoor} onChange={(event) => setOutdoor(event.target.checked)} /></label>
        <p className="note">Các ngưỡng do người đo đặt để phát hiện nhập nhầm; không phải tiêu chuẩn nghiệm thu. Nhập 0 để tắt từng nhắc.</p>
        {[[ 'staffLimit', 'Số đọc mia lớn hơn', 'm' ], [ 'deltaLimit', '|Δh| lớn hơn', 'm' ], [ 'middleErrorLimit', 'Sai số chỉ giữa lớn hơn', 'mm' ]].map(([key, label, unit]) => <label className="setting-row" key={key}><span>{label} <small>({unit})</small></span>{key === 'middleErrorLimit' ? <input className="numeric" inputMode="decimal" aria-label={label + ' ' + unit} value={book.settings[key] ?? FIELD_DEFAULTS[key]} onChange={(event) => updateBook((previous) => ({ ...previous, settings: { ...previous.settings, [key]: event.target.value } }))} /> : <MeterInput aria-label={label + ' ' + unit} value={book.settings[key] ?? FIELD_DEFAULTS[key]} onValueChange={(value) => updateBook((previous) => ({ ...previous, settings: { ...previous.settings, [key]: value } }))} />}</label>)}
      </details>
    </section>
  );
}
