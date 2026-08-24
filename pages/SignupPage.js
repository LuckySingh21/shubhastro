class SignupPage {
  constructor(page) {
    this.page = page;

    // Step 1 elements - Personalize your journey
    this.step1Heading = page.locator('text=Let\'s personalize your journey together.');
    this.nameInput = page.locator('input[placeholder="Enter your name (min 3 characters)"]');
    this.emailInput = page.locator('input[placeholder="Enter your email address"]');
    this.maleOption = page.locator('text=/^Male$/');
    this.femaleOption = page.locator('text=/^Female$/');
    this.othersOption = page.locator('text=/^Others$/');
    this.nextButton = page.locator('button:has-text("Next")');

    // Step 2 elements - Birth details
    this.step2Heading = page.locator('text=Share the moment the stars welcomed you');
    this.dobInput = page.locator('input[placeholder="DD/MM/YYYY"]');
    this.birthTimeInput = page.locator('input[placeholder="Select time"]');
    this.dontKnowTimeCheckbox = page.locator('text=Don\'t know the exact time of birth');
    this.placeOfBirthInput = page.locator('input[placeholder="Select here"]');

    // Step 3 elements - Interest selection
    this.step3Heading = page.locator('text=What brings you here today?');

    // Loading screen
    this.loadingText = page.locator('text=The cosmos is aligning for you');

    // Success indicators
    this.registrationSuccess = page.locator('text=User register successfully');
    this.birthChartSuccess = page.locator('text=Birth chart created successfully');
  }

  async waitForStep1() {
    await this.step1Heading.waitFor({ state: 'visible', timeout: 10000 });
  }

  async enterName(name) {
    await this.nameInput.waitFor({ state: 'visible' });
    await this.nameInput.fill(name);
  }

  async enterEmail(email) {
    await this.emailInput.fill(email);
  }

  async selectGender(gender) {
    switch (gender.toLowerCase()) {
      case 'male':
        await this.maleOption.click();
        break;
      case 'female':
        await this.femaleOption.click();
        break;
      case 'others':
        await this.othersOption.click();
        break;
    }
  }

  async clickNext() {
    await this.nextButton.click();
  }

  async completeStep1(name, email, gender) {
    await this.waitForStep1();
    await this.enterName(name);
    if (email) {
      await this.enterEmail(email);
    }
    await this.selectGender(gender);
    await this.clickNext();
  }

  async waitForStep2() {
    await this.step2Heading.waitFor({ state: 'visible', timeout: 10000 });
  }

  async enterDOB(dob) {
    // dob format: "21121996" for 21/12/1996
    await this.dobInput.click();
    await this.page.keyboard.type(dob, { delay: 100 });
  }

  async enterBirthTime(time) {
    // time format: "1123A" for 11:23 AM, "1123P" for 11:23 PM
    await this.birthTimeInput.click();
    await this.page.keyboard.type(time, { delay: 100 });
  }

  async checkDontKnowTime() {
    await this.dontKnowTimeCheckbox.click();
  }

  async enterPlaceOfBirth(place) {
    await this.placeOfBirthInput.click();
    await this.placeOfBirthInput.fill(place);
    // Wait for autocomplete suggestions and click the first one
    const firstSuggestion = this.page.locator(`text=${place}`).first();
    await firstSuggestion.waitFor({ state: 'visible', timeout: 5000 });
    // Click the first suggestion from the dropdown (not the input itself)
    const suggestionItem = this.page.locator(`text=${place}, `).first();
    await suggestionItem.waitFor({ state: 'visible', timeout: 5000 });
    await suggestionItem.click();
  }

  async completeStep2(dob, birthTime, placeOfBirth) {
    await this.waitForStep2();
    await this.enterDOB(dob);
    if (birthTime) {
      await this.enterBirthTime(birthTime);
    } else {
      await this.checkDontKnowTime();
    }
    await this.enterPlaceOfBirth(placeOfBirth);
    await this.clickNext();
  }

  // Step 3 - Interest selection
  async waitForStep3() {
    await this.step3Heading.waitFor({ state: 'visible', timeout: 10000 });
  }

  async selectInterests(interests) {
    // interests is an array of category names, e.g. ['Tarot', 'Vedic Astrology']
    for (const interest of interests) {
      await this.page.locator(`text=${interest}`).click();
    }
  }

  async completeStep3(interests = []) {
    await this.waitForStep3();
    if (interests.length > 0) {
      await this.selectInterests(interests);
    }
    await this.clickNext();
  }

  async waitForRegistrationComplete() {
    // Wait for loading screen to appear and then redirect to homepage
    try {
      await this.loadingText.waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      // Loading might be too fast to catch
    }
    // Wait for redirect to homepage
    await this.page.waitForURL('**/session.shubhastro.ai', { timeout: 30000 }).catch(() => {});
    await this.page.locator('text=Hello,').first().waitFor({ state: 'visible', timeout: 30000 });
  }

  // Full signup flow
  async completeSignup({ name, email, gender, dob, birthTime, placeOfBirth, interests = [] }) {
    await this.completeStep1(name, email, gender);
    await this.completeStep2(dob, birthTime, placeOfBirth);
    await this.completeStep3(interests);
    await this.waitForRegistrationComplete();
  }
}

module.exports = SignupPage;
