// Aggregates the per-city comparison rows emitted by tests/geo-comparison.spec.js
// (test-results/geo-new-vs-current-report.jsonl) plus the latency data from
// tests/geo-latency.spec.js (test-results/geo-latency-comparison.json) into a
// single QA summary with side-by-side statistics for the NEW vs CURRENT API.
//
// Output: console table + test-results/geo-qa-summary.json
// Run after the geo suite:  npm run test:geo   (or)   npm run geo:report

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const JSONL = path.join(RESULTS_DIR, 'geo-new-vs-current-report.jsonl');
const LATENCY_FILE = path.join(RESULTS_DIR, 'geo-latency-comparison.json');
const OUT = path.join(RESULTS_DIR, 'geo-qa-summary.json');

// A provider's best pick is considered "accurate" for a city if it lands within
// this many km of the known reference point.
const ACCURACY_TOLERANCE_KM = 60;

function loadRows() {
  if (!fs.existsSync(JSONL)) {
    console.error(`No comparison data found at ${JSONL}. Run the geo suite first.`);
    process.exit(1);
  }
  const lines = fs.readFileSync(JSONL, 'utf8').split('\n').filter(Boolean);
  const rows = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch (_) {
      // skip malformed line
    }
  }
  // De-duplicate by query (keep the last occurrence) in case of retries.
  const byQuery = new Map();
  for (const r of rows) byQuery.set(r.query, r);
  return [...byQuery.values()];
}

function loadLatency() {
  if (!fs.existsSync(LATENCY_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(LATENCY_FILE, 'utf8'));
  } catch (_) {
    return null;
  }
}

function numStats(values) {
  const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (!nums.length) return { count: 0 };
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round((sum / sorted.length) * 100) / 100,
  };
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10; // one decimal place
}

function buildStatistics(rows, latency) {
  const total = rows.length;

  // Availability: responded 200 with at least one result.
  const newAvailable = rows.filter((r) => r.newStatus === 200 && r.newCount > 0).length;
  const curAvailable = rows.filter((r) => r.curStatus === 200 && r.curCount > 0).length;

  // Accuracy: best in-country pick within tolerance of the reference point.
  // newDistFromRefKm / curDistFromRefKm are recorded by the comparison spec.
  const newAccurate = rows.filter(
    (r) => typeof r.newDistFromRefKm === 'number' && r.newDistFromRefKm <= ACCURACY_TOLERANCE_KM
  ).length;
  const curAccurate = rows.filter(
    (r) => typeof r.curDistFromRefKm === 'number' && r.curDistFromRefKm <= ACCURACY_TOLERANCE_KM
  ).length;

  // Cases where the current API had no correct in-country match at all.
  const curNoMatch = rows.filter((r) => !r.curMatch).length;

  // Result-count distribution per provider.
  const newCounts = numStats(rows.map((r) => r.newCount));
  const curCounts = numStats(rows.map((r) => r.curCount));

  // Coordinate agreement (only where both resolved a point).
  const deltas = rows
    .filter((r) => typeof r.coordDeltaKm === 'number')
    .map((r) => r.coordDeltaKm);
  const coordAgreement = numStats(deltas);
  const exactAgreement = deltas.filter((d) => d === 0).length;

  const stats = {
    accuracyToleranceKm: ACCURACY_TOLERANCE_KM,
    availability: {
      new: { resolved: newAvailable, of: total, pct: pct(newAvailable, total) },
      current: { resolved: curAvailable, of: total, pct: pct(curAvailable, total) },
    },
    accuracy: {
      new: { correct: newAccurate, of: total, pct: pct(newAccurate, total) },
      current: { correct: curAccurate, of: total, pct: pct(curAccurate, total) },
      currentNoInCountryMatch: curNoMatch,
    },
    resultCount: {
      new: newCounts,
      current: curCounts,
    },
    coordinateAgreement: {
      comparedPoints: deltas.length,
      exactMatches: exactAgreement,
      deltaKm: coordAgreement,
    },
  };

  if (latency && latency.newLatency && latency.currentLatency) {
    stats.latencyMs = {
      iterationsPerCity: latency.iterationsPerCity,
      totalRequestsPerApi: latency.totalRequestsPerApi,
      new: latency.newLatency,
      current: latency.currentLatency,
      speedupFactor: latency.speedupFactor,
    };
  } else {
    stats.latencyMs = { note: 'latency comparison file not found; run the latency spec' };
  }

  return stats;
}

function main() {
  const rows = loadRows();
  const latency = loadLatency();
  const statistics = buildStatistics(rows, latency);

  const currentApiFailures = rows.filter((r) => r.curStatus !== 200 || r.curCount === 0);
  const currentApiNoInCountry = rows.filter((r) => r.curStatus === 200 && r.curCount > 0 && !r.curMatch);
  const largeDivergence = rows.filter((r) => typeof r.coordDeltaKm === 'number' && r.coordDeltaKm > 25);
  const namingDiffs = rows.filter((r) => (r.notes || []).some((n) => n.includes('differs')));

  const summary = {
    generatedAt: new Date().toISOString(),
    totalCitiesCompared: rows.length,
    statistics,
    currentApiUnavailableCount: currentApiFailures.length,
    currentApiUnavailable: currentApiFailures.map((r) => ({ query: r.query, curStatus: r.curStatus })),
    currentApiNoInCountryMatch: currentApiNoInCountry.map((r) => r.query),
    largeCoordinateDivergences: largeDivergence.map((r) => ({
      query: r.query,
      coordDeltaKm: r.coordDeltaKm,
      newDistFromRefKm: r.newDistFromRefKm,
      curDistFromRefKm: r.curDistFromRefKm,
      newMatch: r.newMatch,
      curMatch: r.curMatch,
    })),
    namingDifferences: namingDiffs.map((r) => ({ query: r.query, notes: r.notes })),
    rows,
  };

  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));

  const s = statistics;
  const pad = (v, w) => String(v).padStart(w);
  console.log('\n===================== GEO API QA SUMMARY =====================');
  console.log(`Cities compared: ${summary.totalCitiesCompared}   (accuracy tolerance ${s.accuracyToleranceKm}km)\n`);

  console.log('  METRIC                         NEW API           CURRENT API');
  console.log('  ---------------------------------------------------------------');
  console.log(`  Availability (resolved)     ${pad(s.availability.new.pct + '%', 8)} (${s.availability.new.resolved}/${s.availability.new.of})    ${pad(s.availability.current.pct + '%', 8)} (${s.availability.current.resolved}/${s.availability.current.of})`);
  console.log(`  Accuracy (<=${s.accuracyToleranceKm}km)          ${pad(s.accuracy.new.pct + '%', 8)} (${s.accuracy.new.correct}/${s.accuracy.new.of})    ${pad(s.accuracy.current.pct + '%', 8)} (${s.accuracy.current.correct}/${s.accuracy.current.of})`);
  if (s.latencyMs && s.latencyMs.new) {
    const L = s.latencyMs;
    const sampleNote = L.totalRequestsPerApi
      ? `${L.totalRequestsPerApi} req/API (${L.iterationsPerCity}/city)`
      : 'single-shot';
    console.log(`  Latency samples             ${sampleNote}`);
    console.log(`  Latency avg (ms)            ${pad(L.new.avgMs, 11)}       ${pad(L.current.avgMs, 11)}`);
    console.log(`  Latency p50 (ms)            ${pad(L.new.p50Ms, 11)}       ${pad(L.current.p50Ms, 11)}`);
    console.log(`  Latency p90 (ms)            ${pad(L.new.p90Ms, 11)}       ${pad(L.current.p90Ms, 11)}`);
    console.log(`  Latency p95 (ms)            ${pad(L.new.p95Ms, 11)}       ${pad(L.current.p95Ms, 11)}`);
    console.log(`  Latency p99 (ms)            ${pad(L.new.p99Ms, 11)}       ${pad(L.current.p99Ms, 11)}`);
    console.log(`  Latency max (ms)            ${pad(L.new.maxMs, 11)}       ${pad(L.current.maxMs, 11)}`);
    console.log(`  Latency stdev (ms)          ${pad(L.new.stdevMs, 11)}       ${pad(L.current.stdevMs, 11)}`);
    if (L.speedupFactor) {
      console.log(`  -> NEW is ~${L.speedupFactor}x faster on average`);
    }
  }
  console.log(`  Results per query (avg)     ${pad(s.resultCount.new.avg, 11)}       ${pad(s.resultCount.current.avg, 11)}`);
  console.log(`  Results per query (min-max) ${pad(s.resultCount.new.min + '-' + s.resultCount.new.max, 11)}       ${pad(s.resultCount.current.min + '-' + s.resultCount.current.max, 11)}`);
  console.log('');
  console.log(`  Coordinate agreement: ${s.coordinateAgreement.exactMatches}/${s.coordinateAgreement.comparedPoints} exact (0km), `
    + `avg delta ${s.coordinateAgreement.deltaKm.avg}km, max ${s.coordinateAgreement.deltaKm.max}km`);
  console.log(`  CURRENT API no in-country match: ${s.accuracy.currentNoInCountryMatch} cities`);

  console.log('\n  ------------------------- FINDINGS -------------------------');
  console.log(`  CURRENT API unavailable on:    ${summary.currentApiUnavailable.map((r) => `${r.query}[${r.curStatus}]`).join(', ') || 'none'}`);
  console.log(`  CURRENT API no in-country hit:  ${summary.currentApiNoInCountryMatch.join(', ') || 'none'}`);
  console.log(`  Large coord divergences (>25km): ${summary.largeCoordinateDivergences.length}`);
  for (const d of summary.largeCoordinateDivergences) {
    console.log(`     - ${d.query}: ${d.coordDeltaKm}km apart | NEW ${d.newDistFromRefKm}km from ref `
      + `(${d.newMatch}) vs CUR ${d.curDistFromRefKm}km from ref (${d.curMatch})`);
  }
  console.log(`  Naming/field differences:      ${summary.namingDifferences.length}`);
  for (const n of summary.namingDifferences) {
    console.log(`     - ${n.query}: ${n.notes.join('; ')}`);
  }
  console.log(`\n  Full summary written to: ${OUT}`);
  console.log('==============================================================\n');
}

main();
