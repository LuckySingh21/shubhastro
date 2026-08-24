const { test, expect } = require('@playwright/test');
const { allure } = require('allure-playwright');
const LoginPage = require('../pages/LoginPage');
const SignupPage = require('../pages/SignupPage');
const { generateRandomPhone, generateRandomName, generateRandomEmail } = require('../utils/helpers');
require('dotenv').config();

const TEST_OTP = process.env.TEST_OTP;

test.describe('Signup Flow', () => {

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

  test('should complete full signup and land on dashboard', async ({ page }) => {
    await allure.suite('Signup');
    await allure.severity('blocker');
    await allure.description('Verify the complete signup flow: phone → OTP → step 1 → step 2 → step 3 → dashboard');

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

    // Complete full signup
    await signupPage.completeSignup({
      name: name,
      email: generateRandomEmail(name),
      gender: 'male',
      dob: '21121996',
      birthTime: '1123A',
      placeOfBirth: 'mumbai',
      interests: ['Tarot', 'Vedic Astrology'],
    });

    // Verify user is on dashboard
    const helloText = await page.locator('text=Hello,').first().textContent();
    expect(helloText).not.toContain('Guest');
  });

  test('should complete signup with female gender', async ({ page }) => {
    await allure.suite('Signup');
    await allure.severity('normal');
    await allure.description('Verify signup works with female gender selection');

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

    const helloText = await page.locator('text=Hello,').first().textContent();
    expect(helloText).not.toContain('Guest');
  });

  test('should complete signup without birth time', async ({ page }) => {
    await allure.suite('Signup');
    await allure.severity('normal');
    await allure.description('Verify signup works when user checks "Don\'t know the exact time of birth"');

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
      birthTime: null, // Will check "Don't know" checkbox
      placeOfBirth: 'pune',
      interests: [], // Skip interest selection
    });

    const helloText = await page.locator('text=Hello,').first().textContent();
    expect(helloText).not.toContain('Guest');
  });

});
