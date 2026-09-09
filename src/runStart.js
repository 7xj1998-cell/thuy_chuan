import { uppercaseName } from './calc';
import { createRun, nextRunNumber, START_MODE_KNOWN, START_MODE_UNKNOWN } from './model';
import { canonicalBenchmarkElevationDraft, READING_FIELDS } from './units';

export function validBenchmarks(book) {
  return (book?.benchmarks || [])
    .map((benchmark) => ({
      ...benchmark,
      name: uppercaseName(benchmark.name).trim(),
      elevation: canonicalBenchmarkElevationDraft(benchmark.elevation),
    }))
    .filter((benchmark) => benchmark.name && benchmark.elevation !== null && benchmark.elevation !== '');
}

export function findValidBenchmark(book, name) {
  const target = uppercaseName(name).trim();
  return validBenchmarks(book).find((benchmark) => benchmark.name === target) || null;
}

export function createUnstartedRun(book, mode = 'single') {
  return { ...createRun(nextRunNumber(book?.runs || []), ''), mode };
}

export function runHasReadings(run) {
  return (run?.stations || []).some((station) => READING_FIELDS.some(
    (field) => String(station?.[field] ?? '').trim() !== '',
  ));
}

export function changeRunStartPoint(book, runId, benchmarkName) {
  const benchmark = findValidBenchmark(book, benchmarkName);
  if (!benchmark) return book;
  return {
    ...book,
    runs: book.runs.map((run) => run.id === runId
      ? { ...run, startPoint: benchmark.name, startMode: START_MODE_KNOWN }
      : run),
  };
}

export function changeRunUnknownStart(book, runId, pointName) {
  const name = uppercaseName(pointName).trim();
  if (!name) return book;
  return {
    ...book,
    runs: book.runs.map((run) => run.id === runId
      ? { ...run, startPoint: name, startMode: START_MODE_UNKNOWN }
      : run),
  };
}
