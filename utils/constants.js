// Timeout constants (in milliseconds)
// Change these values from one place to affect all tests

const TIMEOUTS = {
  SHORT: 3000,       // For quick waits (popup close, element hide)
  MEDIUM: 10000,      // For popups, autocomplete suggestions
  LONG: 10000,       // For page navigations, form submissions
  EXTRA_LONG: 15000, // For login redirects, heavy page loads
  MAX: 30000,        // For registration complete, slow network
};

module.exports = { TIMEOUTS };
