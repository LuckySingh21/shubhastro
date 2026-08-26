const { test, expect } = require('@playwright/test');
const { allure } = require('allure-playwright');
const LoginPage = require('../pages/LoginPage');
const db = require('../utils/db');
require('dotenv').config();

const TEST_PHONE = process.env.TEST_USER_PHONE;
const TEST_OTP = process.env.TEST_OTP;

test.describe('Login Flow', () => {

  test.afterAll(async () => {
    await db.close();
  });

  // --- Positive Test Cases ---

  test('should navigate to login page when clicking Sign In', async ({ page }) => {
    await allure.suite('Login');
    await allure.severity('critical');
    await allure.description('Verify that clicking Sign In redirects to the login page with phone input visible');

    const loginPage = new LoginPage(page);
    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();

    await expect(page).toHaveURL(/.*\/login/);
    await expect(loginPage.mobileInput).toBeVisible();
    await expect(loginPage.claimButton).toBeVisible();
  });

  test('should show OTP screen after entering valid mobile number', async ({ page }) => {
    await allure.suite('Login');
    await allure.severity('critical');
    await allure.description('Verify that OTP screen appears after entering a valid mobile number');

    const loginPage = new LoginPage(page);
    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();
    await loginPage.enterMobileNumber(TEST_PHONE);
    await loginPage.clickClaimButton();

    await loginPage.waitForOTPScreen();
    await expect(loginPage.otpHeading).toBeVisible();
    await expect(loginPage.otpInputs.first()).toBeVisible();
  });

  test('should login successfully with valid OTP', async ({ page }) => {
    await allure.suite('Login');
    await allure.severity('blocker');
    await allure.description('Verify full login flow: phone number → OTP → redirected to dashboard. Also verify user is verified in DB.');

    const loginPage = new LoginPage(page);
    await loginPage.loginWithPhone(TEST_PHONE, TEST_OTP);

    // UI verification
    const isLoggedIn = await loginPage.isLoggedIn();
    expect(isLoggedIn).toBeTruthy();

    // DB verification
    const user = await db.findUserByPhone(TEST_PHONE);
    expect(user).not.toBeNull();
    expect(user.isVerified).toBe(true);
    expect(user.phoneNumber).toBe(`91${TEST_PHONE}`);
  });

  test('should verify login history updated in DB after login', async ({ page }) => {
    await allure.suite('Login');
    await allure.severity('normal');
    await allure.description('Verify that loginHistory array in DB has a recent entry after successful login');

    const loginPage = new LoginPage(page);
    await loginPage.loginWithPhone(TEST_PHONE, TEST_OTP);

    // DB verification - check loginHistory has recent entry
    const user = await db.findUserByPhone(TEST_PHONE);
    expect(user.loginHistory).toBeDefined();
    expect(user.loginHistory.length).toBeGreaterThan(0);

    // Check the last login was within the last 5 minutes
    const lastLogin = user.loginHistory[user.loginHistory.length - 1];
    const lastLoginTime = new Date(lastLogin.lastLoginAt).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    expect(now - lastLoginTime).toBeLessThan(fiveMinutes);
  });

  test('should show skip option on login page', async ({ page }) => {
    await allure.suite('Login');
    await allure.severity('minor');
    await allure.description('Verify that the skip button is visible on the login page');

    const loginPage = new LoginPage(page);
    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();

    await expect(loginPage.skipButton).toBeVisible();
  });

  // --- Negative Test Cases ---

  test('should show error for empty mobile number', async ({ page }) => {
    await allure.suite('Login');
    await allure.severity('critical');
    await allure.description('Verify error toast appears when clicking Claim with empty phone number');

    const loginPage = new LoginPage(page);
    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();

    // Force click since button is aria-disabled when input is empty
    await loginPage.claimButton.click({ force: true });

    const errorToast = page.locator('text=Enter your 10-digit mobile number to claim the bonus');
    await expect(errorToast).toBeVisible();
  });

  test('should show error for less than 10 digits', async ({ page }) => {
    await allure.suite('Login');
    await allure.severity('critical');
    await allure.description('Verify error toast appears when entering less than 10 digits');

    const loginPage = new LoginPage(page);
    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();
    await loginPage.enterMobileNumber('23131');

    // Force click since button is aria-disabled when input has < 10 digits
    await loginPage.claimButton.click({ force: true });

    const errorToast = page.locator('text=/Please enter all 10 digits/');
    await expect(errorToast).toBeVisible();
  });

  test('should not accept letters in mobile number field', async ({ page }) => {
    await allure.suite('Login');
    await allure.severity('normal');
    await allure.description('Verify that mobile number input blocks letters and special characters');

    const loginPage = new LoginPage(page);
    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();
    await loginPage.enterMobileNumber('abcde@#$%');

    // Input should be empty since letters/special chars are blocked
    const inputValue = await loginPage.mobileInput.inputValue();
    expect(inputValue).toBe('');
  });

  test('should not navigate away on wrong OTP', async ({ page }) => {
    await allure.suite('Login');
    await allure.severity('critical');
    await allure.description('Verify user stays on login page and OTP fields reset on entering incorrect OTP');

    const loginPage = new LoginPage(page);
    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();
    await loginPage.enterMobileNumber(TEST_PHONE);
    await loginPage.clickClaimButton();
    await loginPage.waitForOTPScreen();

    await loginPage.enterOTP('999999');

    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/.*\/login/);
  });

});
