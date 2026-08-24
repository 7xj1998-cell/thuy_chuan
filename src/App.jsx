import { useEffect, useMemo, useRef, useState } from 'react';
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
  MapPin,
  PencilLine,
  Plus,
  Route as RouteIcon,
  Save,
  Settings2,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import {
  adjustLevelingNetwork,
  compareRuns,
  createBenchmark,
  createBook,
  createRun,
  createStation,
  migrateLegacyBook,
  normalizeBook,
  removeStation,
  restoreStation,
  saveAsCopy,
  solveRun,
  STORAGE_KEYS,
} from './model';
import { uid, uppercaseName } from './calc';
import { exportExcelReport, exportPdfReport } from './report';
import { OPEN_ROUTE_WARNING } from './terminology';
import {
  formatElevation,
  formatMeters,
  formatMillimeters,
  formatSignedMillimeters,
  formatStaffReading,
  normalizeMeterInput,
  normalizeStaffInput,
  sanitizeMeterInput,
} from './units';

const NAV_ITEMS = [
  { id: 'measure', label: 'Đo', Icon: Crosshair },
  { id: 'route', label: 'Tuyến', Icon: RouteIcon },
  { id: 'result', label: 'Kết quả', Icon: BarChart2 },
  { id: 'files', label: 'Sổ & tệp', Icon: FolderOpen },
];

const SWIPE_REVEAL_PX = 88;

function MeterInput({ value, onValueChange, staffReading = false, className = '', placeholder = '0,000', ...props }) {
  const normalize = staffReading ? normalizeStaffInput : normalizeMeterInput;
  return (
    <input
      {...props}
      className={`${className} numeric meter-input`.trim()}
      inputMode="decimal"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(sanitizeMeterInput(event.target.value))}
      onBlur={() => onValueChange(normalize(value))}
    />
  );
}

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function loadBooks() {
  const current = readStorage(STORAGE_KEYS.books, null);
  if (Array.isArray(current)) return current.map(normalizeBook);
  const legacy = readStorage(STORAGE_KEYS.legacy, []);
  if (!legacy.length) return [];
  const migrated = legacy.map(migrateLegacyBook);
  localStorage.setItem(STORAGE_KEYS.books, JSON.stringify(migrated));
  return migrated;
}

export default function App() {
  const [books, setBooks] = useState(loadBooks);
  const [book, setBook] = useState(() => normalizeBook(readStorage(STORAGE_KEYS.draft, null) || createBook()));
  const [tab, setTab] = useState('measure');
  const [runId, setRunId] = useState(() => book.runs[0].id);
  const [stationIndex, setStationIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [exporting, setExporting] = useState(null);
  const fileRef = useRef(null);

  const activeRunIndex = Math.max(0, book.runs.findIndex((run) => run.id === runId));
  const activeRun = book.runs[activeRunIndex];
  const solvedRuns = useMemo(() => book.runs.map((run) => solveRun(run, book.benchmarks)), [book]);
  const activeSolved = solvedRuns[activeRunIndex];

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify({ ...book, updatedAt: Date.now() }));
    }, 180);
    return () => clearTimeout(timer);
  }, [book]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), toast.action ? 4500 : 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  const updateBook = (updater) => {
    setBook((previous) => {
      const next = typeof updater === 'function' ? updater(previous) : { ...previous, ...updater };
      return normalizeBook({ ...next, updatedAt: Date.now() });
    });
  };

  const updateRun = (id, patch) => {
    updateBook((previous) => ({
      ...previous,
      runs: previous.runs.map((run) => run.id === id ? { ...run, ...patch } : run),
    }));
  };

  const updateStation = (run, stationId, field, value) => {
    updateRun(run.id, {
      stations: run.stations.map((station) => station.id === stationId
        ? { ...station, [field]: field === 'point' ? uppercaseName(value).trimStart() : value }
        : station),
    });
  };

  function selectRun(id) {
    setRunId(id);
    setStationIndex(0);
    setSettingsOpen(false);
  }

  function addRun() {
    const next = createRun(book.runs.length + 1, book.benchmarks[0]?.name || '');
    updateBook((previous) => ({ ...previous, runs: [...previous.runs, next] }));
    selectRun(next.id);
  }

  function addStation() {
    const next = createStation();
    updateRun(activeRun.id, { stations: [...activeRun.stations, next] });
    setStationIndex(activeRun.stations.length);
    setTab('measure');
  }

  function finishStation() {
    const station = activeRun.stations[stationIndex];
    if (!station.point.trim()) {
      alert('Nhập tên điểm tới trước khi hoàn tất trạm.');
      return;
    }
    if (stationIndex < activeRun.stations.length - 1) setStationIndex(stationIndex + 1);
    else addStation();
    setToast({ text: 'Đã lưu trạm' });
  }

  function deleteStation(index) {
    const result = removeStation(activeRun, index);
    if (!result.removed) {
      alert('Lượt đo cần ít nhất 1 trạm.');
      return;
    }
    updateRun(activeRun.id, { stations: result.stations });
    setStationIndex(Math.min(stationIndex, result.stations.length - 1));
    setToast({
      text: `Đã xóa trạm ${index + 1}`,
      action: {
        label: 'Hoàn tác',
        fn: () => {
          updateRun(activeRun.id, { stations: restoreStation(result.stations, result.removed) });
          setStationIndex(index);
        },
      },
    });
  }

  function save() {
    const saved = normalizeBook({ ...book, updatedAt: Date.now() });
    const next = [saved, ...books.filter((item) => item.id !== saved.id)];
    setBook(saved);
    setBooks(next);
    localStorage.setItem(STORAGE_KEYS.books, JSON.stringify(next));
    localStorage.removeItem(STORAGE_KEYS.draft);
    setToast({ text: 'Đã lưu sổ' });
  }

  function saveAs() {
    const name = prompt('Tên sổ mới:', `${book.name} - bản sao`);
    if (!name?.trim()) return;
    const copy = saveAsCopy(book, name);
    const next = [copy, ...books];
    setBook(copy);
    setBooks(next);
    setRunId(copy.runs[0].id);
    setStationIndex(0);
    localStorage.setItem(STORAGE_KEYS.books, JSON.stringify(next));
    setToast({ text: 'Đã lưu thành sổ mới' });
  }

  function renameBook() {
    const name = prompt('Đổi tên sổ:', book.name);
    if (name?.trim()) updateBook({ name: name.trim() });
  }

  function newBook() {
    if (!confirm('Tạo sổ mới? Bản nháp hiện tại vẫn được lưu.')) return;
    const next = createBook();
    setBook(next);
    setRunId(next.runs[0].id);
    setStationIndex(0);
    setTab('measure');
  }

  function duplicateRun() {
    const copy = {
      ...structuredClone(activeRun),
      id: uid(),
      name: `${activeRun.name} - bản sao`,
      stations: activeRun.stations.map((station) => ({ ...station, id: uid() })),
    };
    updateBook((previous) => ({ ...previous, runs: [...previous.runs, copy] }));
    selectRun(copy.id);
  }

  function deleteRun() {
    if (book.runs.length <= 1) {
      alert('Sổ cần ít nhất 1 lượt.');
      return;
    }
    if (!confirm('Xóa lượt này?')) return;
    const runs = book.runs.filter((run) => run.id !== activeRun.id);
    updateBook((previous) => ({ ...previous, runs }));
    selectRun(runs[0].id);
  }

  async function exportReport(type) {
    const label = type === 'pdf' ? 'PDF' : 'Excel';
    const desired = prompt(`Tên file ${label}:`, book.name);
    if (!desired?.trim()) return;
    setExporting(type);
    setToast({ text: `Đang tạo ${label}...` });
    try {
      const filename = type === 'pdf'
        ? await exportPdfReport(book, solvedRuns, desired.trim())
        : await exportExcelReport(book, solvedRuns, desired.trim());
      setToast({ text: `Đã xuất ${filename}` });
    } catch (error) {
      console.error(error);
      setToast(null);
      alert(`Không thể xuất ${label}. Vui lòng thử lại.`);
    } finally {
      setExporting(null);
    }
  }

  async function importExcel(file) {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      if (!workbook.Props?.Comments) throw new Error('Không có dữ liệu sổ');
      const raw = JSON.parse(workbook.Props.Comments);
      const imported = Number(raw.schemaVersion) >= 2 ? normalizeBook(raw) : migrateLegacyBook(raw);
      const copy = normalizeBook({
        ...imported,
        id: uid(),
        name: `${imported.name || file.name} (nhập)`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setBook(copy);
      setRunId(copy.runs[0].id);
      setStationIndex(0);
      setToast({ text: 'Đã nhập thành sổ mới' });
    } catch (error) {
      console.error(error);
      alert('File Excel không đúng định dạng sổ thủy chuẩn.');
    }
  }

  return (
    <div className="app-v3">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-symbol" aria-hidden="true"><Crosshair /></div>
          <div className="brand">
            <div className="eyebrow"><span className="status-dot" />SỔ ĐO HIỆN TRƯỜNG · m / mm</div>
            <h1>{book.name}</h1>
          </div>
        </div>
        <button className="iconbtn" onClick={renameBook} aria-label="Đổi tên sổ" title="Đổi tên sổ"><PencilLine /></button>
      </header>

      <main id="main-content" data-tab={tab}>
        {tab !== 'files' && <RunPicker runs={book.runs} runId={activeRun.id} onSelect={selectRun} onAdd={addRun} />}
        {tab === 'measure' && (
          <Measure run={activeRun} solved={activeSolved} index={stationIndex} setIndex={setStationIndex} updateStation={updateStation} updateRun={updateRun} finish={finishStation} />
        )}
        {tab === 'route' && (
          <Route
            run={activeRun}
            solved={activeSolved}
            settingsOpen={settingsOpen}
            setSettingsOpen={setSettingsOpen}
            updateRun={updateRun}
            addStation={addStation}
            edit={(index) => { setStationIndex(index); setTab('measure'); }}
            remove={deleteStation}
            duplicate={duplicateRun}
            deleteRun={deleteRun}
          />
        )}
        {tab === 'result' && <Results book={book} solvedRuns={solvedRuns} updateBook={updateBook} />}
        {tab === 'files' && (
          <Files
            book={book}
            books={books}
            updateBook={updateBook}
            setBook={(value) => {
              const normalized = normalizeBook(value);
              setBook(normalized);
              setRunId(normalized.runs[0].id);
              setStationIndex(0);
            }}
            setBooks={setBooks}
            newBook={newBook}
            save={save}
            saveAs={saveAs}
            rename={renameBook}
            exportExcel={() => exportReport('xlsx')}
            exportPdf={() => exportReport('pdf')}
            exporting={exporting}
            fileRef={fileRef}
            importExcel={importExcel}
          />
        )}
      </main>

      <nav className="bottom" aria-label="Điều hướng chính">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <span className="nav-icon" aria-hidden="true"><Icon /></span>
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast.text}</span>
          {toast.action && <button onClick={() => { toast.action.fn(); setToast(null); }}>{toast.action.label}</button>}
        </div>
      )}
    </div>
  );
}

function RunPicker({ runs, runId, onSelect, onAdd }) {
  const selectedRun = runs.find((run) => run.id === runId) || runs[0];
  const endPoint = [...selectedRun.stations].reverse().find((station) => station.point.trim())?.point || '—';
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

function Measure({ run, solved, index, setIndex, updateStation, updateRun, finish }) {
  const station = run.stations[index];
  const row = solved.rows[index];
  if (!station) return null;
  const progress = Math.round(((index + 1) / run.stations.length) * 100);

  return (
    <section className="measure-shell">
      <div className="station-toolbar">
        <div className="measure-head">
          <div className="runlabel"><span className="section-kicker">Đang đo</span><strong>Trạm {index + 1} <i>/ {run.stations.length}</i></strong><small>{run.name}</small></div>
          <div className="seg" aria-label="Phương pháp đọc mia">
            <button aria-pressed={run.mode === 'single'} className={run.mode === 'single' ? 'active' : ''} onClick={() => updateRun(run.id, { mode: 'single' })}>1 chỉ</button>
            <button aria-pressed={run.mode === 'three'} className={run.mode === 'three' ? 'active' : ''} onClick={() => updateRun(run.id, { mode: 'three' })}>3 chỉ</button>
          </div>
        </div>
        <div className="station-progress" aria-label={`Tiến độ ${progress}%`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="anchorline">
        <span className="anchor-icon" aria-hidden="true"><MapPin /></span>
        <span className="anchor-copy"><span>Điểm đặt mia sau</span><small className="numeric">H = {formatElevation(row?.fromElevation)} m</small></span>
        <b>{row?.fromName || run.startPoint || '—'}</b>
      </div>

      <div className="readings">
        {run.mode === 'single' ? (
          <>
            <div className="reading reading-bs">
              <div className="reading-title"><span>Mia sau<small>Nhập theo mét</small></span><em>BS · m</em></div>
              <MeterInput className="hero-input" staffReading aria-label="Số đọc mia sau BS theo mét" enterKeyHint="next" value={station.bs} onValueChange={(value) => updateStation(run, station.id, 'bs', value)} />
              <small className="reading-example">Định dạng: <b className="numeric">2,000</b></small>
            </div>
            <div className="reading reading-fs">
              <div className="reading-title"><span>Mia trước<small>Nhập theo mét</small></span><em>FS · m</em></div>
              <MeterInput className="hero-input" staffReading aria-label="Số đọc mia trước FS theo mét" enterKeyHint="next" value={station.fs} onValueChange={(value) => updateStation(run, station.id, 'fs', value)} />
              <small className="reading-example">Định dạng: <b className="numeric">1,585</b></small>
            </div>
          </>
        ) : (
          <>
            <Staff title="Mia sau" prefix="bs" station={station} row={row} update={(field, value) => updateStation(run, station.id, field, value)} />
            <Staff title="Mia trước" prefix="fs" station={station} row={row} update={(field, value) => updateStation(run, station.id, field, value)} />
          </>
        )}
      </div>

      {run.mode === 'single' ? (
        <label className="distance-manual distance-input">
          <span>Khoảng cách đoạn <small>Không bắt buộc · m</small></span>
          <MeterInput aria-label="Khoảng cách đoạn theo mét, không bắt buộc" placeholder="Nhập khoảng cách (m)..." value={station.distance} onValueChange={(value) => updateStation(run, station.id, 'distance', value)} />
        </label>
      ) : (
        <div className="distance-manual distance-stats">
          <span>Chênh cự ly <b className="numeric">{formatMeters(row?.distanceDifference)} m</b></span>
          <span>Cự ly trạm <b className="numeric">{formatMeters(row?.distance)} m</b></span>
        </div>
      )}

      <div className="pointbox">
        <label><span>Điểm tới</span><input aria-label="Điểm tới" autoCapitalize="characters" enterKeyHint="done" placeholder="VD: TP1" value={station.point} onChange={(event) => updateStation(run, station.id, 'point', event.target.value)} /></label>
      </div>
      <div className="live" aria-label="Kết quả tính tức thời" aria-live="polite">
        <div><span>Chênh cao · Δh</span><b className="numeric">{formatSignedMillimeters(row?.delta)} mm</b></div>
        <div><span>Cao độ · H({station.point || '?'})</span><b className="numeric">{formatElevation(row?.elevation)} m</b></div>
        <div><span>{run.mode === 'single' ? <>Cao độ tia ngắm (H<sub>tia</sub>)</> : 'Cự ly trạm'}</span><b className="numeric">{run.mode === 'single' ? `${formatElevation(row?.hi)} m` : `${formatMeters(row?.distance)} m`}</b></div>
      </div>
      <div className="field-actions">
        <button className="step-button" aria-label="Trạm trước" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}><ChevronLeft /></button>
        <button className="primary finish" onClick={finish}><Check />Hoàn tất trạm</button>
        <button className="step-button" aria-label="Trạm tiếp theo" onClick={() => setIndex(Math.min(run.stations.length - 1, index + 1))} disabled={index === run.stations.length - 1}><ChevronRight /></button>
      </div>
    </section>
  );
}

function Staff({ title, prefix, station, row, update }) {
  return (
    <div className={`reading reading-${prefix}`}>
      <div className="reading-title"><span>{title}<small>Ba chỉ · mét</small></span><em>{prefix.toUpperCase()} · m</em></div>
      <div className="threegrid">
        {[['Upper', 'Trên'], ['Middle', 'Giữa'], ['Lower', 'Dưới']].map(([suffix, label]) => (
          <label key={suffix}>{label}<MeterInput staffReading aria-label={`${title} chỉ ${label.toLowerCase()} theo mét`} enterKeyHint="next" value={station[`${prefix}${suffix}`]} onValueChange={(value) => update(`${prefix}${suffix}`, value)} /></label>
        ))}
      </div>
      <div className="staffmeta">
        <span>Cự ly <b className="numeric">{formatMeters(prefix === 'bs' ? row?.db : row?.df)} m</b></span>
        <span>Sai số giữa <b className="numeric">{formatSignedMillimeters(prefix === 'bs' ? row?.bsMiddleError : row?.fsMiddleError)} mm</b></span>
      </div>
    </div>
  );
}

function Route({ run, solved, settingsOpen, setSettingsOpen, updateRun, addStation, edit, remove, duplicate, deleteRun }) {
  return (
    <section className="route-shell">
      <div className="card runsummary">
        <div className="runsummary-top">
          <div className="runsummary-badge" aria-hidden="true"><RouteIcon /></div>
          <div className="runsummary-main"><small>Tuyến đang chọn</small><h2>{run.name}</h2><p><b>{run.startPoint || '—'}</b><span aria-hidden="true">→</span><b>{solved.points.at(-1)?.name || '—'}</b><span>· {run.stations.length} trạm</span></p></div>
          <button className="settings-btn" aria-label="Cài đặt lượt đo" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}><Settings2 /></button>
        </div>
        {settingsOpen && (
          <div className="runsettings open">
            <div className="twofields">
              <label>Tên lượt<input value={run.name} onChange={(event) => updateRun(run.id, { name: event.target.value })} /></label>
              <label>Điểm đầu<input value={run.startPoint} onChange={(event) => updateRun(run.id, { startPoint: uppercaseName(event.target.value) })} /></label>
            </div>
            <div className="runactions"><button onClick={duplicate}><Copy />Nhân bản</button><button className="danger" onClick={deleteRun}><Trash2 />Xóa lượt</button></div>
          </div>
        )}
      </div>
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
      <div className="swipe-actions" aria-hidden={!open && !revealing}>
        <button tabIndex={open ? 0 : -1} aria-label={`Xóa trạm ${index + 1}`} onClick={(event) => { event.stopPropagation(); setOpen(false); remove(index); }}><Trash2 /><span>Xóa</span></button>
      </div>
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
          <b>{row.fromName || '—'} <span aria-hidden="true">→</span> {row.point || '—'}</b>
          <small className="numeric"><span>BS {formatStaffReading(row.bs)} m</span><span>FS {formatStaffReading(row.fs)} m</span><span>Δh {formatSignedMillimeters(row.delta)} mm</span></small>
          <small className="numeric">H tới {formatElevation(row.elevation)} m{row.distance !== null ? ` · D ${formatMeters(row.distance)} m` : ''}</small>
        </span>
        <span className="route-chevron" aria-hidden="true"><ChevronRight /></span>
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
      <NetworkAdjustment network={network} />
      {solvedRuns.map((solved) => (
        <div className="card result-card" key={solved.runId}>
          <div className="card-heading"><span>Lượt đo</span><h3>{solved.runName}</h3></div>
          <div className="metric">
            <div><span>Số trạm</span><b className="numeric">{solved.rows.length}</b></div>
            <div><span>Chiều dài</span><b className="numeric">{solved.totalDistance === null ? '—' : `${formatMeters(solved.totalDistance)} m`}</b></div>
            <div><span>ΣΔD</span><b className="numeric">{formatMeters(solved.sumDistanceDifference)} m</b></div>
          </div>
          {solved.checks.length ? solved.checks.map((check) => (
            <div className="check benchmark-summary" key={`${solved.runId}-${check.index}`}><b>{check.name}</b><span className="numeric">Chuẩn {formatElevation(check.known)} m · Đo {formatElevation(check.measured)} m · Lệch {formatSignedMillimeters(check.difference)} mm</span></div>
          )) : <p className="warning">Lượt này chưa chứa mốc chuẩn.</p>}
        </div>
      ))}
      <div className="card">
        <div className="card-heading"><span>Đối chiếu</span><h3>So sánh DG/DC giữa các lượt</h3></div>
        {comparisons.length ? comparisons.map((group) => (
          <div className="compare" key={group.name}>
            <div className="compareHead"><b>{group.name}</b><span className="numeric">Max - Min: {formatMillimeters(group.spread)} mm</span></div>
            {group.values.map((value) => <div className="compareLine" key={value.runId}><span>{value.runName}</span><b className="numeric">{formatElevation(value.elevation)} m</b></div>)}
          </div>
        )) : <p className="empty">Chưa có DG/DC cùng tên ở ít nhất 2 lượt.</p>}
      </div>
      <div className="card tolerance-card">
        <label>Hệ số C <span>mm/√km</span><input className="numeric" inputMode="decimal" value={coefficient} onChange={(event) => updateBook((previous) => ({ ...previous, settings: { ...previous.settings, toleranceCoefficient: event.target.value } }))} /></label>
        <p className="note">C là tham số kiểm tra sai số khép; bình sai lưới dùng toàn bộ trị đo liên kết.</p>
      </div>
    </section>
  );
}

function NetworkAdjustment({ network }) {
  return (
    <div className="card network-adjustment">
      <h3>Bình sai lưới độ cao</h3>
      {!network.available ? (
        <div className="warning warning-card" role="status"><span className="warning-icon" aria-hidden="true"><TriangleAlert /></span><span>{network.reason}</span></div>
      ) : (
        <>
          <p className="note">{network.method}. Mốc chuẩn được giữ cố định; DC, TP và các điểm chưa biết đều được bình sai.</p>
          <div className="metric"><div><span>Trị đo</span><b className="numeric">{network.observations}</b></div><div><span>Điểm cần tìm</span><b className="numeric">{network.unknowns}</b></div><div><span>Bậc tự do</span><b className="numeric">{network.degreesOfFreedom}</b></div></div>
          {network.degreesOfFreedom === 0 && <p className="warning">{OPEN_ROUTE_WARNING}</p>}
          {network.degreesOfFreedom > 0 && <div className="check"><b>Độ chính xác sau bình sai</b><span className="numeric">σ₀ = {formatMillimeters(network.sigma0)} {network.totalDistance === null ? 'mm' : 'mm/√km'} · |v|max = {formatMillimeters(network.maxCorrection)} mm</span></div>}
          <div className="network-table">
            <div className="network-point-row heading"><b>Điểm</b><b>Vai trò</b><b>H bình sai</b></div>
            {network.points.map((point) => <div className="network-point-row" key={point.name}><b>{point.name}</b><span>{point.fixed ? 'Mốc cố định' : 'Điểm bình sai'}</span><b className="numeric">{formatElevation(point.elevation)} m</b></div>)}
          </div>
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

function Files({ book, books, updateBook, setBook, setBooks, newBook, save, saveAs, rename, exportExcel, exportPdf, exporting, fileRef, importExcel }) {
  const persist = (next) => { setBooks(next); localStorage.setItem(STORAGE_KEYS.books, JSON.stringify(next)); };
  const fileActions = [
    { label: 'Sổ mới', hint: 'Tạo bản đo trống', Icon: FilePlus2, onClick: newBook },
    { label: 'Lưu sổ', hint: 'Lưu vào thiết bị', Icon: Save, onClick: save, primary: true },
    { label: 'Lưu bản sao', hint: 'Tạo phiên bản mới', Icon: BookOpen, onClick: saveAs },
    { label: 'Đổi tên', hint: 'Sửa tên sổ hiện tại', Icon: PencilLine, onClick: rename },
    { label: 'Xuất Excel', hint: exporting === 'xlsx' ? 'Đang tạo tệp...' : 'Bảng số liệu .xlsx', Icon: Download, onClick: exportExcel, disabled: Boolean(exporting) },
    { label: 'Xuất PDF', hint: exporting === 'pdf' ? 'Đang tạo tệp...' : 'Báo cáo kỹ thuật .pdf', Icon: FileText, onClick: exportPdf, disabled: Boolean(exporting) },
    { label: 'Nhập Excel', hint: 'Khôi phục từ .xlsx', Icon: Upload, onClick: () => fileRef.current.click() },
  ];
  return (
    <section className="files-shell">
      <SectionHeading Icon={FolderOpen} eyebrow="Dữ liệu hiện trường" title="Sổ & tệp" description="Lưu phiên làm việc, quản lý mốc và trao đổi báo cáo Excel/PDF." />
      <div className="card current-book">
        <div className="card-heading"><span>Sổ hiện tại</span><h3>{book.name}</h3></div>
        <div className="file-actions">
          {fileActions.map(({ label, hint, Icon, onClick, primary, disabled }) => <button key={label} className={primary ? 'action-tile primary-tile' : 'action-tile'} onClick={onClick} disabled={disabled} aria-busy={disabled && exporting ? 'true' : undefined}><span className="action-icon" aria-hidden="true"><Icon /></span><span><b>{label}</b><small>{hint}</small></span></button>)}
        </div>
        <input ref={fileRef} hidden type="file" accept=".xlsx,.xls" onChange={(event) => { const file = event.target.files?.[0]; if (file) importExcel(file); event.target.value = ''; }} />
      </div>
      <div className="card">
        <div className="card-title"><div className="card-heading"><span>Cao độ gốc</span><h3>Mốc chuẩn</h3></div><button className="compact-button" onClick={() => updateBook((previous) => ({ ...previous, benchmarks: [...previous.benchmarks, createBenchmark()] }))}><Plus />Thêm mốc</button></div>
        <div className="bench-labels" aria-hidden="true"><span>Tên mốc</span><span>Cao độ H (m)</span></div>
        {book.benchmarks.map((benchmark) => (
          <div className="benchrow" key={benchmark.id}>
            <input aria-label="Tên mốc" value={benchmark.name} onChange={(event) => updateBook((previous) => ({ ...previous, benchmarks: previous.benchmarks.map((item) => item.id === benchmark.id ? { ...item, name: uppercaseName(event.target.value) } : item) }))} />
            <label><MeterInput aria-label={`Cao độ mốc ${benchmark.name || ''} theo mét`} value={benchmark.elevation} onValueChange={(value) => updateBook((previous) => ({ ...previous, benchmarks: previous.benchmarks.map((item) => item.id === benchmark.id ? { ...item, elevation: value } : item) }))} /><span>m</span></label>
            <button className="danger icon-danger" aria-label={`Xóa mốc ${benchmark.name}`} onClick={() => updateBook((previous) => ({ ...previous, benchmarks: previous.benchmarks.filter((item) => item.id !== benchmark.id) }))}><Trash2 /></button>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-heading"><span>Thư viện cục bộ</span><h3>Sổ đã lưu</h3></div>
        {books.length ? books.map((saved) => (
          <div className="saved" key={saved.id}>
            <span className="saved-icon" aria-hidden="true"><BookOpen /></span>
            <div><b>{saved.name}</b><small>{new Date(saved.updatedAt).toLocaleString('vi-VN')}</small><small className="numeric">{saved.runs.length} lượt · {saved.runs.reduce((sum, run) => sum + run.stations.length, 0)} trạm</small></div>
            <div className="saved-actions"><button onClick={() => setBook(structuredClone(saved))}>Mở</button><button className="danger icon-danger" aria-label={`Xóa ${saved.name}`} onClick={() => { if (confirm('Xóa sổ đã lưu này?')) persist(books.filter((item) => item.id !== saved.id)); }}><Trash2 /></button></div>
          </div>
        )) : <p className="empty">Chưa có sổ đã lưu.</p>}
      </div>
    </section>
  );
}
