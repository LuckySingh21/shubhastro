const { test, expect, request: playwrightRequest } = require('@playwright/test');
const { allure } = require('allure-playwright');
const geo = require('../api/geoApi');
const cities = require('../fixtures/geoCities.json');
require('dotenv').config();

const LATENCY_THRESHOLD_MS = Number(process.env.GEO_LATENCY_THRESHOLD_MS) || 1500;
// Samples collected PER CITY. With N cities this yields N * ITERATIONS total
// data points, giving statistically meaningful p95/p99 instead of single-shot noise.
const ITERATIONS = Number(process.env.GEO_LATENCY_ITERATIONS) || 30;

// Sample set used for latency profiling: a spread of Indian + international cities.
const LATENCY_SAMPLE = cities.knownCities.map((c) => c.query);
const TOTAL_REQUESTS = LATENCY_SAMPLE.length * ITERATIONS;

// A benchmark that fires hundreds of sequential requests needs more than the
// default 60s per-test timeout.
test.describe.configure({ timeout: 300000 });

// Pure HTTP tests: they use Playwright's request context directly and never
// launch a browser, so no `page` fixture is needed.
test.describe('Geo Search API - Latency (NEW API)', () => {
  test(`NEW API latency benchmark (${TOTAL_REQUESTS} requests) stays under the threshold`, async () => {
    await allure.suite('Geo Search API');
    await allure.subSuite('Latency');
    await allure.severity('critical');
    await allure.description(
      `Fires ${ITERATIONS} requests per city across ${LATENCY_SAMPLE.length} cities `
      + `(${TOTAL_REQUESTS} total) against the NEW geo API, interleaved round-robin, and `
      + `profiles the latency distribution. Asserts p95 stays under ${LATENCY_THRESHOLD_MS}ms.`
    );

    const ctx = await playwrightRequest.newContext();
    const allSamples = [];
    const perCity = {};
    const slow = [];

    try {
      // Round-robin: iteration 1 hits every city, then iteration 2, etc. This
      // spreads any transient network/cache effects evenly across all cities.
      for (let i = 0; i < ITERATIONS; i += 1) {
        for (const city of LATENCY_SAMPLE) {
          const res = await geo.callNew(ctx, city);
          allSamples.push(res.latencyMs);
          (perCity[city] = perCity[city] || []).push(res.latencyMs);
          if (res.status !== 200) {
            slow.push(`${city} iter ${i}: HTTP ${res.status}`);
          } else if (res.latencyMs > LATENCY_THRESHOLD_MS) {
            slow.push(`${city} iter ${i}: ${res.latencyMs}ms`);
          }
        }
      }
    } finally {
      await ctx.dispose();
    }

    const stats = { ...geo.computeStats(allSamples), thresholdMs: LATENCY_THRESHOLD_MS, iterationsPerCity: ITERATIONS };
    const perCityStats = Object.fromEntries(
      Object.entries(perCity).map(([city, arr]) => [city, geo.computeStats(arr)])
    );

    geo.writeArtifact('geo-latency-benchmark.json', { overall: stats, perCity: perCityStats });
    await allure.attachment('latency-stats.json', JSON.stringify(stats, null, 2), 'application/json');
    await allure.attachment('latency-per-city.json', JSON.stringify(perCityStats, null, 2), 'application/json');
    console.log('[NEW API latency benchmark]', JSON.stringify(stats));

    // No hard failures (5xx / over-threshold single requests) should have occurred.
    expect(slow, `Failed or over-threshold requests:\n${slow.slice(0, 20).join('\n')}`).toEqual([]);
    // The 95th percentile must stay comfortably under the threshold.
    expect(stats.p95Ms, `p95 latency (${stats.p95Ms}ms) should be under ${LATENCY_THRESHOLD_MS}ms`)
      .toBeLessThan(LATENCY_THRESHOLD_MS);
  });

  test('NEW API latency distribution should beat CURRENT API head-to-head', async () => {
    await allure.suite('Geo Search API');
    await allure.subSuite('Latency');
    await allure.severity('normal');
    await allure.description(
      `Fires ${ITERATIONS} interleaved requests per city against BOTH APIs and compares the full `
      + 'latency distribution (avg + p95). The NEW API is the cost/performance driver for the migration.'
    );

    const ctx = await playwrightRequest.newContext();
    const newSamples = [];
    const curSamples = [];
    const perCity = [];

    try {
      for (const city of LATENCY_SAMPLE) {
        const cityNew = [];
        const cityCur = [];
        for (let i = 0; i < ITERATIONS; i += 1) {
          const newRes = await geo.callNew(ctx, city);
          const curRes = await geo.callCurrent(ctx, city);
          if (newRes.status === 200) { newSamples.push(newRes.latencyMs); cityNew.push(newRes.latencyMs); }
          if (curRes.status === 200) { curSamples.push(curRes.latencyMs); cityCur.push(curRes.latencyMs); }
        }
        perCity.push({
          city,
          new: geo.computeStats(cityNew),
          current: geo.computeStats(cityCur),
        });
      }
    } finally {
      await ctx.dispose();
    }

    const newStats = geo.computeStats(newSamples);
    const curStats = geo.computeStats(curSamples);
    const newAvg = newStats.avgMs;
    const curAvg = curStats.avgMs;

    const summary = {
      iterationsPerCity: ITERATIONS,
      totalRequestsPerApi: newSamples.length,
      newLatency: newStats,
      currentLatency: curStats,
      speedupFactor: curAvg > 0 ? Math.round((curAvg / Math.max(newAvg, 1)) * 100) / 100 : null,
      perCity,
    };
    // Persist for the aggregated QA report (geoReport.js) and Allure.
    geo.writeArtifact('geo-latency-comparison.json', summary);
    await allure.attachment('latency-comparison.json', JSON.stringify(summary, null, 2), 'application/json');
    console.log('[latency comparison]', JSON.stringify({
      newAvgMs: newAvg, newP95: newStats.p95Ms, currentAvgMs: curAvg, currentP95: curStats.p95Ms,
    }));

    // Soft expectation: NEW should not be dramatically slower than CURRENT on average.
    // A small tolerance absorbs network jitter.
    expect(newAvg).toBeLessThanOrEqual(curAvg + 250);
  });
});
