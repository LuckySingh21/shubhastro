const { TIMEOUTS } = require('../utils/constants');

class AstrologerDetailPage {
  constructor(page) {
    this.page = page;

    // Profile section
    this.profileHeading = page.locator('text=/^Profile$/');
    this.followButton = page.locator('button:has-text("Follow")').first();

    // Status - look for visible status text
    this.availableNowStatus = page.locator('text=Available Now').first();
    this.offlineStatusBadge = page.locator('span:has-text("Offline")').first();

    // Stats section
    this.experience = page.locator('text=/^Experience$/');
    this.consultations = page.locator('text=/^Consultations$/');
    this.ratingLabel = page.locator('text=/^Rating$/');
    this.chatMinutes = page.locator('text=/^Chat Minutes$/');
    this.callMinutes = page.locator('text=/^Call Minutes$/');
    this.videoMinutes = page.locator('text=/^Video Minutes$/');

    // Connect Now section
    this.connectNowHeading = page.locator('text=/^CONNECT NOW$/');
    this.audioCallOption = page.locator('text=/^Audio Call$/');
    this.videoCallOption = page.locator('text=/^Video Call$/');
    this.emergencyButton = page.locator('button[class*="emergency"]').first();

    // About section
    this.aboutHeading = page.locator('text=/^About$/');

    // User Reviews section
    this.userReviewsHeading = page.locator('text=/^USER REVIEWS$/');
    this.totalRatings = page.locator('text=/total ratings/');

    // Consultation Hours
    this.consultationHoursHeading = page.locator('span:has-text("Consultation Hours")').first();

    // Set Reminder button
    this.setReminderButton = page.locator('button:has-text("Set Reminder")');

    // Emergency message
    this.emergencyOnlyMessage = page.locator('text=/only emergency sessions available/');
  }

  async navigate(astrologerSlug) {
    await this.page.goto(`/astrologer/${astrologerSlug}`);
    await this.page.waitForLoadState('networkidle');
  }

  async clickFirstAstrologerFromListing() {
    const firstAstrologerLink = this.page.locator('a[href*="/astrologer/"]').first();
    await firstAstrologerLink.click();
    await this.page.waitForLoadState('networkidle');
  }

  async isOnline() {
    return await this.availableNowStatus.isVisible().catch(() => false);
  }

  async isOffline() {
    return await this.offlineStatusBadge.isVisible().catch(() => false);
  }

  async hasEmergencySession() {
    return await this.emergencyButton.isVisible().catch(() => false);
  }

  async getAstrologerName() {
    const nameEl = this.page.locator('h1, h2').first();
    return await nameEl.textContent();
  }

  async isProfileLoaded() {
    await this.connectNowHeading.waitFor({ state: 'visible', timeout: TIMEOUTS.LONG });
    return true;
  }

  // --- Call / Chat actions ---

  async clickAudioCall() {
    await this.audioCallOption.click();
  }

  async clickVideoCall() {
    await this.videoCallOption.click();
  }

  async clickChat() {
    const chatOption = this.page.locator('text=/^Chat$/').first();
    await chatOption.click();
  }

  async isRinging() {
    // After initiating call, "Ringing..." or "Waiting for astrologer" appears
    const ringingText = this.page.locator('text=/Ringing|Waiting for/');
    return await ringingText.isVisible({ timeout: TIMEOUTS.LONG }).catch(() => false);
  }

  async cancelCall() {
    const cancelButton = this.page.locator('button:has-text("Cancel")').first();
    await cancelButton.click().catch(() => {});
  }
}

module.exports = AstrologerDetailPage;
