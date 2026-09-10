import { numberOf } from './calc';

export const READING_FIELDS = [
  'bs',
  'fs',
  'bsUpper',
  'bsMiddle',
  'bsLower',
  'fsUpper',
  'fsMiddle',
  'fsLower',
];

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const normalizeZero = (value, threshold) => Math.abs(value) < threshold ? 0 : value;
const roundSymmetric = (value) => Math.sign(value) * Math.round(Math.abs(value));
const UI_METER_FORMATTER = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
  useGrouping: false,
});
const UI_DISTANCE_FORMATTER = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
  useGrouping: false,
});

export function metersToMillimeters(value) {
  const meters = numberOf(value);
  return meters === null ? null : roundSymmetric(meters * 1000);
}

export function millimetersToMeters(value) {
  return isFiniteNumber(value) ? value / 1000 : null;
}

export function migrateMillimeterInput(value) {
  const millimeters = numberOf(value);
  if (millimeters === null) return value === null || value === undefined ? '' : String(value);
  return formatMeters(millimeters / 1000);
}

export function formatMeters(value) {
  if (!isFiniteNumber(value)) return '—';
  return UI_METER_FORMATTER.format(normalizeZero(value, 0.0005));
}

export function formatDistanceMeters(value) {
  if (!isFiniteNumber(value)) return '—';
  return UI_DISTANCE_FORMATTER.format(normalizeZero(value, 0.0005));
}

export function sanitizeMeterInput(value) {
  const raw = String(value ?? '').replace(/\s+/g, '').replace(/\./g, ',');
  if (!raw) return '';

  const negative = raw.startsWith('-');
  const unsigned = raw.replace(/-/g, '').replace(/[^\d,]/g, '');
  const separatorIndex = unsigned.indexOf(',');
  const hasSeparator = separatorIndex >= 0;
  const wholeRaw = hasSeparator ? unsigned.slice(0, separatorIndex) : unsigned;
  const decimalsRaw = hasSeparator ? unsigned.slice(separatorIndex + 1).replace(/,/g, '') : '';
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || (hasSeparator ? '0' : '');
  const normalized = `${whole}${hasSeparator ? `,${decimalsRaw.slice(0, 3)}` : ''}`;
  return `${negative ? '-' : ''}${normalized}`;
}

export function sanitizeBenchmarkElevationInput(value) {
  const raw = String(value ?? '').replace(/\s+/g, '');
  if (!raw) return '';
  const negative = raw.startsWith('-');
  const unsigned = raw.replace(/-/g, '').replace(/[^\d.,]/g, '');
  return `${negative ? '-' : ''}${unsigned}`;
}

export function normalizeBenchmarkElevationInput(value) {
  const sanitized = sanitizeBenchmarkElevationInput(value);
  if (!sanitized || sanitized === '-') return sanitized;

  const negative = sanitized.startsWith('-');
  const sign = negative ? -1 : 1;
  const unsigned = negative ? sanitized.slice(1) : sanitized;
  const hasComma = unsigned.includes(',');
  const hasDot = unsigned.includes('.');
  let meters = null;

  if (hasComma && hasDot) {
    const decimalIndex = Math.max(unsigned.lastIndexOf(','), unsigned.lastIndexOf('.'));
    const wholeDigits = unsigned.slice(0, decimalIndex).replace(/[.,]/g, '') || '0';
    const fractionDigits = unsigned.slice(decimalIndex + 1).replace(/[.,]/g, '');
    const millimeters = Number(`${wholeDigits}.${fractionDigits || '0'}`);
    if (Number.isFinite(millimeters)) meters = sign * roundSymmetric(millimeters) / 1000;
  } else if (/^\d+$/.test(unsigned)) {
    const numeric = Number(unsigned);
    if (Number.isFinite(numeric)) meters = sign * (unsigned.length >= 4 ? numeric / 1000 : numeric);
  } else {
    const separator = hasComma ? ',' : hasDot ? '.' : null;
    if (separator && unsigned.split(separator).length === 2) {
      const numeric = Number(unsigned.replace(separator, '.'));
      if (Number.isFinite(numeric)) meters = sign * numeric;
    }
  }

  return meters === null ? sanitized : formatMeters(meters);
}

export function canonicalBenchmarkElevationDraft(value) {
  const sanitized = sanitizeBenchmarkElevationInput(value);
  if (!sanitized) return '';
  const normalized = normalizeBenchmarkElevationInput(sanitized);
  return /^-?\d+,\d{3}$/.test(normalized) ? normalized : null;
}

export function normalizeMeterInput(value) {
  const meters = numberOf(value);
  if (meters === null) return value === null || value === undefined ? '' : String(value);
  return formatMeters(meters);
}

export function normalizeStaffInput(value) {
  const numeric = numberOf(value);
  if (numeric === null) return value === null || value === undefined ? '' : String(value);
  // A leveling staff reading cannot realistically reach 100 m. This also repairs
  // imported values such as 2000.000 that were entered in millimeters previously.
  return formatMeters(Math.abs(numeric) >= 100 ? numeric / 1000 : numeric);
}

export function formatElevation(valueInMillimeters) {
  const meters = millimetersToMeters(valueInMillimeters);
  return meters === null ? '—' : formatMeters(meters);
}

export const formatStaffReading = formatElevation;

export function roundMillimeters(value) {
  if (!isFiniteNumber(value)) return null;
  return roundSymmetric(normalizeZero(value, 0.5));
}

export function formatMillimeters(value, { signed = false } = {}) {
  const rounded = roundMillimeters(value);
  if (rounded === null) return '—';
  if (signed && rounded > 0) return `+${rounded}`;
  return String(rounded);
}

export const formatSignedMillimeters = (value) => formatMillimeters(value, { signed: true });

export function formatReportMeters(value, locale = 'vi-VN') {
  if (!isFiniteNumber(value)) return '—';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    useGrouping: false,
  }).format(normalizeZero(value, 0.0005));
}

export function formatReportElevation(valueInMillimeters, locale) {
  const meters = millimetersToMeters(valueInMillimeters);
  return meters === null ? '—' : formatReportMeters(meters, locale);
}

export function formatReportMillimeters(value, { signed = false, locale } = {}) {
  const rounded = roundMillimeters(value);
  if (rounded === null) return '—';
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: false,
  }).format(Math.abs(rounded));
  if (rounded < 0) return `-${formatted}`;
  if (signed && rounded > 0) return `+${formatted}`;
  return formatted;
}
