const { TIMEOUTS } = require('../utils/constants');

class ProfilePage {
  constructor(page) {
    this.page = page;

    // Profile dropdown (top-right)
    this.profileIcon = page.locator('button:has-text("baking")').or(page.locator('[class*="profile"]')).last();
    this.manageProfileOption = page.locator('text=Manage Profile');
    this.manageDevicesOption = page.locator('text=Manage Devices');
    this.myAccountOption = page.locator('text=My Account');
    this.manageReportsOption = page.locator('text=Manage Reports');
    this.logoutOption = page.locator('text=Logout');

    // Select Profile popup
    this.selectProfileHeading = page.locator('text=Select Profile');
    this.addProfileButton = page.locator('text=+ Add Profile');
    this.profileCloseButton = page.locator('button[aria-label="Close"]');

    // Edit Profile modal
    this.editProfileHeading = page.locator('text=Edit Profile');
    this.nameInput = page.locator('input').filter({ hasText: '' }).first();
    this.maleOption = page.locator('text=/^Male$/');
    this.femaleOption = page.locator('text=/^Female$/');
    this.relationDropdown = page.locator('select, [class*="select"]').filter({ hasText: 'Self' });
    this.dobInput = page.locator('input[placeholder="DD/MM/YYYY"]').or(page.locator('input').filter({ hasText: /\d{2}\/\d{2}\/\d{4}/ }));
    this.birthTimeInput = page.locator('input').filter({ hasText: /AM|PM/ });
    this.dontKnowTimeCheckbox = page.locator('text=Don\'t know the exact time of birth');
    this.placeOfBirthInput = page.locator('input').filter({ hasText: /India/ });
    this.saveProfileButton = page.locator('button:has-text("Save Profile")');

    // Success toast
    this.successToast = page.locator('text=Profile updated successfully');
  }

  async openProfileDropdown() {
    // Click on the user profile button at top-right (uses aria-label which contains "Account menu for")
    const profileBtn = this.page.locator('button[aria-label^="Account menu for"]');
    await profileBtn.click();
  }

  async clickManageProfile() {
    await this.manageProfileOption.waitFor({ state: 'visible' });
    await this.manageProfileOption.click();
  }

  async waitForSelectProfilePopup() {
    await this.selectProfileHeading.waitFor({ state: 'visible', timeout: TIMEOUTS.LONG });
  }

  async clickEditProfile() {
    // Click the edit (pencil) icon on the profile card (uses title="Edit profile")
    const editIcon = this.page.locator('button[title="Edit profile"]').first();
    await editIcon.click();
    await this.editProfileHeading.waitFor({ state: 'visible', timeout: TIMEOUTS.LONG });
  }

  async waitForEditProfileModal() {
    await this.editProfileHeading.waitFor({ state: 'visible', timeout: TIMEOUTS.LONG });
    // Wait for the form to be pre-filled (name field should have a non-empty value)
    const nameField = this.page.locator('input[name="name"]');
    await nameField.waitFor({ state: 'visible', timeout: TIMEOUTS.LONG });
    await this.page.waitForFunction(
      () => {
        const el = document.querySelector('input[name="name"]');
        return el && el.value.trim().length > 0;
      },
      { timeout: TIMEOUTS.LONG }
    ).catch(() => {});
  }

  async editName(newName) {
    const nameField = this.page.locator('input[name="name"]');
    await nameField.waitFor({ state: 'visible', timeout: TIMEOUTS.LONG });
    await nameField.fill(''); // Clear the field
    if (newName) {
      await nameField.fill(newName);
    }
  }

  async selectGender(gender) {
    if (gender.toLowerCase() === 'male') {
      await this.maleOption.click();
    } else {
      await this.femaleOption.click();
    }
  }

  async selectRelation(relation) {
    // Note: Relation is "Self" for primary profile and cannot be changed.
    // This method is only applicable when adding/editing additional profiles.
    const dropdown = this.page.locator('select').or(this.page.locator('[class*="select"]')).first();
    await dropdown.click();
    await this.page.locator(`text=${relation}`).click();
  }

  async editDOB(dob) {
    // Clear existing DOB and type new one (digits only, e.g., "21121996")
    const dobField = this.page.locator('input').nth(1);
    await dobField.click({ clickCount: 3 }); // Select all
    await this.page.keyboard.press('Backspace');
    await this.page.keyboard.type(dob, { delay: 100 });
  }

  async editBirthTime(time) {
    // Clear existing time and type new one (e.g., "1123A")
    const timeField = this.page.locator('input').nth(2);
    await timeField.click({ clickCount: 3 }); // Select all
    await this.page.keyboard.press('Backspace');
    await this.page.keyboard.type(time, { delay: 100 });
  }

  async editPlaceOfBirth(place) {
    const placeField = this.page.locator('input').nth(3);
    await placeField.click({ clickCount: 3 }); // Select all
    await this.page.keyboard.press('Backspace');
    await placeField.fill(place);
    // Wait for autocomplete and click first suggestion
    const suggestionItem = this.page.locator(`text=${place}, `).first();
    await suggestionItem.waitFor({ state: 'visible', timeout: TIMEOUTS.MEDIUM });
    await suggestionItem.click();
  }

  async clickSaveProfile() {
    await this.saveProfileButton.click();
  }

  async verifyProfileUpdatedSuccessfully() {
    await this.successToast.waitFor({ state: 'visible', timeout: TIMEOUTS.LONG });
  }

  // Full flow: open dropdown → manage profile → edit → save
  async openEditProfile() {
    await this.openProfileDropdown();
    await this.clickManageProfile();
    await this.waitForSelectProfilePopup();
    await this.clickEditProfile();
    await this.waitForEditProfileModal();
  }

  async editAndSaveProfile({ name, gender, relation, dob, birthTime, placeOfBirth }) {
    if (name) await this.editName(name);
    if (gender) await this.selectGender(gender);
    if (relation) await this.selectRelation(relation);
    if (dob) await this.editDOB(dob);
    if (birthTime) await this.editBirthTime(birthTime);
    if (placeOfBirth) await this.editPlaceOfBirth(placeOfBirth);
    await this.clickSaveProfile();
  }

  // Logout
  async logout() {
    await this.openProfileDropdown();
    await this.logoutOption.waitFor({ state: 'visible' });
    await this.logoutOption.click();
  }
}

module.exports = ProfilePage;
