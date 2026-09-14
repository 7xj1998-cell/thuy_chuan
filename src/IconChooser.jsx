import { AppIcon, ICON_SETS, useIconTheme } from './icons';

const SAMPLES = [
  ['Crosshair', 'Đo'], ['Route', 'Tuyến'], ['BarChart2', 'Kết quả'], ['FolderOpen', 'Sổ & tệp'],
  ['Undo2', 'Hoàn tác'], ['Redo2', 'Làm lại'], ['Save', 'Lưu'], ['PencilLine', 'Sửa'],
  ['Settings2', 'Cài đặt'], ['Trash2', 'Xóa'],
];
const REMAINING = [
  ['BookOpen', 'Sổ đo'], ['Check', 'Xác nhận'], ['ChevronLeft', 'Trước'], ['ChevronRight', 'Sau'],
  ['CloudCheck', 'Đã lưu'], ['Copy', 'Sao chép'], ['Download', 'Tải xuống'], ['FilePlus2', 'Sổ mới'],
  ['FileText', 'Báo cáo'], ['Plus', 'Thêm'], ['ShieldCheck', 'Đạt yêu cầu'], ['ArchiveRestore', 'Khôi phục'],
  ['Search', 'Tìm kiếm'], ['ArrowRight', 'Tiếp tục'], ['TriangleAlert', 'Cảnh báo'], ['Upload', 'Nhập tệp'],
  ['X', 'Đóng'], ['Activity', 'Mặt cắt'], ['ShieldAlert', 'Kiểm tra'],
];

export function IconChooser() {
  const { family, chooseFamily, saved } = useIconTheme();
  return <div className="icon-chooser">
    <p className="icon-intro">So sánh cùng một nhóm chức năng. Chọn một bộ để áp dụng cho toàn bộ icon trong ứng dụng, kể cả Hoàn tác và Làm lại.</p>
    <div className="icon-options">
      {ICON_SETS.map((set, index) => <section className={`icon-option ${family === set.id ? 'is-selected' : ''}`} key={set.id} aria-labelledby={`icon-title-${set.id}`}>
        <div className="icon-option-heading">
          <span className="icon-option-number">0{index + 1}</span>
          <div><h3 id={`icon-title-${set.id}`}>{set.name}</h3><small>{set.source}</small><p>{set.description}</p></div>
        </div>
        <div className="icon-samples">{SAMPLES.map(([name, label]) => <div key={name} className={name === 'Redo2' ? 'redo-sample' : ''}><AppIcon name={name} family={set.id} size={26} /><span>{label}</span></div>)}</div>
        <div className="icon-option-bottom">
          <div className="icon-action-preview" aria-label={`Mẫu nút của bộ ${index + 1}`}><span><AppIcon name="Undo2" family={set.id} />Hoàn tác</span><span><AppIcon name="Redo2" family={set.id} />Làm lại</span></div>
          <button type="button" className="choose-icons" aria-pressed={family === set.id} onClick={() => chooseFamily(set.id)}>{family === set.id ? <><AppIcon name="Check" family={set.id} />Đang dùng thử bộ {index + 1}</> : `Dùng thử bộ ${index + 1}`}</button>
        </div>
        <details className="all-icons"><summary>Xem đủ 29 icon của bộ {index + 1}</summary><div className="icon-samples">{REMAINING.map(([name, label]) => <div key={name}><AppIcon name={name} family={set.id} /><span>{label}</span></div>)}</div></details>
      </section>)}
    </div>
    <p className="icon-choice-status" role="status">{saved ? `Đang dùng thử: ${ICON_SETS.find((set) => set.id === family).name}. Lựa chọn được lưu trên thiết bị và có thể đổi bất cứ lúc nào.` : 'Đã đổi icon trong phiên này. Không lưu được lựa chọn trên thiết bị; hãy kiểm tra quyền lưu dữ liệu của trình duyệt.'}</p>
  </div>;
}

export function IconReviewPage() {
  return <main className="icon-review">
    <header className="icon-review-header"><div><span className="icon-review-eyebrow">SỔ THỦY CHUẨN · BẢNG CHỌN ICON</span><h1>5 bộ icon mới</h1><p>Chọn nét bạn thích, xem ngay trong ứng dụng.</p></div><a href="./">Mở ứng dụng <AppIcon name="ArrowRight" /></a></header>
    <IconChooser />
  </main>;
}
