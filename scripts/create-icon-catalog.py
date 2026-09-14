"""Generate explicit, tree-shakeable imports for the five icon alternatives."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
# Existing UI semantics, with one consistent equivalent in each family.
rows = '''
BarChart2 TbChartBar PiChartBar HiChartBar RiBarChartBoxLine
BookOpen TbBook PiBookOpen HiBookOpen RiBookOpenLine
Check TbCheck PiCheck HiCheck RiCheckLine
ChevronLeft TbChevronLeft PiCaretLeft HiChevronLeft RiArrowLeftSLine
ChevronRight TbChevronRight PiCaretRight HiChevronRight RiArrowRightSLine
CloudCheck TbCloudCheck PiCloudCheck HiCheckBadge RiCheckboxCircleLine
Copy TbCopy PiCopy HiDocumentDuplicate RiFileCopyLine
Crosshair TbFocus2 PiCrosshair HiViewfinderCircle RiFocus3Line
Download TbDownload PiDownloadSimple HiArrowDownTray RiDownload2Line
FilePlus2 TbFilePlus PiFilePlus HiDocumentPlus RiFileAddLine
FileText TbFileDescription PiFileText HiDocumentText RiFileTextLine
FolderOpen TbFolderOpen PiFolderOpen HiFolderOpen RiFolderOpenLine
PencilLine TbEdit PiPencilSimpleLine HiPencilSquare RiEditLine
Plus TbPlus PiPlus HiPlus RiAddLine
Route TbRoute PiPath HiMap RiRouteLine
Save TbDeviceFloppy PiFloppyDisk HiArchiveBoxArrowDown RiSave3Line
Settings2 TbAdjustmentsHorizontal PiSlidersHorizontal HiAdjustmentsHorizontal RiEqualizerLine
ShieldCheck TbShieldCheck PiShieldCheck HiShieldCheck RiShieldCheckLine
ArchiveRestore TbRestore PiClockCounterClockwise HiArrowPath RiHistoryLine
Search TbSearch PiMagnifyingGlass HiMagnifyingGlass RiSearchLine
ArrowRight TbArrowRight PiArrowRight HiArrowRight RiArrowRightLine
Trash2 TbTrash PiTrash HiTrash RiDeleteBin6Line
TriangleAlert TbAlertTriangle PiWarning HiExclamationTriangle RiErrorWarningLine
Undo2 TbArrowBackUp PiArrowUUpLeft HiArrowUturnLeft RiArrowGoBackLine
Redo2 TbArrowForwardUp PiArrowUUpRight HiArrowUturnRight RiArrowGoForwardLine
Upload TbUpload PiUploadSimple HiArrowUpTray RiUpload2Line
X TbX PiX HiXMark RiCloseLine
Activity TbChartLine PiChartLine HiPresentationChartLine RiLineChartLine
ShieldAlert TbShieldExclamation PiShieldWarning HiExclamationCircle RiShieldFlashLine
'''
entries = [line.split() for line in rows.strip().splitlines()]
families = [('technical', 'tb', 1, ''), ('rounded', 'pi', 2, ''), ('duotone', 'pi', 2, 'Duotone'), ('solid', 'hi2', 3, ''), ('compact', 'ri', 4, '')]
imports = []
maps = []
for family, module, column, suffix in families:
    names = [row[column] + suffix for row in entries]
    imports.append(f"import {{ {', '.join(names)} }} from 'react-icons/{module}';")
    maps.append(f"  {family}: {{ " + ', '.join(f'{row[0]}: {name}' for row, name in zip(entries, names)) + ' },')
output = '\n'.join(imports) + '\n\nexport const ICON_MAPS = {\n' + '\n'.join(maps) + '\n};\n'
(root / 'src/iconCatalog.js').write_text(output, encoding='utf-8')
