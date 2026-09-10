import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import {
  BarChart2,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudCheck,
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
  Undo2,
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
  START_MODE_KNOWN,
  START_MODE_UNKNOWN,
  removeStation,
  solveRun,
} from './model';
import { uid, uppercaseName } from './calc';
import {
  collectSelectableControlPoints,
  filterPointNames,
  isNamedControlPoint,
  normalizePointType,
  POINT_TYPE_SIDE,
  POINT_TYPE_TURNING,
  remapGeneratedSidePointNames,
  suggestTargetPointName,
} from './pointNames';
import { exportExcelReport, exportPdfReport, exportLibraryBackup } from './report';
import { useNotebookLibrary } from './useNotebookLibrary';
import { inspectStation, normalizeStationDraft, FIELD_DEFAULTS } from './fieldChecks';
import { ConfirmDialog, ElevationProfile, QualityCard, SheetDialog, SurveyIllustration } from './FieldUI';
import {
  changeRunStartPoint,
  changeRunUnknownStart,
  createUnstartedRun,
  findValidBenchmark,
  runHasReadings,
  validBenchmarks,
} from './runStart';
import { EMPTY_PANEL_STATE, panelReducer } from './panelState';
import { OPEN_ROUTE_WARNING } from './terminology';
import {
  evaluateRunStandard,
  getLevelingClass,
  LEVELING_CLASSES,
  toleranceCoefficientForClass,
} from './levelingStandards';
import {
  canonicalBenchmarkElevationDraft,
  formatDistanceMeters,
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
const THREE_READING_ROWS = [['Upper', 'Trên'], ['Middle', 'Giữa'], ['Lower', 'Dưới']];
const THREE_READING_PREFIXES = ['bs', 'fs'];

const SWIPE_REVEAL_PX = 80;
const OUTDOOR_STORAGE_KEY = 'so-thuy-chuan.outdoor-mode.v1';

function pulse(pattern) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch { /* haptics are optional on iOS/WebView */ }
}

function MeterInput({ value, onValueChange, staffReading = false, sanitizer = sanitizeMeterInput, normalizer, className = '', placeholder = '0,000', onKeyDown, onComplete, confirmClear, ...props }) {
  const normalize = normalizer || (staffReading ? normalizeStaffInput : normalizeMeterInput);
  return (
    <input
      {...props}
      className={`${className} numeric meter-input`.trim()}
      inputMode="decimal"
      data-confirm-clear={confirmClear ? 'true' : undefined}
      placeholder={placeholder}
      value={value}
      onChange={(event) => {
        const nextValue = sanitizer(event.target.value);
        if (String(value ?? '').trim() && !nextValue && confirmClear) {
          confirmClear(() => onValueChange(''));
          return;
        }
        onValueChange(nextValue);
      }}
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
  return useMemo(() => collectSelectableControlPoints(currentBook), [currentBook]);
}

export default function App() {
  const library = useNotebookLibrary();
  const { book, books, updateBook } = library;
  const [tab, setTab] = useState('measure');
  const [runId, setRunId] = useState(() => book.runs[0].id);
  const [stationIndex, setStationIndex] = useState(0);
  const [panels, dispatchPanel] = useReducer(panelReducer, EMPTY_PANEL_STATE);
  const [toast, setToast] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [checksRequested, setChecksRequested] = useState(false);
  const [dialog, setDialog] = useState(null);
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
  const settingsRun = book.runs.find((run) => run.id === panels.settingsRunId) || null;
  const originPickerRun = book.runs.find((run) => run.id === panels.originPickerRunId) || null;
  const undoEntry = library.checkpoints.find((entry) => entry.book.id === book.id && entry.kind !== 'undo-backup') || null;

  useEffect(() => {
    setRunId(book.runs[0].id);
    setStationIndex(0);
    setChecksRequested(false);
    dispatchPanel({ type: 'reset' });
    setDialog(null);
  }, [book.id]);

  useEffect(() => {
    dispatchPanel({ type: 'reset' });
  }, [runId, tab]);

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
    dispatchPanel({ type: 'reset' }); setRunId(id); setStationIndex(0);
  }
  function openRunSettings(id = activeRun.id) {
    setDialog(null);
    dispatchPanel({ type: 'open-settings', runId: id });
  }
  function openOriginPicker(id = activeRun.id) {
    setDialog(null);
    dispatchPanel({ type: 'open-origin', runId: id });
  }
  function changeTab(nextTab) {
    dispatchPanel({ type: 'reset' });
    setDialog(null);
    setTab(nextTab);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }
  function addRun(mode = 'single') {
    const next = createUnstartedRun(book, mode);
    if (updateBook((previous) => ({ ...previous, runs: [...previous.runs, next] }))) {
      selectRun(next.id);
      setTab('measure');
    }
  }
  function goToBenchmarks() {
    dispatchPanel({ type: 'reset' });
    setTab('files');
    window.setTimeout(() => {
      const section = document.getElementById('benchmark-section');
      section?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      section?.querySelector('input, button')?.focus({ preventScroll: true });
    }, 50);
  }
  function setRunOrigin(run, pointName, { confirm = true, initial = false, startMode = START_MODE_KNOWN } = {}) {
    const benchmark = startMode === START_MODE_KNOWN ? findValidBenchmark(book, pointName) : null;
    const normalizedName = startMode === START_MODE_KNOWN ? benchmark?.name : uppercaseName(pointName).trim();
    if (!normalizedName || (normalizedName === run.startPoint && startMode === run.startMode)) return;
    const applyChange = () => {
      const saved = updateBook((previous) => startMode === START_MODE_KNOWN
        ? changeRunStartPoint(previous, run.id, normalizedName)
        : changeRunUnknownStart(previous, run.id, normalizedName), { checkpoint: 'Đổi mốc xuất phát' });
      if (saved) setToast({ text: initial
        ? `Đã bắt đầu ${run.name} từ ${normalizedName}`
        : `Đã đổi điểm đầu ${run.name} sang ${normalizedName} · Kết quả đã tính lại` });
    };
    if (confirm && runHasReadings(run)) {
      setDialog({
        title: `Đổi điểm xuất phát của ${run.name}?`,
        description: `Số đọc, tên điểm và thứ tự trạm được giữ nguyên. Cao độ của riêng ${run.name} sẽ được tính lại từ ${normalizedName}.`,
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
      if (!updateRun(activeRun.id, { stations: [...activeRun.stations, createStation('', POINT_TYPE_TURNING)] })) return;
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
  function requestUndo() {
    if (!undoEntry) return;
    const entry = undoEntry;
    setDialog({
      title: 'Hoàn tác thay đổi gần nhất?',
      description: `${entry.reason} · ${new Date(entry.createdAt).toLocaleString('vi-VN')}. Dữ liệu hiện tại sẽ được giữ thành một bản phục hồi an toàn.`,
      confirmLabel: 'Hoàn tác an toàn',
      onConfirm: () => {
        if (library.undoCheckpoint(entry.id)) {
          const restoredRun = entry.book.runs.find((run) => run.id === activeRun.id) || entry.book.runs[0];
          setRunId(restoredRun.id);
          setStationIndex(Math.min(stationIndex, restoredRun.stations.length - 1));
          setToast({ text: `Đã hoàn tác: ${entry.reason}` });
        }
        setDialog(null);
      },
    });
  }
  function requestClearReading(label, clearValue, field) {
    setDialog({
      title: `Xóa ${label}?`,
      description: 'Số đọc hiện tại sẽ bị xóa. Các ô khác của trạm vẫn được giữ nguyên.',
      confirmLabel: 'Xóa số đọc',
      onConfirm: () => {
        clearValue();
        setDialog(null);
        window.setTimeout(() => measureRef.current?.querySelector(`[data-reading="${field}"]`)?.focus({ preventScroll: true }), 0);
      },
    });
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
  function duplicateRun(targetRun = activeRun) {
    const id = uid(), roundNumber = nextRunNumber(book.runs);
    const copy = { ...structuredClone(targetRun), id, roundNumber, name: targetRun.name + ' - bản sao',
      stations: remapGeneratedSidePointNames(book, targetRun, id, roundNumber).map((station) => ({ ...station, id: uid() })),
    };
    if (updateBook((previous) => ({ ...previous, runs: [...previous.runs, copy] }))) selectRun(copy.id);
  }
  function deleteRun(targetRun = activeRun) {
    if (book.runs.length <= 1) { setToast({ text: 'Sổ cần ít nhất một lượt.' }); return; }
    setDialog({ title: 'Xóa ' + targetRun.name + '?', description: 'Bản trước khi xóa sẽ được giữ trong lịch sử khôi phục của sổ.', confirmLabel: 'Xóa lượt', onConfirm: () => {
      const runs = book.runs.filter((run) => run.id !== targetRun.id);
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
    <div className="app-v3 app-v25 app-v27 app-v28" data-outdoor={outdoor ? 'true' : 'false'}>
      <header className="workspace-header">
        <div className="brand-mark" aria-hidden="true"><img src="/level-mark.svg" alt="" /></div>
        <div className="brand-copy"><div className="eyebrow">THỦY CHUẨN <span className="version-badge">2.8.2</span></div><h1>{book.name}</h1></div>
        <div className="workspace-status"><button className="iconbtn" onClick={renameBook} aria-label="Đổi tên sổ"><PencilLine /></button></div>
      </header>
      <main id="main-content" data-tab={tab}>
        {tab !== 'measure' && <div className="field-toolbar compact-toolbar"><span className="save-indicator" data-state={library.saveState}><CloudCheck size={14} />{saveLabel}</span></div>}
        {library.storageError && <div className="storage-banner" role="alert"><TriangleAlert /><div><b>Cần bảo vệ dữ liệu</b><p>{library.storageError}</p><button onClick={backupAll} disabled={Boolean(exporting)}>Tải sao lưu ngay</button><button onClick={save}>Thử lưu lại</button></div></div>}
        {library.saveState === 'recovered' && !library.storageError && <p className="storage-banner" role="status">Đã khôi phục thư viện từ bản lưu an toàn gần nhất.</p>}
        {tab === 'route' && <RunPicker runs={book.runs} solvedRuns={solvedRuns} runId={activeRun.id} onSelect={selectRun} onAdd={() => addRun()} />}
        {tab === 'measure' && <div ref={measureRef}><Measure book={book} runs={book.runs} availablePoints={availablePoints} run={activeRun} solved={activeSolved} index={stationIndex} setIndex={setStationIndex} updateStation={updateStation} finish={() => finishStation()} changeMode={changeMode} checksRequested={checksRequested} saveState={library.saveState} onSelectRun={selectRun} onOpenSettings={() => openRunSettings(activeRun.id)} onUndo={requestUndo} undoEntry={undoEntry} onRequestClear={requestClearReading} onStart={(name, startMode) => setRunOrigin(activeRun, name, { confirm: false, initial: true, startMode })} onManageBenchmarks={goToBenchmarks} /></div>}
        {tab === 'route' && <><ElevationProfile solved={activeSolved} /><Route run={activeRun} solved={activeSolved} addStation={addStation} edit={(index) => { setStationIndex(index); changeTab('measure'); }} remove={deleteStation} onOpenSettings={() => openRunSettings(activeRun.id)} /></>}
        {tab === 'result' && <Results book={book} solvedRuns={solvedRuns} />}
        {tab === 'files' && <Files book={book} books={books} library={library} updateBook={updateBook} newBook={newBook} save={save} saveAs={saveAs} exportExcel={() => exportReport('xlsx')} exportPdf={() => exportReport('pdf')} backupAll={backupAll} exporting={exporting} fileRef={fileRef} importFile={importFile} availablePoints={availablePoints} setDialog={setDialog} outdoor={outdoor} setOutdoor={setOutdoor} />}
      </main>
      {tab === 'measure' && activeRun.startPoint && <CaptureDock book={book} run={activeRun} solved={activeSolved} index={stationIndex} setIndex={setStationIndex} finish={() => finishStation()} />}
      <nav className="bottom" aria-label="Điều hướng chính">
        {NAV_ITEMS.map(({ id, label, Icon }) => <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => changeTab(id)}><span className="nav-icon" aria-hidden="true"><Icon /></span><span className="nav-label">{label}</span></button>)}
      </nav>
      {toast && <div className="toast" role="status" aria-live="polite"><span>{toast.text}</span>{toast.action && <button onClick={() => { toast.action.fn(); setToast(null); }}>{toast.action.label}</button>}</div>}
      {settingsRun && <RunSettingsDialog run={settingsRun} updateRun={updateRun} onChangeOrigin={() => openOriginPicker(settingsRun.id)} onDuplicate={() => { dispatchPanel({ type: 'reset' }); duplicateRun(settingsRun); }} onDelete={() => { dispatchPanel({ type: 'reset' }); deleteRun(settingsRun); }} onClose={() => dispatchPanel({ type: 'close-settings' })} />}
      {originPickerRun && <OriginPickerDialog book={book} run={originPickerRun} onSelect={(name, startMode) => { dispatchPanel({ type: 'close-origin' }); setRunOrigin(originPickerRun, name, { startMode }); }} onManage={goToBenchmarks} onClose={() => dispatchPanel({ type: 'close-origin' })} />}
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

function OriginModeToggle({ value, onChange }) {
  return <div className="origin-mode-toggle" role="group" aria-label="Cách khống chế lượt đo">
    <button type="button" className={value === START_MODE_KNOWN ? 'active' : ''} aria-pressed={value === START_MODE_KNOWN} onClick={() => onChange(START_MODE_KNOWN)}>Mốc đầu đã biết</button>
    <button type="button" className={value === START_MODE_UNKNOWN ? 'active' : ''} aria-pressed={value === START_MODE_UNKNOWN} onClick={() => onChange(START_MODE_UNKNOWN)}>Mốc đầu chưa biết</button>
  </div>;
}

function OriginPickerDialog({ book, run, onSelect, onManage, onClose }) {
  const [startMode, setStartMode] = useState(run.startMode || START_MODE_KNOWN);
  const [selectedName, setSelectedName] = useState(startMode === START_MODE_KNOWN ? run.startPoint : '');
  const [unknownName, setUnknownName] = useState(startMode === START_MODE_UNKNOWN ? run.startPoint : '');
  const selected = findValidBenchmark(book, selectedName);
  const unknown = uppercaseName(unknownName).trim();
  const chosenName = startMode === START_MODE_KNOWN ? selected?.name : unknown;
  return <SheetDialog title="Điểm xuất phát" description={`${run.name} · chọn cách xác định cao độ của tuyến.`} onClose={onClose} className="benchmark-dialog">
    <OriginModeToggle value={startMode} onChange={setStartMode} />
    {startMode === START_MODE_KNOWN
      ? <BenchmarkChoiceList book={book} selectedName={selectedName} onSelect={setSelectedName} onManage={onManage} autoFocus />
      : <label className="field-label unknown-origin-input"><span>Tên điểm đầu chưa biết cao độ</span><input autoFocus value={unknownName} onChange={(event) => setUnknownName(uppercaseName(event.target.value).trimStart())} placeholder="Ví dụ: MỐC SỨ 01" autoCapitalize="characters" /></label>}
    {startMode === START_MODE_UNKNOWN && <p className="origin-mode-note"><TriangleAlert />Chỉ chọn mốc cuối làm khống chế khi đã có cao độ phù hợp và cùng hệ cao độ công trình. Tọa độ GPS không phải là cao độ.</p>}
    <div className="modal-actions"><button type="button" onClick={onClose}>Hủy</button><button type="button" className="primary" disabled={!chosenName || (chosenName === run.startPoint && startMode === run.startMode)} onClick={() => onSelect(chosenName, startMode)}><Check />Dùng {chosenName || 'điểm này'}</button></div>
  </SheetDialog>;
}

function RunSettingsDialog({ run, updateRun, onChangeOrigin, onDuplicate, onDelete, onClose }) {
  return <SheetDialog title="Cài đặt lượt" description={run.name} onClose={onClose} className="run-settings-sheet">
    <label className="field-label"><span>Tên lượt</span><input value={run.name} onChange={(event) => updateRun(run.id, { name: event.target.value })} /></label>
    <div className="settings-origin"><span><small>Điểm xuất phát</small><b>{run.startPoint || 'Chưa chọn'}</b><em>{run.startMode === START_MODE_UNKNOWN ? 'Chưa biết · khống chế cuối' : 'Đã biết cao độ'}</em></span><button type="button" onClick={onChangeOrigin}><PencilLine />Đổi điểm</button></div>
    <div className="runactions"><button type="button" onClick={onDuplicate}><Copy />Nhân bản</button><button type="button" className="danger" onClick={onDelete}><Trash2 />Xóa lượt</button></div>
  </SheetDialog>;
}

function StartSession({ book, run, onStart, onManageBenchmarks }) {
  const [startMode, setStartMode] = useState(START_MODE_KNOWN);
  const [name, setName] = useState('');
  const selected = findValidBenchmark(book, name);
  const unknown = uppercaseName(name).trim();
  const recent = [...book.runs].reverse().find((item) => item.id !== run.id && findValidBenchmark(book, item.startPoint))?.startPoint;
  function start(event) {
    event.preventDefault();
    if (startMode === START_MODE_KNOWN && selected) onStart(selected.name, START_MODE_KNOWN);
    if (startMode === START_MODE_UNKNOWN && unknown) onStart(unknown, START_MODE_UNKNOWN);
  }
  return <form className="start-session card" onSubmit={start}>
    <div className="start-session-heading">
      <div className="card-heading"><h2>Điểm xuất phát</h2></div>
      <SurveyIllustration />
    </div>
    <OriginModeToggle value={startMode} onChange={(mode) => { setStartMode(mode); setName(''); }} />
    {startMode === START_MODE_KNOWN ? <>
      {recent && <button type="button" className="recent-benchmark" onClick={() => setName(recent)}><span>Dùng gần nhất</span><b>{recent}</b><ArrowRight /></button>}
      <BenchmarkChoiceList book={book} selectedName={name} onSelect={setName} onManage={onManageBenchmarks} autoFocus />
    </> : <>
      <label className="field-label unknown-origin-input"><span>Tên điểm đầu</span><input autoFocus value={name} onChange={(event) => setName(uppercaseName(event.target.value).trimStart())} placeholder="Ví dụ: MỐC SỨ 01" autoCapitalize="characters" /></label>
      <p className="origin-mode-note"><TriangleAlert />Cao độ để “Chưa xác định” đến khi tuyến gặp một mốc đã biết ở điểm cuối.</p>
    </>}
    <button className="primary start-measurement" type="submit" disabled={startMode === START_MODE_KNOWN ? !selected : !unknown}><Crosshair />Bắt đầu đo{(selected?.name || unknown) ? ` từ ${selected?.name || unknown}` : ''}<ArrowRight /></button>
  </form>;
}

function Measure({ book, runs, availablePoints, run, solved, index, setIndex, updateStation, finish, changeMode, checksRequested, saveState, onSelectRun, onOpenSettings, onUndo, undoEntry, onRequestClear, onStart, onManageBenchmarks }) {
  const station = run.stations[index];
  const row = solved.rows[index];
  if (!station) return null;
  const pointType = normalizePointType(station.pointType);
  const autoName = suggestTargetPointName(book, run.id, index, pointType);
  const displayPoint = station.point || autoName;
  const inspection = inspectStation(book, run, index, autoName);
  const update = (field, value) => updateStation(run, station.id, field, value);
  const confirmClear = (field, label) => (apply) => onRequestClear(label, apply, field);
  const usedControls = run.stations.slice(0, index).map((item) => item.point).filter(isNamedControlPoint);
  const recentControl = usedControls.filter((name) => /^DC/i.test(name)).at(-1) || null;
  const unresolved = row?.elevation === null || row?.elevation === undefined;
  const elevationText = unresolved ? 'Chưa xác định' : `${formatElevation(row.elevation)} m`;
  const legacySide = pointType === POINT_TYPE_SIDE;

  return (
    <section className="measure-shell">
      <div className="measure-run-header">
        <label><span className="sr-only">Chọn lượt đo</span><select value={run.id} onChange={(event) => onSelectRun(event.target.value)}>{runs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <span className={`measure-run-status ${solved.solved ? 'is-ready' : 'is-open'}`}>{solved.solved ? 'Đã có cao độ' : run.startMode === START_MODE_UNKNOWN ? 'Chưa khép mốc' : 'Đang đo'}</span>
        <span className="measure-save-state">{saveState === 'error' ? 'Lỗi lưu' : saveState === 'unsaved' ? 'Đang lưu' : 'Đã lưu'}</span>
        <button type="button" className="undo-btn" disabled={!undoEntry} onClick={onUndo} aria-label={undoEntry ? `Hoàn tác: ${undoEntry.reason}` : 'Chưa có thay đổi để hoàn tác'} title={undoEntry ? `Hoàn tác: ${undoEntry.reason}` : 'Chưa có thay đổi để hoàn tác'}><Undo2 /><span>Hoàn tác</span></button>
        <button type="button" className="settings-btn" aria-label={`Cài đặt ${run.name}`} onClick={onOpenSettings}><Settings2 /></button>
      </div>
      {!run.startPoint && <StartSession key={run.id} book={book} run={run} onStart={onStart} onManageBenchmarks={onManageBenchmarks} />}
      <div className={`measure-layout measure-only${run.startPoint ? '' : ' is-locked'}`} aria-hidden={!run.startPoint}>
        <div className="measure-primary">
          <div className="measure-route-line">
            <span>Trạm {index + 1}</span><b>{row?.fromName || run.startPoint || '—'} <ArrowRight /> {displayPoint}</b>
            {legacySide && <em>Dữ liệu TP cũ · chỉ đọc loại điểm</em>}
          </div>
          <div className="survey-console">
            <div className="console-top">
              <div><span>Điểm đặt mia sau</span><strong>{row?.fromName || run.startPoint || '—'}</strong><small className="numeric">{row?.fromElevation == null ? 'H chưa xác định' : `H ${formatElevation(row.fromElevation)} m`}</small></div>
              <div className="seg" aria-label="Phương pháp đọc mia">
                <button type="button" aria-pressed={run.mode === 'single'} className={run.mode === 'single' ? 'active' : ''} onClick={() => changeMode('single')}>1 chỉ</button>
                <button type="button" aria-pressed={run.mode === 'three'} className={run.mode === 'three' ? 'active' : ''} onClick={() => changeMode('three')}>3 chỉ</button>
              </div>
            </div>
            <div className={`reading-grid readings${run.mode === 'three' ? ' is-three' : ''}`}>
              {run.mode === 'single' ? <>
                <div className="reading reading-bs"><div className="reading-title"><span>Mia sau<small>Số đọc theo mét</small></span><em>BS</em></div>
                  <MeterInput className="hero-input" data-reading="bs" staffReading aria-label="Số đọc mia sau BS theo mét" aria-invalid={checksRequested && inspection.errors.some((item) => item.field === 'bs')} enterKeyHint="next" value={station.bs} onValueChange={(value) => update('bs', value)} confirmClear={confirmClear('bs', 'số đọc mia sau BS')} onFocus={(event) => event.target.select()} /></div>
                <div className="reading reading-fs"><div className="reading-title"><span>Mia trước<small>Số đọc theo mét</small></span><em>FS</em></div>
                  <MeterInput className="hero-input" data-reading="fs" staffReading aria-label="Số đọc mia trước FS theo mét" aria-invalid={checksRequested && inspection.errors.some((item) => item.field === 'fs')} enterKeyHint="done" value={station.fs} onValueChange={(value) => update('fs', value)} confirmClear={confirmClear('fs', 'số đọc mia trước FS')} onComplete={finish} onFocus={(event) => event.target.select()} /></div>
              </> : <ThreeReadingMatrix station={station} row={row} update={update} confirmClear={confirmClear} finish={finish} />}
            </div>
            <div className="result-strip" aria-label="Kết quả tính tức thời">
              <div><span>H tới · {displayPoint}</span><strong className="numeric">{elevationText}</strong></div>
              <div><span>Chênh cao · Δh</span><b className="numeric">{formatSignedMillimeters(row?.delta)} <small>mm</small></b></div>
              <div><span>Chênh cao tích lũy</span><b className="numeric">{formatSignedMillimeters(row?.cumulativeDelta)} <small>mm</small></b></div>
            </div>
          </div>
          <div className="pointbox">
            <div className="point-entry"><span>Điểm tới</span><PointCombobox key={station.id} ariaLabel="Điểm tới" options={availablePoints} scopeKey={book.id} placeholder={autoName} value={station.point} onValueChange={(value) => update('point', value)} /></div>
            {!legacySide && recentControl && <div className="control-point-hints">
              {recentControl && <span>DC gần nhất: <b>{recentControl}</b></span>}
            </div>}
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
    <div className="capture-dock-summary"><span>Điểm tới <b className="numeric">{displayPoint}</b></span><strong className="numeric">{row?.elevation == null ? 'Chưa xác định' : `${formatElevation(row.elevation)} m`}</strong></div>
    <div className="field-actions"><button className="step-button" aria-label="Trạm trước" title="Trạm trước" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}><ChevronLeft /></button><button type="button" className="primary finish" onClick={finish}><Check />{station.committedAt ? 'Cập nhật trạm' : 'Lưu trạm'}</button><button className="step-button" aria-label="Trạm tiếp theo" title="Trạm tiếp theo" onClick={() => setIndex(Math.min(run.stations.length - 1, index + 1))} disabled={index === run.stations.length - 1}><ChevronRight /></button></div>
  </div>;
}
function ThreeReadingMatrix({ station, row, update, confirmClear, finish }) {
  return (
    <div className="reading three-reading-matrix">
      <div className="three-matrix-head" aria-hidden="true"><span>Chỉ</span><b>Mia sau <em>BS</em></b><b>Mia trước <em>FS</em></b></div>
      <div className="three-matrix-body">
        {THREE_READING_ROWS.map(([suffix, label], order) => (
          <div className="three-matrix-row" key={suffix}>
            <span className="three-row-label"><b>{order + 1}</b>{label}</span>
            {THREE_READING_PREFIXES.map((prefix) => {
              const field = `${prefix}${suffix}`;
              const title = prefix === 'bs' ? 'Mia sau' : 'Mia trước';
              const isLast = prefix === 'fs' && suffix === 'Lower';
              return <MeterInput key={field} data-reading={field} staffReading autoComplete="off" spellCheck={false} aria-label={`${title} chỉ ${label.toLowerCase()} theo mét`} enterKeyHint={isLast ? 'done' : 'next'} value={station[field]} onValueChange={(value) => update(field, value)} confirmClear={confirmClear(field, `${title.toLowerCase()} chỉ ${label.toLowerCase()}`)} onComplete={isLast ? finish : undefined} />;
            })}
          </div>
        ))}
      </div>
      <div className="three-matrix-stats">
        <span>D sau <b className="numeric">{formatMeters(row?.db)} m</b></span>
        <span>D trước <b className="numeric">{formatMeters(row?.df)} m</b></span>
        <span>ΔD <b className="numeric">{formatMeters(row?.distanceDifference)} m</b></span>
      </div>
    </div>
  );
}

function Route({ run, solved, addStation, edit, remove, onOpenSettings }) {
  return (
    <section className="route-shell">
      <div className="card runsummary">
        <div className="runsummary-top">
          <div className="runsummary-badge" aria-hidden="true"><RouteIcon /></div>
          <div className="runsummary-main"><small>Tuyến đang chọn</small><h2>{run.name}</h2><p><b>{run.startPoint || '—'}</b><span aria-hidden="true">→</span><b>{solved.endPoint || run.startPoint || '—'}</b><span>· {solved.turningCount} ĐC · {solved.sideCount} TP</span></p></div>
          <button className="settings-btn" aria-label="Cài đặt lượt đo" onClick={onOpenSettings}><Settings2 /></button>
        </div>
      </div>
      {!solved.solved && <p className="warning">{run.startMode === START_MODE_UNKNOWN ? 'Lượt chưa khép vào mốc cao độ.' : 'Lượt này chưa chứa mốc chuẩn có cao độ biết trước.'}</p>}
      {solved.reverseAnchored && <p className="check">Đã khống chế tại {solved.controlPoint} · cao độ điểm đầu được tính ngược: <b className="numeric">{formatElevation(solved.startElevation)} m</b>.</p>}
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
          <small className="route-elevation"><span>H tới: <strong className="numeric">{row.elevation == null ? 'Chưa xác định' : `${formatElevation(row.elevation)} m`}</strong></span>{row.distance !== null && <span className="route-distance numeric">D {formatMeters(row.distance)} m</span>}</small>
        </span>
        <span className="route-chevron" aria-hidden="true"><ChevronRight /></span>
      </button>
    </div>
  );
}

function comparisonDirection(pair) {
  if (pair.difference === 0) return `${pair.toRunName} bằng ${pair.fromRunName}`;
  return `${pair.toRunName} ${pair.difference > 0 ? 'cao hơn' : 'thấp hơn'} ${pair.fromRunName}`;
}

const formatLimitMillimeters = (value) => Number.isFinite(value) ? new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value) : '—';

function Results({ book, solvedRuns }) {
  const comparisons = compareRuns(solvedRuns, book.benchmarks);
  const coefficient = toleranceCoefficientForClass(book.settings.measurementClass);
  const network = adjustLevelingNetwork(solvedRuns, book.benchmarks, coefficient);
  return (
    <section className="result-shell">
      <h2 className="page-title">Kết quả</h2>
      <div className="result-area" data-result-area="closure">
        <div className="result-area-heading"><h3>Kiểm tra khép</h3></div>
        {solvedRuns.map((solved) => (
          <div className="card result-card" key={solved.runId}>
            <div className="card-heading"><span>Lượt đo</span><h3>{solved.runName}</h3></div>
            <div className="metric">
              <div><span>ĐC / TP</span><b className="numeric">{solved.turningCount} / {solved.sideCount}</b></div>
              <div><span>Chiều dài</span><b className="numeric">{solved.totalDistance === null ? '—' : `${formatDistanceMeters(solved.totalDistance)} m`}</b></div>
              <div><span>ΣΔD</span><b className="numeric">{formatMeters(solved.sumDistanceDifference)} m</b></div>
            </div>
            {solved.checks.length ? solved.checks.map((check) => (
              <div className="check benchmark-summary" key={`${solved.runId}-${check.index}`}><b>{check.name}</b><span className="numeric">Chuẩn {formatElevation(check.known)} m · Đo {formatElevation(check.measured)} m · Lệch {formatSignedMillimeters(check.difference)} mm</span></div>
            )) : <p className="warning">Lượt này chưa chứa mốc chuẩn.</p>}
            <RunStandardAssessment assessment={evaluateRunStandard(solved, book.settings.measurementClass)} />
          </div>
        ))}
      </div>
      <div className="result-area" data-result-area="comparison">
        <div className="result-area-heading"><h3>So sánh điểm chung</h3></div>
        <div className="card">
          {comparisons.length ? comparisons.map((group) => (
            <div className="compare" key={group.name}>
              <div className="compareHead"><b>{group.name}</b><span><small>Biên độ (Max−Min)</small><strong className="numeric">{formatMillimeters(group.spread)} mm</strong></span></div>
              {group.values.map((value) => <div className="compareLine" key={value.runId}><span>{value.runName}</span><b className="numeric">{formatElevation(value.elevation)} m</b></div>)}
              <details className="pair-comparisons" open={group.pairs.length <= 3}>
                <summary>Chênh lệch giữa các lượt · {group.pairs.length}</summary>
                {group.pairs.map((pair) => <div className="pair-comparison" key={`${pair.fromRunId}-${pair.toRunId}`}>
                  <span><b>{pair.fromRunName} ↔ {pair.toRunName}</b><small>{comparisonDirection(pair)}</small></span>
                  <strong className="numeric">{formatMillimeters(pair.absoluteDifference)} mm <small>({formatSignedMillimeters(pair.difference)} mm)</small></strong>
                </div>)}
              </details>
            </div>
          )) : <p className="empty">Chưa có điểm chuyền cùng tên ở ít nhất 2 lượt.</p>}
        </div>
      </div>
      <div className="result-area" data-result-area="adjustment">
        <NetworkAdjustment network={network} />
      </div>
    </section>
  );
}

function RunStandardAssessment({ assessment }) {
  if (assessment.status === 'unselected') return <div className="standard-assessment is-pending" role="status"><b>Chưa chọn hạng đo</b><span>Chọn hạng tại tab Sổ & tệp để đánh giá sai số khép.</span></div>;
  if (assessment.status === 'incomplete') return <div className="standard-assessment is-pending" role="status"><b>Chưa đủ điều kiện đánh giá</b><span>Tuyến cần khép hoặc nối giữa hai mốc có cao độ.</span></div>;
  if (assessment.status === 'missing-distance') return <div className="standard-assessment is-pending" role="status"><b>Chưa đủ chiều dài tuyến</b><span>Nhập đủ khoảng cách để áp dụng {assessment.standard.coefficient}√L.</span></div>;
  return (
    <div className={`standard-assessment ${assessment.passed ? 'is-passed' : 'is-failed'}`} role="status">
      <span className="standard-state">{assessment.passed ? <Check aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}<b>{assessment.passed ? 'Đạt' : 'Không đạt'} {assessment.standard.shortLabel}</b></span>
      <span className="numeric">|fₕ| = {formatMillimeters(Math.abs(assessment.closure))} mm {assessment.passed ? '≤' : '>'} {assessment.standard.coefficient}√{formatDistanceMeters(assessment.lengthKm)} = {formatLimitMillimeters(assessment.allowable)} mm</span>
    </div>
  );
}

function NetworkAdjustment({ network }) {
  return (
    <div className="card network-adjustment">
      <h3>Bình sai lưới</h3>
      {!network.available ? (
        <>
          <div className="warning warning-card" role="status"><span className="warning-icon" aria-hidden="true"><TriangleAlert /></span><span>{network.reason}</span></div>
          <SidePointTable points={network.sidePoints} />
        </>
      ) : (
        <>
          <details className="method-note"><summary>Phương pháp tính</summary><p>{network.method}. Mốc chuẩn được giữ cố định; chỉ điểm chuyền tham gia phương trình. Tia phụ cũ nhận cao độ suy ra từ điểm gốc sau bình sai.</p></details>
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
  const selectedStandard = getLevelingClass(book.settings.measurementClass);
  const fileActions = [
    { label: 'Sổ mới', Icon: FilePlus2, onClick: newBook, primary: true },
    { label: 'Nhập sổ', Icon: Upload, onClick: () => fileRef.current.click() },
    { label: 'Xuất Excel', Icon: FileText, onClick: exportExcel },
    { label: 'Xuất PDF', Icon: Download, onClick: exportPdf },
    { label: 'Lưu bản sao', Icon: Copy, onClick: saveAs },
    { label: 'Lưu ngay', Icon: Save, onClick: save },
  ];
  const activeHistory = library.checkpoints.filter((entry) => entry.book.id === book.id);
  return (
    <section className="files-shell">
      <h2 className="page-title">Sổ & tệp</h2>
      <div className="card backup-card"><ShieldCheck /><div><h3>Sao lưu dữ liệu</h3><p>Tạo một tệp chứa toàn bộ sổ và lịch sử khôi phục.</p></div><button className="primary" onClick={backupAll} disabled={Boolean(exporting)}><Download />Sao lưu</button></div>
      <div className="card current-book">
        <div className="card-heading"><span>Sổ đang mở</span><h3>{book.name}</h3></div>
        <div className="file-actions">{fileActions.map(({ label, Icon, onClick, primary }) => <button key={label} className={primary ? 'action-tile primary-tile' : 'action-tile'} onClick={onClick} disabled={Boolean(exporting)}><span className="action-icon" aria-hidden="true"><Icon /></span><b>{label}</b></button>)}</div>
        {exporting && <p role="status" className="note">Đang xử lý tệp…</p>}
        <input ref={fileRef} aria-label="Chọn tệp nhập sổ" hidden type="file" accept=".xlsx,.xls,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) importFile(file); event.target.value = ''; }} />
      </div>
      <div className="card survey-standard-card">
        <div className="card-heading"><span>Tiêu chuẩn kiểm tra khép</span><h3>Hạng đo</h3></div>
        <label className="standard-select"><span className="sr-only">Chọn hạng đo</span><select aria-label="Chọn hạng đo" aria-required="true" value={book.settings.measurementClass || ''} onChange={(event) => updateBook((previous) => ({ ...previous, settings: { ...previous.settings, measurementClass: event.target.value } }), { checkpoint: 'Đổi hạng đo' })}>
          <option value="">Chọn hạng đo…</option>
          {LEVELING_CLASSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        {selectedStandard ? <div className="standard-formula"><span>Hạn sai khép cho phép</span><b className="numeric">|fₕ| ≤ {selectedStandard.coefficient}√L mm</b><small>L tính bằng km · {selectedStandard.source}</small></div> : <p className="standard-required"><TriangleAlert aria-hidden="true" />Cần chọn hạng đo trước khi phần Kết quả có thể nhận xét Đạt/Không đạt.</p>}
      </div>
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
      <details className="card field-settings"><summary><Settings2 />Ngưỡng nhắc nhập liệu</summary>
        <label className="setting-row outdoor-setting"><span><b>Chế độ ngoài trời</b><small>Tăng cỡ số và tương phản để đọc dưới nắng</small></span><input type="checkbox" aria-label="Bật chế độ ngoài trời" checked={outdoor} onChange={(event) => setOutdoor(event.target.checked)} /></label>
        <p className="note">Các ngưỡng do người đo đặt để phát hiện nhập nhầm; không phải tiêu chuẩn nghiệm thu. Nhập 0 để tắt từng nhắc.</p>
        {[[ 'staffLimit', 'Số đọc mia lớn hơn', 'm' ], [ 'deltaLimit', '|Δh| lớn hơn', 'm' ], [ 'middleErrorLimit', 'Sai số chỉ giữa lớn hơn', 'mm' ]].map(([key, label, unit]) => <label className="setting-row" key={key}><span>{label} <small>({unit})</small></span>{key === 'middleErrorLimit' ? <input className="numeric" inputMode="decimal" aria-label={label + ' ' + unit} value={book.settings[key] ?? FIELD_DEFAULTS[key]} onChange={(event) => updateBook((previous) => ({ ...previous, settings: { ...previous.settings, [key]: event.target.value } }))} /> : <MeterInput aria-label={label + ' ' + unit} value={book.settings[key] ?? FIELD_DEFAULTS[key]} onValueChange={(value) => updateBook((previous) => ({ ...previous, settings: { ...previous.settings, [key]: value } }))} />}</label>)}
      </details>
    </section>
  );
}
