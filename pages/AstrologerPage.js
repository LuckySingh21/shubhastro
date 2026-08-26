const { TIMEOUTS } = require('../utils/constants');

class AstrologerPage {
  constructor(page) {
    this.page = page;

    // Page heading
    this.pageHeading = page.locator('text=Chat With Best Astrologers Online');

    // Search & Filter
    this.searchInput = page.locator('input[placeholder="Search Name"]');
    this.filterButton = page.locator('text=Filter');

    // Category tabs - use button/span to avoid matching description text
    this.allTab = page.locator('button:has-text("All"), span:has-text("All")').filter({ hasText: /^All$/ }).first();
    this.loveTab = page.locator('button:has-text("Love & Relationships"), span:has-text("Love & Relationships")').first();
    this.gemstoneTab = page.locator('button:has-text("Gemstone Advice"), span:has-text("Gemstone Advice")').first();
    this.moneyTab = page.locator('button:has-text("Money & Finance"), span:has-text("Money & Finance")').first();
    this.childTab = page.locator('button:has-text("Child & Education"), span:has-text("Child & Education")').first();
    this.marriageTab = page.locator('button:has-text("Marriage & Family"), span:has-text("Marriage & Family")').first();

    // Astrologer cards
    this.astrologerCards = page.locator('[class*="cardWrapper"]');
    this.chatButtons = page.locator('button[class*="ChatBtn"]');
    this.callButtons = page.locator('button[class*="CallBtn"]');

    // Top astrologers section (changes based on online status)
    this.topAstrologersHeading = page.locator('text=TOP ASTROLOGERS FOR YOU');
    this.exploreAstrologersHeading = page.locator('text=EXPLORE ASTROLOGERS');

    // No results message
    this.noResultsMessage = page.locator('text=No astrologers found.');

    // Search clear button
    this.searchClearButton = page.locator('input[placeholder="Search Name"]').locator('..').locator('svg, button').first();

    // Action buttons (changes based on online/offline)
    this.emergencyButtons = page.locator('button[class*="emergency"]');

    // Nav link
    this.astrologersNavLink = page.locator('nav >> text=Astrologers').or(page.locator('header >> text=Astrologers'));
  }

  async navigate() {
    await this.page.goto('/astrologers');
    await this.page.waitForLoadState('networkidle');
  }

  async navigateFromHomepage() {
    await this.astrologersNavLink.click();
    await this.page.waitForURL('**/astrologers');
    await this.page.waitForLoadState('networkidle');
  }

  async searchAstrologer(name) {
    await this.searchInput.fill(name);
    await this.page.waitForTimeout(1000); // Wait for search results
  }

  async clearSearch() {
    await this.searchInput.clear();
    await this.page.waitForTimeout(1000);
  }

  async clickCategory(category) {
    const categoryButton = this.page.locator(`button[class*="chip"] span:has-text("${category}")`).first();
    await categoryButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async getAstrologerCardCount() {
    // Wait for at least one card to appear
    try {
      await this.astrologerCards.first().waitFor({ state: 'visible', timeout: TIMEOUTS.LONG });
    } catch {
      // Cards might not be visible yet, try waiting more
      await this.page.waitForTimeout(5000);
    }
    return await this.astrologerCards.count();
  }

  async getFirstAstrologerName() {
    const firstCard = this.astrologerCards.first();
    return await firstCard.locator('h3, h4, [class*="name"]').first().textContent();
  }

  async isPageLoaded() {
    await this.pageHeading.waitFor({ state: 'visible', timeout: TIMEOUTS.LONG });
    return true;
  }
}

module.exports = AstrologerPage;
