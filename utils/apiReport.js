// Aggregates the per-endpoint benchmark rows written by
// tests/api-response-time.spec.js (test-results/api-response-time.jsonl) into a
// response-time report: overall stats, slowest endpoints, threshold breaches,
// and unhealthy (5xx / non-2xx) endpoints.
//
// Output: console tables + test-results/api-response-time-summary.json
// Run after the suite:  npm run test:api   (or)   npm run api:report

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const JSONL = path.join(RESULTS_DIR, 'api-response-time.jsonl');
const OUT = path.join(RESULTS_DIR, 'api-response-time-summary.json');
// HTML report is written to the user's Documents folder (one level above the
// project root), so it lives outside the repo alongside the geo report.
const HTML_OUT = path.join(process.cwd(), '..', 'api-response-time-report.html');
const THRESHOLD_MS = Number(process.env.API_LATENCY_THRESHOLD_MS) || 1000;

function loadRows() {
  if (!fs.existsSync(JSONL)) {
    console.error(`No benchmark data at ${JSONL}. Run the API suite first (npm run test:api).`);
    process.exit(1);
  }
  const lines = fs.readFileSync(JSONL, 'utf8').split('\n').filter(Boolean);
  const byPath = new Map();
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      byPath.set(row.path, row); // de-dup, keep latest
    } catch (_) { /* skip */ }
  }
  return [...byPath.values()];
}

function overall(values) {
  const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v)).sort((a, b) => a - b);
  if (!nums.length) return { count: 0 };
  const sum = nums.reduce((a, b) => a + b, 0);
  const pc = (p) => nums[Math.min(nums.length - 1, Math.ceil((p / 100) * nums.length) - 1)];
  return {
    count: nums.length,
    minMs: nums[0],
    maxMs: nums[nums.length - 1],
    avgMs: Math.round(sum / nums.length),
    p50Ms: pc(50),
    p90Ms: pc(90),
    p95Ms: pc(95),
    p99Ms: pc(99),
  };
}

function padEnd(v, w) { return String(v).padEnd(w); }
function padStart(v, w) { return String(v).padStart(w); }

/** Build a self-contained, interactive HTML report from the summary object. */
function writeHtml(summary) {
  const a = summary.avgLatencyDistribution;
  const p = summary.p95LatencyDistribution;
  const pctHealthy = summary.totalEndpoints
    ? Math.round((summary.healthyCount / summary.totalEndpoints) * 1000) / 10 : 0;
  // Embed the endpoint rows so the table can be filtered/sorted client-side.
  const data = JSON.stringify(summary.rows.map((r) => ({
    path: r.path,
    tag: r.tag,
    summary: r.summary || '',
    role: r.role || '',
    avg: r.avgMs, p50: r.p50Ms, p95: r.p95Ms, p99: r.p99Ms, max: r.maxMs, stdev: r.stdevMs,
    status: r.statusCounts,
    healthy: r.healthy, server5xx: r.server5xx, client4xx: r.client4xx, over: r.overThreshold,
  })));

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>API Response-Time Report</title>
<style>
  :root{--bg:#0d1117;--panel:#161b22;--panel2:#1c2330;--border:#2a3441;--text:#e6edf3;--muted:#8b98a5;
    --ok:#3fb950;--warn:#d29922;--bad:#f85149;--accent:#58a6ff;--radius:14px;--shadow:0 8px 30px rgba(0,0,0,.35);}
  *{box-sizing:border-box;} body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
    background:radial-gradient(1200px 600px at 20% -10%,#17202e,var(--bg) 55%);color:var(--text);line-height:1.5;padding-bottom:80px;}
  .wrap{max-width:1180px;margin:0 auto;padding:0 24px;}
  header{padding:48px 24px 34px;text-align:center;border-bottom:1px solid var(--border);background:linear-gradient(180deg,rgba(88,166,255,.06),transparent);}
  .eyebrow{text-transform:uppercase;letter-spacing:3px;font-size:12px;color:var(--accent);font-weight:600;}
  h1{margin:8px 0 4px;font-size:32px;font-weight:800;letter-spacing:-.5px;}
  header p{margin:0;color:var(--muted);font-size:14px;}
  section{margin-top:40px;} h2{font-size:13px;text-transform:uppercase;letter-spacing:2px;color:var(--muted);font-weight:700;margin:0 0 16px;display:flex;align-items:center;gap:10px;}
  h2::before{content:"";width:22px;height:2px;background:var(--accent);border-radius:2px;}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
  .kpi{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow);}
  .kpi .label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;}
  .kpi .value{font-size:28px;font-weight:800;margin:6px 0 2px;}
  .kpi .sub{font-size:12px;color:var(--muted);} .kpi.ok .value{color:var(--ok);} .kpi.bad .value{color:var(--bad);} .kpi.warn .value{color:var(--warn);}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
  table{width:100%;border-collapse:collapse;font-size:13.5px;}
  thead th{text-align:left;padding:12px 14px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border);background:var(--panel2);cursor:pointer;user-select:none;white-space:nowrap;}
  thead th.num{text-align:right;} tbody td{padding:10px 14px;border-bottom:1px solid rgba(42,52,65,.55);}
  tbody tr:hover{background:rgba(88,166,255,.04);} td.num{text-align:right;font-variant-numeric:tabular-nums;}
  .mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:12.5px;}
  .tag{color:var(--muted);font-size:11.5px;}
  .pill{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap;}
  .pill.ok{background:rgba(63,185,80,.12);color:var(--ok);} .pill.warn{background:rgba(210,153,34,.12);color:var(--warn);} .pill.bad{background:rgba(248,81,73,.12);color:var(--bad);}
  .p95{font-weight:700;} .over{color:var(--bad);} 
  .controls{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:14px;}
  input[type=search],select{background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:8px 12px;font-size:13px;}
  input[type=search]{flex:1;min-width:220px;}
  .muted{color:var(--muted);} .bar{height:6px;border-radius:4px;background:var(--panel2);overflow:hidden;margin-top:5px;}
  .bar>i{display:block;height:100%;} 
  footer{margin-top:44px;text-align:center;color:var(--muted);font-size:12.5px;}
  @media(max-width:820px){.kpis{grid-template-columns:repeat(2,1fr);}}
</style></head><body>
<header>
  <div class="eyebrow">API QA Report</div>
  <h1>API Response Time</h1>
  <p>${summary.totalEndpoints} authenticated GET endpoints &nbsp;&bull;&nbsp; 20 requests each &nbsp;&bull;&nbsp; p95 threshold ${summary.thresholdMs} ms &nbsp;&bull;&nbsp; ${new Date(summary.generatedAt).toLocaleString()}</p>
</header>
<div class="wrap">
  <section>
    <h2>Headline</h2>
    <div class="kpis">
      <div class="kpi ok"><div class="label">Healthy</div><div class="value">${pctHealthy}%</div><div class="sub">${summary.healthyCount}/${summary.totalEndpoints} returned 2xx, no 5xx</div></div>
      <div class="kpi ${summary.server5xxCount ? 'bad' : 'ok'}"><div class="label">Server 5xx</div><div class="value">${summary.server5xxCount}</div><div class="sub">endpoints erroring</div></div>
      <div class="kpi ${summary.overThresholdCount ? 'warn' : 'ok'}"><div class="label">Over threshold</div><div class="value">${summary.overThresholdCount}</div><div class="sub">p95 &gt; ${summary.thresholdMs} ms</div></div>
      <div class="kpi"><div class="label">Median latency</div><div class="value">${a.p50Ms}<span style="font-size:14px;color:var(--muted)"> ms</span></div><div class="sub">avg across endpoints &bull; p95 ${a.p95Ms} ms</div></div>
    </div>
  </section>

  <section>
    <h2>Latency Distribution (across endpoints)</h2>
    <div class="card" style="padding:16px 20px;">
      <table><thead><tr><th>Measure</th><th class="num">min</th><th class="num">p50</th><th class="num">p90</th><th class="num">p95</th><th class="num">p99</th><th class="num">max</th></tr></thead>
      <tbody>
        <tr><td>Average latency per endpoint</td><td class="num">${a.minMs}</td><td class="num">${a.p50Ms}</td><td class="num">${a.p90Ms}</td><td class="num">${a.p95Ms}</td><td class="num">${a.p99Ms}</td><td class="num">${a.maxMs}</td></tr>
        <tr><td>p95 latency per endpoint</td><td class="num">${p.minMs}</td><td class="num">${p.p50Ms}</td><td class="num">${p.p90Ms}</td><td class="num">${p.p95Ms}</td><td class="num">${p.p99Ms}</td><td class="num">${p.maxMs}</td></tr>
      </tbody></table>
    </div>
  </section>

  <section>
    <h2>All Endpoints</h2>
    <div class="controls">
      <input id="q" type="search" placeholder="Filter by path or tag..." />
      <select id="filter">
        <option value="all">All (${summary.totalEndpoints})</option>
        <option value="healthy">Healthy only</option>
        <option value="5xx">5xx errors (${summary.server5xxCount})</option>
        <option value="4xx">4xx / not benchmarkable</option>
        <option value="over">Over threshold (${summary.overThresholdCount})</option>
      </select>
      <span class="muted" id="count"></span>
    </div>
    <div class="card">
      <table id="tbl"><thead><tr>
        <th data-k="path">Endpoint</th><th data-k="tag">Tag</th><th data-k="role">Role</th>
        <th class="num" data-k="avg">avg</th><th class="num" data-k="p50">p50</th>
        <th class="num" data-k="p95">p95</th><th class="num" data-k="p99">p99</th>
        <th class="num" data-k="max">max</th><th>Status</th>
      </tr></thead><tbody id="rows"></tbody></table>
    </div>
  </section>

  <footer>Generated from <span class="mono">api-response-time-summary.json</span> &nbsp;&bull;&nbsp; sortable: click a column header</footer>
</div>
<script>
  const ROWS = ${data};
  const THRESHOLD = ${summary.thresholdMs};
  const maxP95 = Math.max(...ROWS.map(r=>r.p95||0),1);
  let sortKey='p95', sortDir=-1;
  const q=document.getElementById('q'), filter=document.getElementById('filter'),
        rowsEl=document.getElementById('rows'), countEl=document.getElementById('count');
  function esc(s){return (s==null?'':String(s)).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
  function health(r){
    if(r.server5xx) return '<span class="pill bad">5xx</span>';
    if(r.client4xx) return '<span class="pill warn">'+esc(Object.keys(r.status).join(','))+'</span>';
    if(r.over) return '<span class="pill warn">slow</span>';
    return '<span class="pill ok">ok</span>';
  }
  function render(){
    const term=q.value.trim().toLowerCase(), f=filter.value;
    let list=ROWS.filter(r=>{
      if(term && !(r.path.toLowerCase().includes(term)||(r.tag||'').toLowerCase().includes(term))) return false;
      if(f==='healthy') return r.healthy && !r.over;
      if(f==='5xx') return r.server5xx;
      if(f==='4xx') return r.client4xx;
      if(f==='over') return r.over;
      return true;
    });
    list.sort((x,y)=>{const a=x[sortKey],b=y[sortKey];
      if(typeof a==='number') return (a-b)*sortDir;
      return String(a).localeCompare(String(b))*sortDir;});
    rowsEl.innerHTML=list.map(r=>{
      const w=Math.round((r.p95/maxP95)*100);
      const col=r.over?'var(--bad)':(r.p95>THRESHOLD*0.5?'var(--warn)':'var(--ok)');
      return '<tr>'+
        '<td class="mono">'+esc(r.path)+(r.summary?'<div class="tag">'+esc(r.summary)+'</div>':'')+'</td>'+
        '<td class="tag">'+esc(r.tag)+'</td>'+
        '<td class="tag">'+esc(r.role)+'</td>'+
        '<td class="num">'+r.avg+'</td>'+
        '<td class="num">'+r.p50+'</td>'+
        '<td class="num p95 '+(r.over?'over':'')+'">'+r.p95+'<div class="bar"><i style="width:'+w+'%;background:'+col+'"></i></div></td>'+
        '<td class="num">'+r.p99+'</td>'+
        '<td class="num">'+r.max+'</td>'+
        '<td>'+health(r)+'</td>'+
      '</tr>';
    }).join('');
    countEl.textContent=list.length+' shown';
  }
  document.querySelectorAll('th[data-k]').forEach(th=>th.addEventListener('click',()=>{
    const k=th.dataset.k; if(sortKey===k) sortDir*=-1; else{sortKey=k;sortDir=(k==='path'||k==='tag')?1:-1;} render();
  }));
  q.addEventListener('input',render); filter.addEventListener('change',render); render();
</script>
</body></html>`;
  fs.writeFileSync(HTML_OUT, html);
}

function main() {
  const rows = loadRows();

  const healthy = rows.filter((r) => r.healthy);
  const unhealthy = rows.filter((r) => !r.healthy);
  const server5xx = rows.filter((r) => r.server5xx);
  const overThreshold = rows.filter((r) => r.overThreshold);

  // Overall distribution is computed across each endpoint's average latency.
  const avgDist = overall(rows.map((r) => r.avgMs));
  const p95Dist = overall(rows.map((r) => r.p95Ms));

  const slowest = [...rows].sort((a, b) => (b.p95Ms || 0) - (a.p95Ms || 0)).slice(0, 15);
  const fastest = [...healthy].sort((a, b) => (a.p95Ms || 0) - (b.p95Ms || 0)).slice(0, 10);

  const summary = {
    generatedAt: new Date().toISOString(),
    thresholdMs: THRESHOLD_MS,
    totalEndpoints: rows.length,
    healthyCount: healthy.length,
    unhealthyCount: unhealthy.length,
    server5xxCount: server5xx.length,
    overThresholdCount: overThreshold.length,
    avgLatencyDistribution: avgDist,
    p95LatencyDistribution: p95Dist,
    unhealthyEndpoints: unhealthy.map((r) => ({ path: r.path, tag: r.tag, statusCounts: r.statusCounts })),
    overThresholdEndpoints: overThreshold.map((r) => ({ path: r.path, p95Ms: r.p95Ms, avgMs: r.avgMs })),
    slowest,
    rows: rows.sort((a, b) => (b.p95Ms || 0) - (a.p95Ms || 0)),
  };

  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));

  console.log('\n=================== API RESPONSE-TIME SUMMARY ===================');
  console.log(`API: ${rows.length} endpoints benchmarked  |  p95 threshold: ${THRESHOLD_MS}ms`);
  console.log(`Healthy (2xx, no 5xx): ${healthy.length}/${rows.length}   `
    + `Unhealthy: ${unhealthy.length}   5xx: ${server5xx.length}   Over threshold: ${overThreshold.length}`);
  console.log('');
  console.log(`Across all endpoints  ->  avg latency: median ${avgDist.p50Ms}ms, p95 ${avgDist.p95Ms}ms, max ${avgDist.maxMs}ms`);
  console.log(`                          per-endpoint p95: median ${p95Dist.p50Ms}ms, worst ${p95Dist.maxMs}ms`);

  console.log('\n  SLOWEST 15 ENDPOINTS (by p95)');
  console.log('  ' + padEnd('endpoint', 48) + padStart('avg', 7) + padStart('p95', 8) + padStart('p99', 8) + padStart('max', 8) + '  health');
  console.log('  ' + '-'.repeat(88));
  for (const r of slowest) {
    const flag = r.server5xx ? ' 5xx!' : (r.healthy ? '' : ' !2xx');
    const overFlag = r.overThreshold ? '  <-- OVER' : '';
    console.log('  ' + padEnd(r.path.slice(0, 47), 48)
      + padStart(r.avgMs, 7) + padStart(r.p95Ms, 8) + padStart(r.p99Ms, 8) + padStart(r.maxMs, 8)
      + '  ' + (flag || 'ok') + overFlag);
  }

  if (unhealthy.length) {
    console.log('\n  UNHEALTHY ENDPOINTS (no 2xx or returned 5xx)');
    for (const r of unhealthy) {
      console.log(`   - ${r.path}  ${JSON.stringify(r.statusCounts)}`);
    }
  }

  console.log('\n  FASTEST 10 (healthy)');
  for (const r of fastest) {
    console.log(`   - ${padEnd(r.path.slice(0, 47), 48)} avg ${r.avgMs}ms  p95 ${r.p95Ms}ms`);
  }

  writeHtml(summary);

  console.log(`\n  JSON report: ${OUT}`);
  console.log(`  HTML report: ${path.resolve(HTML_OUT)}`);
  console.log('=================================================================\n');
}

main();
