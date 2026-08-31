const { test, expect, request: playwrightRequest } = require('@playwright/test');
const { allure } = require('allure-playwright');
const geo = require('../api/geoApi');
const cities = require('../fixtures/geoCities.json');

test.describe('Geo Search API - Failure & Edge Cases (NEW API)', () => {
  let ctx;
  test.beforeAll(async () => {
    ctx = await playwrightRequest.newContext();
  });
  test.afterAll(async () => {
    if (ctx) await ctx.dispose();
  });

  // The API must never crash on odd input: it should respond 200 with a
  // well-formed (possibly empty) result set rather than a 5xx or malformed body.
  for (const ec of cities.edgeCases) {
    test(`handles ${ec.label} gracefully ("${ec.query}")`, async () => {
      await allure.suite('Geo Search API');
      await allure.subSuite('Failure Cases');
      await allure.severity('critical');
      await allure.description(`Send "${ec.query}" (${ec.label}) and confirm a graceful, well-formed response.`);

      const res = await geo.callNew(ctx, ec.query);

      // No server errors.
      expect(res.status, `status for ${ec.label}`).toBeLessThan(500);
      // Expect a JSON body we could parse.
      expect(res.error, `parse error for ${ec.label}: ${res.error}`).toBeFalsy();
      // response should be an array (empty is fine for nonsense input).
      expect(Array.isArray(res.entries), `response should be an array for ${ec.label}`).toBe(true);
      // result_length must be consistent with the array when present.
      if (res.resultLength !== undefined) {
        expect(res.resultLength).toBe(res.entries.length);
      }

      await allure.attachment(
        `edge-${ec.label}.json`,
        JSON.stringify({ status: res.status, resultLength: res.resultLength, entries: res.entries }, null, 2),
        'application/json'
      );
    });
  }

  test('gibberish input returns no matches (empty result set)', async () => {
    await allure.suite('Geo Search API');
    await allure.subSuite('Failure Cases');
    await allure.severity('normal');
    await allure.description('Nonsense query should return zero results, not spurious fuzzy matches.');

    const res = await geo.callNew(ctx, 'xyzqwvbn');
    expect(res.status).toBe(200);
    expect(res.entries.length, 'gibberish should yield no matches').toBe(0);
  });

  // Coverage gaps: small / less-common Indian towns the migration must still serve.
  for (const town of cities.smallTowns) {
    test(`provides geo data for small town "${town.query}"`, async () => {
      await allure.suite('Geo Search API');
      await allure.subSuite('Failure Cases');
      await allure.severity('normal');
      await allure.description(
        `Confirm the NEW API still returns a ${town.expectedCountry} result for the smaller town "${town.query}" `
        + '(catches coverage regressions vs the current provider).'
      );

      const res = await geo.callNew(ctx, town.query);
      expect(res.status).toBe(200);

      const hasCountryMatch = res.entries.some(
        (e) => (e.country || '').toUpperCase() === town.expectedCountry
      );

      if (!hasCountryMatch) {
        await allure.attachment(
          `smalltown-miss-${town.query}.json`,
          JSON.stringify(res.entries, null, 2),
          'application/json'
        );
      }

      // This is a known potential gap area, so we assert but the report will
      // surface any town the NEW API cannot resolve.
      expect(
        hasCountryMatch,
        `NEW API returned no ${town.expectedCountry} result for "${town.query}"`
      ).toBe(true);
    });
  }
});
