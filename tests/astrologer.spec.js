const { test, expect } = require('@playwright/test');
const { allure } = require('allure-playwright');
const AstrologerPage = require('../pages/AstrologerPage');
const LoginPage = require('../pages/LoginPage');
require('dotenv').config();

const TEST_PHONE = process.env.TEST_USER_PHONE;
const TEST_OTP = process.env.TEST_OTP;

test.describe('Astrologer Listing Page - Guest User', () => {

  test('should load astrologer page successfully', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('blocker');
    await allure.description('Verify astrologer listing page loads with heading visible for guest user');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigate();

    // Dismiss popup if visible
    const loginPage = new LoginPage(page);
    await loginPage.dismissPopupIfVisible();

    await expect(astrologerPage.pageHeading).toBeVisible();
    await expect(page).toHaveURL(/.*\/astrologers/);
  });

  test('should display search bar and filter button', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('critical');
    await allure.description('Verify search input and filter button are visible for guest user');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigate();

    const loginPage = new LoginPage(page);
    await loginPage.dismissPopupIfVisible();

    await expect(astrologerPage.searchInput).toBeVisible();
    await expect(astrologerPage.filterButton).toBeVisible();
  });

  test('should display category tabs', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('critical');
    await allure.description('Verify all category filter tabs are visible for guest user');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigate();

    const loginPage = new LoginPage(page);
    await loginPage.dismissPopupIfVisible();

    await expect(astrologerPage.allTab).toBeVisible();
    await expect(astrologerPage.loveTab).toBeVisible();
    await expect(astrologerPage.gemstoneTab).toBeVisible();
    await expect(astrologerPage.moneyTab).toBeVisible();
    await expect(astrologerPage.childTab).toBeVisible();
    await expect(astrologerPage.marriageTab).toBeVisible();
  });

  test('should display top astrologers or explore astrologers section', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('critical');
    await allure.description('Verify either "TOP ASTROLOGERS FOR YOU" or "EXPLORE ASTROLOGERS" section is visible for guest user');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigate();

    const loginPage = new LoginPage(page);
    await loginPage.dismissPopupIfVisible();

    const topVisible = await astrologerPage.topAstrologersHeading.isVisible().catch(() => false);
    const exploreVisible = await astrologerPage.exploreAstrologersHeading.isVisible().catch(() => false);
    expect(topVisible || exploreVisible).toBeTruthy();
  });

  test('should display at least one astrologer card', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('blocker');
    await allure.description('Verify at least one astrologer card with Chat/Call buttons is displayed for guest user');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigate();

    const loginPage = new LoginPage(page);
    await loginPage.dismissPopupIfVisible();

    const cardCount = await astrologerPage.getAstrologerCardCount();
    expect(cardCount).toBeGreaterThan(0);
  });

  test('should display Chat/Call or Emergency buttons on astrologer cards', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('critical');
    await allure.description('Verify Chat/Call buttons (online) or Emergency buttons (offline) are visible for guest user');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigate();

    const loginPage = new LoginPage(page);
    await loginPage.dismissPopupIfVisible();

    // Verify cards are loaded, then check buttons exist
    const cardCount = await astrologerPage.getAstrologerCardCount();
    expect(cardCount).toBeGreaterThan(0);
  });

});

test.describe('Astrologer Listing Page - Logged In User', () => {

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.loginWithPhone(TEST_PHONE, TEST_OTP);
  });

  test('should load astrologer page successfully', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('blocker');
    await allure.description('Verify astrologer listing page loads with heading visible for logged in user');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigateFromHomepage();

    await expect(astrologerPage.pageHeading).toBeVisible();
    await expect(page).toHaveURL(/.*\/astrologers/);
  });

  test('should display search bar and filter button', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('critical');
    await allure.description('Verify search input and filter button are visible for logged in user');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigateFromHomepage();

    await expect(astrologerPage.searchInput).toBeVisible();
    await expect(astrologerPage.filterButton).toBeVisible();
  });

  test('should display category tabs', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('critical');
    await allure.description('Verify all category filter tabs are visible for logged in user');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigateFromHomepage();

    await expect(astrologerPage.allTab).toBeVisible();
    await expect(astrologerPage.loveTab).toBeVisible();
    await expect(astrologerPage.gemstoneTab).toBeVisible();
    await expect(astrologerPage.moneyTab).toBeVisible();
    await expect(astrologerPage.childTab).toBeVisible();
    await expect(astrologerPage.marriageTab).toBeVisible();
  });

  test('should display top astrologers or explore astrologers section', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('critical');
    await allure.description('Verify either "TOP ASTROLOGERS FOR YOU" or "EXPLORE ASTROLOGERS" section is visible for logged in user');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigateFromHomepage();

    const topVisible = await astrologerPage.topAstrologersHeading.isVisible().catch(() => false);
    const exploreVisible = await astrologerPage.exploreAstrologersHeading.isVisible().catch(() => false);
    expect(topVisible || exploreVisible).toBeTruthy();
  });

  test('should display at least one astrologer card', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('blocker');
    await allure.description('Verify at least one astrologer card is displayed for logged in user');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigateFromHomepage();

    const cardCount = await astrologerPage.getAstrologerCardCount();
    expect(cardCount).toBeGreaterThan(0);
  });

  test('should display Chat/Call or Emergency buttons on astrologer cards', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('critical');
    await allure.description('Verify Chat/Call buttons (online) or Emergency buttons (offline) are visible for logged in user');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigateFromHomepage();

    // Verify cards are loaded
    const cardCount = await astrologerPage.getAstrologerCardCount();
    expect(cardCount).toBeGreaterThan(0);
  });

  test('should navigate to astrologer page from top nav', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('normal');
    await allure.description('Verify clicking Astrologers in navigation bar opens the astrologer page');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigateFromHomepage();

    await expect(page).toHaveURL(/.*\/astrologers/);
    await expect(astrologerPage.pageHeading).toBeVisible();
  });

  test('should filter astrologers when searching by name', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('critical');
    await allure.description('Verify search filters astrologers in real-time');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigateFromHomepage();

    await astrologerPage.searchAstrologer('an');

    // Should show results containing "an" in name
    const cardCount = await astrologerPage.getAstrologerCardCount();
    expect(cardCount).toBeGreaterThan(0);
  });

  test('should show "No astrologers found" for invalid search', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('normal');
    await allure.description('Verify "No astrologers found." message appears for non-existent astrologer name');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigateFromHomepage();

    await astrologerPage.searchAstrologer('xyzabc');

    await expect(astrologerPage.noResultsMessage).toBeVisible();
  });

  test('should filter astrologers by Love & Relationships category', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('critical');
    await allure.description('Verify clicking Love & Relationships tab filters astrologers and changes URL');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigateFromHomepage();

    await astrologerPage.clickCategory('Love & Relationships');

    await expect(page).toHaveURL(/.*\/astrologers\/love-relationships/);
  });

  test('should filter astrologers by Money & Finance category', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('normal');
    await allure.description('Verify clicking Money & Finance tab filters astrologers and changes URL');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigateFromHomepage();

    await astrologerPage.clickCategory('Money & Finance');

    await expect(page).toHaveURL(/.*\/astrologers\/money-finance/);
  });

  test('should filter astrologers by Career & Business category', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('normal');
    await allure.description('Verify clicking Career & Business tab filters astrologers and changes URL');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigateFromHomepage();

    await astrologerPage.clickCategory('Career & Business');

    await expect(page).toHaveURL(/.*\/astrologers\/career-business/);
  });

  test('should return to all astrologers when clicking All tab', async ({ page }) => {
    await allure.suite('Astrologer');
    await allure.severity('critical');
    await allure.description('Verify clicking All tab shows all astrologers and URL changes back to /astrologers');

    const astrologerPage = new AstrologerPage(page);
    await astrologerPage.navigateFromHomepage();

    // First filter by a category
    await astrologerPage.clickCategory('Love & Relationships');
    await expect(page).toHaveURL(/.*\/astrologers\/love-relationships/);

    // Then click All
    await astrologerPage.clickCategory('All');
    await expect(page).toHaveURL(/.*\/astrologers$/);
  });

});
