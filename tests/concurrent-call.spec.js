const { test, expect, chromium } = require('@playwright/test');
const { allure } = require('allure-playwright');
const fs = require('fs');
const path = require('path');
const LoginPage = require('../pages/LoginPage');
const AstrologerDetailPage = require('../pages/AstrologerDetailPage');
require('dotenv').config();

const USERS_FILE = path.join(__dirname, '../fixtures/testUsers.json');
const ASTROLOGER_SLUG = 'arjun'; // The astrologer everyone will call
const BASE_URL = process.env.BASE_URL || 'https://session.shubhastro.ai';

test.describe('Concurrent Call Load Test', () => {

  test('should have multiple users call the same astrologer simultaneously', async () => {
    // This test manages its own browser contexts, so give it a long timeout
    test.setTimeout(15 * 60 * 1000); // 15 minutes

    await allure.suite('Load Test');
    await allure.severity('critical');
    await allure.description('Verify multiple users can concurrently call the same astrologer. All users call after a 3 second delay.');

    // Load test users from JSON
    if (!fs.existsSync(USERS_FILE)) {
      throw new Error(`Test users file not found: ${USERS_FILE}. Run fixtures/createTestUsers.spec.js first.`);
    }
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    console.log(`Loaded ${users.length} users for concurrent call test`);

    const browser = await chromium.launch();
    const results = [];

    // Step 1: Create a context + page per user, log them in, and navigate to astrologer
    const sessions = [];
    for (const user of users) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        permissions: ['geolocation'],
        geolocation: { latitude: 19.0760, longitude: 72.8777 },
      });
      const page = await context.newPage();
      sessions.push({ user, context, page });
    }

    // Log in all users (sequentially to avoid OTP race, but could be parallelized)
    for (const session of sessions) {
      try {
        const loginPage = new LoginPage(session.page);
        await loginPage.loginWithPhone(session.user.phone, session.user.otp);

        // Navigate to the astrologer detail page
        const detailPage = new AstrologerDetailPage(session.page);
        await detailPage.navigate(ASTROLOGER_SLUG);
        session.loggedIn = true;
        console.log(`User ${session.user.name} logged in and on astrologer page`);
      } catch (error) {
        session.loggedIn = false;
        console.error(`Login failed for ${session.user.name}: ${error.message}`);
      }
    }

    // Step 2: Wait 3 seconds, then all users call simultaneously
    console.log('Waiting 3 seconds before all users call...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // All users click Audio Call in parallel
    const callPromises = sessions
      .filter((s) => s.loggedIn)
      .map(async (session) => {
        try {
          const detailPage = new AstrologerDetailPage(session.page);
          await detailPage.clickAudioCall();
          const ringing = await detailPage.isRinging();
          return { user: session.user.name, phone: session.user.phone, ringing };
        } catch (error) {
          return { user: session.user.name, phone: session.user.phone, ringing: false, error: error.message };
        }
      });

    const callResults = await Promise.all(callPromises);
    results.push(...callResults);

    // Step 3: Log results
    const successCount = callResults.filter((r) => r.ringing).length;
    console.log(`\n=== CONCURRENT CALL RESULTS ===`);
    console.log(`Total users: ${callResults.length}`);
    console.log(`Successfully reached ringing state: ${successCount}`);
    callResults.forEach((r) => {
      console.log(`  ${r.user} (${r.phone}): ${r.ringing ? 'RINGING' : 'FAILED'}${r.error ? ' - ' + r.error : ''}`);
    });

    // Step 4: Cancel all calls to clean up
    for (const session of sessions.filter((s) => s.loggedIn)) {
      try {
        const detailPage = new AstrologerDetailPage(session.page);
        await detailPage.cancelCall();
      } catch {
        // Ignore cancel errors
      }
    }

    // Step 5: Close all contexts
    for (const session of sessions) {
      await session.context.close();
    }
    await browser.close();

    // Assertion: at least one user should reach ringing (system handled the load)
    expect(successCount).toBeGreaterThan(0);
  });

});
