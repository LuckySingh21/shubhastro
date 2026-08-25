const { TIMEOUTS } = require('../utils/constants');

class LoginPage {
  constructor(page) {
    this.page = page;

    // Homepage elements
    this.signInLink = page.locator('text=Sign In');

    // Login page elements
    this.mobileInput = page.locator('input[placeholder="Enter mobile number"]');
    this.claimButton = page.locator('button:has-text("Claim")');
    this.skipButton = page.locator('text=skip');

    // OTP page elements
    this.otpInputs = page.locator('input[type="tel"]');
    this.otpHeading = page.locator('text=Aligning your stars...');
    this.resendLink = page.locator('text=Resend');
    this.didntGetIt = page.locator('text=Didn\'t get it?');
    this.continueButton = page.locator('button:has-text("Continue")');
    this.backArrow = page.locator('button >> svg').first();
  }

  async dismissPopupIfVisible() {
    try {
      const popup = this.page.locator('text=Unlock Your Free Kundli');
      await popup.waitFor({ state: 'visible', timeout: TIMEOUTS.MEDIUM });
      // Click the X close button on the popup
      const closeBtn = this.page.locator('button[aria-label="Close"]');
      await closeBtn.click();
      await popup.waitFor({ state: 'hidden', timeout: TIMEOUTS.SHORT });
    } catch {
      // Popup didn't appear, continue
    }
  }

  async navigateToHomepage() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
    await this.dismissPopupIfVisible();
  }

  async clickSignIn() {
    await this.signInLink.click();
    await this.page.waitForURL('**/login');
  }

  async enterMobileNumber(phoneNumber) {
    await this.mobileInput.waitFor({ state: 'visible' });
    await this.mobileInput.fill(phoneNumber);
  }

  async clickClaimButton() {
    await this.claimButton.click();
  }

  async waitForOTPScreen() {
    await this.otpHeading.waitFor({ state: 'visible', timeout: TIMEOUTS.LONG });
  }

  async enterOTP(otp) {
    const digits = otp.split('');
    // Click the first OTP input to focus it
    await this.otpInputs.first().click();
    // Type each digit using keyboard press (auto-moves to next input)
    for (const digit of digits) {
      await this.page.keyboard.press(digit);
      await this.page.waitForTimeout(200);
    }
  }

  async handleDeviceLimitPopup() {
    // If user is logged in on more than 2 devices, a "Device Limit Reached" popup appears.
    // We need to logout non-current devices until the popup goes away.
    try {
      const deviceLimitHeading = this.page.locator('text=Device Limit Reached');
      await deviceLimitHeading.waitFor({ state: 'visible', timeout: TIMEOUTS.MEDIUM });

      // Keep logging out non-current devices until popup disappears
      while (await deviceLimitHeading.isVisible()) {
        // Find a Logout button that is NOT for the (Current) device
        const logoutButtons = this.page.locator('button:has-text("Logout")');
        const count = await logoutButtons.count();

        let loggedOut = false;
        for (let i = 0; i < count; i++) {
          // Get the parent device card text to check if it's not "Current"
          const deviceCard = logoutButtons.nth(i).locator('..');
          const cardText = await deviceCard.textContent();
          if (!cardText.includes('(Current)')) {
            await logoutButtons.nth(i).click();
            loggedOut = true;
            // Wait for popup to either refresh or disappear
            await this.page.waitForTimeout(2000);
            break;
          }
        }

        if (!loggedOut) break; // No non-current device found, exit loop

        // Check if popup is still visible
        const stillVisible = await deviceLimitHeading.isVisible().catch(() => false);
        if (!stillVisible) break;
      }
    } catch {
      // Device limit popup didn't appear, continue
    }
  }

  async waitForSuccessfulLogin() {
    // After correct OTP, user is auto-redirected to homepage
    await this.page.waitForURL('**/');
    await this.page.locator('text=Hello,').first().waitFor({ state: 'visible', timeout: TIMEOUTS.EXTRA_LONG });
  }

  async isLoggedIn() {
    // Check that "Hello, Guest!" is no longer visible and user name appears
    const helloText = await this.page.locator('text=Hello,').first().textContent();
    return !helloText.includes('Guest');
  }

  async getLoggedInUserName() {
    const helloText = await this.page.locator('text=Hello,').first().textContent();
    // Extract name from "Hello, Lucky! 👋" format
    const match = helloText.match(/Hello,\s*(.+?)!/);
    return match ? match[1].trim() : null;
  }

  // Full login flow helper
  async loginWithPhone(phoneNumber, otp) {
    await this.navigateToHomepage();
    await this.clickSignIn();
    await this.enterMobileNumber(phoneNumber);
    await this.clickClaimButton();
    await this.waitForOTPScreen();
    await this.enterOTP(otp);
    await this.handleDeviceLimitPopup();
    await this.waitForSuccessfulLogin();
  }
}

module.exports = LoginPage;
