// Authenticated client for benchmarking the shubAstro API response times.
// Wraps Playwright's APIRequestContext, injects a Bearer token, measures
// per-request latency, and reuses the shared stats helpers from geoApi.js.
//
// Two roles are supported (CUSTOMER + ASTROLOGER). Each endpoint is first tried
// with the customer token; if that yields only 4xx (no access), the endpoint is
// retried with the astrologer token so role-restricted endpoints are covered.

require('dotenv').config();
const { computeStats, writeArtifact } = require('./geoApi');

const API_BASE_URL = (process.env.API_BASE_URL || 'https://devapi-shubhtalk.epicon.in/api').replace(/\/$/, '');
const CUSTOMER_TOKEN = process.env.SWAGGER_BEARER_TOKEN || '';
const ASTRO_TOKEN = process.env.SWAGGER_ASTRO_TOKEN || '';
const THRESHOLD_MS = Number(process.env.API_LATENCY_THRESHOLD_MS) || 1000;
const ITERATIONS = Number(process.env.API_BENCH_ITERATIONS) || 20;

// Roles to try, in order. An endpoint "belongs" to the first role that gets a 2xx.
const ROLES = [
  { role: 'CUSTOMER', token: CUSTOMER_TOKEN },
  { role: 'ASTROLOGER', token: ASTRO_TOKEN },
].filter((r) => r.token.length > 0);

/** Bearer header for a given raw token. */
function bearer(token) {
  return {
    Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
    Accept: 'application/json',
  };
}

/**
 * Perform a single GET against the API and measure its latency.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} relPath - path relative to API_BASE_URL (e.g. "/plans/all")
 * @param {string} token - raw bearer token to use
 * @returns {Promise<{status:number, ok:boolean, latencyMs:number, url:string, error?:string}>}
 */
async function timedGet(request, relPath, token) {
  const url = `${API_BASE_URL}${relPath}`;
  const start = Date.now();
  try {
    const res = await request.get(url, { headers: bearer(token), timeout: 30000 });
    const latencyMs = Date.now() - start;
    // Drain the body so the timing includes full response transfer.
    await res.body().catch(() => {});
    return { status: res.status(), ok: res.ok(), latencyMs, url };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      latencyMs: Date.now() - start,
      url,
      error: String(err && err.message ? err.message : err),
    };
  }
}

/** Run `iterations` timed GETs with one token and summarize. */
async function runWithToken(request, endpoint, token, iterations) {
  const latencies = [];
  const statusCounts = {};
  let errorSample;
  for (let i = 0; i < iterations; i += 1) {
    const r = await timedGet(request, endpoint.path, token);
    latencies.push(r.latencyMs);
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    if (r.error && !errorSample) errorSample = r.error;
  }
  const codes = Object.keys(statusCounts).map(Number);
  return {
    latencies,
    statusCounts,
    errorSample,
    any2xx: codes.some((c) => c >= 200 && c < 300),
    any5xx: codes.some((c) => c >= 500),
    any4xx: codes.some((c) => c >= 400 && c < 500),
  };
}

/**
 * Benchmark a single endpoint. Tries each configured role in order; the first
 * role that returns a 2xx (or a 5xx, which is a real defect worth reporting)
 * becomes the recorded result. If every role only yields 4xx, the last attempt
 * is recorded and the endpoint is marked client4xx (not benchmarkable).
 */
async function benchmarkEndpoint(request, endpoint, iterations = ITERATIONS) {
  let chosen;
  let chosenRole;

  for (const { role, token } of ROLES) {
    const attempt = await runWithToken(request, endpoint, token, iterations);
    // Accept this role's result if it saw a 2xx or a 5xx server error.
    if (attempt.any2xx || attempt.any5xx) {
      chosen = attempt;
      chosenRole = role;
      break;
    }
    // Otherwise keep it as a fallback (4xx-only) and try the next role.
    chosen = attempt;
    chosenRole = role;
  }

  const stats = computeStats(chosen.latencies);
  return {
    path: endpoint.path,
    tag: endpoint.tag,
    summary: endpoint.summary,
    role: chosenRole,
    iterations,
    statusCounts: chosen.statusCounts,
    healthy: chosen.any2xx && !chosen.any5xx,
    server5xx: chosen.any5xx,
    client4xx: chosen.any4xx && !chosen.any2xx,
    errorSample: chosen.errorSample,
    ...stats,
    overThreshold: typeof stats.p95Ms === 'number' && stats.p95Ms > THRESHOLD_MS,
  };
}

module.exports = {
  API_BASE_URL,
  THRESHOLD_MS,
  ITERATIONS,
  ROLES,
  hasToken: () => ROLES.length > 0,
  bearer,
  timedGet,
  benchmarkEndpoint,
  writeArtifact,
};
