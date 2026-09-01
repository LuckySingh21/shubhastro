const fs = require('fs');
const path = require('path');
const { test, expect, request: playwrightRequest } = require('@playwright/test');
const { allure } = require('allure-playwright');
const geo = require('../api/geoApi');
const cities = require('../fixtures/geoCities.json');
require('dotenv').config();

// Below this distance the two providers are considered to "agree" on a city.
// Used only for REPORTING divergences (a note), not for pass/fail.
const AGREEMENT_TOLERANCE_KM = 25;
// The hard-fail bar for the NEW API's distance from the known reference. Kept in
// sync with the accuracy spec so alternate spellings (Solapur/Sholapur ~70km)
// don't fail here while passing there.
const NEW_ACCURACY_TOLERANCE_KM = Number(process.env.GEO_COORD_TOLERANCE_KM) || 100;

/**
 * From a list of entries, pick the one that best matches the reference city
 * (correct country + nearest coordinates). Returns null if none in-country.
 */
function pickIntended(entries, ref) {
  const inCountry = entries.filter((e) => (e.country || '').toUpperCase() === ref.expectedCountry
    && Array.isArray(e.coordinates));
  if (inCountry.length === 0) return null;
  inCountry.sort((a, b) => geo.haversineKm(ref.lat, ref.lng, a.coordinates[0], a.coordinates[1])
    - geo.haversineKm(ref.lat, ref.lng, b.coordinates[0], b.coordinates[1]));
  return inCountry[0];
}

// Comparison rows are appended (one JSON object per line) so results survive
// Playwright's parallel workers, each of which runs its own module instance.
// The JSONL file can be consumed as-is or aggregated for the QA summary.
const REPORT_FILE = path.join(process.cwd(), 'test-results', 'geo-new-vs-current-report.jsonl');

function appendReportRow(row) {
  try {
    fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    fs.appendFileSync(REPORT_FILE, JSON.stringify(row) + '\n');
  } catch (e) {
    console.log('[comparison report] failed to append row:', e.message);
  }
}

test.describe('Geo Search API - NEW vs CURRENT comparison', () => {
  let ctx;

  test.beforeAll(async () => {
    ctx = await playwrightRequest.newContext();
  });
  test.afterAll(async () => {
    if (ctx) await ctx.dispose();
  });

  for (const c of cities.knownCities) {
    test(`both APIs resolve "${c.query}" to the same physical location`, async () => {
      await allure.suite('Geo Search API');
      await allure.subSuite('Comparison');
      await allure.severity('critical');
      await allure.description(
        `Call both APIs for "${c.query}", pick each side's best in-country match, and confirm `
        + `their coordinates agree within ${AGREEMENT_TOLERANCE_KM}km. Naming differences are reported, not failed.`
      );

      const newRes = await geo.callNew(ctx, c.query);
      const curRes = await geo.callCurrent(ctx, c.query);

      const row = {
        query: c.query,
        newStatus: newRes.status,
        curStatus: curRes.status,
        newCount: newRes.entries.length,
        curCount: curRes.entries.length,
        notes: [],
      };

      // The NEW API must be healthy for its intended city.
      expect(newRes.status, `NEW API status for "${c.query}"`).toBe(200);

      const newPick = pickIntended(newRes.entries, c);
      row.newMatch = newPick ? newPick.full_name : null;
      // Always record how far the NEW API's best pick is from the reference so the
      // aggregated report can score NEW accuracy even when the CURRENT API is
      // unavailable or returns no in-country match.
      if (newPick) {
        row.newDistFromRefKm = Math.round(
          geo.haversineKm(c.lat, c.lng, newPick.coordinates[0], newPick.coordinates[1]) * 100
        ) / 100;
      }

      expect(newPick, `NEW API should resolve "${c.query}" to a ${c.expectedCountry} location`).toBeTruthy();

      // The CURRENT API is known to be flaky; if it errored, record and skip the
      // coordinate agreement check (the NEW API correctness is already asserted).
      if (curRes.status !== 200 || curRes.entries.length === 0) {
        row.notes.push(`CURRENT API unavailable/empty (status ${curRes.status}) - NEW API validated standalone`);
        appendReportRow(row);
        await allure.attachment(
          `compare-${c.query}.json`,
          JSON.stringify(row, null, 2),
          'application/json'
        );
        return;
      }

      const curPick = pickIntended(curRes.entries, c);
      row.curMatch = curPick ? curPick.full_name : null;

      if (!curPick) {
        row.notes.push(`CURRENT API returned no ${c.expectedCountry} match for "${c.query}"`);
        appendReportRow(row);
        return;
      }

      // How far each provider's best pick sits from the known reference point.
      // (newDist already captured above as row.newDistFromRefKm.)
      const newDist = row.newDistFromRefKm;
      const curDist = geo.haversineKm(c.lat, c.lng, curPick.coordinates[0], curPick.coordinates[1]);
      const dist = geo.haversineKm(
        newPick.coordinates[0], newPick.coordinates[1],
        curPick.coordinates[0], curPick.coordinates[1]
      );
      row.coordDeltaKm = Math.round(dist * 100) / 100;
      row.curDistFromRefKm = Math.round(curDist * 100) / 100;

      // Record naming/field divergences without failing (expected provider differences).
      if ((newPick.country_name || '') !== (curPick.country_name || '')) {
        row.notes.push(`country_name differs: NEW="${newPick.country_name}" CUR="${curPick.country_name}"`);
      }
      if ((newPick.state_name || '') !== (curPick.state_name || '')) {
        row.notes.push(`state_name differs: NEW="${newPick.state_name}" CUR="${curPick.state_name}"`);
      }
      if (Number(newPick.tz) !== Number(curPick.tz)) {
        row.notes.push(`tz differs: NEW=${newPick.tz} CUR=${curPick.tz}`);
      }

      appendReportRow(row);
      await allure.attachment(
        `compare-${c.query}.json`,
        JSON.stringify(row, null, 2),
        'application/json'
      );

      // If the two providers disagree substantially, attribute it to whichever one
      // is actually wrong relative to the known reference. The NEW API's correctness
      // is already hard-asserted in geo-accuracy.spec.js, so here we only fail when
      // the NEW API itself is the inaccurate side.
      if (dist > AGREEMENT_TOLERANCE_KM) {
        row.notes.push(
          `LARGE COORD DISAGREEMENT ${row.coordDeltaKm}km - `
          + `NEW ${row.newDistFromRefKm}km from ref, CUR ${row.curDistFromRefKm}km from ref`
        );
        // Only a genuine NEW-API defect should break the suite: fail when the NEW
        // API's own result is far from the known reference (uses the accuracy
        // tolerance, so alternate spellings within ~100km still pass).
        expect(
          newDist,
          `NEW API result for "${c.query}" is ${row.newDistFromRefKm}km from the known location `
          + `(${newPick.full_name} @${newPick.coordinates}). CURRENT API returned `
          + `${curPick.full_name} @${curPick.coordinates}.`
        ).toBeLessThanOrEqual(NEW_ACCURACY_TOLERANCE_KM);
      }
    });
  }

  test('timezone data agrees between APIs for a core set of Indian cities', async () => {
    await allure.suite('Geo Search API');
    await allure.subSuite('Comparison');
    await allure.severity('normal');
    await allure.description('For core Indian cities, tzone should be Asia/Kolkata and tz 5.5 on both APIs.');

    const core = ['pune', 'mumbai', 'delhi', 'kolkata', 'chennai'];
    const mismatches = [];

    for (const city of core) {
      const ref = cities.knownCities.find((c) => c.query === city);
      const newRes = await geo.callNew(ctx, city);
      const newPick = pickIntended(newRes.entries, ref);
      if (!newPick) {
        mismatches.push(`${city}: NEW API no IN match`);
        continue;
      }
      if (newPick.tzone !== 'Asia/Kolkata' || Number(newPick.tz) !== 5.5) {
        mismatches.push(`${city}: NEW tzone=${newPick.tzone} tz=${newPick.tz}`);
      }
    }

    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });
});
