const { test, chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const LoginPage = require('../pages/LoginPage');
const SignupPage = require('../pages/SignupPage');
const { generateRandomPhone, generateRandomName, generateRandomEmail } = require('../utils/helpers');
require('dotenv').config();

const TEST_OTP = process.env.TEST_OTP;
const NUMBER_OF_USERS = 20;
const OUTPUT_FILE = path.join(__dirname, '../fixtures/testUsers.json');
const BASE_URL = process.env.BASE_URL || 'https://session.shubhastro.ai';

/**
 * Setup script to create test users via signup and save their details to JSON.
 * Each user is created in a FRESH browser context to guarantee a clean session.
 * Run this ONCE to generate the test user pool:
 *   npx playwright test tests/createTestUsers.spec.js --project=chromium --workers=1
 */
test.describe('Setup: Create Test Users', () => {

  test('should create 20 test users and save to JSON', async () => {
    test.setTimeout(30 * 60 * 1000); // 30 minutes for creating 20 users

    const browser = await chromium.launch();
    const createdUsers = [];

    for (let i = 0; i < NUMBER_OF_USERS; i++) {
      const phone = generateRandomPhone();
      const name = generateRandomName();
      const email = generateRandomEmail(name);
      const gender = i % 2 === 0 ? 'male' : 'female';

      // Fresh context per user = clean session, no leftover cookies
      const context = await browser.newContext({
        baseURL: BASE_URL,
        permissions: ['geolocation'],
        geolocation: { latitude: 19.0760, longitude: 72.8777 },
      });
      const page = await context.newPage();

      try {
        const loginPage = new LoginPage(page);
        const signupPage = new SignupPage(page);

        await loginPage.navigateToHomepage();
        await loginPage.clickSignIn();
        await loginPage.enterMobileNumber(phone);
        await loginPage.clickClaimButton();
        await loginPage.waitForOTPScreen();
        await loginPage.enterOTP(TEST_OTP);

        // Complete signup
        await signupPage.completeSignup({
          name: name,
          email: email,
          gender: gender,
          dob: '21121996',
          birthTime: '1123A',
          placeOfBirth: 'mumbai',
          interests: [],
        });

        createdUsers.push({
          index: i + 1,
          phone: phone,
          name: name,
          email: email,
          gender: gender,
          otp: TEST_OTP,
        });

        console.log(`Created user ${i + 1}/${NUMBER_OF_USERS}: ${name} (${phone})`);
      } catch (error) {
        console.error(`Failed to create user ${i + 1} (${phone}): ${error.message}`);
      } finally {
        // Always close the context before moving to next user
        await context.close();
      }
    }

    await browser.close();

    // Save all created users to JSON
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(createdUsers, null, 2));
    console.log(`\nSaved ${createdUsers.length} users to ${OUTPUT_FILE}`);
  });

});
