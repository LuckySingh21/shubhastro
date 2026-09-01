const fs = require('fs');
const path = require('path');
const { test, expect, request: playwrightRequest } = require('@playwright/test');
const { allure } = require('allure-playwright');
const api = require('../api/apiClient');
const endpointDoc = require('../fixtures/apiEndpoints.json');
require('dotenv').config();

// Each endpoint's benchmark result is appended (one JSON object per line) so
// results survive Playwright's parallel workers. utils/apiReport.js aggregates it.
const RESULT_FILE = path.join(process.cwd(), 'test-results', 'api-response-time.jsonl');

function appendResult(row) {
  try {
    fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true });
    fs.appendFileSync(RESULT_FILE, JSON.stringify(row) + '\n');
  } catch (e) {
    console.log('[api-response-time] failed to append:', e.message);
  }
}

const ENDPOINTS = endpointDoc.endpoints;

// Benchmarking N iterations per endpoint can take a while; give each test room.
test.describe.configure({ mode: 'parallel', timeout: 120000 });

test.describe('API Response Time - authenticated GET endpoints', () => {
  test.skip(!api.hasToken(), 'SWAGGER_BEARER_TOKEN not set in .env');

  for (const endpoint of ENDPOINTS) {
    test(`${endpoint.path}  [${endpoint.tag}]`, async () => {
      await allure.suite('API Response Time');
      await allure.subSuite(endpoint.tag);
      await allure.severity('normal');
      await allure.description(
        `Benchmarks GET ${endpoint.path} over ${api.ITERATIONS} requests. `
        + `Asserts the endpoint is healthy (2xx, no 5xx) and p95 stays under ${api.THRESHOLD_MS}ms.`
      );

      const ctx = await playwrightRequest.newContext();
      let result;
      try {
        result = await api.benchmarkEndpoint(ctx, endpoint);
      } finally {
        await ctx.dispose();
      }

      appendResult(result);
      await allure.attachment(
        `bench-${endpoint.path.replace(/[^a-z0-9]+/gi, '_')}.json`,
        JSON.stringify(result, null, 2),
        'application/json'
      );

      // Hard fail on server errors - these are genuine backend defects.
      expect(
        result.server5xx,
        `${endpoint.path} returned a 5xx server error (status counts: ${JSON.stringify(result.statusCounts)})`
      ).toBeFalsy();

      // A 4xx (with no 2xx) means the endpoint isn't callable with a bare CUSTOMER
      // token / without context params. That's not a response-time defect, so we
      // record it in the report and skip the perf assertion rather than failing.
      if (result.client4xx) {
        test.skip(true,
          `${endpoint.path} is not benchmarkable with this token (status counts: ${JSON.stringify(result.statusCounts)})`);
      }

      // For healthy endpoints, assert the p95 response time is under threshold.
      expect(
        result.p95Ms,
        `${endpoint.path} p95 ${result.p95Ms}ms exceeds ${api.THRESHOLD_MS}ms `
        + `(avg ${result.avgMs}ms, p99 ${result.p99Ms}ms, max ${result.maxMs}ms)`
      ).toBeLessThanOrEqual(api.THRESHOLD_MS);
    });
  }
});
