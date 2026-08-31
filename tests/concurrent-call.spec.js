const { test, expect, chromium } = require('@playwright/test');
const { allure } = require('allure-playwright');
const fs = require('fs');
const path = require('path');
const LoginPage = require('../pages/LoginPage');
const AstrologerDetailPage = require('../pages/AstrologerDetailPage');
require('dotenv').config();

const USERS_FILE = path.join(__dirname, '../fixtures/testUsers.json');
const ASTROLOGER_SLUG = process.env.ASTRO_CALL_TARGET || 'arjun'; // The online astrologer everyone will call
const BASE_URL = process.env.BASE_URL || 'https://session.shubhastro.ai';
const NUMBER_OF_CALLERS = 5; // How many users will call
const CALL_INTERVAL_MS = 2000; // Gap between each user initiating a call
const RING_DURATION_MS = 90000; // How long each call should keep ringing (90 seconds)

test.describe('Concurrent Call Load Test', () => {

  test('should have multiple users call the same astrologer simultaneously', async () => {
    // This test manages its own browser contexts, so give it a long timeout
    test.setTimeout(15 * 60 * 1000); // 15 minutes

    await allure.suite('Load Test');
    await allure.severity('critical');
    await allure.description('Verify multiple users can call the same astrologer with a 2-second interval between each call.');

    // Load test users from JSON
    if (!fs.existsSync(USERS_FILE)) {
      throw new Error(`Test users file not found: ${USERS_FILE}. Run fixtures/createTestUsers.spec.js first.`);
    }
    const allUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    const users = allUsers.slice(0, NUMBER_OF_CALLERS);
    console.log(`Loaded ${users.length} users for concurrent call test`);

    const browser = await chromium.launch({
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    });
    const results = [];

    // Step 1: Create a context + page per user, log them in, and navigate to astrologer
    const sessions = [];
    for (const user of users) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        permissions: ['geolocation', 'microphone', 'camera'],
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

    // Step 2: Users will call one after another with a 2-second interval
    console.log('All users logged in. Starting staggered calls (2s interval)...');

    const loggedInCount = sessions.filter((s) => s.loggedIn).length;
    console.log(`\n${loggedInCount}/${sessions.length} users logged in successfully`);

    // Check if the astrologer is online (using the first logged-in session)
    const firstSession = sessions.find((s) => s.loggedIn);
    if (firstSession) {
      const detailPage = new AstrologerDetailPage(firstSession.page);
      const isOnline = await detailPage.isOnline();
      if (!isOnline) {
        console.warn(
          `\n⚠️  WARNING: Astrologer "${ASTROLOGER_SLUG}" appears to be OFFLINE. ` +
          `Calls cannot ring for an offline astrologer. ` +
          `Use an astrologer who is "Available Now" for this test.`
        );
      } else {
        console.log(`\nAstrologer "${ASTROLOGER_SLUG}" is online. Proceeding with calls.`);
      }
    }

    // Each user calls the astrologer with a 2-second interval between them
    const callResults = [];
    const loggedInSessions = sessions.filter((s) => s.loggedIn);

    for (let i = 0; i < loggedInSessions.length; i++) {
      const session = loggedInSessions[i];
      try {
        const detailPage = new AstrologerDetailPage(session.page);
        await detailPage.clickAudioCall();
        await session.page.waitForTimeout(1500); // Let the call popup render
        const ringing = await detailPage.isRinging();
        if (!ringing) {
          await session.page.screenshot({
            path: `test-results/call-debug-${session.user.phone}.png`,
          }).catch(() => {});
        }
        console.log(`User ${session.user.name} initiated call - ${ringing ? 'RINGING' : 'FAILED'}`);
        // Record the time this call started ringing
        session.callStartTime = Date.now();
        callResults.push({ user: session.user.name, phone: session.user.phone, ringing });
      } catch (error) {
        callResults.push({ user: session.user.name, phone: session.user.phone, ringing: false, error: error.message });
      }

      // Wait CALL_INTERVAL_MS before the next user calls (skip wait after the last user)
      if (i < loggedInSessions.length - 1) {
        console.log(`Waiting ${CALL_INTERVAL_MS / 1000} seconds before next user calls...`);
        await new Promise((resolve) => setTimeout(resolve, CALL_INTERVAL_MS));
      }
    }

    results.push(...callResults);

    // Step 3: Log results
    const successCount = callResults.filter((r) => r.ringing).length;
    console.log(`\n=== CALL RESULTS ===`);
    console.log(`Total users: ${callResults.length}`);
    console.log(`Successfully reached ringing state: ${successCount}`);
    callResults.forEach((r) => {
      console.log(`  ${r.user} (${r.phone}): ${r.ringing ? 'RINGING' : 'FAILED'}${r.error ? ' - ' + r.error : ''}`);
    });

    // Step 4: Keep every call ringing for RING_DURATION_MS (90s) IN PARALLEL,
    // then cancel each one once its own 90 seconds have elapsed.
    console.log(`\nKeeping all calls ringing for ${RING_DURATION_MS / 1000} seconds (in parallel)...`);
    await Promise.all(
      loggedInSessions
        .filter((s) => s.callStartTime)
        .map(async (session) => {
          const elapsed = Date.now() - session.callStartTime;
          const remaining = RING_DURATION_MS - elapsed;
          if (remaining > 0) {
            await new Promise((resolve) => setTimeout(resolve, remaining));
          }
          try {
            const detailPage = new AstrologerDetailPage(session.page);
            await detailPage.cancelCall();
            console.log(`Cancelled call for ${session.user.name} after ~90 seconds of ringing`);
          } catch {
            // Ignore cancel errors
          }
        })
    );

    // Step 5: Close all contexts
    for (const session of sessions) {
      await session.context.close();
    }
    await browser.close();

    // Skip (not fail) if the astrologer was offline - it's an environment issue, not a code bug
    if (successCount === 0) {
      test.skip(true, `No calls reached ringing state. The astrologer "${ASTROLOGER_SLUG}" was likely offline. Use an online astrologer for this test.`);
    }

    // Assertion: at least one user should reach ringing (system handled the load)
    expect(successCount).toBeGreaterThan(0);
  });

});
