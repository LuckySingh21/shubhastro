// Geo Search API client
// Thin wrapper around Playwright's APIRequestContext for the two geo-search endpoints:
//   - NEW: candidate API (devapi-shubhtalk.epicon.in) that we want to validate for prod
//   - CURRENT: the existing Vedic Astro upstream that we intend to replace
//
// Each call returns a normalized result object with timing, status, parsed body and
// the list of geo entries so specs stay declarative.

require('dotenv').config();

const NEW_API_URL = process.env.GEO_NEW_API_URL
  || 'https://devapi-shubhtalk.epicon.in/api/geo/search';
const CURRENT_API_URL = process.env.GEO_CURRENT_API_URL
  || 'http://njsapi.shubhastro.ai:80/api/astro/v3-json/utilities/geo-search-advanced';

// Fields every geo entry is expected to expose.
const GEO_ENTRY_FIELDS = [
  'name',
  'alternate_name',
  'country',
  'country_name',
  'full_name',
  'coordinates',
  'tz',
  'tz_dst',
  'current_dst',
  'tzone',
  'state_name',
];

/**
 * Perform a single geo-search request against the given base URL.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} baseUrl - endpoint to hit
 * @param {string} city - value for the `city` query param (may be empty/odd on purpose)
 * @returns {Promise<{
 *   ok: boolean, status: number, latencyMs: number, url: string,
 *   body: any, entries: any[], resultLength: number|undefined, error?: string
 * }>}
 */
async function callGeo(request, baseUrl, city) {
  const url = `${baseUrl}?city=${encodeURIComponent(city)}`;
  const start = Date.now();
  let response;
  let latencyMs;
  try {
    response = await request.get(url, {
      // Follow the CloudFront 301 the current API issues on :80
      maxRedirects: 5,
      timeout: 30000,
    });
  } catch (err) {
    latencyMs = Date.now() - start;
    return {
      ok: false,
      status: 0,
      latencyMs,
      url,
      body: null,
      entries: [],
      resultLength: undefined,
      error: String(err && err.message ? err.message : err),
    };
  }
  latencyMs = Date.now() - start;

  const status = response.status();
  let body = null;
  let error;
  try {
    body = await response.json();
  } catch (e) {
    // Non-JSON body (e.g. HTML error page). Capture text for diagnostics.
    try {
      body = await response.text();
    } catch (_) {
      body = null;
    }
    error = 'Response was not valid JSON';
  }

  const entries = Array.isArray(body && body.response) ? body.response : [];
  const resultLength = body && typeof body === 'object' ? body.result_length : undefined;

  return {
    ok: response.ok(),
    status,
    latencyMs,
    url,
    body,
    entries,
    resultLength,
    error,
  };
}

/** Call the NEW (candidate) geo API. */
function callNew(request, city) {
  return callGeo(request, NEW_API_URL, city);
}

/** Call the CURRENT (legacy) geo API. */
function callCurrent(request, city) {
  return callGeo(request, CURRENT_API_URL, city);
}

/**
 * Validate that a single geo entry has the expected shape.
 * Returns an array of human-readable problems (empty === valid).
 */
function validateGeoEntry(entry) {
  const problems = [];
  if (entry === null || typeof entry !== 'object') {
    return ['entry is not an object'];
  }

  for (const field of GEO_ENTRY_FIELDS) {
    if (!(field in entry)) {
      problems.push(`missing field: ${field}`);
    }
  }

  // coordinates should be a [lat, lng] pair parseable to sensible numbers
  if (Array.isArray(entry.coordinates)) {
    if (entry.coordinates.length !== 2) {
      problems.push(`coordinates should have 2 elements, got ${entry.coordinates.length}`);
    } else {
      const lat = Number(entry.coordinates[0]);
      const lng = Number(entry.coordinates[1]);
      if (Number.isNaN(lat) || lat < -90 || lat > 90) {
        problems.push(`latitude out of range: ${entry.coordinates[0]}`);
      }
      if (Number.isNaN(lng) || lng < -180 || lng > 180) {
        problems.push(`longitude out of range: ${entry.coordinates[1]}`);
      }
    }
  } else if ('coordinates' in entry) {
    problems.push('coordinates is not an array');
  }

  // timezone offset sanity
  if ('tz' in entry) {
    const tz = Number(entry.tz);
    if (Number.isNaN(tz) || tz < -12 || tz > 14) {
      problems.push(`tz offset out of range: ${entry.tz}`);
    }
  }

  if ('tzone' in entry && (typeof entry.tzone !== 'string' || entry.tzone.length === 0)) {
    problems.push('tzone missing or not a string');
  }

  if ('country' in entry && (typeof entry.country !== 'string' || entry.country.length !== 2)) {
    problems.push(`country is not a 2-letter code: ${entry.country}`);
  }

  return problems;
}

/**
 * Normalize a geo entry for cross-API comparison. Country/state naming and casing
 * differ between the two providers, so we compare on stable, location-defining fields.
 */
function normalizeForComparison(entry) {
  if (!entry) return null;
  const lat = Array.isArray(entry.coordinates) ? Number(entry.coordinates[0]) : NaN;
  const lng = Array.isArray(entry.coordinates) ? Number(entry.coordinates[1]) : NaN;
  return {
    name: (entry.name || '').trim().toLowerCase(),
    country: (entry.country || '').trim().toUpperCase(),
    lat,
    lng,
    tzone: (entry.tzone || '').trim(),
  };
}

/** Great-circle distance in kilometres between two [lat,lng] pairs. */
function haversineKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => Number.isNaN(Number(v)))) return Infinity;
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const fs = require('fs');
const path = require('path');

/** Percentile of an already-sorted ascending array. */
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

/** Summary statistics (min/max/avg/stdev/p50/p90/p95/p99) for a list of numbers. */
function computeStats(values) {
  const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (!nums.length) return { count: 0 };
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const variance = sorted.reduce((a, b) => a + (b - avg) ** 2, 0) / sorted.length;
  return {
    count: sorted.length,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    avgMs: Math.round(avg),
    stdevMs: Math.round(Math.sqrt(variance)),
    p50Ms: percentile(sorted, 50),
    p90Ms: percentile(sorted, 90),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
  };
}

/** Directory where cross-spec report artifacts are written. */
const REPORT_DIR = path.join(process.cwd(), 'test-results');

/** Write a JSON artifact into the report directory (creates the dir if needed). */
function writeArtifact(fileName, data) {
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, fileName), JSON.stringify(data, null, 2));
  } catch (e) {
    // Non-fatal: reporting must never break a test run.
    // eslint-disable-next-line no-console
    console.log(`[geoApi] failed to write ${fileName}:`, e.message);
  }
}

module.exports = {
  NEW_API_URL,
  CURRENT_API_URL,
  GEO_ENTRY_FIELDS,
  REPORT_DIR,
  callGeo,
  callNew,
  callCurrent,
  validateGeoEntry,
  normalizeForComparison,
  haversineKm,
  percentile,
  computeStats,
  writeArtifact,
};
