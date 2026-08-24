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

export function metersToMillimeters(value) {
  const meters = numberOf(value);
  return meters === null ? null : Math.round(meters * 1000);
}

export function millimetersToMeters(value) {
  return isFiniteNumber(value) ? value / 1000 : null;
}

export function migrateMillimeterInput(value) {
  const millimeters = numberOf(value);
  if (millimeters === null) return value === null || value === undefined ? '' : String(value);
  return (millimeters / 1000).toFixed(3);
}

export function formatMeters(value) {
  if (!isFiniteNumber(value)) return '—';
  return normalizeZero(value, 0.0005).toFixed(3);
}

export function normalizeMeterInput(value) {
  const meters = numberOf(value);
  if (meters === null) return value === null || value === undefined ? '' : String(value);
  return formatMeters(meters);
}

export function formatElevation(valueInMillimeters) {
  const meters = millimetersToMeters(valueInMillimeters);
  return meters === null ? '—' : formatMeters(meters);
}

export const formatStaffReading = formatElevation;

export function roundMillimeters(value) {
  if (!isFiniteNumber(value)) return null;
  return Math.round(normalizeZero(value, 0.5));
}

export function formatMillimeters(value, { signed = false } = {}) {
  const rounded = roundMillimeters(value);
  if (rounded === null) return '—';
  if (signed && rounded > 0) return `+${rounded}`;
  return String(rounded);
}

export const formatSignedMillimeters = (value) => formatMillimeters(value, { signed: true });

export function formatReportMeters(value, locale) {
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
