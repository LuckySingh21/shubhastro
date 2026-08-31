const { test, expect, request: playwrightRequest } = require('@playwright/test');
const { allure } = require('allure-playwright');
const geo = require('../api/geoApi');
const cities = require('../fixtures/geoCities.json');

// How far the returned coordinates may be from the known reference point (km)
// before we consider the location wrong. Generous enough to absorb the fact that
// city-centre coordinates vary between gazetteers.
const COORD_TOLERANCE_KM = 60;

test.describe('Geo Search API - Accuracy & Schema (NEW API)', () => {
  let ctx;
  test.beforeAll(async () => {
    ctx = await playwrightRequest.newContext();
  });
  test.afterAll(async () => {
    if (ctx) await ctx.dispose();
  });

  test('response envelope has the expected shape', async () => {
    await allure.suite('Geo Search API');
    await allure.subSuite('Accuracy');
    await allure.severity('critical');
    await allure.description('Verify the top-level response envelope: status 200, response array, result_length matches.');

    const res = await geo.callNew(ctx, 'pune');
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
    expect(res.body.status).toBe(200);
    expect(Array.isArray(res.body.response)).toBe(true);
    expect(res.body.result_length).toBe(res.body.response.length);
  });

  // Schema validation across every known city.
  for (const c of cities.knownCities) {
    test(`every entry for "${c.query}" conforms to the geo schema`, async () => {
      await allure.suite('Geo Search API');
      await allure.subSuite('Accuracy');
      await allure.severity('critical');
      await allure.description(`Validate field presence and value sanity for all entries returned for "${c.query}".`);

      const res = await geo.callNew(ctx, c.query);
      expect(res.status, `HTTP status for "${c.query}"`).toBe(200);
      expect(res.entries.length, `"${c.query}" should return at least one match`).toBeGreaterThan(0);

      const allProblems = [];
      res.entries.forEach((entry, i) => {
        const problems = geo.validateGeoEntry(entry);
        if (problems.length) {
          allProblems.push(`entry[${i}] (${entry.full_name || 'unknown'}): ${problems.join('; ')}`);
        }
      });

      if (allProblems.length) {
        await allure.attachment(`schema-problems-${c.query}.txt`, allProblems.join('\n'), 'text/plain');
      }
      expect(allProblems, allProblems.join('\n')).toEqual([]);
    });
  }

  // Correctness: the intended city should be present and geographically correct.
  for (const c of cities.knownCities) {
    test(`"${c.query}" returns the correct city (name, country, coordinates)`, async () => {
      await allure.suite('Geo Search API');
      await allure.subSuite('Accuracy');
      await allure.severity('blocker');
      await allure.description(
        `Confirm the NEW API returns ${c.expectedName} (${c.expectedCountry}) among its results `
        + `with coordinates within ${COORD_TOLERANCE_KM}km of the reference point.`
      );

      const res = await geo.callNew(ctx, c.query);
      expect(res.status).toBe(200);

      // Find a matching entry: same country and coordinates near the reference.
      const match = res.entries.find((e) => {
        const sameCountry = (e.country || '').toUpperCase() === c.expectedCountry;
        if (!sameCountry || !Array.isArray(e.coordinates)) return false;
        const dist = geo.haversineKm(c.lat, c.lng, e.coordinates[0], e.coordinates[1]);
        return dist <= COORD_TOLERANCE_KM;
      });

      if (!match) {
        await allure.attachment(
          `accuracy-miss-${c.query}.json`,
          JSON.stringify(res.entries, null, 2),
          'application/json'
        );
      }

      expect(
        match,
        `Expected a ${c.expectedName} (${c.expectedCountry}) result near [${c.lat}, ${c.lng}] for "${c.query}"`
      ).toBeTruthy();

      // The correct city should rank highly for a usable UX. Some queries (e.g. "dubai")
      // legitimately return sub-localities (Dubai Marina) first, so we allow top-5 and
      // surface the exact rank in the report for QA review.
      const rank = res.entries.indexOf(match);
      await allure.attachment(
        `rank-${c.query}.txt`,
        `Matched "${match.full_name}" at rank ${rank} (0-indexed) of ${res.entries.length}`,
        'text/plain'
      );
      expect(rank, `${c.expectedName} should rank in the top 5 for "${c.query}" (got rank ${rank})`)
        .toBeLessThan(5);
    });
  }
});
