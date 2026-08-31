const { test, expect } = require('@playwright/test');
const { allure } = require('allure-playwright');
const LoginPage = require('../pages/LoginPage');
const ProfilePage = require('../pages/ProfilePage');
const db = require('../utils/db');
require('dotenv').config();

const TEST_PHONE = process.env.TEST_USER_PHONE;
const TEST_OTP = process.env.TEST_OTP;
const ORIGINAL_NAME = process.env.TEST_USER_ORIGINAL_NAME;

test.describe('User Profile Management', () => {

  // Login before each test
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.loginWithPhone(TEST_PHONE, TEST_OTP);
  });

  test.afterAll(async () => {
    await db.close();
  });

  test('should open profile dropdown with all options', async ({ page }) => {
    await allure.suite('Profile');
    await allure.severity('critical');
    await allure.description('Verify profile dropdown shows all options: Manage Profile, Manage Devices, My Account, Manage Reports, Logout');

    const profilePage = new ProfilePage(page);
    await profilePage.openProfileDropdown();

    await expect(profilePage.manageProfileOption).toBeVisible();
    await expect(profilePage.manageDevicesOption).toBeVisible();
    await expect(profilePage.myAccountOption).toBeVisible();
    await expect(profilePage.manageReportsOption).toBeVisible();
    await expect(profilePage.logoutOption).toBeVisible();
  });

  test('should open Select Profile popup', async ({ page }) => {
    await allure.suite('Profile');
    await allure.severity('critical');
    await allure.description('Verify that clicking Manage Profile opens the Select Profile popup with user profile and Add Profile button');

    const profilePage = new ProfilePage(page);
    await profilePage.openProfileDropdown();
    await profilePage.clickManageProfile();

    await expect(profilePage.selectProfileHeading).toBeVisible();
    await expect(profilePage.addProfileButton).toBeVisible();
  });

  test('should open Edit Profile modal', async ({ page }) => {
    await allure.suite('Profile');
    await allure.severity('critical');
    await allure.description('Verify that clicking edit icon opens the Edit Profile modal with all fields');

    const profilePage = new ProfilePage(page);
    await profilePage.openEditProfile();

    await expect(profilePage.editProfileHeading).toBeVisible();
    await expect(profilePage.saveProfileButton).toBeVisible();
  });

  test('should edit profile name and verify in DB', async ({ page }) => {
    await allure.suite('Profile');
    await allure.severity('blocker');
    await allure.description('Verify that editing profile name saves successfully and is reflected in MongoDB');

    const { generateRandomName } = require('../utils/helpers');
    const randomName = generateRandomName();
    const profilePage = new ProfilePage(page);
    await profilePage.openEditProfile();

    await profilePage.editAndSaveProfile({
      name: randomName,
    });

    // UI verification
    await profilePage.verifyProfileUpdatedSuccessfully();

    // DB verification - check name was actually updated
    const user = await db.findUserByPhone(TEST_PHONE);
    expect(user).not.toBeNull();
    expect(user.fullName || `${user.firstName} ${user.lastName}`.trim()).toBe(randomName);

    // Revert name back to original
    await profilePage.openEditProfile();
    await profilePage.editAndSaveProfile({
      name: ORIGINAL_NAME,
    });
    await profilePage.verifyProfileUpdatedSuccessfully();

    // Confirm the revert actually persisted in the DB
    const revertedUser = await db.findUserByPhone(TEST_PHONE);
    expect(revertedUser.fullName || `${revertedUser.firstName} ${revertedUser.lastName}`.trim()).toBe(ORIGINAL_NAME);
  });

  test('should edit profile gender and verify in DB', async ({ page }) => {
    await allure.suite('Profile');
    await allure.severity('normal');
    await allure.description('Verify that changing gender saves successfully and is reflected in MongoDB');

    const profilePage = new ProfilePage(page);
    await profilePage.openEditProfile();

    await profilePage.editAndSaveProfile({
      gender: 'female',
    });

    // UI verification
    await profilePage.verifyProfileUpdatedSuccessfully();

    // DB verification
    const user = await db.findUserByPhone(TEST_PHONE);
    expect(user).not.toBeNull();
    expect(user.gender).toBe('female');

    // Revert gender back to male
    await profilePage.openEditProfile();
    await profilePage.editAndSaveProfile({
      gender: 'male',
    });
    await profilePage.verifyProfileUpdatedSuccessfully();
  });

  test('should verify user data in DB matches profile', async ({ page }) => {
    await allure.suite('Profile');
    await allure.severity('critical');
    await allure.description('Verify that user data in MongoDB matches expected values for the test user');

    // DB verification
    const user = await db.findUserByPhone(TEST_PHONE);
    expect(user).not.toBeNull();
    expect(user.phoneNumber).toBe(`91${TEST_PHONE}`);
    expect(user.isVerified).toBe(true);
    expect(user.isRegister).toBe(true);
    expect(user.role).toBe('CUSTOMER');
    expect(user.isAccountActive).toBe(true);
  });

  // --- Negative Test Cases ---

  test('should show error when saving profile with empty name', async ({ page }) => {
    await allure.suite('Profile');
    await allure.severity('critical');
    await allure.description('Verify inline error appears when saving profile with empty name');

    const profilePage = new ProfilePage(page);
    await profilePage.openEditProfile();

    // Clear name field
    await profilePage.editName('');
    await profilePage.clickSaveProfile();

    // Verify inline error
    const inlineError = page.locator('text=Name is required');
    await expect(inlineError).toBeVisible();
  });

  test('should not update profile in DB when name is empty', async ({ page }) => {
    await allure.suite('Profile');
    await allure.severity('critical');
    await allure.description('Verify that DB name is unchanged when save fails due to empty name');

    // Read the current name from DB BEFORE the test (self-contained, no dependency on other tests)
    const userBefore = await db.findUserByPhone(TEST_PHONE);
    const nameBefore = userBefore.fullName || `${userBefore.firstName} ${userBefore.lastName}`.trim();

    const profilePage = new ProfilePage(page);
    await profilePage.openEditProfile();

    // Clear name and try to save
    await profilePage.editName('');
    await profilePage.clickSaveProfile();

    // DB verification - name should be unchanged from before the empty save
    const userAfter = await db.findUserByPhone(TEST_PHONE);
    expect(userAfter).not.toBeNull();
    const nameAfter = userAfter.fullName || `${userAfter.firstName} ${userAfter.lastName}`.trim();
    expect(nameAfter).toBe(nameBefore);
  });

  test('should logout successfully', async ({ page }) => {
    await allure.suite('Profile');
    await allure.severity('blocker');
    await allure.description('Verify that user can logout and is redirected to login/home page');

    const profilePage = new ProfilePage(page);
    await profilePage.logout();

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // After logout, user should see "Hello, Guest!" and "Sign In"
    const guestText = page.locator('text=Hello, Guest!');
    await guestText.waitFor({ state: 'visible', timeout: 15000 });
    await expect(guestText).toBeVisible();
  });

});
