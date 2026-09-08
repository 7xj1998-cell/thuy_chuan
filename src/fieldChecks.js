import { uppercaseName } from './calc';
import { stationOrigin } from './pointNames';
import { formatMeters, metersToMillimeters, normalizeMeterInput, normalizeStaffInput } from './units';

// These are editable data-entry reminders, not surveying acceptance standards.
// Staff/delta limits are meters; the middle-reading limit is millimeters.
export const FIELD_DEFAULTS = Object.freeze({
  staffLimit: '5',
  deltaLimit: '3',
  middleErrorLimit: '2',
});

const SINGLE_FIELDS = ['bs', 'fs'];
const THREE_FIELDS = ['bsUpper', 'bsMiddle', 'bsLower', 'fsUpper', 'fsMiddle', 'fsLower'];
const LABELS = {
  bs: 'Mia sau', fs: 'Mia trước',
  bsUpper: 'Mia sau · Chỉ trên', bsMiddle: 'Mia sau · Chỉ giữa', bsLower: 'Mia sau · Chỉ dưới',
  fsUpper: 'Mia trước · Chỉ trên', fsMiddle: 'Mia trước · Chỉ giữa', fsLower: 'Mia trước · Chỉ dưới',
};
const pointName = (value) => uppercaseName(value).trim();
const isBlank = (value) => value === null || value === undefined || String(value).trim() === '';

// Reject malformed imports/pastes, including exponents and hexadecimal values,
// before calling the existing normalizers, which intentionally accept Number().
function decimalOf(value) {
  if (isBlank(value)) return null;
  const raw = String(value).trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(raw)) return null;
  const number = Number(raw.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function limitOf(settings, field) {
  const configured = decimalOf(settings?.[field]);
  // Zero deliberately disables a reminder. Invalid settings use the default.
  return configured !== null && configured >= 0 ? configured : Number(FIELD_DEFAULTS[field]);
}

export function normalizeStationDraft(station = {}, mode = 'single') {
  const normalized = { ...station };
  const fields = mode === 'three' ? THREE_FIELDS : SINGLE_FIELDS;
  fields.forEach((field) => {
    const value = station[field];
    normalized[field] = isBlank(value) ? '' : decimalOf(value) === null ? value : normalizeStaffInput(value);
  });
  if (mode !== 'three') {
    const distance = station.distance;
    normalized.distance = isBlank(distance) ? '' : decimalOf(distance) === null ? distance : normalizeMeterInput(distance);
  }
  return normalized;
}

export function inspectStation(book, run, index, targetName = '') {
  const errors = [];
  const warnings = [];
  const issue = (list, field, code, message) => list.push({ field, code, message });
  const station = run?.stations?.[index];
  if (!station) {
    issue(errors, 'station', 'missing', 'Không tìm thấy trạm đang nhập.');
    return { errors, warnings, ready: false };
  }

  const three = run.mode === 'three';
  const fields = three ? THREE_FIELDS : SINGLE_FIELDS;
  const normalized = normalizeStationDraft(station, run.mode);
  const values = {};
  const staffLimit = limitOf(book?.settings, 'staffLimit');
  fields.forEach((field) => {
    if (isBlank(station[field])) {
      issue(errors, field, 'missing', `Chưa nhập ${LABELS[field].toLocaleLowerCase('vi-VN')}.`);
      return;
    }
    const raw = decimalOf(station[field]);
    if (raw === null) {
      issue(errors, field, 'invalid', `${LABELS[field]} phải là một số hợp lệ.`);
      return;
    }
    if (raw < 0) {
      issue(errors, field, 'negative', `${LABELS[field]} không được âm.`);
      return;
    }
    const meters = decimalOf(normalized[field]);
    values[field] = meters;
    if (staffLimit > 0 && meters > staffLimit) {
      issue(warnings, field, 'limit', `${LABELS[field]} ${formatMeters(meters)} m vượt ngưỡng nhắc ${formatMeters(staffLimit)} m. Kiểm tra số đọc.`);
    }
  });

  // A manually entered distance is optional in single-staff mode. Three-staff
  // distances are derived by the solver; a hidden single-mode draft is ignored.
  if (!three && !isBlank(station.distance)) {
    const distance = decimalOf(station.distance);
    if (distance === null) issue(errors, 'distance', 'invalid', 'Khoảng cách phải là một số hợp lệ.');
    else if (distance <= 0) issue(errors, 'distance', 'nonpositive', 'Khoảng cách đã nhập phải lớn hơn 0 m; có thể để trống nếu chưa đo.');
  }

  const origin = stationOrigin(run, index);
  const target = pointName(station.point) || pointName(targetName);
  if (!origin) issue(errors, 'startPoint', 'missing', 'Chưa có điểm đặt mia sau. Hãy chọn điểm đầu lượt đo.');
  if (!target) issue(errors, 'point', 'missing', 'Chưa có tên điểm tới.');

  const benchmarks = new Map();
  const conflicts = new Set();
  (book?.benchmarks || []).forEach((benchmark) => {
    const name = pointName(benchmark.name);
    if (!name || decimalOf(benchmark.elevation) === null) return;
    const elevation = metersToMillimeters(benchmark.elevation);
    if (benchmarks.has(name) && benchmarks.get(name) !== elevation && !conflicts.has(name)) {
      issue(errors, 'benchmarks', 'benchmark_conflict', `Mốc ${name} có nhiều cao độ khác nhau trong sổ. Kiểm tra lại Mốc chuẩn trước khi lưu.`);
      conflicts.add(name);
    }
    benchmarks.set(name, elevation);
  });

  if (origin && target === origin) {
    issue(warnings, 'point', 'same_point', `Điểm tới ${target} trùng điểm đặt mia sau. Kiểm tra tên điểm.`);
  }
  const duplicate = target && (pointName(run.startPoint) === target || run.stations.some((item, itemIndex) => itemIndex !== index && pointName(item.point) === target));
  if (duplicate && !benchmarks.has(target) && target !== origin) {
    issue(warnings, 'point', 'duplicate', `Điểm ${target} đã có trong lượt đo này. Xác nhận đây là cùng một điểm thực địa.`);
  }

  const bsField = three ? 'bsMiddle' : 'bs';
  const fsField = three ? 'fsMiddle' : 'fs';
  const deltaLimit = limitOf(book?.settings, 'deltaLimit');
  if (values[bsField] !== undefined && values[fsField] !== undefined && deltaLimit > 0) {
    const delta = Math.abs(values[bsField] - values[fsField]);
    if (delta > deltaLimit) {
      issue(warnings, fsField, 'delta_limit', `Chênh cao ${formatMeters(delta)} m vượt ngưỡng nhắc ${formatMeters(deltaLimit)} m. Kiểm tra mia sau và mia trước.`);
    }
  }

  if (three) {
    const middleLimit = limitOf(book?.settings, 'middleErrorLimit');
    ['bs', 'fs'].forEach((prefix) => {
      const upper = values[`${prefix}Upper`];
      const middle = values[`${prefix}Middle`];
      const lower = values[`${prefix}Lower`];
      if ([upper, middle, lower].some((value) => value === undefined)) return;
      if (upper < middle || middle < lower) {
        issue(warnings, `${prefix}Upper`, 'order', `${LABELS[prefix]}: thứ tự chỉ trên ≥ chỉ giữa ≥ chỉ dưới chưa khớp. Kiểm tra lại vị trí nhập.`);
      }
      const middleErrorMm = Math.abs(metersToMillimeters(middle) - (metersToMillimeters(upper) + metersToMillimeters(lower)) / 2);
      if (middleLimit > 0 && middleErrorMm > middleLimit) {
        issue(warnings, `${prefix}Middle`, 'middle', `${LABELS[prefix]}: chỉ giữa lệch ${String(middleErrorMm).replace('.', ',')} mm so với trung bình hai chỉ, vượt ngưỡng nhắc ${String(middleLimit).replace('.', ',')} mm.`);
      }
    });
  }

  return { errors, warnings, ready: errors.length === 0 };
}
