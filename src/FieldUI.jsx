import { useEffect, useId, useRef } from 'react';
import { X, Activity, ShieldCheck, TriangleAlert } from 'lucide-react';
import { formatElevation } from './units';

export function ConfirmDialog({ title, description, messages = [], confirmLabel = 'Xác nhận', onConfirm, onClose }) {
  const ref = useRef(null);
  const headingId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('button')?.focus();
    return () => { document.body.style.overflow = oldOverflow; previous?.focus?.(); };
  }, []);
  function handleKeys(event) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const focusable = [...ref.current.querySelectorAll('button:not(:disabled), input, select, a[href]')];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={ref} className="modal-panel" role="dialog" aria-modal="true" aria-labelledby={headingId} onKeyDown={handleKeys}>
      <div className="card-title"><h2 id={headingId}>{title}</h2><button onClick={onClose} aria-label="Đóng hộp thoại"><X /></button></div>
      <p>{description}</p>
      {messages.length > 0 && <ul>{messages.map((message, index) => <li key={index}>{message}</li>)}</ul>}
      <div className="quality-actions"><button onClick={onClose}>Quay lại</button><button className="primary" onClick={onConfirm}>{confirmLabel}</button></div>
    </section>
  </div>;
}

export function QualityCard({ errors = [], warnings = [] }) {
  const level = errors.length ? 'error' : warnings.length ? 'warning' : 'pending';
  const issues = errors.length ? errors : warnings;
  if (!issues.length) return null;
  return <div className="quality-card" data-level={level} role={level === 'error' ? 'alert' : 'status'}>
    <div className="card-title">{level === 'error' ? <TriangleAlert aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}<h3>{level === 'error' ? 'Chưa thể lưu trạm' : 'Cần xác nhận trước khi lưu'}</h3></div>
    <ul>{issues.map((item, index) => <li key={`${item.field || 'issue'}-${index}`}>{item.message}</li>)}</ul>
  </div>;
}

export function SurveyIllustration() {
  return <svg className="setup-illustration" viewBox="0 0 360 110" fill="none" role="img" aria-label="Máy thủy bình ngắm từ mốc gốc tới điểm chuyền">
    <path d="M10 95h340M10 70h340M10 45h340M10 20h340M45 5v95M100 5v95M155 5v95M210 5v95M265 5v95M320 5v95" stroke="currentColor" opacity=".07" />
    <path d="M30 92h100l48-7h142" stroke="currentColor" opacity=".25" />
    <path d="M53 28v64M310 28v57" stroke="#0e7490" strokeWidth="4" />
    <path d="M47 36h12m-12 10h12m-12 10h12m-12 10h12m-12 10h12m245-40h12m-12 10h12m-12 10h12m-12 10h12" stroke="#0e7490" strokeWidth="2" />
    <path d="M56 43h104m45 0h102" stroke="#087a68" strokeDasharray="5 5" />
    <path d="m184 60-21 32m21-32 21 32m-21-32v32" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
    <rect x="162" y="34" width="44" height="16" rx="6" fill="#087a68" />
    <circle cx="184" cy="55" r="6" fill="#334155" />
    <circle cx="196" cy="42" r="3" fill="#a6e4d2" />
    <text x="37" y="18" fontSize="10" fill="#334155">MIA SAU</text><text x="270" y="18" fontSize="10" fill="#334155">MIA TRƯỚC</text>
  </svg>;
}

export function ElevationProfile({ solved }) {
  const start = solved.points?.[0];
  const rows = [
    { name: start?.name, elevation: start?.elevation },
    ...(solved.chainRows || []).map((row) => ({ name: row.point, elevation: row.elevation })),
  ];
  const known = rows.filter((row) => typeof row.elevation === 'number' && Number.isFinite(row.elevation));
  if (known.length < 2) return <div className="profile-card empty-profile"><Activity /><div><b>Mặt cắt cao độ</b><p>Sẽ xuất hiện khi có ít nhất một điểm chuyền với cao độ tính được.</p></div></div>;
  const values = known.map((row) => row.elevation);
  const min = Math.min(...values), max = Math.max(...values), span = Math.max(100, max - min);
  const y = (value) => 104 - (value - min) / span * 72;
  const x = (index) => 24 + index / Math.max(1, rows.length - 1) * 552;
  const segments = [];
  rows.forEach((row, index) => {
    if (typeof row.elevation !== 'number' || !Number.isFinite(row.elevation)) { segments.push([]); return; }
    if (!segments.length) segments.push([]);
    segments.at(-1).push(`${x(index)},${y(row.elevation)}`);
  });
  return <div className="profile-card">
    <div className="card-title"><div className="card-heading"><span>Đọc nhanh tuyến đo</span><h3>Mặt cắt cao độ</h3></div><span className="session-pill numeric">{known.length} điểm</span></div>
    <svg viewBox="0 0 600 140" role="img" aria-label={`Cao độ sơ bộ từ ${formatElevation(min)} đến ${formatElevation(max)} mét. Trục ngang theo thứ tự điểm, không theo khoảng cách.`}>
      {[32, 68, 104].map((line) => <line key={line} x1="24" x2="576" y1={line} y2={line} stroke="currentColor" opacity=".12" strokeDasharray="3 5" />)}
      {segments.filter((segment) => segment.length > 1).map((segment, index) => <polyline key={index} points={segment.join(' ')} fill="none" stroke="#087a68" strokeWidth="2.5" strokeLinejoin="round" />)}
      {rows.map((row, index) => typeof row.elevation === 'number' && Number.isFinite(row.elevation) && <g key={index}><circle cx={x(index)} cy={y(row.elevation)} r="4" fill="#fff" stroke="#087a68" strokeWidth="2" /><title>{`${row.name}: ${formatElevation(row.elevation)} m`}</title>{(index === 0 || index === rows.length - 1 || rows.length <= 7) && <text x={x(index)} y="129" textAnchor={index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle'} fill="#334155" fontSize="11">{row.name?.length > 16 ? row.name.slice(0, 14) + '…' : row.name}</text>}</g>)}
    </svg>
    <div className="profile-caption"><span>Cao độ sơ bộ · thứ tự điểm</span><b className="numeric">{formatElevation(min)} — {formatElevation(max)} m</b></div>
  </div>;
}
