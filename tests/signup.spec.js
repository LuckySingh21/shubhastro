const { test, expect } = require('@playwright/test');
const { allure } = require('allure-playwright');
const LoginPage = require('../pages/LoginPage');
const SignupPage = require('../pages/SignupPage');
const db = require('../utils/db');
const { generateRandomPhone, generateRandomName, generateRandomEmail } = require('../utils/helpers');
require('dotenv').config();

const TEST_OTP = process.env.TEST_OTP;

test.describe('Signup Flow', () => {

  test.afterAll(async () => {
    await db.close();
  });

  test('should show step 1 form after new user enters OTP', async ({ page }) => {
    await allure.suite('Signup');
    await allure.severity('critical');
    await allure.description('Verify that a new user is shown the personalization form after OTP verification');

    const loginPage = new LoginPage(page);
    const signupPage = new SignupPage(page);
    const phone = generateRandomPhone();

    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();
    await loginPage.enterMobileNumber(phone);
    await loginPage.clickClaimButton();
    await loginPage.waitForOTPScreen();
    await loginPage.enterOTP(TEST_OTP);

    // New user should see step 1 of signup
    await signupPage.waitForStep1();
    await expect(signupPage.step1Heading).toBeVisible();
    await expect(signupPage.nameInput).toBeVisible();
    await expect(signupPage.emailInput).toBeVisible();
    await expect(signupPage.maleOption).toBeVisible();
    await expect(signupPage.femaleOption).toBeVisible();
    await expect(signupPage.othersOption).toBeVisible();
  });

  test('should navigate to step 2 after completing step 1', async ({ page }) => {
    await allure.suite('Signup');
    await allure.severity('critical');
    await allure.description('Verify that user moves to birth details step after filling name, email, and gender');

    const loginPage = new LoginPage(page);
    const signupPage = new SignupPage(page);
    const phone = generateRandomPhone();
    const name = generateRandomName();

    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();
    await loginPage.enterMobileNumber(phone);
    await loginPage.clickClaimButton();
    await loginPage.waitForOTPScreen();
    await loginPage.enterOTP(TEST_OTP);

    // Complete step 1
    await signupPage.completeStep1(name, generateRandomEmail(name), 'male');

    // Should see step 2
    await signupPage.waitForStep2();
    await expect(signupPage.step2Heading).toBeVisible();
    await expect(signupPage.dobInput).toBeVisible();
    await expect(signupPage.birthTimeInput).toBeVisible();
    await expect(signupPage.placeOfBirthInput).toBeVisible();
  });

  test('should complete full signup and verify in DB', async ({ page }) => {
    await allure.suite('Signup');
    await allure.severity('blocker');
    await allure.description('Verify complete signup flow and confirm user data is correctly saved in MongoDB');

    const loginPage = new LoginPage(page);
    const signupPage = new SignupPage(page);
    const phone = generateRandomPhone();
    const name = generateRandomName();
    const email = generateRandomEmail(name);

    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();
    await loginPage.enterMobileNumber(phone);
    await loginPage.clickClaimButton();
    await loginPage.waitForOTPScreen();
    await loginPage.enterOTP(TEST_OTP);

    // Complete full signup
    await signupPage.completeSignup({
      name: name,
      email: email,
      gender: 'male',
      dob: '21121996',
      birthTime: '1123A',
      placeOfBirth: 'mumbai',
      interests: ['Tarot', 'Vedic Astrology'],
    });

    // UI verification
    const helloText = await page.locator('text=Hello,').first().textContent();
    expect(helloText).not.toContain('Guest');

    // DB verification
    const user = await db.findUserByPhone(phone);
    expect(user).not.toBeNull();
    expect(user.isRegister).toBe(true);
    expect(user.isVerified).toBe(true);
    expect(user.gender).toBe('male');
    expect(user.phoneNumber).toBe(`91${phone}`);

    // Verify ₹99 signup bonus credited to wallet
    const wallet = await db.getUserWalletByUserId(user._id);
    expect(wallet).not.toBeNull();
    expect(wallet.amount).toBeGreaterThanOrEqual(99);
    expect(wallet.lifetime_credit).toBeGreaterThanOrEqual(99);
  });

  test('should complete signup with female gender and verify in DB', async ({ page }) => {
    await allure.suite('Signup');
    await allure.severity('normal');
    await allure.description('Verify signup works with female gender and data is correctly stored in DB');

    const loginPage = new LoginPage(page);
    const signupPage = new SignupPage(page);
    const phone = generateRandomPhone();
    const name = generateRandomName();

    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();
    await loginPage.enterMobileNumber(phone);
    await loginPage.clickClaimButton();
    await loginPage.waitForOTPScreen();
    await loginPage.enterOTP(TEST_OTP);

    await signupPage.completeSignup({
      name: name,
      email: generateRandomEmail(name),
      gender: 'female',
      dob: '15061990',
      birthTime: '0930P',
      placeOfBirth: 'delhi',
      interests: ['Numerology', 'Palmistry'],
    });

    // UI verification
    const helloText = await page.locator('text=Hello,').first().textContent();
    expect(helloText).not.toContain('Guest');

    // DB verification
    const user = await db.findUserByPhone(phone);
    expect(user).not.toBeNull();
    expect(user.gender).toBe('female');
  });

  test('should complete signup without birth time and verify in DB', async ({ page }) => {
    await allure.suite('Signup');
    await allure.severity('normal');
    await allure.description('Verify signup works without birth time and data is correctly stored in DB');

    const loginPage = new LoginPage(page);
    const signupPage = new SignupPage(page);
    const phone = generateRandomPhone();
    const name = generateRandomName();

    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();
    await loginPage.enterMobileNumber(phone);
    await loginPage.clickClaimButton();
    await loginPage.waitForOTPScreen();
    await loginPage.enterOTP(TEST_OTP);

    await signupPage.completeSignup({
      name: name,
      email: null,
      gender: 'others',
      dob: '01011985',
      birthTime: null,
      placeOfBirth: 'pune',
      interests: [],
    });

    // UI verification
    const helloText = await page.locator('text=Hello,').first().textContent();
    expect(helloText).not.toContain('Guest');

    // DB verification
    const user = await db.findUserByPhone(phone);
    expect(user).not.toBeNull();
    expect(user.isRegister).toBe(true);
  });

  // --- Negative Test Cases ---

  test('should show error for empty name on step 1', async ({ page }) => {
    await allure.suite('Signup');
    await allure.severity('critical');
    await allure.description('Verify error toast when name is empty and Next is clicked');

    const loginPage = new LoginPage(page);
    const signupPage = new SignupPage(page);
    const phone = generateRandomPhone();

    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();
    await loginPage.enterMobileNumber(phone);
    await loginPage.clickClaimButton();
    await loginPage.waitForOTPScreen();
    await loginPage.enterOTP(TEST_OTP);

    await signupPage.waitForStep1();
    // Click Next without entering name
    await signupPage.nextButton.click({ force: true });

    const errorToast = page.locator('text=Please enter your name');
    await expect(errorToast).toBeVisible();
  });

  test('should show error for name less than 3 characters', async ({ page }) => {
    await allure.suite('Signup');
    await allure.severity('critical');
    await allure.description('Verify error toast when name has less than 3 characters');

    const loginPage = new LoginPage(page);
    const signupPage = new SignupPage(page);
    const phone = generateRandomPhone();

    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();
    await loginPage.enterMobileNumber(phone);
    await loginPage.clickClaimButton();
    await loginPage.waitForOTPScreen();
    await loginPage.enterOTP(TEST_OTP);

    await signupPage.waitForStep1();
    await signupPage.enterName('ab');
    await signupPage.nextButton.click({ force: true });

    const errorToast = page.locator('[role="status"]').filter({ hasText: 'Name must be at least 3 characters' });
    await expect(errorToast).toBeVisible();
  });

  test('should show error for name with numbers', async ({ page }) => {
    await allure.suite('Signup');
    await allure.severity('normal');
    await allure.description('Verify error toast when name contains numbers or special characters');

    const loginPage = new LoginPage(page);
    const signupPage = new SignupPage(page);
    const phone = generateRandomPhone();

    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();
    await loginPage.enterMobileNumber(phone);
    await loginPage.clickClaimButton();
    await loginPage.waitForOTPScreen();
    await loginPage.enterOTP(TEST_OTP);

    await signupPage.waitForStep1();
    await signupPage.enterName('123124131');
    await signupPage.nextButton.click({ force: true });

    const errorToast = page.locator('[role="status"]').filter({ hasText: /Please enter a valid name/ });
    await expect(errorToast).toBeVisible();
  });

  test('should show error for empty DOB on step 2', async ({ page }) => {
    await allure.suite('Signup');
    await allure.severity('critical');
    await allure.description('Verify error toast when DOB is empty and Next is clicked on step 2');

    const loginPage = new LoginPage(page);
    const signupPage = new SignupPage(page);
    const phone = generateRandomPhone();
    const name = generateRandomName();

    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();
    await loginPage.enterMobileNumber(phone);
    await loginPage.clickClaimButton();
    await loginPage.waitForOTPScreen();
    await loginPage.enterOTP(TEST_OTP);

    // Complete step 1
    await signupPage.completeStep1(name, null, 'male');

    // On step 2, click Next without entering DOB
    await signupPage.waitForStep2();
    await signupPage.nextButton.click({ force: true });

    const errorToast = page.locator('text=Please select your date of birth');
    await expect(errorToast).toBeVisible();
  });

  test('should show error for empty place of birth on step 2', async ({ page }) => {
    await allure.suite('Signup');
    await allure.severity('critical');
    await allure.description('Verify error toast when place of birth is empty and Next is clicked on step 2');

    const loginPage = new LoginPage(page);
    const signupPage = new SignupPage(page);
    const phone = generateRandomPhone();
    const name = generateRandomName();

    await loginPage.navigateToHomepage();
    await loginPage.clickSignIn();
    await loginPage.enterMobileNumber(phone);
    await loginPage.clickClaimButton();
    await loginPage.waitForOTPScreen();
    await loginPage.enterOTP(TEST_OTP);

    // Complete step 1
    await signupPage.completeStep1(name, null, 'male');

    // On step 2, enter DOB but skip place of birth
    await signupPage.waitForStep2();
    await signupPage.enterDOB('26022008');
    await signupPage.nextButton.click({ force: true });

    const errorToast = page.locator('text=Please enter your place of birth');
    await expect(errorToast).toBeVisible();
  });

});
