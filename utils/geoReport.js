// Aggregates the per-city comparison rows emitted by tests/geo-comparison.spec.js
// (test-results/geo-new-vs-current-report.jsonl) plus the latency data from
// tests/geo-latency.spec.js (test-results/geo-latency-comparison.json) into a
// single QA summary with side-by-side statistics for the NEW vs CURRENT API.
//
// Output: console table + test-results/geo-qa-summary.json
// Run after the geo suite:  npm run test:geo   (or)   npm run geo:report

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const JSONL = path.join(RESULTS_DIR, 'geo-new-vs-current-report.jsonl');
const LATENCY_FILE = path.join(RESULTS_DIR, 'geo-latency-comparison.json');
const OUT = path.join(RESULTS_DIR, 'geo-qa-summary.json');
// HTML report -> user's Documents folder (one level above the project root),
// alongside the API report, so it lives outside the repo.
const HTML_OUT = path.join(process.cwd(), '..', 'geo-api-qa-report.html');

// A provider's best pick is considered "accurate" for a city if it lands within
// this many km of the known reference point.
const ACCURACY_TOLERANCE_KM = Number(process.env.GEO_COORD_TOLERANCE_KM) || 100;

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

/** Build a self-contained HTML report from the geo summary object. */
function writeHtml(summary) {
  const s = summary.statistics;
  const L = s.latencyMs && s.latencyMs.new ? s.latencyMs : null;
  const speedup = L ? L.speedupFactor : null;
  // Per-city rows for the interactive table.
  const rows = JSON.stringify(summary.rows.map((r) => ({
    query: r.query,
    newMatch: r.newMatch || null,
    curMatch: r.curMatch || null,
    newDist: r.newDistFromRefKm,
    curDist: r.curDistFromRefKm,
    delta: r.coordDeltaKm,
    notes: r.notes || [],
    newStatus: r.newStatus,
    curStatus: r.curStatus,
  })));
  const latencyRows = L ? [
    ['Average', L.new.avgMs, L.current.avgMs],
    ['p50 (median)', L.new.p50Ms, L.current.p50Ms],
    ['p90', L.new.p90Ms, L.current.p90Ms],
    ['p95', L.new.p95Ms, L.current.p95Ms],
    ['p99', L.new.p99Ms, L.current.p99Ms],
    ['max', L.new.maxMs, L.current.maxMs],
    ['std deviation', L.new.stdevMs, L.current.stdevMs],
  ] : [];
  const latencyTable = latencyRows.map(([k, n, c]) => `<tr><td class="metric">Latency &mdash; ${k}</td>`
    + `<td class="val-new">${n} ms</td><td class="val-cur">${c} ms</td>`
    + `<td>${n <= c ? '<span class="winner">New</span>' : '<span class="muted">Current</span>'}</td></tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Geo Search API - QA Report</title>
<style>
  :root{--bg:#0d1117;--panel:#161b22;--panel2:#1c2330;--border:#2a3441;--text:#e6edf3;--muted:#8b98a5;
    --new:#3fb950;--cur:#d29922;--accent:#58a6ff;--bad:#f85149;--radius:14px;--shadow:0 8px 30px rgba(0,0,0,.35);}
  *{box-sizing:border-box;} body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
    background:radial-gradient(1200px 600px at 20% -10%,#17202e,var(--bg) 55%);color:var(--text);line-height:1.5;padding-bottom:80px;}
  .wrap{max-width:1120px;margin:0 auto;padding:0 24px;}
  header{padding:52px 24px 38px;text-align:center;border-bottom:1px solid var(--border);background:linear-gradient(180deg,rgba(88,166,255,.06),transparent);}
  .eyebrow{text-transform:uppercase;letter-spacing:3px;font-size:12px;color:var(--accent);font-weight:600;}
  h1{margin:8px 0 4px;font-size:34px;font-weight:800;letter-spacing:-.5px;}
  header p{margin:0;color:var(--muted);font-size:14px;}
  .verdict{display:inline-flex;align-items:center;gap:10px;margin-top:20px;padding:10px 20px;background:rgba(63,185,80,.12);border:1px solid rgba(63,185,80,.4);border-radius:999px;font-weight:600;color:var(--new);}
  .verdict .dot{width:10px;height:10px;border-radius:50%;background:var(--new);box-shadow:0 0 12px var(--new);}
  section{margin-top:40px;} h2{font-size:13px;text-transform:uppercase;letter-spacing:2px;color:var(--muted);font-weight:700;margin:0 0 16px;display:flex;align-items:center;gap:10px;}
  h2::before{content:"";width:22px;height:2px;background:var(--accent);border-radius:2px;}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
  .kpi{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow);position:relative;}
  .kpi .label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;}
  .kpi .value{font-size:28px;font-weight:800;margin:6px 0 2px;} .kpi.win .value{color:var(--new);}
  .kpi .sub{font-size:12px;color:var(--muted);} .kpi .badge{position:absolute;top:14px;right:14px;font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;background:rgba(63,185,80,.12);color:var(--new);}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
  table{width:100%;border-collapse:collapse;font-size:13.5px;}
  thead th{text-align:left;padding:12px 16px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border);background:var(--panel2);cursor:pointer;}
  thead th.new{color:var(--new);} thead th.cur{color:var(--cur);}
  tbody td{padding:11px 16px;border-bottom:1px solid rgba(42,52,65,.55);} tbody tr:hover{background:rgba(88,166,255,.04);}
  td.metric{font-weight:600;} .val-new{color:var(--new);font-weight:700;} .val-cur{color:var(--cur);font-weight:700;}
  .winner{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(63,185,80,.12);color:var(--new);}
  .muted{color:var(--muted);} .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;}
  .pill{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;} .pill.ok{background:rgba(63,185,80,.12);color:var(--new);} .pill.bad{background:rgba(248,81,73,.12);color:var(--bad);} .pill.warn{background:rgba(210,153,34,.12);color:var(--cur);}
  .controls{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;} input[type=search],select{background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:8px 12px;font-size:13px;} input[type=search]{flex:1;min-width:220px;}
  footer{margin-top:44px;text-align:center;color:var(--muted);font-size:12.5px;}
  @media(max-width:820px){.kpis{grid-template-columns:repeat(2,1fr);}}
</style></head><body>
<header>
  <div class="eyebrow">QA Test Report</div>
  <h1>Geo Search API</h1>
  <p>New API vs current Vedic Astro API &bull; ${summary.totalCitiesCompared} cities compared &bull; accuracy tolerance ${s.accuracyToleranceKm} km &bull; ${new Date(summary.generatedAt).toLocaleString()}</p>
  <div class="verdict"><span class="dot"></span> New API: ${s.accuracy.new.pct}% accurate, ${speedup ? '~' + speedup + '&times; faster' : 'faster'} &mdash; recommended with minor coverage fixes</div>
</header>
<div class="wrap">
  <section><h2>Headline</h2><div class="kpis">
    <div class="kpi win"><div class="badge">${s.accuracy.new.pct}%</div><div class="label">Accuracy</div><div class="value">${s.accuracy.new.pct}%</div><div class="sub">${s.accuracy.new.correct}/${s.accuracy.new.of} within ${s.accuracyToleranceKm}km &bull; current ${s.accuracy.current.pct}%</div></div>
    <div class="kpi win"><div class="label">Availability</div><div class="value">${s.availability.new.pct}%</div><div class="sub">${s.availability.new.resolved}/${s.availability.new.of} resolved &bull; current ${s.availability.current.pct}%</div></div>
    ${L ? `<div class="kpi win"><div class="badge">${speedup}&times;</div><div class="label">Avg latency</div><div class="value">${L.new.avgMs}<span style="font-size:14px;color:var(--muted)"> ms</span></div><div class="sub">vs current ${L.current.avgMs} ms</div></div>` : ''}
    <div class="kpi"><div class="label">Results / query</div><div class="value">${s.resultCount.new.avg}</div><div class="sub">avg &bull; current ${s.resultCount.current.avg}</div></div>
  </div></section>

  <section><h2>New vs Current - Side by Side</h2><div class="card"><table>
    <thead><tr><th>Metric</th><th class="new">New API</th><th class="cur">Current API</th><th>Winner</th></tr></thead>
    <tbody>
      <tr><td class="metric">Availability</td><td class="val-new">${s.availability.new.pct}% (${s.availability.new.resolved}/${s.availability.new.of})</td><td class="val-cur">${s.availability.current.pct}% (${s.availability.current.resolved}/${s.availability.current.of})</td><td>${s.availability.new.pct >= s.availability.current.pct ? '<span class="winner">New</span>' : '<span class="muted">Current</span>'}</td></tr>
      <tr><td class="metric">Accuracy (&le;${s.accuracyToleranceKm}km)</td><td class="val-new">${s.accuracy.new.pct}% (${s.accuracy.new.correct}/${s.accuracy.new.of})</td><td class="val-cur">${s.accuracy.current.pct}% (${s.accuracy.current.correct}/${s.accuracy.current.of})</td><td>${s.accuracy.new.pct >= s.accuracy.current.pct ? '<span class="winner">New</span>' : '<span class="muted">Current</span>'}</td></tr>
      ${latencyTable}
      <tr><td class="metric">Results per query (avg)</td><td class="val-new">${s.resultCount.new.avg}</td><td class="val-cur">${s.resultCount.current.avg}</td><td class="muted">Current (more)</td></tr>
    </tbody></table></div>
    ${L ? `<p class="muted" style="margin-top:10px;font-size:12.5px;">Latency from ${L.totalRequestsPerApi} requests/API (${L.iterationsPerCity}/city). Tail matters: current API p99 ${L.current.p99Ms}ms / max ${L.current.maxMs}ms vs new ${L.new.p99Ms}ms / ${L.new.maxMs}ms.</p>` : ''}
  </section>

  <section><h2>Findings</h2><div class="card">
    <div style="padding:14px 18px;border-bottom:1px solid rgba(42,52,65,.55)"><strong>CURRENT API unavailable (5xx) on:</strong> <span class="mono">${summary.currentApiUnavailable.map((r) => r.query + '[' + r.curStatus + ']').join(', ') || 'none'}</span></div>
    <div style="padding:14px 18px;border-bottom:1px solid rgba(42,52,65,.55)"><strong>Large coordinate divergences (&gt;25km):</strong> ${summary.largeCoordinateDivergences.length}<br/><span class="muted mono" style="font-size:11.5px">${summary.largeCoordinateDivergences.map((d) => d.query + ' (' + d.coordDeltaKm + 'km; NEW ' + d.newDistFromRefKm + 'km, CUR ' + d.curDistFromRefKm + 'km from ref)').join('<br/>') || 'none'}</span></div>
    <div style="padding:14px 18px"><strong>Naming / field differences:</strong> ${summary.namingDifferences.length}<br/><span class="muted mono" style="font-size:11.5px">${summary.namingDifferences.map((n) => n.query + ': ' + n.notes.join('; ')).slice(0, 12).join('<br/>') || 'none'}</span></div>
  </div></section>

  <section><h2>Per-City Results</h2>
    <div class="controls"><input id="q" type="search" placeholder="Filter by city..."/>
      <select id="filter"><option value="all">All (${summary.rows.length})</option><option value="diverge">Divergences &gt;25km</option><option value="curFail">Current API failed</option></select>
      <span class="muted" id="count"></span></div>
    <div class="card"><table id="tbl"><thead><tr>
      <th data-k="query">City</th><th class="new" data-k="newMatch">New API match</th><th class="cur" data-k="curMatch">Current API match</th><th class="num" data-k="delta">&Delta; km</th><th>Status</th>
    </tr></thead><tbody id="rows"></tbody></table></div>
  </section>
  <footer>Auto-generated from <span class="mono">geo-qa-summary.json</span> &bull; click a header to sort</footer>
</div>
<script>
  const ROWS=${rows};
  let sortKey='delta',sortDir=-1;
  const q=document.getElementById('q'),filter=document.getElementById('filter'),rowsEl=document.getElementById('rows'),countEl=document.getElementById('count');
  function esc(s){return (s==null?'':String(s)).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
  function statusPill(r){
    if(r.newStatus!==200) return '<span class="pill bad">new '+r.newStatus+'</span>';
    if(!r.newMatch) return '<span class="pill bad">no match</span>';
    if(typeof r.delta==='number'&&r.delta>25) return '<span class="pill warn">'+r.delta+'km apart</span>';
    return '<span class="pill ok">match</span>';
  }
  function render(){
    const term=q.value.trim().toLowerCase(),f=filter.value;
    let list=ROWS.filter(r=>{
      if(term&&!r.query.toLowerCase().includes(term)) return false;
      if(f==='diverge') return typeof r.delta==='number'&&r.delta>25;
      if(f==='curFail') return r.curStatus!==200||!r.curMatch;
      return true;});
    list.sort((x,y)=>{const a=x[sortKey],b=y[sortKey];
      if(typeof a==='number'||typeof b==='number') return ((a||0)-(b||0))*sortDir;
      return String(a).localeCompare(String(b))*sortDir;});
    rowsEl.innerHTML=list.map(r=>'<tr>'+
      '<td class="mono" style="text-transform:capitalize">'+esc(r.query)+'</td>'+
      '<td class="val-new">'+(r.newMatch?esc(r.newMatch):'<span class="muted">- none -</span>')+'</td>'+
      '<td class="'+(r.curMatch?'val-cur':'muted')+'">'+(r.curMatch?esc(r.curMatch):'- none -')+'</td>'+
      '<td class="num mono">'+(r.delta==null?'<span class="muted">n/a</span>':(r.delta===0?'<span class="val-new">0</span>':esc(r.delta)))+'</td>'+
      '<td>'+statusPill(r)+'</td></tr>').join('');
    countEl.textContent=list.length+' shown';
  }
  document.querySelectorAll('th[data-k]').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.k;if(sortKey===k)sortDir*=-1;else{sortKey=k;sortDir=(k==='query'||k==='newMatch'||k==='curMatch')?1:-1;}render();}));
  q.addEventListener('input',render);filter.addEventListener('change',render);render();
</script>
</body></html>`;
  fs.writeFileSync(HTML_OUT, html);
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
  writeHtml(summary);

  console.log(`\n  JSON summary: ${OUT}`);
  console.log(`  HTML report:  ${path.resolve(HTML_OUT)}`);
  console.log('==============================================================\n');
}

main();
