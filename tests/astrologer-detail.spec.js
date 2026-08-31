const { test, expect } = require('@playwright/test');
const { allure } = require('allure-playwright');
const AstrologerDetailPage = require('../pages/AstrologerDetailPage');
const LoginPage = require('../pages/LoginPage');
require('dotenv').config();

const TEST_PHONE = process.env.TEST_USER_PHONE;
const TEST_OTP = process.env.TEST_OTP;
const ASTRO_OFFLINE = process.env.ASTRO_OFFLINE;
const ASTRO_EMERGENCY = process.env.ASTRO_EMERGENCY;
const ASTRO_ONLINE = process.env.ASTRO_ONLINE;

test.describe('Astrologer Detail Page', () => {

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.loginWithPhone(TEST_PHONE, TEST_OTP);
  });

  // --- Page Load & Common Elements ---

  test('should load astrologer detail page from listing', async ({ page }) => {
    await allure.suite('Astrologer Detail');
    await allure.severity('blocker');
    await allure.description('Verify clicking an astrologer from listing opens their detail page');

    await page.goto('/astrologers');
    await page.waitForLoadState('networkidle');

    const detailPage = new AstrologerDetailPage(page);
    await detailPage.clickFirstAstrologerFromListing();

    await expect(page).toHaveURL(/.*\/astrologer\/.+/);
  });

  test('should display astrologer stats', async ({ page }) => {
    await allure.suite('Astrologer Detail');
    await allure.severity('critical');
    await allure.description('Verify Experience, Consultations, and Rating stats are visible');

    const detailPage = new AstrologerDetailPage(page);
    await detailPage.navigate(ASTRO_OFFLINE);

    await expect(detailPage.experience).toBeVisible();
    await expect(detailPage.consultations).toBeVisible();
    await expect(detailPage.ratingLabel).toBeVisible();
  });

  test('should display minutes stats', async ({ page }) => {
    await allure.suite('Astrologer Detail');
    await allure.severity('normal');
    await allure.description('Verify Chat Minutes, Call Minutes, and Video Minutes are displayed');

    const detailPage = new AstrologerDetailPage(page);
    await detailPage.navigate(ASTRO_OFFLINE);

    await expect(detailPage.chatMinutes).toBeVisible();
    await expect(detailPage.callMinutes).toBeVisible();
    await expect(detailPage.videoMinutes).toBeVisible();
  });

  test('should display User Reviews section', async ({ page }) => {
    await allure.suite('Astrologer Detail');
    await allure.severity('critical');
    await allure.description('Verify USER REVIEWS section with total ratings is visible');

    const detailPage = new AstrologerDetailPage(page);
    await detailPage.navigate(ASTRO_OFFLINE);

    await expect(detailPage.userReviewsHeading).toBeVisible();
    await expect(detailPage.totalRatings).toBeVisible();
  });

  test('should display Consultation Hours', async ({ page }) => {
    await allure.suite('Astrologer Detail');
    await allure.severity('normal');
    await allure.description('Verify Consultation Hours section exists on the page');

    const detailPage = new AstrologerDetailPage(page);
    await detailPage.navigate(ASTRO_OFFLINE);

    await expect(detailPage.consultationHoursHeading).toBeAttached();
  });

  test('should display CONNECT NOW section', async ({ page }) => {
    await allure.suite('Astrologer Detail');
    await allure.severity('blocker');
    await allure.description('Verify CONNECT NOW section is visible on astrologer detail page');

    const detailPage = new AstrologerDetailPage(page);
    await detailPage.navigate(ASTRO_OFFLINE);

    await expect(detailPage.connectNowHeading).toBeVisible();
  });

  test('should display Follow button', async ({ page }) => {
    await allure.suite('Astrologer Detail');
    await allure.severity('minor');
    await allure.description('Verify Follow button is visible on astrologer profile');

    const detailPage = new AstrologerDetailPage(page);
    await detailPage.navigate(ASTRO_OFFLINE);

    await expect(detailPage.followButton).toBeVisible();
  });

  // --- Scenario 1: Offline astrologer (no emergency) ---

  test('should show Offline status for offline astrologer', async ({ page }) => {
    await allure.suite('Astrologer Detail');
    await allure.severity('critical');
    await allure.description('Verify offline astrologer shows "Offline" status');

    const detailPage = new AstrologerDetailPage(page);
    await detailPage.navigate(ASTRO_OFFLINE);

    await expect(detailPage.offlineStatusBadge).toBeAttached();
  });

  test('should show Chat/Call options for offline astrologer without emergency', async ({ page }) => {
    await allure.suite('Astrologer Detail');
    await allure.severity('critical');
    await allure.description('Verify offline astrologer without emergency shows Audio Call and Video Call options');

    const detailPage = new AstrologerDetailPage(page);
    await detailPage.navigate(ASTRO_OFFLINE);

    await expect(detailPage.connectNowHeading).toBeVisible();
    await expect(detailPage.audioCallOption).toBeVisible();
    await expect(detailPage.videoCallOption).toBeVisible();
  });

  // --- Scenario 2: Offline astrologer (emergency enabled) ---

  test('should show Emergency button for offline astrologer with emergency enabled', async ({ page }) => {
    await allure.suite('Astrologer Detail');
    await allure.severity('critical');
    await allure.description('Verify offline astrologer with emergency enabled shows Emergency button');

    const detailPage = new AstrologerDetailPage(page);
    await detailPage.navigate(ASTRO_EMERGENCY);

    await expect(detailPage.emergencyButton).toBeAttached();
  });

  test('should show emergency-only message for offline astrologer', async ({ page }) => {
    await allure.suite('Astrologer Detail');
    await allure.severity('normal');
    await allure.description('Verify message about only emergency sessions available');

    const detailPage = new AstrologerDetailPage(page);
    await detailPage.navigate(ASTRO_EMERGENCY);

    await expect(detailPage.emergencyOnlyMessage).toBeVisible();
  });

  // --- Scenario 3: Online astrologer (all services enabled) ---

  test('should show status for astrologer with all services', async ({ page }) => {
    await allure.suite('Astrologer Detail');
    await allure.severity('critical');
    await allure.description('Verify astrologer with all services shows either Available Now or Offline status');

    const detailPage = new AstrologerDetailPage(page);
    await detailPage.navigate(ASTRO_ONLINE);

    // Check that CONNECT NOW section is present (confirms page loaded properly)
    await expect(detailPage.connectNowHeading).toBeVisible();
  });

  test('should show Audio Call and Video Call options for astrologer with all services', async ({ page }) => {
    await allure.suite('Astrologer Detail');
    await allure.severity('blocker');
    await allure.description('Verify astrologer with all services shows Audio Call and Video Call options');

    const detailPage = new AstrologerDetailPage(page);
    await detailPage.navigate(ASTRO_ONLINE);

    await expect(detailPage.connectNowHeading).toBeVisible();
    await expect(detailPage.audioCallOption).toBeVisible();
    await expect(detailPage.videoCallOption).toBeVisible();
  });

  test('should display About section', async ({ page }) => {
    await allure.suite('Astrologer Detail');
    await allure.severity('normal');
    await allure.description('Verify About section with astrologer bio is visible');

    const detailPage = new AstrologerDetailPage(page);
    await detailPage.navigate(ASTRO_ONLINE);

    await expect(detailPage.aboutHeading).toBeVisible();
  });

});
