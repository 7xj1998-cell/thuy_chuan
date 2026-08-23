import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { BookOpen, Download, FileUp, FolderOpen, Plus, Save, Trash2 } from 'lucide-react';
import { calculateRoute, compareRoutes, format, listRoutePoints, station, uid, uppercaseName } from './calc';
import './styles.css';
import './mobile-fixes.css';

const STORAGE_KEY = 'so-thuy-chuan.books.v1';
const makeBook = () => ({
  id: uid(), name: `Sổ ${new Date().toLocaleDateString('vi-VN')}`,
  startName: 'DG5', startElevation: '2548', endName: 'DC11',
  outward: [station('DC11')], returning: [station('DG5')], updatedAt: Date.now()
});
const normalizeBookNames = (book) => ({
  ...book,
  startName: uppercaseName(book.startName),
  endName: uppercaseName(book.endName),
  outward: (book.outward || []).map((row) => ({ ...row, point: uppercaseName(row.point) })),
  returning: (book.returning || []).map((row) => ({ ...row, point: uppercaseName(row.point) }))
});
const loadBooks = () => { try { return (JSON.parse(localStorage.getItem(STORAGE_KEY)) || []).map(normalizeBookNames); } catch { return []; } };
const saveBooks = (books) => localStorage.setItem(STORAGE_KEY, JSON.stringify(books));

function App() {
  const [book, setBook] = useState(makeBook);
  const [books, setBooks] = useState(loadBooks);
  const [tab, setTab] = useState('outward');
  const [message, setMessage] = useState('');
  const importRef = useRef(null);

  const outward = useMemo(() => calculateRoute(book.startName, book.startElevation, book.outward), [book]);
  const endElevation = outward.at(-1)?.elevation ?? null;
  const returning = useMemo(() => calculateRoute(book.endName, endElevation, book.returning), [book.endName, book.returning, endElevation]);
  const closure = returning.at(-1)?.elevation === null ? null : returning.at(-1).elevation - Number(book.startElevation);
  const comparisons = useMemo(() => compareRoutes(outward, returning), [outward, returning]);

  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 2500); return () => clearTimeout(timer); }, [message]);
  const patch = (value) => setBook((old) => ({ ...old, ...value }));
  const patchRow = (direction, id, field, value) => setBook((old) => ({
    ...old, [direction]: old[direction].map((row) => row.id === id ? { ...row, [field]: value } : row)
  }));
  const addRows = (direction, count = 1) => setBook((old) => {
    const current = old[direction];
    const prefix = direction === 'outward' ? 'TP' : 'TV';
    const additions = Array.from({ length: count }, (_, i) => station(`${prefix}${current.length + i + 1}`));
    return { ...old, [direction]: [...current, ...additions] };
  });
  const removeRow = (direction, id) => setBook((old) => ({ ...old, [direction]: old[direction].filter((r) => r.id !== id) }));

  function saveCurrent() {
    const saved = { ...book, updatedAt: Date.now() };
    const next = [saved, ...books.filter((item) => item.id !== saved.id)];
    setBook(saved); setBooks(next); saveBooks(next); setMessage('Đã lưu sổ trên thiết bị');
  }
  function newBook() { if (!confirm('Tạo sổ mới? Số liệu chưa lưu sẽ bị bỏ.')) return; setBook(makeBook()); setTab('outward'); }
  function openBook(id) { const found = books.find((item) => item.id === id); if (found) setBook(normalizeBookNames(structuredClone(found))); }

  async function exportExcel() {
    const XLSX = await import('xlsx');
    const info = [{ 'Tên sổ': book.name, 'Mốc đầu': book.startName, 'Cao độ đầu (mm)': book.startElevation, 'Mốc cuối': book.endName, 'Cao độ cuối (mm)': endElevation, 'Sai số khép (mm)': closure }];
    const rows = (route) => route.map((r, i) => ({ Trạm: i + 1, 'Điểm sau': r.point, 'H điểm BS': r.fromElevation, BS: r.bs, HI: r.hi, FS: r.fs, 'Δh': r.delta, 'H điểm FS': r.elevation }));
    const pointRows = [
      ...listRoutePoints('Lượt đi', book.startName, book.startElevation, outward),
      ...listRoutePoints('Lượt về', book.endName, endElevation, returning)
    ].map((point) => ({
      'Lượt đo': point.direction,
      'Thứ tự': point.order,
      'Loại điểm': point.type,
      'Tên điểm': point.name,
      'Cao độ (mm)': point.elevation
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(info), 'Thông tin');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pointRows), 'Tất cả điểm');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows(outward)), 'Lượt đi');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows(returning)), 'Lượt về');
    workbook.Props = { Comments: JSON.stringify(book) };
    const filename = `${book.name.replace(/[^a-zA-Z0-9À-ỹ_-]+/g, '_')}.xlsx`;
    if (!Capacitor.isNativePlatform()) { XLSX.writeFile(workbook, filename); return; }
    const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    const result = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    await Share.share({ title: book.name, text: 'Sổ thủy chuẩn', url: result.uri, dialogTitle: 'Lưu hoặc chia sẻ Excel' });
  }

  async function importExcel(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      if (workbook.Props?.Comments) {
        const restored = JSON.parse(workbook.Props.Comments); restored.id = uid(); restored.name += ' (nhập)'; setBook(normalizeBookNames(restored));
      } else {
        const info = XLSX.utils.sheet_to_json(workbook.Sheets['Thông tin'])[0];
        const readRows = (name) => XLSX.utils.sheet_to_json(workbook.Sheets[name] || {}).map((r) => ({ id: uid(), point: String(r['Điểm sau'] || ''), bs: String(r.BS ?? ''), fs: String(r.FS ?? '') }));
        setBook(normalizeBookNames({ ...makeBook(), name: info?.['Tên sổ'] || file.name, startName: info?.['Mốc đầu'] || '', startElevation: String(info?.['Cao độ đầu (mm)'] ?? ''), endName: info?.['Mốc cuối'] || '', outward: readRows('Lượt đi'), returning: readRows('Lượt về') }));
      }
      setMessage('Đã nhập dữ liệu Excel');
    } catch { alert('File Excel không đúng định dạng sổ thủy chuẩn.'); }
    event.target.value = '';
  }

  const activeRows = tab === 'outward' ? outward : returning;
  const direction = tab === 'outward' ? 'outward' : 'returning';
  return <div className="app">
    <header><div><span className="eyebrow">ĐO CAO HÌNH HỌC · mm</span><h1>Sổ thủy chuẩn</h1></div><BookOpen size={28}/></header>
    <main>
      <section className="card book-info">
        <label className="wide">Tên sổ<input value={book.name} onChange={(e) => patch({ name: e.target.value })}/></label>
        <label>Mốc đầu<input autoCapitalize="characters" value={book.startName} onChange={(e) => patch({ startName: uppercaseName(e.target.value) })}/></label>
        <label>Cao độ đầu (mm)<input inputMode="decimal" value={book.startElevation} onChange={(e) => patch({ startElevation: e.target.value })}/></label>
        <label>Mốc cuối<input autoCapitalize="characters" value={book.endName} onChange={(e) => patch({ endName: uppercaseName(e.target.value) })}/></label>
      </section>
      <div className="actions">
        <button onClick={newBook}><Plus/>Mới</button><button className="primary" onClick={saveCurrent}><Save/>Lưu</button>
        <select aria-label="Mở sổ" value="" onChange={(e) => openBook(e.target.value)}><option value="">Mở sổ…</option>{books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <button onClick={exportExcel}><Download/>Excel</button><button onClick={() => importRef.current.click()}><FileUp/>Nhập</button>
        <input ref={importRef} hidden type="file" accept=".xlsx,.xls" onChange={importExcel}/>
      </div>
      <nav className="tabs"><button className={tab === 'outward' ? 'active' : ''} onClick={() => setTab('outward')}>Lượt đi<br/><small>{book.startName} → {book.endName}</small></button><button className={tab === 'returning' ? 'active' : ''} onClick={() => setTab('returning')}>Lượt về<br/><small>{book.endName} → {book.startName}</small></button><button className={tab === 'result' ? 'active' : ''} onClick={() => setTab('result')}>Kết quả</button></nav>
      {tab !== 'result' ? <>
        <section className="route-summary"><span>Cao độ đầu <b>{format(tab === 'outward' ? Number(book.startElevation) : endElevation)}</b></span><span>Số trạm <b>{activeRows.length}</b></span><span>Cao độ cuối <b>{format(activeRows.at(-1)?.elevation ?? null)}</b></span></section>
        <section className="stations">{activeRows.map((row, index) => <article className="station" key={row.id}>
          <div className="station-head"><b>Trạm {index + 1}</b><span>{row.fromName || '—'} → {row.point || '—'}</span><button className="icon danger" aria-label="Xóa trạm" onClick={() => removeRow(direction, row.id)}><Trash2/></button></div>
          <div className="station-grid">
            <label>Điểm BS<input value={row.fromName} disabled/></label><label>H điểm BS<input value={format(row.fromElevation)} disabled/></label>
            <label>BS (mm)<input className="measure" inputMode="decimal" value={book[direction][index].bs} onChange={(e) => patchRow(direction, row.id, 'bs', e.target.value)}/></label>
            <label>HI<input value={format(row.hi)} disabled/></label><label>FS (mm)<input className="measure" inputMode="decimal" value={book[direction][index].fs} onChange={(e) => patchRow(direction, row.id, 'fs', e.target.value)}/></label>
            <label>Điểm FS<input autoCapitalize="characters" value={book[direction][index].point} onChange={(e) => patchRow(direction, row.id, 'point', uppercaseName(e.target.value))}/></label>
          </div><div className="calc-line"><span>Δh <b>{format(row.delta)}</b></span><span>H({row.point || '?'}) <b>{format(row.elevation)}</b> mm</span></div>
        </article>)}</section>
        <div className="add-bar"><button className="primary" onClick={() => addRows(direction, 1)}><Plus/>Thêm trạm</button><button onClick={() => { const value = prompt('Số trạm cần thêm (1–200):', '10'); const n = Math.min(200, Math.max(1, Number(value) || 0)); if (value) addRows(direction, n); }}>Thêm nhiều</button></div>
      </> : <Results book={book} endElevation={endElevation} closure={closure} comparisons={comparisons}/>} 
    </main>
    {message && <div className="toast">{message}</div>}
  </div>;
}

function Results({ book, endElevation, closure, comparisons }) {
  return <section className="results">
    <div className="result-hero"><span>Sai số khép</span><strong className={Math.abs(closure || 0) > 10 ? 'bad' : ''}>{format(closure)} mm</strong><small>H({book.startName}) tính lại − H({book.startName}) ban đầu</small></div>
    <div className="result-grid"><div><span>H({book.startName})</span><b>{format(Number(book.startElevation))} mm</b></div><div><span>H({book.endName})</span><b>{format(endElevation)} mm</b></div><div><span>Chênh cao đi</span><b>{format(endElevation === null ? null : endElevation - Number(book.startElevation))} mm</b></div></div>
    <h2>So sánh mốc DG/DC đo hai lần</h2>
    {comparisons.length ? <div className="comparison"><div className="comparison-row heading"><b>Mốc</b><b>Lần 1</b><b>Lần 2</b><b>Lệch</b></div>{comparisons.map((r) => <div className="comparison-row" key={r.name}><b>{r.name}</b><span>{format(r.first)}</span><span>{format(r.second)}</span><b className={Math.abs(r.difference) > 10 ? 'bad' : ''}>{format(r.difference)}</b></div>)}</div> : <p className="empty">Chưa có mốc DG/DC cùng tên ở cả hai lượt. TP và TV được bỏ qua.</p>}
  </section>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
