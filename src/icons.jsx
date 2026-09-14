import { createContext, useContext, useState } from 'react';
import { ICON_MAPS } from './iconCatalog';

export const ICON_STORAGE_KEY = 'so-thuy-chuan.icon-family.v2';
export const ICON_SETS = [
  { id: 'technical', name: 'Nét kỹ thuật', source: 'Tabler', description: 'Nét mảnh, hình học rõ ràng, gọn và chính xác.' },
  { id: 'rounded', name: 'Nét bo tròn', source: 'Phosphor Regular', description: 'Đường nét mềm, nhẹ mắt, hình dáng thân thiện.' },
  { id: 'duotone', name: 'Hai sắc độ', source: 'Phosphor Duotone', description: 'Nét rõ kết hợp mảng nền nhẹ, dễ phân biệt chức năng.' },
  { id: 'solid', name: 'Khối đặc', source: 'Heroicons Solid', description: 'Mảng hình đậm, nổi bật ở kích thước nhỏ.' },
  { id: 'compact', name: 'Nét gọn', source: 'Remix Line', description: 'Hình dáng cô đọng, đường nét dứt khoát.' },
];
const IconTheme = createContext({ family: 'solid', chooseFamily: () => {}, saved: true });
export function IconProvider({ children }) {
  const [family, setFamily] = useState(() => {
    try { const value = localStorage.getItem(ICON_STORAGE_KEY); return ICON_SETS.some((set) => set.id === value) ? value : 'solid'; } catch { return 'solid'; }
  });
  const [saved, setSaved] = useState(true);
  function chooseFamily(value) {
    if (!ICON_SETS.some((set) => set.id === value)) return;
    setFamily(value);
    try { localStorage.setItem(ICON_STORAGE_KEY, value); setSaved(true); } catch { setSaved(false); }
  }
  return <IconTheme.Provider value={{ family, chooseFamily, saved }}>{children}</IconTheme.Provider>;
}
export const useIconTheme = () => useContext(IconTheme);
export function AppIcon({ name, family: override, size = 24, className = '', ...props }) {
  const { family } = useIconTheme();
  const chosen = override || family;
  const Icon = ICON_MAPS[chosen]?.[name] || ICON_MAPS.solid[name];
  return <Icon size={size} aria-hidden="true" focusable="false" {...props} className={`app-icon ${className}`.trim()} data-icon-family={chosen} data-icon-name={name} />;
}
const icon = (name) => function SemanticIcon(props) { return <AppIcon name={name} {...props} />; };
export const BarChart2 = icon('BarChart2'), BookOpen = icon('BookOpen'), Check = icon('Check'),
  ChevronLeft = icon('ChevronLeft'), ChevronRight = icon('ChevronRight'), CloudCheck = icon('CloudCheck'),
  Copy = icon('Copy'), Crosshair = icon('Crosshair'), Download = icon('Download'), FilePlus2 = icon('FilePlus2'),
  FileText = icon('FileText'), FolderOpen = icon('FolderOpen'), PencilLine = icon('PencilLine'), Plus = icon('Plus'),
  Route = icon('Route'), Save = icon('Save'), Settings2 = icon('Settings2'), ShieldCheck = icon('ShieldCheck'),
  ArchiveRestore = icon('ArchiveRestore'), Search = icon('Search'), ArrowRight = icon('ArrowRight'),
  Trash2 = icon('Trash2'), TriangleAlert = icon('TriangleAlert'), Undo2 = icon('Undo2'), Redo2 = icon('Redo2'),
  Upload = icon('Upload'), X = icon('X'), Activity = icon('Activity'), ShieldAlert = icon('ShieldAlert');
