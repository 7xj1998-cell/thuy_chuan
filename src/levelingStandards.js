export const LEVELING_CLASSES = [
  { id: 'class-i', label: 'Thủy chuẩn hạng I', shortLabel: 'Hạng I', coefficient: 2, source: 'QCVN 11:2008/BTNMT' },
  { id: 'class-ii', label: 'Thủy chuẩn hạng II', shortLabel: 'Hạng II', coefficient: 4, source: 'QCVN 11:2008/BTNMT' },
  { id: 'class-iii', label: 'Thủy chuẩn hạng III', shortLabel: 'Hạng III', coefficient: 10, source: 'QCVN 11:2008/BTNMT' },
  { id: 'class-iv', label: 'Thủy chuẩn hạng IV', shortLabel: 'Hạng IV', coefficient: 20, source: 'QCVN 11:2008/BTNMT' },
  { id: 'technical', label: 'Thủy chuẩn kỹ thuật', shortLabel: 'Kỹ thuật', coefficient: 50, source: 'TCVN 8478:2010' },
];

export function getLevelingClass(value) {
  return LEVELING_CLASSES.find((item) => item.id === value) || null;
}

export function normalizeLevelingClass(value) {
  return getLevelingClass(value)?.id || '';
}

export function toleranceCoefficientForClass(value) {
  return getLevelingClass(value)?.coefficient ?? null;
}

export function evaluateRunStandard(solved, classId) {
  const standard = getLevelingClass(classId);
  if (!standard) return { status: 'unselected', standard: null, passed: null };
  if (!solved || solved.checks.length < 2) return { status: 'incomplete', standard, passed: null };
  if (!Number.isFinite(solved.totalDistance) || solved.totalDistance <= 0) {
    return { status: 'missing-distance', standard, passed: null };
  }

  const closure = Math.round(solved.checks.at(-1).difference);
  const lengthKm = solved.totalDistance / 1000;
  const allowable = standard.coefficient * Math.sqrt(lengthKm);
  const passed = Math.abs(closure) <= allowable + Number.EPSILON;
  return { status: passed ? 'passed' : 'failed', standard, passed, closure, lengthKm, allowable };
}
